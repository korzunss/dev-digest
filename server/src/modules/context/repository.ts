import { and, eq, exists, or, sql } from 'drizzle-orm';
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
  contextGlobs: string[];
}

export class ContextRepository {
  constructor(private db: Db) {}

  async getRepoRef(workspaceId: string, repoId: string): Promise<ContextRepoRef | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        contextGlobs: t.repos.contextGlobs,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Replace a repo's search roots. Scoped by both ids: no cross-tenant write. */
  async setContextGlobs(workspaceId: string, repoId: string, globs: string[]): Promise<void> {
    await this.db
      .update(t.repos)
      .set({ contextGlobs: globs })
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
  }

  /**
   * Distinct workspace agents that reach `docPath`: a direct link, or through an
   * ENABLED skill that links it. A disabled agent still counts (its configured
   * links count); a disabled skill alone does not. One query.
   */
  async agentCountForPath(workspaceId: string, docPath: string): Promise<number> {
    const acd = t.agentContextDocs;
    const scd = t.skillContextDocs;
    const direct = exists(
      this.db
        .select({ one: sql`1` })
        .from(acd)
        .where(and(eq(acd.agentId, t.agents.id), eq(acd.path, docPath))),
    );
    const viaSkill = exists(
      this.db
        .select({ one: sql`1` })
        .from(t.agentSkills)
        .innerJoin(
          t.skills,
          and(
            eq(t.skills.id, t.agentSkills.skillId),
            eq(t.skills.enabled, true),
            eq(t.skills.workspaceId, workspaceId),
          ),
        )
        .innerJoin(scd, and(eq(scd.skillId, t.skills.id), eq(scd.path, docPath)))
        .where(eq(t.agentSkills.agentId, t.agents.id)),
    );
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), or(direct, viaSkill)));
    return row?.n ?? 0;
  }
}
