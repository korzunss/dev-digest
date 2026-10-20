/* PerfEmptyState — "No successful runs in this period" (AC-18 / AC-25), with the failed-runs
   note (AC-8a) and the "Try 30 days — N runs" suggestion (AC-18a) when the caller has one. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { FailedRunsNote } from "./FailedRunsNote";
import { s } from "./styles";

export function PerfEmptyState({
  failedRuns,
  tryThirty,
}: {
  failedRuns: number;
  /** Set only when the period is not 30 days and 30 days has counted runs. */
  tryThirty?: { runs: number; onSelect: () => void };
}) {
  const t = useTranslations("agentPerformance");
  return (
    <div style={s.empty}>
      <div style={s.emptyTitle}>{t("empty.title")}</div>
      <div style={s.emptyBody}>{t("empty.body")}</div>
      <FailedRunsNote count={failedRuns} />
      {tryThirty && tryThirty.runs > 0 && (
        <Button kind="secondary" size="sm" onClick={tryThirty.onSelect}>
          {t("empty.tryThirty", { n: tryThirty.runs })}
        </Button>
      )}
    </div>
  );
}

export default PerfEmptyState;
