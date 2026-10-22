/* KpiTiles — the four AC-8 tiles: Total runs (+ bucket sparkline + failed-runs note), Total cost
   (+ M-4 split, M-13 delta, M-3 lower-bound note), Avg accept rate (+ ring), Most-active agent. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore } from "@devdigest/ui";
import type { AgentPerfDashboard } from "@devdigest/shared/contracts/agent-performance.js";
import {
  AcceptRate,
  CostAmount,
  CostDelta,
  FailedRunsNote,
  KpiTile,
  SMALL_SAMPLE_MAX,
  SafeSparkline,
  acceptTone,
  formatPercent,
  ratePercent,
} from "@/components/perf-kit";
import { s } from "./styles";

export function KpiTiles({ data }: { data: AgentPerfDashboard }) {
  const t = useTranslations("agentPerformance");
  const { totals, previous_totals: previous, buckets, most_active: top } = data;
  const decisions = totals.accepted + totals.dismissed;
  const bucketRuns = buckets.map((b) => b.runs);

  return (
    <div style={s.tiles}>
      <KpiTile
        label={t("tiles.totalRuns")}
        footer={
          <div style={s.footerStack}>
            <SafeSparkline data={bucketRuns} label={t("sparkline.label", { runs: totals.runs })} w={200} />
            <FailedRunsNote count={totals.runs_not_counted} />
          </div>
        }
      >
        <span>{totals.runs}</span>
        <span style={s.caption}>{t("tiles.successfulRuns")}</span>
      </KpiTile>

      <KpiTile
        label={t("tiles.totalCost")}
        footer={
          totals.cost_unknown_runs > 0 ? (
            <span style={s.caption}>{t("cost.unknownRuns", { n: totals.cost_unknown_runs })}</span>
          ) : undefined
        }
      >
        <CostAmount value={totals.total_cost_usd} split={totals.cost_split} showSplit />
        <CostDelta
          current={totals.total_cost_usd}
          previous={previous.total_cost_usd}
          previousKnownRuns={previous.cost_known_runs}
          split={totals.cost_split}
        />
      </KpiTile>

      <KpiTile
        label={t("tiles.avgAcceptRate")}
        aside={totals.accept_rate != null && decisions > 0 ? <CircularScore score={ratePercent(totals.accept_rate)} size={40} /> : undefined}
      >
        <AcceptRate
          rate={totals.accept_rate}
          accepted={totals.accepted}
          dismissed={totals.dismissed}
          previousRate={previous.accept_rate}
        />
      </KpiTile>

      <KpiTile label={t("tiles.mostActive")}>
        {top ? (
          <span style={s.mostActive}>
            <span style={s.mostActiveName} title={top.agent_name}>
              {top.agent_name}
            </span>
            <span style={s.caption}>
              {t("mostActive.runs", { runs: top.runs })}
              {" · "}
              {top.accepted + top.dismissed > 0 && formatPercent(top.accept_rate) ? (
                <span style={{ color: acceptTone(top.accept_rate, top.accepted + top.dismissed) }}>
                  {top.accepted + top.dismissed <= SMALL_SAMPLE_MAX
                    ? t("mostActive.acceptSmall", { percent: formatPercent(top.accept_rate), n: top.accepted + top.dismissed })
                    : t("mostActive.accept", { percent: formatPercent(top.accept_rate) })}
                </span>
              ) : (
                t("mostActive.noDecisions")
              )}
            </span>
          </span>
        ) : (
          <span style={s.caption}>{t("mostActive.none")}</span>
        )}
      </KpiTile>
    </div>
  );
}
