import type { DiffHunk, UnifiedDiff } from '@devdigest/shared';

/**
 * A changed file reduced to what the intent classifier is allowed to see:
 * path, +/- counts, and NUMERIC hunk headers only — never hunk bodies (spec
 * 006 AC3). `diff.raw` is never read here.
 */
export interface FileSummary {
  path: string;
  additions: number;
  deletions: number;
  headers: string[];
}

function headerFor(h: DiffHunk): string {
  return `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`;
}

/** Build one FileSummary per changed file from the structured diff (no raw text). */
export function fileSummariesFromDiff(diff: UnifiedDiff): FileSummary[] {
  return diff.files.map((f) => ({
    path: f.path,
    additions: f.additions,
    deletions: f.deletions,
    headers: f.hunks.map(headerFor),
  }));
}
