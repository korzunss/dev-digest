/* EvalDashboardView — the Eval Dashboard: every agent with its latest eval
   metrics and the 20 newest suite runs across all agents (AC-34, 35, 58–61). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useEvalDashboard } from "@/lib/hooks/eval";
import { METRIC_COLORS, formatRunTime } from "../../helpers";
import { MetricBar } from "../MetricBar";
import { AgentRow } from "./AgentRow";
import { RunAllButton } from "./RunAllButton";
import { s } from "./styles";

function RecentRunRow({ run }: { run: EvalSuiteRun }) {
  return (
    <div style={s.runRow}>
      <span style={s.runName}>{run.agent_name}</span>
      <span className="mono" style={s.muted}>
        {formatRunTime(run.started_at)}
      </span>
      <span className="mono" style={s.version}>
        v{run.agent_version}
      </span>
      <MetricBar value={run.metrics.recall} color={METRIC_COLORS.recall} />
      <MetricBar value={run.metrics.precision} color={METRIC_COLORS.precision} />
      <MetricBar value={run.metrics.citation_accuracy} color={METRIC_COLORS.citation_accuracy} />
      <span className="tnum" style={s.pass}>
        {run.cases_passed}/{run.cases_total}
      </span>
    </div>
  );
}

export function EvalDashboardView() {
  const t = useTranslations("eval.dashboard");
  const page = useTranslations("eval.page");
  const { data, isLoading, isError, refetch } = useEvalDashboard();
  const crumb = [{ label: page("crumbSkillsLab") }, { label: page("crumbEvalDashboard") }];

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page} aria-label={t("loading")}>
          <Skeleton height={28} width={220} />
          <Skeleton height={220} />
        </div>
      </AppShell>
    );
  }
  if (isError || !data) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen body={t("loadError")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("defaultTitle")}</h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
          </div>
          <RunAllButton />
        </div>

        <section>
          <div style={s.sectionLabel}>
            <Icon.Cpu size={13} />
            {t("agentsHeading")}
          </div>
          {data.agents.length === 0 ? (
            <div style={s.empty}>{t("noAgents")}</div>
          ) : (
            <div style={s.list}>
              {data.agents.map((a) => (
                <AgentRow key={a.agent_id} agent={a} />
              ))}
            </div>
          )}
        </section>

        <section>
          <div style={s.sectionLabel}>
            <Icon.History size={13} />
            {t("recentRunsAll")}
          </div>
          {data.recent_runs.length === 0 ? (
            <div style={s.empty}>{t("noRuns")}</div>
          ) : (
            <div style={s.runsTable}>
              {data.recent_runs.map((r) => (
                <RecentRunRow key={r.id} run={r} />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
