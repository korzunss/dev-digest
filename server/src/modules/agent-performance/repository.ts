import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type {
  AggregateRow,
  BucketRow,
  DecisionRow,
  HistoryCursor,
  ModelCostRow,
  RecentRunRow,
  RunHistoryRow,
} from './types.js';
import { RECENT_RUNS } from './constants.js';

/**
 * Agent Performance data-access (spec 015): read-only SQL aggregates over
 * `agent_runs`, plus the reads of `reviews`, `findings`, `pull_requests`,
 * `ci_runs` and `run_traces` the Run history needs. Every query is scoped to
 * the workspace and to `ran_at >= from AND ran_at < to`; none filters by repo
 * (AC-7) and both run sources count (unlike `windowedRuns`).
 *
 * A negative cost or duration means "unknown", the same as null. Instants are
 * bound as ISO strings with `::timestamptz`, the time zone and the ids as
 * bound parameters (server gotchas → DB). Timestamps leave SQL as ISO text:
 * the drizzle postgres-js client hands raw `execute` timestamps back as
 * strings whose shape is not a safe `Date` input.
 */

export interface PerfWindowArgs {
  from: Date;
  to: Date;
}

/** ms-precision ISO text of a timestamptz expression (the cursor carries ms, so ordering truncates to ms too). */
const isoMs = (col: SQL): SQL =>
  sql`to_char(date_trunc('milliseconds', ${col}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const N = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const NN = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const known = (v: unknown): number | null => {
  const n = NN(v);
  return n !== null && n >= 0 ? n : null;
};

export class AgentPerformanceRepository {
  constructor(private readonly db: Db) {}

  /** `ran_at` inside the window for the aliased `agent_runs` table, optionally one agent. */
  private scope(alias: SQL, workspaceId: string, win: PerfWindowArgs, agentId?: string): SQL {
    const agent = agentId ? sql` AND ${alias}.agent_id = ${agentId}::uuid` : sql``;
    return sql`${alias}.workspace_id = ${workspaceId}::uuid
      AND ${alias}.ran_at >= ${win.from.toISOString()}::timestamptz
      AND ${alias}.ran_at < ${win.to.toISOString()}::timestamptz${agent}`;
  }

  /** AC-29: is this an IANA zone Postgres can use? */
  async timeZoneExists(tz: string): Promise<boolean> {
    const rows = await this.db.execute(sql`SELECT 1 AS ok FROM pg_timezone_names WHERE name = ${tz} LIMIT 1`);
    return rows.length > 0;
  }

  /** One row per `agent_id` (null = a deleted agent's runs). Findings are NOT joined here, so cost is never multiplied. */
  async aggregateByAgent(workspaceId: string, win: PerfWindowArgs, agentId?: string): Promise<AggregateRow[]> {
    const r = sql`r`;
    const rows = await this.db.execute(sql`
      SELECT r.agent_id::text AS agent_id,
        count(*) FILTER (WHERE r.status = 'done')::int AS done_runs,
        count(*) FILTER (WHERE r.status IN ('failed', 'cancelled'))::int AS not_counted,
        count(*) FILTER (WHERE r.status = 'done' AND r.cost_usd >= 0)::int AS cost_known,
        coalesce(sum(r.cost_usd) FILTER (WHERE r.status = 'done' AND r.cost_usd >= 0 AND r.cost_source = 'api'), 0)::float8 AS cost_api,
        coalesce(sum(r.cost_usd) FILTER (WHERE r.status = 'done' AND r.cost_usd >= 0 AND r.cost_source = 'estimate'), 0)::float8 AS cost_estimate,
        coalesce(sum(r.cost_usd) FILTER (WHERE r.status = 'done' AND r.cost_usd >= 0 AND r.cost_source IS NULL), 0)::float8 AS cost_unrecorded,
        count(*) FILTER (WHERE r.status = 'done' AND r.duration_ms >= 0)::int AS duration_known,
        coalesce(sum(r.duration_ms) FILTER (WHERE r.status = 'done' AND r.duration_ms >= 0), 0)::float8 AS duration_sum,
        ${isoMs(sql`max(r.ran_at) FILTER (WHERE r.status = 'done')`)} AS last_run_at
      FROM agent_runs r
      WHERE ${this.scope(r, workspaceId, win, agentId)}
      GROUP BY r.agent_id`);
    return Array.from(rows, (x) => ({
      agentId: (x.agent_id as string | null) ?? null,
      doneRuns: N(x.done_runs),
      notCountedRuns: N(x.not_counted),
      costKnownRuns: N(x.cost_known),
      costApiUsd: N(x.cost_api),
      costEstimateUsd: N(x.cost_estimate),
      costUnrecordedUsd: N(x.cost_unrecorded),
      durationKnownRuns: N(x.duration_known),
      durationSumMs: N(x.duration_sum),
      lastRunAt: x.last_run_at ? new Date(x.last_run_at as string) : null,
    }));
  }

  /** M-7: decisions of the findings of counted runs (the run's period, whenever the decision was made). */
  async decisionsByAgent(workspaceId: string, win: PerfWindowArgs, agentId?: string): Promise<DecisionRow[]> {
    const r = sql`r`;
    const rows = await this.db.execute(sql`
      SELECT r.agent_id::text AS agent_id,
        count(*) FILTER (WHERE f.accepted_at IS NOT NULL)::int AS accepted,
        count(*) FILTER (WHERE f.accepted_at IS NULL AND f.dismissed_at IS NOT NULL)::int AS dismissed
      FROM agent_runs r
      JOIN reviews rv ON rv.run_id = r.id
      JOIN findings f ON f.review_id = rv.id
      WHERE r.status = 'done' AND ${this.scope(r, workspaceId, win, agentId)}
      GROUP BY r.agent_id`);
    return Array.from(rows, (x) => ({
      agentId: (x.agent_id as string | null) ?? null,
      accepted: N(x.accepted),
      dismissed: N(x.dismissed),
    }));
  }

  /** AC-17: known cost of counted runs per stored `model` (null = Unknown model), split by provenance. */
  async costByModel(workspaceId: string, win: PerfWindowArgs): Promise<ModelCostRow[]> {
    const r = sql`r`;
    const rows = await this.db.execute(sql`
      SELECT r.model AS model,
        coalesce(sum(r.cost_usd) FILTER (WHERE r.cost_source = 'api'), 0)::float8 AS cost_api,
        coalesce(sum(r.cost_usd) FILTER (WHERE r.cost_source = 'estimate'), 0)::float8 AS cost_estimate,
        coalesce(sum(r.cost_usd) FILTER (WHERE r.cost_source IS NULL), 0)::float8 AS cost_unrecorded
      FROM agent_runs r
      WHERE r.status = 'done' AND r.cost_usd >= 0 AND ${this.scope(r, workspaceId, win)}
      GROUP BY r.model`);
    return Array.from(rows, (x) => ({
      model: (x.model as string | null) ?? null,
      costApiUsd: N(x.cost_api),
      costEstimateUsd: N(x.cost_estimate),
      costUnrecordedUsd: N(x.cost_unrecorded),
    }));
  }

  /**
   * AC-8 sparkline: counted runs per bucket in the browser's zone, with empty
   * buckets present. `unit` and the step are chosen from a fixed pair, then bound.
   */
  async buckets(
    workspaceId: string,
    win: PerfWindowArgs,
    tz: string,
    unit: 'hour' | 'day',
    agentId?: string,
  ): Promise<BucketRow[]> {
    const r = sql`r`;
    const step = unit === 'hour' ? '1 hour' : '1 day';
    const from = win.from.toISOString();
    const to = win.to.toISOString();
    const rows = await this.db.execute(sql`
      WITH series AS (
        SELECT gs AS start FROM generate_series(
          date_trunc(${unit}, ${from}::timestamptz AT TIME ZONE ${tz}),
          (${to}::timestamptz AT TIME ZONE ${tz}) - interval '1 millisecond',
          ${step}::interval
        ) gs
      ),
      counts AS (
        SELECT date_trunc(${unit}, r.ran_at AT TIME ZONE ${tz}) AS b, count(*)::int AS n
        FROM agent_runs r
        WHERE r.status = 'done' AND ${this.scope(r, workspaceId, win, agentId)}
        GROUP BY 1
      )
      SELECT to_char(s.start, 'YYYY-MM-DD"T"HH24:MI') AS start, coalesce(c.n, 0)::int AS runs
      FROM series s LEFT JOIN counts c ON c.b = s.start
      ORDER BY s.start`);
    return Array.from(rows, (x) => ({ start: x.start as string, runs: N(x.runs) }));
  }

  /** AC-15: each agent's newest counted runs (at most `RECENT_RUNS`; the helper orders them). */
  async recentRuns(workspaceId: string, win: PerfWindowArgs, agentId?: string): Promise<RecentRunRow[]> {
    const r = sql`r`;
    const rows = await this.db.execute(sql`
      SELECT * FROM (
        SELECT r.agent_id::text AS agent_id, ${isoMs(sql`r.ran_at`)} AS ran_at,
          r.duration_ms, r.cost_usd, r.cost_source,
          row_number() OVER (PARTITION BY r.agent_id ORDER BY r.ran_at DESC, r.id DESC) AS rn
        FROM agent_runs r
        WHERE r.status = 'done' AND ${this.scope(r, workspaceId, win, agentId)}
      ) x
      WHERE rn <= ${RECENT_RUNS}`);
    return Array.from(rows, (x) => ({
      agentId: (x.agent_id as string | null) ?? null,
      ranAt: new Date(x.ran_at as string),
      durationMs: known(x.duration_ms),
      costUsd: known(x.cost_usd),
      costSource: known(x.cost_usd) !== null ? ((x.cost_source as 'api' | 'estimate' | null) ?? null) : null,
    }));
  }

  /**
   * AC-23: one agent's counted runs, newest first, keyset-paged on
   * `(ran_at, id)` at millisecond precision (the cursor carries ms). Returns up
   * to `limit` rows; the caller asks for one extra to learn whether a next page exists.
   */
  async runHistory(
    workspaceId: string,
    agentId: string,
    win: PerfWindowArgs,
    cursor: HistoryCursor | undefined,
    limit: number,
  ): Promise<RunHistoryRow[]> {
    const r = sql`r`;
    const ranMs = sql`date_trunc('milliseconds', r.ran_at)`;
    const after = cursor
      ? sql` AND (${ranMs}, r.id) < (${cursor.ranAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`
      : sql``;
    const rows = await this.db.execute(sql`
      SELECT r.id::text AS id, ${isoMs(sql`r.ran_at`)} AS ran_at,
        coalesce(pr.number, cr.pr_number) AS pr_number,
        CASE WHEN r.tokens_in IS NULL AND r.tokens_out IS NULL THEN NULL
             ELSE coalesce(r.tokens_in, 0) + coalesce(r.tokens_out, 0) END AS tokens,
        r.cost_usd, r.cost_source, r.findings_count, r.source,
        EXISTS (SELECT 1 FROM run_traces rt WHERE rt.run_id = r.id) AS has_trace
      FROM agent_runs r
      LEFT JOIN pull_requests pr ON pr.id = r.pr_id
      LEFT JOIN LATERAL (
        SELECT c.pr_number FROM ci_runs c WHERE c.agent_run_id = r.id LIMIT 1
      ) cr ON true
      WHERE r.status = 'done' AND ${this.scope(r, workspaceId, win, agentId)}${after}
      ORDER BY ${ranMs} DESC, r.id DESC
      LIMIT ${limit}`);
    return Array.from(rows, (x) => ({
      id: x.id as string,
      ranAt: new Date(x.ran_at as string),
      prNumber: NN(x.pr_number),
      tokens: NN(x.tokens),
      costUsd: known(x.cost_usd),
      costSource: known(x.cost_usd) !== null ? ((x.cost_source as 'api' | 'estimate' | null) ?? null) : null,
      findingsCount: NN(x.findings_count),
      source: x.source === 'ci' ? 'ci' : 'local',
      hasTrace: x.has_trace === true,
    }));
  }

  /** Counted runs in a window, for the AC-18a "Try 30 days" count. */
  async countDone(workspaceId: string, win: PerfWindowArgs, agentId?: string): Promise<number> {
    const r = sql`r`;
    const rows = await this.db.execute(sql`
      SELECT count(*)::int AS n FROM agent_runs r
      WHERE r.status = 'done' AND ${this.scope(r, workspaceId, win, agentId)}`);
    return N(rows[0]?.n);
  }
}
