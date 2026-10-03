import { describe, it, expect } from 'vitest';
import { taskLine, prFilesAreFresh, pathsOutsidePrFiles } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

describe('prFilesAreFresh', () => {
  const files = [{ path: 'a.ts' }, { path: 'b.ts' }];
  const pull = { headSha: 'h1', filesHeadSha: 'h1', filesCount: 2 };

  it('is true when written for the head and complete', () => {
    expect(prFilesAreFresh(pull, files)).toBe(true);
  });
  it('is false for a stale head, an incomplete list or an empty list', () => {
    expect(prFilesAreFresh({ ...pull, filesHeadSha: 'h0' }, files)).toBe(false);
    expect(prFilesAreFresh({ ...pull, filesHeadSha: null }, files)).toBe(false);
    expect(prFilesAreFresh({ ...pull, filesCount: 3 }, files)).toBe(false);
    expect(prFilesAreFresh({ ...pull, filesCount: 0 }, [])).toBe(false);
  });
});

describe('pathsOutsidePrFiles', () => {
  it('returns diff paths missing from the PR file list', () => {
    const diff = {
      raw: '',
      files: ['a.ts', 'x.ts', 'y.ts'].map((path) => ({ path, additions: 0, deletions: 0, hunks: [] })),
    };
    expect(pathsOutsidePrFiles(diff, [{ path: 'a.ts' }])).toEqual(['x.ts', 'y.ts']);
    expect(pathsOutsidePrFiles(diff, diff.files)).toEqual([]);
  });
});
