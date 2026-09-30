import type { GitClient, RepoRef, UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { withTimeout } from '../../platform/resilience.js';
import type { ReviewRepository, PullRow } from './repository.js';
import { DIFF_COMMITS_TIMEOUT_MS } from './constants.js';
import { pathsOutsidePrFiles, prFilesAreFresh } from './helpers.js';

export interface LoadedDiff {
  diff: UnifiedDiff;
  source: 'git' | 'pr_files' | 'legacy_branch';
  /** A line for the run log explaining a fallback, or null when nothing notable happened. */
  note: string | null;
}

/**
 * Load the unified diff for a PR. With a stored base SHA it diffs
 * `base_sha...head_sha` (never the branch name, which is stale in shallow
 * clones). When that fails or is empty it reconstructs the diff from the
 * persisted pr_files patches; when neither works it throws (the run fails with
 * the reason). Only a PR with no stored base SHA (legacy rows) may fall back to
 * the `pull.base...head` branch-name diff.
 */
export async function loadDiff(
  git: Pick<GitClient, 'diff' | 'diffCommits'>,
  repo: Pick<ReviewRepository, 'getPrFiles'>,
  pull: PullRow,
  repoRef: RepoRef,
): Promise<LoadedDiff> {
  const prFiles = await repo.getPrFiles(pull.id);
  let note: string | null = null;

  if (pull.baseSha) {
    try {
      const diff = await withTimeout(
        git.diffCommits(repoRef, pull.baseSha, pull.headSha),
        DIFF_COMMITS_TIMEOUT_MS,
      );
      if (diff.files.length > 0) {
        if (prFilesAreFresh(pull, prFiles)) {
          const outside = pathsOutsidePrFiles(diff, prFiles);
          if (outside.length > 0) {
            return {
              diff: diffFromPrFiles(prFiles),
              source: 'pr_files',
              note: `git diff had ${outside.length} file(s) outside the PR file list — using the PR file list`,
            };
          }
        }
        return { diff, source: 'git', note: null };
      }
      note = 'base...head diff unavailable (git diff returned 0 files)';
    } catch (err) {
      note = `base...head diff unavailable (${(err as Error).message})`;
    }
  }

  const fromFiles = diffFromPrFiles(prFiles);
  if (fromFiles.files.length > 0) return { diff: fromFiles, source: 'pr_files', note };

  if (pull.baseSha) {
    throw new Error(note ?? 'base...head diff unavailable');
  }

  const legacy = await git.diff(repoRef, pull.base, pull.headSha).catch(() => null);
  return {
    diff: legacy ?? fromFiles,
    source: 'legacy_branch',
    note: 'no base SHA and no PR file patches — using the legacy branch diff (may include unrelated changes)',
  };
}

/** Reconstruct a UnifiedDiff from persisted pr_files patches. */
export function diffFromPrFiles(files: { path: string; patch: string | null }[]): UnifiedDiff {
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parseUnifiedDiff(parts.join('\n'));
}
