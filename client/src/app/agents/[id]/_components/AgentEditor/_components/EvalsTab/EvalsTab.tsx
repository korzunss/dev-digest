/* Agent EvalsTab — the agent's regression suite: metric cards of the latest
   completed run, the case list, and the run / edit / delete flows. Every run
   names the case count and model and waits for a confirm (AC-28, AC-33). */
"use client";

import React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button, ErrorState, MetricCard, Skeleton } from "@devdigest/ui";
import type { Agent, EvalSuiteCase } from "@devdigest/shared";
import { EvalCaseModal } from "@/components/eval-case-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import {
  useDeleteEvalCase,
  useEvalAgentDetail,
  useEvalCases,
  useEvalRun,
  useRunEvalCase,
  useStartEvalRun,
} from "@/lib/hooks/eval";
import { CaseRow } from "./CaseRow";
import { RunConfirm } from "./RunConfirm";
import { passingCount, startRefusalKey, toPercent } from "./helpers";
import { s } from "./styles";

type Confirm = { kind: "runAll" } | { kind: "run" | "delete"; c: EvalSuiteCase };
type Editing = { existing: EvalSuiteCase | null };

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval.evalsTab");
  const na = useTranslations("eval.detail")("na");
  const toast = useToast();
  const qc = useQueryClient();
  const cases = useEvalCases(agent.id);
  const detail = useEvalAgentDetail(agent.id, "30d");
  const start = useStartEvalRun();
  const runCase = useRunEvalCase();
  const del = useDeleteEvalCase();
  const [startedId, setStartedId] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<Confirm | null>(null);
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [runningCase, setRunningCase] = React.useState<string | null>(null);

  // A run started in another tab or before a reload is still `running` in the history.
  const activeId = startedId ?? detail.data?.runs.find((r) => r.status === "running")?.id ?? null;
  const run = useEvalRun(activeId).data;
  const running = run?.status === "running";

  // The run finishing is an external event: refresh what it changed.
  const finished = run && run.status !== "running" ? run.id : null;
  React.useEffect(() => {
    if (!finished) return;
    qc.invalidateQueries({ queryKey: ["eval-cases", agent.id] });
    qc.invalidateQueries({ queryKey: ["eval-detail", agent.id] });
  }, [finished, qc, agent.id]);

  if (cases.isLoading || detail.isLoading) return <Skeleton height={220} />;
  if (cases.isError || detail.isError || !cases.data || !detail.data) {
    return (
      <ErrorState
        body={t("loadError")}
        onRetry={() => {
          cases.refetch();
          detail.refetch();
        }}
      />
    );
  }

  const list = cases.data;
  const latest = detail.data.latest;
  const deltas = detail.data.deltas;
  const refuse = (err: unknown) => {
    const key = err instanceof ApiError ? startRefusalKey(err.code) : null;
    toast.error(key ? t(key, { provider: agent.provider }) : err instanceof Error ? err.message : String(err));
  };
  const card = (label: string, value: number | null, delta: number | null) => (
    <div style={s.tile}>
      <MetricCard label={label} value={value ?? na} suffix={value == null ? undefined : "%"} delta={delta ?? undefined} />
    </div>
  );
  const accept = () => {
    const c = confirm;
    setConfirm(null);
    if (c?.kind === "runAll") {
      start.mutate(agent.id, { onSuccess: (r) => setStartedId(r.id), onError: refuse });
    } else if (c?.kind === "run") {
      setRunningCase(c.c.id);
      runCase.mutate({ id: c.c.id, agentId: agent.id }, { onError: refuse, onSettled: () => setRunningCase(null) });
    } else if (c?.kind === "delete") {
      del.mutate({ id: c.c.id, agentId: agent.id });
    }
  };

  return (
    <div style={s.wrap}>
      <div>
        <div style={s.sectionHead}>
          <span style={s.sectionTitle}>{t("metricsTitle")}</span>
          <span style={s.caption}>{latest ? t("latestCaption") : t("noRunYet")}</span>
          <span style={s.spacer} />
          <Link href={`/eval/${agent.id}`} style={s.caption}>{t("viewDashboard")}</Link>
        </div>
        <div style={{ ...s.tiles, marginTop: 10 }}>
          <div style={s.tile}>
            <MetricCard
              label={t("casesPassedCard")}
              value={latest ? `${latest.cases_passed} / ${latest.cases_total}` : "–"}
            />
          </div>
          {card(t("cardRecall"), toPercent(latest?.metrics.recall), deltas.recall)}
          {card(t("cardPrecision"), toPercent(latest?.metrics.precision), deltas.precision)}
          {card(t("cardCitation"), toPercent(latest?.metrics.citation_accuracy), deltas.citation_accuracy)}
        </div>
      </div>

      <div style={s.toolbar}>
        <span style={s.sectionTitle}>{t("casesHeading")}</span>
        <span style={s.caption}>{t("passingCount", { passed: passingCount(list), total: list.length })}</span>
        {running && run && <span style={s.progress}>{t("progress", { done: run.cases_done, total: run.cases_total })}</span>}
        <span style={s.spacer} />
        <Button kind="secondary" size="sm" icon="Plus" onClick={() => setEditing({ existing: null })}>{t("newCase")}</Button>
        <Button kind="primary" size="sm" icon="Play" disabled={running || start.isPending} onClick={() => setConfirm({ kind: "runAll" })}>
          {t("runAll")}
        </Button>
      </div>

      {list.length === 0 ? (
        <div style={s.empty}>{t("emptyCases")}</div>
      ) : (
        <div style={s.list}>
          {list.map((c) => (
            <CaseRow
              key={c.id}
              c={c}
              busy={running || runningCase === c.id}
              onRun={() => setConfirm({ kind: "run", c })}
              onEdit={() => setEditing({ existing: c })}
              onDelete={() => setConfirm({ kind: "delete", c })}
            />
          ))}
        </div>
      )}

      {confirm?.kind === "delete" && (
        <ConfirmModal title={t("deleteTitle")} body={t("deleteBody", { name: confirm.c.name })} confirmLabel={t("deleteConfirm")} onConfirm={accept} onClose={() => setConfirm(null)} />
      )}
      {confirm?.kind === "run" && (
        <RunConfirm title={t("runCaseTitle")} body={t("runCaseBody", { model: agent.model })} confirmLabel={t("run")} onConfirm={accept} onClose={() => setConfirm(null)} />
      )}
      {confirm?.kind === "runAll" && (
        <RunConfirm title={t("runAllTitle")} body={t("runAllBody", { count: list.length, model: agent.model })} confirmLabel={t("runAllConfirm")} onConfirm={accept} onClose={() => setConfirm(null)} />
      )}
      {editing && (
        <EvalCaseModal
          key={editing.existing?.id ?? "new"}
          agentId={agent.id}
          existing={editing.existing}
          onClose={() => setEditing(null)}
          onOpenExisting={(id) => setEditing({ existing: list.find((c) => c.id === id) ?? null })}
        />
      )}
    </div>
  );
}
