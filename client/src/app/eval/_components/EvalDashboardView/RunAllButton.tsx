/* RunAllButton — "Run all agents". A paid action, so it first shows the live
   plan (total cases, each agent's model, who is skipped and why) and only then
   starts one suite run per eligible agent (AC-34, AC-35, AC-79). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { EvalRunAllPreview } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useRunAllAgents, useRunAllPreview } from "@/lib/hooks/eval";
import { s } from "./styles";

type Skipped = EvalRunAllPreview["skipped"];

function SkippedList({ skipped }: { skipped: Skipped }) {
  const t = useTranslations("eval.dashboard");
  if (skipped.length === 0) return null;
  return (
    <div>
      <div style={s.skipped}>{t("skippedHeading")}</div>
      <ul style={s.confirmList}>
        {skipped.map((k) => (
          <li key={k.agent_id} style={s.skipped}>
            {t("skipped", { name: k.name, reason: t(`reason.${k.reason}`, { provider: k.provider }) })}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConfirmBody({ preview }: { preview: EvalRunAllPreview }) {
  const t = useTranslations("eval.dashboard");
  return (
    <div style={s.confirmBody}>
      {preview.agents.length === 0 ? (
        <div>{t("runAllNothing")}</div>
      ) : (
        <>
          <div>{t("runAllBody", { count: preview.total_cases, agents: preview.agents.length })}</div>
          <ul style={s.confirmList}>
            {preview.agents.map((a) => (
              <li key={a.agent_id}>{t("runAllAgentLine", { name: a.name, model: a.model, count: a.cases })}</li>
            ))}
          </ul>
        </>
      )}
      <SkippedList skipped={preview.skipped} />
    </div>
  );
}

export function RunAllButton() {
  const t = useTranslations("eval.dashboard");
  const common = useTranslations("common");
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  // The preview is only requested while the dialog is open.
  const preview = useRunAllPreview(open);
  const runAll = useRunAllAgents();

  const confirm = () => {
    runAll.mutate(undefined, {
      onSuccess: (r) => {
        setOpen(false);
        toast.success(t("runAllStarted", { count: r.started.length }));
        for (const k of r.skipped) toast.info(t("skipped", { name: k.name, reason: t(`reason.${k.reason}`, { provider: k.provider }) }));
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : t("runAllFailed")),
    });
  };

  const data = preview.data;
  return (
    <>
      <Button kind="primary" icon="Play" onClick={() => setOpen(true)}>
        {t("runAllAgents")}
      </Button>
      {open && (
        <Modal
          width={480}
          title={t("runAllTitle")}
          onClose={() => setOpen(false)}
          footer={
            <div style={s.footer}>
              <Button kind="ghost" onClick={() => setOpen(false)}>
                {common("actions.cancel")}
              </Button>
              <Button
                kind="primary"
                icon="Play"
                loading={runAll.isPending}
                disabled={!data || data.agents.length === 0 || runAll.isPending}
                onClick={confirm}
              >
                {t("runAllConfirm")}
              </Button>
            </div>
          }
        >
          {preview.isLoading ? (
            <div style={s.confirmBody}>
              <Skeleton height={60} />
            </div>
          ) : preview.isError || !data ? (
            <ErrorState body={t("loadError")} onRetry={() => preview.refetch()} />
          ) : (
            <ConfirmBody preview={data} />
          )}
        </Modal>
      )}
    </>
  );
}
