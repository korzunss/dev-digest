/* hooks/multi-agent.ts — Multi-Agent Review (spec 013).
   Estimates for the picker, the start mutation, the polled run, finding actions. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentEstimates,
  FindingActionKind,
  LatestMultiAgentRun,
  MultiAgentRun,
  MultiAgentRunSummaries,
  MultiAgentRunRequest,
} from "@devdigest/shared";

const RUN_POLL_MS = 3000;

/** Typical time/cost per agent, from its last done runs. */
export function useAgentEstimates() {
  return useQuery({
    queryKey: ["multi-agent-estimates"],
    queryFn: () => api.get<AgentEstimates>("/multi-agent/estimates"),
  });
}

/** One multi-agent run; polls every 3 s while any column is still running. */
export function useMultiAgentRun(runId: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-run", runId],
    queryFn: () => api.get<MultiAgentRun>(`/multi-agent-runs/${encodeURIComponent(String(runId))}`),
    enabled: !!runId,
    retry: false,
    refetchInterval: (query) =>
      (query.state.data?.columns ?? []).some((c) => c.status === "running")
        ? RUN_POLL_MS
        : false,
  });
}

/** The repository's recent multi-agent runs; polls while any is still running (AC-15d). */
export function useRecentMultiAgentRuns(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-recent", repoId],
    queryFn: () => api.get<MultiAgentRunSummaries>(`/repos/${encodeURIComponent(String(repoId))}/multi-agent-runs`),
    enabled: !!repoId,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "running") ? RUN_POLL_MS : false,
  });
}

/** The newest multi-agent run of a PR (`run: null` = none); polls while it runs. */
export function useLatestMultiAgentRun(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-latest", prId],
    queryFn: () => api.get<LatestMultiAgentRun>(`/pulls/${encodeURIComponent(String(prId))}/multi-agent`),
    enabled: !!prId,
    refetchInterval: (query) => (query.state.data?.run?.status === "running" ? RUN_POLL_MS : false),
  });
}

/** Start one run over several agents of a PR. */
export function useStartMultiAgentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }: { prId: string; agentIds: string[] }) => {
      const body: MultiAgentRunRequest = { agent_ids: agentIds };
      return api.post<MultiAgentRun>(`/pulls/${encodeURIComponent(prId)}/multi-agent-run`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["multi-agent-recent"] });
      qc.invalidateQueries({ queryKey: ["multi-agent-latest"] });
    },
  });
}

/** Accept/dismiss a finding shown in a multi-agent run, then refresh that run. */
export function useMultiAgentFindingAction(runId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, action }: { findingId: string; action: FindingActionKind }) =>
      api.post<unknown>(`/findings/${encodeURIComponent(findingId)}/${encodeURIComponent(action)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["multi-agent-run", runId] });
    },
  });
}
