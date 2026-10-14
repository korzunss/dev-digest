import { describe, it, expect } from 'vitest';
import { fileDiffSection } from '../src/modules/reviews/helpers.js';
import { diffFromPrFiles } from '../src/modules/reviews/diff-loader.js';

const RAW = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,1 +1,2 @@',
  ' one',
  '+two',
  'diff --git a/src/a.tsx b/src/a.tsx',
  '--- a/src/a.tsx',
  '+++ b/src/a.tsx',
  '@@ -1,1 +1,2 @@',
  ' alpha',
  '+beta',
  '',
].join('\n');

describe('fileDiffSection', () => {
  it('returns the section of the exact path', () => {
    const section = fileDiffSection(RAW, 'src/a.ts');
    expect(section).toContain('+two');
    expect(section).not.toContain('+beta');
    expect(section?.startsWith('diff --git a/src/a.ts b/src/a.ts')).toBe(true);
  });

  it('does not match a path that only shares a prefix (a.ts vs a.tsx)', () => {
    const section = fileDiffSection(RAW, 'src/a.tsx');
    expect(section).toContain('+beta');
    expect(section).not.toContain('+two');
  });

  it('returns null for a file that is not in the diff', () => {
    expect(fileDiffSection(RAW, 'src/missing.ts')).toBeNull();
    expect(fileDiffSection('', 'src/a.ts')).toBeNull();
  });

  it('finds the file in a diff rebuilt from stored pr_files patches', () => {
    const rebuilt = diffFromPrFiles([{ path: 'src/b.ts', patch: '@@ -1,1 +1,2 @@\n x\n+y' }]);
    expect(fileDiffSection(rebuilt.raw, 'src/b.ts')).toContain('+y');
  });
});
