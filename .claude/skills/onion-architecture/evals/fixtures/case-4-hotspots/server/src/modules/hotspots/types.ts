import type { ChurnReader, RepoRef } from '@devdigest/shared';
import type { RepoIntel } from '../repo-intel/types.js';
import type { HotspotsRepository } from './repository.js';

export interface HotspotsServiceDeps {
  repo: Pick<HotspotsRepository, 'findRepo'>;
  repoIntel: RepoIntel;
  churn: ChurnReader;
  readSource: (repo: RepoRef, path: string) => Promise<string | null>;
}

export interface Hotspot {
  path: string;
  commits: number;
  percentile: number;
  symbols: number;
  score: number;
}
