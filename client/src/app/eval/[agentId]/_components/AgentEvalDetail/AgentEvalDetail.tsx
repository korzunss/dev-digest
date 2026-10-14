/* AgentEvalDetail — one agent's eval history: metric cards with deltas, the
   regression banner, the trend chart and the runs table with Compare
   (AC-28, AC-43–51). The period lives in `?period=`. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Dropdown, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgents } from "@/lib/hooks/agents";
import { useEvalAgentDetail } from "@/lib/hooks/eval";
import { METRIC_COLORS } from "../../../helpers";
import { CompareRunsModal } from "../CompareRunsModal";
import { EvalTrendChart } from "../EvalTrendChart";
import { MetricCards } from "./MetricCards";
import { RegressionAlert } from "./RegressionAlert";
import { RunEvalControl } from "./RunEvalControl";
import { RunsTable } from "./RunsTable";
import { canCompare, parsePeriod, toggleSelected } from "./helpers";
import { s } from "./styles";

export function AgentEvalDetail({ agentId }: { agentId: string }) {
  const t = useTranslations("eval.detail");
  const page = useTranslations("eval.page");
  const router = useRouter();
  const search = useSearchParams();
  const period = parsePeriod(search.get("period"));
  const { data: agents } = useAgents();
  const { data, isLoading, isError, refetch } = useEvalAgentDetail(agentId, period);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState<[string, string] | null>(null);

  const crumb = [
    { label: page("crumbSkillsLab") },
    { label: page("crumbEvalDashboard"), href: "/eval" },
    { label: data?.agent.name ?? page("crumbAgents") },
  ];

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <Skeleton height={32} width={260} />
          <Skeleton height={120} />
          <Skeleton height={240} />
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

  const goPeriod = (p: "30d" | "all") => router.replace(`/eval/${agentId}?period=${p}`);
  const switcher = (agents ?? []).map((a) => ({
    label: a.name,
    onClick: () => router.push(`/eval/${a.id}?period=${period}`),
  }));

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Link href="/eval" style={s.back}>
          <Icon.ChevronLeft size={14} />
          {t("allAgents")}
        </Link>

        <div style={s.header}>
          <div style={s.headerText}>
            <div style={s.titleRow}>
              <h1 style={s.h1}>{data.agent.name}</h1>
              <Badge color="var(--text-secondary)" mono>
                {data.agent.model}
              </Badge>
            </div>
            <p style={s.subtitle}>{t("subtitle", { runs: data.runs_total, cases: data.cases_total })}</p>
          </div>
          <div style={s.controls}>
            <Dropdown
              width={220}
              align="right"
              trigger={
                <Button kind="secondary" icon="Cpu" iconRight="ChevronDown" aria-label={t("switcher")}>
                  {data.agent.name}
                </Button>
              }
              items={switcher}
            />
            <Dropdown
              width={160}
              align="right"
              trigger={
                <Button kind="secondary" icon="Calendar" aria-label={t("period")}>
                  {period === "all" ? t("periodAll") : t("period30d")}
                </Button>
              }
              items={[
                { label: t("period30d"), onClick: () => goPeriod("30d") },
                { label: t("periodAll"), onClick: () => goPeriod("all") },
              ]}
            />
            <RunEvalControl detail={data} />
          </div>
        </div>

        {data.alert && <RegressionAlert alert={data.alert} />}
        <MetricCards detail={data} />

        <section style={s.panel}>
          <div style={s.panelHead}>
            <span style={s.sectionTitle}>
              <Icon.TrendingUp size={13} />
              {t("trendTitle")}
            </span>
            <span style={s.legend}>
              <span style={{ color: METRIC_COLORS.recall }}>{t("metricName.recall")}</span>
              <span style={{ color: METRIC_COLORS.precision }}>{t("metricName.precision")}</span>
              <span style={{ color: METRIC_COLORS.citation_accuracy }}>{t("metricName.citation_accuracy")}</span>
            </span>
          </div>
          {data.trend.length === 0 ? <div style={s.empty}>{t("trendEmpty")}</div> : <EvalTrendChart trend={data.trend} />}
        </section>

        <section>
          <div style={{ ...s.runsHead, marginBottom: 10 }}>
            <span style={s.sectionTitle}>
              <Icon.History size={13} />
              {t("runsTitle")}
            </span>
            <span style={s.caption}>{canCompare(selected) ? null : t("compareHint")}</span>
            <span style={s.spacer} />
            <Button
              kind="primary"
              icon="GitBranch"
              disabled={!canCompare(selected)}
              onClick={() => canCompare(selected) && setComparing(selected)}
            >
              {t("compare")}
            </Button>
          </div>
          {data.runs.length === 0 ? (
            <div style={s.empty}>{t("runsEmpty")}</div>
          ) : (
            <div style={s.panel}>
              <RunsTable runs={data.runs} selected={selected} onToggle={(id) => setSelected((cur) => toggleSelected(cur, id))} />
            </div>
          )}
        </section>
      </div>
      {comparing && <CompareRunsModal agentId={agentId} runIds={comparing} onClose={() => setComparing(null)} />}
    </AppShell>
  );
}
