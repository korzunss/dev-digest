import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

describe('SimpleGitClient.readFileAt (real git, temp repos)', () => {
  let root: string;
  let origin: string;
  let tip: string;
  let client: SimpleGitClient;
  const repo = { owner: 'acme', name: 'demo' };

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'read-file-at-'));
    origin = join(root, 'origin');
    await mkdir(origin);
    git(origin, 'init', '-q', '-b', 'main');
    git(origin, 'config', 'user.name', 't');
    git(origin, 'config', 'user.email', 't@example.com');
    git(origin, 'config', 'commit.gpgsign', 'false');
    git(origin, 'config', 'uploadpack.allowFilter', 'true');
    git(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
    await writeFile(join(origin, 'AGENTS.md'), '## Gotchas\n- from base\n');
    git(origin, 'add', '.');
    git(origin, 'commit', '-q', '-m', 'c1');
    tip = git(origin, 'rev-parse', 'HEAD');

    // Blobless clone: `git show <ref>:<path>` must lazily fetch the blob from the
    // promisor remote, which gives the abort a long-running git process to kill.
    const cloneDir = join(root, 'clones');
    await mkdir(join(cloneDir, 'acme'), { recursive: true });
    git(root, 'clone', '-q', '--no-checkout', '--filter=blob:none', `file://${origin}`, join(cloneDir, 'acme', 'demo'));
    client = new SimpleGitClient(cloneDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  // the ref/path guards still reject first; an abort is not what surfaces for a bad path
  it('rejects a bad path before looking at an aborted signal', async () => {
    await expect(
      client.readFileAt(repo, tip, '../x.md', AbortSignal.abort(new Error('cancelled'))),
    ).rejects.toThrow(/invalid path/);
  });

  // an already-aborted signal rejects with its reason before any git process is created
  it('spawns no git for a pre-aborted signal', async () => {
    const spawn = vi.spyOn(client as unknown as { git: () => unknown }, 'git');
    const reason = new Error('cancelled');
    await expect(client.readFileAt(repo, tip, 'AGENTS.md', AbortSignal.abort(reason))).rejects.toBe(reason);
    expect(spawn).not.toHaveBeenCalled();
  });

  // an abort kills the running `git show`: it returns promptly with the signal's reason and leaves no lock behind
  it('aborting mid-read kills git and rejects with the signal reason', async () => {
    const clonePath = client.clonePathFor(repo);
    // `sleep 3 #` is exec'd directly (an `sh -c` wrapper would make git ignore SIGINT).
    git(clonePath, 'config', 'remote.origin.uploadpack', 'sleep 3 #');
    const signal = AbortSignal.timeout(500);
    const started = Date.now();
    const err = await client
      .readFileAt(repo, tip, 'AGENTS.md', signal)
      .then(
        () => undefined,
        (e: unknown) => e,
      )
      .finally(() => git(clonePath, 'config', '--unset', 'remote.origin.uploadpack'));
    expect(Date.now() - started).toBeLessThan(2500);
    expect(err).toBe(signal.reason);
    expect((err as Error).name).toBe('TimeoutError');
    for (const f of ['shallow.lock', 'index.lock']) {
      await expect(access(join(clonePath, '.git', f))).rejects.toThrow();
    }
  });

  // a live, never-aborted signal changes nothing: the file content comes back
  it('reads the file at the ref when the signal does not fire', async () => {
    const out = await client.readFileAt(repo, tip, 'AGENTS.md', new AbortController().signal);
    expect(out).toBe('## Gotchas\n- from base\n');
  });
});
