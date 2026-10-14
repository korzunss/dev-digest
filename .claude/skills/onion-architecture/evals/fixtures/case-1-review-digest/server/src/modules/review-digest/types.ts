import type * as t from '../../db/schema.js';

export type ReviewRow = typeof t.reviews.$inferSelect;
export type FindingRow = typeof t.findings.$inferSelect;

export interface DigestEntry {
  reviewId: string;
  pullId: string;
  pullNumber: number;
  title: string;
  score: number | null;
  findings: number;
  critical: number;
}

export interface RepoDigest {
  repoId: string;
  since: string;
  entries: DigestEntry[];
  averageScore: number | null;
}
