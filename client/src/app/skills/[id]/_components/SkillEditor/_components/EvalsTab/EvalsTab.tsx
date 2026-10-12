/* Skill EvalsTab — the skill's own regression suite: cases that assert what
   the skill makes a reviewer report (AC-81). A skill has no model, so every
   paid run asks for one first (AC-87) and names the case count (AC-28). */
"use client";

import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { EvalModelPick, EvalSuiteCase, Skill } from "@devdigest/shared";
import { EvalCaseModal } from "@/components/eval-case-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { CaseRow, RunConfirm, passingCount } from "@/components/eval-suite";
import { ModelPicker } from "@/components/model-picker";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import {
  type EvalOwner,
  useDeleteEvalCase,
  useRunEvalCase,
  useSkillEvalCases,
  useSkillEvalRunState,
  useStartSkillEvalRun,
} from "@/lib/hooks/eval";
import { newestFirst, startRefusalKey } from "./helpers";
import { s } from "./styles";

type Confirm = { kind: "runAll" } | { kind: "run" | "delete"; c: EvalSuiteCase };
type Editing = { existing: EvalSuiteCase | null };

export function EvalsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("eval.skillTab");
  const agentT = useTranslations("eval.evalsTab");
  const modalT = useTranslations("eval.modal");
  const toast = useToast();
  const qc = useQueryClient();
  const owner = React.useMemo<EvalOwner>(() => ({ kind: "skill", skillId: skill.id }), [skill.id]);
  const cases = useSkillEvalCases(skill.id);
  const runState = useSkillEvalRunState(skill.id);
  const start = useStartSkillEvalRun();
  const runCase = useRunEvalCase();
  const del = useDeleteEvalCase();
  const [confirm, setConfirm] = React.useState<Confirm | null>(null);
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [runningCase, setRunningCase] = React.useState<string | null>(null);
  // `undefined` = the picker is untouched: follow the server's default pick (AC-87).
  const [chosen, setChosen] = React.useState<EvalModelPick | null | undefined>(undefined);
  const pick = chosen === undefined ? (runState.data?.default_pick ?? null) : chosen;

  const progress = runState.data?.progress ?? null;
  const running = progress !== null;

  // The suite finishing is an external event: refetch the results it wrote.
  const wasRunning = React.useRef(false);
  React.useEffect(() => {
    if (wasRunning.current && !running) qc.invalidateQueries({ queryKey: ["skill-eval-cases", skill.id] });
    wasRunning.current = running;
  }, [running, qc, skill.id]);

  if (cases.isLoading) return <Skeleton height={220} />;
  if (cases.isError || !cases.data) return <ErrorState body={t("loadError")} onRetry={() => cases.refetch()} />;

  const list = newestFirst(cases.data);
  const noCases = list.length === 0;
  const closeConfirm = () => {
    setConfirm(null);
    setChosen(undefined);
  };
  const refuse = (err: unknown) => {
    const key = err instanceof ApiError ? startRefusalKey(err.code) : null;
    toast.error(key ? t(key, { provider: pick?.provider ?? "" }) : err instanceof Error ? err.message : String(err));
  };
  const accept = () => {
    const c = confirm;
    if (c?.kind === "delete") {
      setConfirm(null);
      del.mutate({ id: c.c.id, owner });
      return;
    }
    if (!pick || !c) return;
    closeConfirm();
    if (c.kind === "runAll") {
      start.mutate({ skillId: skill.id, pick }, { onSuccess: () => toast.success(t("runStarted")), onError: refuse });
    } else {
      setRunningCase(c.c.id);
      runCase.mutate({ id: c.c.id, owner, pick }, { onError: refuse, onSettled: () => setRunningCase(null) });
    }
  };

  const picker = (
    <div style={s.pickerSlot}>
      <ModelPicker value={pick} onChange={setChosen} />
    </div>
  );

  return (
    <div style={s.wrap}>
      <div style={s.toolbar}>
        <span style={s.title}>{t("heading")}</span>
        <span style={s.pill}>{t("passingCount", { passed: passingCount(list), total: list.length })}</span>
        {progress && <span style={s.progress}>{t("progress", { done: progress.done, total: progress.total })}</span>}
        <span style={s.spacer} />
        <Button
          kind="secondary"
          size="sm"
          icon="Play"
          disabled={running || start.isPending || noCases}
          title={noCases ? t("emptyRunReason") : undefined}
          onClick={() => setConfirm({ kind: "runAll" })}
        >
          {t("runAll")}
        </Button>
        <Button kind="primary" size="sm" icon="Plus" onClick={() => setEditing({ existing: null })}>
          {t("newCase")}
        </Button>
      </div>
      {!skill.enabled && <div style={s.note}>{t("disabledNote")}</div>}

      {noCases ? (
        <div style={s.empty}>{t("empty")}</div>
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
        <ConfirmModal
          title={agentT("deleteTitle")}
          body={t("deleteBody", { name: confirm.c.name })}
          confirmLabel={agentT("deleteConfirm")}
          onConfirm={accept}
          onClose={closeConfirm}
        />
      )}
      {confirm?.kind === "run" && (
        <RunConfirm
          title={modalT("runConfirmTitle")}
          body={modalT("runConfirmBodySkill")}
          confirmLabel={agentT("run")}
          confirmDisabled={pick === null}
          onConfirm={accept}
          onClose={closeConfirm}
        >
          {!skill.enabled && <div style={s.note}>{t("disabledNote")}</div>}
          {picker}
        </RunConfirm>
      )}
      {confirm?.kind === "runAll" && (
        <RunConfirm
          title={t("confirmTitle")}
          body={t("confirmBody", { count: list.length })}
          confirmLabel={t("confirmRun")}
          confirmDisabled={pick === null}
          onConfirm={accept}
          onClose={closeConfirm}
        >
          {!skill.enabled && <div style={s.note}>{t("disabledNote")}</div>}
          {picker}
        </RunConfirm>
      )}
      {editing && (
        <EvalCaseModal
          key={editing.existing?.id ?? "new"}
          owner={owner}
          existing={editing.existing}
          onClose={() => setEditing(null)}
          onOpenExisting={(id) => setEditing({ existing: list.find((c) => c.id === id) ?? null })}
        />
      )}
    </div>
  );
}
