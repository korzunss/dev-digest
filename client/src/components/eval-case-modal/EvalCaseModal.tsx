/* EvalCaseModal — one modal for three cases: a draft seeded from a finding
   (unsaved, persists nothing until Save), a new hand-written case, and the
   edit of a saved case. Shared chrome: the FindingCard and the Evals tab both
   open it.

   Dirty and stale are derived from snapshots (initial values, what last ran),
   not tracked with effects. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput } from "@devdigest/ui";
import type { EvalCaseResult, EvalDraft, EvalPrMeta, EvalSuiteCase } from "@devdigest/shared";
import { ConfirmModal } from "@/components/confirm-modal";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useAgent } from "@/lib/hooks/agents";
import { useRunEvalCase, useRunEvalDraft, useSaveEvalCase, useUpdateEvalCase } from "@/lib/hooks/eval";
import { CaseInputTabs } from "./CaseInputTabs";
import { CaseRunResult } from "./CaseRunResult";
import { ExpectedOutputEditor } from "./ExpectedOutputEditor";
import { RunConfirmModal } from "./RunConfirmModal";
import { MODAL_WIDTH, evalsTabHref } from "./constants";
import {
  appendSkeleton, diffToPrFiles, existingCaseId, expectedKind, formatExpected, isStale,
  issuesFromError, lineLabel, parseExpected, type CaseIssue, type RunSnapshot,
} from "./helpers";
import { s } from "./styles";

export interface EvalCaseModalProps {
  agentId: string;
  /** A draft seeded from a finding — unsaved. */
  draft?: EvalDraft | null;
  /** A saved case, opened in edit mode. */
  existing?: EvalSuiteCase | null;
  onClose: () => void;
  /** Called with the case id when Save is refused as `case_exists`. */
  onOpenExisting?: (caseId: string) => void;
}

interface Run { result: EvalCaseResult; token: string | null; ran: RunSnapshot }

function initialValues(draft?: EvalDraft | null, existing?: EvalSuiteCase | null) {
  const src = existing ?? draft ?? null;
  return {
    name: src?.name ?? "",
    diff: src?.input.diff ?? "",
    expected: src ? formatExpected(src.expected) : "[]",
    prMeta: (src?.input.pr_meta ?? null) as EvalPrMeta | null,
    source: src?.source ?? null,
  };
}

export function EvalCaseModal({ agentId, draft, existing, onClose, onOpenExisting }: EvalCaseModalProps) {
  const t = useTranslations("eval.modal");
  const common = useTranslations("common");
  const toast = useToast();
  const { data: agent } = useAgent(agentId);
  const save = useSaveEvalCase();
  const update = useUpdateEvalCase();
  const runSaved = useRunEvalCase();
  const runDraft = useRunEvalDraft();

  const [initial] = React.useState(() => initialValues(draft, existing));
  const [name, setName] = React.useState(initial.name);
  const [diff, setDiff] = React.useState(initial.diff);
  const [expected, setExpected] = React.useState(initial.expected);
  const [run, setRun] = React.useState<Run | null>(() =>
    existing?.last_result ? { result: existing.last_result, token: null, ran: { diff: initial.diff, expected: initial.expected } } : null,
  );
  const [confirm, setConfirm] = React.useState<"run" | "discard" | null>(null);
  const [issues, setIssues] = React.useState<CaseIssue[]>([]);
  const [dupId, setDupId] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<{ name: string; kind: string } | null>(null);

  const files = React.useMemo(() => diffToPrFiles(diff), [diff]);
  const now: RunSnapshot = { diff, expected };
  const dirty = name !== initial.name || diff !== initial.diff || expected !== initial.expected;
  const stale = isStale(run?.ran ?? null, now);
  const busy = save.isPending || update.isPending || runSaved.isPending || runDraft.isPending;
  const seed = draft?.expected[0] ?? null;
  const askBeforeClose = existing ? dirty : dirty || run !== null;
  const discardTitle = existing ? t("discardChangesTitle") : t("discardDraftTitle");
  const discardBody = existing ? t("discardChangesBody") : t("discardDraftBody");

  const requestClose = () => (saved || !askBeforeClose ? onClose() : setConfirm("discard"));
  const fail = (e: unknown) => {
    setIssues(e instanceof Error ? issuesFromError(e as ApiError) : [{ message: String(e) }]);
    setDupId(e instanceof ApiError && e.code === "case_exists" ? existingCaseId(e.details) : null);
  };

  const doRun = () => {
    setConfirm(null);
    const parsed = parseExpected(expected);
    if (!parsed.ok) return setIssues([{ message: t("invalidJson", { message: parsed.message }) }]);
    setIssues([]);
    const snap = { ...now };
    if (existing && !dirty) {
      runSaved.mutate({ id: existing.id, agentId }, {
        onSuccess: (c) => setRun(c.last_result ? { result: c.last_result, token: null, ran: snap } : null),
        onError: fail,
      });
      return;
    }
    runDraft.mutate({ agentId, body: { input: { diff, pr_meta: initial.prMeta }, expected_output: parsed.value } }, {
      onSuccess: (r) => setRun({ result: r.result, token: r.run_token, ran: snap }),
      onError: fail,
    });
  };

  const doSave = () => {
    const parsed = parseExpected(expected);
    if (name.trim() === "") return setIssues([{ message: t("nameRequired") }]);
    if (!parsed.ok) return setIssues([{ message: t("invalidJson", { message: parsed.message }) }]);
    setIssues([]);
    setDupId(null);
    const body = {
      name,
      input: { diff, pr_meta: initial.prMeta },
      expected_output: parsed.value,
      ...(!existing && initial.source?.finding_id ? { source_finding_id: initial.source.finding_id } : {}),
      ...(run?.token && !stale ? { draft_run_token: run.token } : {}),
    };
    const done = (c: EvalSuiteCase) => {
      const kind = t(`kind.${expectedKind(parsed.value)}`);
      setSaved({ name: c.name, kind });
      toast.success(t("saved", { name: c.name, kind }));
    };
    if (existing) update.mutate({ id: existing.id, agentId, body }, { onSuccess: done, onError: fail });
    else save.mutate({ agentId, body }, { onSuccess: done, onError: fail });
  };

  const title = draft || existing ? t("title", { name: name || initial.name }) : t("newTitle");
  const subtitle = draft
    ? t(draft.seeded_from === "accepted" ? "subtitleAccepted" : "subtitleDismissed")
    : t("subtitleManual");
  const positive = seed?.expect === "must_find";

  return (
    <>
      <Modal
        width={MODAL_WIDTH}
        title={title}
        subtitle={subtitle}
        onClose={requestClose}
        footer={
          <div style={s.footer}>
            {saved ? (
              <Button kind="primary" onClick={onClose}>{t("close")}</Button>
            ) : (
              <>
                <Button kind="ghost" onClick={requestClose}>{common("actions.cancel")}</Button>
                <div style={s.footerSpacer} />
                <Button kind="secondary" icon="Play" onClick={() => setConfirm("run")} loading={runSaved.isPending || runDraft.isPending} disabled={busy}>
                  {t("run")}
                </Button>
                <Button kind="primary" onClick={doSave} loading={save.isPending || update.isPending} disabled={busy}>
                  {t("save")}
                </Button>
              </>
            )}
          </div>
        }
      >
        {saved ? (
          <div style={s.saved} role="status">
            <span>{t("saved", saved)}</span>
            <Link href={evalsTabHref(agentId)}>{t("savedLink")}</Link>
          </div>
        ) : (
          <div style={s.body}>
            {draft && seed && (
              <div style={positive ? s.bannerPositive : s.bannerNegative}>
                {t(positive ? "bannerPositive" : "bannerNegative", {
                  title: seed.title ?? "",
                  file: seed.file,
                  line: lineLabel(seed.start_line, seed.end_line),
                })}
              </div>
            )}
            <FormField label={t("nameLabel")} required>
              <TextInput value={name} onChange={setName} placeholder={t("namePlaceholder")} mono aria-label={t("nameLabel")} />
            </FormField>
            <FormField label={t("inputLabel")}>
              <CaseInputTabs diff={diff} onDiff={setDiff} files={files} prMeta={initial.prMeta} source={initial.source} />
            </FormField>
            <ExpectedOutputEditor
              value={expected}
              onChange={setExpected}
              onSkeleton={() => setExpected(appendSkeleton(expected, files[0]?.path ?? ""))}
            />
            <CaseRunResult result={run?.result ?? null} stale={stale} />
            {issues.length > 0 && (
              <div role="alert" style={s.errors}>
                {issues.map((i, n) => <p key={n} style={s.errorItem}>{i.message}</p>)}
                {dupId && onOpenExisting && (
                  <Button kind="secondary" size="sm" onClick={() => onOpenExisting(dupId)}>{t("openExisting")}</Button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
      {confirm === "run" && <RunConfirmModal model={agent?.model ?? ""} onConfirm={doRun} onClose={() => setConfirm(null)} />}
      {confirm === "discard" && (
        <ConfirmModal title={discardTitle} body={discardBody} confirmLabel={t("discard")} onConfirm={onClose} onClose={() => setConfirm(null)} />
      )}
    </>
  );
}
