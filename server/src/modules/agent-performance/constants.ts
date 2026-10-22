/** Tolerated drift between the browser clock and the server clock (assumption). */
export const CLOCK_SKEW_MS = 60_000;

/** AC-4 cap: 365 days plus one hour so a range spanning a DST change still fits (assumption). */
export const MAX_CUSTOM_MS = 365 * 24 * 3_600_000 + 3_600_000;

export const DAY_MS = 24 * 3_600_000;

/** AC-15: the expanded row looks at the newest 5 counted runs. */
export const RECENT_RUNS = 5;

/** AC-23 / AC-23a: Run history page size. */
export const HISTORY_PAGE = 50;

/** Spec 016 AC-28 / AC-29: a custom range of more local calendar days than this uses month buckets. */
export const MONTH_BUCKETS_AFTER_DAYS = 90;
