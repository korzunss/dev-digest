import type { CostSource } from "@devdigest/shared";

/**
 * The ONE place a run cost becomes a string (spec 001). Three screens show cost
 * — the PR list, the run timeline, the trace drawer — and they must agree on
 * precision and on what "unknown" looks like, so none of them formats by hand.
 *
 * Two rules do the real work:
 *
 *  - **Unknown is an em dash, never $0.00.** A failed run, a model the price
 *    book doesn't know, and a free model are three different facts. Printing
 *    "$0.00" for the first two would quietly claim a review was free.
 *  - **An estimate wears a `~`.** OpenRouter reports a real price; every other
 *    provider is priced from token counts against an approximate table. The
 *    prefix is the only thing keeping the two apart on screen.
 *
 * Precision is adaptive because the values span four orders of magnitude: a
 * single cheap run is $0.0013 (fixed 2dp would render it "$0.00" — the exact
 * lie the first rule forbids), while a PR total is $0.014 and a big run is $1.23.
 */
export function formatCostUsd(
  value: number | null | undefined,
  source?: CostSource | null,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const prefix = source === "estimate" ? "~" : "";
  return `${prefix}$${digits(value)}`;
}

/**
 * 2dp from $1 up; below that, widen to 3–4dp and then trim the zeros the
 * widening added. So $0.06 stays "$0.06" (not "$0.060"), while $0.0013 keeps
 * every digit it needs. Two decimals is always the floor — this is money.
 */
function digits(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1 || abs === 0) return value.toFixed(2);
  const fixed = value.toFixed(abs >= 0.01 ? 3 : 4);
  const trimmed = fixed.replace(/0+$/, "");
  return trimmed.length < 4 ? value.toFixed(2) : trimmed; // "0.0" → "0.00"
}

/** Total tokens of a run, thousands-separated — "9,119". Null when unknown. */
export function formatTokenTotal(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string | null {
  if (tokensIn == null && tokensOut == null) return null;
  return ((tokensIn ?? 0) + (tokensOut ?? 0)).toLocaleString("en-US");
}
