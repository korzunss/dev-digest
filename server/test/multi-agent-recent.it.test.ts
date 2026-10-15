import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { LatestMultiAgentRun, MultiAgentRunSummary, RunSummary } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { isolatedTestConfig } from './helpers/config.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const RANDOM_UUID = '11111111-1111-4111-8111-111111111111';
const T0 = Date.parse('2026-10-15T10:00:00Z');
const at = (min: number) => new Date(T0 + min * 60_000);

type Status = 'running' | 'done' | 'failed' | 'cancelled';

// Rows are inserted directly with fixed statuses: no model is involved.
d('multi-agent recent runs and latest run (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
    app = await buildApp({
      config: isolatedTestConfig(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), secrets: new MockSecretsProvider({}) },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function makeRepoAndPr(ws = workspaceId) {
    const db = pg.handle.db;
    const name = `recent-repo-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 40 + seq,
        title: `PR ${seq}`,
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'c'.repeat(40),
        status: 'needs_review',
      })
      .returning();
    return { repo: repo!, pr: pr! };
  }

  async function makeAgent(name: string) {
    const [a] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name: `${name}-${seq++}`, systemPrompt: 'p', provider: 'openai', model: 'm' })
      .returning();
    return a!;
  }

  /** A multi-agent run with one agent run per status, each `{ status, cost, agentId }`. */
  async function makeRun(
    prId: string,
    ranMin: number,
    runs: { status: Status; cost: number | null; agentId?: string | null; endMin?: number }[],
    ws = workspaceId,
  ) {
    const db = pg.handle.db;
    const [multi] = await db
      .insert(t.multiAgentRuns)
      .values({ workspaceId: ws, prId, ranAt: at(ranMin) })
      .returning();
    for (const r of runs) {
      await db.insert(t.agentRuns).values({
        workspaceId: ws,
        prId,
        agentId: r.agentId ?? null,
        multiAgentRunId: multi!.id,
        status: r.status,
        costUsd: r.cost,
        ranAt: at(ranMin),
        finishedAt: r.status === 'running' ? null : at(ranMin + (r.endMin ?? 1)),
      });
    }
    return multi!;
  }

  const recent = async (repoId: string) => {
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/multi-agent-runs` });
    expect(res.statusCode).toBe(200);
    return res.json() as MultiAgentRunSummary[];
  };

  it('returns at most 10 runs, newest first (AC-15b)', async () => {
    const { repo, pr } = await makeRepoAndPr();
    for (let i = 0; i < 11; i++) await makeRun(pr.id, i, [{ status: 'done', cost: 0.01 }]);
    const rows = await recent(repo.id);
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.ran_at)).toEqual(
      Array.from({ length: 10 }, (_, i) => at(10 - i).toISOString()),
    );
  });

  it('lists a running run before a newer done one (AC-15b)', async () => {
    const { repo, pr } = await makeRepoAndPr();
    const older = await makeRun(pr.id, 0, [{ status: 'running', cost: null }]);
    await makeRun(pr.id, 5, [{ status: 'done', cost: 0.01 }]);
    const rows = await recent(repo.id);
    expect(rows[0]!.id).toBe(older.id);
    expect(rows[0]!.status).toBe('running');
  });

  it('derives done, partially_failed, failed and running (AC-15a)', async () => {
    const { repo, pr } = await makeRepoAndPr();
    const done = await makeRun(pr.id, 1, [{ status: 'done', cost: 0.01 }, { status: 'done', cost: 0.02 }]);
    const partial = await makeRun(pr.id, 2, [{ status: 'done', cost: 0.01 }, { status: 'cancelled', cost: null }]);
    const failed = await makeRun(pr.id, 3, [{ status: 'failed', cost: null }, { status: 'cancelled', cost: null }]);
    const running = await makeRun(pr.id, 4, [{ status: 'done', cost: 0.01 }, { status: 'running', cost: null }]);
    const byId = new Map((await recent(repo.id)).map((r) => [r.id, r.status]));
    expect(byId.get(done.id)).toBe('done');
    expect(byId.get(partial.id)).toBe('partially_failed');
    expect(byId.get(failed.id)).toBe('failed');
    expect(byId.get(running.id)).toBe('running');
  });

  it('fills the row: totals by the AC-31 rule, partial cost, agent names, deleted agent null (AC-15c)', async () => {
    const { repo, pr } = await makeRepoAndPr();
    const agent = await makeAgent('Security');
    const run = await makeRun(pr.id, 0, [
      { status: 'done', cost: 0.5, agentId: agent.id, endMin: 2 },
      { status: 'done', cost: null, agentId: null, endMin: 4 },
    ]);
    const [row] = (await recent(repo.id)).filter((r) => r.id === run.id);
    expect(row).toMatchObject({
      pr_id: pr.id,
      pr_number: pr.number,
      pr_title: pr.title,
      agent_count: 2,
      total_duration_ms: 4 * 60_000,
      total_cost_usd: 0.5,
      total_cost_partial: true,
    });
    // both runs share ran_at, so the column order between them is by id
    expect(row!.agent_names).toHaveLength(2);
    expect(row!.agent_names).toEqual(expect.arrayContaining([agent.name, null]));
  });

  it('excludes runs of another repo of the same workspace', async () => {
    const a = await makeRepoAndPr();
    const b = await makeRepoAndPr();
    await makeRun(a.pr.id, 0, [{ status: 'done', cost: 0.01 }]);
    expect(await recent(b.repo.id)).toEqual([]);
  });

  it('returns [] for a repo of another workspace', async () => {
    const db = pg.handle.db;
    const [other] = await db.insert(t.workspaces).values({ name: `other-ws-${seq++}` }).returning();
    const foreign = await makeRepoAndPr(other!.id);
    await makeRun(foreign.pr.id, 0, [{ status: 'done', cost: 0.01 }], other!.id);
    expect(await recent(foreign.repo.id)).toEqual([]);
  });

  it('returns the newest run of a PR, and { run: null } when it has none (AC-15g)', async () => {
    const { pr } = await makeRepoAndPr();
    const none = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` });
    expect(none.statusCode).toBe(200);
    expect(none.json()).toEqual({ run: null });

    await makeRun(pr.id, 0, [{ status: 'done', cost: 0.01 }]);
    const newest = await makeRun(pr.id, 9, [{ status: 'running', cost: null }]);
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` });
    const body = res.json() as LatestMultiAgentRun;
    expect(body.run?.id).toBe(newest.id);
    expect(body.run?.status).toBe('running');
  });

  // the latest-run read filters on the run's own workspace_id, not only on the PR lookup that guards it
  it('does not return a run stamped with another workspace for this workspace\'s PR', async () => {
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `other-ws-${seq++}` }).returning();
    const { pr } = await makeRepoAndPr();
    await makeRun(pr.id, 0, [{ status: 'done', cost: 0.01 }], other!.id);
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ run: null });
  });

  // the recent-runs read filters on the run's own workspace_id even when the repo is this workspace's
  it('omits a run stamped with another workspace from this workspace\'s repo', async () => {
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `other-ws-${seq++}` }).returning();
    const { repo, pr } = await makeRepoAndPr();
    const mine = await makeRun(pr.id, 0, [{ status: 'done', cost: 0.01 }]);
    await makeRun(pr.id, 5, [{ status: 'done', cost: 0.01 }], other!.id);
    expect((await recent(repo.id)).map((r) => r.id)).toEqual([mine.id]);
  });

  it('answers 404 for a PR of another workspace or an unknown id', async () => {
    const db = pg.handle.db;
    const [other] = await db.insert(t.workspaces).values({ name: `other-ws-${seq++}` }).returning();
    const foreign = await makeRepoAndPr(other!.id);
    await makeRun(foreign.pr.id, 0, [{ status: 'done', cost: 0.01 }], other!.id);
    for (const id of [foreign.pr.id, RANDOM_UUID]) {
      const res = await app.inject({ method: 'GET', url: `/pulls/${id}/multi-agent` });
      expect(res.statusCode).toBe(404);
    }
  });

  it('gives a linked run-history row its multi_agent_run_id and a single-agent row null (AC-15h)', async () => {
    const { pr } = await makeRepoAndPr();
    const multi = await makeRun(pr.id, 0, [{ status: 'done', cost: 0.01 }]);
    const [single] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, prId: pr.id, status: 'done', ranAt: at(-5) })
      .returning();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` });
    expect(res.statusCode).toBe(200);
    const rows = res.json() as RunSummary[];
    expect(rows.find((r) => r.run_id === single!.id)?.multi_agent_run_id).toBeNull();
    const linked = rows.filter((r) => r.multi_agent_run_id !== null);
    expect(linked).toHaveLength(1);
    expect(linked[0]!.multi_agent_run_id).toBe(multi.id);
    expect(await pg.handle.db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.id, multi.id))).toHaveLength(1);
  });
});
