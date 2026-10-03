/* hooks/blast.ts — blast radius + prior PRs for one PR.
   GET /pulls/:id/blast   → BlastRadius (changed symbols → callers → endpoints/crons)
   GET /pulls/:id/history → PrHistory (merged PRs that touched the same files)
   `headSha` is part of the key so a new push refetches; the resync flow
   invalidates by the ["pr-blast", prId] prefix. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius, PrHistory } from "@devdigest/shared";

export function useBlastRadius(prId: string | null | undefined, headSha: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-blast", prId, headSha],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

export function usePrHistory(prId: string | null | undefined, headSha: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-history", prId, headSha],
    queryFn: () => api.get<PrHistory>(`/pulls/${prId}/history`),
    enabled: !!prId,
    staleTime: 10 * 60_000,
  });
}
