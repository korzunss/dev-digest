import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { isolatedTestConfig } from './helpers/config.js';
import { DeferredLLMProvider, llmUnderEveryProvider } from './helpers/llm-stubs.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { lastDoneRunsPerAgent, summariesForRuns } from '../src/modules/reviews/repository/multi-agent.repo.js';
import { estimatesFrom } from '../src/modules/reviews/multi-agent.helpers.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const RANDOM_UUID = '11111111-1111-4111-8111-111111111111';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 10, minute, 0));

d('multi-agent trust boundaries and estimates against real rows (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** Another workspace with one agent, one PR and one multi-agent run. */
  async function foreignWorkspace() {
    const db = pg.handle.db;
    const [ws] = await db.insert(t.workspaces).values({ name: `other-${Math.random().toString(36).slice(2)}` }).returning();
    const [agent] = await db
      .insert(t.agents)
      .values({ workspaceId: ws!.id, name: 'Foreign', provider: 'openai', model: 'gpt-x', systemPrompt: 'p' })
      .returning();
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'o', name: 'foreign', fullName: `o/foreign-${ws!.id}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws!.id,
        repoId: repo!.id,
        number: 1,
        title: 'Secret PR title',
        author: 'x',
        branch: 'b',
        base: 'main',
        headSha: 'c'.repeat(40),
        baseSha: 'b'.repeat(40),
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'needs_review',
      })
      .returning();
    const [multi] = await db.insert(t.multiAgentRuns).values({ workspaceId: ws!.id, prId: pr!.id }).returning();
    return { ws: ws!, agent: agent!, pr: pr!, multi: multi! };
  }

  async function appFor() {
    const stubs = llmUnderEveryProvider((id) => new DeferredLLMProvider(id));
    return buildApp({
      config: isolatedTestConfig(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient(),
        secrets: new MockSecretsProvider({}),
        llm: stubs,
      },
    });
  }

  async function ownPr() {
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'own-b', fullName: `acme/own-b-${Math.random()}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 3,
        title: 'Own',
        author: 'dev',
        branch: 'f',
        base: 'main',
        headSha: 'c'.repeat(40),
        baseSha: 'b'.repeat(40),
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'needs_review',
      })
      .returning();
    return pr!;
  }

  const counts = async () => ({
    runs: (await pg.handle.db.select().from(t.agentRuns)).length,
    multi: (await pg.handle.db.select().from(t.multiAgentRuns)).length,
  });

  it('answers 404 for a multi-agent run that belongs to another workspace (T4, horizontal)', async () => {
    const other = await foreignWorkspace();
    const app = await appFor();
    try {
      const res = await app.inject({ method: 'GET', url: `/multi-agent-runs/${other.multi.id}` });
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toContain('Secret PR title');
    } finally {
      await app.close();
    }
  });

  it('answers 404 for an agent or a PR of another workspace and creates no rows (T4, AC-22)', async () => {
    const other = await foreignWorkspace();
    const pr = await ownPr();
    const app = await appFor();
    try {
      const before = await counts();
      const foreignAgent = await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/multi-agent-run`,
        payload: { agent_ids: [other.agent.id] },
      });
      expect(foreignAgent.statusCode).toBe(404);
      const foreignPr = await app.inject({
        method: 'POST',
        url: `/pulls/${other.pr.id}/multi-agent-run`,
        payload: { agent_ids: [uuid(1)] },
      });
      expect(foreignPr.statusCode).toBe(404);
      expect(await counts()).toEqual(before);
    } finally {
      await app.close();
    }
  });

  it('rejects an invalid body with 422 and creates no rows (AC-21)', async () => {
    const pr = await ownPr();
    const app = await appFor();
    try {
      const before = await counts();
      const own = (await pg.handle.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId)))[0]!;
      const post = (payload: unknown, headers: Record<string, string> = {}) =>
        app.inject({
          method: 'POST',
          url: `/pulls/${pr.id}/multi-agent-run`,
          headers: { 'content-type': 'application/json', ...headers },
          payload: payload as string,
        });
      const cases: unknown[] = [
        JSON.stringify('agent'), // a JSON string
        JSON.stringify([own.id]), // an array instead of an object
        JSON.stringify({}),
        JSON.stringify({ agent_ids: [] }),
        JSON.stringify({ agent_ids: Array.from({ length: 21 }, (_, i) => uuid(i)) }),
        JSON.stringify({ agent_ids: ['not-a-uuid'] }),
        JSON.stringify({ agent_ids: [own.id, 42] }),
        JSON.stringify({ agent_ids: own.id }),
      ];
      // An empty body with a JSON content type is refused by Fastify's parser itself (400).
      expect((await post('')).statusCode).toBe(400);
      for (const body of cases) {
        const res = await post(body);
        expect(res.statusCode, `body ${String(body)}`).toBe(422);
      }
      expect(await counts()).toEqual(before);
    } finally {
      await app.close();
    }
  });

  it('counts a repeated agent id once (AC-21)', async () => {
    const pr = await ownPr();
    const app = await appFor();
    try {
      const own = (await pg.handle.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId)))[0]!;
      const res = await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/multi-agent-run`,
        payload: { agent_ids: [own.id, own.id, own.id] },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.columns).toHaveLength(1);
      expect(body.agent_count).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('estimates from the last 5 done runs only: failed runs ignored, median taken, other workspaces excluded', async () => {
    const db = pg.handle.db;
    const other = await foreignWorkspace();
    const [ws] = await db.insert(t.workspaces).values({ name: `est-${Math.random().toString(36).slice(2)}` }).returning();
    const mkAgent = async (name: string) =>
      (
        await db
          .insert(t.agents)
          .values({ workspaceId: ws!.id, name, provider: 'openai', model: 'm', systemPrompt: 'p' })
          .returning()
      )[0]!;
    const busy = await mkAgent('busy');
    const onlyFailed = await mkAgent('only-failed');
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'o', name: 'est', fullName: `o/est-${ws!.id}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws!.id,
        repoId: repo!.id,
        number: 1,
        title: 'est',
        author: 'x',
        branch: 'b',
        base: 'main',
        headSha: 'c'.repeat(40),
        baseSha: 'b'.repeat(40),
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'needs_review',
      })
      .returning();

    const run = async (
      agentId: string,
      minute: number,
      status: string,
      durationMs: number | null,
      costUsd: number | null,
      workspace = ws!.id,
    ) =>
      (
        await db
          .insert(t.agentRuns)
          .values({ workspaceId: workspace, agentId, prId: pr!.id, ranAt: at(minute), status, durationMs, costUsd })
          .returning()
      )[0]!;

    // Seven done runs (minutes 1..7, durations 1000..7000); only minutes 3..7 are the "last 5".
    const done = [];
    for (let m = 1; m <= 7; m++) done.push(await run(busy.id, m, 'done', m * 1000, m === 5 ? null : m / 100));
    // A newer failed run with an absurd duration must not count.
    await run(busy.id, 20, 'failed', 999_999, 9);
    await run(onlyFailed.id, 8, 'failed', 5000, 1);
    await run(onlyFailed.id, 9, 'cancelled', 5000, 1);
    // A done run of the same agent id recorded under another workspace must not leak in.
    await run(busy.id, 30, 'done', 888_888, 8, other.ws.id);
    // Summaries: the newest of the 5 sampled runs wins; the excluded older run has a newer-looking createdAt-free summary.
    const review = (runId: string, summary: string, minute: number) =>
      db.insert(t.reviews).values({
        workspaceId: ws!.id,
        prId: pr!.id,
        runId,
        kind: 'review',
        summary,
        createdAt: at(minute),
      });
    await review(done[0]!.id, 'Too old. Excluded.', 50);
    await review(done[6]!.id, 'Looks fine. More text.', 10);
    await review(done[5]!.id, 'Older sampled. Nope.', 9);

    const rows = await lastDoneRunsPerAgent(db, ws!.id);
    expect(rows.filter((r) => r.agentId === busy.id).map((r) => r.durationMs).sort((a, b) => a! - b!)).toEqual([
      3000, 4000, 5000, 6000, 7000,
    ]);
    expect(rows.some((r) => r.agentId === onlyFailed.id)).toBe(false);
    expect(rows.every((r) => r.durationMs !== 888_888 && r.durationMs !== 999_999)).toBe(true);

    const summaries = await summariesForRuns(db, rows.map((r) => r.runId));
    const est = estimatesFrom(rows, summaries, [busy.id, onlyFailed.id]);
    const busyEst = est.find((e) => e.agent_id === busy.id)!;
    expect(busyEst.sample_size).toBe(5);
    expect(busyEst.duration_ms).toBe(5000);
    // costs of minutes 3,4,6,7 (minute 5 is null): 0.03,0.04,0.06,0.07 → median 0.05
    expect(busyEst.cost_usd).toBeCloseTo(0.05, 5);
    expect(busyEst.last_verdict).toBe('Looks fine.');
    const noneEst = est.find((e) => e.agent_id === onlyFailed.id)!;
    expect(noneEst).toMatchObject({ sample_size: 0, duration_ms: null, cost_usd: null, last_verdict: null });
  });
});
