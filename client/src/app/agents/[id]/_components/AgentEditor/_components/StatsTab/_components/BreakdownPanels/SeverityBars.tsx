/* SeverityBars — "Findings by severity" (spec 016, AC-27…AC-33): CSS stacked columns, one per
   bucket, Suggestion at the bottom up to Critical and Other. Hover and keyboard focus show the
   same detail line (AC-32). Empty buckets keep their label (AC-31). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel } from "@devdigest/ui";
import type { AgentStatsBreakdown, BreakdownBucket } from "@devdigest/shared/contracts/agent-performance.js";
import { SEVERITY_META } from "@/lib/severity";
import { bucketLabel, bucketRange, bucketTotal, crossesYear, findingsView, severityLegend, type SeverityKey } from "./helpers";
import { s } from "./styles";

/** Bottom to top. */
const STACK: SeverityKey[] = ["suggestion", "warning", "critical", "other"];

const COLOR: Record<SeverityKey, string> = {
  suggestion: SEVERITY_META.SUGGESTION.color,
  warning: SEVERITY_META.WARNING.color,
  critical: SEVERITY_META.CRITICAL.color,
  other: "var(--text-muted)",
};

export function SeverityBars({ data, tz }: { data: AgentStatsBreakdown; tz: string }) {
  const t = useTranslations("agentPerformance");
  const tp = useTranslations("prReview");
  const [active, setActive] = React.useState<number | null>(null);
  const view = findingsView(data);
  const { buckets, bucket_kind: kind, total } = data.findings;

  const name = (key: SeverityKey) => (key === "other" ? t("panels.severity.other") : tp(`severity.${key}`));
  const withYear = kind === "month" && crossesYear(buckets, tz);
  const max = Math.max(1, ...buckets.map(bucketTotal));
  const counts = (b: BreakdownBucket) =>
    (["critical", "warning", "suggestion", "other"] as const)
      .filter((k) => b[k] > 0)
      .map((k) => `${name(k)} ${b[k]}`)
      .join(" · ");
  const detail = (b: BreakdownBucket, i: number) =>
    t("panels.severity.bucketDetail", { label: bucketLabel(kind, i, b, tz, withYear), range: bucketRange(kind, b, tz) });

  return (
    <Card style={s.card}>
      <SectionLabel icon="BarChart">{t("panels.severity.title")}</SectionLabel>
      {view === "ciOnly" && <p style={s.message}>{t("panels.findings.ciOnly")}</p>}
      {view === "none" && <p style={s.message}>{t("panels.findings.none")}</p>}
      {view === "charts" && (
        <>
          <div style={s.detail} aria-live="polite">
            {active != null && buckets[active] ? `${detail(buckets[active]!, active)} · ${counts(buckets[active]!)}` : ""}
          </div>
          <div style={s.chart}>
            {buckets.map((b, i) => {
              const sum = bucketTotal(b);
              return (
                <div
                  key={b.start}
                  tabIndex={0}
                  role="img"
                  aria-label={`${detail(b, i)} · ${counts(b) || "0"}`}
                  style={s.column}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                >
                  <div style={s.stackArea}>
                    <div style={{ ...s.stack, height: `${(sum / max) * 100}%` }}>
                      {STACK.filter((k) => b[k] > 0).map((k) => (
                        <div key={k} data-severity={k} style={{ flex: b[k], background: COLOR[k] }} />
                      ))}
                    </div>
                  </div>
                  <span style={s.columnLabel}>{bucketLabel(kind, i, b, tz, withYear)}</span>
                </div>
              );
            })}
          </div>
          <ul style={s.legend}>
            {severityLegend(buckets).map((e) => (
              <li key={e.key} style={s.legendItem}>
                <span style={{ ...s.swatch, background: e.color }} />
                <span style={{ textTransform: "capitalize" }}>{name(e.key)}</span>
              </li>
            ))}
          </ul>
          <p style={s.note}>{t("panels.severity.total", { n: total })}</p>
        </>
      )}
    </Card>
  );
}
