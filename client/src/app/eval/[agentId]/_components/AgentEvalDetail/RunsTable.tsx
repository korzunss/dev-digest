/* RunsTable — suite runs newest first, selectable for Compare (AC-48, AC-51).
   Each row: start time, version, the three metrics as bars, cases passed /
   total, the errored count when above zero, and the cost. */
import React from "react";
import { useTranslations } from "next-intl";
import type { EvalSuiteRun } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format-cost";
import { METRIC_COLORS, formatRunTime } from "../../../helpers";
import { MetricBar } from "../../../_components/MetricBar";
import { s } from "./styles";

export function RunsTable({
  runs,
  selected,
  onToggle,
}: {
  runs: EvalSuiteRun[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("eval.detail");
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th} />
          <th style={s.th}>{t("colTime")}</th>
          <th style={s.th}>{t("colVersion")}</th>
          <th style={s.th}>{t("colRecall")}</th>
          <th style={s.th}>{t("colPrecision")}</th>
          <th style={s.th}>{t("colCitation")}</th>
          <th style={s.th}>{t("colPassed")}</th>
          <th style={s.th}>{t("colCost")}</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => {
          const time = formatRunTime(r.started_at);
          return (
            <tr key={r.id}>
              <td style={s.td}>
                <input
                  type="checkbox"
                  aria-label={t("selectRun", { time })}
                  checked={selected.includes(r.id)}
                  onChange={() => onToggle(r.id)}
                />
              </td>
              <td style={s.td} className="mono">
                {time}
              </td>
              <td style={s.td} className="mono">
                <span style={s.version}>v{r.agent_version}</span>
              </td>
              <td style={s.td}>
                <MetricBar value={r.metrics.recall} color={METRIC_COLORS.recall} />
              </td>
              <td style={s.td}>
                <MetricBar value={r.metrics.precision} color={METRIC_COLORS.precision} />
              </td>
              <td style={s.td}>
                <MetricBar value={r.metrics.citation_accuracy} color={METRIC_COLORS.citation_accuracy} />
              </td>
              <td style={s.td}>
                <span className="tnum" style={s.bold}>
                  {r.cases_passed}/{r.cases_total}
                </span>
                {r.cases_errored > 0 && <span style={s.errored}>{t("erroredCases", { count: r.cases_errored })}</span>}
              </td>
              <td style={s.td} className="mono">
                {formatCostUsd(r.cost_usd)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
