import { MAX_TOKEN_CACHE_ENTRIES } from './constants.js';

/**
 * In-memory, in-process token counts keyed by path + mtime + size, so a repeat
 * listing re-reads no unchanged doc. Never persisted (SPEC-08 AC-7). Stores
 * numbers only — no I/O, no tokenizer.
 */
export const tokenCacheKey = (cloneDir: string, rel: string, mtimeMs: number, size: number): string =>
  [cloneDir, rel, mtimeMs, size].join('\0');

export class TokenCountCache {
  private map = new Map<string, number>();

  constructor(private max: number = MAX_TOKEN_CACHE_ENTRIES) {}

  get(key: string): number | undefined {
    return this.map.get(key);
  }

  set(key: string, tokens: number): void {
    this.map.delete(key);
    this.map.set(key, tokens);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
    }
  }
}
