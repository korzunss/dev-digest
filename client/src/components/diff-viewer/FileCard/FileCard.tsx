/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { partitionAnnotations, annotationsForLine, type DiffAnnotationApi, type DiffLineAnnotation } from "../annotations";
import { s, chevronFor, fileHeaderFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { TARGET_HIGHLIGHT_MS, type DiffTarget } from "../target";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  annotations,
  target,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  annotations?: DiffAnnotationApi;
  /** Navigation request; applied once per nonce when its path is this file. */
  target?: DiffTarget | null;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Target apply rule: open, then either hand the nonce to the matching row
  // (CodeLine scrolls) or, with no line / no such row, scroll the header.
  const headerRef = React.useRef<HTMLDivElement>(null);
  const applied = React.useRef<number | null>(null);
  const [headerHighlighted, setHeaderHighlighted] = React.useState(false);
  const isTarget = target?.path === file.path;
  const targetLine = isTarget ? target.line : null;
  const lineMatches =
    targetLine != null && lines.some((ln) => ln.kind !== "hunk" && ln.newNo === targetLine);
  const nonce = isTarget ? target.nonce : null;
  React.useEffect(() => {
    if (nonce == null || nonce === applied.current) return;
    applied.current = nonce;
    setOpen(true);
    if (!lineMatches) {
      headerRef.current?.scrollIntoView({ block: "center" });
      setHeaderHighlighted(true);
    }
  }, [nonce, lineMatches]);
  React.useEffect(() => {
    if (!headerHighlighted) return;
    const id = setTimeout(() => setHeaderHighlighted(false), TARGET_HIGHLIGHT_MS);
    return () => clearTimeout(id);
  }, [headerHighlighted]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  // Same split for finding-agnostic annotations (S12/S26): per-line markers
  // (bar + label pill) vs. content (anchored under the last marked line of a
  // range) vs. "unanchored" (no line of the range is rendered).
  const {
    markers: matchedMarkers,
    content: matchedContent,
    unanchored: unanchoredAnnotations,
  }: {
    markers: Map<string, DiffLineAnnotation[]>;
    content: Map<string, DiffLineAnnotation[]>;
    unanchored: DiffLineAnnotation[];
  } = React.useMemo(() => {
    const fileItems = annotations?.items.filter((a) => a.path === file.path) ?? [];
    if (fileItems.length === 0) return { markers: new Map(), content: new Map(), unanchored: [] };
    return partitionAnnotations(fileItems, lines);
  }, [annotations, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;
  const hasMarker = !!annotations?.markedPaths.has(file.path);
  // S19: the toggle hides injected content (cards, the unanchored block) but
  // never the header dot or the per-line bar/label.
  const showContent = annotations?.showContent ?? true;

  return (
    <div style={s.fileCard}>
      <div ref={headerRef} onClick={() => setOpen((o) => !o)} style={fileHeaderFor(headerHighlighted)}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        {hasMarker && <span style={s.markerDot} aria-label={annotations!.markerLabel} />}
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                markers={annotationsForLine(ln, matchedMarkers)}
                contents={annotationsForLine(ln, matchedContent)}
                showAnnotationContent={showContent}
                targetNonce={lineMatches && ln.kind !== "hunk" && ln.newNo === targetLine ? nonce : null}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {annotations && showContent && unanchoredAnnotations.length > 0 && (
            <div style={s.unanchoredWrap}>
              <span style={s.unanchoredTitle}>{annotations.unanchoredTitle}</span>
              {unanchoredAnnotations.map((a) => (
                <React.Fragment key={a.id}>{a.content}</React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
