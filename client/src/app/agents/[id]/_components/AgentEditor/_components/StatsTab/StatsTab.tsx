/* StatsTab — one agent's performance (spec 015, AC-20 to AC-22, AC-25, AC-26, AC-27, AC-29;
   spec 016, AC-3, AC-37): the period control (period in the URL beside ?tab=), then three
   independent regions — four KPI tiles, the breakdown panels (their own request) and the run
   history. A stats failure or an empty period replaces only the tiles; the panels follow their
   own response, and a 404 hides them. The tab mounts only while it is open, so no other tab
   makes a stats request (AC-28). */
"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircularScore, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { PeriodControl } from "@/components/period-control";
import {
  AcceptRate,
  CostAmount,
  CostDelta,
  FailedRunsNote,
  KpiTile,
  PerfEmptyState,
  SafeSparkline,
  formatDuration,
  ratePercent,
} from "@/components/perf-kit";
import { ApiError } from "@/lib/api";
import { THIRTY_DAYS, parsePeriod, type PeriodSel } from "@/lib/period";
import { useAgentPerfStats, useRunsCount30d } from "@/lib/hooks/agent-performance";
import { BreakdownPanels } from "./_components/BreakdownPanels";
import { RunHistory } from "./_components/RunHistory";
import { s } from "./styles";

function LoadingState() {
  return (
    <div style={s.skeletonStack} aria-busy="true">
      <div style={s.skeletonTiles}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={120} />
        ))}
      </div>
    </div>
  );
}

export function StatsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agentPerformance");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const sel = parsePeriod(search);
  const stats = useAgentPerfStats(agent.id, sel);
  const data = stats.data;

  const emptyPeriod = !!data && data.figures.runs === 0;
  // The 30-day count backs "Try 30 days" (AC-18a); it is asked for only in this empty state.
  const thirty = useRunsCount30d(agent.id, emptyPeriod && sel.period !== "30d");

  const setPeriod = (next: PeriodSel) => {
    // Keep `tab` (and anything else); only the period params change.
    const sp = new URLSearchParams(search.toString());
    for (const key of ["period", "from", "to"]) sp.delete(key);
    sp.set("period", next.period);
    if (next.period === "custom" && next.from && next.to) {
      sp.set("from", next.from);
      sp.set("to", next.to);
    }
    router.replace(`${pathname}?${sp.toString()}`);
  };

  const notFound = stats.error instanceof ApiError && stats.error.status === 404;
  let history: React.ReactNode = null;
  let body: React.ReactNode;
  if (stats.isLoading) {
    body = <LoadingState />;
    history = <Skeleton height={160} />;
  } else if (notFound) {
    // AC-29: the editor's own not-found state (same title/body as `/agents/[id]/page.tsx`).
    body = <ErrorState title="Couldn’t load this agent" body={stats.error?.message} onRetry={() => stats.refetch()} />;
  } else if (stats.isError || !data) {
    body = <ErrorState body={t("statsLoadError")} onRetry={() => stats.refetch()} />;
  } else if (data.figures.runs === 0) {
    const runs = thirty.data?.runs ?? 0;
    body = (
      <PerfEmptyState
        failedRuns={data.figures.runs_not_counted}
        tryThirty={sel.period !== "30d" && runs > 0 ? { runs, onSelect: () => setPeriod(THIRTY_DAYS) } : undefined}
      />
    );
  } else {
    const { figures, previous, buckets } = data;
    const decisions = figures.accepted + figures.dismissed;
    body = (
      <>
        <div style={s.tiles}>
          <KpiTile
            label={t("tiles.totalRuns")}
            footer={
              <div style={s.footerStack}>
                <SafeSparkline data={buckets.map((b) => b.runs)} label={t("sparkline.label", { runs: figures.runs })} w={200} />
                <FailedRunsNote count={figures.runs_not_counted} />
              </div>
            }
          >
            <span>{figures.runs}</span>
            <span style={s.caption}>{t("tiles.successfulRuns")}</span>
          </KpiTile>

          <KpiTile
            label={t("tiles.avgCostPerRun")}
            footer={
              figures.cost_unknown_runs > 0 ? (
                <span style={s.caption}>{t("cost.unknownRuns", { n: figures.cost_unknown_runs })}</span>
              ) : undefined
            }
          >
            <CostAmount value={figures.avg_cost_usd} split={figures.cost_split} showSplit />
            <CostDelta
              current={figures.avg_cost_usd}
              previous={previous.avg_cost_usd}
              previousKnownRuns={previous.cost_known_runs}
              split={figures.cost_split}
            />
          </KpiTile>

          <KpiTile label={t("tiles.avgDuration")}>
            <span>{formatDuration(figures.avg_duration_ms)}</span>
          </KpiTile>

          <KpiTile
            label={t("tiles.acceptRate")}
            aside={figures.accept_rate != null && decisions > 0 ? <CircularScore score={ratePercent(figures.accept_rate)} size={40} /> : undefined}
          >
            <AcceptRate
              rate={figures.accept_rate}
              accepted={figures.accepted}
              dismissed={figures.dismissed}
              previousRate={previous.accept_rate}
            />
          </KpiTile>
        </div>
      </>
    );
    history = <RunHistory agentId={agent.id} agentName={agent.name} sel={sel} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <PeriodControl value={sel} onChange={setPeriod} />
      </div>
      {body}
      {!notFound && <BreakdownPanels agentId={agent.id} sel={sel} />}
      {history}
    </div>
  );
}
