/**
 * Review module constants.
 */
import type { LlmRouting } from '@devdigest/shared';

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

/** Upper bound for `GitClient.diffCommits` (fetch + deepen to a merge-base + diff). */
export const DIFF_COMMITS_TIMEOUT_MS = 90_000;

/** Per-call deadline for one review LLM call (the SDK timeout stops at the headers). */
export const REVIEW_CALL_DEADLINE_MS = 600_000;

/** Output safety cap sent as `max_tokens` on every review call. */
export const REVIEW_MAX_OUTPUT_TOKENS = 32_000;

/** Routing for review calls: prefer the fastest upstream provider. */
export const REVIEW_ROUTING: LlmRouting = { sort: 'throughput' };

/** Routing for the single retry: the gateway's default load balancing. */
export const REVIEW_RETRY_ROUTING: LlmRouting = {};

/** Above this many diff tokens a multi-file `single-pass` review switches to map-reduce. */
export const REVIEW_SINGLE_PASS_MAX_DIFF_TOKENS = 100_000;
