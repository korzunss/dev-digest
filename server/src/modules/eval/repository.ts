import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export interface RunRow {
  id: string;
  agentId: string | null;
  prId: string | null;
  status: string | null;
  durationMs: number | null;
  costUsd: number | null;
}

export interface FindingRow {
  runId: string;
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  category: string;
  title: string;
  rationale: string;
}

export interface EvalRunInsert {
  caseId: string;
  actualOutput: unknown;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
}

const runColumns = {
  id: t.agentRuns.id,
  agentId: t.agentRuns.agentId,
  prId: t.agentRuns.prId,
  status: t.agentRuns.status,
  durationMs: t.agentRuns.durationMs,
  costUsd: t.agentRuns.costUsd,
};

/** Reads the stored runs of a PR and writes eval_cases / eval_runs. No LLM, no other module. */
export class EvalRepository {
  constructor(private db: Db) {}

  async findWorkspaceByName(name: string): Promise<{ id: string } | null> {
    const [row] = await this.db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, name))
      .limit(1);
    return row ?? null;
  }

  async findPull(
    workspaceId: string,
    repoFullName: string,
    number: number,
  ): Promise<{ id: string; headSha: string } | null> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id, headSha: t.pullRequests.headSha })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.repos.fullName, repoFullName),
          eq(t.repos.provider, 'github'),
          eq(t.pullRequests.number, number),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findAgentsByName(
    workspaceId: string,
    names: string[],
  ): Promise<{ id: string; name: string }[]> {
    if (names.length === 0) return [];
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), inArray(t.agents.name, names)))
      .orderBy(t.agents.id);
  }

  /** Newest `done` run per agent on the PR. */
  async latestDoneRuns(prId: string, agentIds: string[]): Promise<RunRow[]> {
    if (agentIds.length === 0) return [];
    const rows = await this.db
      .select(runColumns)
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.prId, prId),
          eq(t.agentRuns.status, 'done'),
          inArray(t.agentRuns.agentId, agentIds),
        ),
      )
      .orderBy(desc(t.agentRuns.ranAt));
    const seen = new Set<string>();
    const latest: RunRow[] = [];
    for (const r of rows) {
      if (!r.agentId || seen.has(r.agentId)) continue;
      seen.add(r.agentId);
      latest.push(r);
    }
    return latest;
  }

  async getRuns(runIds: string[]): Promise<RunRow[]> {
    if (runIds.length === 0) return [];
    return this.db.select(runColumns).from(t.agentRuns).where(inArray(t.agentRuns.id, runIds));
  }

  /**
   * Findings of the given runs, through `reviews.run_id`. `run_id` has no index,
   * so the scan is bounded by `pr_id` (reviews_pr_idx) as well.
   */
  async findingsForRuns(prId: string, runIds: string[]): Promise<FindingRow[]> {
    const ids = runIds;
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({
        runId: t.reviews.runId,
        id: t.findings.id,
        file: t.findings.file,
        startLine: t.findings.startLine,
        endLine: t.findings.endLine,
        category: t.findings.category,
        title: t.findings.title,
        rationale: t.findings.rationale,
      })
      .from(t.reviews)
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(
        and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review'), inArray(t.reviews.runId, ids)),
      )
      .orderBy(t.findings.file, t.findings.startLine, t.findings.id);
    return rows.flatMap((r) => (r.runId ? [{ ...r, runId: r.runId }] : []));
  }

  async upsertEvalCase(input: {
    workspaceId: string;
    ownerId: string;
    name: string;
    inputMeta: unknown;
    expectedOutput: unknown;
  }): Promise<string> {
    const where = and(
      eq(t.evalCases.workspaceId, input.workspaceId),
      eq(t.evalCases.ownerKind, 'agent'),
      eq(t.evalCases.ownerId, input.ownerId),
      eq(t.evalCases.name, input.name),
    );
    const [existing] = await this.db
      .select({ id: t.evalCases.id })
      .from(t.evalCases)
      .where(where)
      .limit(1);
    if (existing) {
      await this.db
        .update(t.evalCases)
        .set({ inputMeta: input.inputMeta, expectedOutput: input.expectedOutput })
        .where(eq(t.evalCases.id, existing.id));
      return existing.id;
    }
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: input.workspaceId,
        ownerKind: 'agent',
        ownerId: input.ownerId,
        name: input.name,
        inputMeta: input.inputMeta,
        expectedOutput: input.expectedOutput,
      })
      .returning({ id: t.evalCases.id });
    return row!.id;
  }

  async insertEvalRun(input: EvalRunInsert): Promise<string> {
    const [row] = await this.db
      .insert(t.evalRuns)
      .values({
        caseId: input.caseId,
        actualOutput: input.actualOutput,
        pass: input.pass,
        recall: input.recall,
        precision: input.precision,
        citationAccuracy: input.citationAccuracy,
        durationMs: input.durationMs,
        costUsd: input.costUsd,
      })
      .returning({ id: t.evalRuns.id });
    return row!.id;
  }
}
