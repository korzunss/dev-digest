import type { BriefUsage, ReviewRecord, RunSummary } from "@devdigest/shared";

/** Reviews come newest-first; the latest is the first `kind === "review"`
    record (same rule as `DiffTab/helpers.ts`). */
export function latestReview(reviews: ReviewRecord[] | undefined): ReviewRecord | undefined {
  return reviews?.find((r) => r.kind === "review");
}

/** Open CRITICAL findings, as `ReviewRunAccordion` counts them. */
export function blockerCount(review: ReviewRecord): number {
  return review.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
}

/** A brief is stale when the server says so or its head differs from the PR's
    current head (the PR may have refreshed since the last GET). */
export function isStale(viewStale: boolean, briefHeadSha: string, prHeadSha: string | null | undefined): boolean {
  return viewStale || (!!prHeadSha && briefHeadSha !== prHeadSha);
}

export type UsageValues = BriefUsage;

/** The usage of the run behind a review. A review whose run is not in the list
    still exists, so its values are unknown (nulls), not absent. */
export function reviewUsage(review: ReviewRecord, runs: RunSummary[] | undefined): UsageValues {
  const run = review.run_id ? runs?.find((r) => r.run_id === review.run_id) : undefined;
  return {
    tokens_in: run?.tokens_in ?? null,
    tokens_out: run?.tokens_out ?? null,
    cost_usd: run?.cost_usd ?? null,
    cost_source: run?.cost_source ?? null,
  };
}
