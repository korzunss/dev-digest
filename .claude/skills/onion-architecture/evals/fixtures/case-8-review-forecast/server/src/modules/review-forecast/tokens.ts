import type { TokenCounter } from '../brief/types.js';
import { MAX_DIFF_CHARS } from './constants.js';

export type { TokenCounter };

export function countPromptTokens(counter: TokenCounter, diff: string): number {
  return counter.count(diff.slice(0, MAX_DIFF_CHARS));
}
