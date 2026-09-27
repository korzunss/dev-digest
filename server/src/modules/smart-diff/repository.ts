import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow } from '../../db/rows.js';

export type PrFileRow = typeof t.prFiles.$inferSelect;

/** Narrow finding shape `buildSmartDiff` needs — never the full `findings` row. */
export interface SmartDiffFindingRow {
  file: string;
  startLine: number;
  dismissedAt: Date | null;
}

/**
 * Smart Diff (S5, spec 007) — the only file in the module touching `db/schema`
 * and `drizzle-orm`. Workspace scoping goes through the PR row, same convention
 * as `intent/repository.ts:getPull`.
 */
export class SmartDiffRepository {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  getPrFiles(prId: string): Promise<Pick<PrFileRow, 'path' | 'additions' | 'deletions'>[]> {
    return this.db
      .select({ path: t.prFiles.path, additions: t.prFiles.additions, deletions: t.prFiles.deletions })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  /**
   * D3/D4 — the latest `kind='review'` review's undismissed findings only.
   * Uses the existing `reviews_pr_idx` and `findings_review_idx`
   * (`db/schema/reviews.ts:37,64`); no migration needed.
   */
  async latestReviewFindings(prId: string): Promise<SmartDiffFindingRow[]> {
    const [latest] = await this.db
      .select({ id: t.reviews.id })
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt))
      .limit(1);
    if (!latest) return [];
    return this.db
      .select({ file: t.findings.file, startLine: t.findings.startLine, dismissedAt: t.findings.dismissedAt })
      .from(t.findings)
      .where(eq(t.findings.reviewId, latest.id));
  }
}
