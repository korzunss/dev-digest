/* hooks/ci.ts — React Query hooks for Export-to-CI (the agent's CI tab, the
   Export Wizard and the CI Runs page). Every key starts with "ci"; mutations
   invalidate installations and runs only. Types only from
   @devdigest/shared — a value import 500s `next dev` (client gotchas → Tests). */
"use client";

import { useQuery, useInfiniteQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CiInstallInput,
  CiInstallResult,
  CiInstallationView,
  CiPreview,
  CiPreviewInput,
  CiRefreshInput,
  CiRefreshResult,
  CiRunsPage,
  CiRunsQuery,
  CiValidateWorkflowInput,
  CiWorkflowCheck,
} from "@devdigest/shared";

/** How often an open CI tab / CI Runs page re-reads GitHub (AC-57). */
export const CI_REFRESH_INTERVAL_MS = 60_000;

/** After an install/remove: the installation list and the run list. Not the refresh (a POST) or the previews. */
function invalidateCiLists(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["ci", "installations"] }),
    qc.invalidateQueries({ queryKey: ["ci", "runs"] }),
  ]);
}

/** One agent's CI installations, with the state the tab derives from them. */
export function useCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["ci", "installations", agentId],
    queryFn: () => api.get<CiInstallationView[]>(`/agents/${agentId}/ci/installations`),
    enabled: !!agentId,
  });
}

/**
 * Pull new workflow runs from GitHub (AC-45, AC-57). A `useQuery` so it runs on
 * mount and every minute, and only while the caller is mounted and `enabled`.
 * A pass that recorded something refreshes the installations and the run list;
 * an idle pass touches nothing (and never refetches on window focus: each pass
 * is a POST that reads GitHub).
 */
export function useCiRefresh(scope: CiRefreshInput, enabled = true) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["ci", "refresh", scope.agent_id],
    queryFn: async () => {
      const result = await api.post<CiRefreshResult>("/ci/refresh", scope);
      if (result.recorded > 0) {
        // Not awaited: the refresh result must not wait for the lists to reload.
        void qc.invalidateQueries({ queryKey: ["ci", "installations"] });
        void qc.invalidateQueries({ queryKey: ["ci", "runs"] });
      }
      return result;
    },
    enabled,
    refetchInterval: enabled ? CI_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });
}

/** Filters of the CI Runs list; `range` is a key (e.g. "7d"), turned into `since` at fetch time. */
export type CiRunsFilter<R extends string = string> = Omit<CiRunsQuery, "since" | "cursor"> & { range: R };

/**
 * CI runs, newest first, one list across "Load more" (`next_cursor` chains the
 * pages). The range key — not a timestamp — is in the query key; `since` is
 * computed inside the fetch, so the key stays stable between renders.
 */
export function useCiRuns<R extends string>(filter: CiRunsFilter<R>, sinceOf: (range: R) => string) {
  return useInfiniteQuery({
    queryKey: ["ci", "runs", filter],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const { range, ...rest } = filter;
      const query: CiRunsQuery = { ...rest, since: sinceOf(range), ...(pageParam ? { cursor: pageParam } : {}) };
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
      }
      const qs = params.toString();
      return api.get<CiRunsPage>(`/ci/runs${qs ? `?${qs}` : ""}`);
    },
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
}

/** The files an export would create. Idle while `input` is null. */
export function useCiPreview(agentId: string | null | undefined, input: CiPreviewInput | null) {
  return useQuery({
    queryKey: ["ci", "preview", agentId, input],
    queryFn: () => api.post<CiPreview>(`/agents/${agentId}/ci/preview`, input),
    enabled: !!agentId && input !== null,
    // A preview is a snapshot of the agent's config: regenerate it on every visit.
    staleTime: 0,
    gcTime: 0,
  });
}

/** Check an edited workflow against the invariants before installing. */
export function useValidateCiWorkflow(agentId: string | null | undefined) {
  return useMutation({
    mutationFn: (input: CiValidateWorkflowInput) =>
      api.post<CiWorkflowCheck>(`/agents/${agentId}/ci/validate-workflow`, input),
  });
}

/** Open the export PR (or build the zip). Refused installs surface as `ApiError.code`. */
export function useCiInstall(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CiInstallInput) => api.post<CiInstallResult>(`/agents/${agentId}/ci/install`, input),
    // The Install step renders these two refusals inline (with their fix), so no toast.
    meta: { inlineErrorCodes: ["missing_workflow_permission", "foreign_commits"] },
    onSuccess: () => invalidateCiLists(qc),
  });
}

/** Delete the DevDigest record only; past runs stay (AC-60). */
export function useRemoveCiInstallation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (installationId: string) => api.del<void>(`/ci/installations/${installationId}`),
    onSuccess: () => invalidateCiLists(qc),
  });
}
