/* MetricBar — a 0..1 metric as a bar plus its whole-percent value; "n/a" when
   the metric has no data (AC-43). */
import React from "react";
import { useTranslations } from "next-intl";
import { ProgressBar } from "@devdigest/ui";
import { toPercent } from "../../helpers";

export function MetricBar({ value, color }: { value: number | null | undefined; color: string }) {
  const na = useTranslations("eval.detail")("na");
  const pct = toPercent(value);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, width: 150 }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <ProgressBar value={pct ?? 0} color={color} />
      </span>
      <span className="mono tnum" style={{ width: 34, textAlign: "right", fontSize: 12, color: "var(--text-muted)" }}>
        {pct == null ? na : `${pct}%`}
      </span>
    </span>
  );
}
