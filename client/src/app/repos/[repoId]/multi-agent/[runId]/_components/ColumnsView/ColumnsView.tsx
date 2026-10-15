/* ColumnsView — one column per agent of the run (spec 013, AC-38/39): identity,
   name, status, duration, cost, score ring, failure reason, findings, "View
   trace" and the findings count. Every model-written text is rendered as plain
   text. Each column scrolls on its own. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore, Icon } from "@devdigest/ui";
import type { AgentColumn, Severity } from "@devdigest/shared";
import { AgentIdentity, agentIdentity } from "@/components/agent-identity";
import { formatCostUsd } from "@/lib/format-cost";
import { SEVERITY_META } from "@/lib/severity";
import { AlsoFlaggedBy } from "../AlsoFlaggedBy";
import { s } from "./styles";

const SEVERITY_WORD: Record<Severity, "critical" | "warning" | "suggestion"> = {
  CRITICAL: "critical",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};

function seconds(ms: number | null): string | null {
  return ms == null ? null : `${(ms / 1000).toFixed(1)}s`;
}

function Column({
  column,
  columns,
  onViewTrace,
}: {
  column: AgentColumn;
  columns: AgentColumn[];
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("runs");
  const name = column.agent_name ?? t("column.deletedAgent");
  const status = t(`column.status.${column.status}`);
  const { color } = agentIdentity(column.agent_name);
  const duration = seconds(column.duration_ms);
  const cost = column.cost_usd != null ? formatCostUsd(column.cost_usd, column.cost_source) : null;
  const meta = [column.score != null ? status : null, duration, cost].filter(Boolean).join(" · ");

  return (
    <section style={s.column(color)} aria-label={name}>
      <div style={s.head}>
        <AgentIdentity name={column.agent_name} size={30} />
        <div style={s.headText}>
          <div style={s.name}>{name}</div>
          {meta && <div style={s.meta}>{meta}</div>}
        </div>
        {column.score != null ? (
          <CircularScore score={column.score} size={44} />
        ) : (
          <div style={s.emptyRing} data-testid="empty-score-ring">
            {status}
          </div>
        )}
      </div>

      {column.error && <div style={s.error}>{column.error}</div>}

      <div style={s.body}>
        {column.findings.length === 0 && column.status === "done" && (
          <div style={s.none}>{t("column.noFindings")}</div>
        )}
        {column.findings.map((f) => {
          const meta = SEVERITY_META[f.severity];
          const Ico = meta ? Icon[meta.icon] : null;
          const word = SEVERITY_WORD[f.severity];
          return (
            <div key={f.id} style={s.finding(meta?.color ?? "var(--text-muted)")}>
              <div style={s.sevRow(meta?.color ?? "var(--text-muted)")}>
                {Ico && <Ico size={12} />}
                <span>{word ? t(`severity.${word}`) : f.severity}</span>
              </div>
              <div style={s.title}>{f.title}</div>
              <div style={s.loc}>
                {f.file}:{f.start_line}
              </div>
              <AlsoFlaggedBy runIds={f.also_flagged_by} columns={columns} />
            </div>
          );
        })}
      </div>

      <div style={s.foot}>
        <button type="button" style={s.trace} onClick={() => onViewTrace(column.run_id)}>
          {t("viewTrace")}
        </button>
        <span>{t("column.findingsCount", { count: column.findings.length })}</span>
      </div>
    </section>
  );
}

export function ColumnsView({
  columns,
  onViewTrace,
}: {
  columns: AgentColumn[];
  onViewTrace: (runId: string) => void;
}) {
  return (
    <div style={s.grid}>
      {columns.map((c) => (
        <Column key={c.run_id} column={c} columns={columns} onViewTrace={onViewTrace} />
      ))}
    </div>
  );
}

export default ColumnsView;
