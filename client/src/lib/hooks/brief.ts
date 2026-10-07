/* hooks/brief.ts — React Query hooks for the PR Brief (spec 010).

     GET  /pulls/:id/brief → PrBriefView (stored brief + status, never calls the model)
     POST /pulls/:id/brief → PrBriefView (starts / re-runs generation) */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBriefView } from "@devdigest/shared";

/** Poll interval while a generation runs server-side. */
const GENERATING_POLL_MS = 2000;

const briefKey = (prId: string | null | undefined) => ["pr-brief", prId] as const;

/** The PR Brief view. Polls only while the server reports `generating`;
    the query itself never POSTs (AC-43). */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: briefKey(prId),
    queryFn: () => api.get<PrBriefView>(`/pulls/${prId}/brief`),
    enabled: !!prId,
    refetchInterval: (query) => (query.state.data?.generating ? GENERATING_POLL_MS : false),
  });
}

/** Start (or re-run) generation. The response is the current view, written
    straight into the cache; on a request error the key is refetched so the
    block shows the server's state, not a stale one. */
export function useGeneratePrBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prId: string) => api.post<PrBriefView>(`/pulls/${prId}/brief`),
    onSuccess: (view, prId) => qc.setQueryData(briefKey(prId), view),
    onError: (_err, prId) => qc.invalidateQueries({ queryKey: briefKey(prId) }),
  });
}
