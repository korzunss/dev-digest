/* ConventionCard — one extracted house rule and the decision it is waiting on:
   the rule itself (editable in place), its category, how sure the model was,
   and the code that proves it exists.

   The evidence link is pinned to the SCAN's commit, never to the default
   branch. Every candidate here survived the grounding gate, which means the
   snippet was found in that file at that line *in that commit* — a link to
   `main` would slide off the cited line the next time someone pushes, and the
   card would then be quietly lying about its own evidence. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, IconBtn, MonoLink, ProgressBar, TextInput } from "@devdigest/ui";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { CATEGORY_COLOR } from "./constants";
import { confidenceColor, confidencePct, evidenceLabel } from "./helpers";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  repoFullName,
  commitSha,
  onUpdate,
  saving,
}: {
  candidate: ConventionCandidate;
  repoFullName?: string | null;
  /** The commit the scan read. Without it there is no honest link to build. */
  commitSha?: string | null;
  onUpdate?: (patch: { rule?: string; status?: ConventionStatus }) => void;
  saving?: boolean;
}) {
  const t = useTranslations("conventions");

  // `null` means "not editing" — one piece of state instead of a flag plus a
  // buffer that has to be re-synced every time the rule changes underneath.
  const [draft, setDraft] = React.useState<string | null>(null);

  const accepted = candidate.status === "accepted";
  const rejected = candidate.status === "rejected";
  const accent = CATEGORY_COLOR[candidate.category];
  const pct = confidencePct(candidate.confidence);
  const label = evidenceLabel(candidate);
  const href =
    repoFullName && commitSha
      ? githubBlobUrl(
          repoFullName,
          commitSha,
          candidate.evidence_path,
          candidate.evidence_line,
          candidate.evidence_end_line,
        )
      : undefined;

  const save = () => {
    const next = (draft ?? "").trim();
    // An unchanged rule is not an edit; writing it would bump the row and the
    // skill body for nothing.
    if (next && next !== candidate.rule) onUpdate?.({ rule: next });
    setDraft(null);
  };

  return (
    <div style={s.card(accent, rejected)}>
      <div style={s.main}>
        {draft !== null ? (
          <div style={s.editRow}>
            <TextInput value={draft} onChange={setDraft} aria-label={t("card.edit")} />
            <div style={s.editActions}>
              <Button kind="primary" size="sm" disabled={!draft.trim()} onClick={save}>
                {t("card.save")}
              </Button>
              <Button kind="ghost" size="sm" onClick={() => setDraft(null)}>
                {t("card.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div style={s.ruleRow}>
            <span style={s.rule(rejected)}>{candidate.rule}</span>
            <span style={s.categoryChip(accent)}>{t(`category.${candidate.category}`)}</span>
            {/* No "Accepted"/"Rejected" tag here: the decision buttons already
                say it, and a second copy of the same word is how `getByText`
                starts reporting duplicates (client/INSIGHTS.md). */}
            <IconBtn
              icon="Edit"
              size={24}
              label={t("card.edit")}
              onClick={() => setDraft(candidate.rule)}
            />
          </div>
        )}

        <div style={s.evidence}>
          <div style={s.evidenceHead}>
            <Icon.Code size={12} />
            <MonoLink href={href}>{label}</MonoLink>
          </div>
          <pre className="mono" style={s.snippet}>
            {candidate.evidence_snippet}
          </pre>
        </div>

        <div style={s.confidenceRow}>
          <span style={s.confidenceLabel}>{t("card.confidence")}</span>
          <div style={s.confidenceTrack}>
            <ProgressBar value={pct} color={confidenceColor(pct)} height={4} />
          </div>
          <span className="mono tnum" style={s.confidenceValue}>
            {pct}%
          </span>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind="secondary"
          size="sm"
          icon="Check"
          active={accepted}
          disabled={saving}
          onClick={() => onUpdate?.({ status: accepted ? "pending" : "accepted" })}
        >
          {accepted ? t("card.accepted") : saving ? t("card.accepting") : t("card.acceptAsSkill")}
        </Button>
        <Button
          kind="ghost"
          size="sm"
          icon="X"
          active={rejected}
          disabled={saving}
          onClick={() => onUpdate?.({ status: rejected ? "pending" : "rejected" })}
        >
          {rejected ? t("card.rejected") : t("card.reject")}
        </Button>
      </div>
    </div>
  );
}
