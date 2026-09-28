import { describe, it, expect } from 'vitest';
import { buildSmartDiff } from '../src/modules/smart-diff/helpers.js';

describe('buildSmartDiff (S4, spec 007)', () => {
  it('groups files in role order, omitting empty groups, sorted by path within a group', () => {
    const result = buildSmartDiff(
      [
        { path: 'src/b.ts', additions: 1, deletions: 0 },
        { path: 'src/a.ts', additions: 2, deletions: 0 },
        { path: 'src/a.test.ts', additions: 3, deletions: 0 },
        { path: 'pnpm-lock.yaml', additions: 4, deletions: 0 },
      ],
      [],
    );
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'tests', 'boilerplate']);
    const core = result.groups.find((g) => g.role === 'core')!;
    expect(core.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('returns groups: [] for an empty PR', () => {
    const result = buildSmartDiff([], []);
    expect(result.groups).toEqual([]);
    expect(result.split_suggestion.total_lines).toBe(0);
  });

  it('finding_lines is sorted and de-duplicated, excludes dismissed findings, ignores unknown files', () => {
    const result = buildSmartDiff(
      [{ path: 'src/a.ts', additions: 1, deletions: 1 }],
      [
        { file: 'src/a.ts', startLine: 20, dismissedAt: null },
        { file: 'src/a.ts', startLine: 5, dismissedAt: null },
        { file: 'src/a.ts', startLine: 5, dismissedAt: null },
        { file: 'src/a.ts', startLine: 99, dismissedAt: new Date() },
        { file: 'src/unknown.ts', startLine: 1, dismissedAt: null },
      ],
    );
    const [file] = result.groups.find((g) => g.role === 'core')!.files;
    expect(file!.finding_lines).toEqual([5, 20]);
  });

  it('total_lines sums additions+deletions across all files', () => {
    const result = buildSmartDiff(
      [
        { path: 'src/a.ts', additions: 3, deletions: 2 },
        { path: 'README.md', additions: 1, deletions: 0 },
      ],
      [],
    );
    expect(result.split_suggestion.total_lines).toBe(6);
    expect(result.split_suggestion).toEqual({ too_big: false, total_lines: 6, proposed_splits: [] });
  });

  it('a lock file lands in boilerplate', () => {
    const result = buildSmartDiff([{ path: 'pnpm-lock.yaml', additions: 100, deletions: 0 }], []);
    expect(result.groups).toEqual([
      {
        role: 'boilerplate',
        files: [
          { path: 'pnpm-lock.yaml', pseudocode_summary: null, additions: 100, deletions: 0, finding_lines: [] },
        ],
      },
    ]);
  });
});
