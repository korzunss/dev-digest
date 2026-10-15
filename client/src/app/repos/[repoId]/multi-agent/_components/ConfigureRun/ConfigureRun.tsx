/* ConfigureRun — step 1 pick a pull request (kept in `?pr=`), step 2 tick the
   agents, then start a multi-agent run and open its results page (spec 013,
   AC-10…AC-15). The ticked ids are local state; until the user touches the
   list, every enabled agent is ticked. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { aggregateEstimate, formatEstimate } from "@/lib/agent-estimates";
import { formatCostUsd } from "@/lib/format-cost";
import { useAgents } from "@/lib/hooks/agents";
import { usePulls } from "@/lib/hooks";
import {
  useAgentEstimates,
  useLatestMultiAgentRun,
  useRecentMultiAgentRuns,
  useStartMultiAgentRun,
} from "@/lib/hooks/multi-agent";
import { AgentPickList } from "../AgentPickList";
import { LatestRunLink } from "../LatestRunLink";
import { RecentRuns } from "../RecentRuns";
import { SKELETON_ROWS } from "./constants";
import { s } from "./styles";

export function ConfigureRun({ repoId }: { repoId: string }) {
  const t = useTranslations("runs");
  const router = useRouter();
  const search = useSearchParams();
  const pulls = usePulls(repoId);
  const agents = useAgents();
  const estimates = useAgentEstimates();
  const start = useStartMultiAgentRun();
  const recent = useRecentMultiAgentRuns(repoId);
  const [ticked, setTicked] = React.useState<string[] | null>(null);

  const pr = search.get("pr") ?? "";
  const selectedPr = (pulls.data ?? []).find((p) => String(p.number) === pr) ?? null;
  const agentList = agents.data ?? [];
  const known = new Set(agentList.map((a) => a.id));
  const selected = (ticked ?? agentList.filter((a) => a.enabled).map((a) => a.id)).filter((id) =>
    known.has(id),
  );
  const latest = useLatestMultiAgentRun(selectedPr?.id);
  const canRun = !!selectedPr?.id && selected.length > 0 && !start.isPending;

  const prOptions = [
    { value: "", label: t("page.selectPr") },
    ...(pulls.data ?? []).map((p) => ({
      value: String(p.number),
      label: t("page.prItem", { number: p.number, title: p.title }),
    })),
  ];

  const setPr = (value: string) => {
    router.replace(`/repos/${repoId}/multi-agent${value ? `?pr=${encodeURIComponent(value)}` : ""}`);
  };
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicked(agentList.map((a) => a.id).filter((x) => next.has(x)));
  };
  const run = () => {
    if (!selectedPr?.id || !canRun) return;
    start.mutate(
      { prId: selectedPr.id, agentIds: selected },
      { onSuccess: (created) => router.push(`/repos/${repoId}/multi-agent/${created.id}`) },
    );
  };

  const agg = aggregateEstimate(
    (estimates.data ?? []).filter((e) => selected.includes(e.agent_id)),
  );
  const { duration, cost } = formatEstimate(agg);

  let stepTwo: React.ReactNode;
  if (!selectedPr) {
    stepTwo = (
      <div style={s.emptyBox}>
        <span style={s.emptyTile} aria-hidden="true">
          <Icon.GitPullRequest size={18} />
        </span>
        <div style={s.emptyTitle}>{t("configure.pickPrFirst")}</div>
        <div style={s.emptyBody}>{t("configure.pickPrFirstBody")}</div>
      </div>
    );
  } else if (agents.isLoading) {
    stepTwo = (
      <div style={s.loadingStack}>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <Skeleton key={i} height={36} />
        ))}
      </div>
    );
  } else if (agents.isError) {
    stepTwo = (
      <ErrorState
        body={agents.error instanceof ApiError ? agents.error.message : undefined}
        onRetry={() => agents.refetch()}
      />
    );
  } else if (agentList.length === 0) {
    stepTwo = (
      <EmptyState
        icon="Sparkles"
        title={t("configure.noAgents.title")}
        body={t("configure.noAgents.body")}
        cta={t("configure.noAgents.cta")}
        onCta={() => router.push("/agents")}
      />
    );
  } else {
    stepTwo = (
      <AgentPickList
        agents={agentList}
        selected={selected}
        estimates={estimates.data ?? []}
        onToggle={toggle}
      />
    );
  }

  const prSelect = (
    <span style={s.selectWrap}>
      <span style={s.selectIcon} aria-hidden="true">
        <Icon.GitPullRequest size={14} />
      </span>
      <select
        aria-label={t("configure.step1")}
        style={s.select}
        value={selectedPr ? pr : ""}
        onChange={(e) => setPr(e.target.value)}
      >
        {prOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span style={s.selectChevron} aria-hidden="true">
        <Icon.ChevronDown size={14} />
      </span>
    </span>
  );

  return (
    <div style={s.page}>
      <div>
        <h1 style={s.title}>{t("configure.title")}</h1>
        <p style={s.subtitle}>{t("configure.subtitle")}</p>
      </div>

      <section style={s.step} aria-label={t("configure.step1")}>
        <div style={s.stepLabel}>
          <span style={s.badge(true)}>1</span>
          <span style={s.stepTitle(true)}>{t("configure.step1")}</span>
        </div>
        {pulls.isLoading ? (
          <Skeleton height={34} />
        ) : pulls.isError ? (
          <ErrorState
            body={pulls.error instanceof ApiError ? pulls.error.message : undefined}
            onRetry={() => pulls.refetch()}
          />
        ) : (
          <div style={s.stepOneRow}>
            {prSelect}
            <LatestRunLink repoId={repoId} run={latest.data?.run} />
          </div>
        )}
      </section>

      <section style={s.step} aria-label={t("configure.step2")}>
        <div style={s.stepLabel}>
          <span style={s.badge(!!selectedPr)}>2</span>
          <span style={s.stepTitle(!!selectedPr)}>{t("configure.step2")}</span>
          {selectedPr && agentList.length > 0 && (
            <button type="button" style={s.selectAll} onClick={() => setTicked(agentList.map((a) => a.id))}>
              {t("configure.selectAll")}
            </button>
          )}
        </div>
        {stepTwo}
      </section>

      <div style={s.footer}>
        <Button kind="primary" icon="Users" disabled={!canRun} loading={start.isPending} onClick={run}>
          {t("configure.run", { count: selected.length })}
        </Button>
        {selectedPr && selected.length > 0 && (
          <span style={s.aggregate}>
            {duration != null
              ? t("configure.aggregate", { duration, cost: cost ?? formatCostUsd(null) })
              : t("configure.noEstimate")}
          </span>
        )}
        {start.isError && (
          <span role="alert" style={s.error}>
            {start.error instanceof ApiError ? start.error.message : t("configure.startFailed")}
          </span>
        )}
      </div>

      {recent.data && <RecentRuns repoId={repoId} runs={recent.data} />}
    </div>
  );
}

export default ConfigureRun;
