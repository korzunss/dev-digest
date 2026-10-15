/* TurnIntoEvalCase — the "Turn into eval case" action of a finding card.
   Disabled until the finding is accepted or dismissed (AC-9). A click asks the
   server for a seed (it writes nothing): a draft opens the EvalCaseModal on an
   unsaved case, an already-saved case opens in edit mode (AC-16), a refusal is
   shown as a toast and no modal opens (AC-14, AC-15). The child owns the modal
   state, so FindingCard's props do not change. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { EvalDraft, EvalSuiteCase, FindingRecord } from "@devdigest/shared";
import { EvalCaseModal } from "@/components/eval-case-modal";
import { ApiError } from "@/lib/api";
import { useEvalDraftSeed } from "@/lib/hooks/eval";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

/** What the open modal holds: an unsaved draft or a saved case. */
type Open = { agentId: string; draft: EvalDraft | null; existing: EvalSuiteCase | null };

const REFUSALS = ["no_diff_text", "agent_missing", "finding_undecided"] as const;

export function TurnIntoEvalCase({ finding }: { finding: FindingRecord }) {
  const t = useTranslations("eval.finding");
  const toast = useToast();
  const seed = useEvalDraftSeed();
  const [open, setOpen] = React.useState<Open | null>(null);
  const decided = !!finding.accepted_at || !!finding.dismissed_at;

  const refusal = (err: unknown): string => {
    const code = err instanceof ApiError ? err.code : undefined;
    const known = REFUSALS.find((c) => c === code);
    return known ? t(`refusal.${known}`, { file: finding.file }) : t("refusal.generic");
  };

  const load = () =>
    seed.mutate(finding.id, {
      onSuccess: (res) => {
        if (res.kind === "draft") setOpen({ agentId: res.draft.agent_id, draft: res.draft, existing: null });
        // A seed returns agent cases only; a skill case (no agent_id) has no agent modal to open.
        else if (res.case.agent_id) setOpen({ agentId: res.case.agent_id, draft: null, existing: res.case });
      },
      onError: (err) => toast.error(refusal(err)),
    });

  return (
    <>
      <span style={s.wrap} title={decided ? undefined : t("undecidedTooltip")}>
        <Button kind="ghost" size="sm" icon="FlaskConical" disabled={!decided || seed.isPending} onClick={load}>
          {seed.isPending ? t("opening") : t("action")}
        </Button>
      </span>
      {open && (
        <EvalCaseModal
          // A reopened case is a different modal state: remount, never mutate in place.
          key={open.existing?.id ?? "draft"}
          owner={{ kind: "agent", agentId: open.agentId }}
          draft={open.draft}
          existing={open.existing}
          onClose={() => setOpen(null)}
          // case_exists on Save: the finding now has a case, so the seed returns it.
          onOpenExisting={() => {
            setOpen(null);
            load();
          }}
        />
      )}
    </>
  );
}
