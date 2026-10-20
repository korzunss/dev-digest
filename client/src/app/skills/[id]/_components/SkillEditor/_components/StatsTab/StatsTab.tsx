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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Donut, EmptyState, ErrorState, Icon, MetricCard, SectionLabel, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { PeriodControl } from "@/components/period-control";
import { parsePeriod, type PeriodSel } from "@/lib/period";
import { useSkillStats } from "../../../../../../../lib/hooks/skills";
import { formatCount, formatRate } from "../../../../../_components/SkillCard";
import { DONUT_SIZE } from "./constants";
import { donutSegments, formatSegmentValue, hasNothingToShow } from "./helpers";
import { s } from "./styles";

function periodName(sel: PeriodSel, label: (kind: "1d" | "30d") => string): string {
  return sel.period === "custom" ? `${sel.from} – ${sel.to}` : label(sel.period);
}

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const tp = useTranslations("agentPerformance");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const sel = parsePeriod(search);
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skill.id, sel);

  const setPeriod = (next: PeriodSel) => {
    // Keep `tab` (and anything else); only the period params change.
    const sp = new URLSearchParams(search.toString());
    for (const key of ["period", "from", "to"]) sp.delete(key);
    sp.set("period", next.period);
    if (next.period === "custom" && next.from && next.to) {
      sp.set("from", next.from);
      sp.set("to", next.to);
    }
    router.replace(`${pathname}?${sp.toString()}`);
  };

  // The period control is part of every state, so a failed or empty period can be changed (AC-42).
  const header = (
    <div style={s.header}>
      <PeriodControl value={sel} onChange={setPeriod} />
    </div>
  );

  if (isLoading) {
    return (
      <div style={s.wrap}>
        {header}
        <Skeleton height={180} />
      </div>
    );
  }
  if (isError || !stats) {
    return (
      <div style={s.wrap}>
        {header}
        <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />
      </div>
    );
  }
  if (hasNothingToShow(stats)) {
    return (
      <div style={s.wrap}>
        {header}
        <EmptyState icon="BarChart" title={t("stats.empty.title")} body={t("stats.empty.body")} />
      </div>
    );
  }

  // No local run in the period carried the skill: nothing was measured, so no 0% and no 0 (AC-46).
  const measured = stats.runs_with_skill > 0;
  const segments = donutSegments(stats.findings_by_category);

  return (
    <div style={s.wrap}>
      {header}
      <div style={s.tiles}>
        <div style={s.tile}>
          <MetricCard
            label={t("stats.usedBy")}
            value={t("stats.agentsValue", { count: formatCount(stats.agent_count) })}
          />
        </div>
        <div style={s.tile}>
          <MetricCard label={t("stats.pullFrequency")} value={formatRate(measured ? stats.pull_rate : null)} />
        </div>
        <div style={s.tile}>
          <MetricCard label={t("stats.acceptRate")} value={formatRate(measured ? stats.accept_rate : null)} />
        </div>
        <div style={s.tile}>
          <div style={s.tileColumn}>
            <MetricCard label={t("stats.findings")} value={measured ? formatCount(stats.findings_30d) : "—"} />
            <span style={s.tileCaption}>{periodName(sel, (kind) => tp(`period.${kind}`))}</span>
          </div>
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
          {!measured ? (
            <div style={s.panelEmpty}>{t("stats.noFindingsInPeriod")}</div>
          ) : segments.length === 0 ? (
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
