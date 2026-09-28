/* InlineFinding — an own card for the diff's inline annotation slot, built to
   match the "webhooks.ts" mockup (spec 007, D19-B): severity word + icon,
   title, category, a `line X-Y` range and confidence, rationale, suggested
   fix, Accept/Dismiss. The Agent runs tab's card is not modified.
   The × collapses the card into a one-line stub (D9-B) instead of hiding it;
   clicking the stub restores the full card. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  SEV,
  CategoryTag,
  ConfidenceNum,
  Button,
  Markdown,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { severityColor } from "@/lib/severity";
import { s } from "./styles";

/** "12" when single-line, else "12-15" (mirrors the Agent runs card's own line-label helper). */
function lineRange(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

export function InlineFinding({
  f,
  onAction,
  pending,
}: {
  f: FindingRecord;
  onAction?: (action: FindingActionKind) => void;
  pending?: boolean;
}) {
  const t = useTranslations("prReview");
  const [collapsed, setCollapsed] = React.useState(false);
  const sevColor = severityColor(f.severity);
  const sevMeta = SEV[f.severity as Severity];
  const SevIcon = Icon[sevMeta.icon];
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  const muted = accepted || dismissed;

  if (collapsed) {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={() => setCollapsed(false)}
        style={s.stub(sevColor)}
      >
        <span style={s.stubIcon(sevColor)}>
          <SevIcon size={13} />
        </span>
        <span style={s.sevWord(sevColor)}>{t(`smartDiff.lineLabel.${f.severity}`)}</span>
        <span style={s.stubTitle}>{f.title}</span>
      </button>
    );
  }

  return (
    <div style={s.card(sevColor, muted)}>
      <button
        type="button"
        aria-label={t("smartDiff.closeFinding")}
        onClick={() => setCollapsed(true)}
        style={s.closeBtn}
      >
        <Icon.X size={14} />
      </button>
      <div style={s.header}>
        <div style={s.iconSquare(sevMeta.bg, sevColor)}>
          <SevIcon size={14} />
        </div>
        <div style={s.headerMain}>
          <div style={s.titleRow}>
            <span style={s.sevWord(sevColor)}>{t(`smartDiff.lineLabel.${f.severity}`)}</span>
            <span style={s.title(muted)}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
          </div>
          <div style={s.metaRow}>
            <span>{t("smartDiff.lineRange", { range: lineRange(f) })}</span>
            <ConfidenceNum value={f.confidence} />
          </div>
        </div>
      </div>

      <div style={s.body}>
        <div style={s.prose}>
          <Markdown>{f.rationale}</Markdown>
        </div>
        {f.suggestion && (
          <div style={s.suggestionWrap}>
            <div style={s.suggestionLabel}>{t("finding.suggestedFix")}</div>
            <div style={s.prose}>
              <Markdown>{f.suggestion}</Markdown>
            </div>
          </div>
        )}

        <div style={s.actions}>
          <Button
            kind="secondary"
            size="sm"
            icon="Check"
            disabled={pending}
            active={accepted}
            onClick={() => onAction?.("accept")}
          >
            {t("finding.accept")}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            icon="X"
            disabled={pending}
            active={dismissed}
            onClick={() => onAction?.("dismiss")}
          >
            {t("finding.dismiss")}
          </Button>
        </div>
      </div>
    </div>
  );
}
