import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  SimpleGitClient,
  GIT_BLOCK_TIMEOUT_MS,
  toGitStopError,
} from '../src/adapters/git/simple-git.js';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

describe('SimpleGitClient.diffCommits (real git, temp repos)', () => {
  let root: string;
  let client: SimpleGitClient;
  let c5: string;
  let featureTip: string;
  let orphan: string;
  let origin: string;
  const repo = { owner: 'acme', name: 'demo' };

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'diff-commits-'));
    origin = join(root, 'origin');
    await mkdir(origin);
    git(origin, 'init', '-q', '-b', 'main');
    git(origin, 'config', 'user.name', 't');
    git(origin, 'config', 'user.email', 't@example.com');
    git(origin, 'config', 'commit.gpgsign', 'false');
    git(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
    const commit = async (file: string, msg: string) => {
      await writeFile(join(origin, file), `${msg}\n`);
      git(origin, 'add', '.');
      git(origin, 'commit', '-q', '-m', msg);
      return git(origin, 'rev-parse', 'HEAD');
    };
    await commit('base.txt', 'c1');
    const c2 = await commit('base2.txt', 'c2');
    await commit('main-only-3.ts', 'c3');
    await commit('main-only-4.ts', 'c4');
    c5 = await commit('main-only-5.ts', 'c5');
    git(origin, 'checkout', '-q', '-b', 'feature', c2);
    featureTip = await commit('feature.ts', 'f1');
    git(origin, 'checkout', '-q', '--orphan', 'lonely');
    orphan = await commit('lonely.ts', 'orphan');
    git(origin, 'checkout', '-q', 'main');

    const cloneDir = join(root, 'clones');
    await mkdir(join(cloneDir, 'acme'), { recursive: true });
    git(root, 'clone', '-q', '--depth', '1', `file://${origin}`, join(cloneDir, 'acme', 'demo'));
    client = new SimpleGitClient(cloneDir);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('fetches missing SHAs, deepens to the merge-base and diffs only the PR changes', async () => {
    const diff = await client.diffCommits(repo, c5, featureTip);
    expect(diff.files.map((f) => f.path)).toEqual(['feature.ts']);
  });

  it('rejects malformed SHAs before running git', async () => {
    await expect(client.diffCommits(repo, '--upload-pack=x', featureTip)).rejects.toThrow('invalid sha');
    await expect(client.diffCommits(repo, c5, c5.slice(0, 39))).rejects.toThrow('invalid sha');
  });

  it('rejects when no merge base exists', async () => {
    await expect(client.diffCommits(repo, c5, orphan)).rejects.toThrow('no merge base');
  });

  it('rejects a pre-aborted signal with that exact reason', async () => {
    const reason = new Error('cancelled by test');
    await expect(
      client.diffCommits(repo, c5, featureTip, AbortSignal.abort(reason)),
    ).rejects.toBe(reason);
  });

  it('leaves no git lock files behind after a near-immediate timeout', async () => {
    // Own clone: the SHAs are not local yet, so the abort lands during the fetch.
    const freshDir = join(root, 'fresh-clones');
    await mkdir(join(freshDir, 'acme'), { recursive: true });
    git(root, 'clone', '-q', '--depth', '1', `file://${origin}`, join(freshDir, 'acme', 'demo'));
    const fresh = new SimpleGitClient(freshDir);
    const clonePath = fresh.clonePathFor(repo);
    // Make `git fetch` stall ~3 s so the 500 ms deadline lands mid-fetch.
    // (`sleep 3 #` is exec'd directly: with an `sh -c '…; exec git-upload-pack'` wrapper git
    // fetch does not exit on SIGINT, the signal simple-git sends.)
    git(clonePath, 'config', 'remote.origin.uploadpack', 'sleep 3 #');
    const signal = AbortSignal.timeout(500);
    const started = Date.now();
    const err = await fresh.diffCommits(repo, c5, featureTip, signal).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(Date.now() - started).toBeLessThan(2500);
    expect(err).toBe(signal.reason);
    expect((err as Error).name).toBe('TimeoutError');
    const gitDir = join(clonePath, '.git');
    for (const f of ['shallow.lock', 'index.lock']) {
      await expect(access(join(gitDir, f))).rejects.toThrow();
    }
    git(clonePath, 'config', '--unset', 'remote.origin.uploadpack');
    const diff = await fresh.diffCommits(repo, c5, featureTip);
    expect(diff.files.map((f) => f.path)).toEqual(['feature.ts']);
  });

  it('serialises concurrent diffCommits on the same clone', async () => {
    const [a, b] = await Promise.all([
      client.diffCommits(repo, c5, featureTip),
      client.diffCommits(repo, c5, featureTip),
    ]);
    expect(a.files.map((f) => f.path)).toEqual(['feature.ts']);
    expect(b.files.map((f) => f.path)).toEqual(['feature.ts']);
  });
});

describe('toGitStopError', () => {
  it('maps the block-timeout plugin error to a stall message', () => {
    const out = toGitStopError({ plugin: 'timeout' });
    expect(out).toBeInstanceOf(Error);
    expect((out as Error).message).toBe(
      `git stalled — no output for ${GIT_BLOCK_TIMEOUT_MS / 1000} s, stopped`,
    );
  });

  it('returns the abort reason when the signal fired', () => {
    const signal = AbortSignal.abort(new Error('why'));
    expect(toGitStopError(new Error('raw'), signal)).toBe(signal.reason);
  });

  it('passes other errors through', () => {
    const err = new Error('plain');
    expect(toGitStopError(err)).toBe(err);
  });
});
