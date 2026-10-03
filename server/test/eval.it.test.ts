import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed, DEFAULT_WORKSPACE_NAME } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { parseFixture, type ReviewEvalFixture } from '../src/modules/eval/fixture.js';
import { EvalRepository } from '../src/modules/eval/repository.js';
import { EvalService } from '../src/modules/eval/service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval] Docker not available — skipping integration tests.');
}

const HEAD = 'c'.repeat(40);

const fixture: ReviewEvalFixture = parseFixture({
  id: 'eval-it-v1',
  repo: 'acme/payments-api',
  pr: 482,
  head_sha: HEAD,
  line_tolerance: 3,
  lanes: {
    general: 'General Reviewer',
    security: 'Security Reviewer',
    performance: 'Performance Reviewer',
    test_quality: 'Test Quality Reviewer',
    api_contract: 'API Contract Reviewer',
  },
  issues: [
    {
      id: 'sqli',
      lane: 'security',
      title: 'SQL injection',
      locations: [{ file: 'src/a.ts', start_line: 10, end_line: 12 }],
      categories: ['security'],
      keywords: ['injection'],
    },
    {
      id: 'nan',
      lane: 'general',
      title: 'NaN average',
      locations: [{ file: 'src/b.ts', start_line: 5, end_line: 6 }],
      categories: ['bug'],
      keywords: ['nan'],
    },
  ],
  acceptable_extras: [],
});

/** One `done` run with one review holding the given findings. */
async function addRun(
  pg: PgFixture,
  ids: { workspaceId: string; prId: string; agentId: string },
  opts: { status: string; ranAt: Date; costUsd: number; durationMs: number },
  found: { file: string; line: number; category: string; title: string; severity?: string }[] = [],
): Promise<string> {
  const { db } = pg.handle;
  const [run] = await db
    .insert(t.agentRuns)
    .values({ ...ids, ...opts })
    .returning();
  const [review] = await db
    .insert(t.reviews)
    .values({ workspaceId: ids.workspaceId, prId: ids.prId, agentId: ids.agentId, runId: run!.id, kind: 'review' })
    .returning();
  if (found.length) {
    await db.insert(t.findings).values(
      found.map((f) => ({
        reviewId: review!.id,
        file: f.file,
        startLine: f.line,
        endLine: f.line,
        severity: f.severity ?? 'high',
        category: f.category,
        title: f.title,
        rationale: 'r',
        confidence: 0.9,
      })),
    );
  }
  return run!.id;
}

d('EvalService (real Postgres)', () => {
  let pg: PgFixture;
  let service: EvalService;
  let workspaceId: string;
  let prId: string;
  let secId: string;
  let genId: string;
  let secDone: string;
  let secOlder: string;

  beforeAll(async () => {
    pg = await startPg();
    const { db } = pg.handle;
    await seed(db);
    service = new EvalService({ repo: new EvalRepository(db) });

    const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
    workspaceId = ws!.id;
    const [repo] = await db.select().from(t.repos).where(eq(t.repos.fullName, 'acme/payments-api'));
    const [pr] = await db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repo!.id));
    prId = pr!.id;
    await db.update(t.pullRequests).set({ headSha: HEAD }).where(eq(t.pullRequests.id, prId));

    const agents = await db
      .select()
      .from(t.agents)
      .where(inArray(t.agents.name, ['Security Reviewer', 'General Reviewer']));
    secId = agents.find((a) => a.name === 'Security Reviewer')!.id;
    genId = agents.find((a) => a.name === 'General Reviewer')!.id;

    const sec = { workspaceId, prId, agentId: secId };
    secOlder = await addRun(pg, sec, { status: 'done', ranAt: new Date('2026-01-01'), costUsd: 0.5, durationMs: 1000 });
    secDone = await addRun(
      pg,
      sec,
      { status: 'done', ranAt: new Date('2026-01-02'), costUsd: 0.25, durationMs: 2000 },
      [
        { file: 'src/a.ts', line: 11, category: 'security', title: 'SQL injection in query' },
        { file: 'src/z.ts', line: 1, category: 'style', title: 'nit' },
      ],
    );
    // A newer failed run must not win.
    await addRun(pg, sec, { status: 'failed', ranAt: new Date('2026-01-03'), costUsd: 0, durationMs: 1 });
    await addRun(
      pg,
      { workspaceId, prId, agentId: genId },
      { status: 'done', ranAt: new Date('2026-01-02'), costUsd: 0.1, durationMs: 500 },
    );
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('a head_sha mismatch throws and writes nothing', async () => {
    await expect(
      service.scoreReviewFixture({ ...fixture, head_sha: 'd'.repeat(40) }, { workspaceName: DEFAULT_WORKSPACE_NAME }),
    ).rejects.toThrow(/head is/);
    expect(await pg.handle.db.select().from(t.evalRuns)).toHaveLength(0);
    expect(await pg.handle.db.select().from(t.evalCases)).toHaveLength(0);
  });

  it('scores the newest done run, persists metrics, and reports agents with no run', async () => {
    const res = await service.scoreReviewFixture(fixture, { workspaceName: DEFAULT_WORKSPACE_NAME });

    const sec = res.agents.find((a) => a.agentName === 'Security Reviewer')!;
    expect(sec.runId).toBe(secDone);
    expect(sec.recall).toBe(1);
    expect(sec.precision).toBe(0.5);
    expect(res.noRun.sort()).toEqual(['API Contract Reviewer', 'Performance Reviewer', 'Test Quality Reviewer']);
    expect(res.evalRunIds).toHaveLength(2);

    const { db } = pg.handle;
    const [row] = await db.select().from(t.evalRuns).where(eq(t.evalRuns.id, res.evalRunIds[res.agents.indexOf(sec)]!));
    expect(row).toMatchObject({ recall: 1, precision: 0.5, durationMs: 2000, costUsd: 0.25, pass: null });
    expect(await db.select().from(t.evalCases)).toHaveLength(2);
  });

  it('re-running adds eval_runs rows but no new eval_cases rows', async () => {
    const { db } = pg.handle;
    const caseIdsOf = async (runIds: string[]) =>
      (await db.select().from(t.evalRuns).where(inArray(t.evalRuns.id, runIds)))
        .map((r) => r.caseId)
        .sort();
    const first = await service.scoreReviewFixture(fixture, { workspaceName: DEFAULT_WORKSPACE_NAME });
    const casesBefore = await db.select().from(t.evalCases);
    const second = await service.scoreReviewFixture(fixture, { workspaceName: DEFAULT_WORKSPACE_NAME });
    expect(await db.select().from(t.evalCases)).toHaveLength(casesBefore.length);
    expect(await caseIdsOf(second.evalRunIds)).toEqual(await caseIdsOf(first.evalRunIds));
    expect((await db.select().from(t.evalRuns)).length).toBeGreaterThanOrEqual(4);
  });

  it('concurrent upserts of one key return one case', async () => {
    const { db } = pg.handle;
    const input = {
      workspaceId,
      ownerId: secId,
      name: 'eval-it-concurrent',
      inputMeta: { n: 1 },
      expectedOutput: { n: 1 },
    };
    const [a, b] = await Promise.all([
      new EvalRepository(db).upsertEvalCase(input),
      new EvalRepository(db).upsertEvalCase(input),
    ]);
    expect(a).toBe(b);
    expect(await db.select().from(t.evalCases).where(eq(t.evalCases.name, 'eval-it-concurrent'))).toHaveLength(1);
  });

  it('a failing write mid-loop leaves no rows', async () => {
    const { db } = pg.handle;
    class FailSecondInsert extends EvalRepository {
      override transaction<T>(fn: (repo: EvalRepository) => Promise<T>): Promise<T> {
        return super.transaction((txRepo) => {
          const insert = txRepo.insertEvalRun.bind(txRepo);
          let calls = 0;
          txRepo.insertEvalRun = async (input) => {
            if (++calls === 2) throw new Error('boom');
            return insert(input);
          };
          return fn(txRepo);
        });
      }
    }
    const failing = new EvalService({ repo: new FailSecondInsert(db) });
    const runsBefore = (await db.select().from(t.evalRuns)).length;
    await expect(
      failing.scoreReviewFixture({ ...fixture, id: 'eval-it-rollback' }, { workspaceName: DEFAULT_WORKSPACE_NAME }),
    ).rejects.toThrow(/boom/);
    expect(await db.select().from(t.evalCases).where(eq(t.evalCases.name, 'eval-it-rollback'))).toHaveLength(0);
    expect(await db.select().from(t.evalRuns)).toHaveLength(runsBefore);
  });

  it('explicit run ids override the default', async () => {
    const res = await service.scoreReviewFixture(fixture, {
      workspaceName: DEFAULT_WORKSPACE_NAME,
      runIds: [secOlder],
    });
    const sec = res.agents.find((a) => a.agentName === 'Security Reviewer')!;
    expect(sec.runId).toBe(secOlder);
    expect(sec.precision).toBeNull();
  });

  describe('rounds', () => {
    const secFixture = (id: string): ReviewEvalFixture => ({
      ...fixture,
      id,
      lanes: { security: 'Security Reviewer' },
      issues: fixture.issues.filter((i) => i.lane === 'security'),
    });
    const counts = async () => ({
      runs: (await pg.handle.db.select().from(t.evalRuns)).length,
      cases: (await pg.handle.db.select().from(t.evalCases)).length,
    });

    beforeAll(async () => {
      // Security now has 4 done runs: the two seeded above plus two newer ones.
      const sec = { workspaceId, prId, agentId: secId };
      await addRun(pg, sec, { status: 'done', ranAt: new Date('2026-02-01'), costUsd: 0.3, durationMs: 1 }, [
        { file: 'src/a.ts', line: 11, category: 'security', title: 'SQL injection', severity: 'CRITICAL' },
        { file: 'src/q.ts', line: 9, category: 'bug', title: 'wrong thing', severity: 'CRITICAL' },
      ]);
      await addRun(pg, sec, { status: 'done', ranAt: new Date('2026-02-02'), costUsd: 0.4, durationMs: 1 });
    });

    it('rounds: 2 scores the 2 newest runs, with 2 eval_runs rows and 1 eval_cases row per agent', async () => {
      const before = await counts();
      const res = await service.scoreReviewFixture(secFixture('eval-it-rounds'), {
        workspaceName: DEFAULT_WORKSPACE_NAME,
        rounds: 2,
      });
      expect(res.rounds).toHaveLength(2);
      expect(res.summary.rounds).toBe(2);
      expect(res.evalRunIds).toHaveLength(2);
      expect(res.rounds[0]!.agents[0]!.costUsd).toBe(0.4);
      expect(res.rounds[1]!.agents[0]!.costUsd).toBe(0.3);
      expect(res.rounds[1]!.agents[0]!.criticals).toBe(2);
      const after = await counts();
      expect(after.runs - before.runs).toBe(2);
      expect(after.cases - before.cases).toBe(1);
    });

    it('an unmatched seeded CRITICAL shows up in false_criticals of the stored row', async () => {
      const res = await service.scoreReviewFixture(secFixture('eval-it-false-crit'), {
        workspaceName: DEFAULT_WORKSPACE_NAME,
        rounds: 2,
        baseline: { falseCriticals: 4 },
      });
      const { db } = pg.handle;
      const rows = await db.select().from(t.evalRuns).where(inArray(t.evalRuns.id, res.evalRunIds));
      const outs = rows.map((r) => r.actualOutput as Record<string, unknown>);
      const second = outs.find((o) => o.round === 2)!;
      expect(second.false_criticals).toBe(1);
      expect(second.unlabelled_criticals).toHaveLength(1);
      expect(res.gate).toHaveLength(1);
    });

    it('rounds: 3 with an agent that has 1 run throws and writes nothing', async () => {
      const before = await counts();
      await expect(
        service.scoreReviewFixture(
          { ...fixture, id: 'eval-it-too-few' },
          { workspaceName: DEFAULT_WORKSPACE_NAME, rounds: 3 },
        ),
      ).rejects.toThrow(/has 1 done run\(s\).*--runs needs 3/);
      expect(await counts()).toEqual(before);
    });

    it('rounds together with runIds throws before any write', async () => {
      const before = await counts();
      await expect(
        service.scoreReviewFixture(secFixture('eval-it-both'), {
          workspaceName: DEFAULT_WORKSPACE_NAME,
          rounds: 2,
          runIds: [secOlder],
        }),
      ).rejects.toThrow(/--runs > 1/);
      expect(await counts()).toEqual(before);
    });
  });
});
