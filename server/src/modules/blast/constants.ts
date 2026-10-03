/** Blast module limits for the Prior PRs lookup (`GET /pulls/:id/history`). */

/** Changed files used to look up prior PRs (outbound forge calls scale with it). */
export const HISTORY_MAX_PATHS = 10;
/** Commits fetched per path. */
export const HISTORY_COMMITS_PER_PATH = 5;
/** Prior PRs returned. */
export const HISTORY_LIMIT = 20;
/** In-process cache lifetime per `(prId, headSha)`. */
export const HISTORY_TTL_MS = 10 * 60_000;
/** Cache size cap; the oldest entry is evicted first. */
export const HISTORY_CACHE_MAX = 200;
