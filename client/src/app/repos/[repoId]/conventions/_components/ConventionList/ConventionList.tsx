/* ConventionList — the candidate list and the decisions taken over the whole
   of it: the one bulk button, the running "N of M accepted" count, and the
   Create-skill entry point.

   The list owns no data. Every decision leaves through `onUpdate` so the page
   holds the single mutation, and the modal is the page's business too — this
   component only reports that the button was pressed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import { ConventionCard } from "../ConventionCard";
import { acceptedCount, bulkAction } from "./helpers";
import { s } from "./styles";

export function ConventionList({
  candidates,
  repoFullName,
  commitSha,
  onUpdate,
  savingId,
  onCreateSkill,
  creatingSkill,
}: {
  candidates: ConventionCandidate[];
  repoFullName?: string | null;
  commitSha?: string | null;
  onUpdate?: (id: string, patch: { rule?: string; status?: ConventionStatus }) => void;
  /** The candidate whose decision is currently in flight, if any. */
  savingId?: string | null;
  onCreateSkill?: () => void;
  creatingSkill?: boolean;
}) {
  const t = useTranslations("conventions");

  const accepted = acceptedCount(candidates);
  const bulk = bulkAction(candidates);

  return (
    <div style={s.wrap}>
      <div style={s.toolbar}>
        <Button
          kind="ghost"
          size="sm"
          icon="ListChecks"
          disabled={bulk.ids.length === 0}
          onClick={() => bulk.ids.forEach((id) => onUpdate?.(id, { status: bulk.next }))}
        >
          {bulk.next === "accepted" ? t("selection.selectAll") : t("selection.deselectAll")}
        </Button>
        <span className="tnum" style={s.count}>
          {t("selection.accepted", { count: accepted, total: candidates.length })}
        </span>
        <div style={s.toolbarActions}>
          <Button
            kind="primary"
            icon="Sparkles"
            disabled={accepted === 0}
            // The disabled button is the only place that can explain itself,
            // so the reason rides on the title rather than sitting in a hint
            // nobody reads once the list is long.
            title={accepted === 0 ? t("selection.createSkillDisabled") : undefined}
            aria-haspopup="dialog"
            aria-expanded={!!creatingSkill}
            onClick={onCreateSkill}
          >
            {t("selection.createSkill")}
          </Button>
        </div>
      </div>

      <div style={s.list}>
        {candidates.map((c) => (
          <ConventionCard
            key={c.id}
            candidate={c}
            repoFullName={repoFullName}
            commitSha={commitSha}
            saving={savingId === c.id}
            onUpdate={(patch) => onUpdate?.(c.id, patch)}
          />
        ))}
      </div>
    </div>
  );
}
