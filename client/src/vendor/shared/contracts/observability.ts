import { z } from 'zod';
import { Severity } from './findings.js';
import { FindingRecord } from './review-api.js';
import { CostSource } from './trace.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of POST /pulls/:id/multi-agent-run and
 *                          GET /multi-agent-runs/:id
 *   - MultiAgentRunRequest the body of POST /pulls/:id/multi-agent-run
 *   - AgentEstimates       GET /multi-agent/estimates
 *   - MultiAgentRunSummaries  GET /repos/:id/multi-agent-runs (recent runs of a repo)
 *   - LatestMultiAgentRun  GET /pulls/:id/multi-agent (newest run of a PR, or null)
 *   - AgentColumn          one agent's column in the multi-agent view
 *   - Conflict / ConflictTake  where agents disagree on the same file:line
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/** Body of POST /pulls/:id/multi-agent-run. The service removes duplicate ids. */
export const MultiAgentRunRequest = z.object({
  agent_ids: z.array(z.string().uuid()).min(1).max(20),
});
export type MultiAgentRunRequest = z.infer<typeof MultiAgentRunRequest>;

export const AgentColumnStatus = z.enum(['running', 'done', 'failed', 'cancelled']);
export type AgentColumnStatus = z.infer<typeof AgentColumnStatus>;

/**
 * A finding as surfaced in a multi-agent column: the persisted record plus the
 * cross-agent grouping. `also_flagged_by` holds the OTHER agents' run ids.
 */
export const AgentColumnFinding = FindingRecord.extend({
  group_id: z.string().nullable(),
  also_flagged_by: z.array(z.string()),
});
export type AgentColumnFinding = z.infer<typeof AgentColumnFinding>;

/** One agent's result column in the multi-agent review. */
export const AgentColumn = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  agent_deleted: z.boolean(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: AgentColumnStatus,
  error: z.string().nullable(),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  cost_source: CostSource.nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  grounding: z.string().nullable(),
  ran_at: z.string(),
  finished_at: z.string().nullable(),
  findings: z.array(AgentColumnFinding),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** One agent's stance on a contended file:line. */
export const ConflictTake = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  /** Severity if the agent flagged it, or 'ignored' when it did not ("did not flag"). */
  verdict: z.union([Severity, z.literal('ignored')]),
  finding_id: z.string().nullable(),
  title: z.string().nullable(),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/**
 * One group of overlapping findings from two or more agents. `is_conflict` is
 * true when the agents disagree (a missing take or divergent severities).
 * Computed from persisted findings; not stored.
 */
export const Conflict = z.object({
  id: z.string(),
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  severity: Severity,
  is_conflict: z.boolean(),
  takes: z.array(ConflictTake),
});
export type Conflict = z.infer<typeof Conflict>;

/** Response of POST /pulls/:id/multi-agent-run and GET /multi-agent-runs/:id. */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  pr_title: z.string().nullable(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int().nullable(),
  total_cost_usd: z.number().nullable(),
  /** True when at least one column has no cost yet (the total is a lower bound). */
  total_cost_partial: z.boolean(),
  columns: z.array(AgentColumn),
  conflicts: z.array(Conflict),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

/** Typical time/cost of one agent, from its last done runs (GET /multi-agent/estimates). */
export const AgentEstimate = z.object({
  agent_id: z.string(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  sample_size: z.number().int(),
  last_verdict: z.string().nullable(),
});
export type AgentEstimate = z.infer<typeof AgentEstimate>;

export const AgentEstimates = z.array(AgentEstimate);
export type AgentEstimates = z.infer<typeof AgentEstimates>;

/** Overall state of a multi-agent run, derived from its agent runs' statuses. */
export const MultiAgentOverallStatus = z.enum(['running', 'done', 'partially_failed', 'failed']);
export type MultiAgentOverallStatus = z.infer<typeof MultiAgentOverallStatus>;

/** A multi-agent run without its columns — one row of "Recent runs". */
export const MultiAgentRunSummary = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int(),
  pr_title: z.string().nullable(),
  ran_at: z.string(),
  status: MultiAgentOverallStatus,
  agent_count: z.number().int(),
  /** Agent names in column order; null = the agent was deleted. */
  agent_names: z.array(z.string().nullable()),
  total_duration_ms: z.number().int().nullable(),
  total_cost_usd: z.number().nullable(),
  total_cost_partial: z.boolean(),
});
export type MultiAgentRunSummary = z.infer<typeof MultiAgentRunSummary>;

export const MultiAgentRunSummaries = z.array(MultiAgentRunSummary);
export type MultiAgentRunSummaries = z.infer<typeof MultiAgentRunSummaries>;

/** Response of GET /pulls/:id/multi-agent; `run` is null when the PR has none. */
export const LatestMultiAgentRun = z.object({ run: MultiAgentRunSummary.nullable() });
export type LatestMultiAgentRun = z.infer<typeof LatestMultiAgentRun>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
