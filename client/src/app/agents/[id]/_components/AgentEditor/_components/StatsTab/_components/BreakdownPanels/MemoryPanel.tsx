/* MemoryPanel — "Most-pulled memory" (spec 016, AC-12…AC-19). Entry text is untrusted
   PR-derived text: rendered as a text node only, truncated by CSS with the full text in `title`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, ProgressBar, SectionLabel } from "@devdigest/ui";
import type { AgentStatsBreakdown } from "@devdigest/shared/contracts/agent-performance.js";
import { formatDay, memoryView, shareValue, sharePercent } from "./helpers";
import { s } from "./styles";

export function MemoryPanel({ data, tz }: { data: AgentStatsBreakdown; tz: string }) {
  const t = useTranslations("agentPerformance");
  const view = memoryView(data);
  const before = "noDataBefore" in view ? view.noDataBefore : null;
  return (
    <Card style={s.card}>
      <SectionLabel icon="Database">{t("panels.memory.title")}</SectionLabel>
      <p style={s.caption}>{t("panels.memory.caption")}</p>
      {view.kind === "ciOnly" && <p style={s.message}>{t("panels.skills.ciOnly")}</p>}
      {view.kind === "none" && <p style={s.message}>{t("panels.memory.none")}</p>}
      {view.kind === "list" && (
        <>
          <ul style={s.rows}>
            {view.rows.map((row, i) => (
              <li key={`${i}-${row.pr ?? ""}-${row.text}`} style={s.row}>
                <span style={s.rowText} title={row.text}>
                  {row.text}
                  {row.pr != null && <span style={s.pr}>#{row.pr}</span>}
                </span>
                <div style={s.rowBar}>
                  <ProgressBar value={shareValue(row.runs, data.memory.denominator)} />
                </div>
                <span className="mono tnum" style={s.rowShare}>
                  {sharePercent(row.runs, data.memory.denominator)}
                </span>
              </li>
            ))}
          </ul>
          <p style={s.note}>{t("panels.memory.basedOn", { n: data.memory.denominator })}</p>
        </>
      )}
      {before && <p style={s.note}>{t("panels.skills.noDataBefore", { date: formatDay(before, tz) })}</p>}
    </Card>
  );
}
