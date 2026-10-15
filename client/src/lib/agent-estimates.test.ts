import { describe, it, expect } from "vitest";
import type { AgentEstimate } from "@devdigest/shared";
import { aggregateEstimate, formatEstimate } from "./agent-estimates";

const est = (o: Partial<AgentEstimate>): AgentEstimate => ({
  agent_id: "a",
  duration_ms: null,
  cost_usd: null,
  sample_size: 1,
  last_verdict: null,
  ...o,
});

describe("aggregateEstimate", () => {
  it("takes the max time, sums cost, and ignores agents with no samples", () => {
    const r = aggregateEstimate([
      est({ duration_ms: 10_000, cost_usd: 0.01 }),
      est({ duration_ms: 40_000, cost_usd: 0.02 }),
      est({ duration_ms: 999_000, cost_usd: 5, sample_size: 0 }),
    ]);
    expect(r.duration_ms).toBe(40_000);
    expect(r.cost_usd).toBeCloseTo(0.03);
  });

  it("is null when nothing has a sample", () => {
    expect(aggregateEstimate([est({ sample_size: 0 })])).toEqual({ duration_ms: null, cost_usd: null });
    expect(aggregateEstimate([])).toEqual({ duration_ms: null, cost_usd: null });
  });
});

describe("formatEstimate", () => {
  it("formats seconds and cost, null for unknown", () => {
    expect(formatEstimate({ duration_ms: 42_400, cost_usd: 0.03 })).toEqual({ duration: "42", cost: "$0.03" });
    expect(formatEstimate({ duration_ms: null, cost_usd: null })).toEqual({ duration: null, cost: null });
  });
});
