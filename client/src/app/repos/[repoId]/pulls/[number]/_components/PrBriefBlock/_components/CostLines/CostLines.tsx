/* CostLines — one line per present usage source under the PR score: the latest
   review run and the brief's own model call. A missing source omits its line;
   unknown values inside a present source read "—" (AC-48, AC-50). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BriefUsage } from "@devdigest/shared";
import { formatCostUsd, formatTokenFlow } from "@/lib/format-cost";
import type { UsageValues } from "../../helpers";
import { s } from "../../styles";

function CostLine({ label, usage }: { label: string; usage: UsageValues }) {
  return (
    <div style={s.costLine}>
      <span style={s.costLabel}>{label}</span>
      <span className="mono tnum">{formatCostUsd(usage.cost_usd, usage.cost_source)}</span>
      <span className="mono tnum" style={s.costFlow}>
        {formatTokenFlow(usage.tokens_in, usage.tokens_out)}
      </span>
    </div>
  );
}

export function CostLines({ review, brief }: { review: UsageValues | null; brief: BriefUsage | null | undefined }) {
  const t = useTranslations("brief.prBrief.cost");
  if (!review && !brief) return null;
  return (
    <div style={s.costLines}>
      {review && <CostLine label={t("review")} usage={review} />}
      {brief && <CostLine label={t("brief")} usage={brief} />}
    </div>
  );
}
