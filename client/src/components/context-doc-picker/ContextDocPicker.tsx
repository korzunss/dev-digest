/* ContextDocPicker — choose which project-context documents an agent or a
   skill carries into a prompt.

   Shared by both editors: every document of the repo is listed, the checkbox
   is the attachment, attached ones come first in their stored order, and every
   change reports the WHOLE ordered path array through `onChange` — the order
   is the order the documents reach the model, so it is part of the value, not
   a separate operation. The two pure list operations are the agent editor's
   SkillsTab ones, imported rather than re-derived.

   The owner decides what a change does (which mutation, which id); the picker
   only fetches the listing and shows the preview, and it must be rendered with
   a real repo id. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Modal, Skeleton } from "@devdigest/ui";
import { DocPreview } from "@/components/context-doc-preview";
import { useContextDocs } from "@/lib/hooks/context";
import { moveId, toggleAttachment } from "@/lib/attachment-order";
import { PREVIEW_WIDTH } from "./constants";
import { DocRow } from "./DocRow";
import { buildRows, filterRows, totalTokens, type InheritedDoc } from "./helpers";
import { s } from "./styles";

export function ContextDocPicker({
  repoId,
  attached,
  onChange,
  inherited = [],
  hint,
  extraHeader,
  saveFailed = false,
}: {
  repoId: string;
  /** Own attached paths, in prompt order. */
  attached: string[];
  /** Receives the whole new ordered list. */
  onChange: (paths: string[]) => void;
  /** Documents that arrive through a skill: shown, never editable here. */
  inherited?: InheritedDoc[];
  hint?: string;
  extraHeader?: React.ReactNode;
  /** The owner's last save failed (and was rolled back): say so under the list. */
  saveFailed?: boolean;
}) {
  const t = useTranslations("context");
  const { data, isLoading, isError, refetch } = useContextDocs(repoId);

  const [search, setSearch] = React.useState("");
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);

  if (isLoading) return <Skeleton height={180} />;
  if (isError) return <ErrorState body={t("preview.loadError")} onRetry={() => refetch()} />;

  const docs = data?.docs ?? [];
  const allRows = buildRows(docs, attached, inherited);
  const rows = filterRows(allRows, search);

  const move = (path: string, delta: number) => {
    const from = attached.indexOf(path);
    if (from !== -1) onChange(moveId(attached, from, from + delta));
  };
  const dropOn = (target: string) => {
    const from = dragging === null ? -1 : attached.indexOf(dragging);
    const to = attached.indexOf(target);
    if (from !== -1 && to !== -1 && from !== to) onChange(moveId(attached, from, to));
    setDragging(null);
  };

  const handlers = {
    onToggle: (path: string) => onChange(toggleAttachment(attached, path)),
    onPreview: setPreview,
    onMove: move,
    onDragStart: setDragging,
    onDragEnd: () => setDragging(null),
    onDrop: dropOn,
  };

  if (allRows.length === 0) {
    return (
      <EmptyState
        icon="FileText"
        title={t("picker.empty.title")}
        body={
          <>
            {t("picker.empty.body")}{" "}
            <Link href={`/repos/${repoId}/context`}>{t("picker.empty.cta")}</Link>
          </>
        }
      />
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("picker.count", { attached: attached.length, listed: docs.length })}
        </Badge>
        <span style={s.tokens}>{t("picker.tokens", { tokens: totalTokens(allRows) })}</span>
        <span style={s.spacer} />
        {extraHeader}
        <div style={s.filter}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("picker.filterPlaceholder")}
            aria-label={t("picker.filterLabel")}
            style={s.filterInput}
          />
        </div>
      </div>
      {hint && <div style={s.hint}>{hint}</div>}

      {rows.length === 0 ? (
        <div style={s.empty}>{t("picker.noMatches")}</div>
      ) : (
        <div style={s.list}>
          {rows.map((row) => (
            <DocRow
              key={row.path}
              row={row}
              dragging={dragging === row.path}
              anyDragging={dragging !== null}
              handlers={handlers}
            />
          ))}
        </div>
      )}
      {data?.truncated && <div style={s.note}>{t("picker.truncated")}</div>}
      {saveFailed && (
        <div role="alert" style={s.saveFailed}>
          {t("picker.saveFailed")}
        </div>
      )}

      {preview !== null && (
        <Modal width={PREVIEW_WIDTH} title={preview} onClose={() => setPreview(null)}>
          <div style={s.previewBody}>
            <DocPreview repoId={repoId} path={preview} />
          </div>
        </Modal>
      )}
    </div>
  );
}

export default ContextDocPicker;
