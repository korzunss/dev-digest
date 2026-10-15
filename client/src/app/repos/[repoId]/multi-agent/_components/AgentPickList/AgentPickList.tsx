/* AgentPickList — step 2 of the Configure run screen (spec 013): one stacked
   card per agent with a checkbox, its identity tile, name, last verdict line
   and estimate. A ticked card takes the agent's colour. Presentational: the
   parent owns the ticked ids and the "Select all" link. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Agent, AgentEstimate } from "@devdigest/shared";
import { AgentIdentity, agentIdentity } from "@/components/agent-identity";
import { formatCostUsd } from "@/lib/format-cost";
import { formatEstimate } from "@/lib/agent-estimates";
import { s } from "./styles";

/** "<time>s · $<cost>" for an agent with history (AC-12); null = no estimate yet. */
function rowEstimate(e: AgentEstimate | undefined): string | null {
  if (!e || e.sample_size === 0) return null;
  const { duration, cost } = formatEstimate(e);
  if (duration == null) return null;
  return `${duration}s · ${cost ?? formatCostUsd(null)}`;
}

export function AgentPickList({
  agents,
  selected,
  estimates,
  onToggle,
}: {
  agents: Agent[];
  selected: string[];
  estimates: AgentEstimate[];
  onToggle: (agentId: string) => void;
}) {
  const t = useTranslations("runs");
  const byAgent = new Map(estimates.map((e) => [e.agent_id, e]));

  return (
    <div style={s.list}>
      {agents.map((a) => {
        const est = byAgent.get(a.id);
        const checked = selected.includes(a.id);
        const { color } = agentIdentity(a.name);
        return (
          <label key={a.id} style={s.row(checked, color)}>
            <button
              type="button"
              role="checkbox"
              aria-checked={checked}
              aria-label={a.name}
              style={s.box(checked, color)}
              onClick={() => onToggle(a.id)}
            >
              {checked && <Icon.Check size={12} />}
            </button>
            <AgentIdentity name={a.name} size={32} />
            <span style={s.text}>
              <span style={s.name}>{a.name}</span>
              {est?.last_verdict && <span style={s.verdict}>{est.last_verdict}</span>}
            </span>
            <span style={s.estimate}>{rowEstimate(est) ?? t("configure.noEstimate")}</span>
          </label>
        );
      })}
    </div>
  );
}

export default AgentPickList;
