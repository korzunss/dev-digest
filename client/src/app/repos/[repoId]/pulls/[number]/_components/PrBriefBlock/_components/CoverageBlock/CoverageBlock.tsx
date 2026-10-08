/* CoverageBlock — what the brief was built without: one row per input and
   status, a chip, a known reason, and the refs behind a toggle. Refs and
   reasons are rendered as text nodes only (model/forge data is untrusted). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { BriefInputStatus, BriefMissingInput } from "@devdigest/shared";
import { s } from "../../styles";
import { groupCoverage, type CoverageRow } from "./helpers";

const CHIP_COLOR: Record<BriefInputStatus, string> = {
  missing: "var(--crit)",
  partial: "var(--warn)",
  stale: "var(--warn)",
  truncated: "var(--text-muted)",
};

function Row({ row }: { row: CoverageRow }) {
  const t = useTranslations("brief.prBrief");
  const [open, setOpen] = React.useState(false);
  return (
    <li style={s.coverageRow}>
      <div style={s.coverageLine}>
        <Badge color={CHIP_COLOR[row.status]}>{t(`coverage.chip.${row.status}`)}</Badge>
        <span>
          {t(`inputs.${row.input}`)}
          {row.reason && ` — ${t(`coverage.reason.${row.reason}`, { count: row.count })}`}
        </span>
        {row.refs.length > 0 && (
          <button type="button" style={s.refButton} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? t("coverage.hideRefs") : t("coverage.showRefs", { count: row.refs.length })}
          </button>
        )}
      </div>
      {open && (
        <ul style={s.coverageRefs}>
          {row.refs.map((ref) => (
            <li key={ref}>{ref}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function CoverageBlock({ items }: { items: BriefMissingInput[] }) {
  const t = useTranslations("brief.prBrief");
  if (items.length === 0) return null;
  return (
    <div role="group" aria-label={t("coverage.title")} style={s.coverageBlock}>
      <div style={s.coverageTitle}>{t("coverage.title")}</div>
      <p style={s.coverageText}>{t("coverage.explanation")}</p>
      <ul style={s.coverageList}>
        {groupCoverage(items).map((row) => (
          <Row key={`${row.input}-${row.status}`} row={row} />
        ))}
      </ul>
    </div>
  );
}
