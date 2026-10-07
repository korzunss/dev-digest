import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow } from '../../db/rows.js';

export type BriefRepoRow = typeof t.repos.$inferSelect;

export interface BriefPrFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface BriefReview {
  verdict: string | null;
  score: number | null;
  /** Only the columns the brief needs — never `rationale` / `suggestion` (AC-10, AC-19). */
  findings: { file: string; startLine: number; severity: string; title: string }[];
}

/**
 * The ONLY brief file that touches `db/schema` / `drizzle-orm`. Workspace
 * scoping goes through the PR row, as in `intent/repository.ts`.
 */
export class BriefRepository {
  constructor(private db: Db) {}

  async getPull(
    workspaceId: string,
    prId: string,
  ): Promise<{ pull: PullRow; repo: BriefRepoRow } | undefined> {
    const [row] = await this.db
      .select({ pull: t.pullRequests, repo: t.repos })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.pullRequests.repoId, t.repos.id))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  getPrFiles(prId: string): Promise<BriefPrFile[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  /** Newest `kind='review'` row from any agent, with its non-dismissed findings. */
  async latestReview(prId: string): Promise<BriefReview | undefined> {
    const [latest] = await this.db
      .select({ id: t.reviews.id, verdict: t.reviews.verdict, score: t.reviews.score })
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt))
      .limit(1);
    if (!latest) return undefined;
    const findings = await this.db
      .select({
        file: t.findings.file,
        startLine: t.findings.startLine,
        severity: t.findings.severity,
        title: t.findings.title,
      })
      .from(t.findings)
      .where(and(eq(t.findings.reviewId, latest.id), isNull(t.findings.dismissedAt)));
    return { verdict: latest.verdict, score: latest.score, findings };
  }

  async getBrief(prId: string): Promise<unknown | undefined> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .where(eq(t.prBrief.prId, prId));
    return row?.json;
  }

  async upsertBrief(prId: string, json: unknown): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json } });
  }
}
