/* TabsView — one tab per agent (name + score) and, below it, the selected
   agent's summary card and its findings as the shared expandable FindingCard
   (spec 013, AC-36, 40, 41, 42). No Learn / Reply to author actions. The
   summary is model text and goes through SafeMarkdown. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { AgentIdentity, agentIdentity } from "@/components/agent-identity";
import { FindingCard } from "@/components/finding-card";
import { SafeMarkdown } from "@/components/safe-markdown";
import { formatCostUsd } from "@/lib/format-cost";
import { useMultiAgentFindingAction } from "@/lib/hooks/multi-agent";
import { AlsoFlaggedBy } from "../AlsoFlaggedBy";
import { s } from "./styles";

const tabId = (runId: string, columnRunId: string) => `${runId}-tab-${columnRunId}`;
const panelId = (runId: string) => `${runId}-tabpanel`;

function scoreColor(score: number): string {
  return score >= 75 ? "var(--ok)" : score >= 50 ? "var(--warn)" : "var(--crit)";
}

export function TabsView({
  runId,
  columns,
  onViewTrace,
}: {
  runId: string;
  columns: AgentColumn[];
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("runs");
  const action = useMultiAgentFindingAction(runId);
  const [selected, setSelected] = React.useState<string | null>(null);
  const tabRefs = React.useRef(new Map<string, HTMLButtonElement>());
  // Derived: an unknown or unset selection falls back to the first column.
  const column = columns.find((c) => c.run_id === selected) ?? columns[0];
  if (!column) return null;

  // Roving tabindex: Arrow keys (wrapping), Home and End move the selection and focus.
  const onTabsKeyDown = (e: React.KeyboardEvent) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const at = columns.findIndex((c) => c.run_id === column.run_id);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? columns.length - 1
          : (at + (e.key === "ArrowRight" ? 1 : -1) + columns.length) % columns.length;
    const target = columns[next];
    if (!target) return;
    setSelected(target.run_id);
    tabRefs.current.get(target.run_id)?.focus();
  };

  const name = column.agent_name ?? t("column.deletedAgent");
  const status = t(`column.status.${column.status}`);
  const { color } = agentIdentity(column.agent_name);
  const meta = [
    column.duration_ms != null ? `${(column.duration_ms / 1000).toFixed(1)}s` : null,
    column.cost_usd != null ? formatCostUsd(column.cost_usd, column.cost_source) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={s.wrap}>
      <div style={s.tabs} role="tablist" onKeyDown={onTabsKeyDown}>
        {columns.map((c) => {
          const active = c.run_id === column.run_id;
          return (
            <button
              key={c.run_id}
              type="button"
              role="tab"
              id={tabId(runId, c.run_id)}
              ref={(el) => {
                if (el) tabRefs.current.set(c.run_id, el);
                else tabRefs.current.delete(c.run_id);
              }}
              aria-selected={active}
              aria-controls={panelId(runId)}
              tabIndex={active ? 0 : -1}
              title={c.agent_name ?? t("column.deletedAgent")}
              style={s.tab(active, agentIdentity(c.agent_name).color)}
              onClick={() => setSelected(c.run_id)}
            >
              <AgentIdentity name={c.agent_name} size={18} />
              <span style={s.tabName}>{c.agent_name ?? t("column.deletedAgent")}</span>
              {c.score != null && (
                <span style={s.tabScore(scoreColor(c.score))}>{c.score}</span>
              )}
            </button>
          );
        })}
      </div>

      <section
        style={s.summary(color)}
        role="tabpanel"
        id={panelId(runId)}
        aria-labelledby={tabId(runId, column.run_id)}
      >
        {column.score != null ? (
          <CircularScore score={column.score} size={44} />
        ) : (
          <div style={s.emptyRing}>{status}</div>
        )}
        <div style={s.summaryMain}>
          <div style={s.agentName(color)}>{name}</div>
          <div style={s.prose}>
            {column.summary ? (
              <SafeMarkdown>{column.summary}</SafeMarkdown>
            ) : (
              t("tabs.noSummary")
            )}
          </div>
          {column.error && <div style={s.error}>{column.error}</div>}
        </div>
        <div style={s.side}>
          <button type="button" style={s.trace} onClick={() => onViewTrace(column.run_id)}>
            {t("viewTrace")}
          </button>
          {meta && <span>{meta}</span>}
        </div>
      </section>

      <div style={s.list}>
        {column.findings.length === 0 && column.status === "done" && (
          <div style={s.none}>{t("column.noFindings")}</div>
        )}
        {column.findings.map((f, i) => (
          <div key={f.id}>
            <FindingCard
              f={f}
              defaultExpanded={i === 0}
              pending={action.isPending}
              onAction={(kind) => action.mutate({ findingId: f.id, action: kind })}
            />
            <AlsoFlaggedBy runIds={f.also_flagged_by} columns={columns} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default TabsView;
