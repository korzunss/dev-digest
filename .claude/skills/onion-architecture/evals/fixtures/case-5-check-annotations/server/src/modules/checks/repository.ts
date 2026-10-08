import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type ReviewTargetRow = {
  reviewId: string;
  prNumber: number;
  headSha: string;
  repoId: string;
};

export class ChecksRepository {
  constructor(private db: Db) {}

  async findTarget(workspaceId: string, reviewId: string): Promise<ReviewTargetRow | undefined> {
    const [row] = await this.db
      .select({
        reviewId: t.reviews.id,
        prNumber: t.pullRequests.number,
        headSha: t.pullRequests.headSha,
        repoId: t.pullRequests.repoId,
      })
      .from(t.reviews)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
      .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.reviews.id, reviewId)));
    return row;
  }

  async findRepo(workspaceId: string, repoId: string) {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  openFindings(reviewId: string) {
    return this.db
      .select({
        file: t.findings.file,
        startLine: t.findings.startLine,
        endLine: t.findings.endLine,
        severity: t.findings.severity,
        title: t.findings.title,
        rationale: t.findings.rationale,
      })
      .from(t.findings)
      .where(and(eq(t.findings.reviewId, reviewId), isNull(t.findings.dismissedAt)))
      .orderBy(asc(t.findings.file), asc(t.findings.startLine));
  }
}
