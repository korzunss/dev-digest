/**
 * formatCostUsd — the single formatter behind all three cost surfaces.
 * The rules worth guarding are the two that carry meaning: unknown is an em
 * dash (never "$0.00"), and an estimate is visibly an estimate.
 */
import { describe, it, expect } from "vitest";
import { formatCostUsd, formatTokenTotal } from "./format-cost";

describe("formatCostUsd", () => {
  it("renders unknown as an em dash, not as free", () => {
    expect(formatCostUsd(null)).toBe("—");
    expect(formatCostUsd(undefined)).toBe("—");
    // A failed run with a source but no number is still unknown.
    expect(formatCostUsd(null, "estimate")).toBe("—");
  });

  it("renders a genuinely free model as $0.00", () => {
    expect(formatCostUsd(0, "api")).toBe("$0.00");
  });

  it("keeps cheap runs non-zero by widening precision", () => {
    expect(formatCostUsd(0.0013)).toBe("$0.0013"); // 2dp would read "$0.00"
    expect(formatCostUsd(0.014)).toBe("$0.014");
    expect(formatCostUsd(1.5)).toBe("$1.50");
  });

  it("does not pad with the zeros the widening added", () => {
    expect(formatCostUsd(0.06)).toBe("$0.06"); // not "$0.060"
    expect(formatCostUsd(0.5)).toBe("$0.50");
    expect(formatCostUsd(0.001)).toBe("$0.001");
  });

  it("prefixes an estimate with ~ and leaves a reported price bare", () => {
    expect(formatCostUsd(0.014, "estimate")).toBe("~$0.014");
    expect(formatCostUsd(0.014, "api")).toBe("$0.014");
    expect(formatCostUsd(0.014, null)).toBe("$0.014");
  });

  it("treats a non-finite value as unknown rather than printing NaN", () => {
    expect(formatCostUsd(Number.NaN)).toBe("—");
    expect(formatCostUsd(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatTokenTotal", () => {
  it("sums in+out with a thousands separator", () => {
    expect(formatTokenTotal(8_900, 219)).toBe("9,119");
  });

  it("tolerates one half being missing", () => {
    expect(formatTokenTotal(8_900, null)).toBe("8,900");
  });

  it("returns null when there are no token counts at all", () => {
    expect(formatTokenTotal(null, null)).toBe(null);
    expect(formatTokenTotal(undefined, undefined)).toBe(null);
  });
});
