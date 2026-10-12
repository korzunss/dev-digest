/* CompareRunsModal — two suite runs side by side: metric deltas, the system
   prompt line diff, the skill-set difference, and — when the newer run's
   version is not the agent's current one — a confirmed "Promote vN"
   (AC-52–57, AC-76, AC-80). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { EvalCompare } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useEvalCompare, usePromoteEvalRun } from "@/lib/hooks/eval";
import { formatCostUsd } from "@/lib/format-cost";
import { toPercent } from "../../../helpers";
import { MetricDelta } from "./MetricDelta";
import { PromptDiff } from "./PromptDiff";
import { SkillsDiff } from "./SkillsDiff";
import { deltaPoints, skillLabel } from "./helpers";
import { s } from "./styles";

type Promote = NonNullable<EvalCompare["promote"]>;

function PromoteConfirm({
  promote,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  promote: Promote;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("eval.compare");
  const common = useTranslations("common");
  return (
    <Modal
      width={460}
      title={t("promoteTitle", { version: promote.version })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {common("actions.cancel")}
          </Button>
          <Button kind="primary" loading={pending} disabled={pending} onClick={onConfirm}>
            {t("promoteConfirm")}
          </Button>
        </div>
      }
    >
      <div style={s.confirmBody}>
        <div>{t("promoteBody", { version: promote.version })}</div>
        {promote.restore.length === 0 ? (
          <div style={s.note}>{t("promoteRestoreNone")}</div>
        ) : (
          <div>
            <div>{t("promoteRestore")}</div>
            <ul style={s.list}>
              {promote.restore.map((k) => (
                <li key={k.id}>{skillLabel(k)}</li>
              ))}
            </ul>
          </div>
        )}
        {promote.missing.length > 0 && <div style={s.warn}>{t("promoteMissing", { names: promote.missing.join(", ") })}</div>}
        {error && (
          <div role="alert" style={s.error}>
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function CompareRunsModal({
  agentId,
  runIds,
  onClose,
}: {
  agentId: string;
  runIds: [string, string];
  onClose: () => void;
}) {
  const t = useTranslations("eval.compare");
  const detail = useTranslations("eval.detail");
  const toast = useToast();
  const cmp = useEvalCompare(runIds[0], runIds[1]);
  const promoteRun = usePromoteEvalRun();
  const [confirming, setConfirming] = React.useState(false);
  const [promoteError, setPromoteError] = React.useState<string | null>(null);
  const data = cmp.data;

  const confirmPromote = () => {
    if (!data) return;
    setPromoteError(null);
    promoteRun.mutate(
      { runId: data.newer.id, agentId },
      {
        onSuccess: (r) => {
          toast.success(t("promoted", { version: r.version }));
          onClose();
        },
        // The server's reason (e.g. the stored config is missing) is the answer to "why".
        onError: (err) => setPromoteError(err instanceof ApiError ? err.message : t("promoteFailed")),
      },
    );
  };

  const metric = (label: string, from: number | null, to: number | null, delta: number | null) => (
    <MetricDelta
      label={label}
      from={toPercent(from) == null ? detail("na") : `${toPercent(from)}%`}
      to={toPercent(to) == null ? detail("na") : `${toPercent(to)}%`}
      delta={delta}
      deltaText={delta == null ? null : detail("deltaPoints", { points: deltaPoints(delta) })}
    />
  );

  let body: React.ReactNode;
  if (cmp.isLoading) {
    body = (
      <div style={s.body} aria-label={t("loading")}>
        <Skeleton height={80} />
        <Skeleton height={140} />
      </div>
    );
  } else if (cmp.isError || !data) {
    const code = cmp.error instanceof ApiError ? cmp.error.code : undefined;
    body = <ErrorState body={code === "runs_not_comparable" ? t("notComparable") : t("loadError")} onRetry={() => cmp.refetch()} />;
  } else {
    const { older, newer, deltas } = data;
    body = (
      <div style={s.body}>
        <div style={s.tiles}>
          {metric(t("recall"), older.metrics.recall, newer.metrics.recall, deltas.recall)}
          {metric(t("precision"), older.metrics.precision, newer.metrics.precision, deltas.precision)}
          {metric(t("citation"), older.metrics.citation_accuracy, newer.metrics.citation_accuracy, deltas.citation_accuracy)}
          <MetricDelta
            label={t("cost")}
            from={formatCostUsd(older.cost_usd)}
            to={formatCostUsd(newer.cost_usd)}
            delta={deltas.cost_usd}
            deltaText={deltas.cost_usd == null ? null : Math.abs(deltas.cost_usd).toFixed(2)}
            tinted={false}
          />
        </div>
        <div>
          <div style={s.heading}>{t("promptDiff")}</div>
          {data.prompt_diff == null ? (
            <div style={s.note}>{t("samePrompt")}</div>
          ) : (
            <>
              <div style={s.legend}>
                <span>{t("legendOld", { version: older.agent_version })}</span>
                <span>{t("legendNew", { version: newer.agent_version })}</span>
              </div>
              <PromptDiff lines={data.prompt_diff} />
            </>
          )}
        </div>
        <div>
          <div style={s.heading}>{t("skillsHeading")}</div>
          <SkillsDiff diff={data.skills_diff} same={data.same_skills} />
        </div>
      </div>
    );
  }

  return (
    <>
      <Modal
        width={860}
        title={data ? t("title", { older: data.older.agent_version, newer: data.newer.agent_version }) : t("metrics")}
        subtitle={t("subtitle")}
        onClose={onClose}
        footer={
          <div style={s.footer}>
            <Button kind="ghost" onClick={onClose}>
              {t("close")}
            </Button>
            {data?.promote && (
              <Button kind="primary" icon="GitBranch" onClick={() => setConfirming(true)}>
                {t("promote", { version: data.promote.version })}
              </Button>
            )}
          </div>
        }
      >
        {body}
      </Modal>
      {confirming && data?.promote && (
        <PromoteConfirm
          promote={data.promote}
          pending={promoteRun.isPending}
          error={promoteError}
          onConfirm={confirmPromote}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
