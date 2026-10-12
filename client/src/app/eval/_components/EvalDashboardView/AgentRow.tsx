/* AgentRow — one agent on the dashboard: model, latest completed run, a recall
   sparkline and the three latest metrics. The whole row opens the detail page
   (AC-59, AC-60). */
import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon, Sparkline } from "@devdigest/ui";
import type { EvalDashboardAgent } from "@devdigest/shared";
import { METRIC_COLORS, formatRunTime, toPercent } from "../../helpers";
import { s } from "./styles";

function Stat({ label, value, color }: { label: string; value: number | null | undefined; color: string }) {
  const na = useTranslations("eval.detail")("na");
  const pct = toPercent(value);
  return (
    <span style={s.stat}>
      <span style={s.statLabel}>{label}</span>
      <span className="tnum" style={{ ...s.statValue, color }}>
        {pct == null ? na : `${pct}%`}
      </span>
    </span>
  );
}

export function AgentRow({ agent }: { agent: EvalDashboardAgent }) {
  const t = useTranslations("eval.dashboard");
  const latest = agent.latest;
  return (
    <Link href={`/eval/${agent.agent_id}`} style={s.agentRow}>
      <Icon.Cpu size={20} style={{ color: "var(--accent)" }} />
      <div style={s.agentMain}>
        <div style={s.agentName}>
          {agent.name}
          <Badge color="var(--text-secondary)" mono>
            {agent.model}
          </Badge>
        </div>
        <div style={s.agentMeta}>
          {latest
            ? t("latestRun", {
                version: latest.agent_version,
                time: formatRunTime(latest.started_at),
                passed: latest.cases_passed,
                total: latest.cases_total,
              })
            : t("neverRun")}
        </div>
      </div>
      {agent.sparkline.length > 1 && <Sparkline data={agent.sparkline} color={METRIC_COLORS.recall} w={80} h={26} />}
      <div style={s.stats}>
        <Stat label={t("metrics.recall")} value={latest?.metrics.recall} color={METRIC_COLORS.recall} />
        <Stat label={t("metrics.precision")} value={latest?.metrics.precision} color={METRIC_COLORS.precision} />
        <Stat label={t("metrics.citationAccuracy")} value={latest?.metrics.citation_accuracy} color={METRIC_COLORS.citation_accuracy} />
      </div>
      <Icon.ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
    </Link>
  );
}
