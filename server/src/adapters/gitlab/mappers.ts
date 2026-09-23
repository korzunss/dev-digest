import type {
  PrMeta,
  PrFile,
  PrCommit,
  PrStatus,
  PrReviewComment,
  CreateReviewCommentInput,
} from '@devdigest/shared';

/**
 * Pure GitLab → DevDigest DTO mapping. No I/O, so every shape decision here is
 * unit-testable without a live instance (or a stubbed fetch).
 */

// ---- Raw GitLab payload shapes (only the fields we read) ----
export interface GlDiffRefs {
  base_sha: string;
  start_sha: string;
  head_sha: string;
}

export interface GlMergeRequest {
  iid: number;
  title: string;
  state: string;
  author?: { username?: string } | null;
  source_branch: string;
  target_branch: string;
  sha?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  description?: string | null;
  web_url?: string | null;
  diff_refs?: GlDiffRefs | null;
  /**
   * A STRING, not an integer: GitLab caps it at 1,000 and then returns the
   * literal "1000+". Never Number() it — we derive counts from the diffs.
   */
  changes_count?: string | null;
}

export interface GlDiff {
  old_path: string;
  new_path: string;
  diff?: string | null;
  new_file?: boolean;
  deleted_file?: boolean;
  renamed_file?: boolean;
}

export interface GlCommit {
  id: string;
  message?: string | null;
  title?: string | null;
  author_name?: string | null;
  created_at?: string | null;
}

export interface GlPosition {
  base_sha?: string | null;
  start_sha?: string | null;
  head_sha?: string | null;
  old_path?: string | null;
  new_path?: string | null;
  position_type?: string | null;
  old_line?: number | null;
  new_line?: number | null;
}

export interface GlNote {
  id: number;
  body: string;
  system?: boolean;
  type?: string | null;
  author?: { username?: string } | null;
  created_at: string;
  position?: GlPosition | null;
}

export interface GlDiscussion {
  id: string;
  individual_note?: boolean;
  notes?: GlNote[];
}

// ---- Mapping ----

/**
 * GitLab's `state` is authoritative — unlike GitHub there is no separate
 * `merged_at` to consult. `locked` is an open MR with discussion frozen.
 */
export function mapMrState(state: string): PrStatus {
  if (state === 'merged') return 'merged';
  if (state === 'closed') return 'closed';
  return 'open';
}

/**
 * Additions/deletions for one file, counted from its unified diff. GitLab does
 * not return per-file stats, and `changes_count` on the MR is a capped string,
 * so this is the only honest source for the list's S/M/L sizing.
 */
export function countDiffLines(diff: string | null | undefined): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  if (!diff) return { additions, deletions };
  for (const line of diff.split('\n')) {
    // `+++`/`---` are the file headers, not changed lines.
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }
  return { additions, deletions };
}

export function mapDiffsToFiles(diffs: GlDiff[]): PrFile[] {
  return diffs.map((d) => {
    const { additions, deletions } = countDiffLines(d.diff);
    return {
      // A deleted file has no new_path on some versions; fall back to old_path.
      path: d.new_path || d.old_path,
      additions,
      deletions,
      patch: d.diff ?? null,
    };
  });
}

export function sumFileStats(files: PrFile[]): {
  additions: number;
  deletions: number;
  files_count: number;
} {
  return {
    additions: files.reduce((a, f) => a + f.additions, 0),
    deletions: files.reduce((a, f) => a + f.deletions, 0),
    files_count: files.length,
  };
}

export function mapCommits(commits: GlCommit[]): PrCommit[] {
  return commits.map((c) => ({
    sha: c.id,
    message: c.message ?? c.title ?? '',
    author: c.author_name ?? 'unknown',
    committed_at: c.created_at ?? null,
  }));
}

export function mapMrToPrMeta(mr: GlMergeRequest): PrMeta {
  return {
    number: mr.iid,
    title: mr.title,
    author: mr.author?.username ?? 'unknown',
    branch: mr.source_branch,
    base: mr.target_branch,
    head_sha: mr.sha ?? mr.diff_refs?.head_sha ?? '',
    // Not on the list payload — the pulls route backfills these from detail.
    additions: 0,
    deletions: 0,
    files_count: 0,
    status: mapMrState(mr.state),
    opened_at: mr.created_at ?? null,
    updated_at: mr.updated_at ?? null,
  };
}

/** `${webBase}/${projectPath}/-/merge_requests/${iid}#note_${noteId}` */
export function noteUrl(
  webBase: string,
  projectPath: string,
  iid: number,
  noteId: number,
): string {
  return `${webBase.replace(/\/+$/, '')}/${projectPath}/-/merge_requests/${iid}#note_${noteId}`;
}

/**
 * Flatten discussions into our flat comment list.
 *
 * `is_outdated` mirrors GitHub's rule ("the forge can no longer place this on
 * the current diff") but has to be derived differently: GitLab keeps the
 * position of the version the note was written against, so a note is outdated
 * when its `position.head_sha` is not the MR's current one. `currentHeadSha`
 * comes from the MR's `diff_refs`; pass null to skip the check.
 */
export function mapDiscussions(
  discussions: GlDiscussion[],
  opts: { webBase: string; projectPath: string; iid: number; currentHeadSha: string | null },
): PrReviewComment[] {
  const out: PrReviewComment[] = [];
  for (const d of discussions) {
    const notes = (d.notes ?? []).filter((nt) => nt.type === 'DiffNote' && !nt.system);
    if (notes.length === 0) continue;
    const rootId = notes[0]!.id;
    for (const nt of notes) {
      const pos = nt.position ?? {};
      const line = pos.new_line ?? pos.old_line ?? null;
      const outdated =
        currentHeadMismatch(pos.head_sha ?? null, opts.currentHeadSha) || line === null;
      out.push({
        id: nt.id,
        path: pos.new_path || pos.old_path || '',
        line: outdated ? null : line,
        original_line: line,
        side: pos.new_line != null ? 'RIGHT' : 'LEFT',
        body: nt.body,
        user: nt.author?.username ?? 'unknown',
        created_at: nt.created_at,
        html_url: noteUrl(opts.webBase, opts.projectPath, opts.iid, nt.id),
        in_reply_to_id: nt.id === rootId ? null : rootId,
        // The discussion id — the ONLY handle GitLab accepts for a reply.
        thread_id: d.id,
        is_outdated: outdated,
      });
    }
  }
  return out;
}

function currentHeadMismatch(noteHead: string | null, currentHead: string | null): boolean {
  if (!noteHead || !currentHead) return false;
  return noteHead !== currentHead;
}

/**
 * The `position` object a new diff thread needs. All three shas are required
 * and come from the MR's `diff_refs` — `head_sha` alone (what the GitHub path
 * passes as `commitId`) is not enough, and the other two cannot be derived
 * locally.
 */
export function buildPosition(
  refs: GlDiffRefs,
  input: Pick<CreateReviewCommentInput, 'path' | 'line' | 'side'>,
): Record<string, string | number> {
  const onOldSide = input.side === 'LEFT';
  return {
    base_sha: refs.base_sha,
    start_sha: refs.start_sha,
    head_sha: refs.head_sha,
    position_type: 'text',
    old_path: input.path,
    new_path: input.path,
    ...(onOldSide ? { old_line: input.line } : { new_line: input.line }),
  };
}

/**
 * Parse `major.minor` out of `GET /version`. Used for ONE decision: which diff
 * endpoint exists (see DIFFS_MIN_VERSION).
 */
export function parseVersion(version: string): { major: number; minor: number } | null {
  const m = version.match(/^(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

/** `…/:iid/diffs` (paginated) replaced `…/:iid/changes` in GitLab 15.7. */
export const DIFFS_MIN_VERSION = { major: 15, minor: 7 };

export function supportsDiffsEndpoint(version: string | null): boolean {
  const v = version ? parseVersion(version) : null;
  // Unknown version ⇒ assume the OLD endpoint: `/changes` still exists on
  // current GitLab (deprecated, not removed), whereas `/diffs` 404s on <15.7.
  // Guessing old is recoverable; guessing new is not.
  if (!v) return false;
  if (v.major !== DIFFS_MIN_VERSION.major) return v.major > DIFFS_MIN_VERSION.major;
  return v.minor >= DIFFS_MIN_VERSION.minor;
}
