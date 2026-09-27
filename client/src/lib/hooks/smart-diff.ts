/* hooks/smart-diff.ts — spec 007 Smart Diff.
   GET /pulls/:id/smart-diff returns the reviewer-ordered grouping + finding
   presence for the Files changed tab (server: modules/smart-diff).

   The query key is `["reviews", prId, "smart-diff"]` — a suffix of the
   existing `["reviews", prId]` prefix, so it is covered for free by every
   invalidation already fired by `useRunReview`, `useFindingAction`,
   `useDeleteReview` and `useDeleteRun` (hooks/reviews.ts). Only the page's
   `onRunDone`, which uses an exact `refetchReviews()` instead of an
   `invalidateQueries` prefix match, needs one added line (page.tsx). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiffResponse } from "@devdigest/shared";

export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["reviews", prId, "smart-diff"],
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
