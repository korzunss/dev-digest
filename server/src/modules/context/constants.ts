/**
 * The project-context allowlist. A "context document" is markdown living under
 * one of exactly these three top-level folders of a repo's working clone —
 * nothing else is listed and nothing else can be read through this module.
 * Keeping the set here (rather than inline in the resolver) is what makes the
 * boundary auditable in one place.
 */
export const CONTEXT_FOLDERS = ['specs', 'docs', 'insights'] as const;

export type ContextFolder = (typeof CONTEXT_FOLDERS)[number];

/** The only extension served. Compared case-insensitively (`.MD` counts). */
export const DOC_EXTENSION = '.md';

/**
 * Cap on a single document read. A context doc is prose; anything past half a
 * megabyte is something else (a vendored dump, a generated artefact) and is
 * refused rather than streamed into memory.
 */
export const MAX_DOC_BYTES = 512 * 1024;

/**
 * Bounds on the listing walk. The three folders are walked recursively, so a
 * clone with a pathological tree (or a symlink loop someone committed) must not
 * be able to turn a list request into an unbounded traversal.
 */
export const MAX_WALK_DEPTH = 6;
export const MAX_LISTED_DOCS = 500;
