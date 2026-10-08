import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type RepoRow = typeof t.repos.$inferSelect;

export interface DigestRow {
  reviewId: string;
  pullId: string;
  pullNumber: number;
  title: string;
  score: number | null;
}

export interface FindingCount {
  reviewId: string;
  findings: number;
  critical: number;
}

export class ReviewDigestRepository {
  constructor(private db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async reviewsSince(
    workspaceId: string,
    repoId: string,
    since: Date,
    limit: number,
  ): Promise<DigestRow[]> {
    return this.db
      .select({
        reviewId: t.reviews.id,
        pullId: t.pullRequests.id,
        pullNumber: t.pullRequests.number,
        title: t.pullRequests.title,
        score: t.reviews.score,
      })
      .from(t.reviews)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
      .where(
        and(
          eq(t.reviews.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, repoId),
          eq(t.reviews.kind, 'review'),
          gte(t.reviews.createdAt, since),
        ),
      )
      .orderBy(desc(t.reviews.createdAt))
      .limit(limit);
  }

  async findingCounts(reviewIds: string[]): Promise<FindingCount[]> {
    if (reviewIds.length === 0) return [];
    return this.db
      .select({
        reviewId: t.findings.reviewId,
        findings: sql<number>`count(*)::int`,
        critical: sql<number>`count(*) filter (where ${t.findings.severity} = 'CRITICAL')::int`,
      })
      .from(t.findings)
      .where(inArray(t.findings.reviewId, reviewIds))
      .groupBy(t.findings.reviewId);
  }
}
