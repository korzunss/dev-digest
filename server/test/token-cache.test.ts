import { describe, it, expect } from 'vitest';
import { TokenCountCache, tokenCacheKey } from '../src/modules/context/token-cache.js';

describe('TokenCountCache', () => {
  it('misses, then hits after set', () => {
    const c = new TokenCountCache();
    const k = tokenCacheKey('/c', 'docs/a.md', 1, 10);
    expect(c.get(k)).toBeUndefined();
    c.set(k, 42);
    expect(c.get(k)).toBe(42);
  });

  it('treats a changed mtime or size as a miss', () => {
    const c = new TokenCountCache();
    c.set(tokenCacheKey('/c', 'a.md', 1, 10), 5);
    expect(c.get(tokenCacheKey('/c', 'a.md', 2, 10))).toBeUndefined();
    expect(c.get(tokenCacheKey('/c', 'a.md', 1, 11))).toBeUndefined();
  });

  it('evicts the oldest insertion past max', () => {
    const c = new TokenCountCache(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
  });

  // exactly `max` entries is within capacity: nothing is evicted yet
  it('keeps every entry up to exactly max', () => {
    const c = new TokenCountCache(3);
    for (const k of ['a', 'b', 'c']) c.set(k, 1);
    expect(['a', 'b', 'c'].map((k) => c.get(k))).toEqual([1, 1, 1]);
  });

  // re-setting a key refreshes its age, so the next eviction takes a different one
  it('re-setting a key moves it to newest and overwrites the value', () => {
    const c = new TokenCountCache(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('a', 9);
    c.set('c', 3);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(9);
    expect(c.get('c')).toBe(3);
  });

  // an overwrite must not count as growth: no neighbour is evicted
  it('overwriting a key at capacity evicts nothing', () => {
    const c = new TokenCountCache(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('b', 3);
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBe(3);
  });

  // a size/mtime change yields a new key, so the stale entry is simply never read again and ages out
  it('a stale (old mtime) entry ages out under pressure while the fresh key is kept', () => {
    const c = new TokenCountCache(2);
    const stale = tokenCacheKey('/c', 'a.md', 1, 10);
    const fresh = tokenCacheKey('/c', 'a.md', 2, 10);
    c.set(stale, 5);
    c.set(fresh, 7);
    c.set(tokenCacheKey('/c', 'b.md', 1, 1), 1);
    expect(c.get(stale)).toBeUndefined();
    expect(c.get(fresh)).toBe(7);
  });

  it('keys differ by clone, path, mtime and size', () => {
    const base = tokenCacheKey('/c', 'a.md', 1, 10);
    for (const other of [
      tokenCacheKey('/d', 'a.md', 1, 10),
      tokenCacheKey('/c', 'b.md', 1, 10),
      tokenCacheKey('/c', 'a.md', 2, 10),
      tokenCacheKey('/c', 'a.md', 1, 11),
    ]) {
      expect(other).not.toBe(base);
    }
  });
});
