import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

describe('SimpleGitClient.diffCommits (real git, temp repos)', () => {
  let root: string;
  let client: SimpleGitClient;
  let c5: string;
  let featureTip: string;
  let orphan: string;
  const repo = { owner: 'acme', name: 'demo' };

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'diff-commits-'));
    const origin = join(root, 'origin');
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
});
