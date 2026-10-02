import { sql } from 'drizzle-orm';
import type { PrMeta } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** Pulls — PR rows synced from the forge. */
export class PullsRepository {
  constructor(private db: Db) {}

  /**
   * Insert a forge PR or refresh the stored row. `withOpenedAt` also writes
   * `opened_at` on insert (the pulls list sync does; polling never has).
   */
  async upsertFromForge(
    workspaceId: string,
    repoId: string,
    pr: PrMeta,
    opts: { withOpenedAt: boolean },
  ): Promise<void> {
    const updatedAt = pr.updated_at ? new Date(pr.updated_at) : null;
    await this.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        headSha: pr.head_sha,
        baseSha: pr.base_sha ?? null,
        additions: pr.additions,
        deletions: pr.deletions,
        filesCount: pr.files_count,
        status: pr.status,
        ...(opts.withOpenedAt ? { openedAt: pr.opened_at ? new Date(pr.opened_at) : null } : {}),
        updatedAt,
      })
      .onConflictDoUpdate({
        target: [t.pullRequests.repoId, t.pullRequests.number],
        set: {
          title: pr.title,
          base: pr.base,
          // D7: keep the stored base SHA while the head and base branch are unchanged, clear it once either moved.
          baseSha: sql`coalesce(excluded.base_sha, case when ${t.pullRequests.headSha} = excluded.head_sha and ${t.pullRequests.base} = excluded.base then ${t.pullRequests.baseSha} end)`,
          headSha: pr.head_sha,
          status: pr.status,
          updatedAt,
        },
      });
  }
}
