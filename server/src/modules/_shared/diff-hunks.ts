/**
 * Pure helpers over a stored `pr_files.patch` hunk headers. Shared by the
 * intent and brief modules so neither imports the other.
 */

const HUNK_HEADER_RE = /^(@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@)/;
const HUNK_NEW_RANGE_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** Inclusive range of new-file line numbers. */
export interface LineRange {
  start: number;
  end: number;
}

/** Keep only the NUMERIC `@@ -a,b +c,d @@` header of each hunk line in a
 * stored `pr_files.patch`; the trailing function-context text and every hunk
 * body line are dropped (spec 006 AC3 — no hunk bodies ever reach the model). */
export function headersFromPatch(patch: string | null | undefined): string[] {
  if (!patch) return [];
  const headers: string[] = [];
  for (const line of patch.split('\n')) {
    const m = line.match(HUNK_HEADER_RE);
    const header = m?.[1];
    if (header !== undefined) headers.push(header);
  }
  return headers;
}

/** New-file line ranges of each hunk: `+c,d` → `{c, c+d-1}`; `d` defaults to 1
 * and `d = 0` (pure deletion) yields no range. */
export function changedLineRanges(patch: string | null | undefined): LineRange[] {
  if (!patch) return [];
  const ranges: LineRange[] = [];
  for (const line of patch.split('\n')) {
    const m = line.match(HUNK_NEW_RANGE_RE);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count > 0) ranges.push({ start, end: start + count - 1 });
  }
  return ranges;
}
