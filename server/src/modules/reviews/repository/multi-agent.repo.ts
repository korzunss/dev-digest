import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { FindingRow } from '../../../db/rows.js';

export type AgentRunRow = typeof t.agentRuns.$inferSelect;
export type MultiReviewRow = typeof t.reviews.$inferSelect;

export interface MultiAgentRunHeader {
  id: string;
  prId: string;
  ranAt: Date;
  prNumber: number;
  prTitle: string;
}
export interface AgentRunWithMultiId extends AgentRunWithName {
  multiAgentRunId: string;
}
export interface AgentRunWithName {
  run: AgentRunRow;
  agentName: string | null;
}
export interface ReviewWithFindings {
  review: MultiReviewRow;
  findings: FindingRow[];
}
export interface DoneRunSample {
  agentId: string;
  runId: string;
  durationMs: number | null;
  costUsd: number | null;
  ranAt: Date;
}
export interface ReviewSummaryRow {
  runId: string;
  summary: string | null;
  createdAt: Date;
}

// ---- multi-agent runs ------------------------------------------------------

/** Create the grouping row of a multi-agent review. */
export async function insertMultiAgentRun(
  db: Db,
  values: { workspaceId: string; prId: string },
): Promise<{ id: string; ranAt: Date }> {
  const [row] = await db
    .insert(t.multiAgentRuns)
    .values({ workspaceId: values.workspaceId, prId: values.prId })
    .returning({ id: t.multiAgentRuns.id, ranAt: t.multiAgentRuns.ranAt });
  return row!;
}

/** Remove a grouping row (linked agent runs keep existing, their link is set null). */
export async function deleteMultiAgentRun(db: Db, workspaceId: string, id: string): Promise<void> {
  await db
    .delete(t.multiAgentRuns)
    .where(and(eq(t.multiAgentRuns.id, id), eq(t.multiAgentRuns.workspaceId, workspaceId)));
}

/**
 * Mark the still-running agent runs of a group failed (with `finishedAt` and a reason).
 * Used when starting the group fails part-way, so no run stays `running` and unlinked.
 */
export async function failRunningRunsOfMultiRun(
  db: Db,
  workspaceId: string,
  multiAgentRunId: string,
  error: string,
): Promise<void> {
  await db
    .update(t.agentRuns)
    .set({ status: 'failed', error, finishedAt: new Date() })
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.multiAgentRunId, multiAgentRunId),
        eq(t.agentRuns.status, 'running'),
      ),
    );
}

/** A multi-agent run of this workspace with its PR's number and title. */
export async function getMultiAgentRun(
  db: Db,
  workspaceId: string,
  id: string,
): Promise<MultiAgentRunHeader | undefined> {
  const [row] = await db
    .select({
      id: t.multiAgentRuns.id,
      prId: t.multiAgentRuns.prId,
      ranAt: t.multiAgentRuns.ranAt,
      prNumber: t.pullRequests.number,
      prTitle: t.pullRequests.title,
    })
    .from(t.multiAgentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.id, id)));
  return row;
}

/** The agent runs of a multi-agent run, oldest first, with the agent's name (null once deleted). */
export async function agentRunsForMultiRun(
  db: Db,
  multiAgentRunId: string,
): Promise<AgentRunWithName[]> {
  const rows = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(eq(t.agentRuns.multiAgentRunId, multiAgentRunId))
    .orderBy(asc(t.agentRuns.ranAt), asc(t.agentRuns.id));
  return rows;
}

/** The newest `limit` multi-agent runs on the PRs of one repository (workspace-scoped). */
export async function recentMultiAgentRunsForRepo(
  db: Db,
  workspaceId: string,
  repoId: string,
  limit = 10,
): Promise<MultiAgentRunHeader[]> {
  return db
    .select({
      id: t.multiAgentRuns.id,
      prId: t.multiAgentRuns.prId,
      ranAt: t.multiAgentRuns.ranAt,
      prNumber: t.pullRequests.number,
      prTitle: t.pullRequests.title,
    })
    .from(t.multiAgentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.pullRequests.repoId, repoId)))
    .orderBy(desc(t.multiAgentRuns.ranAt), desc(t.multiAgentRuns.id))
    .limit(limit);
}

/** The newest multi-agent run of one PR (workspace-scoped), if any. */
export async function latestMultiAgentRunForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<MultiAgentRunHeader | undefined> {
  const [row] = await db
    .select({
      id: t.multiAgentRuns.id,
      prId: t.multiAgentRuns.prId,
      ranAt: t.multiAgentRuns.ranAt,
      prNumber: t.pullRequests.number,
      prTitle: t.pullRequests.title,
    })
    .from(t.multiAgentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
    .orderBy(desc(t.multiAgentRuns.ranAt), desc(t.multiAgentRuns.id))
    .limit(1);
  return row;
}

/** The agent runs of several multi-agent runs in one query, oldest first. */
export async function agentRunsForMultiRuns(
  db: Db,
  ids: string[],
): Promise<AgentRunWithMultiId[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(inArray(t.agentRuns.multiAgentRunId, ids))
    .orderBy(asc(t.agentRuns.ranAt), asc(t.agentRuns.id));
  return rows.map(({ run, agentName }) => ({
    run,
    agentName,
    multiAgentRunId: run.multiAgentRunId!,
  }));
}

/** The reviews written by these runs, each with its findings. */
export async function reviewsWithFindingsForRuns(
  db: Db,
  runIds: string[],
): Promise<ReviewWithFindings[]> {
  if (runIds.length === 0) return [];
  const reviews = await db.select().from(t.reviews).where(inArray(t.reviews.runId, runIds));
  if (reviews.length === 0) return [];
  const findings = await db
    .select()
    .from(t.findings)
    .where(
      inArray(
        t.findings.reviewId,
        reviews.map((r) => r.id),
      ),
    );
  return reviews.map((review) => ({
    review,
    findings: findings.filter((f) => f.reviewId === review.id),
  }));
}

// ---- estimates -------------------------------------------------------------

/**
 * Each agent's newest `limit` finished local runs (status 'done') in the workspace.
 * CI runs (source 'ci', spec 014 AC-69) stay out of these estimates.
 */
export async function lastDoneRunsPerAgent(
  db: Db,
  workspaceId: string,
  limit = 5,
): Promise<DoneRunSample[]> {
  const ranked = db
    .select({
      agentId: t.agentRuns.agentId,
      runId: t.agentRuns.id,
      durationMs: t.agentRuns.durationMs,
      costUsd: t.agentRuns.costUsd,
      ranAt: t.agentRuns.ranAt,
      rn: sql<number>`row_number() over (partition by ${t.agentRuns.agentId} order by ${t.agentRuns.ranAt} desc)`.as(
        'rn',
      ),
    })
    .from(t.agentRuns)
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.status, 'done'),
        eq(t.agentRuns.source, 'local'),
        isNotNull(t.agentRuns.agentId),
      ),
    )
    .as('ranked');
  const rows = await db
    .select({
      agentId: ranked.agentId,
      runId: ranked.runId,
      durationMs: ranked.durationMs,
      costUsd: ranked.costUsd,
      ranAt: ranked.ranAt,
    })
    .from(ranked)
    .where(lte(ranked.rn, limit))
    .orderBy(desc(ranked.ranAt));
  return rows.map((r) => ({ ...r, agentId: r.agentId! }));
}

/** The summary text of these runs' reviews (newest review first per run is the caller's concern). */
export async function summariesForRuns(
  db: Db,
  runIds: string[],
): Promise<ReviewSummaryRow[]> {
  if (runIds.length === 0) return [];
  const rows = await db
    .select({ runId: t.reviews.runId, summary: t.reviews.summary, createdAt: t.reviews.createdAt })
    .from(t.reviews)
    .where(inArray(t.reviews.runId, runIds))
    .orderBy(desc(t.reviews.createdAt));
  return rows.map((r) => ({ ...r, runId: r.runId! }));
}
