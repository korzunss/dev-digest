import type { Conflict } from "@devdigest/shared";

/** The groups to list: every group, or only those where the agents disagree. */
export function visibleGroups(conflicts: Conflict[], onlyConflicts: boolean): Conflict[] {
  return onlyConflicts ? conflicts.filter((c) => c.is_conflict) : conflicts;
}
