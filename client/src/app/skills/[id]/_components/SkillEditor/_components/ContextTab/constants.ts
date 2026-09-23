/**
 * The heading the engine renders project-context documents under, copied
 * verbatim from `reviewer-core/src/prompt.ts` (`## Project context`). The
 * "serializes as" box shows the real thing, so a change there has to land here
 * too — a box that shows a heading the prompt does not use is worse than no
 * box at all.
 */
export const CONTEXT_HEADING = "## Project context";

/**
 * How one document actually reaches the model: `wrapUntrusted('spec-<i>', …)`
 * wraps its FULL text in these delimiters. The box lists paths — the marker
 * after each path is what keeps that summary from reading as "only the path is
 * sent".
 */
export const UNTRUSTED_SOURCE_PREFIX = "spec-";

/** Width of the document preview modal — wide enough for an 80-column spec. */
export const PREVIEW_WIDTH = 780;
