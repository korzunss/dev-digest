/* ContextTab — the project-context documents this skill carries into a prompt.

   This IS the agent editor's SkillsTab over a different list: every document in
   the repo is shown, the checkbox is the attachment, attached ones float to the
   top in their stored order, and every change posts the WHOLE ordered path
   array — the order is the order the documents reach the model, so it is part
   of the value rather than a separate operation. The two pure list operations
   are imported from that tab rather than re-derived; only the three helpers
   that key on `path` instead of `id` are local.

   Documents are per-REPO (a link stores a path, and a path only means something
   inside one repo), so the tab follows the shell's active repo. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, EmptyState, ErrorState, Icon, IconBtn, Modal, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import {
  useContextDoc,
  useContextDocs,
  useSetSkillContext,
  useSkillContext,
} from "../../../../../../../lib/hooks/skills";
import { useActiveRepo } from "../../../../../../../lib/repo-context";
import {
  moveId,
  toggleAttachment,
} from "../../../../../../agents/[id]/_components/AgentEditor/_components/SkillsTab";
import { CONTEXT_HEADING, PREVIEW_WIDTH } from "./constants";
import {
  attachedPaths,
  docFolder,
  docName,
  filterDocs,
  folderTag,
  orderedDocs,
  untrustedMarker,
} from "./helpers";
import { s } from "./styles";

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const { repoId } = useActiveRepo();

  const { data: docs, isLoading, isError, refetch } = useContextDocs(repoId);
  const { data: links } = useSkillContext(skill.id);
  const setContext = useSetSkillContext();

  const [search, setSearch] = React.useState("");
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);

  // Lazily enabled — `useContextDoc` is inert until the eye button names a
  // path, so opening the tab fetches the LISTING and never a document body.
  const doc = useContextDoc(repoId, preview);

  const attached = attachedPaths(links);
  const rows = filterDocs(orderedDocs(docs ?? [], attached), search);

  const commit = (paths: string[]) => setContext.mutate({ id: skill.id, paths });

  const move = (path: string, delta: number) => {
    const from = attached.indexOf(path);
    if (from === -1) return;
    commit(moveId(attached, from, from + delta));
  };

  const dropOn = (targetPath: string) => {
    if (!dragging || dragging === targetPath) return;
    const from = attached.indexOf(dragging);
    const to = attached.indexOf(targetPath);
    if (from === -1 || to === -1) return;
    commit(moveId(attached, from, to));
  };

  // Three different nothings, and they must not share copy: no repo selected,
  // a repo carrying no documents, and documents that exist but none attached.
  // Only the last one is "No context attached".
  if (!repoId) {
    return <EmptyState icon="FileText" title={t("context.noRepo.title")} body={t("context.noRepo.body")} />;
  }
  if (isLoading) return <Skeleton height={180} />;
  if (isError) return <ErrorState body={t("context.loadError")} onRetry={() => refetch()} />;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.title}>{t("context.title")}</span>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("context.attached", { count: attached.length })}
        </Badge>
        <span style={s.spacer} />
        <div style={s.filter}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("context.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <div style={s.hint}>{t("context.hint")}</div>

      {(docs ?? []).length === 0 ? (
        <EmptyState icon="FileText" title={t("context.noDocs.title")} body={t("context.noDocs.body")} />
      ) : rows.length === 0 ? (
        <div style={s.empty}>{tc("states.empty")}</div>
      ) : (
        <div style={s.list}>
          {rows.map((d) => {
            const isAttached = attached.includes(d.path);
            const tag = folderTag(d.path);
            return (
              <div
                key={d.path}
                draggable={isAttached}
                onDragStart={() => setDragging(d.path)}
                onDragEnd={() => setDragging(null)}
                onDragOver={(e) => {
                  if (isAttached && dragging) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOn(d.path);
                  setDragging(null);
                }}
                style={s.row(isAttached, dragging === d.path)}
              >
                {/* A drag handle alone is unreachable without a pointer, so the
                    same control moves the row with the arrow keys. */}
                <button
                  type="button"
                  disabled={!isAttached}
                  aria-label={`Reorder ${d.path}`}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      move(d.path, -1);
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      move(d.path, 1);
                    }
                  }}
                  style={s.handle(isAttached)}
                >
                  <Icon.ChevronsUpDown size={14} />
                </button>

                <Checkbox
                  checked={isAttached}
                  onChange={() => commit(toggleAttachment(attached, d.path))}
                />

                <span className="mono" style={s.name}>
                  {docName(d.path)}
                </span>
                <span className="mono" style={s.folder}>
                  {docFolder(d.path)}
                </span>

                {tag !== "" && <Badge color="var(--text-secondary)">{tag}</Badge>}
                <IconBtn
                  icon="Eye"
                  size={26}
                  label={t("context.previewTitle", { path: d.path })}
                  onClick={() => setPreview(d.path)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* What the prompt actually gets. The heading is the engine's real one
          and each line names a document, followed by the delimiter its FULL
          text is wrapped in — the box summarises which documents are sent, and
          the marker is what stops that summary reading as "paths only". */}
      <div style={s.box}>
        <div style={s.boxLabel}>{t("context.serializesAs")}</div>
        {attached.length === 0 ? (
          <div style={s.boxEmpty}>{t("context.empty.title")}</div>
        ) : (
          <div className="mono" style={s.code}>
            <div style={s.heading}>{CONTEXT_HEADING}</div>
            {attached.map((p, i) => (
              <div key={p} style={s.codeRow}>
                <span style={s.path}>{`- ${p}`}</span>
                <span style={s.marker}>{untrustedMarker(i)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {preview !== null && (
        <Modal
          width={PREVIEW_WIDTH}
          title={t("context.previewTitle", { path: preview })}
          onClose={() => setPreview(null)}
        >
          <div style={s.previewBody}>
            {doc.isLoading ? (
              <Skeleton height={140} />
            ) : doc.isError ? (
              <ErrorState body={t("context.loadError")} onRetry={() => doc.refetch()} />
            ) : (
              <pre className="mono" style={s.previewPre}>
                {doc.data?.content ?? ""}
              </pre>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
