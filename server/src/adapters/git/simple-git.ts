import { simpleGit, type SimpleGit } from 'simple-git';
import { join } from 'node:path';
import { mkdir, readFile, access, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import type {
  GitClient,
  RepoRef,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
} from '@devdigest/shared';
import { parseUnifiedDiff } from './diff-parser.js';
import { KeyedMutex } from './clone-lock.js';

/**
 * Depth fetched by `sync()`. Deeper than the shallow clone (CLONE_DEPTH=1) so the
 * previously-indexed sha is usually reachable, keeping the resync diff incremental;
 * when it isn't, the indexer falls back to a full reindex.
 */
const RESYNC_FETCH_DEPTH = 50;

/**
 * `diffCommits` deepens the shallow clone by MERGE_BASE_DEEPEN commits per round,
 * for at most MERGE_BASE_MAX_ROUNDS rounds, until `git merge-base` succeeds. No
 * bounded fetch form guarantees a merge-base, so the loop is capped and the
 * caller falls back to the persisted PR file list.
 */
const MERGE_BASE_MAX_ROUNDS = 4;
const MERGE_BASE_DEEPEN = 50;
const COMMIT_SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/**
 * Per-command backstop for every git call: simple-git kills the child when it
 * prints nothing for this long. An inactivity timer, not a deadline — set above
 * the longest silent phase of a fetch/deepen on a large repo.
 */
export const GIT_BLOCK_TIMEOUT_MS = 300_000;

/**
 * Maps what a stopped git call throws to what callers should see: the abort
 * reason when the caller's signal fired, a URL-free stall message for the
 * simple-git `block` timeout, anything else unchanged. The plugin is detected by
 * duck typing (`plugin === 'timeout'`) rather than importing its error class.
 */
export function toGitStopError(err: unknown, signal?: AbortSignal): unknown {
  if (signal?.aborted) return signal.reason;
  if (isBlockTimeout(err)) {
    return new Error(`git stalled — no output for ${GIT_BLOCK_TIMEOUT_MS / 1000} s, stopped`);
  }
  return err;
}

function isBlockTimeout(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { plugin?: unknown }).plugin === 'timeout'
  );
}

/**
 * GitClient over simple-git. Repos clone to
 * `<cloneDir>/<owner>/<repo>`. We NEVER execute repo code — only git ops.
 */
export class SimpleGitClient implements GitClient {
  private locks = new KeyedMutex();

  constructor(private cloneDir: string) {
    // Force non-interactive auth so an unauthenticated/private clone fails in
    // ~1s with a clear error instead of hanging on a credential prompt until the
    // job timeout. Set on process.env (inherited by git subprocesses) rather
    // than via simple-git's .env(), which inspects and rejects vars like
    // PAGER/EDITOR present in the shell environment.
    process.env.GIT_TERMINAL_PROMPT ??= '0';
    process.env.GCM_INTERACTIVE ??= 'never';
  }

  clonePathFor(repo: RepoRef): string {
    return join(this.cloneDir, repo.owner, repo.name);
  }

  private gitAt(baseDir: string, signal?: AbortSignal): SimpleGit {
    return simpleGit({
      baseDir,
      timeout: { block: GIT_BLOCK_TIMEOUT_MS },
      ...(signal ? { abort: signal } : {}),
    });
  }

  private git(repo: RepoRef, signal?: AbortSignal): SimpleGit {
    return this.gitAt(this.clonePathFor(repo), signal);
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }> {
    const dest = this.clonePathFor(repo);
    return this.locks.run(dest, undefined, async () => {
      try {
        await mkdir(join(this.cloneDir, repo.owner), { recursive: true });
        if (await this.exists(join(dest, '.git'))) {
          // already cloned → fetch latest
          await this.gitAt(dest).fetch();
          return { path: dest };
        }
        // A prior clone may have timed out mid-write, leaving a partial dir without
        // a .git — git clone refuses a non-empty dest, so clear it first.
        if (await this.exists(dest)) await rm(dest, { recursive: true, force: true });
        const args: string[] = [];
        if (opts?.depth) args.push('--depth', String(opts.depth));
        if (opts?.branch) args.push('--branch', opts.branch);
        await this.gitAt(this.cloneDir).clone(url, dest, args);
        return { path: dest };
      } catch (err) {
        throw toGitStopError(err);
      }
    });
  }

  async fetchPullHead(repo: RepoRef, n: number, signal?: AbortSignal): Promise<void> {
    await this.locks.run(this.clonePathFor(repo), signal, async () => {
      try {
        // Fetch the PR head ref into a local ref (GitHub exposes pull/<n>/head).
        await this.git(repo, signal).fetch(['origin', `pull/${n}/head:pr-${n}`]);
      } catch (err) {
        throw toGitStopError(err, signal);
      }
    });
  }

  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    // Resync the read-only mirror to upstream. A bare `fetch` only moves
    // `origin/<branch>`, so we `reset --hard` to advance local HEAD + worktree —
    // safe here because we never commit to or run code from the clone.
    // Fetch a bounded depth (> the shallow CLONE_DEPTH) so the prior indexed sha
    // is usually reachable for an incremental diff; the indexer falls back to a
    // full reindex when it isn't.
    return this.locks.run(this.clonePathFor(repo), undefined, async () => {
      try {
        const g = this.git(repo);
        await g.fetch(['origin', branch, '--depth', String(RESYNC_FETCH_DEPTH)]);
        await g.reset(['--hard', `origin/${branch}`]);
        return { head: (await g.revparse(['HEAD'])).trim() };
      } catch (err) {
        throw toGitStopError(err);
      }
    });
  }

  async currentHead(repo: RepoRef): Promise<string> {
    try {
      return (await this.git(repo).revparse(['HEAD'])).trim();
    } catch (err) {
      throw toGitStopError(err);
    }
  }

  async diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff> {
    try {
      const raw = await this.git(repo).diff([`${base}...${head}`]);
      return parseUnifiedDiff(raw);
    } catch (err) {
      throw toGitStopError(err);
    }
  }

  /**
   * `git diff base...head` by commit SHA. Both SHAs are validated before the
   * first git call so a value starting with `-` can never become a git option.
   * Missing commits are fetched at depth 1, then the clone is deepened until a
   * merge-base exists (git >= 2.28 fails loudly on a missing merge-base).
   */
  async diffCommits(
    repo: RepoRef,
    base: string,
    head: string,
    signal?: AbortSignal,
  ): Promise<UnifiedDiff> {
    if (!COMMIT_SHA_RE.test(base) || !COMMIT_SHA_RE.test(head)) {
      throw new Error('diffCommits: invalid sha (expected 40 or 64 lowercase hex characters)');
    }
    return this.locks.run(this.clonePathFor(repo), signal, async () => {
      try {
        const g = this.git(repo, signal);
        const missing: string[] = [];
        for (const sha of [base, head]) {
          try {
            await g.raw(['cat-file', '-e', `${sha}^{commit}`]);
          } catch (err) {
            // A stop is not "commit missing": let it propagate.
            if (signal?.aborted || isBlockTimeout(err)) throw err;
            missing.push(sha);
          }
        }
        if (missing.length > 0) await g.raw(['fetch', '--depth=1', 'origin', ...missing]);

        // simple-git does not throw on `merge-base` exit 1 (no stderr) — an empty
        // output is the "no merge base" signal.
        const hasMergeBase = async (): Promise<boolean> => {
          try {
            return (await g.raw(['merge-base', base, head])).trim().length > 0;
          } catch (err) {
            if (signal?.aborted || isBlockTimeout(err)) throw err;
            return false;
          }
        };
        let found = await hasMergeBase();
        for (let round = 0; round < MERGE_BASE_MAX_ROUNDS && !found; round++) {
          await g.raw(['fetch', `--deepen=${MERGE_BASE_DEEPEN}`, 'origin', head, base]);
          found = await hasMergeBase();
        }
        if (!found) throw new Error('diffCommits: no merge base found within the deepen cap');
        return parseUnifiedDiff(await g.diff([`${base}...${head}`]));
      } catch (err) {
        throw toGitStopError(err, signal);
      }
    });
  }

  /**
   * `git diff --name-only base..head` — used by the incremental indexer to
   * pick the file set that changed since `last_indexed_sha`. Two-dot is
   * intentional (commits reachable from `head` but not `base`), unlike the
   * three-dot symmetric form `diff()` uses for review diffs.
   */
  async diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]> {
    if (base === head) return [];
    let raw: string;
    try {
      raw = await this.git(repo).raw(['diff', '--name-only', `${base}..${head}`]);
    } catch (err) {
      throw toGitStopError(err);
    }
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async blame(repo: RepoRef, path: string): Promise<BlameLine[]> {
    try {
      const raw = await this.git(repo).raw(['blame', '--line-porcelain', path]);
      return parseBlamePorcelain(raw);
    } catch (err) {
      throw toGitStopError(err);
    }
  }

  async log(repo: RepoRef, path?: string): Promise<GitCommit[]> {
    try {
      const log = await this.git(repo).log(path ? { file: path } : undefined);
      return log.all.map((c) => ({
        sha: c.hash,
        message: c.message,
        author: c.author_name,
        date: c.date,
      }));
    } catch (err) {
      throw toGitStopError(err);
    }
  }

  async readFile(repo: RepoRef, path: string): Promise<string> {
    return readFile(join(this.clonePathFor(repo), path), 'utf8');
  }

  /**
   * `git show <ref>:<path>` — reads a file's content at a specific commit
   * without checking it out. Used by the intent classifier to read a linked
   * plan/spec at the PR head (spec 006). Both args are validated as raw
   * strings BEFORE any git call: a `..` guard placed after `new URL()`/path
   * normalisation never fires (server/insights/gotchas.md), and an
   * unvalidated leading `-` would be read as a `git show` option.
   */
  async readFileAt(
    repo: RepoRef,
    ref: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<string> {
    if (!/^[0-9a-f]{7,40}$/.test(ref)) {
      throw new Error(`readFileAt: invalid ref ${ref}`);
    }
    if (
      path.startsWith('-') ||
      path.includes('\0') ||
      path.startsWith('/') ||
      path.split('/').includes('..')
    ) {
      throw new Error(`readFileAt: invalid path ${path}`);
    }
    signal?.throwIfAborted();
    try {
      return await this.git(repo, signal).raw(['show', `${ref}:${path}`]);
    } catch (err) {
      throw toGitStopError(err, signal);
    }
  }
}

function parseBlamePorcelain(raw: string): BlameLine[] {
  const out: BlameLine[] = [];
  const lines = raw.split('\n');
  let sha = '';
  let author = '';
  let date = '';
  let summary = '';
  let lineNo = 0;
  for (const line of lines) {
    const header = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
    if (header) {
      sha = header[1]!;
      lineNo = Number(header[2]);
    } else if (line.startsWith('author ')) author = line.slice(7);
    else if (line.startsWith('author-time '))
      date = new Date(Number(line.slice(12)) * 1000).toISOString();
    else if (line.startsWith('summary ')) summary = line.slice(8);
    else if (line.startsWith('\t')) {
      out.push({ line: lineNo, sha, author, date, summary });
    }
  }
  return out;
}
