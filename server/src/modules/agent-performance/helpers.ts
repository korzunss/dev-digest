import { z } from 'zod';
import type {
  AgentStatsBreakdown,
  BreakdownBucketKind,
  PerfCostSplit,
  PerfFigures,
  PerfMostActive,
  PerfPrevious,
  PerfRecentRuns,
  PerfPeriodKind,
  PerfRow,
  PerfWindow,
} from '@devdigest/shared/contracts/agent-performance.js';
import { ValidationError } from '../../platform/errors.js';
import { CLOCK_SKEW_MS, DAY_MS, MAX_CUSTOM_MS, MONTH_BUCKETS_AFTER_DAYS, RECENT_RUNS } from './constants.js';
import type {
  AggregateRow,
  CategoryCountRow,
  CountedRunsRow,
  DecisionRow,
  HistoryCursor,
  MemoryUsageRow,
  PerfWindowQuery,
  PerfWindowResolved,
  RecentRunRow,
  SeverityBucketRow,
  SkillUsageRow,
  UsageRead,
} from './types.js';

/**
 * Pure rules of the Agent Performance screens (spec 015). Both endpoints build
 * their figures with `toFigures`, so AC-22 (same numbers on the Stats tab and
 * the dashboard row) holds by construction. Values stay unrounded.
 */

/**
 * AC-4 / AC-5. The client sends instants; the server re-checks them. Rejects a
 * reversed range, an end in the future, a `1d`/`30d` that is not 24 h / 30 x 24 h
 * long (+- clock skew) and a custom range over 365 days. The previous window
 * has the same length and ends where this one starts.
 */
export function resolveWindow(q: PerfWindowQuery, now: Date): PerfWindowResolved {
  const from = new Date(q.from);
  const to = new Date(q.to);
  const length = to.getTime() - from.getTime();
  if (Number.isNaN(length)) throw new ValidationError('Invalid period');
  if (length <= 0) throw new ValidationError('The period starts after it ends');
  if (to.getTime() > now.getTime() + CLOCK_SKEW_MS) {
    throw new ValidationError('The period ends in the future');
  }
  if (q.period === '1d' && Math.abs(length - DAY_MS) > CLOCK_SKEW_MS) {
    throw new ValidationError('A 1-day period must be 24 hours long');
  }
  if (q.period === '30d' && Math.abs(length - 30 * DAY_MS) > CLOCK_SKEW_MS) {
    throw new ValidationError('A 30-day period must be 30 x 24 hours long');
  }
  if (q.period === 'custom' && length > MAX_CUSTOM_MS) {
    throw new ValidationError('A custom period is at most 365 days');
  }
  return {
    from,
    to,
    previousFrom: new Date(from.getTime() - length),
    previousTo: from,
    unit: q.period === '1d' ? 'hour' : 'day',
  };
}

/** M-8 / M-10: accepted / (accepted + dismissed), null at 0 decisions. */
export function acceptRate(accepted: number, dismissed: number): number | null {
  const n = accepted + dismissed;
  return n === 0 ? null : accepted / n;
}

const ZERO_SPLIT: PerfCostSplit = { api_usd: 0, estimate_usd: 0, unrecorded_usd: 0 };

/** M-2…M-8, M-12, M-15 of one scope. A scope with no rows yields zero runs, not an error. */
export function toFigures(agg: AggregateRow | undefined, decisions: DecisionRow | undefined): PerfFigures {
  const accepted = decisions?.accepted ?? 0;
  const dismissed = decisions?.dismissed ?? 0;
  const runs = agg?.doneRuns ?? 0;
  const known = agg?.costKnownRuns ?? 0;
  const split: PerfCostSplit = agg
    ? {
        api_usd: agg.costApiUsd,
        estimate_usd: agg.costEstimateUsd,
        unrecorded_usd: agg.costUnrecordedUsd,
      }
    : { ...ZERO_SPLIT };
  const total = known > 0 ? split.api_usd + split.estimate_usd + split.unrecorded_usd : null;
  const durationKnown = agg?.durationKnownRuns ?? 0;
  return {
    runs,
    runs_not_counted: agg?.notCountedRuns ?? 0,
    cost_known_runs: known,
    cost_unknown_runs: runs - known,
    total_cost_usd: total,
    cost_split: split,
    avg_cost_usd: total !== null ? total / known : null,
    avg_duration_ms: agg && durationKnown > 0 ? agg.durationSumMs / durationKnown : null,
    accepted,
    dismissed,
    accept_rate: acceptRate(accepted, dismissed),
    last_run_at: runs > 0 && agg?.lastRunAt ? agg.lastRunAt.toISOString() : null,
  };
}

/** What a delta (M-13, M-14) needs from the previous window. */
export function toPrevious(f: PerfFigures): PerfPrevious {
  return {
    runs: f.runs,
    cost_known_runs: f.cost_known_runs,
    total_cost_usd: f.total_cost_usd,
    avg_cost_usd: f.avg_cost_usd,
    accept_rate: f.accept_rate,
  };
}

/** Pools aggregate rows into one (M-10 pools; it is not a mean of per-agent rates). */
export function sumAggregates(rows: AggregateRow[]): AggregateRow {
  const sum: AggregateRow = {
    agentId: null,
    doneRuns: 0,
    notCountedRuns: 0,
    costKnownRuns: 0,
    costApiUsd: 0,
    costEstimateUsd: 0,
    costUnrecordedUsd: 0,
    durationKnownRuns: 0,
    durationSumMs: 0,
    lastRunAt: null,
  };
  for (const r of rows) {
    sum.doneRuns += r.doneRuns;
    sum.notCountedRuns += r.notCountedRuns;
    sum.costKnownRuns += r.costKnownRuns;
    sum.costApiUsd += r.costApiUsd;
    sum.costEstimateUsd += r.costEstimateUsd;
    sum.costUnrecordedUsd += r.costUnrecordedUsd;
    sum.durationKnownRuns += r.durationKnownRuns;
    sum.durationSumMs += r.durationSumMs;
    if (r.lastRunAt && (!sum.lastRunAt || r.lastRunAt > sum.lastRunAt)) sum.lastRunAt = r.lastRunAt;
  }
  return sum;
}

export function sumDecisions(rows: DecisionRow[]): DecisionRow {
  return {
    agentId: null,
    accepted: rows.reduce((s, r) => s + r.accepted, 0),
    dismissed: rows.reduce((s, r) => s + r.dismissed, 0),
  };
}

/**
 * M-11: the existing agent with the most counted runs. Ties go to the newer
 * last run, then to the name A to Z. The Deleted agents row is never chosen.
 */
export function pickMostActive(rows: PerfRow[]): PerfMostActive | null {
  const candidates = rows.filter((r) => r.kind === 'agent' && r.agent_id && r.current.runs > 0);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (b.current.runs !== a.current.runs) return b.current.runs - a.current.runs;
    const at = a.current.last_run_at ? Date.parse(a.current.last_run_at) : 0;
    const bt = b.current.last_run_at ? Date.parse(b.current.last_run_at) : 0;
    if (bt !== at) return bt - at;
    return (a.agent_name ?? '').localeCompare(b.agent_name ?? '');
  });
  const top = candidates[0]!;
  return {
    agent_id: top.agent_id!,
    agent_name: top.agent_name ?? '',
    runs: top.current.runs,
    accepted: top.current.accepted,
    dismissed: top.current.dismissed,
    accept_rate: top.current.accept_rate,
  };
}

/**
 * AC-15: the newest runs of a row (at most `RECENT_RUNS`), oldest to newest,
 * with the averages taken over exactly those runs.
 */
export function recentSummary(rows: RecentRunRow[]): PerfRecentRuns {
  const shown = [...rows]
    .sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime())
    .slice(0, RECENT_RUNS)
    .reverse();
  const durations = shown.map((r) => r.durationMs).filter((d): d is number => d !== null && d >= 0);
  const costs = shown.filter((r): r is RecentRunRow & { costUsd: number } => r.costUsd !== null && r.costUsd >= 0);
  const split: PerfCostSplit = { ...ZERO_SPLIT };
  for (const r of costs) {
    if (r.costSource === 'api') split.api_usd += r.costUsd;
    else if (r.costSource === 'estimate') split.estimate_usd += r.costUsd;
    else split.unrecorded_usd += r.costUsd;
  }
  const costTotal = split.api_usd + split.estimate_usd + split.unrecorded_usd;
  return {
    runs: shown.map((r) => ({
      ran_at: r.ranAt.toISOString(),
      duration_ms: r.durationMs !== null && r.durationMs >= 0 ? r.durationMs : null,
      cost_usd: r.costUsd !== null && r.costUsd >= 0 ? r.costUsd : null,
      cost_source: r.costUsd !== null && r.costUsd >= 0 ? r.costSource : null,
    })),
    avg_duration_ms: durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : null,
    avg_cost_usd: costs.length > 0 ? costTotal / costs.length : null,
    cost_split: split,
  };
}

export function encodeCursor(c: HistoryCursor): string {
  return Buffer.from(JSON.stringify({ t: c.ranAt.toISOString(), id: c.id }), 'utf8').toString('base64url');
}

const CursorPayload = z.object({ t: z.string().datetime(), id: z.string().uuid() });

/** The cursor is opaque to clients; a forged one is a 422, never a crash. */
export function decodeCursor(raw: string): HistoryCursor {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationError('Invalid cursor');
  }
  const parsed = CursorPayload.safeParse(json);
  if (!parsed.success) throw new ValidationError('Invalid cursor');
  return { ranAt: new Date(parsed.data.t), id: parsed.data.id };
}

/** The local calendar date (`YYYY-MM-DD`) of an instant in `tz`. */
function localDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * Spec 016 AC-27…AC-29: which bucket width the severity chart uses. `1d` is
 * six 4-hour buckets, `30d` is 7-day buckets, and a custom range is 7-day
 * buckets up to `MONTH_BUCKETS_AFTER_DAYS` local calendar days (start and end
 * dates inclusive, the end being `to - 1 ms`) and calendar months beyond.
 */
export function breakdownBucketKind(period: PerfPeriodKind, from: Date, to: Date, tz: string): BreakdownBucketKind {
  if (period === '1d') return '4h';
  if (period === '30d') return '7d';
  const first = Date.parse(`${localDate(from, tz)}T00:00:00Z`);
  const last = Date.parse(`${localDate(new Date(to.getTime() - 1), tz)}T00:00:00Z`);
  const days = Math.round((last - first) / DAY_MS) + 1;
  return days > MONTH_BUCKETS_AFTER_DAYS ? 'month' : '7d';
}

export interface BreakdownParts {
  window: PerfWindow;
  counts: CountedRunsRow;
  bucketKind: BreakdownBucketKind;
  skillsSince: Date | null;
  skills: UsageRead<SkillUsageRow>;
  memorySince: Date | null;
  memory: UsageRead<MemoryUsageRow>;
  categories: CategoryCountRow[];
  buckets: SeverityBucketRow[];
}

/**
 * Assembles the panels' response from the raw reads. A panel with no
 * "tracked since" has denominator 0 and no rows whatever the reads said. The
 * findings total is the sum of the category counts (AC-21). Nothing is rounded.
 */
export function toBreakdown(p: BreakdownParts): AgentStatsBreakdown {
  return {
    window: p.window,
    counted_runs: p.counts.counted,
    local_runs: p.counts.local,
    skills: {
      tracked_since: p.skillsSince ? p.skillsSince.toISOString() : null,
      denominator: p.skillsSince ? p.skills.denominator : 0,
      rows: p.skillsSince ? p.skills.rows.map((r) => ({ skill_id: r.skillId, name: r.name, runs: r.runs })) : [],
    },
    memory: {
      tracked_since: p.memorySince ? p.memorySince.toISOString() : null,
      denominator: p.memorySince ? p.memory.denominator : 0,
      rows: p.memorySince ? p.memory.rows.map((r) => ({ text: r.text, pr: r.pr, runs: r.runs })) : [],
    },
    findings: {
      total: p.categories.reduce((s, c) => s + c.count, 0),
      by_category: p.categories.map((c) => ({ category: c.category, count: c.count })),
      bucket_kind: p.bucketKind,
      buckets: p.buckets.map((b) => ({
        start: b.start.toISOString(),
        end: b.end.toISOString(),
        critical: b.critical,
        warning: b.warning,
        suggestion: b.suggestion,
        other: b.other,
      })),
    },
  };
}
