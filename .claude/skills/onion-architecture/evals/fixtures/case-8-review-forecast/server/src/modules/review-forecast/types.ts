import type { IndexState, RepoIntel } from '../repo-intel/types.js';

export type ForecastRepoIntel = Pick<RepoIntel, 'getIndexState'>;

export interface ForecastPull {
  id: string;
  repoId: string;
  diff: string;
  changedFiles: number;
}

export function isUsableIndex(state: IndexState): boolean {
  return !state.degraded && state.lastIndexedSha !== '';
}
