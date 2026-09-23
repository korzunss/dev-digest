/** Pure helpers for ConventionCard. */
import type { ConventionCandidate } from "@devdigest/shared";
import { CONFIDENCE_FAIR, CONFIDENCE_STRONG } from "./constants";

/**
 * The cited location, as the link text and as the anchor of the GitHub URL.
 * A single-line citation stays `path:23`; the range only appears when the
 * evidence really spans one — `23-23` reads like a bug.
 */
export function evidenceLabel(
  c: Pick<ConventionCandidate, "evidence_path" | "evidence_line" | "evidence_end_line">,
): string {
  const end = c.evidence_end_line;
  return end > c.evidence_line
    ? `${c.evidence_path}:${c.evidence_line}-${end}`
    : `${c.evidence_path}:${c.evidence_line}`;
}

/** A 0..1 confidence as a whole percentage, clamped — the contract bounds it,
    but the bar must not draw past its track if a future provider does not. */
export function confidencePct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function confidenceColor(pct: number): string {
  if (pct >= CONFIDENCE_STRONG) return "var(--ok)";
  if (pct >= CONFIDENCE_FAIR) return "var(--warn)";
  return "var(--text-muted)";
}
