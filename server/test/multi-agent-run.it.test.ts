import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { isolatedTestConfig } from './helpers/config.js';
import { DeferredLLMProvider, llmUnderEveryProvider } from './helpers/llm-stubs.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const BASE = 'b'.repeat(40);
const HEAD = 'c'.repeat(40);
const TERMINAL = new Set(['done', 'failed', 'cancelled']);
const FLAGGED: Review = {
  verdict: 'comment',
  summary: 'Hardcoded key. Needs a fix.',
  score: 70,
  findings: [
    {
      id: 'f1',
      severity: 'WARNING',
      category: 'security',
      title: 'Hardcoded key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live key is committed.',
      suggestion: null,
      confidence: 0.9,
    },
  ],
};

/** The shared PR-intent call is rejected at once (never fails a run); review calls wait for `release`. */
class GatedProvider extends DeferredLLMProvider {
  override completeStructured: DeferredLLMProvider['completeStructured'] = (req) => {
    const system = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => String(m.content))
      .join('\n');
    if (system.includes('You classify the INTENT')) return Promise.reject(new Error('intent stubbed out'));
    return DeferredLLMProvider.prototype.completeStructured.call(this, req);
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RANDOM_UUID = '11111111-1111-4111-8111-111111111111';

d('multi-agent review routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function setup(opts: { diffCommitsError?: Error } = {}) {
    const stubs = llmUnderEveryProvider((id) => new GatedProvider(id));
    const git = new MockGitClient({ ...(opts.diffCommitsError ? { diffCommitsError: opts.diffCommitsError } : {}) });
    const app = await buildApp({
      config: isolatedTestConfig(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git, secrets: new MockSecretsProvider({}), llm: stubs },
    });
    const db = pg.handle.db;
    const name = `multi-repo-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 9,
        title: 'Add config',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: HEAD,
        baseSha: BASE,
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    // With no persisted files there is nothing to fall back on when the git diff fails.
    if (!opts.diffCommitsError) await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    const agents = await db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
    const all = Object.values(stubs);
    const counts = async () => ({
      runs: (await db.select().from(t.agentRuns)).length,
      multi: (await db.select().from(t.multiAgentRuns)).length,
    });
    const start = (agentIds: unknown) =>
      app.inject({ method: 'POST', url: `/pulls/${pr!.id}/multi-agent-run`, payload: agentIds as object });
    const get = (id: string) => app.inject({ method: 'GET', url: `/multi-agent-runs/${id}` });
    const finish = async (id: string, review: Review = FLAGGED) => {
      const start = Date.now();
      for (;;) {
        for (const s of all) s.release(review);
        const body = (await get(id)).json();
        if (body.columns.every((c: { status: string }) => TERMINAL.has(c.status))) return body;
        if (Date.now() - start > 15_000) throw new Error('timed out waiting for the multi-agent run');
        await sleep(20);
      }
    };
    return { app, db, agents, counts, start, get, finish };
  }

  it('rejects a bad body without creating rows (AC-21)', async () => {
    const env = await setup();
    try {
      const before = await env.counts();
      const ids = env.agents.map((a) => a.id);
      const tooMany = Array.from({ length: 21 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
      for (const payload of [undefined, {}, { agent_ids: [] }, { agent_ids: tooMany }, { agent_ids: ['nope'] }]) {
        const res = await env.start(payload);
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
        expect(res.statusCode).toBeLessThan(500);
      }
      expect(ids.length).toBeGreaterThan(0);
      expect(await env.counts()).toEqual(before);
    } finally {
      await env.app.close();
    }
  });

  it('answers 404 for an unknown agent or PR and creates nothing (AC-22)', async () => {
    const env = await setup();
    try {
      const before = await env.counts();
      const unknown = await env.start({ agent_ids: [env.agents[0]!.id, RANDOM_UUID] });
      expect(unknown.statusCode).toBe(404);
      const noPr = await env.app.inject({
        method: 'POST',
        url: `/pulls/${RANDOM_UUID}/multi-agent-run`,
        payload: { agent_ids: [env.agents[0]!.id] },
      });
      expect(noPr.statusCode).toBe(404);
      expect(await env.counts()).toEqual(before);
      expect((await env.get(RANDOM_UUID)).statusCode).toBe(404);
    } finally {
      await env.app.close();
    }
  });

  it('runs a duplicated id once, returns running columns, then findings, groups and totals (AC-21, 23, 30, 31)', async () => {
    const env = await setup();
    try {
      const [a, b] = env.agents;
      const res = await env.start({ agent_ids: [a!.id, a!.id, b!.id] });
      expect(res.statusCode).toBe(200);
      const first = res.json();
      expect(first.columns).toHaveLength(2);
      expect(first.columns.every((c: { status: string }) => c.status === 'running')).toBe(true);
      expect(first.total_duration_ms).toBeNull();
      const linked = await env.db.select().from(t.agentRuns).where(eq(t.agentRuns.multiAgentRunId, first.id));
      expect(linked).toHaveLength(2);

      const done = await env.finish(first.id);
      expect(done.columns.every((c: { status: string }) => c.status === 'done')).toBe(true);
      for (const c of done.columns) {
        expect(c.findings).toHaveLength(1);
        expect(c.finished_at).toBeTruthy();
        expect(c.findings[0].group_id).toBe('src/config.ts:11');
        expect(c.findings[0].also_flagged_by).toHaveLength(1);
      }
      expect(done.total_duration_ms).toEqual(expect.any(Number));
      expect(done.total_cost_usd).toBeGreaterThan(0);
      expect(done.conflicts).toHaveLength(1);
      expect(done.conflicts[0].is_conflict).toBe(false);
    } finally {
      await env.app.close();
    }
  });

  it('keeps the results of a deleted agent and flags the column (AC-34)', async () => {
    const env = await setup();
    try {
      const victim = env.agents[0]!;
      const res = await env.start({ agent_ids: [victim.id] });
      const id = res.json().id as string;
      await env.finish(id);
      await env.db.update(t.agentRuns).set({ agentId: null }).where(eq(t.agentRuns.multiAgentRunId, id));
      const body = (await env.get(id)).json();
      expect(body.columns[0].agent_deleted).toBe(true);
      expect(body.columns[0].agent_id).toBeNull();
      expect(body.columns[0].findings).toHaveLength(1);
    } finally {
      await env.app.close();
    }
  });

  it('fails every column with the same error when the diff fails (AC-27)', async () => {
    const env = await setup({ diffCommitsError: new Error('diff exploded') });
    try {
      const [a, b] = env.agents;
      const id = (await env.start({ agent_ids: [a!.id, b!.id] })).json().id as string;
      const body = await env.finish(id);
      const errors = body.columns.map((c: { status: string; error: string | null }) => {
        expect(c.status).toBe('failed');
        return c.error;
      });
      expect(errors[0]).toBeTruthy();
      expect(new Set(errors).size).toBe(1);
    } finally {
      await env.app.close();
    }
  });

  it('estimates from the last done runs; an agent with no done run has none (AC-16, 18, 19)', async () => {
    const env = await setup();
    try {
      const [a] = env.agents;
      const id = (await env.start({ agent_ids: [a!.id] })).json().id as string;
      await env.finish(id);
      await env.db.update(t.agentRuns).set({ durationMs: 4000, costUsd: 0.02 }).where(eq(t.agentRuns.multiAgentRunId, id));
      const res = await env.app.inject({ method: 'GET', url: '/multi-agent/estimates' });
      expect(res.statusCode).toBe(200);
      const estimates = res.json() as { agent_id: string; sample_size: number; duration_ms: number | null; last_verdict: string | null }[];
      expect(estimates).toHaveLength(env.agents.length);
      const mine = estimates.find((e) => e.agent_id === a!.id)!;
      expect(mine.sample_size).toBeGreaterThanOrEqual(1);
      expect(mine.last_verdict).toBe('Hardcoded key.');
      const fresh = estimates.filter((e) => e.agent_id !== a!.id && e.sample_size === 0);
      for (const e of fresh) expect(e.duration_ms).toBeNull();
      // Only failed runs → no sample.
      await env.db.update(t.agentRuns).set({ status: 'failed' }).where(inArray(t.agentRuns.agentId, [a!.id]));
      const after = (await env.app.inject({ method: 'GET', url: '/multi-agent/estimates' })).json() as typeof estimates;
      expect(after.find((e) => e.agent_id === a!.id)!.sample_size).toBe(0);
    } finally {
      await env.app.close();
    }
  });
});
