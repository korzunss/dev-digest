import type { AgentPerfDashboard, PerfRow } from "@devdigest/shared/contracts/agent-performance.js";
import { MODEL_COLOR } from "./constants";

/** Resolve the chip colour for an agent's model (unknown → secondary token). */
export function modelColor(model: string): string {
  return MODEL_COLOR[model] ?? "var(--text-secondary)";
}

/** What a card shows under its meta row (AC-30 to AC-32): a placeholder, nothing, or the 30-day row. */
export type AgentCardSummary =
  | { state: "loading" }
  | { state: "error" }
  | { state: "row"; row: PerfRow };

/**
 * One agent's summary from the shared 30-day dashboard query. A failed query, or an
 * agent the dashboard does not list, yields "error" — the card then omits the line.
 */
export function summaryFor(
  query: { isLoading: boolean; data?: AgentPerfDashboard },
  agentId: string,
): AgentCardSummary {
  if (query.isLoading) return { state: "loading" };
  const row = query.data?.rows.find((r) => r.kind === "agent" && r.agent_id === agentId);
  return row ? { state: "row", row } : { state: "error" };
}
