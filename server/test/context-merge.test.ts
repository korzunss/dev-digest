import { describe, it, expect } from 'vitest';
import { mergeContextPaths } from '../src/modules/reviews/helpers.js';

describe('mergeContextPaths', () => {
  it('puts the agent own documents before inherited ones', () => {
    expect(mergeContextPaths(['specs/own.md'], ['docs/skill.md'])).toEqual([
      'specs/own.md',
      'docs/skill.md',
    ]);
  });

  it('keeps inherited documents in the order given (skill order, then doc order)', () => {
    expect(mergeContextPaths([], ['b.md', 'a.md', 'c.md'])).toEqual(['b.md', 'a.md', 'c.md']);
  });

  it('keeps a duplicate once, at its first occurrence', () => {
    expect(mergeContextPaths(['x.md', 'y.md'], ['y.md', 'z.md', 'x.md'])).toEqual([
      'x.md',
      'y.md',
      'z.md',
    ]);
    expect(mergeContextPaths([], ['a.md', 'a.md'])).toEqual(['a.md']);
  });

  it('returns an empty list when nothing is attached', () => {
    expect(mergeContextPaths([], [])).toEqual([]);
  });
});
