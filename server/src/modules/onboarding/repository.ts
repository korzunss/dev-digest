import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { CLONE_JOB_KIND } from '../repos/constants.js';

/**
 * Onboarding data-access. Owns the `onboarding` row, plus the workspace-scoped
 * repo lookup and the latest clone-job read the view needs.
 */

/** What the service needs to find a clone and name the tour. */
export interface OnboardingRepoRef {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

export interface CloneJobRow {
  status: 'queued' | 'running' | 'done' | 'failed';
  error: string | null;
}

export interface StoredTour {
  json: unknown;
  generatedAt: Date;
}

export class OnboardingRepository {
  constructor(private db: Db) {}

  /** Workspace-scoped: an id alone would read another tenant's repo. */
  async getRepo(workspaceId: string, repoId: string): Promise<OnboardingRepoRef | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** The newest clone job of a repo (D8). `payload->>'repoId'` is a bound parameter. */
  async getLatestCloneJob(repoId: string): Promise<CloneJobRow | undefined> {
    const [row] = await this.db
      .select({ status: t.jobs.status, error: t.jobs.error })
      .from(t.jobs)
      .where(
        and(eq(t.jobs.kind, CLONE_JOB_KIND), sql`${t.jobs.payload}->>'repoId' = ${repoId}`),
      )
      .orderBy(desc(t.jobs.scheduledAt))
      .limit(1);
    return row;
  }

  async getTour(repoId: string): Promise<StoredTour | undefined> {
    const [row] = await this.db
      .select({ json: t.onboarding.json, generatedAt: t.onboarding.generatedAt })
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repoId));
    return row;
  }

  /** One row per repo; a regenerate replaces it and moves `generated_at` (AC-25). */
  async upsertTour(repoId: string, json: unknown): Promise<void> {
    await this.db
      .insert(t.onboarding)
      .values({ repoId, json })
      .onConflictDoUpdate({
        target: t.onboarding.repoId,
        set: { json, generatedAt: sql`now()` },
      });
  }
}
