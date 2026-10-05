/* ContextDocList — the repo's context documents on the Project Context page:
   path, type and token count per row, one selected at a time, plus Refresh.
   Presentational: the page owns the listing request and the selection.

   Two empty states, because they ask for different things: a repo that is not
   cloned yet cannot have documents (sync it), while a cloned one with none
   matching is a search-roots question (edit them below). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState } from "@devdigest/ui";
import type { SpecFile } from "@devdigest/shared";
import { DEFAULT_DOC_TYPE } from "@/components/context-doc-picker";
import { s } from "./styles";

export function ContextDocList({
  docs,
  truncated,
  cloned,
  selected,
  refreshing,
  onSelect,
  onRefresh,
}: {
  docs: SpecFile[];
  truncated: boolean;
  /** Whether the repo has a local clone at all. */
  cloned: boolean;
  selected: string | null;
  refreshing?: boolean;
  onSelect: (path: string) => void;
  onRefresh: () => void;
}) {
  const t = useTranslations("context");

  return (
    <div style={s.wrap}>
      <div style={s.toolbar}>
        <span style={s.count}>{t("page.docCount", { count: docs.length })}</span>
        <Button kind="secondary" icon="RefreshCw" loading={refreshing} onClick={onRefresh}>
          {t("page.refresh")}
        </Button>
      </div>

      {docs.length === 0 ? (
        <EmptyState
          icon="FileText"
          title={cloned ? t("page.noMatches.title") : t("page.notCloned.title")}
          body={cloned ? t("page.noMatches.body") : t("page.notCloned.body")}
        />
      ) : (
        <div style={s.list}>
          {docs.map((d) => (
            <button
              key={d.path}
              type="button"
              style={s.row(d.path === selected)}
              aria-pressed={d.path === selected}
              onClick={() => onSelect(d.path)}
            >
              <span className="mono" style={s.path}>
                {d.path}
              </span>
              <Badge color="var(--text-secondary)">{t(`picker.types.${d.type ?? DEFAULT_DOC_TYPE}`)}</Badge>
              <span style={s.tokens}>
                {d.tokens == null ? "—" : t("picker.tokensValue", { tokens: d.tokens })}
              </span>
            </button>
          ))}
        </div>
      )}
      {truncated && <div style={s.note}>{t("picker.truncated")}</div>}
    </div>
  );
}
