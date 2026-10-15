/* hooks/trace.ts — A5 Run Trace. GET /runs/:id/trace returns the ENTIRE
   trace of one run as a single document (config + stats + prompt_assembly +
   tool_calls[] + raw_output + memory_pulled[] + full log). Registered by A2;
   A5 enriches the document it returns. Live events stream via useRunEvents
   (hooks/reviews.ts) — the drawer combines both. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { RunTrace } from "@devdigest/shared";

/** How often a still-missing trace is re-requested while the drawer waits for it. */
export const TRACE_POLL_MS = 2000;

/**
 * `opts.pollUntil` (epoch ms): while no trace has loaded and `Date.now()` is
 * before it, re-request every TRACE_POLL_MS. The trace is written a moment
 * after a run ends, so the first request can 404 (`retry` stays off).
 */
export function useRunTrace(
  runId: string | null | undefined,
  enabled = true,
  opts?: { pollUntil?: number | null },
) {
  const pollUntil = opts?.pollUntil ?? null;
  return useQuery({
    queryKey: ["run-trace", runId],
    queryFn: () => api.get<RunTrace>(`/runs/${runId}/trace`),
    enabled: !!runId && enabled,
    retry: false,
    refetchInterval: (query) =>
      !query.state.data && pollUntil != null && Date.now() < pollUntil ? TRACE_POLL_MS : false,
  });
}
