/* Helpers shared by the /eval routes (dashboard, agent detail, compare modal). */

/** A 0..1 metric as a whole percent; `null` (no data) stays null. */
export const toPercent = (m: number | null | undefined): number | null =>
  m == null ? null : Math.round(m * 100);

/** `2026-05-29T09:14:03Z` → `2026-05-29 09:14` (UTC, so it reads the same everywhere). */
export const formatRunTime = (iso: string): string => iso.slice(0, 16).replace("T", " ");

/** One colour per metric, shared by the bars, the cards and the trend lines. */
export const METRIC_COLORS = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation_accuracy: "var(--warn)",
} as const;
