/* SkillsPanel — "Most-used skills" (spec 016, AC-6…AC-11): the share of the agent's
   local runs whose prompt included each skill. Names are rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, Icon, ProgressBar, SectionLabel } from "@devdigest/ui";
import type { AgentStatsBreakdown } from "@devdigest/shared/contracts/agent-performance.js";
import { formatDay, shareValue, sharePercent, skillsView } from "./helpers";
import { s } from "./styles";

export function SkillsPanel({ data, tz }: { data: AgentStatsBreakdown; tz: string }) {
  const t = useTranslations("agentPerformance");
  const view = skillsView(data);
  const before = "noDataBefore" in view ? view.noDataBefore : null;
  return (
    <Card style={s.card}>
      <SectionLabel icon="Sparkles">{t("panels.skills.title")}</SectionLabel>
      <p style={s.caption}>{t("panels.skills.caption")}</p>
      {view.kind === "ciOnly" && <p style={s.message}>{t("panels.skills.ciOnly")}</p>}
      {view.kind === "notRecorded" && <p style={s.message}>{t("panels.skills.notRecorded")}</p>}
      {view.kind === "noSkills" && (
        <>
          <p style={s.message}>{t("panels.skills.noSkills")}</p>
          <p style={s.note}>{t("panels.skills.basedOn", { n: data.skills.denominator })}</p>
        </>
      )}
      {view.kind === "list" && (
        <>
          <ul style={s.rows}>
            {view.rows.map((row) => (
              <li key={row.skill_id} style={s.row}>
                <span style={s.rowText} title={row.name}>
                  {row.name}
                </span>
                <div style={s.rowBar}>
                  <ProgressBar value={shareValue(row.runs, data.skills.denominator)} />
                </div>
                <span className="mono tnum" style={s.rowShare}>
                  {sharePercent(row.runs, data.skills.denominator)}
                </span>
              </li>
            ))}
          </ul>
          <p style={s.note}>{t("panels.skills.basedOn", { n: data.skills.denominator })}</p>
        </>
      )}
      {before && <p style={s.note}>{t("panels.skills.noDataBefore", { date: formatDay(before, tz) })}</p>}
    </Card>
  );
}
