import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { backfillRunCost } from '../src/db/backfill-run-cost.js';
import { rollupCost } from '../src/modules/pulls/status.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * Run cost persistence (spec 001): the columns round-trip through the
 * repository, a failed run stores NO cost, and the backfill prices legacy rows
 * as estimates exactly once.
 */
d('agent_runs cost columns', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
    const [pr] = await pg.handle.db.select().from(t.pullRequests).limit(1);
    prId = pr!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const repo = () => new ReviewRepository(pg.handle.db);

  async function newRun(): Promise<string> {
    return repo().createAgentRun({
      workspaceId,
      agentId: null,
      prId,
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
    });
  }

  async function row(runId: string) {
    const [r] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    return r!;
  }

  it('round-trips a reported cost and surfaces it on the run summary', async () => {
    const runId = await newRun();
    await repo().completeAgentRun(runId, {
      status: 'done',
      durationMs: 8200,
      tokensIn: 8900,
      tokensOut: 219,
      findingsCount: 3,
      grounding: '3/3 passed',
      costUsd: 0.0013,
      costSource: 'api',
    });

    expect(await row(runId)).toMatchObject({ costUsd: 0.0013, costSource: 'api' });
    const summary = (await repo().listRunsForPull(workspaceId, prId)).find((r) => r.run_id === runId);
    expect(summary).toMatchObject({ cost_usd: 0.0013, cost_source: 'api' });
  });

  it('a failed run stores NO cost — we never measured it', async () => {
    const runId = await newRun();
    await repo().completeAgentRun(runId, {
      status: 'failed',
      durationMs: 120,
      tokensIn: 0,
      tokensOut: 0,
      findingsCount: 0,
      grounding: '0/0 passed',
      error: '429 You exceeded your current quota',
    });

    const r = await row(runId);
    expect(r.costUsd).toBeNull();
    expect(r.costSource).toBeNull();
  });

  it('backfills legacy runs as estimates, and is a no-op on a second pass', async () => {
    // A run from before the columns existed: tokens and a model, no cost.
    const legacy = await newRun();
    await pg.handle.db
      .update(t.agentRuns)
      .set({ status: 'done', tokensIn: 10_000, tokensOut: 2_000, durationMs: 1000 })
      .where(eq(t.agentRuns.id, legacy));

    const estimate = (_model: string, tIn: number, tOut: number) => (tIn + tOut) / 1_000_000;
    const first = await backfillRunCost(pg.handle.db, estimate);
    expect(first.updated).toBeGreaterThanOrEqual(1);
    expect(await row(legacy)).toMatchObject({ costUsd: 0.012, costSource: 'estimate' });

    // Second pass sees no NULL-cost rows left to price.
    const second = await backfillRunCost(pg.handle.db, estimate);
    expect(second.updated).toBe(0);
    expect(await row(legacy)).toMatchObject({ costUsd: 0.012, costSource: 'estimate' });
  });

  it('leaves a run unpriced when the price book does not know the model', async () => {
    const unknown = await newRun();
    await pg.handle.db
      .update(t.agentRuns)
      .set({ status: 'done', model: 'who/knows', tokensIn: 500, tokensOut: 100 })
      .where(eq(t.agentRuns.id, unknown));

    const report = await backfillRunCost(pg.handle.db, () => null);
    expect(report.unknownModel).toBeGreaterThanOrEqual(1);
    expect((await row(unknown)).costUsd).toBeNull();
  });

  it("the PR rollup equals the sum of that PR's priced runs", async () => {
    const runs = await pg.handle.db
      .select({ costUsd: t.agentRuns.costUsd, costSource: t.agentRuns.costSource })
      .from(t.agentRuns)
      .where(eq(t.agentRuns.prId, prId));
    const expected = runs.reduce((n, r) => n + (r.costUsd ?? 0), 0);

    const rolled = rollupCost(runs);
    expect(rolled.cost_usd).toBeCloseTo(expected, 10);
    // The legacy backfill above is an estimate ⇒ the whole PR total is one.
    expect(rolled.cost_source).toBe('estimate');
  });

  it('GET /repos/:id/pulls serves the rollup (the response schema keeps the field)', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, prId));

    const res = await app.inject({ method: 'GET', url: `/repos/${pr!.repoId}/pulls` });
    expect(res.statusCode).toBe(200);
    const listed = res.json().find((p: { id: string }) => p.id === prId);

    const runs = await pg.handle.db
      .select({ costUsd: t.agentRuns.costUsd, costSource: t.agentRuns.costSource })
      .from(t.agentRuns)
      .where(eq(t.agentRuns.prId, prId));
    expect(listed.cost_usd).toBeCloseTo(rollupCost(runs).cost_usd!, 10);
    expect(listed.cost_source).toBe('estimate');

    // A PR nobody has reviewed reports null — "—" on the list, not "$0.00".
    const untouched = res.json().find((p: { id: string }) => p.id !== prId);
    if (untouched) expect(untouched.cost_usd).toBeNull();

    await app.close();
  });
});
