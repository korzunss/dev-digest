/* CostAmount — a money figure through `formatCostUsd` (spec 001), `~` when any part is an estimate (D9 A),
   with an optional provenance line (AC-M4). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PerfCostSplit } from "@devdigest/shared/contracts/agent-performance.js";
import { formatCostUsd } from "@/lib/format-cost";
import { provenanceOf } from "./helpers";
import { s } from "./styles";

export function CostAmount({
  value,
  split,
  showSplit = false,
}: {
  value: number | null;
  split: PerfCostSplit;
  /** Print the three-way split under the amount. */
  showSplit?: boolean;
}) {
  const t = useTranslations("agentPerformance");
  const source = provenanceOf(split);
  const amount = (
    <span className="tnum" title={source === "estimate" ? t("cost.estimateTooltip") : undefined}>
      {formatCostUsd(value, source)}
    </span>
  );
  if (!showSplit || value == null) return amount;
  const parts: string[] = [];
  if (split.api_usd > 0) parts.push(`${t("cost.providerReported")} ${formatCostUsd(split.api_usd)}`);
  if (split.estimate_usd > 0) parts.push(`${t("cost.estimate")} ${formatCostUsd(split.estimate_usd, "estimate")}`);
  if (split.unrecorded_usd > 0) parts.push(`${t("cost.notRecorded")} ${formatCostUsd(split.unrecorded_usd)}`);
  return (
    <span style={s.costWrap}>
      {amount}
      {parts.length > 0 && <span style={s.costSplit}>{parts.join(" · ")}</span>}
    </span>
  );
}

export default CostAmount;
