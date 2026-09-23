/** Every skill starts at version 1, like agents. */
export const INITIAL_SKILL_VERSION = 1;

/** Fallback type when an imported body declares none. */
export const DEFAULT_SKILL_TYPE = 'custom' as const;

/**
 * Import guards. An archive is expanded IN MEMORY ONLY — nothing is written to
 * disk and nothing is executed — so these caps exist to bound that expansion,
 * not to protect a filesystem we never touch.
 */
export const MAX_ARCHIVE_ENTRIES = 200;
export const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024;

/** Import-by-URL limits. */
export const URL_FETCH_TIMEOUT_MS = 10_000;
export const MAX_URL_BYTES = 1024 * 1024;

/**
 * Per-route body limit for the import preview. The app-wide limit is 1 MB
 * (`app.ts`), and a base64-encoded archive is ~4/3 of its byte size.
 */
export const IMPORT_BODY_LIMIT = 4 * 1024 * 1024;

/**
 * Filenames considered the "core" of an archive, best first. Everything else in
 * the archive is reported as ignored.
 */
export const ARCHIVE_CORE_CANDIDATES = ['skill.md', 'readme.md'] as const;

/**
 * The window every transitive Stats figure is measured over. 30 days matches
 * the design's "FINDINGS (30D)" tile — and keeps a skill that was retired last
 * quarter from looking active.
 */
export const STATS_WINDOW_DAYS = 30;
