/* CostDelta — current minus previous period (AC-M13). A decrease is favourable, an increase
   unfavourable; omitted when the previous period has no counted run with a known cost. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PerfCostSplit } from "@devdigest/shared/contracts/agent-performance.js";
import { formatCostUsd } from "@/lib/format-cost";
import { costDeltaOf, provenanceOf } from "./helpers";
import { s } from "./styles";

export function CostDelta({
  current,
  previous,
  previousKnownRuns,
  split,
}: {
  current: number | null;
  previous: number | null;
  previousKnownRuns: number;
  /** The current figure's split: a delta over an estimate-tainted figure wears the `~` too (D9 A). */
  split: PerfCostSplit;
}) {
  const t = useTranslations("agentPerformance");
  const delta = costDeltaOf(current, previous, previousKnownRuns);
  if (delta == null) return null;
  const amount = formatCostUsd(Math.abs(delta), provenanceOf(split));
  const text = delta < 0 ? `−${amount}` : delta > 0 ? `+${amount}` : amount;
  const style = delta < 0 ? s.deltaFavourable : delta > 0 ? s.deltaUnfavourable : s.deltaNeutral;
  const label = delta < 0 ? t("cost.deltaLower", { amount }) : delta > 0 ? t("cost.deltaHigher", { amount }) : undefined;
  return (
    <span className="tnum" style={style} title={label} aria-label={label}>
      {text}
    </span>
  );
}

export default CostDelta;
