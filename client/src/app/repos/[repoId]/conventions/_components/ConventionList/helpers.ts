/** Pure helpers for ConventionList. */
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";

/** How many rules would reach the generated skill right now. */
export function acceptedCount(candidates: ConventionCandidate[]): number {
  return candidates.filter((c) => c.status === "accepted").length;
}

/**
 * What the one bulk button does next, and to which rows.
 *
 * While anything is still undecided the button ACCEPTS those rows — and only
 * those: a rule someone has explicitly rejected is a decision this feature
 * promises to preserve (a re-scan will not resurrect it either), so "select
 * all" must not quietly overturn it. Once nothing is pending the button
 * reverses and returns the accepted rows to pending, which is the only way
 * back from a mis-click. When its list is empty the caller disables it.
 */
export function bulkAction(candidates: ConventionCandidate[]): {
  next: Extract<ConventionStatus, "accepted" | "pending">;
  ids: string[];
} {
  const pending = candidates.filter((c) => c.status === "pending");
  if (pending.length > 0) return { next: "accepted", ids: pending.map((c) => c.id) };
  return {
    next: "pending",
    ids: candidates.filter((c) => c.status === "accepted").map((c) => c.id),
  };
}
