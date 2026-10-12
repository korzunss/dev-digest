import type { EvalPeriod, EvalSuiteTrendPoint } from "@devdigest/shared";

export type MetricKey = "recall" | "precision" | "citation_accuracy";

/** `?period=` → a period; anything but "all" is the 30-day default (AC-45). */
export const parsePeriod = (raw: string | null | undefined): EvalPeriod => (raw === "all" ? "all" : "30d");

/** Compare needs exactly two selected runs (AC-51). */
export const canCompare = (selected: string[]): selected is [string, string] => selected.length === 2;

/** Add the id when absent, drop it when present. */
export const toggleSelected = (selected: string[], id: string): string[] =>
  selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];

/** One metric's completed-run values, oldest first, for a card sparkline. Runs without the metric are skipped. */
export const metricSeries = (trend: EvalSuiteTrendPoint[], key: MetricKey): number[] =>
  trend.map((p) => p.metrics[key]).filter((v): v is number => v != null);

/** Message key (under `eval.detail.metricName`) for an alert's metric id, or null when unknown. */
export const metricNameKey = (metric: string): MetricKey | null =>
  metric === "recall" || metric === "precision" || metric === "citation_accuracy" ? metric : null;

/** Message key (under `eval.detail`) for a refused run start, or null when unknown. */
export function startRefusalKey(code: string | undefined): "runInProgress" | "suiteEmpty" | "noApiKey" | null {
  if (code === "run_in_progress") return "runInProgress";
  if (code === "suite_empty") return "suiteEmpty";
  if (code === "no_api_key") return "noApiKey";
  return null;
}
