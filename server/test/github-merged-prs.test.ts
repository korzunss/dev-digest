import { describe, it, expect } from 'vitest';
import { collectMergedPrs, type MergedPrIo } from '../src/adapters/github/merged-prs.js';

const pr = (number: number, merged_at: string | null, author: string | null = 'a') => ({
  number,
  title: `PR ${number}`,
  author,
  merged_at,
});

function io(commits: Record<string, string[] | Error>, prs: Record<string, ReturnType<typeof pr>[]>): MergedPrIo {
  return {
    listCommits: async (p) => {
      const v = commits[p];
      if (v instanceof Error) throw v;
      return v ?? [];
    },
    prsForCommit: async (sha) => prs[sha] ?? [],
  };
}

describe('collectMergedPrs', () => {
  it('dedupes a PR across two paths and unions its paths', async () => {
    const out = await collectMergedPrs(
      ['b.ts', 'a.ts'],
      io({ 'a.ts': ['s1'], 'b.ts': ['s2'] }, { s1: [pr(7, '2026-01-01')], s2: [pr(7, '2026-01-01')] }),
      { excludeNumber: 1, limit: 10 },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.paths).toEqual(['a.ts', 'b.ts']);
  });

  it('drops unmerged and excluded PRs, sorts by merged_at desc, applies limit', async () => {
    const out = await collectMergedPrs(
      ['a.ts'],
      io(
        { 'a.ts': ['s1', 's2', 's3', 's4'] },
        {
          s1: [pr(2, '2026-01-01')],
          s2: [pr(3, '2026-03-01')],
          s3: [pr(4, null)],
          s4: [pr(1, '2026-04-01'), pr(5, '2026-02-01', null)],
        },
      ),
      { excludeNumber: 1, limit: 2 },
    );
    expect(out.map((p) => p.number)).toEqual([3, 5]);
    expect(out[1]!.author).toBe('unknown');
  });

  it('treats a 404 as empty', async () => {
    const out = await collectMergedPrs(
      ['a.ts'],
      io({ 'a.ts': Object.assign(new Error('nf'), { status: 404 }) }, {}),
      { excludeNumber: 1, limit: 5 },
    );
    expect(out).toEqual([]);
  });

  it('throws when every path failed', async () => {
    const err = Object.assign(new Error('boom'), { status: 500 });
    await expect(
      collectMergedPrs(['a.ts', 'b.ts'], io({ 'a.ts': err, 'b.ts': err }, {}), {
        excludeNumber: 1,
        limit: 5,
      }),
    ).rejects.toThrow('boom');
  });
});
