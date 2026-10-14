/* The chart's tooltip formatter and row mapping (AC-49): the tooltip must give
   the version, the run time and the cost. */
import { describe, it, expect } from "vitest";
import type { EvalSuiteTrendPoint } from "@devdigest/shared";
import { tooltipModel, trendRows } from "./helpers";

const point = (over: Partial<EvalSuiteTrendPoint> = {}): EvalSuiteTrendPoint => ({
  run_id: "r1",
  started_at: "2026-05-29T09:14:30Z",
  agent_version: 7,
  cost_usd: 0.23,
  metrics: { recall: 0.824, precision: 0.91, citation_accuracy: null },
  ...over,
});

describe("EvalTrendChart helpers", () => {
  it("maps points to rows in the given order and keeps a missing metric null", () => {
    const rows = trendRows([point({ run_id: "a" }), point({ run_id: "b", started_at: "2026-05-30T10:00:00Z" })]);
    expect(rows.map((r) => r.run_id)).toEqual(["a", "b"]);
    expect(rows[0]).toMatchObject({ recall: 0.824, citation_accuracy: null, version: 7, time: "2026-05-29 09:14" });
  });

  it("gives the tooltip the version, the time, the cost and whole-percent metrics", () => {
    const [row] = trendRows([point()]);
    expect(tooltipModel(row!)).toEqual({
      version: 7,
      time: "2026-05-29 09:14",
      cost: "$0.23",
      metrics: [
        { key: "recall", percent: 82 },
        { key: "precision", percent: 91 },
        { key: "citation_accuracy", percent: null },
      ],
    });
  });

  it("shows an unknown cost as an em dash, never $0", () => {
    const [row] = trendRows([point({ cost_usd: null })]);
    expect(tooltipModel(row!).cost).toBe("—");
  });
});
