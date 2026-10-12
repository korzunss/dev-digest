/* RunEvalControl — "Run eval": a confirmed suite run for this agent. Names the
   case count and model first (a run costs money), shows "Running x / y" while
   it goes and refreshes the page data when it ends (AC-28, AC-36, AC-79). */
"use client";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { EvalAgentDetail } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useEvalRun, useStartEvalRun } from "@/lib/hooks/eval";
import { startRefusalKey } from "./helpers";
import { s } from "./styles";

export function RunEvalControl({ detail }: { detail: EvalAgentDetail }) {
  const t = useTranslations("eval.detail");
  const common = useTranslations("common");
  const toast = useToast();
  const qc = useQueryClient();
  const start = useStartEvalRun();
  const { agent } = detail;
  const [confirming, setConfirming] = React.useState(false);
  const [startedId, setStartedId] = React.useState<string | null>(null);

  // A run started elsewhere or before a reload is still `running` in the history.
  const activeId = startedId ?? detail.runs.find((r) => r.status === "running")?.id ?? null;
  const run = useEvalRun(activeId).data;
  const running = run?.status === "running";

  // The run ending is an external event: refresh what it changed.
  const finished = run && run.status !== "running" ? run.id : null;
  React.useEffect(() => {
    if (finished) qc.invalidateQueries({ queryKey: ["eval-detail", agent.id] });
  }, [finished, qc, agent.id]);

  const refuse = (err: unknown) => {
    const key = err instanceof ApiError ? startRefusalKey(err.code) : null;
    toast.error(key ? t(key, { provider: agent.provider }) : err instanceof Error ? err.message : t("runFailed"));
  };
  const accept = () => {
    setConfirming(false);
    start.mutate(agent.id, { onSuccess: (r) => setStartedId(r.id), onError: refuse });
  };

  return (
    <>
      {running && run && <span style={s.progress}>{t("running", { done: run.cases_done, total: run.cases_total })}</span>}
      <Button kind="primary" icon="Play" disabled={running || start.isPending} onClick={() => setConfirming(true)}>
        {t("runEval")}
      </Button>
      {confirming && (
        <Modal
          width={440}
          title={t("runEvalTitle")}
          onClose={() => setConfirming(false)}
          footer={
            <div style={s.footer}>
              <Button kind="ghost" onClick={() => setConfirming(false)}>
                {common("actions.cancel")}
              </Button>
              <Button kind="primary" icon="Play" onClick={accept}>
                {t("runEvalConfirm")}
              </Button>
            </div>
          }
        >
          <div style={s.confirmBody}>{t("runEvalBody", { count: detail.cases_total, model: agent.model })}</div>
        </Modal>
      )}
    </>
  );
}
