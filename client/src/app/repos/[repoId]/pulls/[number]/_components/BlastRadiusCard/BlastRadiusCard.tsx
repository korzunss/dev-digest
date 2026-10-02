/* BlastRadiusCard — what a PR's changes affect: summary counts, a collapsible
   tree of changed symbol → callers → endpoints/crons, and a degraded notice
   with a resync action when the repo index could not answer fully. The caller
   (`OverviewTab`) owns the section label above it. */
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, Skeleton } from "@devdigest/ui";
import type { Repo } from "@/lib/types";
import { useBlastRadius } from "@/lib/hooks/blast";
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

  return (
    <div style={s.card}>
      {isLoading ? (
        <Skeleton height={40} />
      ) : isError || !data ? (
        <div role="alert" style={s.errorLine}>
          <Icon.AlertTriangle size={14} /> {t("loadError")}
        </div>
      ) : (
        <>
          {data.degraded && <BlastDegradedNotice reason={data.reason} repoId={repo?.id} prId={prId} />}
          <BlastSummary data={data} />
          {data.downstream.length === 0 ? (
            <div>
              <div style={s.muted}>{t("noDownstream", { count: data.changed_symbols.length })}</div>
              <div style={s.muted}>{t("empty")}</div>
            </div>
          ) : (
            <>
              <div style={s.toggle}>
                {(["tree", "graph"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    style={view === v ? { ...s.toggleButton, ...s.toggleButtonActive } : s.toggleButton}
                    onClick={() => setView(v)}
                  >
                    {t(`view.${v}`)}
                  </button>
                ))}
              </div>
              {view === "tree" ? <BlastTree data={data} headSha={headSha} repo={repo} /> : <BlastGraph data={data} />}
            </>
          )}
        </>
      )}
    </div>
  );
}
