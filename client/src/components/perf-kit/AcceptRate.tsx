/* AcceptRate — "78% ↑ · n = 12 · small sample", or "No decisions yet" (AC-M8, M-9, M-14). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { SMALL_SAMPLE_MAX, acceptTone, acceptTrend, formatPercent } from "./helpers";
import { s } from "./styles";

export function AcceptRate({
  rate,
  accepted,
  dismissed,
  previousRate,
  runs,
}: {
  rate: number | null;
  accepted: number;
  dismissed: number;
  previousRate?: number | null;
  /** Counted runs behind the rate, shown beside the denominator when given. */
  runs?: number;
}) {
  const t = useTranslations("agentPerformance");
  const n = accepted + dismissed;
  const percent = formatPercent(rate);
  if (percent == null || n === 0) {
    return <span style={s.muted}>{t("accept.noDecisions")}</span>;
  }
  const trend = acceptTrend(rate, previousRate);
  return (
    <span className="tnum" style={s.rate}>
      <span style={{ ...s.rateValue, color: acceptTone(rate, n) ?? s.rateValue.color }}>{percent}</span>
      {trend && (
        <span style={trend === "up" ? s.trendUp : s.trendDown} role="img" aria-label={t(trend === "up" ? "accept.up" : "accept.down")}>
          {trend === "up" ? <Icon.ArrowUp size={12} /> : <Icon.ArrowDown size={12} />}
        </span>
      )}
      <span style={s.muted}>
        {t("accept.n", { n })}
        {runs != null ? ` · ${t("accept.runsBasis", { runs })}` : ""}
      </span>
      {n <= SMALL_SAMPLE_MAX && <span style={s.muted}>{t("accept.smallSample")}</span>}
    </span>
  );
}

export default AcceptRate;
