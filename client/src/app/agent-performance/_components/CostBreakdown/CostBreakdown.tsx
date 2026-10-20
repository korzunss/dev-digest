/* CostBreakdown — the AC-17 section: cost by agent and by model, each a donut with a legend,
   plus the M-4 note that reconciled billing data is not available. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PerfSegment } from "@devdigest/shared/contracts/agent-performance.js";
import { CostDonut } from "./CostDonut";
import { s } from "./styles";

function Chart({ title, segments, nullLabel }: { title: string; segments: PerfSegment[]; nullLabel: string }) {
  const t = useTranslations("agentPerformance");
  return (
    <section style={s.card} aria-label={title}>
      <h3 style={s.cardTitle}>{title}</h3>
      {segments.length === 0 ? (
        <span style={s.muted}>{t("breakdown.none")}</span>
      ) : (
        <CostDonut segments={segments} nullLabel={nullLabel} label={title} />
      )}
    </section>
  );
}

export function CostBreakdown({ byAgent, byModel }: { byAgent: PerfSegment[]; byModel: PerfSegment[] }) {
  const t = useTranslations("agentPerformance");
  return (
    <section style={s.section} aria-label={t("breakdown.title")}>
      <h2 style={s.heading}>
        <Icon.DollarSign size={14} />
        {t("breakdown.title")}
      </h2>
      <div style={s.charts}>
        <Chart title={t("breakdown.byAgent")} segments={byAgent} nullLabel={t("breakdown.deleted")} />
        <Chart title={t("breakdown.byModel")} segments={byModel} nullLabel={t("breakdown.unknownModel")} />
      </div>
      <span style={s.muted}>{t("cost.billingNote")}</span>
    </section>
  );
}
