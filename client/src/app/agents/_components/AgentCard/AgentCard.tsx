/* AgentCard — model chip, skills count, enabled toggle. Stats are an A5 mount;
   we render the provider/model + skill count here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Skeleton, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfirmModal } from "@/components/confirm-modal";
import { SMALL_SAMPLE_MAX, acceptTone, formatPercent, provenanceOf } from "@/components/perf-kit";
import { formatCostUsd } from "@/lib/format-cost";
import { useDeleteAgent } from "../../../../lib/hooks/agents";
import { modelColor, type AgentCardSummary } from "./helpers";
import { s } from "./styles";

/** "142 runs · 78% accept · $0.04 avg", "No runs in 30 days", a placeholder, or nothing (AC-30 to AC-32). */
function CardSummary({ summary }: { summary: AgentCardSummary }) {
  const t = useTranslations("agentPerformance");
  if (summary.state === "error") return null;
  if (summary.state === "loading") {
    return (
      <div style={s.summary} aria-busy="true">
        <Skeleton height={12} width={150} />
      </div>
    );
  }
  const { current } = summary.row;
  if (current.runs === 0) return <div style={s.summary}>{t("card.noRuns")}</div>;
  const decisions = current.accepted + current.dismissed;
  const hasDecisions = decisions > 0 && formatPercent(current.accept_rate) != null;
  const tone = hasDecisions ? acceptTone(current.accept_rate, decisions) : undefined;
  return (
    <div className="tnum" style={s.summary}>
      {t("card.runs", { runs: current.runs })}
      {" · "}
      {hasDecisions ? (
        <span style={{ color: tone }}>
          {decisions <= SMALL_SAMPLE_MAX
            ? t("card.acceptSmall", { percent: formatPercent(current.accept_rate), n: decisions })
            : t("card.accept", { percent: formatPercent(current.accept_rate) })}
        </span>
      ) : (
        t("card.noDecisions")
      )}
      {" · "}
      {t("card.avg", { avg: formatCostUsd(current.avg_cost_usd, provenanceOf(current.cost_split)) })}
    </div>
  );
}

export function AgentCard({
  ag,
  active,
  skillCount,
  summary,
  onClick,
  onToggle,
}: {
  ag: Agent;
  active?: boolean;
  skillCount?: number;
  /** The 30-day figures line; absent renders no line. */
  summary?: AgentCardSummary;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("agents");
  const del = useDeleteAgent();
  const color = modelColor(ag.model);
  const [confirming, setConfirming] = React.useState(false);
  return (
    <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
      {confirming && (
        // Rendered from the card, but the Modal primitive is position:fixed over
        // the whole viewport — it is not laid out inside this grid cell.
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmModal
            title={t("list.deleteTitle")}
            body={t("list.deleteConfirm", { name: ag.name })}
            confirmLabel={t("list.delete")}
            pending={del.isPending}
            onClose={() => setConfirming(false)}
            onConfirm={() => del.mutate(ag.id, { onSuccess: () => setConfirming(false) })}
          />
        </div>
      )}
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Cpu size={15} />
        </div>
        <span style={s.name}>{ag.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={ag.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          disabled={del.isPending}
          title={t("list.delete")}
          aria-label={t("list.delete")}
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.modelChip(color)}>
          {ag.model}
        </span>
        {skillCount != null && (
          <Badge color="var(--text-secondary)" icon="Sparkles">
            {t("card.skillCount", { count: skillCount })}
          </Badge>
        )}
      </div>
      {summary && <CardSummary summary={summary} />}
    </div>
  );
}
