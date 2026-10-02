"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import { graphLayout, ROW_HEIGHT, type GraphNodeKind } from "./graph-layout";
import { s } from "./styles";

const FILL: Record<GraphNodeKind, string> = {
  symbol: "var(--accent)",
  caller: "var(--text-primary)",
  endpoint: "var(--ok, var(--text-secondary))",
  cron: "var(--warn, var(--text-secondary))",
};

export function BlastGraph({ data }: { data: BlastRadius }) {
  const t = useTranslations("blast");
  const { nodes, edges, width, height } = graphLayout(data);
  if (nodes.length === 0) return <div style={s.muted}>{t("graph.empty")}</div>;

  const at = new Map(nodes.map((n) => [n.id, n]));
  return (
    <div style={s.graphWrap}>
      <div style={s.statLabel}>{t("graph.legend")}</div>
      <svg role="img" aria-label={t("graph.ariaLabel")} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {edges.map((e) => {
          const a = at.get(e.from);
          const b = at.get(e.to);
          if (!a || !b) return null;
          return (
            <line
              key={`${e.from}->${e.to}`}
              x1={a.x + 150}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--border)"
              strokeWidth={1}
            />
          );
        })}
        {nodes.map((n) => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={4} fill={FILL[n.kind]} />
            <text x={n.x + 10} y={n.y + ROW_HEIGHT / 8} fontSize={12} fill="var(--text-secondary)">
              {n.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
