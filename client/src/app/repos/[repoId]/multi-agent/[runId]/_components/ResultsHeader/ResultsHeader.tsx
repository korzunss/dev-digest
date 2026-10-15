/* ResultsHeader — "Configure run", the title, "<N> selected agents · parallel",
   the Columns / Tabs switch, the PR and the run totals (spec 013, AC-31/32).
   The wall-clock total is null while a column runs, then the line says so. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { MultiAgentRun } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format-cost";
import { s } from "./styles";

export type ResultsView = "columns" | "tabs";

export function ResultsHeader({
  run,
  view,
  onViewChange,
  onConfigure,
}: {
  run: MultiAgentRun;
  view: ResultsView;
  onViewChange: (v: ResultsView) => void;
  onConfigure: () => void;
}) {
  const t = useTranslations("runs");
  const cost = formatCostUsd(run.total_cost_usd);
  const duration = run.total_duration_ms != null ? (run.total_duration_ms / 1000).toFixed(1) : null;
  const views: ResultsView[] = ["columns", "tabs"];

  return (
    <header style={s.wrap}>
      <div style={s.row}>
        <Button kind="secondary" size="sm" icon="Settings" onClick={onConfigure}>
          {t("page.configureRun")}
        </Button>
        <div style={s.titleBlock}>
          <h1 style={s.title}>{t("page.title")}</h1>
          <span style={s.subtitle}>{t("page.selectedAgents", { count: run.agent_count })}</span>
        </div>
        <div style={s.switch} role="group" aria-label={t("page.title")}>
          {views.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              style={view === v ? s.switchOn : s.switchOff}
              onClick={() => onViewChange(v)}
            >
              {t(`page.view.${v}`)}
            </button>
          ))}
        </div>
      </div>
      <div style={s.row}>
        <div style={s.pr}>
          {run.pr_number != null && <span style={s.prNum}>#{run.pr_number}</span>}
          {run.pr_title && <span style={s.prTitle}>{run.pr_title}</span>}
        </div>
        <span style={s.meta}>
          <Icon.Cpu size={14} />
          {duration != null
            ? t("page.meta", { count: run.agent_count, duration, cost })
            : t("page.metaRunning", { count: run.agent_count, cost })}
          {run.total_cost_partial && (
            <span title={t("page.costPartial")} aria-label={t("page.costPartial")}>
              +
            </span>
          )}
        </span>
      </div>
    </header>
  );
}

export default ResultsHeader;
