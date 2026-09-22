import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Context data-access. The module owns no tables of its own — its data is on
 * disk — so the only query it needs is the workspace-scoped lookup that turns a
 * repo id into the `{ owner, name }` the git adapter resolves a clone path
 * from. Scoping it here is the tenancy guard: without the `workspaceId`
 * predicate, any id would read another tenant's checkout.
 */

export interface ContextRepoRef {
  id: string;
  owner: string;
  name: string;
}

export class ContextRepository {
  constructor(private db: Db) {}

  async getRepoRef(workspaceId: string, repoId: string): Promise<ContextRepoRef | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }
}
