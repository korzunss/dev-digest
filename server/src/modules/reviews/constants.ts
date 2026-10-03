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

/** Map-reduce: share of chunks that may be skipped on truncated/invalid output before the run fails (assumption: 10%). */
export const REVIEW_MAX_SKIPPED_CHUNK_FRACTION = 0.1;

/** Cap on the repo-rules block handed to the engine per chunk (chars; passed as `repoRulesMaxChars`). */
export const REVIEW_REPO_RULES_MAX_CHARS = 8000;

/** Repo rules: ancestor directories of a changed path searched for rule files (assumption: 2). */
export const REPO_RULES_MAX_DIR_DEPTH = 2;

/** Repo rules: max rule files read per PR (assumption: 40). */
export const REPO_RULES_MAX_FILES = 40;

/** Repo rules: max chars kept from one rule file (assumption: 12000). */
export const REPO_RULES_MAX_FILE_CHARS = 12_000;

/** Repo rules: deadline for the whole rule-file load (assumption: 10 s). */
export const REPO_RULES_DEADLINE_MS = 10_000;
