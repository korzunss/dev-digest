/** The only extension served. Compared case-insensitively (`.MD` counts). */
export const DOC_EXTENSION = '.md';

/**
 * Cap on a single document read. A context doc is prose; anything past half a
 * megabyte is something else (a vendored dump, a generated artefact) and is
 * refused rather than streamed into memory.
 */
export const MAX_DOC_BYTES = 512 * 1024;

/**
 * Bounds on the listing walk. There is no depth limit: the walk is bounded by
 * the number of directory entries visited, so a pathological tree cannot turn a
 * list request into an unbounded traversal (symlinks are never followed, so a
 * committed loop is not walked either). Hitting either cap sets `truncated`.
 */
export const MAX_VISITED_ENTRIES = 20_000; // entries (files + dirs) examined per listing
export const MAX_LISTED_DOCS = 500;

/** In-memory token-count cache size — bounds memory for a long-running API. */
export const MAX_TOKEN_CACHE_ENTRIES = 5_000;

/** Directories never descended into by the listing walk (dot-dirs are skipped too). */
export const EXCLUDED_DIRS = ['.git', 'node_modules'] as const;

/** Bounds on the user-configured search roots of a repo. */
export const MAX_ROOT_GLOBS = 20;
export const MAX_GLOB_LENGTH = 256;

/** Structural caps on a root glob — keep picomatch's regex from backtracking exponentially. */
export const MAX_SEGMENT_WILDCARDS = 2;
// Measured on a 4,093-char path of 255-char `a` segments (worst case: nothing
// matches): `**` + one `*a*` segment + `**` takes ~8 ms; 4 `**` took ~2 s on a
// 245-char path; two multi-wildcard segments with 2 `**` took ~1.5 s at 4 KB.
export const MAX_DOUBLE_STARS = 2;
// Segments with 2 wildcards (e.g. `*a*`): two of them anywhere cost 45 ms - 1.5 s at 4 KB, so at most one.
export const MAX_MULTI_WILDCARD_SEGMENTS = 1;
