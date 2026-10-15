import type { Agent, AgentEstimate } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format-cost";
import { formatEstimate } from "@/lib/agent-estimates";

/** AC-2: every enabled agent ticked, every disabled one not. */
export function initialSelection(agents: Pick<Agent, "id" | "enabled">[]): string[] {
  return agents.filter((a) => a.enabled).map((a) => a.id);
}

/** Toggle one id, keeping the agents' own order. */
export function toggleId(
  agents: Pick<Agent, "id">[],
  selected: string[],
  id: string,
): string[] {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return agents.map((a) => a.id).filter((x) => next.has(x));
}

/** `{ duration, cost }` for the "≈ {duration}s · {cost}" copy; null = no estimate yet. */
export function estimateParts(e: AgentEstimate | undefined): { duration: string; cost: string } | null {
  if (!e || e.sample_size === 0) return null;
  const { duration, cost } = formatEstimate(e);
  if (duration == null) return null;
  return { duration, cost: cost ?? formatCostUsd(null) };
}
