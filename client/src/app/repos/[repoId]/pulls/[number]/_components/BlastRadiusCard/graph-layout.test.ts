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
    expect(g.nodes.find((n) => n.kind === "symbol")!.label).toBe("fmt()");
    expect(graphLayout(data)).toEqual(g);
  });

  it("dedupes two call sites of one caller into one node", () => {
    const g = graphLayout({
      ...data,
      downstream: [
        {
          ...data.downstream[0]!,
          callers: [
            { name: "list", file: "b.ts", line: 1, depth: 1, via: null },
            { name: "list", file: "b.ts", line: 9, depth: 1, via: null },
          ],
        },
      ],
    });
    expect(g.nodes.filter((n) => n.kind === "caller")).toHaveLength(1);
  });

  it("omits the depth-2 column without depth-2 callers", () => {
    const only1 = { ...data.downstream[0]!, callers: [data.downstream[0]!.callers[0]!] };
    const g = graphLayout({ ...data, downstream: [only1] });
    const xs = new Set(g.nodes.map((n) => n.x));
    expect(xs.size).toBe(3);
  });

  it("truncates long labels with an ellipsis and keeps the full text", () => {
    const long = "averyveryverylongfunctionname";
    const g = graphLayout({
      ...data,
      downstream: [{ ...data.downstream[0]!, callers: [{ name: long, file: "b.ts", line: 1, depth: 1, via: null }] }],
    });
    const n = g.nodes.find((x) => x.kind === "caller")!;
    expect(n.label.endsWith("…")).toBe(true);
    expect(n.fullLabel).toBe(long);
  });

  it("starts every edge at the right edge of its source", () => {
    const g = graphLayout(data);
    const at = new Map(g.nodes.map((n) => [n.id, n]));
    for (const e of g.edges) {
      const a = at.get(e.from)!;
      const b = at.get(e.to)!;
      expect(a.x + a.width).toBeLessThan(b.x);
    }
  });

  it("is empty for no downstream", () => {
    expect(graphLayout({ ...data, downstream: [] }).nodes).toEqual([]);
  });
});
