/* MetricCards — recall, precision and citation accuracy of the latest
   completed run, each with a sparkline and the delta against the previous one. */
import React from "react";
import { useTranslations } from "next-intl";
import { MetricCard } from "@devdigest/ui";
import type { EvalAgentDetail } from "@devdigest/shared";
import { METRIC_COLORS, toPercent } from "../../../helpers";
import { metricSeries, type MetricKey } from "./helpers";
import { s } from "./styles";

const CARDS: { key: MetricKey; label: "metricRecall" | "metricPrecision" | "metricCitation" }[] = [
  { key: "recall", label: "metricRecall" },
  { key: "precision", label: "metricPrecision" },
  { key: "citation_accuracy", label: "metricCitation" },
];

export function MetricCards({ detail }: { detail: EvalAgentDetail }) {
  const t = useTranslations("eval.detail");
  return (
    <div style={s.cards}>
      {CARDS.map(({ key, label }) => {
        const value = toPercent(detail.latest?.metrics[key]);
        const series = metricSeries(detail.trend, key);
        return (
          <div key={key} style={s.card}>
            <MetricCard
              label={t(label)}
              value={value ?? t("na")}
              suffix={value == null ? undefined : "%"}
              delta={detail.deltas[key] ?? undefined}
              color={METRIC_COLORS[key]}
              trend={series.length > 1 ? series : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
