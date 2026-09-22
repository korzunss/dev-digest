import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';
import { isBodyChange } from './helpers.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`; the `agent_skills`
 * link table belongs to the agents repository (which owns the agent side of the
 * link). Workspace-scoped throughout.
 */

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

/** One finding of a run that pulled a given skill — the raw row stats fold. */
export interface SkillFindingRow {
  skillId: string;
  category: string;
  accepted: boolean;
  dismissed: boolean;
}

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
  evidenceFiles?: string[] | null;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  /** Note recorded on the version a body change creates. Ignored otherwise. */
  message?: string;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  /** Every skill in the workspace, by name — the grid's order. */
  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /**
   * Which of `ids` actually belong to this workspace. Used to reject a
   * cross-tenant skill before it is linked to an agent.
   */
  async idsInWorkspace(workspaceId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, ids)));
    return rows.map((r) => r.id);
  }

  /** Delete a skill. Its versions and agent links cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Insert a skill AND record version 1 of its body. */
  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description,
        type: values.type,
        source: values.source,
        body: values.body,
        enabled: values.enabled,
        version: INITIAL_SKILL_VERSION,
        evidenceFiles: values.evidenceFiles ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_SKILL_VERSION);
    return row!;
  }

  /**
   * Update a skill. A changed body bumps the version and snapshots the new body
   * into `skill_versions`; a rename or a toggle does not.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const bodyChanged = isBodyChange(existing, patch);
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(bodyChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (bodyChanged && row) await this.snapshotVersion(row, nextVersion, patch.message);
    return row;
  }

  private async snapshotVersion(
    row: SkillRow,
    version: number,
    message?: string,
  ): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({ skillId: row.id, version, body: row.body, message: message ?? null })
      .onConflictDoNothing();
  }

  /** One body snapshot, or undefined if that version was never recorded. */
  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  /** Body history for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  // ---- skill_context_docs (project-context documents attached to a skill) ----

  /** Attached document paths for one skill, in prompt order. */
  async listContextDocs(skillId: string): Promise<{ path: string; order: number }[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path, order: t.skillContextDocs.order })
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId))
      .orderBy(asc(t.skillContextDocs.order));
    return rows;
  }

  /**
   * Attached paths for SEVERAL skills at once — the run executor needs the union
   * for every skill a run pulled, and one query beats one per skill.
   */
  async contextDocsForSkills(skillIds: string[]): Promise<{ skillId: string; path: string; order: number }[]> {
    if (skillIds.length === 0) return [];
    return this.db
      .select({
        skillId: t.skillContextDocs.skillId,
        path: t.skillContextDocs.path,
        order: t.skillContextDocs.order,
      })
      .from(t.skillContextDocs)
      .where(inArray(t.skillContextDocs.skillId, skillIds))
      .orderBy(asc(t.skillContextDocs.order));
  }

  /** Replace the whole attached set, assigning order = index. */
  async setContextDocs(skillId: string, paths: string[]): Promise<void> {
    await this.db.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
    if (paths.length === 0) return;
    await this.db
      .insert(t.skillContextDocs)
      .values(paths.map((path, i) => ({ skillId, path, order: i })));
  }

  // ---- stats ---------------------------------------------------------------

  /** Agents that have this skill attached (exact — no approximation here). */
  async agentsUsingSkill(
    workspaceId: string,
    skillId: string,
  ): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.agentSkills.skillId, skillId), eq(t.agents.workspaceId, workspaceId)))
      .orderBy(asc(t.agents.name));
  }

  /** How many agents have each of `skillIds` attached (one query, folded in JS). */
  async agentCountsBySkill(
    workspaceId: string,
    skillIds: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (skillIds.length === 0) return counts;
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(inArray(t.agentSkills.skillId, skillIds), eq(t.agents.workspaceId, workspaceId)));
    for (const r of rows) counts.set(r.skillId, (counts.get(r.skillId) ?? 0) + 1);
    return counts;
  }

  /** Completed runs in the window — the denominator of PULL FREQUENCY. */
  async completedRunCount(workspaceId: string, since: Date): Promise<number> {
    const rows = await this.db
      .select({ id: t.agentRuns.id })
      .from(t.agentRuns)
      .where(this.windowedRuns(workspaceId, since));
    return rows.length;
  }

  /** For each skill, the completed runs in the window that pulled it. */
  async runCountsBySkill(
    workspaceId: string,
    skillIds: string[],
    since: Date,
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (skillIds.length === 0) return counts;
    const rows = await this.db
      .select({ skillId: t.runSkills.skillId })
      .from(t.runSkills)
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runSkills.runId))
      .where(and(this.windowedRuns(workspaceId, since), inArray(t.runSkills.skillId, skillIds)));
    for (const r of rows) counts.set(r.skillId, (counts.get(r.skillId) ?? 0) + 1);
    return counts;
  }

  /**
   * Findings produced by the runs that pulled each skill.
   *
   * This is the transitive join the Stats tab is built on: run → review →
   * finding. It says the skill was in the prompt when the finding appeared, NOT
   * that it caused it — nothing in the schema records causation.
   */
  async findingsBySkill(
    workspaceId: string,
    skillIds: string[],
    since: Date,
  ): Promise<SkillFindingRow[]> {
    if (skillIds.length === 0) return [];
    const rows = await this.db
      .select({
        skillId: t.runSkills.skillId,
        category: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.runSkills)
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runSkills.runId))
      .innerJoin(t.reviews, eq(t.reviews.runId, t.agentRuns.id))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(and(this.windowedRuns(workspaceId, since), inArray(t.runSkills.skillId, skillIds)));
    return rows.map((r) => ({
      skillId: r.skillId,
      category: r.category,
      accepted: r.acceptedAt !== null,
      dismissed: r.dismissedAt !== null,
    }));
  }

  /** Record which skills a run pulled, in prompt order. */
  async recordRunSkills(
    runId: string,
    entries: { skillId: string; order: number; tokens?: number | null }[],
  ): Promise<void> {
    if (entries.length === 0) return;
    await this.db
      .insert(t.runSkills)
      .values(
        entries.map((e) => ({
          runId,
          skillId: e.skillId,
          order: e.order,
          tokens: e.tokens ?? null,
        })),
      )
      .onConflictDoNothing();
  }

  /** A run only counts once it finished — a failed run pulled a prompt too, but
   *  it produced no findings, so counting it would depress every accept rate. */
  private windowedRuns(workspaceId: string, since: Date) {
    return and(
      eq(t.agentRuns.workspaceId, workspaceId),
      eq(t.agentRuns.status, 'done'),
      gte(t.agentRuns.ranAt, since),
    );
  }
}
