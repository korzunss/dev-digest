/* RegressionAlert — the banner for a negative delta on the latest completed
   run. The server computes it in code; this only words it (AC-50). */
import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalAlert } from "@devdigest/shared";
import { metricNameKey } from "./helpers";
import { s } from "./styles";

export function RegressionAlert({ alert }: { alert: EvalAlert }) {
  const t = useTranslations("eval.detail");
  const name = (metric: string) => {
    const key = metricNameKey(metric);
    return key ? t(`metricName.${key}`) : metric;
  };
  return (
    <div role="alert" style={s.alert}>
      <Icon.AlertTriangle size={16} style={{ color: "var(--warn)", marginTop: 2 }} />
      <div>
        <div style={s.alertTitle}>{t("alertTitle", { version: alert.version })}</div>
        <div style={s.alertLines}>
          {alert.dropped.map((d) => (
            <span key={`d-${d.metric}`}>{t("alertDropped", { metric: name(d.metric), points: d.points })}</span>
          ))}
          {alert.rose.map((r) => (
            <span key={`r-${r.metric}`}>{t("alertRose", { metric: name(r.metric), points: r.points })}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
