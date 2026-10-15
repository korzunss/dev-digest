import type { AgentEstimate } from "@devdigest/shared";
import { formatCostUsd } from "./format-cost";

export interface AggregateEstimate {
  /** Slowest agent wins: the agents run in parallel. */
  duration_ms: number | null;
  /** Costs add up. */
  cost_usd: number | null;
}

/** Combine the estimates of the ticked agents; agents with no samples are skipped. */
export function aggregateEstimate(estimates: AgentEstimate[]): AggregateEstimate {
  const sampled = estimates.filter((e) => e.sample_size > 0);
  const durations = sampled.flatMap((e) => (e.duration_ms == null ? [] : [e.duration_ms]));
  const costs = sampled.flatMap((e) => (e.cost_usd == null ? [] : [e.cost_usd]));
  return {
    duration_ms: durations.length ? Math.max(...durations) : null,
    cost_usd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
  };
}

/** "≈ 42s · $0.03" parts; null when the value is unknown. */
export function formatEstimate(e: Pick<AggregateEstimate, "duration_ms" | "cost_usd">): {
  duration: string | null;
  cost: string | null;
} {
  return {
    duration: e.duration_ms == null ? null : String(Math.round(e.duration_ms / 1000)),
    cost: e.cost_usd == null ? null : formatCostUsd(e.cost_usd),
  };
}
