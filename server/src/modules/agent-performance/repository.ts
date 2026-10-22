import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type {
  AggregateRow,
  BreakdownBucketKind,
  BucketRow,
  CategoryCountRow,
  CountedRunsRow,
  DecisionRow,
  HistoryCursor,
  MemoryUsageRow,
  ModelCostRow,
  RecentRunRow,
  RunHistoryRow,
  SeverityBucketRow,
  SkillUsageRow,
  UsageRead,
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

  /** AC-41 / M-2: the agent's counted runs in the window, and the local ones among them. */
  async countedRuns(workspaceId: string, win: PerfWindowArgs, agentId: string): Promise<CountedRunsRow> {
    const r = sql`r`;
    const rows = await this.db.execute(sql`
      SELECT count(*) FILTER (WHERE r.status = 'done')::int AS counted,
        count(*) FILTER (WHERE r.status = 'done' AND r.source = 'local')::int AS local
      FROM agent_runs r
      WHERE ${this.scope(r, workspaceId, win, agentId)}`);
    return { counted: N(rows[0]?.counted), local: N(rows[0]?.local) };
  }

  /** AC-4: the earliest `ran_at` of a done local run of the workspace that has a recorded skill. */
  async skillsTrackedSince(workspaceId: string): Promise<Date | null> {
    const rows = await this.db.execute(sql`
      SELECT ${isoMs(sql`min(r.ran_at)`)} AS since FROM agent_runs r
      WHERE r.workspace_id = ${workspaceId}::uuid AND r.status = 'done' AND r.source = 'local'
        AND EXISTS (SELECT 1 FROM run_skills rs WHERE rs.run_id = r.id)`);
    const v = rows[0]?.since;
    return v ? new Date(v as string) : null;
  }

  /** AC-13: the earliest `ran_at` of a done local run of the workspace that has a stored run trace. */
  async memoryTrackedSince(workspaceId: string): Promise<Date | null> {
    const rows = await this.db.execute(sql`
      SELECT ${isoMs(sql`min(r.ran_at)`)} AS since FROM agent_runs r
      WHERE r.workspace_id = ${workspaceId}::uuid AND r.status = 'done' AND r.source = 'local'
        AND EXISTS (SELECT 1 FROM run_traces rt WHERE rt.run_id = r.id)`);
    const v = rows[0]?.since;
    return v ? new Date(v as string) : null;
  }

  /**
   * AC-5 / AC-6 / AC-12: the agent's counted local runs of the window on or after
   * `since` (the denominator) and, per skill that still exists, how many of
   * them recorded it. `since` null (nothing tracked yet) reads nothing.
   */
  async skillUsage(
    workspaceId: string,
    win: PerfWindowArgs,
    agentId: string,
    since: Date | null,
  ): Promise<UsageRead<SkillUsageRow>> {
    if (!since) return { denominator: 0, rows: [] };
    const r = sql`r`;
    const from = since.toISOString();
    const [den, rows] = await Promise.all([
      this.db.execute(sql`
        SELECT count(*)::int AS n FROM agent_runs r
        WHERE r.status = 'done' AND r.source = 'local' AND r.ran_at >= ${from}::timestamptz
          AND ${this.scope(r, workspaceId, win, agentId)}`),
      this.db.execute(sql`
        SELECT s.id::text AS skill_id, s.name AS name, count(*)::int AS n
        FROM run_skills rs
        JOIN agent_runs r ON r.id = rs.run_id
        JOIN skills s ON s.id = rs.skill_id AND s.workspace_id = ${workspaceId}::uuid
        WHERE r.status = 'done' AND r.source = 'local' AND r.ran_at >= ${from}::timestamptz
          AND ${this.scope(r, workspaceId, win, agentId)}
        GROUP BY s.id, s.name
        ORDER BY n DESC, s.name, s.id`),
    ]);
    return {
      denominator: N(den[0]?.n),
      rows: Array.from(rows, (x) => ({ skillId: x.skill_id as string, name: x.name as string, runs: N(x.n) })),
    };
  }

  /**
   * AC-14 / AC-15: the agent's counted local runs with a stored trace on or
   * after `since` (the denominator) and, per memory entry (text + pr), the
   * distinct runs that pulled it. Reads `trace->'memory_pulled'` defensively:
   * a trace without an array, or an entry without a string text, adds no row.
   */
  async memoryUsage(
    workspaceId: string,
    win: PerfWindowArgs,
    agentId: string,
    since: Date | null,
  ): Promise<UsageRead<MemoryUsageRow>> {
    if (!since) return { denominator: 0, rows: [] };
    const r = sql`r`;
    const from = since.toISOString();
    const [den, rows] = await Promise.all([
      this.db.execute(sql`
        SELECT count(*)::int AS n FROM agent_runs r
        JOIN run_traces rt ON rt.run_id = r.id
        WHERE r.status = 'done' AND r.source = 'local' AND r.ran_at >= ${from}::timestamptz
          AND ${this.scope(r, workspaceId, win, agentId)}`),
      this.db.execute(sql`
        SELECT m.text AS text, m.pr AS pr, count(DISTINCT m.run_id)::int AS n
        FROM (
          SELECT rt.run_id AS run_id, e->>'text' AS text,
            CASE WHEN jsonb_typeof(e->'pr') = 'number' AND (e->>'pr') ~ '^-?[0-9]{1,9}$'
                 THEN (e->>'pr')::int END AS pr
          FROM agent_runs r
          JOIN run_traces rt ON rt.run_id = r.id
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(rt.trace->'memory_pulled') = 'array'
                 THEN rt.trace->'memory_pulled' ELSE '[]'::jsonb END) e
          WHERE r.status = 'done' AND r.source = 'local' AND r.ran_at >= ${from}::timestamptz
            AND ${this.scope(r, workspaceId, win, agentId)}
            AND jsonb_typeof(e->'text') = 'string'
        ) m
        GROUP BY m.text, m.pr
        ORDER BY n DESC, m.text, m.pr NULLS FIRST`),
    ]);
    return {
      denominator: N(den[0]?.n),
      rows: Array.from(rows, (x) => ({ text: x.text as string, pr: NN(x.pr), runs: N(x.n) })),
    };
  }

  /** AC-20 / AC-25: every finding of the agent's counted runs (the M-7 join), by stored category. */
  async findingsByCategory(workspaceId: string, win: PerfWindowArgs, agentId: string): Promise<CategoryCountRow[]> {
    const r = sql`r`;
    const rows = await this.db.execute(sql`
      SELECT f.category AS category, count(*)::int AS n
      FROM agent_runs r
      JOIN reviews rv ON rv.run_id = r.id
      JOIN findings f ON f.review_id = rv.id
      WHERE r.status = 'done' AND ${this.scope(r, workspaceId, win, agentId)}
      GROUP BY f.category
      ORDER BY n DESC, f.category`);
    return Array.from(rows, (x) => ({ category: x.category as string, count: N(x.n) }));
  }

  /**
   * AC-27…AC-33: the same findings per severity in every bucket of `kind`
   * (empty buckets included), assigned by the run's `ran_at`. Buckets are
   * instant ranges `[start, end)` built in SQL: `4h` = six real 4-hour steps
   * from the window start, `7d` = 7 calendar days in `tz` counted from the
   * start, `month` = calendar months in `tz`; the first starts at `from`, the
   * last ends at `to`. `kind` picks one of three fixed fragments; the instants
   * and the zone are bound. Severity matches the stored literals exactly.
   */
  async severityBuckets(
    workspaceId: string,
    win: PerfWindowArgs,
    tz: string,
    kind: BreakdownBucketKind,
    agentId: string,
  ): Promise<SeverityBucketRow[]> {
    const r = sql`r`;
    const from = sql`${win.from.toISOString()}::timestamptz`;
    const to = sql`${win.to.toISOString()}::timestamptz`;
    const localFrom = sql`(${from} AT TIME ZONE ${tz})`;
    const localLast = sql`((${to} - interval '1 millisecond') AT TIME ZONE ${tz})`;
    let buckets: SQL;
    if (kind === '4h') {
      buckets = sql`
        SELECT i, ${from} + i * interval '4 hours' AS s,
          CASE WHEN i = 5 THEN ${to} ELSE ${from} + (i + 1) * interval '4 hours' END AS e
        FROM generate_series(0, 5) i`;
    } else if (kind === '7d') {
      buckets = sql`
        SELECT i,
          GREATEST((${localFrom} + i * interval '7 days') AT TIME ZONE ${tz}, ${from}) AS s,
          LEAST((${localFrom} + (i + 1) * interval '7 days') AT TIME ZONE ${tz}, ${to}) AS e
        FROM generate_series(0, floor(extract(epoch FROM (${localLast} - ${localFrom})) / 604800)::int) i`;
    } else {
      buckets = sql`
        SELECT (row_number() OVER (ORDER BY m) - 1)::int AS i,
          GREATEST(m AT TIME ZONE ${tz}, ${from}) AS s,
          LEAST((m + interval '1 month') AT TIME ZONE ${tz}, ${to}) AS e
        FROM generate_series(
          date_trunc('month', ${localFrom}), date_trunc('month', ${localLast}), interval '1 month') m`;
    }
    const rows = await this.db.execute(sql`
      WITH b AS (${buckets}),
      f AS (
        SELECT r.ran_at AS ran_at, f.severity AS severity
        FROM agent_runs r
        JOIN reviews rv ON rv.run_id = r.id
        JOIN findings f ON f.review_id = rv.id
        WHERE r.status = 'done' AND ${this.scope(r, workspaceId, win, agentId)}
      )
      SELECT b.i AS i, ${isoMs(sql`b.s`)} AS start, ${isoMs(sql`b.e`)} AS "end",
        count(*) FILTER (WHERE f.severity = 'CRITICAL')::int AS critical,
        count(*) FILTER (WHERE f.severity = 'WARNING')::int AS warning,
        count(*) FILTER (WHERE f.severity = 'SUGGESTION')::int AS suggestion,
        count(*) FILTER (WHERE f.severity IS NOT NULL
          AND f.severity NOT IN ('CRITICAL', 'WARNING', 'SUGGESTION'))::int AS other
      FROM b LEFT JOIN f ON f.ran_at >= b.s AND f.ran_at < b.e
      GROUP BY b.i, b.s, b.e
      ORDER BY b.i`);
    return Array.from(rows, (x) => ({
      start: new Date(x.start as string),
      end: new Date(x.end as string),
      critical: N(x.critical),
      warning: N(x.warning),
      suggestion: N(x.suggestion),
      other: N(x.other),
    }));
  }
}
