/* FocusList — the review-focus card: heading with a count badge, then one row
   per item in the model's order; each file:line opens its line in the diff. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { s } from "../../styles";

export function FocusList({
  items,
  onOpen,
}: {
  items: ReviewFocusItem[];
  onOpen: (path: string, line: number | null) => void;
}) {
  const t = useTranslations("brief.prBrief");
  return (
    <div style={s.focusCard}>
      <h3 style={s.focusHeading}>
        <Icon.ListChecks size={14} />
        {t("reviewFocus")}
        <span role="note" aria-label={t("focusCount", { count: items.length })}>
          <Badge color="var(--accent-text)" bg="var(--accent-bg)">
            {items.length}
          </Badge>
        </span>
      </h3>
      {items.length === 0 ? (
        <p style={s.muted}>{t("noFocus")}</p>
      ) : (
        <ul style={s.focusList}>
          {items.map((item, i) => (
            <li key={`${item.file}:${item.line}-${i}`} style={s.focusItem}>
              <span aria-hidden="true" data-testid="focus-bullet" style={s.focusBullet}>
                ▸
              </span>
              <span>
                <button type="button" style={s.refButton} onClick={() => onOpen(item.file, item.line)}>
                  {`${item.file}:${item.line}`}
                </button>
                {` — ${item.reason}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
