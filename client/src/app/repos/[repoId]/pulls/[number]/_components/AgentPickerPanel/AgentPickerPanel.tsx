/* AgentPickerPanel — the body of the "Run Review" popover on the PR page
   (spec 013): run all, pick agents with their time/cost estimate, clear,
   run the ticked ones, open the Configure run screen. Rendered through a
   portal at a fixed position (the PR header clips overflow); the parent owns
   open state, the selection and the actions. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { AgentIdentity } from "@/components/agent-identity";
import { useAgentEstimates } from "@/lib/hooks/multi-agent";
import { estimateParts, toggleId } from "./helpers";
import { s } from "./styles";

export function AgentPickerPanel({
  agents,
  selected,
  onSelectedChange,
  position,
  warnMerged,
  hasEnabled,
  onRunAll,
  onRunOne,
  onRunMulti,
  onConfigure,
  starting = false,
}: {
  agents: Agent[];
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  position: { top: number; left: number };
  warnMerged: boolean;
  hasEnabled: boolean;
  onRunAll: () => void;
  onRunOne: (agentId: string) => void;
  onRunMulti: () => void;
  onConfigure: () => void;
  /** A multi-agent start is in flight — block a second start. */
  starting?: boolean;
}) {
  const t = useTranslations("prReview");
  const { data: estimates } = useAgentEstimates();
  const byAgent = new Map((estimates ?? []).map((e) => [e.agent_id, e]));
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  // The dialog is portalled out of the trigger's DOM, so move focus in on open
  // and hand it back to whatever held it (the trigger) on close.
  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    // Hand focus back only if it was lost with the panel (document.body); when
    // the user already moved on (Tab out), leave it where it is.
    return () => {
      const active = document.activeElement;
      if (!active || active === document.body) previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      tabIndex={-1}
      aria-label={t("runReview.pickAgents")}
      data-agent-picker
      style={s.panel(position.top, position.left)}
    >
      {warnMerged && (
        <>
          <div style={s.warning}>
            <Icon.AlertTriangle size={14} />
            {t("runReview.mergedWarning")}
          </div>
          <div style={s.divider} />
        </>
      )}
      <button
        type="button"
        style={hasEnabled ? s.runAll : s.runAllMuted}
        onClick={onRunAll}
      >
        <Icon.Play size={14} />
        {t("runReview.runAll")}
      </button>
      <div style={s.divider} />
      <div style={s.headingRow}>
        <span style={s.heading}>{t("runReview.pickAgents")}</span>
        <button
          type="button"
          style={s.clear}
          onClick={() => onSelectedChange([])}
        >
          {t("runReview.clear")}
        </button>
      </div>
      {agents.map((a) => {
        const est = estimateParts(byAgent.get(a.id));
        return (
          <div key={a.id} style={s.row}>
            <div style={s.rowMain}>
              <Checkbox
                checked={selected.includes(a.id)}
                onChange={() =>
                  onSelectedChange(toggleId(agents, selected, a.id))
                }
                label={
                  <span style={s.rowText}>
                    <AgentIdentity name={a.name} size={20} />
                    <span style={s.agentName}>{a.name}</span>
                    <span style={s.estimate}>
                      {est
                        ? t("runReview.estimate", est)
                        : t("runReview.noEstimate")}
                    </span>
                  </span>
                }
              />
            </div>
            <button
              type="button"
              style={s.runOnly}
              aria-label={t("runReview.runOnly", { agent: a.name })}
              title={t("runReview.runOnly", { agent: a.name })}
              onClick={() => onRunOne(a.id)}
            >
              <Icon.Play size={13} />
            </button>
          </div>
        );
      })}
      <div style={s.footer}>
        <Button
          kind="primary"
          size="sm"
          icon="Users"
          full
          disabled={selected.length === 0 || starting}
          loading={starting}
          onClick={onRunMulti}
        >
          {t("runReview.runMulti", { count: selected.length })}
        </Button>
      </div>
      <div style={s.divider} />
      <button type="button" style={s.configure} onClick={onConfigure}>
        <Icon.Settings size={14} />
        {t("runReview.configureAgents")}
      </button>
    </div>,
    document.body,
  );
}

export default AgentPickerPanel;
