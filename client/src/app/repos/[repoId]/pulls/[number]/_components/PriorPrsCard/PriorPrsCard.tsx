/* PriorPrsCard — merged PRs that touched the same files as this one. Forge
   support is partial, so `unsupported` / `unavailable` each get their own copy. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import type { Repo } from "@/lib/types";
import { forgePrUrl } from "@/lib/forge-urls";
import { usePrHistory } from "@/lib/hooks/blast";
import { s } from "./styles";

interface Props {
  prId: string | null | undefined;
  headSha: string | null | undefined;
  repo: Repo | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

export function PriorPrsCard({ prId, headSha, repo }: Props) {
  const t = useTranslations("blast");
  const { data, isLoading, isError } = usePrHistory(prId, headSha);

  let body: React.ReactNode;
  if (isLoading) body = <Skeleton height={40} />;
  else if (isError || !data) body = <div role="alert" style={s.errorLine}>{t("history.loadError")}</div>;
  else if (data.status === "unsupported") body = <div style={s.muted}>{t("history.unsupported")}</div>;
  else if (data.status === "unavailable") body = <div style={s.muted}>{t("history.unavailable")}</div>;
  else if (data.history.length === 0) body = <div style={s.muted}>{t("history.empty")}</div>;
  else {
    body = data.history.map((h) => (
      <div key={h.pr_number} style={s.row}>
        {repo ? (
          <a style={s.link} href={forgePrUrl(repo, h.pr_number)} target="_blank" rel="noreferrer">
            #{h.pr_number}
          </a>
        ) : (
          <span style={s.link}>#{h.pr_number}</span>
        )}
        <span style={s.title}>{h.title}</span>
        <span style={s.meta}>{h.author}</span>
        <span style={s.meta}>{formatDate(h.merged_at)}</span>
        <span style={s.meta}>{t("history.overlap", { count: h.files_overlap.length })}</span>
      </div>
    ));
  }

  return <div style={s.card}>{body}</div>;
}
