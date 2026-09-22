/* StatsTab — how this skill is doing.

   Two kinds of number live here and they must not be confused. `agent_count` /
   `agents` are EXACT — they count links. Everything else is measured over the
   runs whose prompt contained this skill, which says the skill was present when
   a finding appeared, not that it caused one; the caveat line under the tiles
   is the copy that says so and is as load-bearing as the figures.

   `null` is not zero: an unmeasured rate renders an em dash, a measured 0
   renders `0%`. Both come from the SkillCard formatters so the rule is stated
   once. (Note the asymmetry: `SkillStats.agent_count` is non-nullable, while
   `Skill.agent_count` on the card is nullish.) */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Donut, EmptyState, ErrorState, Icon, MetricCard, SectionLabel, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "../../../../../../../lib/hooks/skills";
import { formatCount, formatRate } from "../../../../../_components/SkillCard";
import { DONUT_SIZE } from "./constants";
import { donutSegments, formatSegmentValue, hasNothingToShow } from "./helpers";
import { s } from "./styles";

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skill.id);

  if (isLoading) return <Skeleton height={180} />;
  if (isError || !stats) return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;
  if (hasNothingToShow(stats)) {
    return <EmptyState icon="BarChart" title={t("stats.empty.title")} body={t("stats.empty.body")} />;
  }

  const segments = donutSegments(stats.findings_by_category);

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        <div style={s.tile}>
          <MetricCard
            label={t("stats.usedBy")}
            value={t("stats.agentsValue", { count: formatCount(stats.agent_count) })}
          />
        </div>
        <div style={s.tile}>
          <MetricCard label={t("stats.pullFrequency")} value={formatRate(stats.pull_rate)} />
        </div>
        <div style={s.tile}>
          <MetricCard label={t("stats.acceptRate")} value={formatRate(stats.accept_rate)} />
        </div>
        <div style={s.tile}>
          <MetricCard label={t("stats.findings30d")} value={formatCount(stats.findings_30d)} />
        </div>
      </div>

      <p style={s.caveat}>{t("stats.caveat")}</p>

      <div style={s.panels}>
        <div style={s.panel}>
          <SectionLabel icon="Users">{t("stats.agentsUsing")}</SectionLabel>
          {stats.agents.length === 0 ? (
            <div style={s.panelEmpty}>{tc("states.empty")}</div>
          ) : (
            <div style={s.agentList}>
              {stats.agents.map((a) => (
                <a key={a.id} href={`/agents/${a.id}?tab=skills`} style={s.agentRow}>
                  <Icon.Sparkles size={14} style={{ color: "var(--accent)" }} />
                  <span style={s.agentName}>{a.name}</span>
                  <span style={s.agentOpen}>
                    {t("stats.open")}
                    <Icon.ArrowRight size={12} />
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>

        <div style={s.panel}>
          <SectionLabel icon="BarChart">{t("stats.findingsByCategory")}</SectionLabel>
          {segments.length === 0 ? (
            // Nothing to draw. An empty ring would read as "measured, all
            // zero"; this says there is no breakdown yet without hiding the
            // tiles, which do have something to say.
            <div style={s.panelEmpty}>{tc("states.empty")}</div>
          ) : (
            <Donut segments={segments} size={DONUT_SIZE} formatValue={formatSegmentValue} />
          )}
        </div>
      </div>
    </div>
  );
}
