/* FindingsPreview — what the counter is counting, on hover. Spec 002. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  type Severity as UiSeverity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { severityOrder } from "@/lib/severity";
import { s } from "./styles";

/** At most this many findings render; the rest become a "+N more" line. */
export const PREVIEW_LIMIT = 4;

/** Card geometry — used to decide whether it still fits below the trigger. */
const CARD_WIDTH = 400;
const CARD_MAX_HEIGHT = 360;
const GAP = 6;
const EDGE = 12;

function lineLabel(f: FindingRecord): string {
  return f.end_line !== f.start_line ? `${f.start_line}-${f.end_line}` : `${f.start_line}`;
}

/**
 * Wraps a counter and shows its findings on hover or keyboard focus.
 *
 * Two things force a portal rather than an absolutely-positioned child: the PR
 * list's table card sets `overflow: hidden`, which would clip the popover at the
 * row edge, and rows near the bottom of the viewport need the card flipped above
 * the trigger. Both are impossible from inside the row.
 *
 * The caller owns the data. `onOpenChange` fires before anything renders, which
 * is what lets the PR list defer its fetch until someone actually hovers.
 */
export function FindingsPreview({
  findings,
  loading = false,
  scope,
  onOpenChange,
  children,
}: {
  findings?: FindingRecord[] | null;
  loading?: boolean;
  /** Decides the header: all of a PR's findings, or one run's. */
  scope: "pr" | "run";
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  const open = React.useCallback(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const below = rect.bottom + GAP;
    const flip = below + CARD_MAX_HEIGHT > window.innerHeight;
    setPos({
      top: flip ? Math.max(EDGE, rect.top - CARD_MAX_HEIGHT - GAP) : below,
      left: Math.max(EDGE, Math.min(rect.left, window.innerWidth - CARD_WIDTH - EDGE)),
    });
    onOpenChange?.(true);
  }, [onOpenChange]);

  const close = React.useCallback(() => {
    setPos(null);
    onOpenChange?.(false);
  }, [onOpenChange]);

  React.useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pos, close]);

  // Dismissed findings are excluded here for the same reason they are excluded
  // from the counts — the card and the number beside it must never disagree.
  const shown = React.useMemo(
    () =>
      [...(findings ?? [])]
        .filter((f) => !f.dismissed_at)
        .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity)),
    [findings],
  );

  const hasCard = pos != null && (loading || shown.length > 0);

  return (
    <span
      ref={ref}
      style={s.trigger}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocusCapture={open}
      onBlurCapture={close}
    >
      {children}
      {hasCard &&
        typeof document !== "undefined" &&
        createPortal(
          <div role="tooltip" style={s.card(pos!.top, pos!.left)}>
            <div style={s.header}>
              <Icon.AlertOctagon size={13} />
              {scope === "run"
                ? t("severity.previewHeaderRun", { count: shown.length })
                : t("severity.previewHeader", { count: shown.length })}
            </div>
            {loading && shown.length === 0 ? (
              <div style={s.loading}>{t("severity.previewLoading")}</div>
            ) : (
              <>
                {shown.slice(0, PREVIEW_LIMIT).map((f, i) => (
                  <div key={f.id} style={s.item(i === 0)}>
                    <div style={s.titleRow}>
                      <SeverityBadge severity={f.severity as UiSeverity} compact />
                      <span style={s.title}>{f.title}</span>
                      <CategoryTag category={f.category as Category} />
                    </div>
                    <div style={s.metaRow}>
                      <MonoLink>
                        {f.file}:{lineLabel(f)}
                      </MonoLink>
                      <ConfidenceNum value={f.confidence} />
                    </div>
                    <div style={s.rationale}>{f.rationale}</div>
                  </div>
                ))}
                {shown.length > PREVIEW_LIMIT && (
                  <div style={s.more}>
                    {t("severity.previewMore", { count: shown.length - PREVIEW_LIMIT })}
                  </div>
                )}
              </>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}

export default FindingsPreview;
