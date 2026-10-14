/* EvalTrendChart — one point per completed suite run, one line each for recall,
   precision and citation accuracy, with a tooltip of version, time and cost
   (AC-49, D8-A). Built on Recharts directly because the vendored `LineChart`
   has no tooltip and is not edited. */
"use client";

import React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslations } from "next-intl";
import type { EvalSuiteTrendPoint } from "@devdigest/shared";
import { METRIC_COLORS } from "../../../helpers";
import { tooltipModel, trendRows, type TrendRow } from "./helpers";

const LINES = [
  { key: "recall" },
  { key: "precision" },
  { key: "citation_accuracy" },
] as const;

const TOOLTIP_LABEL = { recall: "recall", precision: "precision", citation_accuracy: "citation" } as const;

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendRow }[] }) {
  const t = useTranslations("eval.detail");
  const legend = useTranslations("eval.dashboard.legend");
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  const m = tooltipModel(row);
  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "8px 10px", fontSize: 12.5 }}>
      <div style={{ fontWeight: 700 }}>{t("tooltipVersion", { version: m.version })}</div>
      <div style={{ color: "var(--text-muted)" }}>{m.time}</div>
      <div style={{ color: "var(--text-muted)" }}>{t("tooltipCost", { cost: m.cost })}</div>
      {m.metrics.map((x) => (
        <div key={x.key} style={{ color: METRIC_COLORS[x.key] }}>
          {legend(TOOLTIP_LABEL[x.key])} {x.percent == null ? t("na") : `${x.percent}%`}
        </div>
      ))}
    </div>
  );
}

export function EvalTrendChart({ trend, height = 240 }: { trend: EvalSuiteTrendPoint[]; height?: number }) {
  const rows = React.useMemo(() => trendRows(trend), [trend]);
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 10, right: 14, bottom: 4, left: -10 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="run_id" hide />
          <YAxis
            domain={[0, 1]}
            tick={{ fontSize: 12, fill: "var(--text-muted)" }}
            tickFormatter={(v: number) => v.toFixed(1)}
            axisLine={false}
            tickLine={false}
            width={38}
          />
          <Tooltip content={<TrendTooltip />} />
          {LINES.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              stroke={METRIC_COLORS[l.key]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
