/* CaseRow — one eval case in an Evals tab, agent or skill (AC-19): name,
   expectation summary, severity · category badge, last result, the skill
   version it ran against (AC-83), and the run / edit / delete actions. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { EvalSuiteCase } from "@devdigest/shared";
import { caseRecall, expectationBadge } from "./helpers";
import { s } from "./styles";

const STATUS_COLOR = { passed: "var(--ok)", failed: "var(--crit)", errored: "var(--warn)" } as const;
const STATUS_ICON = { passed: Icon.CheckCircle, failed: Icon.XCircle, errored: Icon.XCircle } as const;

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
  const skillT = useTranslations("eval.skillTab");
  const r = c.last_result;
  const badge = expectationBadge(c);
  const recall = caseRecall(r);
  const summary =
    c.expected.length === 0 && !r
      ? t("expectedZero")
      : t("expectedSummary", { expected: c.expected.length, actual: r ? r.actual_count : "–" });

  const StatusIcon = r ? STATUS_ICON[r.status] : null;
  const statusLabel = r
    ? t(r.status === "passed" ? "resultPassed" : r.status === "failed" ? "resultFailed" : "resultErrored") +
      (recall != null ? t("recallSuffix", { recall }) : "")
    : t("neverRun");

  return (
    <div style={s.row}>
      <span style={s.statusIcon} role="img" aria-label={statusLabel} title={statusLabel}>
        {r && StatusIcon ? <StatusIcon size={16} style={{ color: STATUS_COLOR[r.status] }} /> : <span style={s.statusDot} />}
      </span>
      <div style={s.rowMain}>
        <div style={s.rowName}>{c.name}</div>
        <div style={s.rowSummary}>
          {r ? summary : t("neverRun")}
          {r?.skill_version != null && ` · ${skillT("ranOn", { version: r.skill_version })}`}
        </div>
      </div>
      <Badge mono>{badge ?? t("emptyBadge")}</Badge>
      <div style={s.rowActions}>
        <Button kind="ghost" size="sm" icon="Play" style={s.actionBtn} aria-label={t("run")} title={t("run")} disabled={busy} onClick={onRun} />
        <Button kind="ghost" size="sm" icon="Edit" style={s.actionBtn} aria-label={t("edit")} title={t("edit")} onClick={onEdit} />
        <Button kind="ghost" size="sm" icon="Trash" style={s.actionBtn} aria-label={t("delete")} title={t("delete")} onClick={onDelete} />
      </div>
    </div>
  );
}
