import { z } from 'zod';
import { CostSource } from './trace.js';

/**
 * Agent Performance (spec 015): the workspace dashboard and the per-agent Stats
 * tab. Deliberately NOT re-exported from `index.ts` (plan 42, D4 A) so the
 * agent-runner bundle, which inlines the barrel, stays unchanged. Import from
 * `@devdigest/shared/contracts/agent-performance.js`.
 *
 * Money and rates are unrounded; the client formats them (`formatCostUsd`).
 */

export const PerfPeriodKind = z.enum(['1d', '30d', 'custom']);
export type PerfPeriodKind = z.infer<typeof PerfPeriodKind>;

/**
 * The selected window as instants plus the browser's IANA time zone (used only
 * to bucket the sparkline). The server re-checks AC-4 on these values.
 */
export const PerfQuery = z.object({
  period: PerfPeriodKind,
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  tz: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_+\-/]+$/),
});
export type PerfQuery = z.infer<typeof PerfQuery>;

/** M-4: every known cost split by provenance. */
export const PerfCostSplit = z.object({
  api_usd: z.number(),
  estimate_usd: z.number(),
  unrecorded_usd: z.number(),
});
export type PerfCostSplit = z.infer<typeof PerfCostSplit>;

/** One window's figures for one scope (an agent, the deleted-agents row, or the workspace). */
export const PerfFigures = z.object({
  /** M-2: counted (`done`) runs. */
  runs: z.number().int(),
  /** M-15: failed + cancelled runs in the window. */
  runs_not_counted: z.number().int(),
  cost_known_runs: z.number().int(),
  cost_unknown_runs: z.number().int(),
  /** M-3; null when `cost_known_runs` is 0. */
  total_cost_usd: z.number().nullable(),
  cost_split: PerfCostSplit,
  /** M-5. */
  avg_cost_usd: z.number().nullable(),
  /** M-6. */
  avg_duration_ms: z.number().nullable(),
  /** M-7. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  /** M-8 / M-10: accepted / (accepted + dismissed), null at 0 decisions. */
  accept_rate: z.number().nullable(),
  /** M-12. */
  last_run_at: z.string().datetime({ offset: true }).nullable(),
});
export type PerfFigures = z.infer<typeof PerfFigures>;

/** The previous window's figures (AC-5), only what a delta needs. */
export const PerfPrevious = z.object({
  runs: z.number().int(),
  cost_known_runs: z.number().int(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  accept_rate: z.number().nullable(),
});
export type PerfPrevious = z.infer<typeof PerfPrevious>;

/** AC-15: the newest counted runs of a row, oldest to newest. */
export const PerfRecentRuns = z.object({
  runs: z
    .array(
      z.object({
        ran_at: z.string().datetime({ offset: true }),
        duration_ms: z.number().nullable(),
        cost_usd: z.number().nullable(),
        cost_source: CostSource.nullable(),
      }),
    )
    .max(5),
  avg_duration_ms: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  cost_split: PerfCostSplit,
});
export type PerfRecentRuns = z.infer<typeof PerfRecentRuns>;

export const PerfRow = z.object({
  kind: z.enum(['agent', 'deleted']),
  agent_id: z.string().uuid().nullable(),
  agent_name: z.string().nullable(),
  enabled: z.boolean().nullable(),
  current: PerfFigures,
  previous: PerfPrevious,
  recent: PerfRecentRuns,
});
export type PerfRow = z.infer<typeof PerfRow>;

/** One cost-breakdown segment (AC-17). `label` null = Deleted agents / Unknown model. */
export const PerfSegment = z.object({
  key: z.string(),
  label: z.string().nullable(),
  amount_usd: z.number(),
  split: PerfCostSplit,
});
export type PerfSegment = z.infer<typeof PerfSegment>;

/** Counted runs in one sparkline bucket; `start` is the local wall clock `YYYY-MM-DDTHH:mm`. */
export const PerfBucket = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  runs: z.number().int(),
});
export type PerfBucket = z.infer<typeof PerfBucket>;

export const PerfWindow = z.object({
  period: PerfPeriodKind,
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  previous_from: z.string().datetime({ offset: true }),
  previous_to: z.string().datetime({ offset: true }),
});
export type PerfWindow = z.infer<typeof PerfWindow>;

/** M-11. */
export const PerfMostActive = z.object({
  agent_id: z.string().uuid(),
  agent_name: z.string(),
  runs: z.number().int(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  accept_rate: z.number().nullable(),
});
export type PerfMostActive = z.infer<typeof PerfMostActive>;

export const AgentPerfDashboard = z.object({
  window: PerfWindow,
  agent_count: z.number().int(),
  totals: PerfFigures,
  previous_totals: PerfPrevious,
  buckets: z.array(PerfBucket),
  rows: z.array(PerfRow),
  most_active: PerfMostActive.nullable(),
  cost_by_agent: z.array(PerfSegment),
  cost_by_model: z.array(PerfSegment),
});
export type AgentPerfDashboard = z.infer<typeof AgentPerfDashboard>;

export const AgentPerfStats = z.object({
  window: PerfWindow,
  agent_id: z.string().uuid(),
  agent_name: z.string(),
  figures: PerfFigures,
  previous: PerfPrevious,
  buckets: z.array(PerfBucket),
});
export type AgentPerfStats = z.infer<typeof AgentPerfStats>;

/** The 30-day counted-run count behind the "Try 30 days" suggestion (AC-18a). */
export const PerfRunsCountQuery = PerfQuery.extend({
  agent_id: z.string().uuid().optional(),
});
export type PerfRunsCountQuery = z.infer<typeof PerfRunsCountQuery>;

export const PerfRunsCount = z.object({ runs: z.number().int() });
export type PerfRunsCount = z.infer<typeof PerfRunsCount>;

export const RunHistoryQuery = PerfQuery.extend({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type RunHistoryQuery = z.infer<typeof RunHistoryQuery>;

export const RunHistoryItem = z.object({
  run_id: z.string().uuid(),
  ran_at: z.string().datetime({ offset: true }),
  pr_number: z.number().int().nullable(),
  tokens: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  cost_source: CostSource.nullable(),
  findings_count: z.number().int().nullable(),
  source: z.enum(['local', 'ci']),
  has_trace: z.boolean(),
});
export type RunHistoryItem = z.infer<typeof RunHistoryItem>;

export const RunHistoryPage = z.object({
  items: z.array(RunHistoryItem),
  next_cursor: z.string().nullable(),
});
export type RunHistoryPage = z.infer<typeof RunHistoryPage>;
