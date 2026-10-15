import { and, asc, desc, eq, gte, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiFailOn, CiPostAs, CiRunStatus, CiTrigger } from '@devdigest/shared';

/**
 * Export-to-CI data-access. Owns `ci_installations` and `ci_runs`, and writes
 * the `agent_runs` row (source 'ci') that mirrors an ingested CI run. Reads
 * `agents`, `repos`, `memory` and `pull_requests` for the export and the views.
 * Workspace-scoped throughout.
 */

export type CiInstallationRow = typeof t.ciInstallations.$inferSelect;
export type CiRunRow = typeof t.ciRuns.$inferSelect;

export interface UpsertInstallation {
  agentId: string;
  repo: string;
  repoId: string | null;
  mode: 'pr' | 'manual';
  exportedAgentVersion: number | null;
  exportedCiFailOn: CiFailOn | null;
  workflowVersion: number | null;
  runnerVersion: string | null;
  triggers: CiTrigger[];
  postAs: CiPostAs;
  prNumber: number | null;
  prUrl: string | null;
}

export interface GithubRepoRow {
  id: string;
  fullName: string;
  defaultBranch: string;
}

export interface MemoryExportRow {
  kind: string;
  content: string;
}

export interface RecordCiRun {
  workspaceId: string;
  installationId: string | null;
  agentId: string | null;
  agentName: string;
  repoFullName: string;
  githubRunId: number;
  runAttempt: number;
  headSha: string;
  prNumber: number | null;
  localPrId: string | null;
  ranAt: Date;
  status: CiRunStatus;
  verdict: string | null;
  findingsCount: number | null;
  costUsd: number | null;
  durationMs: number | null;
  model: string | null;
  agentVersion: number | null;
  runnerVersion: string | null;
  errorClass: string | null;
  jobUrl: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  blockers: number | null;
}

/** A page position: the keyset of the last row already returned. */
export interface RunsCursor {
  ranAt: Date;
  id: string;
}

export interface ListRunsQuery {
  since: Date;
  agentId?: string;
  repo?: string;
  status?: CiRunStatus;
  cursor?: RunsCursor | null;
  /** Rows to return; the repository fetches one extra to tell whether more exist. */
  limit: number;
}

export interface CiRunListRow {
  run: CiRunRow;
  /** True when the agent row is gone (the FK was set to null on delete). */
  agentDeleted: boolean;
  localPr: { repoId: string; number: number } | null;
}

export interface RunsPage {
  rows: CiRunListRow[];
  hasMore: boolean;
}

export class CiRepository {
  constructor(private db: Db) {}

  // ---------------------------------------------------------- installations

  async findInstallation(agentId: string, repo: string): Promise<CiInstallationRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciInstallations)
      .where(and(eq(t.ciInstallations.agentId, agentId), eq(t.ciInstallations.repo, repo)));
    return row;
  }

  async findInstallationById(
    workspaceId: string,
    id: string,
  ): Promise<CiInstallationRow | undefined> {
    const [row] = await this.db
      .select({ inst: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .where(and(eq(t.ciInstallations.id, id), eq(t.agents.workspaceId, workspaceId)));
    return row?.inst;
  }

  /** Another agent of this workspace that already has an installation on `repo`, if any. */
  async findOtherAgentInstallation(
    workspaceId: string,
    repo: string,
    agentId: string,
  ): Promise<{ agentId: string; agentName: string } | null> {
    const [row] = await this.db
      .select({ agentId: t.agents.id, agentName: t.agents.name })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.ciInstallations.repo, repo),
          ne(t.ciInstallations.agentId, agentId),
        ),
      )
      .orderBy(asc(t.ciInstallations.installedAt), asc(t.ciInstallations.id))
      .limit(1);
    return row ?? null;
  }

  listInstallations(agentId: string): Promise<CiInstallationRow[]> {
    return this.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.agentId, agentId))
      .orderBy(asc(t.ciInstallations.installedAt), asc(t.ciInstallations.id));
  }

  /** Installations the refresh polls: of this workspace, tied to a connected repo. */
  async listActiveInstallations(
    workspaceId: string,
    agentId?: string,
  ): Promise<CiInstallationRow[]> {
    const rows = await this.db
      .select({ inst: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          isNotNull(t.ciInstallations.repoId),
          agentId ? eq(t.ciInstallations.agentId, agentId) : undefined,
        ),
      )
      .orderBy(asc(t.ciInstallations.installedAt), asc(t.ciInstallations.id));
    return rows.map((r) => r.inst);
  }

  async upsertInstallation(values: UpsertInstallation): Promise<CiInstallationRow> {
    const now = new Date();
    const set = {
      repoId: values.repoId,
      mode: values.mode,
      exportedAgentVersion: values.exportedAgentVersion,
      exportedCiFailOn: values.exportedCiFailOn,
      workflowVersion: values.workflowVersion,
      runnerVersion: values.runnerVersion,
      triggers: values.triggers,
      postAs: values.postAs,
      prNumber: values.prNumber,
      prUrl: values.prUrl,
      updatedAt: now,
    };
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({ agentId: values.agentId, repo: values.repo, targetType: 'gha', ...set })
      .onConflictDoUpdate({
        target: [t.ciInstallations.agentId, t.ciInstallations.repo],
        set,
      })
      .returning();
    return row!;
  }

  /** Delete one installation of the workspace. Returns whether a row went away. */
  async deleteInstallation(workspaceId: string, id: string): Promise<boolean> {
    const owned = this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
    const rows = await this.db
      .delete(t.ciInstallations)
      .where(and(eq(t.ciInstallations.id, id), inArray(t.ciInstallations.agentId, owned)))
      .returning({ id: t.ciInstallations.id });
    return rows.length > 0;
  }

  async setScanCursor(id: string, at: Date): Promise<void> {
    await this.db
      .update(t.ciInstallations)
      .set({ scanCursor: at })
      .where(eq(t.ciInstallations.id, id));
  }

  // ------------------------------------------------------ export inputs

  githubReposForWorkspace(workspaceId: string): Promise<GithubRepoRow[]> {
    return this.db
      .select({
        id: t.repos.id,
        fullName: t.repos.fullName,
        defaultBranch: t.repos.defaultBranch,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.provider, 'github')))
      .orderBy(asc(t.repos.fullName));
  }

  /** Memory for the export: only this repo's entries, never global/team (AC-14), oldest first. */
  memoryForExport(workspaceId: string, repoId: string): Promise<MemoryExportRow[]> {
    return this.db
      .select({ kind: t.memory.kind, content: t.memory.content })
      .from(t.memory)
      .where(
        and(
          eq(t.memory.workspaceId, workspaceId),
          eq(t.memory.scope, 'repo'),
          eq(t.memory.repoId, repoId),
        ),
      )
      .orderBy(asc(t.memory.createdAt), asc(t.memory.id));
  }

  async localPrId(repoId: string, number: number): Promise<string | null> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, number)));
    return row?.id ?? null;
  }

  // ------------------------------------------------------------------ runs

  /** Which of these GitHub runs already have a record, as (run, attempt) pairs. */
  async recordedAttempts(
    workspaceId: string,
    repo: string,
    runIds: number[],
  ): Promise<{ githubRunId: number; runAttempt: number }[]> {
    if (runIds.length === 0) return [];
    return this.db
      .select({ githubRunId: t.ciRuns.githubRunId, runAttempt: t.ciRuns.runAttempt })
      .from(t.ciRuns)
      .where(
        and(
          eq(t.ciRuns.workspaceId, workspaceId),
          eq(t.ciRuns.repoFullName, repo),
          inArray(t.ciRuns.githubRunId, runIds),
        ),
      );
  }

  /**
   * Record one ingested CI run in one transaction. `ci_runs` is inserted
   * ON CONFLICT DO NOTHING; only when a row was actually inserted is the mirror
   * `agent_runs` row (source 'ci', no `pr_id`, no `run_skills`) written and
   * linked. Returns whether this call recorded the run.
   */
  recordCiRun(input: RecordCiRun): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(t.ciRuns)
        .values({
          workspaceId: input.workspaceId,
          ciInstallationId: input.installationId,
          agentId: input.agentId,
          agentName: input.agentName,
          repoFullName: input.repoFullName,
          githubRunId: input.githubRunId,
          runAttempt: input.runAttempt,
          headSha: input.headSha,
          prNumber: input.prNumber,
          localPrId: input.localPrId,
          ranAt: input.ranAt,
          status: input.status,
          verdict: input.verdict,
          findingsCount: input.findingsCount,
          costUsd: input.costUsd,
          durationMs: input.durationMs,
          model: input.model,
          agentVersion: input.agentVersion,
          runnerVersion: input.runnerVersion,
          errorClass: input.errorClass,
          githubUrl: input.jobUrl,
          source: 'ci',
        })
        .onConflictDoNothing()
        .returning({ id: t.ciRuns.id });
      if (!run) return false;

      const [agentRun] = await tx
        .insert(t.agentRuns)
        .values({
          workspaceId: input.workspaceId,
          agentId: input.agentId,
          prId: null,
          ranAt: input.ranAt,
          model: input.model,
          durationMs: input.durationMs,
          tokensIn: input.tokensIn,
          tokensOut: input.tokensOut,
          costUsd: input.costUsd,
          status: input.status === 'error' ? 'failed' : 'done',
          error: input.status === 'error' ? input.errorClass : null,
          source: 'ci',
          findingsCount: input.findingsCount,
          blockers: input.blockers,
        })
        .returning({ id: t.agentRuns.id });
      await tx
        .update(t.ciRuns)
        .set({ agentRunId: agentRun!.id })
        .where(eq(t.ciRuns.id, run.id));
      return true;
    });
  }

  /** The newest run per installation, for the installations view. */
  async latestRunByInstallation(
    ids: string[],
  ): Promise<Map<string, { status: CiRunStatus; ranAt: Date }>> {
    const out = new Map<string, { status: CiRunStatus; ranAt: Date }>();
    if (ids.length === 0) return out;
    // One row per installation: DISTINCT ON keeps the first row of each group of the ORDER BY.
    const rows = await this.db
      .selectDistinctOn([t.ciRuns.ciInstallationId], {
        installationId: t.ciRuns.ciInstallationId,
        status: t.ciRuns.status,
        ranAt: t.ciRuns.ranAt,
      })
      .from(t.ciRuns)
      .where(
        and(
          inArray(t.ciRuns.ciInstallationId, ids),
          isNotNull(t.ciRuns.status),
          isNotNull(t.ciRuns.ranAt),
        ),
      )
      .orderBy(asc(t.ciRuns.ciInstallationId), desc(t.ciRuns.ranAt), desc(t.ciRuns.id));
    for (const r of rows) {
      if (!r.installationId || !r.status || !r.ranAt) continue;
      out.set(r.installationId, { status: r.status, ranAt: r.ranAt });
    }
    return out;
  }

  /** Keyset page over (ran_at, id), newest first. `agentDeleted` = no agent row left. */
  async listRuns(workspaceId: string, query: ListRunsQuery): Promise<RunsPage> {
    const cursor = query.cursor
      ? sql`(${t.ciRuns.ranAt}, ${t.ciRuns.id}) < (${query.cursor.ranAt.toISOString()}::timestamptz, ${query.cursor.id}::uuid)`
      : undefined;
    const rows = await this.db
      .select({
        run: t.ciRuns,
        agentRowId: t.agents.id,
        prRepoId: t.pullRequests.repoId,
        prNumber: t.pullRequests.number,
      })
      .from(t.ciRuns)
      .leftJoin(t.agents, eq(t.agents.id, t.ciRuns.agentId))
      .leftJoin(t.pullRequests, eq(t.pullRequests.id, t.ciRuns.localPrId))
      .where(
        and(
          eq(t.ciRuns.workspaceId, workspaceId),
          gte(t.ciRuns.ranAt, query.since),
          query.agentId ? eq(t.ciRuns.agentId, query.agentId) : undefined,
          query.repo ? eq(t.ciRuns.repoFullName, query.repo) : undefined,
          query.status ? eq(t.ciRuns.status, query.status) : undefined,
          cursor,
        ),
      )
      .orderBy(desc(t.ciRuns.ranAt), desc(t.ciRuns.id))
      .limit(query.limit + 1);
    const hasMore = rows.length > query.limit;
    return {
      hasMore,
      rows: rows.slice(0, query.limit).map((r) => ({
        run: r.run,
        agentDeleted: r.agentRowId === null,
        localPr:
          r.prRepoId !== null && r.prNumber !== null
            ? { repoId: r.prRepoId, number: r.prNumber }
            : null,
      })),
    };
  }
}
