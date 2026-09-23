/**
 * estimateTokens — the client's stand-in for a tokenizer.
 * The rule worth guarding is the one that carries meaning: the number is an
 * approximation and always says so with a `~`.
 */
import { describe, it, expect } from "vitest";
import { CHARS_PER_TOKEN, estimateTokens, formatTokenEstimate } from "./estimate-tokens";

describe("estimateTokens", () => {
  it("counts roughly four characters to the token", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(400))).toBe(400 / CHARS_PER_TOKEN);
  });

  it("rounds up, so any non-empty text costs at least one token", () => {
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("treats empty and missing text as zero rather than NaN", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });
});

describe("formatTokenEstimate", () => {
  it("marks the number as an estimate with a ~", () => {
    expect(formatTokenEstimate("abcd")).toBe("~1");
    expect(formatTokenEstimate("")).toBe("~0");
  });

  it("separates thousands so a long body stays readable", () => {
    expect(formatTokenEstimate("x".repeat(40_000))).toBe("~10,000");
  });
});
