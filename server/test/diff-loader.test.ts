import { describe, it, expect } from 'vitest';
import { loadDiff } from '../src/modules/reviews/diff-loader.js';
import { MockGitClient } from '../src/adapters/mocks.js';

const BASE = 'b'.repeat(40);
const REF = { owner: 'acme', name: 'api' };

// The mock's default git diff touches only src/config.ts.
function file(path: string, patch: string | null = '@@ -1,1 +1,2 @@\n a\n+b') {
  return { path, patch, additions: 1, deletions: 0 };
}

function makePull(over: Record<string, unknown> = {}) {
  return {
    id: 'pr-1',
    base: 'main',
    headSha: 'h1',
    baseSha: BASE,
    filesHeadSha: null,
    filesCount: 0,
    ...over,
  } as never;
}

const repoWith = (files: ReturnType<typeof file>[]) => ({ getPrFiles: async () => files as never });

describe('loadDiff', () => {
  it('diffs by baseSha, never by the branch name, and reports source git', async () => {
    const git = new MockGitClient();
    const r = await loadDiff(git, repoWith([]), makePull(), REF);
    expect(git.diffCommitsCalls).toEqual([{ base: BASE, head: 'h1' }]);
    expect(r.source).toBe('git');
    expect(r.note).toBeNull();
  });

  it('switches to pr_files when they are fresh + complete and git has an outside path', async () => {
    const git = new MockGitClient();
    const pull = makePull({ filesHeadSha: 'h1', filesCount: 1 });
    const r = await loadDiff(git, repoWith([file('other.ts')]), pull, REF);
    expect(r.source).toBe('pr_files');
    expect(r.diff.files.map((f) => f.path)).toEqual(['other.ts']);
    expect(r.note).toContain('outside the PR file list');
  });

  it('keeps the git diff when pr_files are stale or incomplete', async () => {
    const git = new MockGitClient();
    const stale = makePull({ filesHeadSha: 'h0', filesCount: 1 });
    expect((await loadDiff(git, repoWith([file('other.ts')]), stale, REF)).source).toBe('git');
    const incomplete = makePull({ filesHeadSha: 'h1', filesCount: 5 });
    expect((await loadDiff(git, repoWith([file('other.ts')]), incomplete, REF)).source).toBe('git');
  });

  it('falls back to pr_files when diffCommits fails', async () => {
    const git = new MockGitClient({ diffCommitsError: new Error('no merge base') });
    const r = await loadDiff(git, repoWith([file('a.ts')]), makePull(), REF);
    expect(r.source).toBe('pr_files');
    expect(r.note).toContain('no merge base');
  });

  it('uses pr_files when baseSha is null, without calling diffCommits', async () => {
    const git = new MockGitClient();
    const r = await loadDiff(git, repoWith([file('a.ts')]), makePull({ baseSha: null }), REF);
    expect(git.diffCommitsCalls).toHaveLength(0);
    expect(r.source).toBe('pr_files');
  });

  it('uses the legacy branch diff with a note when nothing else is available', async () => {
    const git = new MockGitClient();
    const r = await loadDiff(git, repoWith([file('a.ts', null)]), makePull({ baseSha: null }), REF);
    expect(r.source).toBe('legacy_branch');
    expect(r.note).toContain('legacy branch diff');
  });

  it('throws with the reason when baseSha is set and neither git nor pr_files work', async () => {
    const git = new MockGitClient({ diffCommitsError: new Error('no merge base') });
    await expect(loadDiff(git, repoWith([file('a.ts', null)]), makePull(), REF)).rejects.toThrow(
      /base\.\.\.head diff unavailable \(no merge base\)/,
    );
  });
});
