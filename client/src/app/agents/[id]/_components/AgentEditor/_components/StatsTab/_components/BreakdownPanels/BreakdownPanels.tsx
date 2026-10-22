/* BreakdownPanels — the four Stats-tab panels under the tiles (spec 016, AC-1, AC-3, AC-35,
   AC-36, AC-41): one request, a 2 × 2 grid. Loading shows four skeletons, a failure shows a
   retry in each slot, and a 404 or a response that counted 0 runs renders nothing. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Card, SectionLabel, Skeleton, type IconName } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { browserTimeZone, type PeriodSel } from "@/lib/period";
import { useAgentStatsBreakdown } from "@/lib/hooks/agent-performance";
import { CategoryDonut } from "./CategoryDonut";
import { MemoryPanel } from "./MemoryPanel";
import { SeverityBars } from "./SeverityBars";
import { SkillsPanel } from "./SkillsPanel";
import { s } from "./styles";

const SLOTS: ReadonlyArray<{ key: "skills" | "memory" | "severity" | "category"; icon: IconName }> = [
  { key: "skills", icon: "Sparkles" },
  { key: "memory", icon: "Database" },
  { key: "severity", icon: "BarChart" },
  { key: "category", icon: "Tag" },
];

export function BreakdownPanels({ agentId, sel }: { agentId: string; sel: PeriodSel }) {
  const t = useTranslations("agentPerformance");
  const q = useAgentStatsBreakdown(agentId, sel);
  const tz = browserTimeZone();

  if (q.isLoading) {
    return (
      <div style={s.grid} aria-busy="true">
        {SLOTS.map((slot) => (
          <Skeleton key={slot.key} height={190} />
        ))}
      </div>
    );
  }
  if (q.error instanceof ApiError && q.error.status === 404) return null;
  if (q.isError || !q.data) {
    return (
      <div style={s.grid}>
        {SLOTS.map((slot) => (
          <Card key={slot.key} style={s.card}>
            <SectionLabel icon={slot.icon}>{t(`panels.${slot.key}.title`)}</SectionLabel>
            <div style={s.retry} role="alert">
              <span style={s.message}>{t("panels.loadError")}</span>
              <Button kind="secondary" icon="RefreshCw" onClick={() => q.refetch()}>
                {t("retry")}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    );
  }
  if (q.data.counted_runs === 0) return null;
  return (
    <div style={s.grid}>
      <SkillsPanel data={q.data} tz={tz} />
      <MemoryPanel data={q.data} tz={tz} />
      <SeverityBars data={q.data} tz={tz} />
      <CategoryDonut data={q.data} />
    </div>
  );
}
