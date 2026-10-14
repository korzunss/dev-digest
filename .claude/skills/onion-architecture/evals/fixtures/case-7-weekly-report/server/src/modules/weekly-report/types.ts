import type { RepoIntel } from '../repo-intel/types.js';

export interface WeeklyRepoStats {
  repoId: string;
  fullName: string;
  owner: string;
  name: string;
  provider: string;
  apiBase: string | null;
  reviews: number;
  avgScore: number | null;
}

export type ReportRepoIntel = Pick<RepoIntel, 'getIndexState'>;

export type { ReviewRow } from '../reviews/repository.js';
