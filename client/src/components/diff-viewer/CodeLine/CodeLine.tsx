/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type DiffLineAnnotation } from "../annotations";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor, annotationLabelFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  markers = [],
  contents = [],
  showAnnotationContent = true,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Annotations whose range marks this line (bar + label pill). */
  markers?: DiffLineAnnotation[];
  /** Annotations whose content anchors on this line (S26: the last marked
      line of a range). */
  contents?: DiffLineAnnotation[];
  /** Gates only the injected `contents[].content` block (S19) — the
      marker bar and right-side label always render. */
  showAnnotationContent?: boolean;
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  // The bar/label come from the first marker that carries them — a
  // dismissed finding (no color/label, D4) never leads or shows one, even
  // when it's first in the list; `helpers.ts#toAnnotations` already sorts
  // undismissed findings worst-first.
  const marker = markers.find((a) => a.color && a.label);

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={lineRowFor(ln.kind, marker?.color)}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {marker?.color && marker.label && (
          <span style={annotationLabelFor(marker.color)}>
            {marker.icon}
            {marker.label}
          </span>
        )}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}

      {showAnnotationContent &&
        contents.map((a) => <React.Fragment key={a.id}>{a.content}</React.Fragment>)}
    </div>
  );
}
