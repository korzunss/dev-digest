/* hooks/intent.ts — spec 006 Intent Layer.
   GET /pulls/:id/intent returns the persisted classification (or null) plus
   the PR's CURRENT head sha, so the card can show staleness without a second
   round trip. POST /pulls/:id/intent/classify recomputes it; on success the
   cached record is invalidated so the card re-renders with the fresh result. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentRecord, PrIntentResponse } from "@devdigest/shared";

export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

export function useClassifyIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentRecord>(`/pulls/${prId}/intent/classify`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pr-intent", prId] }),
  });
}
