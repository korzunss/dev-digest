import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../src/index.js';

const RAW = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,3 +1,4 @@',
  ' keep',
  '-old',
  '+new',
  '+added',
  ' tail',
  'diff --git a/gone.ts b/gone.ts',
  '--- a/gone.ts',
  '+++ /dev/null',
  '@@ -1,1 +0,0 @@',
  '-bye',
].join('\n');

describe('parseUnifiedDiff (moved into reviewer-core)', () => {
  it('extracts files, counts and new-side line numbers', () => {
    const d = parseUnifiedDiff(RAW);
    expect(d.raw).toBe(RAW);
    expect(d.files).toHaveLength(1);
    const f = d.files[0]!;
    expect(f.path).toBe('src/a.ts');
    expect(f.additions).toBe(2);
    expect(f.deletions).toBe(1);
    expect(f.hunks[0]).toMatchObject({ newStart: 1, newLines: 4, oldStart: 1, oldLines: 3 });
    expect(f.hunks[0]!.newLineNumbers).toEqual([1, 2, 3, 4]);
  });

  it('returns no files for empty input', () => {
    expect(parseUnifiedDiff('').files).toEqual([]);
  });

  it('reports a deleted file by its old path in deletedPaths, not files', () => {
    const d = parseUnifiedDiff(RAW);
    expect(d.deletedPaths).toEqual(['gone.ts']);
    expect(d.files.map((f) => f.path)).toEqual(['src/a.ts']);
  });

  it('keeps the new path for a rename and reports no deletion', () => {
    const raw = [
      'diff --git a/old/x.ts b/new/x.ts',
      'similarity index 90%',
      'rename from old/x.ts',
      'rename to new/x.ts',
      '--- a/old/x.ts',
      '+++ b/new/x.ts',
      '@@ -1,1 +1,1 @@',
      '-a',
      '+b',
    ].join('\n');
    const d = parseUnifiedDiff(raw);
    expect(d.files.map((f) => f.path)).toEqual(['new/x.ts']);
    expect(d.deletedPaths).toEqual([]);
  });

  it('has no deletedPaths for an empty diff', () => {
    expect(parseUnifiedDiff('').deletedPaths).toEqual([]);
  });
});
