"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import { graphLayout, type GraphNode, type GraphNodeKind } from "./graph-layout";
import { s } from "./styles";

const STROKE: Record<GraphNodeKind, string> = {
  symbol: "var(--accent)",
  caller: "var(--border)",
  endpoint: "var(--accent)",
  cron: "var(--warn)",
};

const LEGEND: { kind: GraphNodeKind; key: "legendSymbol" | "legendCaller" | "legendEndpoint" | "legendCron" }[] = [
  { kind: "symbol", key: "legendSymbol" },
  { kind: "caller", key: "legendCaller" },
  { kind: "endpoint", key: "legendEndpoint" },
  { kind: "cron", key: "legendCron" },
];

function edgePath(a: GraphNode, b: GraphNode): string {
  const x1 = a.x + a.width;
  const y1 = a.y + a.height / 2;
  const x2 = b.x;
  const y2 = b.y + b.height / 2;
  const mid = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`;
}

export function BlastGraph({ data }: { data: BlastRadius }) {
  const t = useTranslations("blast");
  const { nodes, edges, width, height } = graphLayout(data);
  if (nodes.length === 0) return <div style={s.muted}>{t("graph.empty")}</div>;

  const at = new Map(nodes.map((n) => [n.id, n]));
  return (
    <div>
      <div style={s.graphWrap}>
        <svg role="img" aria-label={t("graph.ariaLabel")} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {edges.map((e) => {
            const a = at.get(e.from);
            const b = at.get(e.to);
            if (!a || !b) return null;
            return <path key={`${e.from}->${e.to}`} d={edgePath(a, b)} fill="none" stroke="var(--border)" strokeWidth={1.5} />;
          })}
          {nodes.map((n) => (
            <g key={n.id}>
              <title>{n.fullLabel}</title>
              <rect
                x={n.x}
                y={n.y}
                width={n.width}
                height={n.height}
                rx={6}
                fill="var(--bg-elevated)"
                stroke={STROKE[n.kind]}
                strokeWidth={n.kind === "caller" ? 1 : 1.5}
              />
              <text
                x={n.x + n.width / 2}
                y={n.y + n.height / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12}
                fontFamily="var(--font-mono, monospace)"
                fill="var(--text-primary)"
              >
                {n.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div style={s.legend}>
        {LEGEND.map(({ kind, key }) => (
          <span key={kind} style={s.legendItem}>
            <span style={s.legendDot(STROKE[kind])} />
            {t(`graph.${key}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
