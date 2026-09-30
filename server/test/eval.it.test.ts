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
  found: { file: string; line: number; category: string; title: string }[] = [],
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
        severity: 'high',
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
    await service.scoreReviewFixture(fixture, { workspaceName: DEFAULT_WORKSPACE_NAME });
    const { db } = pg.handle;
    expect(await db.select().from(t.evalCases)).toHaveLength(2);
    expect((await db.select().from(t.evalRuns)).length).toBeGreaterThanOrEqual(4);
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
});
