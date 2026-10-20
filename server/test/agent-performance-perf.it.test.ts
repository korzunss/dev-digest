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
