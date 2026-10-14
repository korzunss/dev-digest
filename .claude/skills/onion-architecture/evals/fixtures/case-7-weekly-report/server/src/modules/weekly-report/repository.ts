import { and, avg, count, eq, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { WeeklyRepoStats } from './types.js';

export class WeeklyReportRepository {
  constructor(private db: Db) {}

  async statsByRepo(workspaceId: string, window: SQL): Promise<WeeklyRepoStats[]> {
    const rows = await this.db
      .select({
        repoId: t.repos.id,
        fullName: t.repos.fullName,
        owner: t.repos.owner,
        name: t.repos.name,
        provider: t.repos.provider,
        apiBase: t.repos.apiBase,
        reviews: count(t.reviews.id),
        avgScore: avg(t.reviews.score),
      })
      .from(t.reviews)
      .innerJoin(t.pullRequests, eq(t.reviews.prId, t.pullRequests.id))
      .innerJoin(t.repos, eq(t.pullRequests.repoId, t.repos.id))
      .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.reviews.kind, 'review'), window))
      .groupBy(t.repos.id);
    return rows.map((r) => ({ ...r, avgScore: r.avgScore === null ? null : Number(r.avgScore) }));
  }
}
