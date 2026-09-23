import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { SpecFile } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { ContextRepository } from './repository.js';
import { isInsideDir, resolveDocPath, toRepoRelative } from './helpers.js';
import {
  CONTEXT_FOLDERS,
  DOC_EXTENSION,
  MAX_DOC_BYTES,
  MAX_LISTED_DOCS,
  MAX_WALK_DEPTH,
} from './constants.js';

/**
 * Project-context documents: the markdown a repo carries about itself under
 * `specs/`, `docs/` and `insights/`. Source of truth is the working clone on
 * disk (`<cloneDir>/<owner>/<name>`, resolved through the injected GitClient),
 * never the database — so there is nothing to keep in sync with a checkout.
 *
 * A repo that was never cloned is an EMPTY LIST, not an error: the clone runs
 * as a background job, so "no directory yet" is an ordinary state of a freshly
 * added repo, and a 500 there would read as a broken feature.
 */
export class ContextService {
  private repo: ContextRepository;

  constructor(private container: Container) {
    this.repo = new ContextRepository(container.db);
  }

  /**
   * Every context document in the repo, content OMITTED — a listing is a
   * table of contents, and inlining bodies would make it grow with the repo.
   * `undefined` means "not this workspace's repo"; the route maps that to 404.
   */
  async list(workspaceId: string, repoId: string): Promise<SpecFile[] | undefined> {
    const cloneDir = await this.cloneDirFor(workspaceId, repoId);
    if (cloneDir === undefined) return undefined;

    const found: SpecFile[] = [];
    for (const folder of CONTEXT_FOLDERS) {
      await collectDocs(path.join(cloneDir, folder), folder, found, 0);
    }
    return found.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * One document, with its content. `undefined` means "not this workspace's
   * repo" (→ 404). A refused path throws `ValidationError` (→ 422) and an
   * allowed path that simply is not there throws `NotFoundError` (→ 404).
   */
  async getDoc(
    workspaceId: string,
    repoId: string,
    requested: string,
  ): Promise<SpecFile | undefined> {
    const cloneDir = await this.cloneDirFor(workspaceId, repoId);
    if (cloneDir === undefined) return undefined;

    const target = resolveDocPath(cloneDir, requested);
    if (target === null) {
      throw new ValidationError(
        'That path is not a project-context document: only .md files under specs/, docs/ or insights/ can be read.',
      );
    }

    // Second gate, and the reason it cannot live in the pure helper: a symlink
    // committed inside specs/ passes every string check and still points at
    // /etc/passwd. Resolve BOTH sides — the clone directory is itself often a
    // symlink (on macOS a temp dir under /var resolves to /private/var), so
    // comparing a real path against a non-real base would reject honest reads.
    const realDir = await realpath(cloneDir).catch(() => null);
    const realTarget = await realpath(target).catch(() => null);
    if (realDir === null || realTarget === null) throw new NotFoundError('Document not found');

    if (!isInsideDir(path.resolve(realDir), realTarget)) {
      throw new ValidationError('That path resolves outside the repository clone.');
    }

    const info = await stat(realTarget).catch(() => null);
    if (!info || !info.isFile()) throw new NotFoundError('Document not found');
    if (info.size > MAX_DOC_BYTES) {
      throw new ValidationError('That document is larger than 512 KB.');
    }

    const content = await readFile(realTarget, 'utf8');
    return {
      // The path as addressed, not where a symlink landed: the caller asked for
      // a document in this repo and gets that name back.
      path: toRepoRelative(cloneDir, target),
      content,
      size: info.size,
      updated_at: info.mtime.toISOString(),
    };
  }

  /**
   * Clone directory for a repo in this workspace, or `undefined` when the repo
   * is not this workspace's. The path comes from the container's GitClient so
   * tests can point it at a fixture (never `new SimpleGitClient` here).
   */
  private async cloneDirFor(workspaceId: string, repoId: string): Promise<string | undefined> {
    const repo = await this.repo.getRepoRef(workspaceId, repoId);
    if (!repo) return undefined;
    return this.container.git.clonePathFor({ owner: repo.owner, name: repo.name });
  }
}

/**
 * Walk one context folder, appending every `.md` file to `out`. A missing
 * folder is silently skipped — most repos have one or two of the three.
 *
 * `entry.isFile()` is deliberately strict: `readdir` reports a symlink as a
 * symlink, so links are not listed at all. They can still be *requested* by
 * path, which is exactly what the realpath check in `getDoc` exists for.
 */
async function collectDocs(
  dir: string,
  prefix: string,
  out: SpecFile[],
  depth: number,
): Promise<void> {
  if (depth > MAX_WALK_DEPTH || out.length >= MAX_LISTED_DOCS) return;

  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
  if (entries === null) return;

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (out.length >= MAX_LISTED_DOCS) return;

    const absolute = path.join(dir, entry.name);
    const relative = `${prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      await collectDocs(absolute, relative, out, depth + 1);
      continue;
    }
    if (!entry.isFile()) continue;
    if (path.extname(entry.name).toLowerCase() !== DOC_EXTENSION) continue;

    const info = await stat(absolute).catch(() => null);
    if (!info) continue;

    out.push({ path: relative, size: info.size, updated_at: info.mtime.toISOString() });
  }
}
