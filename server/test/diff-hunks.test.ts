import { describe, expect, it } from 'vitest';
import { changedLineRanges, headersFromPatch } from '../src/modules/_shared/diff-hunks.js';

describe('changedLineRanges', () => {
  it('maps +c,d to an inclusive range', () => {
    expect(changedLineRanges('@@ -1,2 +10,3 @@ fn\n+a')).toEqual([{ start: 10, end: 12 }]);
  });
  it('yields nothing for a zero-length hunk', () => {
    expect(changedLineRanges('@@ -5,2 +5,0 @@')).toEqual([]);
  });
  it('defaults the count to 1', () => {
    expect(changedLineRanges('@@ -7 +7 @@')).toEqual([{ start: 7, end: 7 }]);
  });
  it('returns [] for null/empty', () => {
    expect(changedLineRanges(null)).toEqual([]);
    expect(changedLineRanges('')).toEqual([]);
  });
});

describe('headersFromPatch', () => {
  it('keeps numeric headers only', () => {
    expect(headersFromPatch('@@ -1,2 +3,4 @@ ctx\n+x')).toEqual(['@@ -1,2 +3,4 @@']);
  });
});
