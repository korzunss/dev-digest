/* DiffTarget — "open this file (and line) in the diff" request, produced by
   the PR Brief block and consumed by DiffViewer → FileCard → CodeLine.
   `nonce` makes a repeated click on the same location a new request: each
   consumer applies a given nonce once (see the apply rule in plan 28). */

export interface DiffTarget {
  path: string;
  /** New-side line number, or null to target the file header. */
  line: number | null;
  nonce: number;
}

/** How long the navigated-to row / header stays highlighted. */
export const TARGET_HIGHLIGHT_MS = 2000;
