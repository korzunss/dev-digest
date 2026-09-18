/* SeverityCounter — how many findings, per level, and a way to see just those.
   Spec 002. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Severity, SeverityCounts } from "@devdigest/shared";
import { SEVERITY_LEVELS, SEVERITY_META, SEVERITY_COUNT_KEY, isAllZero } from "@/lib/severity";
import { s } from "./styles";

/**
 * Lives in `src/components/` rather than beside a route for the same reason
 * `RunCostBadge` does: the PR list's FINDINGS column and the PR detail's run
 * timeline both render it, and they must not drift on which icon means which
 * level.
 *
 *  - `cell`   the PR-list column
 *  - `inline` the timeline run row, where it replaces "3 finding(s)"
 *
 * Three states that must stay visually distinct:
 *  - `counts == null` → "—", the PR/run was never reviewed;
 *  - all zero         → "0", reviewed and clean;
 *  - otherwise        → a chip per NON-ZERO level; a level at 0 renders nothing,
 *    because "⊙0" reads as a problem at a glance and an absence does not.
 */
export function SeverityCounter({
  counts,
  variant = "cell",
  active = null,
  onSelect,
}: {
  counts: SeverityCounts | null | undefined;
  variant?: "cell" | "inline";
  /** The level currently filtered, if any — drives `aria-pressed` + the outline. */
  active?: Severity | null;
  /** Omit for a static counter: no button chrome, nothing clickable. */
  onSelect?: (severity: Severity) => void;
}) {
  const t = useTranslations("prReview");
  const inline = variant === "inline";

  if (counts == null) {
    return (
      <span style={s.muted} title={t("severity.neverReviewed")}>
        —
      </span>
    );
  }
  if (isAllZero(counts)) {
    return (
      <span style={s.muted} title={t("severity.none")}>
        0
      </span>
    );
  }

  return (
    <span style={s.row(inline)}>
      {SEVERITY_LEVELS.map((level) => {
        const count = counts[SEVERITY_COUNT_KEY[level]];
        if (count === 0) return null;
        const meta = SEVERITY_META[level];
        const Glyph = Icon[meta.icon];
        const label = t(`severity.${meta.labelKey}`);
        const isActive = active === level;
        const body = (
          <>
            <Glyph size={inline ? 12 : 13} />
            <span style={s.count}>{count}</span>
          </>
        );

        if (!onSelect) {
          return (
            <span
              key={level}
              style={s.chip(meta.color, isActive, false)}
              title={t("severity.count", { count, severity: label })}
            >
              {body}
            </span>
          );
        }

        const action = t("severity.filterTo", { count, severity: label });
        return (
          <button
            key={level}
            type="button"
            aria-pressed={isActive}
            aria-label={action}
            title={action}
            onClick={(e) => {
              // The PR-list row is itself a click target that navigates; without
              // this the row's unfiltered navigation fires too, and wins.
              e.stopPropagation();
              onSelect(level);
            }}
            style={{
              ...s.chip(meta.color, isActive, true),
              textDecoration: "underline",
              textDecorationStyle: "dotted",
              textUnderlineOffset: 3,
            }}
          >
            {body}
          </button>
        );
      })}
    </span>
  );
}

export default SeverityCounter;
