/* Pure helpers for DiffTab (spec 007 Smart Diff). No React imports — every
   function here is plain data-in/data-out so it can be unit tested without a
   renderer, and reused by both the Smart-order grouping (S11) and the
   findings wiring (S14). */
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";
import type { DiffLineAnnotation } from "@/components/diff-viewer";
import { severityColor, SEVERITY_LEVELS } from "@/lib/severity";

export interface JoinedGroup {
  role: SmartDiffRole;
  files: PrFile[];
  /** Number of files in this group that have at least one finding line
      (route's `finding_lines`), not the number of findings. */
  findingFileCount: number;
}

/**
 * Joins the route's `SmartDiffGroup[]` (path + role + finding presence) onto
 * the PR's actual `PrFile[]` (which carries the `patch` DiffViewer renders),
 * keeping the route's group and file order (D5/D6).
 *
 * A PR file the route didn't classify (e.g. the route errored on one file, or
 * ran against a stale file list) is never dropped: it is appended to the
 * `core` group, created — and placed first — if the route returned none.
 */
export function joinGroups(groups: SmartDiffGroup[], files: PrFile[]): JoinedGroup[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const seen = new Set<string>();

  const joined: JoinedGroup[] = groups.map((g) => {
    const groupFiles: PrFile[] = [];
    let findingFileCount = 0;
    for (const sf of g.files) {
      seen.add(sf.path);
      if (sf.finding_lines.length > 0) findingFileCount += 1;
      const pf = byPath.get(sf.path);
      if (pf) groupFiles.push(pf);
    }
    return { role: g.role, files: groupFiles, findingFileCount };
  });

  const missing = files.filter((f) => !seen.has(f.path));
  if (missing.length > 0) {
    const core = joined.find((g) => g.role === "core");
    if (core) {
      core.files = [...core.files, ...missing];
    } else {
      joined.unshift({ role: "core", files: missing, findingFileCount: 0 });
    }
  }

  return joined;
}

/** Every path across all groups that has at least one (undismissed)
    finding line — feeds the file-card dot (D4: dismissed already excluded
    server-side). */
export function markedPaths(groups: SmartDiffGroup[]): Set<string> {
  const paths = new Set<string>();
  for (const g of groups) {
    for (const f of g.files) {
      if (f.finding_lines.length > 0) paths.add(f.path);
    }
  }
  return paths;
}

/** The findings of the latest `kind==='review'` review — reviews are
    newest-first from the server (`review.repo.ts:66`), so `find` picks the
    same review the smart-diff route's `finding_lines` are built from (D3). */
export function latestReviewFindings(reviews: ReviewRecord[] | undefined): FindingRecord[] {
  return reviews?.find((r) => r.kind === "review")?.findings ?? [];
}

/**
 * One `DiffLineAnnotation` per finding of the latest review (S14). `endLine`
 * carries the finding's range so every rendered added line in
 * `start_line…end_line` gets the bar and label pill, and the card anchors
 * under the last one (D18-A). `CodeLine` derives a line's bar colour/label
 * from the first marker that carries them, so undismissed findings are
 * sorted worst-severity-first and lead the list; a dismissed finding still
 * gets an entry — its card keeps rendering (muted) so Accept/Dismiss stays
 * reversible — but `color`/`label`/`icon` are omitted so it never
 * contributes a bar or label, even when it's alone on its line (D4).
 */
export function toAnnotations(
  findings: FindingRecord[],
  t: (key: string) => string,
  render: (f: FindingRecord) => DiffLineAnnotation["content"],
  icon: (f: FindingRecord) => DiffLineAnnotation["icon"],
): DiffLineAnnotation[] {
  const bySeverity = (a: FindingRecord, b: FindingRecord) =>
    SEVERITY_LEVELS.indexOf(a.severity as (typeof SEVERITY_LEVELS)[number]) -
    SEVERITY_LEVELS.indexOf(b.severity as (typeof SEVERITY_LEVELS)[number]);
  const undismissed = findings.filter((f) => !f.dismissed_at).sort(bySeverity);
  const dismissed = findings.filter((f) => f.dismissed_at);
  return [
    ...undismissed.map((f) => ({
      id: f.id,
      path: f.file,
      line: f.start_line,
      endLine: f.end_line,
      color: severityColor(f.severity),
      label: t(`smartDiff.lineLabel.${f.severity}`),
      icon: icon(f),
      content: render(f),
    })),
    ...dismissed.map((f) => ({
      id: f.id,
      path: f.file,
      line: f.start_line,
      endLine: f.end_line,
      content: render(f),
    })),
  ];
}

/** True once `usePrReviews` has loaded and none of its reviews is a
    `kind==='review'` one (D14) — drives the "review not run yet" empty
    state. `undefined` (still loading) is not "not run" — it's unknown. */
export function reviewNotRun(reviews: ReviewRecord[] | undefined): boolean {
  return reviews !== undefined && !reviews.some((r) => r.kind === "review");
}

/** Sum of +/- across a file list — used for the "N files · +A −D" summary
    line, independent of which order (smart/original) is showing. */
export function diffTotals(files: PrFile[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    additions += f.additions;
    deletions += f.deletions;
  }
  return { additions, deletions };
}
