import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { isolatedTestConfig } from './helpers/config.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockSecretsProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agent-performance-perf] Docker not available — skipping integration tests.');
}

const DAY = 86_400_000;

/** NFR (plan 42, T3 / D5 check): the dashboard stays under 1 s with no `(workspace_id, ran_at)` index on `agent_runs` (D5 A). */
d('agent performance dashboard timing (NFR 1 s)', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('answers GET /agents/performance over 20 agents x 10,000 runs', async () => {
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    await db.insert(t.agents).values(
      Array.from({ length: 20 }, (_, i) => ({
        workspaceId: ws!.id, name: `Load${i}`, provider: 'openrouter', model: 'x/y', systemPrompt: 'p',
      })),
    );
    await db.execute(sql`
      INSERT INTO agent_runs (workspace_id, agent_id, ran_at, status, source, cost_usd, cost_source, duration_ms, model)
      SELECT a.workspace_id, a.id, now() - random() * interval '29 days', 'done', 'local', random(), 'api', 1000, 'm'
      FROM agents a CROSS JOIN generate_series(1, 10000)
      WHERE a.name LIKE 'Load%'`);

    const app = await buildApp({ config: isolatedTestConfig(), db, overrides: { secrets: new MockSecretsProvider({}) } });
    try {
      const query = { period: '30d', from: new Date(Date.now() - 30 * DAY).toISOString(), to: new Date().toISOString(), tz: 'UTC' };
      const started = performance.now();
      const res = await app.inject({ method: 'GET', url: '/agents/performance', query });
      const ms = performance.now() - started;
      expect(res.statusCode).toBe(200);
      expect(res.json().totals.runs).toBeGreaterThanOrEqual(200_000);
      // eslint-disable-next-line no-console
      console.log(`[agent-performance-perf] GET /agents/performance: ${Math.round(ms)} ms`);
      if (!process.env.CI) expect(ms).toBeLessThan(1000);
    } finally {
      await app.close();
    }
  }, 180_000);
});

/** NFR (plan 43, T3): the breakdown panels stay under 1 s with 2,000 traces of ~32 KB and no new index. */
d('agent stats breakdown timing (NFR 1 s)', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('answers GET /agents/:id/stats/breakdown over 2,000 traced runs with skills and findings', async () => {
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    const [agent] = await db
      .insert(t.agents)
      .values({ workspaceId: ws!.id, name: 'Load', provider: 'openrouter', model: 'x/y', systemPrompt: 'p' })
      .returning();
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'load', fullName: 'acme/load' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws!.id, repoId: repo!.id, number: 1, title: 't', author: 'a', branch: 'b', base: 'main',
        headSha: 'f'.repeat(40), additions: 1, deletions: 0, filesCount: 1, status: 'needs_review',
      })
      .returning();
    await db.insert(t.skills).values([
      { workspaceId: ws!.id, name: 'LoadS1', description: 'd', type: 'custom', source: 'manual', body: 'b' },
      { workspaceId: ws!.id, name: 'LoadS2', description: 'd', type: 'custom', source: 'manual', body: 'b' },
    ]);
    await db.execute(sql`
      INSERT INTO agent_runs (workspace_id, agent_id, ran_at, status, source, cost_usd, cost_source, duration_ms, model)
      SELECT ${ws!.id}::uuid, ${agent!.id}::uuid, now() - random() * interval '29 days', 'done', 'local', random(), 'api', 1000, 'm'
      FROM generate_series(1, 2000)`);
    await db.execute(sql`
      INSERT INTO run_skills (run_id, skill_id, "order")
      SELECT r.id, s.id, 0 FROM agent_runs r CROSS JOIN skills s
      WHERE r.agent_id = ${agent!.id}::uuid AND s.name LIKE 'LoadS%'`);
    // Incompressible text so the traces are really TOASTed, not compressed away.
    await db.execute(sql`
      INSERT INTO run_traces (run_id, trace)
      SELECT r.id, jsonb_build_object(
        'blob', (SELECT string_agg(md5(random()::text || g::text), '') FROM generate_series(1, 1000) g),
        'memory_pulled', jsonb_build_array(
          jsonb_build_object('text', 'mem-' || (random() * 50)::int, 'pr', 1),
          jsonb_build_object('text', 'mem-' || (random() * 50)::int, 'pr', 2),
          jsonb_build_object('text', 'mem-' || (random() * 50)::int, 'pr', null)))
      FROM agent_runs r WHERE r.agent_id = ${agent!.id}::uuid`);
    await db.execute(sql`
      INSERT INTO reviews (workspace_id, pr_id, agent_id, run_id, kind)
      SELECT ${ws!.id}::uuid, ${pr!.id}::uuid, ${agent!.id}::uuid, r.id, 'review'
      FROM agent_runs r WHERE r.agent_id = ${agent!.id}::uuid`);
    await db.execute(sql`
      INSERT INTO findings (review_id, file, start_line, end_line, severity, category, title, rationale, confidence)
      SELECT rv.id, 'a.ts', 1, 1, (ARRAY['CRITICAL','WARNING','SUGGESTION'])[1 + g % 3], (ARRAY['bug','style','security'])[1 + g % 3], 't', 'r', 0.5
      FROM reviews rv CROSS JOIN generate_series(1, 5) g WHERE rv.agent_id = ${agent!.id}::uuid`);

    const app = await buildApp({ config: isolatedTestConfig(), db, overrides: { secrets: new MockSecretsProvider({}) } });
    try {
      const query = { period: '30d', from: new Date(Date.now() - 30 * DAY).toISOString(), to: new Date().toISOString(), tz: 'UTC' };
      const started = performance.now();
      const res = await app.inject({ method: 'GET', url: `/agents/${agent!.id}/stats/breakdown`, query });
      const ms = performance.now() - started;
      expect(res.statusCode).toBe(200);
      expect(res.json().counted_runs).toBe(2000);
      expect(res.json().findings.total).toBe(10_000);
      // eslint-disable-next-line no-console
      console.log(`[agent-performance-perf] GET /agents/:id/stats/breakdown: ${Math.round(ms)} ms`);
      if (!process.env.CI) expect(ms).toBeLessThan(1000);
    } finally {
      await app.close();
    }
  }, 300_000);
});
