import type { PerfQuery } from '@devdigest/shared/contracts/agent-performance.js';
import type { AgentPerformanceRepository } from './repository.js';

/**
 * Plain row shapes the repository returns and the pure helpers consume. They
 * carry no `db/schema` types (server gotchas → DB), so a helper can import them.
 */

/** A resolved, validated window (all instants). */
export interface PerfWindowResolved {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  /** Sparkline bucket width: an hour for the 1-day period, otherwise a calendar day. */
  unit: 'hour' | 'day';
}

/** Per-agent aggregate of `agent_runs` in a window; `agentId` null = runs of a deleted agent. */
export interface AggregateRow {
  agentId: string | null;
  /** status = 'done' (M-1). */
  doneRuns: number;
  /** status in ('failed','cancelled') (M-15). */
  notCountedRuns: number;
  /** Done runs whose cost is known (cost_usd >= 0). */
  costKnownRuns: number;
  costApiUsd: number;
  costEstimateUsd: number;
  /** Known cost with no cost_source (CI runs today). */
  costUnrecordedUsd: number;
  /** Done runs whose duration is known (duration_ms >= 0) and their sum. */
  durationKnownRuns: number;
  durationSumMs: number;
  lastRunAt: Date | null;
}

export interface DecisionRow {
  agentId: string | null;
  accepted: number;
  dismissed: number;
}

export interface RecentRunRow {
  agentId: string | null;
  ranAt: Date;
  durationMs: number | null;
  costUsd: number | null;
  costSource: 'api' | 'estimate' | null;
}

export interface ModelCostRow {
  model: string | null;
  costApiUsd: number;
  costEstimateUsd: number;
  costUnrecordedUsd: number;
}

export interface BucketRow {
  /** Local wall clock `YYYY-MM-DDTHH:mm`. */
  start: string;
  runs: number;
}

export interface RunHistoryRow {
  id: string;
  ranAt: Date;
  prNumber: number | null;
  tokens: number | null;
  costUsd: number | null;
  costSource: 'api' | 'estimate' | null;
  findingsCount: number | null;
  source: 'local' | 'ci';
  hasTrace: boolean;
}

/** Keyset position of the last row of a Run history page. */
export interface HistoryCursor {
  ranAt: Date;
  id: string;
}

/** The agent fields the screens read. `container.agentsRepo` satisfies this structurally. */
export interface PerfAgent {
  id: string;
  name: string;
  enabled: boolean;
}

export interface PerfAgentsPort {
  list(workspaceId: string): Promise<PerfAgent[]>;
  getById(workspaceId: string, id: string): Promise<PerfAgent | undefined>;
}

export interface AgentPerformanceServiceDeps {
  repo: AgentPerformanceRepository;
  agents: PerfAgentsPort;
  now?: () => Date;
}

export type PerfWindowQuery = Pick<PerfQuery, 'period' | 'from' | 'to'>;
