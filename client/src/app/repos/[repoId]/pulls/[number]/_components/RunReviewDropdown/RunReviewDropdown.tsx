/* RunReviewDropdown — ported from components2.jsx, reworked for spec 013.
   The trigger opens an AgentPickerPanel: "Run all enabled agents" and a single
   agent kick off POST /pulls/:id/review and hand the resulting runIds up so the
   parent can stream SSE live status; "Run multi-agent review (N)" starts a
   linked multi-agent run and opens its results page. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useAgents } from "../../../../../../../lib/hooks/agents";
import { useRunReview } from "../../../../../../../lib/hooks/reviews";
import { useStartMultiAgentRun } from "@/lib/hooks/multi-agent";
import { ApiError } from "@/lib/api";
import { AgentPickerPanel, initialSelection, PANEL_WIDTH } from "../AgentPickerPanel";
import { PANEL_GAP } from "./constants";
import { s } from "./styles";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  const { data: agents } = useAgents();
  const run = useRunReview();
  const startMulti = useStartMultiAgentRun();
  const all = agents ?? [];
  const hasEnabled = all.some((a) => a.enabled);

  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [startError, setStartError] = React.useState<string | null>(null);
  const open = position != null;
  // After a close that disabled the trigger (a run is starting), focus returns
  // to it once it is enabled again; AgentPickerPanel's own restore would hit a
  // disabled button and silently do nothing.
  const restoreFocus = React.useRef(false);
  const close = () => {
    restoreFocus.current = true;
    setPosition(null);
  };
  const busy = run.isPending || startMulti.isPending;
  React.useEffect(() => {
    if (open || busy || !restoreFocus.current) return;
    restoreFocus.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) triggerRef.current?.querySelector("button")?.focus();
  }, [open, busy]);

  // The selection is seeded here, when the panel opens (AC-2), not in an effect.
  const toggleOpen = () => {
    if (open) return close();
    setStartError(null);
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSelected(initialSelection(all));
    setPosition({
      top: rect.bottom + PANEL_GAP,
      left: Math.max(PANEL_GAP, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - PANEL_GAP)),
    });
  };

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el?.closest("[data-agent-picker]") || triggerRef.current?.contains(el)) return;
      setPosition(null);
    };
    // The dialog is portalled to <body>, so Tab can leave it while it stays open:
    // close when focus lands on something outside the panel and the trigger.
    const onFocusOut = (e: FocusEvent) => {
      const to = e.relatedTarget as Element | null;
      if (!to || to.closest("[data-agent-picker]") || triggerRef.current?.contains(to)) return;
      setPosition(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const kick = async (opts: { all?: boolean; agentId?: string }) => {
    close();
    onRunStart?.();
    try {
      const res = await run.mutateAsync({ prId, ...opts });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
    } finally {
      onRunSettled?.();
    }
  };

  const runMulti = async () => {
    if (startMulti.isPending) return;
    setStartError(null);
    try {
      const res = await startMulti.mutateAsync({ prId, agentIds: selected });
      close();
      router.push(`/repos/${repoId}/multi-agent/${res.id}`);
    } catch (err) {
      // Keep the panel open so the selection survives; show why the start failed.
      setStartError(err instanceof ApiError ? err.message : t("runReview.multiStartFailed"));
    }
  };

  return (
    <>
      <span
        ref={triggerRef}
        title={warnMerged ? t("runReview.mergedTooltip") : undefined}
        style={warnMerged ? { opacity: 0.6 } : undefined}
      >
        <Button
          kind={kind}
          size={size}
          iconRight="ChevronDown"
          icon="Sparkles"
          loading={busy}
          onClick={toggleOpen}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {run.isPending ? t("runReview.running") : t("runReview.runReview")}
        </Button>
        {startError && (
          <span role="alert" style={s.error}>
            {startError}
          </span>
        )}
      </span>
      {open && (
        <AgentPickerPanel
          agents={all}
          selected={selected}
          onSelectedChange={setSelected}
          position={position}
          warnMerged={warnMerged}
          hasEnabled={hasEnabled}
          onRunAll={() => kick({ all: true })}
          onRunOne={(agentId) => kick({ agentId })}
          onRunMulti={runMulti}
          starting={startMulti.isPending}
          onConfigure={() => {
            close();
            router.push(`/repos/${repoId}/multi-agent?pr=${number}`);
          }}
        />
      )}
    </>
  );
}
