import type { FindingRecord, Severity } from "@devdigest/shared";
import { severityOrder } from "@/lib/severity";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";

/**
 * Optionally drop low-confidence findings, optionally keep a single severity,
 * then sort by severity. The two filters are ANDed: with `hideLow` on and a
 * WARNING filter, a low-confidence WARNING stays hidden (spec 002).
 */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity));
}
