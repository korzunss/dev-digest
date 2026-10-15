/** Up to this many agent names are listed; more collapse to "<N> agents". */
export const MAX_LISTED_AGENTS = 3;

/** Wall-clock time of a run in seconds, one decimal, like the results header ("9.0s"); an em dash while it is running or unmeasured. */
export function formatRunDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Agent names in column order; a deleted agent (null name) reads as `deletedLabel`. */
export function listedAgentNames(names: (string | null)[], deletedLabel: string): string[] {
  return names.map((n) => n ?? deletedLabel);
}
