/* BlastRadiusCard — what a PR's changes affect: a heading, summary counts with
   a Tree/Graph toggle, a collapsible tree of changed symbol → callers →
   endpoints/crons, a degraded notice with a resync action, and the Prior PRs
   panel at the bottom of the same frame. */
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { Repo } from "@/lib/types";
import { useBlastRadius } from "@/lib/hooks/blast";
import { PriorPrsCard } from "../PriorPrsCard";
import { BlastDegradedNotice } from "./BlastDegradedNotice";
import { BlastSummary } from "./BlastSummary";
import { BlastGraph } from "./BlastGraph";
import { BlastTree } from "./BlastTree";
import { s } from "./styles";

interface Props {
  prId: string | null | undefined;
  headSha: string | null | undefined;
  repo: Repo | null;
}

export function BlastRadiusCard({ prId, headSha, repo }: Props) {
  const t = useTranslations("blast");
  const [view, setView] = useState<"tree" | "graph">("tree");
  const { data, isLoading, isError } = useBlastRadius(prId, headSha);
  const empty = !!data && data.downstream.length === 0;

  return (
    <div style={s.card}>
      <SectionLabel icon="Workflow">{t("title")}</SectionLabel>
      {isLoading ? (
        <Skeleton height={40} />
      ) : isError || !data ? (
        <div role="alert" style={s.errorLine}>
          <Icon.AlertTriangle size={14} /> {t("loadError")}
        </div>
      ) : (
        <>
          {data.degraded && <BlastDegradedNotice reason={data.reason} repoId={repo?.id} prId={prId} />}
          <div style={s.headRow}>
            <BlastSummary data={data} />
            <div role="group" style={s.toggle}>
              {(["tree", "graph"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  disabled={empty}
                  style={view === v ? s.toggleButtonActive : s.toggleButton}
                  onClick={() => setView(v)}
                >
                  {t(`view.${v}`)}
                </button>
              ))}
            </div>
          </div>
          {empty ? (
            <div>
              <div style={s.muted}>{t("noDownstream", { count: data.changed_symbols.length })}</div>
              <div style={s.muted}>{t("empty")}</div>
            </div>
          ) : view === "tree" ? (
            <BlastTree data={data} headSha={headSha} repo={repo} />
          ) : (
            <BlastGraph data={data} />
          )}
        </>
      )}
      <div style={s.divider} />
      <PriorPrsCard prId={prId} headSha={headSha} repo={repo} />
    </div>
  );
}
