import type { BriefLogger } from '../brief/types.js';
import { MINUTES_PER_1K_TOKENS, MINUTES_PER_DOWNSTREAM_FILE } from './constants.js';

export function estimateMinutes(promptTokens: number, downstreamFiles: number): number {
  const minutes =
    (promptTokens / 1000) * MINUTES_PER_1K_TOKENS + downstreamFiles * MINUTES_PER_DOWNSTREAM_FILE;
  return Math.round(minutes * 10) / 10;
}

export function logDegraded(log: BriefLogger, prId: string, reason: string): void {
  log.warn({ prId, reason }, 'review forecast: blast radius unavailable');
}
