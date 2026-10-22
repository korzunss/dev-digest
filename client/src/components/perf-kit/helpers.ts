import type { CostSource } from "@devdigest/shared";
import type { PerfCostSplit } from "@devdigest/shared/contracts/agent-performance.js";

/** AC-M9: a denominator of 1–9 is a small sample. */
export const SMALL_SAMPLE_MAX = 9;

/**
 * D9 A: a derived money figure is an estimate when ANY part of its known cost is
 * one (the same worst-wins rule as `rollupCost`), so it never reads as exact.
 * `formatCostUsd` only draws a prefix for `estimate`, so everything else is null.
 */
export function provenanceOf(split: PerfCostSplit): CostSource | null {
  return split.estimate_usd > 0 ? "estimate" : null;
}

/** "78%" — null stays null so the caller shows "No decisions yet", never "0%". */
export function formatPercent(rate: number | null | undefined): string | null {
  if (rate == null || !Number.isFinite(rate)) return null;
  return `${Math.round(rate * 100)}%`;
}

/**
 * DG4: the accept-rate colour, on the same thresholds `CircularScore` uses for its ring.
 * Neutral (undefined) for no rate or a small sample, so a 100% from one decision is not green.
 */
export function acceptTone(rate: number | null | undefined, decisions: number): string | undefined {
  if (rate == null || !Number.isFinite(rate) || decisions <= SMALL_SAMPLE_MAX) return undefined;
  const score = ratePercent(rate);
  return score >= 75 ? "var(--ok)" : score >= 50 ? "var(--warn)" : "var(--crit)";
}

/** The ring takes a 0–100 integer. */
export function ratePercent(rate: number): number {
  return Math.round(Math.min(1, Math.max(0, rate)) * 100);
}

/** "6.2s", "5s", "340ms", "1m 5s"; unknown is an em dash, never "0s". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${Number((ms / 1000).toFixed(1))}s`;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

/** AC-M14: an arrow only when both rates exist and differ. */
export function acceptTrend(current: number | null, previous: number | null | undefined): "up" | "down" | null {
  if (current == null || previous == null || current === previous) return null;
  return current > previous ? "up" : "down";
}

/** AC-M13: current minus previous; null (omit) when either side has no known cost. */
export function costDeltaOf(
  current: number | null,
  previous: number | null,
  previousKnownRuns: number,
): number | null {
  if (current == null || previous == null || previousKnownRuns <= 0) return null;
  return current - previous;
}
