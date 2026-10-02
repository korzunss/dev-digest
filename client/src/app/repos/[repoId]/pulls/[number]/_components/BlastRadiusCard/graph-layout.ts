/* Pure layout for the blast-radius graph: columns symbols | depth-1 callers |
   depth-2 callers | endpoints + crons. Deterministic integer coordinates. */
import type { BlastRadius } from "@devdigest/shared";

export type GraphNodeKind = "symbol" | "caller" | "endpoint" | "cron";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  x: number;
  y: number;
  depth?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

export const COL_WIDTH = 220;
export const ROW_HEIGHT = 28;
const PAD = 16;
const COLUMNS = 4;

export function graphLayout(data: BlastRadius): GraphLayout {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const next = [0, 0, 0, 0]; // next free row per column

  function place(col: number, id: string, kind: GraphNodeKind, label: string, depth?: number): string {
    const node: GraphNode = { id, kind, label, x: PAD + col * COL_WIDTH, y: PAD + next[col]! * ROW_HEIGHT };
    if (depth !== undefined) node.depth = depth;
    next[col] = next[col]! + 1;
    nodes.push(node);
    return id;
  }

  for (const d of data.downstream) {
    const symId = place(0, `s:${d.symbol}`, "symbol", d.symbol);
    const callerIds = new Map<string, string>(); // caller name (depth 1) → node id
    const depth1: string[] = [];

    for (const c of d.callers.filter((x) => x.depth === 1)) {
      const id = place(1, `c:${d.symbol}:${c.file}:${c.line}:${c.name}`, "caller", c.name, 1);
      callerIds.set(c.name, id);
      depth1.push(id);
      edges.push({ from: symId, to: id });
    }
    for (const c of d.callers.filter((x) => x.depth >= 2)) {
      const id = place(2, `c:${d.symbol}:${c.file}:${c.line}:${c.name}`, "caller", c.name, c.depth);
      edges.push({ from: (c.via && callerIds.get(c.via)) || symId, to: id });
    }

    // The contract carries endpoints/crons per group, not per caller file: link
    // them to the group's direct callers (or the symbol when it has none).
    const sources = depth1.length > 0 ? depth1 : [symId];
    for (const e of d.endpoints_affected) {
      const id = place(3, `e:${d.symbol}:${e}`, "endpoint", e);
      for (const from of sources) edges.push({ from, to: id });
    }
    for (const k of d.crons_affected) {
      const id = place(3, `k:${d.symbol}:${k}`, "cron", k);
      for (const from of sources) edges.push({ from, to: id });
    }

    // keep groups visually separate: the next group starts below the tallest column
    const row = Math.max(...next);
    next.fill(row);
  }

  const rows = Math.max(0, ...nodes.map((n) => (n.y - PAD) / ROW_HEIGHT + 1));
  return { nodes, edges, width: PAD * 2 + (COLUMNS - 1) * COL_WIDTH + 180, height: PAD * 2 + rows * ROW_HEIGHT };
}
