/* hooks/agent-performance.ts — React Query hooks for the Agent Performance
   dashboard, the agent Stats tab, its run history and the agent-card summary
   (spec 015). Every key starts "agent-performance" and carries the period key
   plus the time zone — never a timestamp. The window is resolved inside the
   query function, so a refetch reads a fresh "now" without changing the key.
   Types only from the deep contract path — a value import 500s `next dev`
   (client gotchas → Tests). */
"use client";

import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { THIRTY_DAYS, browserTimeZone, periodKey, resolveWindow, type PeriodSel } from "../period";
import type {
  AgentPerfDashboard,
  AgentStatsBreakdown,
  AgentPerfStats,
  PerfQuery,
  PerfRunsCount,
  RunHistoryPage,
} from "@devdigest/shared/contracts/agent-performance.js";

/** Rows a "Load more" fetches (the server caps `limit` at 50). */
export const RUN_HISTORY_PAGE = 50;

function qs(query: PerfQuery, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams({ period: query.period, from: query.from, to: query.to, tz: query.tz });
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

/** The whole workspace's figures for one period: one request, current + previous window (AC-8, AC-9). */
export function useAgentPerfDashboard(sel: PeriodSel) {
  const tz = browserTimeZone();
  return useQuery({
    queryKey: ["agent-performance", "dashboard", periodKey(sel), tz],
    queryFn: () => api.get<AgentPerfDashboard>(`/agents/performance?${qs(resolveWindow(sel, new Date(), tz))}`),
  });
}

/** One agent's figures for one period (the Stats tab). Idle while `agentId` is unset or `enabled` is false. */
export function useAgentPerfStats(agentId: string | null | undefined, sel: PeriodSel, enabled = true) {
  const tz = browserTimeZone();
  return useQuery({
    queryKey: ["agent-performance", "stats", agentId, periodKey(sel), tz],
    queryFn: () => api.get<AgentPerfStats>(`/agents/${agentId}/stats?${qs(resolveWindow(sel, new Date(), tz))}`),
    enabled: !!agentId && enabled,
  });
}

/**
 * The four Stats-tab breakdown panels in one request (spec 016, AC-34). Not
 * gated on the stats request — the panels decide their own states (D4).
 */
export function useAgentStatsBreakdown(agentId: string | null | undefined, sel: PeriodSel) {
  const tz = browserTimeZone();
  return useQuery({
    queryKey: ["agent-performance", "breakdown", agentId, periodKey(sel), tz],
    queryFn: () =>
      api.get<AgentStatsBreakdown>(`/agents/${agentId}/stats/breakdown?${qs(resolveWindow(sel, new Date(), tz))}`),
    enabled: !!agentId,
  });
}

/**
 * One agent's counted runs, newest first, 50 per page. The window is resolved
 * once per (period, tz) — not per page — so every "Load more" sends the same
 * `from`/`to` plus the cursor, and the keyset cannot shift between pages.
 */
export function useAgentRunHistory(agentId: string | null | undefined, sel: PeriodSel, enabled = true) {
  const tz = browserTimeZone();
  const key = periodKey(sel);
  // `sel` is fully described by `key`, so the memo is keyed on that.
  const win = useMemo(() => resolveWindow(sel, new Date(), tz), [key, tz]);
  return useInfiniteQuery({
    queryKey: ["agent-performance", "runs", agentId, key, tz],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api.get<RunHistoryPage>(
        `/agents/${agentId}/stats/runs?${qs(win, { cursor: pageParam || undefined, limit: String(RUN_HISTORY_PAGE) })}`,
      ),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: !!agentId && enabled,
  });
}

/**
 * Counted runs in the last 30 days (AC-18a "Try 30 days — N runs"), for the
 * whole workspace or one agent. Idle unless `enabled` — callers turn it on
 * only in an empty state, so a normal screen stays within its request budget.
 */
export function useRunsCount30d(agentId: string | null | undefined, enabled: boolean) {
  const tz = browserTimeZone();
  return useQuery({
    queryKey: ["agent-performance", "runs-count", agentId ?? null, tz],
    queryFn: () =>
      api.get<PerfRunsCount>(
        `/agents/performance/runs-count?${qs(resolveWindow(THIRTY_DAYS, new Date(), tz), { agent_id: agentId ?? undefined })}`,
      ),
    enabled,
  });
}
