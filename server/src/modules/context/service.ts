import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_CONTEXT_ROOTS,
  type GitClient,
  type ContextListing,
  type ContextRoots,
  type ContextSkipReason,
  type SpecFile,
  type SpecSkipped,
} from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { ContextRepository } from './repository.js';
import {
  compileDirFilter,
  compileRoots,
  docType,
  isInsideDir,
  resolveContextPath,
  toRepoRelative,
  normaliseDocPath,
  validateRootGlob,
} from './helpers.js';
import { TokenCountCache, tokenCacheKey } from './token-cache.js';
import {
  DOC_EXTENSION,
  EXCLUDED_DIRS,
  MAX_DOC_BYTES,
  MAX_LISTED_DOCS,
  MAX_ROOT_GLOBS,
  MAX_VISITED_ENTRIES,
} from './constants.js';

/**
 * Project-context documents: the markdown a repo carries about itself, selected
 * by the repo's search-root globs. Source of truth is the working clone on disk
 * (`<cloneDir>/<owner>/<name>`, resolved through the injected GitClient), never
 * the database — so there is nothing to keep in sync with a checkout.
 *
 * A repo that was never cloned is an EMPTY LIST, not an error: the clone runs
 * as a background job, so "no directory yet" is an ordinary state of a freshly
 * added repo.
 *
 * `readSafely` is the single path guard: the HTTP read and the review run both
 * go through it, so a refusal means the same thing everywhere.
 */
export interface ContextServiceDeps {
  db: Db;
  git: GitClient;
  tokenizer: Container['tokenizer'];
}

type SafeRead =
  | { ok: true; rel: string; content: string; size: number; mtime: Date; mtimeMs: number }
  | { ok: false; reason: ContextSkipReason };

const sameGlobs = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((g, i) => g === b[i]);

export class ContextService {
  private repo: ContextRepository;
  // In-process only, never persisted (SPEC-08 AC-7).
  private tokens = new TokenCountCache();

  constructor(private deps: ContextServiceDeps) {
    this.repo = new ContextRepository(deps.db);
  }

  /**
   * Every context document matching the repo's search roots, content OMITTED.
   * `undefined` means "not this workspace's repo"; the route maps that to 404.
   */
  async list(workspaceId: string, repoId: string): Promise<ContextListing | undefined> {
    const repo = await this.repo.getRepoRef(workspaceId, repoId);
    if (!repo) return undefined;
    const cloneDir = this.cloneDirOf(repo);
    const isRoot = compileRoots(repo.contextGlobs);

    const docs: SpecFile[] = [];
    const state = { truncated: false, visited: 0 };
    await this.walk(cloneDir, cloneDir, '', isRoot, compileDirFilter(repo.contextGlobs), docs, state);
    docs.sort((a, b) => a.path.localeCompare(b.path));
    return { docs, truncated: state.truncated };
  }

  /**
   * One document, with its content. `undefined` = not this workspace's repo
   * (404). A refused path throws `ValidationError` (422); an allowed path that
   * is not there throws `NotFoundError` (404).
   */
  async getDoc(
    workspaceId: string,
    repoId: string,
    requested: string,
  ): Promise<SpecFile | undefined> {
    const repo = await this.repo.getRepoRef(workspaceId, repoId);
    if (!repo) return undefined;
    const cloneDir = this.cloneDirOf(repo);

    const res = await this.readSafely(cloneDir, requested, compileRoots(repo.contextGlobs));
    if (!res.ok) {
      if (res.reason === 'missing') throw new NotFoundError('Document not found');
      if (res.reason === 'too_large') throw new ValidationError('That document is larger than 512 KB.');
      throw new ValidationError(
        res.reason === 'outside_clone'
          ? 'That path resolves outside the repository clone.'
          : "That path is not a project-context document: it is outside this repo's search roots.",
      );
    }
    return {
      path: res.rel,
      content: res.content,
      size: res.size,
      updated_at: res.mtime.toISOString(),
      type: docType(res.rel),
      tokens: this.countTokens(
        tokenCacheKey(cloneDir, res.rel, res.mtimeMs, res.size),
        res.content,
      ),
      used_by_agents: await this.repo.agentCountForPath(workspaceId, res.rel),
    };
  }

  async getRoots(workspaceId: string, repoId: string): Promise<ContextRoots | undefined> {
    const repo = await this.repo.getRepoRef(workspaceId, repoId);
    if (!repo) return undefined;
    return this.rootsOf(repo.contextGlobs);
  }

  async setRoots(
    workspaceId: string,
    repoId: string,
    globs: string[],
  ): Promise<ContextRoots | undefined> {
    const repo = await this.repo.getRepoRef(workspaceId, repoId);
    if (!repo) return undefined;

    const unique = [...new Set(globs)];
    if (unique.length === 0) throw new ValidationError('At least one search root is required.');
    if (unique.length > MAX_ROOT_GLOBS) {
      throw new ValidationError(`At most ${MAX_ROOT_GLOBS} search roots are allowed.`);
    }
    for (const glob of unique) {
      const problem = validateRootGlob(glob);
      if (problem !== null) {
        throw new ValidationError(`Invalid search root "${glob.slice(0, 80)}": ${problem}`);
      }
    }
    await this.repo.setContextGlobs(workspaceId, repoId, unique);
    return this.rootsOf(unique);
  }

  async resetRoots(workspaceId: string, repoId: string): Promise<ContextRoots | undefined> {
    const repo = await this.repo.getRepoRef(workspaceId, repoId);
    if (!repo) return undefined;
    const globs = [...DEFAULT_CONTEXT_ROOTS];
    await this.repo.setContextGlobs(workspaceId, repoId, globs);
    return this.rootsOf(globs);
  }

  /**
   * Bodies for a review run, in the order of `paths`. Anything unreadable is
   * reported in `skipped` with a reason and never throws: a context problem
   * must not fail a review.
   */
  async readDocsForRun(
    repo: { owner: string; name: string; contextGlobs: string[] },
    paths: string[],
  ): Promise<{ docs: { path: string; body: string }[]; skipped: SpecSkipped[] }> {
    const cloneDir = this.cloneDirOf(repo);
    const isRoot = compileRoots(repo.contextGlobs);
    const docs: { path: string; body: string }[] = [];
    const skipped: SpecSkipped[] = [];
    // Stored paths are not normalised (`./specs/a.md` vs `specs/a.md`), so
    // dedupe on the resolved relative path, keeping the first position.
    const seen = new Set<string>();
    for (const p of paths) {
      const res = await this.readSafely(cloneDir, p, isRoot);
      if (!res.ok) skipped.push({ path: p, reason: res.reason });
      else if (!seen.has(res.rel)) {
        seen.add(res.rel);
        docs.push({ path: res.rel, body: res.content });
      }
    }
    return { docs, skipped };
  }

  /** Canonical repo-relative form of a caller-supplied doc path, or `null` when refused. */
  normalisePath(raw: string): string | null {
    return normaliseDocPath(raw);
  }

  private countTokens(key: string, content: string): number {
    const hit = this.tokens.get(key);
    if (hit !== undefined) return hit;
    const n = this.deps.tokenizer.count(content);
    this.tokens.set(key, n);
    return n;
  }

  private rootsOf(globs: string[]): ContextRoots {
    return { globs, is_default: sameGlobs(globs, DEFAULT_CONTEXT_ROOTS) };
  }

  private cloneDirOf(repo: { owner: string; name: string }): string {
    return this.deps.git.clonePathFor({ owner: repo.owner, name: repo.name });
  }

  /**
   * The one guard: lexical checks (`resolveContextPath`), then realpath of the
   * clone AND the target (the clone is itself often behind a symlink, e.g. macOS
   * `/var`), then size. Content is read only after both checks pass.
   */
  private async readSafely(
    cloneDir: string,
    requested: string,
    isRoot: (rel: string) => boolean,
  ): Promise<SafeRead> {
    const resolved = resolveContextPath(cloneDir, requested, isRoot);
    if ('refused' in resolved) return { ok: false, reason: resolved.refused };

    const realDir = await realpath(cloneDir).catch(() => null);
    const realTarget = await realpath(resolved.abs).catch(() => null);
    if (realDir === null || realTarget === null) return { ok: false, reason: 'missing' };
    const realBase = path.resolve(realDir);
    if (!isInsideDir(realBase, realTarget)) {
      return { ok: false, reason: 'outside_clone' };
    }
    // SF1: the REAL target must itself be a document under the search roots —
    // a symlink inside a root must not reach `.git/config`, `.github/…` etc.
    const realRel = toRepoRelative(realBase, realTarget);
    if (
      !isRoot(realRel) ||
      !realRel.toLowerCase().endsWith(DOC_EXTENSION) ||
      realRel.split('/').slice(0, -1).some((seg) => seg.startsWith('.'))
    ) {
      return { ok: false, reason: 'outside_search_roots' };
    }

    const info = await stat(realTarget).catch(() => null);
    if (!info || !info.isFile()) return { ok: false, reason: 'missing' };
    if (info.size > MAX_DOC_BYTES) return { ok: false, reason: 'too_large' };

    const content = await readFile(realTarget, 'utf8').catch(() => null);
    if (content === null) return { ok: false, reason: 'missing' };
    return { ok: true, rel: resolved.rel, content, size: info.size, mtime: info.mtime, mtimeMs: info.mtimeMs };
  }

  /**
   * Sorted walk from the clone root, bounded by entries visited (no depth
   * limit). Symlinks are never followed or listed (`readdir` reports them as
   * symlinks); dot-dirs, EXCLUDED_DIRS and dirs no root glob can reach are pruned.
   */
  private async walk(
    cloneDir: string,
    absDir: string,
    relDir: string,
    isRoot: (rel: string) => boolean,
    mayHold: (relDir: string) => boolean,
    out: SpecFile[],
    state: { truncated: boolean; visited: number },
  ): Promise<void> {
    if (state.truncated) return;
    const entries = await readdir(absDir, { withFileTypes: true }).catch(() => null);
    if (entries === null) return;

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (state.truncated) return;
      if (++state.visited > MAX_VISITED_ENTRIES) {
        state.truncated = true;
        return;
      }
      const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
      const abs = path.join(absDir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        if ((EXCLUDED_DIRS as readonly string[]).includes(entry.name)) continue;
        if (!mayHold(rel)) continue;
        await this.walk(cloneDir, abs, rel, isRoot, mayHold, out, state);
        continue;
      }
      if (!entry.isFile()) continue;
      if (path.extname(entry.name).toLowerCase() !== DOC_EXTENSION) continue;
      if (!isRoot(rel)) continue;

      if (out.length >= MAX_LISTED_DOCS) {
        state.truncated = true;
        return;
      }
      const info = await stat(abs).catch(() => null);
      if (!info) continue;
      let tokens: number | null = null;
      if (info.size <= MAX_DOC_BYTES) {
        const key = tokenCacheKey(cloneDir, rel, info.mtimeMs, info.size);
        tokens = this.tokens.get(key) ?? null;
        if (tokens === null) {
          const text = await readFile(abs, 'utf8').catch(() => null);
          if (text !== null) tokens = this.countTokens(key, text);
        }
      }
      out.push({
        path: rel,
        size: info.size,
        updated_at: info.mtime.toISOString(),
        type: docType(rel),
        tokens,
      });
    }
  }
}
