/* Pure layout for the blast-radius graph: columns changed symbols | depth-1
   callers | depth-2 callers (only when present) | endpoints then crons.
   Deterministic integer coordinates; every column is vertically centred. */
import type { BlastRadius } from "@devdigest/shared";
import { symbolLabel } from "./helpers";

export type GraphNodeKind = "symbol" | "caller" | "endpoint" | "cron";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  /** Display text, truncated with `…` past MAX_LABEL. */
  label: string;
  /** Untruncated text (rendered as `<title>`). */
  fullLabel: string;
  x: number;
  y: number;
  width: number;
  height: number;
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

export const NODE_WIDTH = 160;
export const NODE_HEIGHT = 32;
export const COL_GAP = 90;
export const ROW_GAP = 16;
export const MAX_LABEL = 18;
const PAD = 16;

export function truncateLabel(text: string): string {
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text;
}

interface Draft {
  id: string;
  kind: GraphNodeKind;
  fullLabel: string;
  col: number;
  depth?: number;
}

export function graphLayout(data: BlastRadius): GraphLayout {
  const drafts = new Map<string, Draft>();
  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];
  const hasDepth2 = data.downstream.some((d) => d.callers.some((c) => c.depth >= 2));
  const depth2Col = hasDepth2 ? 2 : -1;
  const endpointCol = hasDepth2 ? 3 : 2;
  const kindOf = new Map(data.changed_symbols.map((c) => [c.name, c.kind]));

  function add(id: string, kind: GraphNodeKind, fullLabel: string, col: number, depth?: number): string {
    if (!drafts.has(id)) {
      const draft: Draft = { id, kind, fullLabel, col };
      if (depth !== undefined) draft.depth = depth;
      drafts.set(id, draft);
    }
    return id;
  }
  function link(from: string, to: string) {
    const key = `${from}->${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to });
  }

  for (const d of data.downstream) {
    const symId = add(`s:${d.symbol}`, "symbol", symbolLabel(d.symbol, kindOf.get(d.symbol)), 0);
    const direct = new Map<string, string>(); // depth-1 caller name → node id
    // D12 rows repeat a caller per call site; nodes are deduped by file#name.
    for (const c of d.callers.filter((x) => x.depth === 1)) {
      const id = add(`c:1:${c.file}#${c.name}`, "caller", c.name, 1, 1);
      direct.set(c.name, id);
      link(symId, id);
    }
    for (const c of d.callers.filter((x) => x.depth >= 2)) {
      const id = add(`c:2:${c.file}#${c.name}`, "caller", c.name, depth2Col, c.depth);
      link((c.via && direct.get(c.via)) || symId, id);
    }
    // Endpoints/crons are carried per group, not per caller: link them to the
    // group's direct callers (or to the symbol when it has none).
    const sources = direct.size > 0 ? [...direct.values()] : [symId];
    for (const e of d.endpoints_affected) {
      const id = add(`e:${e}`, "endpoint", e, endpointCol);
      for (const from of sources) link(from, id);
    }
    for (const k of d.crons_affected) {
      const id = add(`k:${k}`, "cron", k, endpointCol);
      for (const from of sources) link(from, id);
    }
  }

  // Within the last column endpoints come before crons.
  const ordered = [...drafts.values()].sort((a, b) =>
    a.col !== b.col ? a.col - b.col : a.kind === b.kind ? 0 : a.kind === "endpoint" ? -1 : b.kind === "endpoint" ? 1 : 0,
  );
  const cols = new Map<number, Draft[]>();
  for (const d of ordered) cols.set(d.col, [...(cols.get(d.col) ?? []), d]);
  const tallest = Math.max(0, ...[...cols.values()].map((c) => c.length));
  const innerHeight = tallest > 0 ? tallest * NODE_HEIGHT + (tallest - 1) * ROW_GAP : 0;

  const nodes: GraphNode[] = [];
  for (const [col, list] of [...cols.entries()].sort((a, b) => a[0] - b[0])) {
    const colHeight = list.length * NODE_HEIGHT + (list.length - 1) * ROW_GAP;
    const top = PAD + (innerHeight - colHeight) / 2;
    list.forEach((d, i) => {
      const node: GraphNode = {
        id: d.id,
        kind: d.kind,
        label: truncateLabel(d.fullLabel),
        fullLabel: d.fullLabel,
        x: PAD + col * (NODE_WIDTH + COL_GAP),
        y: Math.round(top + i * (NODE_HEIGHT + ROW_GAP)),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      };
      if (d.depth !== undefined) node.depth = d.depth;
      nodes.push(node);
    });
  }

  const colCount = nodes.length === 0 ? 0 : Math.max(...ordered.map((d) => d.col)) + 1;
  return {
    nodes,
    edges,
    width: PAD * 2 + colCount * NODE_WIDTH + Math.max(0, colCount - 1) * COL_GAP,
    height: PAD * 2 + innerHeight,
  };
}
