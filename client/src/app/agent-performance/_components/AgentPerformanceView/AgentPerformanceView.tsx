/* AgentPerformanceView — the /agent-performance page (spec 015): period in the URL (AC-3),
   four KPI tiles, the agent table and the cost breakdown. Each non-data state (skeleton,
   error, no agents, no runs) returns early, so no number is drawn without data (AC-18, 26, 27). */
"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { PeriodControl } from "@/components/period-control";
import { PerfEmptyState } from "@/components/perf-kit";
import { THIRTY_DAYS, parsePeriod, toSearch, type PeriodSel } from "@/lib/period";
import { useAgentPerfDashboard, useRunsCount30d } from "@/lib/hooks/agent-performance";
import { AgentPerfTable } from "../AgentPerfTable";
import { CostBreakdown } from "../CostBreakdown";
import { KpiTiles } from "./KpiTiles";
import { s } from "./styles";

function LoadingState() {
  return (
    <div style={s.skeletonStack} aria-busy="true">
      <div style={s.skeletonTiles}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={120} />
        ))}
      </div>
      <Skeleton height={180} />
      <Skeleton height={160} />
    </div>
  );
}

export function AgentPerformanceView() {
  const t = useTranslations("agentPerformance");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const sel = parsePeriod(search);
  const dash = useAgentPerfDashboard(sel);
  const data = dash.data;

  const emptyPeriod = !!data && data.agent_count > 0 && data.totals.runs === 0;
  // The 30-day count backs "Try 30 days" (AC-18a); it is asked for only in this empty state.
  const thirty = useRunsCount30d(null, emptyPeriod && sel.period !== "30d");

  const setPeriod = (next: PeriodSel) => router.replace(`${pathname}?${toSearch(next).toString()}`);

  let body: React.ReactNode;
  if (dash.isLoading) {
    body = <LoadingState />;
  } else if (dash.isError || !data) {
    body = <ErrorState body={t("loadError")} onRetry={() => dash.refetch()} />;
  } else if (data.agent_count === 0) {
    body = (
      <div style={s.noAgents}>
        <div style={s.noAgentsTitle}>{t("noAgents.title")}</div>
        <div style={s.noAgentsBody}>{t("noAgents.body")}</div>
        <Link href="/agents" style={s.link}>
          {t("noAgents.link")}
        </Link>
      </div>
    );
  } else if (data.totals.runs === 0) {
    const runs = thirty.data?.runs ?? 0;
    body = (
      <PerfEmptyState
        failedRuns={data.totals.runs_not_counted}
        tryThirty={sel.period !== "30d" && runs > 0 ? { runs, onSelect: () => setPeriod(THIRTY_DAYS) } : undefined}
      />
    );
  } else {
    body = (
      <>
        <KpiTiles data={data} />
        <AgentPerfTable rows={data.rows} sel={sel} />
        <CostBreakdown byAgent={data.cost_by_agent} byModel={data.cost_by_model} />
      </>
    );
  }

  return (
    <AppShell crumb={[{ label: t("title") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("title")}</h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
          </div>
          <PeriodControl value={sel} onChange={setPeriod} />
        </div>
        {body}
      </div>
    </AppShell>
  );
}
