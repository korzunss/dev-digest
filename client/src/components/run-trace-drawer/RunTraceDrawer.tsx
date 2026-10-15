/* RunTraceDrawer — A5 Run Trace + Live Log drawer (720px). Ported from
   screen_trace.jsx. Tabs: Trace (Configuration / Stats / Prompt assembly /
   Tool calls / Raw output) and Live log (SSE via useRunEvents → LiveLogStream,
   which has client-side Filter-input search). Default export so the PR-detail
   page (A2) can mount it from the run-status area. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer, LiveLogStream, Tabs, type LogLine } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { useRunTrace } from "@/lib/hooks/trace";
import { useRunEvents } from "@/lib/hooks/reviews";
import { DRAWER_WIDTH, LOG_HEIGHT, TABS, TRACE_PENDING_MS } from "./constants";
import { eventsToLog, traceLog } from "./helpers";
import { s } from "./styles";
import { TraceBody } from "./_components/TraceBody";

export interface RunTraceDrawerProps {
  runId: string;
  /** Title context (agent name / PR number). */
  agentName?: string | null;
  prNumber?: number | null;
  /** Persisted findings of this run (shown in the Findings section). */
  findings?: FindingRecord[];
  /** When true, the drawer defaults to the live log and streams SSE. */
  running?: boolean;
  /** When the run ended (ISO). Starts the 30 s wait for its trace; absent -> counted from first sight. */
  endedAt?: string | null;
  onClose: () => void;
}

/**
 * Run Trace + Live Log drawer. While `running`, the Live-log tab streams events
 * over SSE (useRunEvents). The Trace tab loads the persisted single-document
 * RunTrace (useRunTrace) once the run completes (or for historical runs).
 */
export default function RunTraceDrawer({
  runId,
  agentName,
  prNumber,
  findings = [],
  running = false,
  endedAt = null,
  onClose,
}: RunTraceDrawerProps) {
  const t = useTranslations("runs");
  const [tab, setTab] = React.useState<string>(running ? "log" : "trace");
  // The SSE stream only feeds the live log. "Ended" is decided by the parent's
  // `running` prop (+ `endedAt`): a stream that closes on a transient error while
  // the run is still running must not fetch the trace or flip the status.
  const { events } = useRunEvents(running ? [runId] : []);
  const stillRunning = running;
  // The trace is written shortly AFTER a run ends: wait for it for 30 s from
  // the end time (or from the first moment we see the run not running).
  const [firstSeenEnded, setFirstSeenEnded] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!stillRunning && firstSeenEnded === null) setFirstSeenEnded(Date.now());
  }, [stillRunning, firstSeenEnded]);
  const endedMs = endedAt ? Date.parse(endedAt) : NaN;
  const endMs = Number.isNaN(endedMs) ? firstSeenEnded : endedMs;
  const deadline = stillRunning || endMs === null ? null : endMs + TRACE_PENDING_MS;
  // The wait is over only for the deadline whose timer fired; a later deadline
  // (the end time arrived after the timer) is not timed out. Only ever set from
  // the timer below, never from a clock read during render.
  const [expiredDeadline, setExpiredDeadline] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (deadline === null) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      setExpiredDeadline(deadline);
      return;
    }
    const id = setTimeout(() => setExpiredDeadline(deadline), remaining);
    return () => clearTimeout(id);
  }, [deadline]);
  const timedOut = deadline !== null && expiredDeadline === deadline;
  const waiting = !stillRunning && !timedOut;
  const { data: trace, isLoading } = useRunTrace(runId, !stillRunning, { pollUntil: deadline });

  // Copy the model's raw output to the clipboard (footer button), with a brief
  // visual confirmation. Disabled until the trace (and its raw output) loads.
  const [rawCopied, setRawCopied] = React.useState(false);
  const copyRaw = () => {
    if (!trace?.raw_output) return;
    void navigator.clipboard?.writeText(trace.raw_output);
    setRawCopied(true);
    setTimeout(() => setRawCopied(false), 1500);
  };

  const log: LogLine[] = eventsToLog(events);
  // When historical, fall back to the trace's persisted log for the Live-log tab.
  const persistedLog: LogLine[] = traceLog(trace);
  const shownLog = running ? log : persistedLog;

  const prCtx = prNumber != null ? `${t("drawer.pr", { number: prNumber })} · ` : "";
  const subtitle = `${prCtx}${stillRunning ? t("drawer.running") : t("drawer.completed")}`;

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={t("drawer.title", { agent: agentName ?? trace?.config.agent ?? t("drawer.run") })}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button
            kind="secondary"
            size="sm"
            icon={rawCopied ? "Check" : "Copy"}
            onClick={copyRaw}
            disabled={!trace?.raw_output}
          >
            {rawCopied ? t("drawer.copied") : t("drawer.copyRawOutput")}
          </Button>
        </div>
      }
    >
      <Tabs tabs={[...TABS]} value={tab} onChange={setTab} pad="0" />
      <div style={s.tabBody}>
        {tab === "trace" ? (
          trace ? (
            <TraceBody trace={trace} findings={findings} />
          ) : stillRunning || (!isLoading && waiting) ? (
            <div style={s.emptyNote}>{t("drawer.tracePending")}</div>
          ) : isLoading ? (
            <div style={s.emptyNote}>{t("drawer.loadingTrace")}</div>
          ) : (
            <div style={s.emptyNote}>{t("drawer.noTrace")}</div>
          )
        ) : (
          <LiveLogStream log={shownLog} running={stillRunning} height={LOG_HEIGHT} />
        )}
      </div>
    </Drawer>
  );
}
