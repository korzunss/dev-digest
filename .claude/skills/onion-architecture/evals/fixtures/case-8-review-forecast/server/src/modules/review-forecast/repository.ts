import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ForecastPull } from './types.js';

export class ReviewForecastRepository {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<ForecastPull | undefined> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id, repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    const files = await this.db
      .select({ patch: t.prFiles.patch })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    const diff = files.map((f) => f.patch ?? '').join('\n');
    return { ...row, diff, changedFiles: files.length };
  }
}
