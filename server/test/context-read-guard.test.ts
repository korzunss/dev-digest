import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_CONTEXT_ROOTS } from '@devdigest/shared';
import { ContextService } from '../src/modules/context/service.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import type { Db } from '../src/db/client.js';

/**
 * The run-time half of the path guard: `readDocsForRun` is what a review calls
 * with paths that were stored long before the run, so it must refuse on its own
 * (lexical roots, then realpath of BOTH the clone and the target). Hermetic: the
 * method never touches the database, so no Postgres is needed — only a real
 * temp directory, because a symlink escape cannot be asserted on strings.
 */

const SECRET = 'TOP SECRET OUTSIDE THE CLONE';
const GLOBS = [...DEFAULT_CONTEXT_ROOTS];

let base: string;
let cloneDir: string;
let outsideDir: string;
let evilSibling: string;
let linkedClone: string;

function serviceAt(dir: string) {
  const git = new MockGitClient();
  git.clonePathFor = () => dir;
  return new ContextService({
    db: {} as Db,
    git,
    tokenizer: { count: (s: string) => s.length } as never,
  });
}

const repo = (contextGlobs: string[] = GLOBS) => ({ owner: 'acme', name: 'api', contextGlobs });

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'devdigest-guard-'));
  cloneDir = path.join(base, 'clone');
  outsideDir = path.join(base, 'outside');
  // Shares the clone's string prefix: a bare startsWith would accept it.
  evilSibling = path.join(base, 'clone-evil');
  linkedClone = path.join(base, 'clone-link');

  await mkdir(path.join(cloneDir, 'specs'), { recursive: true });
  await mkdir(path.join(cloneDir, 'docs'), { recursive: true });
  await mkdir(path.join(cloneDir, 'src'), { recursive: true });
  await mkdir(outsideDir, { recursive: true });
  await mkdir(evilSibling, { recursive: true });

  await writeFile(path.join(cloneDir, 'specs', 'a.md'), '# A');
  await writeFile(path.join(cloneDir, 'docs', 'b.md'), '# B');
  await writeFile(path.join(cloneDir, 'src', 'notes.md'), '# not a root');
  await writeFile(path.join(cloneDir, 'specs', 'big.md'), 'x'.repeat(512 * 1024 + 1));
  await mkdir(path.join(cloneDir, 'specs', 'dir.md'));
  await writeFile(path.join(outsideDir, 'secret.md'), SECRET);
  await writeFile(path.join(evilSibling, 'x.md'), SECRET);

  await symlink(path.join(outsideDir, 'secret.md'), path.join(cloneDir, 'specs', 'file-escape.md'));
  await symlink(outsideDir, path.join(cloneDir, 'specs', 'dir-escape'));
  await symlink(path.join(evilSibling, 'x.md'), path.join(cloneDir, 'specs', 'sibling-escape.md'));
  // The clone itself reached through a symlink (what macOS /var -> /private/var looks like).
  await symlink(cloneDir, linkedClone);
});

afterAll(async () => {
  if (base) await rm(base, { recursive: true, force: true });
});

describe('ContextService.readDocsForRun — path guard at run time', () => {
  // a symlink inside the roots that points outside the clone is refused, and its content never leaves
  it('refuses a file symlink and a directory symlink that escape the clone', async () => {
    const res = await serviceAt(cloneDir).readDocsForRun(repo(), [
      'specs/file-escape.md',
      'specs/dir-escape/secret.md',
    ]);
    expect(res.docs).toEqual([]);
    expect(res.skipped).toEqual([
      { path: 'specs/file-escape.md', reason: 'outside_clone' },
      { path: 'specs/dir-escape/secret.md', reason: 'outside_clone' },
    ]);
    expect(JSON.stringify(res)).not.toContain(SECRET);
  });

  // containment is checked on the separator boundary: `clone-evil` is not inside `clone`
  it('refuses a symlink into a sibling directory that merely prefixes the clone name', async () => {
    const res = await serviceAt(cloneDir).readDocsForRun(repo(), ['specs/sibling-escape.md']);
    expect(res.docs).toEqual([]);
    expect(res.skipped).toEqual([{ path: 'specs/sibling-escape.md', reason: 'outside_clone' }]);
  });

  // the clone being behind a symlink must not make legitimate files look like escapes
  it('still reads a normal document when the clone directory is itself a symlink', async () => {
    const res = await serviceAt(linkedClone).readDocsForRun(repo(), ['specs/a.md']);
    expect(res.skipped).toEqual([]);
    expect(res.docs).toEqual([{ path: 'specs/a.md', body: '# A' }]);
    // ...and an escape through that same linked clone is still refused.
    const bad = await serviceAt(linkedClone).readDocsForRun(repo(), ['specs/file-escape.md']);
    expect(bad.skipped).toEqual([{ path: 'specs/file-escape.md', reason: 'outside_clone' }]);
  });

  // every refusal keeps the requested path and a reason; docs keep input order; nothing throws
  it('keeps input order for read docs and reports each skip reason without throwing', async () => {
    const res = await serviceAt(cloneDir).readDocsForRun(repo(), [
      'docs/b.md',
      'src/notes.md',
      '../clone-evil/x.md',
      '/etc/passwd.md',
      'specs/big.md',
      'specs/dir.md',
      'specs/gone.md',
      'bad\0.md',
      'specs/a.md',
    ]);
    expect(res.docs.map((d) => d.path)).toEqual(['docs/b.md', 'specs/a.md']);
    expect(res.skipped).toEqual([
      { path: 'src/notes.md', reason: 'outside_search_roots' },
      { path: '../clone-evil/x.md', reason: 'outside_clone' },
      { path: '/etc/passwd.md', reason: 'outside_clone' },
      { path: 'specs/big.md', reason: 'too_large' },
      { path: 'specs/dir.md', reason: 'missing' },
      { path: 'specs/gone.md', reason: 'missing' },
      { path: 'bad\0.md', reason: 'outside_clone' },
    ]);
  });

  // a percent-encoded `..` is a literal directory name, never decoded into a traversal
  it('does not decode an encoded traversal', async () => {
    const res = await serviceAt(cloneDir).readDocsForRun(repo(), [
      'specs/%2e%2e/%2e%2e/outside/secret.md',
    ]);
    expect(res.docs).toEqual([]);
    expect(res.skipped).toEqual([
      { path: 'specs/%2e%2e/%2e%2e/outside/secret.md', reason: 'missing' },
    ]);
  });

  // the repo's own search roots, not the defaults, decide what a stored path may read
  it('honours the repo custom search roots at run time', async () => {
    const res = await serviceAt(cloneDir).readDocsForRun(repo(['docs/**/*.md']), [
      'specs/a.md',
      'docs/b.md',
    ]);
    expect(res.docs.map((d) => d.path)).toEqual(['docs/b.md']);
    expect(res.skipped).toEqual([{ path: 'specs/a.md', reason: 'outside_search_roots' }]);
  });

  // a path attached in two spellings must reach the prompt once (AC-30 dedupe)
  it('does not attach one document twice when its path is spelled two ways', async () => {
    const res = await serviceAt(cloneDir).readDocsForRun(repo(), ['specs/a.md', './specs/a.md']);
    expect(res.docs.map((d) => d.path)).toEqual(['specs/a.md']);
  });
});
