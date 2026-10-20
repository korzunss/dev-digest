/* CategoryDonut — "Findings by category" (spec 016, AC-24…AC-26): a local recharts ring with the
   total in the centre and a legend of "count · percent". Unknown categories keep their stored
   name and the fallback colour. */
"use client";

import React from "react";
import { PieChart, Pie, Cell } from "recharts";
import { useTranslations } from "next-intl";
import { Card, SectionLabel } from "@devdigest/ui";
import type { AgentStatsBreakdown } from "@devdigest/shared/contracts/agent-performance.js";
import { formatCount } from "@/lib/finding-category";
import { categoryLegend, findingsView } from "./helpers";
import { s } from "./styles";

const SIZE = 140;
const STROKE = 22;

export function CategoryDonut({ data }: { data: AgentStatsBreakdown }) {
  const t = useTranslations("agentPerformance");
  const view = findingsView(data);
  const { total, by_category } = data.findings;
  const legend = categoryLegend(by_category, total);
  const drawn = legend.filter((e) => e.count > 0);
  return (
    <Card style={s.card}>
      <SectionLabel icon="Tag">{t("panels.category.title")}</SectionLabel>
      {view === "ciOnly" && <p style={s.message}>{t("panels.findings.ciOnly")}</p>}
      {view === "none" && <p style={s.message}>{t("panels.findings.none")}</p>}
      {view === "charts" && (
        <div style={s.donutBody}>
          <div style={s.donutWrap} role="img" aria-label={t("panels.category.title")}>
            <PieChart width={SIZE} height={SIZE}>
              <Pie
                data={drawn.map((e) => ({ name: e.category, value: e.count }))}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={(SIZE - STROKE) / 2 - STROKE / 2}
                outerRadius={(SIZE - STROKE) / 2 + STROKE / 2}
                startAngle={90}
                endAngle={-270}
                isAnimationActive={false}
                stroke="none"
              >
                {drawn.map((e) => (
                  <Cell key={e.category} fill={e.color} />
                ))}
              </Pie>
            </PieChart>
            <div style={s.donutCentre}>
              <span className="tnum" style={s.donutTotal}>
                {formatCount(total)}
              </span>
              <span style={s.donutCaption}>{t("panels.category.centreLabel")}</span>
            </div>
          </div>
          <ul style={s.catLegend}>
            {legend.map((e) => (
              <li key={e.category} style={s.catRow}>
                <span style={{ ...s.swatch, background: e.color }} />
                <span style={s.catName} title={e.category}>
                  {e.category}
                </span>
                <span className="mono tnum" style={s.catValue}>
                  {formatCount(e.count)} · {e.percent}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
