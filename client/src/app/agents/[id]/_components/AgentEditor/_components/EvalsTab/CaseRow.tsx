/* CaseRow — one eval case in the Evals tab (AC-19): name, expectation summary,
   severity · category badge, last result, and the run / edit / delete actions. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { EvalSuiteCase } from "@devdigest/shared";
import { caseRecall, expectationBadge } from "./helpers";
import { s } from "./styles";

const STATUS_COLOR = { passed: "var(--ok)", failed: "var(--crit)", errored: "var(--warn)" } as const;

export function CaseRow({
  c,
  busy,
  onRun,
  onEdit,
  onDelete,
}: {
  c: EvalSuiteCase;
  /** This case (or the whole suite) is running. */
  busy: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eval.evalsTab");
  const r = c.last_result;
  const badge = expectationBadge(c);
  const recall = caseRecall(r);
  const summary =
    c.expected.length === 0 && !r
      ? t("expectedZero")
      : t("expectedSummary", { expected: c.expected.length, actual: r ? r.actual_count : "–" });

  return (
    <div style={s.row}>
      <div style={s.rowMain}>
        <div style={s.rowName}>{c.name}</div>
        <div style={s.rowSummary}>{summary}</div>
      </div>
      <Badge mono>{badge ?? t("emptyBadge")}</Badge>
      {r ? (
        <Badge color={STATUS_COLOR[r.status]}>
          {t(r.status === "passed" ? "resultPassed" : r.status === "failed" ? "resultFailed" : "resultErrored")}
          {recall != null && t("recallSuffix", { recall })}
        </Badge>
      ) : (
        <Badge color="var(--text-muted)">{t("neverRun")}</Badge>
      )}
      <div style={s.rowActions}>
        <Button kind="secondary" size="sm" icon="Play" disabled={busy} onClick={onRun}>
          {busy ? t("running") : t("run")}
        </Button>
        <Button kind="ghost" size="sm" icon="Edit" onClick={onEdit}>
          {t("edit")}
        </Button>
        <Button kind="ghost" size="sm" icon="Trash" onClick={onDelete}>
          {t("delete")}
        </Button>
      </div>
    </div>
  );
}
