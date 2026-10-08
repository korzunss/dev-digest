/* hooks/onboarding.ts — React Query hooks for the Onboarding Tour screen (spec 009).

     GET  /repos/:id/onboarding            → OnboardingTourView (stored tour or skeleton)
     POST /repos/:id/onboarding/generate   → OnboardingTourView (always 200) */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingTourView } from "@devdigest/shared";

/** Poll interval while a generation runs server-side. */
const GENERATING_POLL_MS = 2000;

const tourKey = (repoId: string | null | undefined) => ["onboarding-tour", repoId] as const;

/** The tour view for a repo. Polls only while the server reports `generating`;
    the query itself never POSTs. */
export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: tourKey(repoId),
    queryFn: () => api.get<OnboardingTourView>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: (query) => (query.state.data?.generating ? GENERATING_POLL_MS : false),
  });
}

/**
 * Start (or re-run) generation. The route answers 200 with the current view in
 * every case — "did not start" shows up in `view.generating` / `view.clone.state`
 * — so the response is written straight into the cache.
 */
export function useGenerateOnboardingTour() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<OnboardingTourView>(`/repos/${repoId}/onboarding/generate`),
    onSuccess: (view, repoId) => qc.setQueryData(tourKey(repoId), view),
  });
}
