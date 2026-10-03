import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow } from '../../db/rows.js';

export type RepoRow = typeof t.repos.$inferSelect;

/** Blast — the only file in the module touching `db/schema` / `drizzle-orm`. */
export class BlastRepository {
  constructor(private db: Db) {}

  /** PR + its repo, scoped by workspace. */
  async getPull(
    workspaceId: string,
    prId: string,
  ): Promise<{ pull: PullRow; repo: RepoRow } | undefined> {
    const [row] = await this.db
      .select({ pull: t.pullRequests, repo: t.repos })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.pullRequests.repoId, t.repos.id))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async getPrFilePaths(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }
}
