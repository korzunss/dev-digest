/** A 0..1 metric as a whole percent; `null` (no data) stays null. */
export const toPercent = (m: number | null | undefined): number | null =>
  m == null ? null : Math.round(m * 100);

/** Message key (under `eval.evalsTab`) for a refused start, or null when unknown. */
export function startRefusalKey(code: string | undefined): "runInProgress" | "suiteEmpty" | "noApiKey" | null {
  if (code === "run_in_progress") return "runInProgress";
  if (code === "suite_empty") return "suiteEmpty";
  if (code === "no_api_key") return "noApiKey";
  return null;
}
