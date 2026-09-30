import type { GitClient, RepoRef, UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import type { ReviewRepository, PullRow } from './repository.js';
import { DIFF_COMMITS_TIMEOUT_MS } from './constants.js';
import { pathsOutsidePrFiles, prFilesAreFresh } from './helpers.js';

export interface LoadedDiff {
  diff: UnifiedDiff;
  source: 'git' | 'pr_files' | 'legacy_branch';
  /** A line for the run log explaining a fallback, or null when nothing notable happened. */
  note: string | null;
}

export interface LoadDiffOptions {
  /** Batch-cancel signal (aborts when every run of the batch is cancelled). */
  signal?: AbortSignal;
  timeoutMs?: number;
  logger?: { warn: (obj: unknown, msg?: string) => void };
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
  opts: LoadDiffOptions = {},
): Promise<LoadedDiff> {
  const prFiles = await repo.getPrFiles(pull.id);
  let note: string | null = null;

  if (pull.baseSha) {
    const timeoutMs = opts.timeoutMs ?? DIFF_COMMITS_TIMEOUT_MS;
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = opts.signal ? AbortSignal.any([deadline, opts.signal]) : deadline;
    const started = Date.now();
    try {
      const diff = await git.diffCommits(repoRef, pull.baseSha, pull.headSha, signal);
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
      let reason: 'timeout' | 'cancelled' | null = null;
      if (deadline.aborted) {
        reason = 'timeout';
        note = `base...head diff unavailable (timed out after ${Math.round(timeoutMs / 1000)} s — git stopped)`;
      } else if (opts.signal?.aborted) {
        reason = 'cancelled';
        note = 'base...head diff unavailable (all runs cancelled — git stopped)';
      } else {
        note = `base...head diff unavailable (${(err as Error).message})`;
      }
      if (reason) {
        opts.logger?.warn(
          {
            owner: repoRef.owner,
            name: repoRef.name,
            prId: pull.id,
            elapsedMs: Date.now() - started,
            reason,
          },
          'diffCommits stopped',
        );
      }
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
