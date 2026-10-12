/* CaseRunResult — the last run in one line: "Last run passed · expected N,
   got M · 1.2s · $0.0042", marked stale once the form was edited after it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalCaseResult } from "@devdigest/shared";
import { costLabel, secondsLabel } from "./helpers";
import { s } from "./styles";

export function CaseRunResult({ result, stale }: { result: EvalCaseResult | null; stale: boolean }) {
  const t = useTranslations("eval.modal");
  if (!result) return <div style={s.muted}>{t("resultNone")}</div>;

  return (
    <div style={s.resultLine}>
      <strong>{t(`lastRun.${result.status}`)}</strong>
      <span>
        {t("resultLine", {
          expected: result.expected_count,
          actual: result.actual_count,
          duration: secondsLabel(result.duration_ms),
          cost: costLabel(result.cost_usd),
        })}
      </span>
      {result.error && <span>{t("resultError", { error: result.error })}</span>}
      {stale && <span style={s.stale}>{t("stale")}</span>}
    </div>
  );
}
