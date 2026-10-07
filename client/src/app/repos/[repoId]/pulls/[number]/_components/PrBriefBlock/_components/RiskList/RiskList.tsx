/* RiskList — the brief's risk areas as a card in the Review focus
   frame: heading with a count badge, then compact risk cards. Model text is rendered as text nodes only — no Markdown, no
   HTML: the output is untrusted (AC-31). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { SEVERITY_ICON } from "../../constants";
import { s } from "../../styles";

type Open = (path: string, line: number | null) => void;

function RefButton({ path, onOpen }: { path: string; onOpen: Open }) {
  return (
    <button type="button" style={s.refButton} onClick={() => onOpen(path, null)}>
      {path}
    </button>
  );
}

function RiskItem({ risk, onOpen }: { risk: Risk; onOpen: Open }) {
  const t = useTranslations("brief.prBrief");
  const [open, setOpen] = React.useState(false);
  const { icon: SevIcon, color } = SEVERITY_ICON[risk.severity];
  const first = risk.file_refs[0];
  return (
    <li>
      <div style={s.riskCard}>
        <div style={s.riskMain}>
          <div style={s.riskRow}>
            <span role="img" aria-label={t(`severity.${risk.severity}`)} style={{ color, display: "inline-flex" }}>
              <SevIcon size={14} />
            </span>
            <span style={s.riskTitle}>{risk.title}</span>
          </div>
          {first && <RefButton path={first} onOpen={onOpen} />}
        </div>
        <button
          type="button"
          style={s.chevron}
          aria-expanded={open}
          aria-label={open ? t("collapseRisk") : t("expandRisk")}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon.ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : undefined }} />
        </button>
      </div>
      {open && (
        <>
          <p style={s.riskBody}>{risk.explanation}</p>
          {risk.file_refs.length > 0 && (
            <div style={s.refs}>
              {risk.file_refs.map((ref) => (
                <RefButton key={ref} path={ref} onOpen={onOpen} />
              ))}
            </div>
          )}
        </>
      )}
    </li>
  );
}

export function RiskList({ risks, onOpen }: { risks: Risk[]; onOpen: Open }) {
  const t = useTranslations("brief");
  return (
    <div style={s.focusCard}>
      <h3 style={s.focusHeading}>
        <Icon.AlertTriangle size={14} />
        {t("prBrief.riskAreas")}
        <span role="note" aria-label={t("prBrief.riskCount", { count: risks.length })}>
          <Badge color="var(--accent-text)" bg="var(--accent-bg)">
            {risks.length}
          </Badge>
        </span>
      </h3>
      {risks.length === 0 ? (
        <p style={s.muted}>{t("noRisks")}</p>
      ) : (
        <ul style={s.list}>
          {risks.map((r, i) => (
            <RiskItem key={`${r.title}-${i}`} risk={r} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </div>
  );
}
