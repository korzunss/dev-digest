import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../db/client.js';
import * as t from '../../../db/schema.js';

// ---- row types (derived here, never in types.ts — srv DB gotcha 1) ----------

export type SuiteCaseRow = typeof t.evalSuiteCases.$inferSelect;
export type SuiteRunRow = typeof t.evalSuiteRuns.$inferSelect;
export type CaseResultRow = typeof t.evalCaseResults.$inferSelect;

/** Whose suite a case belongs to: exactly one of an agent or a skill (DB CHECK). */
export type SuiteOwner = { agentId: string } | { skillId: string };

/** The owner a stored case row belongs to. Throws on a row with neither (the CHECK forbids it). */
export function ownerOf(row: Pick<SuiteCaseRow, 'agentId' | 'skillId'>): SuiteOwner {
  if (row.agentId) return { agentId: row.agentId };
  if (row.skillId) return { skillId: row.skillId };
  throw new Error('eval_suite_cases row has no owner');
}

export interface SuiteCaseInsert {
  workspaceId: string;
  agentId: string | null;
  skillId: string | null;
  name: string;
  inputDiff: string;
  inputFiles: string[];
  inputMeta: unknown;
  expected: unknown;
  sourceFindingId: string | null;
  sourcePrId: string | null;
}

export interface SuiteCasePatch {
  name: string;
  inputDiff: string;
  inputFiles: string[];
  inputMeta: unknown;
  expected: unknown;
}

export interface SuiteRunInsert {
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  provider: string;
  model: string;
  skills: unknown;
  casesTotal: number;
}

export interface CaseResultInsert {
  /** null for a result whose case is gone — never produced by the runner today. */
  caseId: string | null;
  caseName: string;
  result: unknown;
  status: 'passed' | 'failed' | 'errored';
}

export interface SuiteRunCompletion {
  status: 'completed' | 'failed';
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  costUsd: number | null;
}

function ownerFilter(owner: SuiteOwner) {
  return 'agentId' in owner
    ? eq(t.evalSuiteCases.agentId, owner.agentId)
    : eq(t.evalSuiteCases.skillId, owner.skillId);
}

/**
 * Reads and writes the three eval-pipeline tables (`eval_suite_cases`,
 * `eval_suite_runs`, `eval_case_results`). Never touches `eval_cases` /
 * `eval_runs` (AC-1). Every read that has a workspace is scoped by it.
 */
export class EvalPipelineRepository {
  constructor(private db: DbExecutor) {}

  /** Runs `fn` with a repository bound to one transaction; a throw rolls it back. */
  transaction<T>(fn: (repo: EvalPipelineRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(new EvalPipelineRepository(tx)));
  }

  // ---- cases -----------------------------------------------------------------

  /** See the module-level `ownerOf`. */
  ownerOf(row: Pick<SuiteCaseRow, 'agentId' | 'skillId'>): SuiteOwner {
    return ownerOf(row);
  }

  /** Newest first. */
  async listCases(workspaceId: string, owner: SuiteOwner): Promise<SuiteCaseRow[]> {
    return this.db
      .select()
      .from(t.evalSuiteCases)
      .where(and(eq(t.evalSuiteCases.workspaceId, workspaceId), ownerFilter(owner)))
      .orderBy(desc(t.evalSuiteCases.createdAt), desc(t.evalSuiteCases.id));
  }

  async getCase(workspaceId: string, id: string): Promise<SuiteCaseRow | null> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteCases)
      .where(and(eq(t.evalSuiteCases.workspaceId, workspaceId), eq(t.evalSuiteCases.id, id)))
      .limit(1);
    return row ?? null;
  }

  async caseBySourceFinding(workspaceId: string, findingId: string): Promise<SuiteCaseRow | null> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteCases)
      .where(
        and(
          eq(t.evalSuiteCases.workspaceId, workspaceId),
          eq(t.evalSuiteCases.sourceFindingId, findingId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async caseNames(workspaceId: string, owner: SuiteOwner): Promise<string[]> {
    const rows = await this.db
      .select({ name: t.evalSuiteCases.name })
      .from(t.evalSuiteCases)
      .where(and(eq(t.evalSuiteCases.workspaceId, workspaceId), ownerFilter(owner)));
    return rows.map((r) => r.name);
  }

  async countCases(workspaceId: string, owner: SuiteOwner): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.evalSuiteCases)
      .where(and(eq(t.evalSuiteCases.workspaceId, workspaceId), ownerFilter(owner)));
    return row?.n ?? 0;
  }

  async insertCase(values: SuiteCaseInsert): Promise<SuiteCaseRow> {
    const [row] = await this.db.insert(t.evalSuiteCases).values(values).returning();
    return row!;
  }

  /** Edits a case; clears `last_result` (the stored verdict no longer describes it). */
  async updateCase(workspaceId: string, id: string, patch: SuiteCasePatch): Promise<SuiteCaseRow | null> {
    const [row] = await this.db
      .update(t.evalSuiteCases)
      .set({ ...patch, lastResult: null, updatedAt: new Date() })
      .where(and(eq(t.evalSuiteCases.workspaceId, workspaceId), eq(t.evalSuiteCases.id, id)))
      .returning();
    return row ?? null;
  }

  /** Cascades the case's results; the runs' stored metrics stay. */
  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalSuiteCases)
      .where(and(eq(t.evalSuiteCases.workspaceId, workspaceId), eq(t.evalSuiteCases.id, id)))
      .returning({ id: t.evalSuiteCases.id });
    return rows.length > 0;
  }

  async setLastResult(workspaceId: string, id: string, result: unknown): Promise<void> {
    await this.db
      .update(t.evalSuiteCases)
      .set({ lastResult: result })
      .where(and(eq(t.evalSuiteCases.workspaceId, workspaceId), eq(t.evalSuiteCases.id, id)));
  }

  // ---- runs ------------------------------------------------------------------

  async insertRun(values: SuiteRunInsert): Promise<SuiteRunRow> {
    const [row] = await this.db
      .insert(t.evalSuiteRuns)
      .values({ ...values, status: 'running' })
      .returning();
    return row!;
  }

  /** Stores one case result, bumps the run's counters and sets the case's last result, in one transaction. */
  async recordCaseResult(runId: string, r: CaseResultInsert): Promise<void> {
    try {
      await this.writeCaseResult(runId, r);
    } catch (err) {
      // The case was deleted while the run was in progress: keep the result
      // (case_name is stored) with a null case_id instead of failing the run.
      if (r.caseId !== null && isForeignKeyViolation(err)) {
        await this.writeCaseResult(runId, { ...r, caseId: null });
        return;
      }
      throw err;
    }
  }

  private async writeCaseResult(runId: string, r: CaseResultInsert): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(t.evalCaseResults).values({
        suiteRunId: runId,
        caseId: r.caseId,
        caseName: r.caseName,
        result: r.result,
      });
      await tx
        .update(t.evalSuiteRuns)
        .set({
          casesDone: sql`${t.evalSuiteRuns.casesDone} + 1`,
          casesPassed: sql`${t.evalSuiteRuns.casesPassed} + ${r.status === 'passed' ? 1 : 0}`,
          casesErrored: sql`${t.evalSuiteRuns.casesErrored} + ${r.status === 'errored' ? 1 : 0}`,
        })
        .where(eq(t.evalSuiteRuns.id, runId));
      // Same transaction: the case's last result follows the suite run (spec 011 AC-19/20).
      if (r.caseId !== null) {
        await tx
          .update(t.evalSuiteCases)
          .set({ lastResult: r.result })
          .where(eq(t.evalSuiteCases.id, r.caseId));
      }
    });
  }

  async completeRun(runId: string, c: SuiteRunCompletion): Promise<void> {
    await this.db
      .update(t.evalSuiteRuns)
      .set({
        status: c.status,
        finishedAt: new Date(),
        recall: c.recall,
        precision: c.precision,
        citationAccuracy: c.citationAccuracy,
        costUsd: c.costUsd,
      })
      .where(eq(t.evalSuiteRuns.id, runId));
  }

  async getRun(workspaceId: string, id: string): Promise<SuiteRunRow | null> {
    const [row] = await this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, id)))
      .limit(1);
    return row ?? null;
  }

  /** Results of one run, in the order they were recorded. */
  async resultsForRun(runId: string): Promise<CaseResultRow[]> {
    return this.db
      .select()
      .from(t.evalCaseResults)
      .where(eq(t.evalCaseResults.suiteRunId, runId))
      .orderBy(asc(t.evalCaseResults.createdAt), asc(t.evalCaseResults.id));
  }

  /** Newest first; `since` null means all time. */
  async listRuns(workspaceId: string, agentId: string, since: Date | null): Promise<SuiteRunRow[]> {
    const where = and(
      eq(t.evalSuiteRuns.workspaceId, workspaceId),
      eq(t.evalSuiteRuns.agentId, agentId),
      since ? gte(t.evalSuiteRuns.startedAt, since) : undefined,
    );
    return this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(where)
      .orderBy(desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id));
  }

  /** The most recent run (any status) of each agent that has one. */
  async latestRunsByAgent(workspaceId: string): Promise<SuiteRunRow[]> {
    return this.db
      .selectDistinctOn([t.evalSuiteRuns.agentId])
      .from(t.evalSuiteRuns)
      .where(eq(t.evalSuiteRuns.workspaceId, workspaceId))
      .orderBy(t.evalSuiteRuns.agentId, desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id));
  }

  /** Newest first across the workspace; `limit` is required (no unbounded read). */
  async recentRuns(workspaceId: string, limit: number): Promise<SuiteRunRow[]> {
    return this.db
      .select()
      .from(t.evalSuiteRuns)
      .where(eq(t.evalSuiteRuns.workspaceId, workspaceId))
      .orderBy(desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id))
      .limit(limit);
  }

  async hasRunning(agentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.evalSuiteRuns.id })
      .from(t.evalSuiteRuns)
      .where(and(eq(t.evalSuiteRuns.agentId, agentId), eq(t.evalSuiteRuns.status, 'running')))
      .limit(1);
    return !!row;
  }

  /** Marks every `running` suite run failed (boot reaper). Returns how many. */
  async reapRunning(): Promise<number> {
    const rows = await this.db
      .update(t.evalSuiteRuns)
      .set({ status: 'failed', finishedAt: new Date() })
      .where(eq(t.evalSuiteRuns.status, 'running'))
      .returning({ id: t.evalSuiteRuns.id });
    return rows.length;
  }
}

function isForeignKeyViolation(err: unknown): boolean {
  const code = (e: unknown): unknown => (e as { code?: unknown } | null)?.code;
  return code(err) === '23503' || code((err as { cause?: unknown } | null)?.cause) === '23503';
}
