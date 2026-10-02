import { describe, it, expect } from "vitest";
import type { BlastRadius } from "@devdigest/shared";
import { graphLayout } from "./graph-layout";

const data: BlastRadius = {
  changed_symbols: [{ name: "fmt", file: "a.ts", kind: "function", rank: 1 }],
  downstream: [
    {
      symbol: "fmt",
      rank: 1,
      callers: [
        { name: "list", file: "b.ts", line: 1, depth: 1, via: null },
        { name: "render", file: "c.ts", line: 2, depth: 2, via: "list" },
      ],
      endpoints_affected: ["GET /x"],
      crons_affected: ["0 3 * * *"],
    },
  ],
  summary: "",
  degraded: false,
  reason: null,
  limits: { callers_per_symbol: 20, depth: 2 },
};

describe("graphLayout", () => {
  it("makes a node per symbol, caller, endpoint and cron, and links depth-2 to its via", () => {
    const g = graphLayout(data);
    expect(g.nodes.map((n) => n.kind).sort()).toEqual(["caller", "caller", "cron", "endpoint", "symbol"]);
    const list = g.nodes.find((n) => n.label === "list")!;
    const render = g.nodes.find((n) => n.label === "render")!;
    expect(g.edges).toContainEqual({ from: list.id, to: render.id });
    const cron = g.nodes.find((n) => n.kind === "cron")!;
    const ep = g.nodes.find((n) => n.kind === "endpoint")!;
    expect(cron.y).toBeGreaterThan(ep.y);
    expect(graphLayout(data)).toEqual(g);
  });

  it("is empty for no downstream", () => {
    expect(graphLayout({ ...data, downstream: [] }).nodes).toEqual([]);
  });
});
