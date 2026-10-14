/* RunOnEvalsButton — the skill header's "Run on evals" (AC-91–AC-93): runs the
   suites of the enabled agents that use this skill. A paid action, so it lists
   who runs on which model and who is skipped before it starts. Disabled, with
   the reason in `title`, for a disabled skill or when no agent has cases. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { RunAgentsList } from "@/components/eval-suite";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useRunOnEvals, useRunOnEvalsPreview } from "@/lib/hooks/eval";
import { s } from "./styles";

export function RunOnEvalsButton({ skill }: { skill: Skill }) {
  const t = useTranslations("skills.evals");
  const dash = useTranslations("eval.dashboard");
  const common = useTranslations("common");
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const preview = useRunOnEvalsPreview(skill.id);
  const run = useRunOnEvals();
  const data = preview.data;

  const reason = !skill.enabled || data?.blocked === "skill_disabled"
    ? t("disabledSkillOff")
    : data?.blocked === "no_agents"
      ? t("disabledNoAgents")
      : null;

  const confirm = () => {
    run.mutate(skill.id, {
      onSuccess: (r) => {
        setOpen(false);
        toast.success(t("started", { count: r.started.length }));
        for (const k of r.skipped) {
          toast.info(dash("skipped", { name: k.name, reason: dash(`reason.${k.reason}`, { provider: k.provider }) }));
        }
      },
      onError: (err) => {
        // The skill was disabled while the dialog was open: the preview is stale.
        if (err instanceof ApiError && err.code === "skill_disabled") {
          setOpen(false);
          toast.error(t("skillDisabledToast"));
        } else {
          toast.error(err instanceof ApiError ? err.message : t("runFailed"));
        }
        preview.refetch();
      },
    });
  };

  return (
    <>
      <Button
        kind="secondary"
        size="sm"
        icon="FlaskConical"
        disabled={!data || reason !== null}
        title={reason ?? undefined}
        onClick={() => setOpen(true)}
      >
        {t("run")}
      </Button>
      {open && (
        <Modal
          width={480}
          title={t("confirmTitle")}
          onClose={() => setOpen(false)}
          footer={
            <div style={s.footer}>
              <Button kind="ghost" onClick={() => setOpen(false)}>
                {common("actions.cancel")}
              </Button>
              <Button
                kind="primary"
                icon="Play"
                loading={run.isPending}
                disabled={!data || data.agents.length === 0 || run.isPending}
                onClick={confirm}
              >
                {t("confirmRun")}
              </Button>
            </div>
          }
        >
          <div style={s.body}>
            {preview.isLoading ? (
              <Skeleton height={60} />
            ) : preview.isError || !data ? (
              <ErrorState body={t("runFailed")} onRetry={() => preview.refetch()} />
            ) : (
              <RunAgentsList preview={data} />
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
