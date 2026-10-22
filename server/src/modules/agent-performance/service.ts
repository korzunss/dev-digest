import type {
  AgentPerfDashboard,
  AgentStatsBreakdown,
  AgentPerfStats,
  PerfQuery,
  PerfRow,
  PerfRunsCount,
  PerfRunsCountQuery,
  PerfSegment,
  PerfWindow,
  RunHistoryPage,
  RunHistoryQuery,
} from '@devdigest/shared/contracts/agent-performance.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { HISTORY_PAGE } from './constants.js';
import {
  breakdownBucketKind,
  decodeCursor,
  encodeCursor,
  pickMostActive,
  recentSummary,
  resolveWindow,
  sumAggregates,
  sumDecisions,
  toBreakdown,
  toFigures,
  toPrevious,
} from './helpers.js';
import type {
  AgentPerformanceServiceDeps,
  AggregateRow,
  DecisionRow,
  PerfWindowResolved,
  RecentRunRow,
} from './types.js';

/**
 * Agent Performance (spec 015). Read-only: no writes and no LLM (AC-28). The
 * dashboard row and the Stats tab are both built by `toFigures`, so AC-22 holds
 * by construction.
 */
export class AgentPerformanceService {
  private readonly now: () => Date;

  constructor(private readonly deps: AgentPerformanceServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async dashboard(workspaceId: string, q: PerfQuery): Promise<AgentPerfDashboard> {
    const win = await this.checked(q);
    const cur = { from: win.from, to: win.to };
    const prev = { from: win.previousFrom, to: win.previousTo };
    const [agents, curAgg, curDec, prevAgg, prevDec, recent, buckets, models] = await Promise.all([
      this.deps.agents.list(workspaceId),
      this.deps.repo.aggregateByAgent(workspaceId, cur),
      this.deps.repo.decisionsByAgent(workspaceId, cur),
      this.deps.repo.aggregateByAgent(workspaceId, prev),
      this.deps.repo.decisionsByAgent(workspaceId, prev),
      this.deps.repo.recentRuns(workspaceId, cur),
      this.deps.repo.buckets(workspaceId, cur, q.tz, win.unit),
      this.deps.repo.costByModel(workspaceId, cur),
    ]);

    const byAgg = indexBy(curAgg);
    const byDec = indexBy(curDec);
    const byPrevAgg = indexBy(prevAgg);
    const byPrevDec = indexBy(prevDec);
    const byRecent = groupRecent(recent);

    const rows: PerfRow[] = agents.map((a) => ({
      kind: 'agent',
      agent_id: a.id,
      agent_name: a.name,
      enabled: a.enabled,
      current: toFigures(byAgg.get(a.id), byDec.get(a.id)),
      previous: toPrevious(toFigures(byPrevAgg.get(a.id), byPrevDec.get(a.id))),
      recent: recentSummary(byRecent.get(a.id) ?? []),
    }));

    // Runs whose agent is gone (agent_id set null) or is not in the list: one Deleted agents row (AC-14).
    const known = new Set(agents.map((a) => a.id));
    const orphan = (r: { agentId: string | null }) => r.agentId === null || !known.has(r.agentId);
    const orphanAgg = curAgg.filter(orphan);
    const orphanCounted = orphanAgg.some((r) => r.doneRuns > 0);
    if (orphanCounted) {
      const a = sumAggregates(orphanAgg);
      const d = sumDecisions(curDec.filter(orphan));
      const pa = sumAggregates(prevAgg.filter(orphan));
      const pd = sumDecisions(prevDec.filter(orphan));
      rows.push({
        kind: 'deleted',
        agent_id: null,
        agent_name: null,
        enabled: null,
        current: toFigures(a, d),
        previous: toPrevious(toFigures(pa, pd)),
        recent: recentSummary(recent.filter(orphan)),
      });
    }

    // Totals pool every scope of the window, so the per-row figures add up to them (AC-14).
    const totals = toFigures(sumAggregates(curAgg), sumDecisions(curDec));
    const previousTotals = toPrevious(toFigures(sumAggregates(prevAgg), sumDecisions(prevDec)));

    return {
      window: windowOf(q, win),
      agent_count: agents.length,
      totals,
      previous_totals: previousTotals,
      buckets,
      rows,
      most_active: pickMostActive(rows),
      cost_by_agent: rows
        .filter((r) => r.current.cost_known_runs > 0)
        .map((r) => ({
          key: r.agent_id ?? 'deleted',
          label: r.agent_name,
          amount_usd: r.current.total_cost_usd ?? 0,
          split: r.current.cost_split,
        })),
      cost_by_model: models.map(
        (m): PerfSegment => ({
          key: m.model ?? 'unknown',
          label: m.model,
          amount_usd: m.costApiUsd + m.costEstimateUsd + m.costUnrecordedUsd,
          split: { api_usd: m.costApiUsd, estimate_usd: m.costEstimateUsd, unrecorded_usd: m.costUnrecordedUsd },
        }),
      ),
    };
  }

  async agentStats(workspaceId: string, agentId: string, q: PerfQuery): Promise<AgentPerfStats> {
    const win = await this.checked(q);
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const cur = { from: win.from, to: win.to };
    const prev = { from: win.previousFrom, to: win.previousTo };
    const [curAgg, curDec, prevAgg, prevDec, buckets] = await Promise.all([
      this.deps.repo.aggregateByAgent(workspaceId, cur, agentId),
      this.deps.repo.decisionsByAgent(workspaceId, cur, agentId),
      this.deps.repo.aggregateByAgent(workspaceId, prev, agentId),
      this.deps.repo.decisionsByAgent(workspaceId, prev, agentId),
      this.deps.repo.buckets(workspaceId, cur, q.tz, win.unit, agentId),
    ]);
    return {
      window: windowOf(q, win),
      agent_id: agent.id,
      agent_name: agent.name,
      figures: toFigures(curAgg[0], curDec[0]),
      previous: toPrevious(toFigures(prevAgg[0], prevDec[0])),
      buckets,
    };
  }

  async runHistory(workspaceId: string, agentId: string, q: RunHistoryQuery): Promise<RunHistoryPage> {
    const win = await this.checked(q);
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const limit = q.limit ?? HISTORY_PAGE;
    const cursor = q.cursor ? decodeCursor(q.cursor) : undefined;
    const rows = await this.deps.repo.runHistory(
      workspaceId,
      agentId,
      { from: win.from, to: win.to },
      cursor,
      limit + 1,
    );
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        run_id: r.id,
        ran_at: r.ranAt.toISOString(),
        pr_number: r.prNumber,
        tokens: r.tokens,
        cost_usd: r.costUsd,
        cost_source: r.costSource,
        findings_count: r.findingsCount,
        source: r.source,
        has_trace: r.hasTrace,
      })),
      next_cursor: rows.length > limit && last ? encodeCursor({ ranAt: last.ranAt, id: last.id }) : null,
    };
  }

  /** AC-18a: counted runs in the window, workspace-wide or for one agent. */
  async runsCount(workspaceId: string, q: PerfRunsCountQuery): Promise<PerfRunsCount> {
    const win = await this.checked(q);
    if (q.agent_id) {
      const agent = await this.deps.agents.getById(workspaceId, q.agent_id);
      if (!agent) throw new NotFoundError('Agent not found');
    }
    return { runs: await this.deps.repo.countDone(workspaceId, { from: win.from, to: win.to }, q.agent_id) };
  }

  /**
   * Spec 016: the Stats tab panels. The window rules and the tz check run first
   * (AC-40), then the agent lookup (AC-39). Read-only, no LLM (AC-38).
   */
  async breakdown(workspaceId: string, agentId: string, q: PerfQuery): Promise<AgentStatsBreakdown> {
    const win = await this.checked(q);
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const cur = { from: win.from, to: win.to };
    const bucketKind = breakdownBucketKind(q.period, win.from, win.to, q.tz);
    const [skillsSince, memorySince] = await Promise.all([
      this.deps.repo.skillsTrackedSince(workspaceId),
      this.deps.repo.memoryTrackedSince(workspaceId),
    ]);
    const [counts, skills, memory, categories, buckets] = await Promise.all([
      this.deps.repo.countedRuns(workspaceId, cur, agentId),
      this.deps.repo.skillUsage(workspaceId, cur, agentId, skillsSince),
      this.deps.repo.memoryUsage(workspaceId, cur, agentId, memorySince),
      this.deps.repo.findingsByCategory(workspaceId, cur, agentId),
      this.deps.repo.severityBuckets(workspaceId, cur, q.tz, bucketKind, agentId),
    ]);
    return toBreakdown({
      window: windowOf(q, win),
      counts,
      bucketKind,
      skillsSince,
      skills,
      memorySince,
      memory,
      categories,
      buckets,
    });
  }

  /** The tz check and window rules of Agent → Stats, for other modules (spec 016 D8). */
  async checkWindow(q: PerfQuery): Promise<PerfWindowResolved> {
    return this.checked(q);
  }

  /** AC-4 and AC-29: a time zone Postgres does not know, then the window rules. */
  private async checked(q: PerfQuery): Promise<PerfWindowResolved> {
    if (!(await this.deps.repo.timeZoneExists(q.tz))) throw new ValidationError('Unknown time zone');
    return resolveWindow(q, this.now());
  }
}

function indexBy<T extends AggregateRow | DecisionRow>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) if (r.agentId) m.set(r.agentId, r);
  return m;
}

function groupRecent(rows: RecentRunRow[]): Map<string, RecentRunRow[]> {
  const m = new Map<string, RecentRunRow[]>();
  for (const r of rows) {
    if (!r.agentId) continue;
    const list = m.get(r.agentId);
    if (list) list.push(r);
    else m.set(r.agentId, [r]);
  }
  return m;
}

function windowOf(q: PerfQuery, w: PerfWindowResolved): PerfWindow {
  return {
    period: q.period,
    from: w.from.toISOString(),
    to: w.to.toISOString(),
    previous_from: w.previousFrom.toISOString(),
    previous_to: w.previousTo.toISOString(),
  };
}
