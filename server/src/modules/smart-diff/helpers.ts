import { classifyFile, SMART_DIFF_ROLE_ORDER } from '@devdigest/reviewer-core';
import type { SmartDiffFile, SmartDiffGroup, SmartDiffResponse } from '@devdigest/shared';

/** The columns `buildSmartDiff` needs from a `pr_files` row — narrow and
 * DB-agnostic, so the caller can pass either a Drizzle row or a plain object. */
export interface SmartDiffFileInput {
  path: string;
  additions: number;
  deletions: number;
}

/** The columns `buildSmartDiff` needs from a finding — narrow, so this module
 * never needs `FindingRow` or an ORM import (onion: application layer). */
export interface SmartDiffFindingInput {
  file: string;
  startLine: number;
  dismissedAt: Date | null;
}

/**
 * Pure grouping of a PR's files into reviewer-ordered roles (S4, spec 007).
 * Classification, ordering and finding-line aggregation are all pure string/array
 * work — no DB, no HTTP — so this stays testable with plain fixtures.
 *
 * - Groups follow `SMART_DIFF_ROLE_ORDER`; a role with no files is omitted (D5).
 * - Files inside a group are sorted by path ascending (D6 — `pr_files` has no
 *   ordering column).
 * - `finding_lines` is the sorted, de-duplicated set of `startLine` values from
 *   undismissed findings on that file (D4); a finding on a file not in `files`
 *   is ignored.
 */
export function buildSmartDiff(
  files: readonly SmartDiffFileInput[],
  findings: readonly SmartDiffFindingInput[],
): SmartDiffResponse {
  const linesByFile = new Map<string, Set<number>>();
  for (const f of findings) {
    if (f.dismissedAt !== null) continue;
    let set = linesByFile.get(f.file);
    if (!set) {
      set = new Set();
      linesByFile.set(f.file, set);
    }
    set.add(f.startLine);
  }

  const filesByRole = new Map<SmartDiffGroup['role'], SmartDiffFile[]>();
  let totalLines = 0;
  for (const f of files) {
    totalLines += f.additions + f.deletions;
    const role = classifyFile(f.path);
    const lines = linesByFile.get(f.path);
    const smartDiffFile: SmartDiffFile = {
      path: f.path,
      pseudocode_summary: null,
      additions: f.additions,
      deletions: f.deletions,
      finding_lines: lines ? [...lines].sort((a, b) => a - b) : [],
    };
    let bucket = filesByRole.get(role);
    if (!bucket) {
      bucket = [];
      filesByRole.set(role, bucket);
    }
    bucket.push(smartDiffFile);
  }

  const groups: SmartDiffGroup[] = [];
  for (const role of SMART_DIFF_ROLE_ORDER) {
    const bucket = filesByRole.get(role);
    if (!bucket || bucket.length === 0) continue;
    bucket.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    groups.push({ role, files: bucket });
  }

  return {
    groups,
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
