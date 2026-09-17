/* RunCostBadge — what a run (or a whole PR) cost. Spec 001. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { CostSource } from "@devdigest/shared";
import { formatCostUsd, formatTokenTotal } from "@/lib/format-cost";
import { s } from "./styles";

/**
 * Lives in `src/components/` rather than beside a route because two routes need
 * it — the PR list's COST column and the PR detail's run timeline — and they
 * must not drift apart on precision or on the `~` estimate marker.
 *
 *  - `cell`   the PR-list column: "$0.014" / "~$0.014" / "—"
 *  - `inline` the timeline line under a run's time: "9,119 tok · $0.0013"
 *
 * The trace drawer deliberately does NOT use this: it needs the drawer's own
 * <Stat> tile, so it calls `formatCostUsd` directly — same string, own chrome.
 */
export function RunCostBadge({
  costUsd,
  costSource,
  tokensIn,
  tokensOut,
  variant = "cell",
}: {
  costUsd: number | null | undefined;
  costSource?: CostSource | null;
  /** Only read by `variant="inline"`; omit both to show cost alone. */
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: "cell" | "inline";
}) {
  const t = useTranslations("prReview");
  const cost = formatCostUsd(costUsd, costSource);
  // An estimate explains itself on hover — the `~` alone doesn't say why.
  const title = costSource === "estimate" ? t("cost.estimateTooltip") : undefined;

  if (variant === "inline") {
    const tokens = formatTokenTotal(tokensIn, tokensOut);
    return (
      <span className="tnum" style={s.inline} title={title}>
        {tokens != null ? `${t("cost.tokens", { tokens })} · ` : ""}
        {cost}
      </span>
    );
  }

  return (
    <span className="tnum" style={s.cell(costUsd != null)} title={title}>
      {cost}
    </span>
  );
}

export default RunCostBadge;
