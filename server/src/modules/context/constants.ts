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
