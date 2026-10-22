import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { isolatedTestConfig } from './helpers/config.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agent-performance-boundary] Docker not available — skipping integration tests.');
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms);
const SHA = 'e'.repeat(40);
const GHOST = '00000000-0000-4000-8000-000000000000';

type App = Awaited<ReturnType<typeof buildApp>>;

/**
 * Spec 015 / plan 42: trust boundaries and AC-28 of the four read-only routes.
 * `agent-performance.it.test.ts` proves the figures; this file proves what is
 * REJECTED (bad tz, AC-4, forged cursor, another workspace) and that reading
 * never starts a review or calls a model provider.
 */
d('agent performance: trust boundaries and read-only (spec 015)', () => {
  let pg: PgFixture;
  let app: App;
  let wsId: string;
  let otherWsId: string;
  let agentF: string;
  let agentZ: string;
  let agentIdle: string;
  let foreignAgent: string;
  let foreignRunId: string;
  const llm = {
    openai: new MockLLMProvider('openai'),
    anthropic: new MockLLMProvider('anthropic'),
    openrouter: new MockLLMProvider('openai'),
  };

  const win = (period: '1d' | '30d') => ({
    period,
    from: ago(period === '1d' ? DAY : 30 * DAY).toISOString(),
    to: new Date().toISOString(),
    tz: 'UTC',
  });
  const win30 = () => win('30d');
  const get = (url: string, query: Record<string, string>) => app.inject({ method: 'GET', url, query });
  const count = async (table: typeof t.agentRuns | typeof t.reviews | typeof t.findings) => {
    const [r] = await pg.handle.db.select({ n: sql<number>`count(*)::int` }).from(table);
    return r!.n;
  };

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.name, 'Default'));
    wsId = ws?.id ?? (await db.select().from(t.workspaces))[0]!.id;
    app = await buildApp({
      config: isolatedTestConfig(),
      db,
      overrides: { secrets: new MockSecretsProvider({}), llm },
    });

    const mkAgent = async (workspaceId: string, name: string) =>
      (
        await db
          .insert(t.agents)
          .values({ workspaceId, name, provider: 'openrouter', model: 'x/y', systemPrompt: 'p' })
          .returning()
      )[0]!.id;
    agentF = await mkAgent(wsId, 'BoundaryF');
    agentZ = await mkAgent(wsId, 'BoundaryZ');
    agentIdle = await mkAgent(wsId, 'BoundaryIdle');

    const [other] = await db.insert(t.workspaces).values({ name: 'boundary-other' }).returning();
    otherWsId = other!.id;
    foreignAgent = await mkAgent(otherWsId, 'ForeignAgent');

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'acme', name: 'bound', fullName: 'acme/bound' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: wsId, repoId: repo!.id, number: 3, title: 't', author: 'a', branch: 'b', base: 'main',
        headSha: SHA, additions: 1, deletions: 0, filesCount: 1, status: 'needs_review',
      })
      .returning();

    const run = async (workspaceId: string, agentId: string, o: Partial<typeof t.agentRuns.$inferInsert>) =>
      (
        await db
          .insert(t.agentRuns)
          .values({ workspaceId, agentId, status: 'done', source: 'local', model: 'm1', ranAt: ago(HOUR), ...o })
          .returning()
      )[0]!;

    // Agent F: two own counted runs (one decision), plus ONE run of a foreign
    // workspace stamped onto F (a child row of another workspace under this
    // workspace's agent, so only the workspace filter can keep it out).
    const own1 = await run(wsId, agentF, { prId: pr!.id, costUsd: 0.1, costSource: 'api', durationMs: 1000, ranAt: ago(1 * HOUR) });
    await run(wsId, agentF, { costUsd: 0.3, costSource: 'estimate', durationMs: 3000, ranAt: ago(2 * HOUR) });
    const foreign = await run(otherWsId, agentF, { costUsd: 777, costSource: 'api', durationMs: 99_000, ranAt: ago(30 * 60_000) });
    foreignRunId = foreign.id;

    const f = { file: 'a.ts', startLine: 1, endLine: 1, severity: 'warning', category: 'bug', title: 't', rationale: 'r', confidence: 0.5 };
    const at = new Date();
    const [rvOwn] = await db
      .insert(t.reviews)
      .values({ workspaceId: wsId, prId: pr!.id, agentId: agentF, runId: own1.id, kind: 'review' })
      .returning();
    await db.insert(t.findings).values({ ...f, reviewId: rvOwn!.id, dismissedAt: at });
    const [rvForeign] = await db
      .insert(t.reviews)
      .values({ workspaceId: otherWsId, prId: pr!.id, agentId: agentF, runId: foreign.id, kind: 'review' })
      .returning();
    await db.insert(t.findings).values([
      { ...f, reviewId: rvForeign!.id, acceptedAt: at },
      { ...f, reviewId: rvForeign!.id, acceptedAt: at },
    ]);

    // A foreign agent with its own counted run.
    await run(otherWsId, foreignAgent, { costUsd: 55, costSource: 'api' });

    // 60 counted runs for paging (agent F gets 2 + these would change its counts, so use Z).
    await db.insert(t.agentRuns).values(
      Array.from({ length: 60 }, (_, i) => ({
        workspaceId: wsId, agentId: agentZ, status: 'done', source: 'local' as const, costUsd: 0.01, costSource: 'api' as const,
        ranAt: ago(3 * HOUR + i * 60_000),
      })),
    );
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const p of Object.values(llm)) p.calls.length = 0;
  });

  const routes = (agentId: string, q: Record<string, string>) => [
    ['/agents/performance', q],
    ['/agents/performance/runs-count', q],
    [`/agents/${agentId}/stats`, q],
    [`/agents/${agentId}/stats/runs`, q],
  ] as const;

  // AC-28: reading never calls a model provider, never writes, and has no write route to hit.
  it('never calls an LLM provider and writes nothing on reload, paging or counting (AC-28)', async () => {
    const before = { runs: await count(t.agentRuns), reviews: await count(t.reviews), findings: await count(t.findings) };

    for (const [url, q] of routes(agentF, win30())) expect((await get(url, q)).statusCode).toBe(200);
    // "Reload": the same reads again, then a 1-day period, then history paging through the cursor.
    for (const [url, q] of routes(agentF, win30())) expect((await get(url, q)).statusCode).toBe(200);
    for (const [url, q] of routes(agentF, win('1d'))) expect((await get(url, q)).statusCode).toBe(200);
    const p1 = (await get(`/agents/${agentZ}/stats/runs`, { ...win30(), limit: '50' })).json();
    expect(p1.items).toHaveLength(50);
    const p2 = await get(`/agents/${agentZ}/stats/runs`, { ...win30(), limit: '50', cursor: p1.next_cursor });
    expect(p2.statusCode).toBe(200);

    for (const [id, provider] of Object.entries(llm)) expect(provider.calls, `${id} provider was called`).toEqual([]);
    expect({ runs: await count(t.agentRuns), reviews: await count(t.reviews), findings: await count(t.findings) }).toEqual(before);
  });

  // AC-28: there is no POST route that could start a review or a run from these screens.
  it('has no write route on the four paths', async () => {
    const before = await count(t.agentRuns);
    for (const url of ['/agents/performance', '/agents/performance/runs-count', `/agents/${agentF}/stats`, `/agents/${agentF}/stats/runs`]) {
      const res = await app.inject({ method: 'POST', url, query: win30(), payload: {} });
      expect(res.statusCode, `POST ${url}`).toBe(404);
    }
    for (const url of [`/agents/${agentF}/stats`, `/agents/${agentF}/stats/runs`]) {
      expect((await app.inject({ method: 'PUT', url, query: win30(), payload: {} })).statusCode, `PUT ${url}`).toBe(404);
    }
    expect(await count(t.agentRuns)).toBe(before);
    for (const p of Object.values(llm)) expect(p.calls).toEqual([]);
  });

  // Horizontal escalation: an agent of another workspace is "not found", on every route that names an agent.
  it("answers 404 for another workspace's agent on stats, history and runs-count", async () => {
    expect((await get(`/agents/${foreignAgent}/stats`, win30())).statusCode).toBe(404);
    expect((await get(`/agents/${foreignAgent}/stats/runs`, win30())).statusCode).toBe(404);
    expect((await get('/agents/performance/runs-count', { ...win30(), agent_id: foreignAgent })).statusCode).toBe(404);
    // The foreign agent's cost never reaches this workspace's dashboard (no row, no segment).
    const dash = (await get('/agents/performance', win30())).json();
    expect(dash.rows.some((r: { agent_id: string | null }) => r.agent_id === foreignAgent)).toBe(false);
    expect(dash.totals.total_cost_usd).toBeLessThan(10);
  });

  // A run stamped with another workspace under THIS workspace's agent must not count, show or decide anything
  // (a "foreign agent -> 404" test cannot prove this filter: it sits behind the scoped agent lookup).
  it("ignores a foreign-workspace run and its decisions stamped on this workspace's agent", async () => {
    const dash = (await get('/agents/performance', win30())).json();
    const row = dash.rows.find((r: { agent_id: string }) => r.agent_id === agentF).current;
    expect(row.runs).toBe(2);
    expect(row.total_cost_usd).toBeCloseTo(0.4, 6);
    expect(row.accepted).toBe(0); // the two accepted findings belong to the foreign run
    expect(row.dismissed).toBe(1);
    expect(dash.cost_by_model.reduce((s: number, m: { amount_usd: number }) => s + m.amount_usd, 0)).toBeLessThan(10);

    const stats = (await get(`/agents/${agentF}/stats`, win30())).json();
    expect(stats.figures.runs).toBe(2);
    expect(stats.figures.accepted).toBe(0);
    expect(stats.buckets.reduce((s: number, b: { runs: number }) => s + b.runs, 0)).toBe(2);

    const hist = (await get(`/agents/${agentF}/stats/runs`, win30())).json();
    expect(hist.items.map((i: { run_id: string }) => i.run_id)).not.toContain(foreignRunId);
    expect(hist.items).toHaveLength(2);

    const one = (await get('/agents/performance/runs-count', { ...win30(), agent_id: agentF })).json();
    expect(one.runs).toBe(2);
  });

  // Input boundary: a bad tz is a 422 on every route, never a 500, and a legal-looking zone still works.
  it('rejects a bad or unknown time zone with 422 on all four routes', async () => {
    for (const tz of ['Mars/Base', "UTC';select 1--", '../etc/passwd', 'UTC UTC', 'x'.repeat(65), '']) {
      for (const [url, q] of routes(agentF, { ...win30(), tz })) {
        expect((await get(url, q)).statusCode, `${url} tz=${JSON.stringify(tz)}`).toBe(422);
      }
    }
  });

  // The tz regex rejects at the schema, so the service must not even be reached.
  it('stops a malformed tz before the service runs', async () => {
    const dashboard = vi.spyOn(app.container.agentPerformance, 'dashboard');
    const stats = vi.spyOn(app.container.agentPerformance, 'agentStats');
    expect((await get('/agents/performance', { ...win30(), tz: "UTC';--" })).statusCode).toBe(422);
    expect((await get(`/agents/${agentF}/stats`, { ...win30(), tz: '../x' })).statusCode).toBe(422);
    expect(dashboard).not.toHaveBeenCalled();
    expect(stats).not.toHaveBeenCalled();
  });

  it('accepts real IANA names the regex must allow (a slash, an underscore, a plus sign)', async () => {
    for (const tz of ['Europe/Kyiv', 'America/Argentina/Buenos_Aires', 'Etc/GMT+3']) {
      expect((await get('/agents/performance', { ...win30(), tz })).statusCode, tz).toBe(200);
    }
  });

  // AC-4 is re-checked by the server on every route that takes a window, not only the dashboard.
  it('rejects every AC-4 violation with 422 on stats, history and runs-count too', async () => {
    const base = win30();
    const future = new Date(NOW + 2 * DAY).toISOString();
    const bad: Record<string, string>[] = [
      { ...base, from: base.to, to: base.from }, // starts after it ends
      { period: 'custom', from: base.to, to: future, tz: 'UTC' }, // ends in the future
      { period: 'custom', from: ago(400 * DAY).toISOString(), to: base.to, tz: 'UTC' }, // over 365 days
      { ...base, period: '1d' }, // a "1d" that is 30 days long
    ];
    for (const q of bad) {
      for (const [url, qq] of routes(agentF, q).slice(1)) {
        expect((await get(url, qq)).statusCode, `${url} ${q.period} ${q.from}`).toBe(422);
      }
    }
    // 365 days exactly is allowed; the edge is not off by one.
    const edge = { period: 'custom', from: ago(365 * DAY).toISOString(), to: base.to, tz: 'UTC' };
    expect((await get(`/agents/${agentF}/stats`, edge)).statusCode).toBe(200);
  });

  it('rejects a missing or malformed window field with 422', async () => {
    const base = win30();
    for (const q of [
      { ...base, period: 'forever' },
      { ...base, from: 'yesterday' },
      { period: base.period, from: base.from, tz: base.tz }, // no `to`
    ]) {
      expect((await get(`/agents/${agentF}/stats`, q)).statusCode).toBe(422);
    }
  });

  // A forged cursor is a 422 (never a 500, never a leak), whatever shape the forgery has.
  it('rejects forged and oversized cursors and out-of-range limits with 422', async () => {
    const b64 = (v: unknown) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
    const goodT = new Date(NOW - HOUR).toISOString();
    const forged = [
      b64({ t: goodT, id: "00000000-0000-4000-8000-000000000000'; DROP TABLE agent_runs;--" }),
      b64({ t: goodT, id: 'not-a-uuid' }),
      b64({ t: 'last tuesday', id: GHOST }),
      b64({ id: GHOST }),
      b64('{"t":'),
      b64([]),
      'A'.repeat(201),
    ];
    for (const cursor of forged) {
      const res = await get(`/agents/${agentZ}/stats/runs`, { ...win30(), cursor });
      expect(res.statusCode, `cursor ${cursor.slice(0, 30)}`).toBe(422);
    }
    for (const limit of ['0', '51', 'abc', '-1']) {
      expect((await get(`/agents/${agentZ}/stats/runs`, { ...win30(), limit })).statusCode, `limit=${limit}`).toBe(422);
    }
    expect(await count(t.agentRuns)).toBeGreaterThan(0); // the table is still there
  });

  // A well-formed cursor that points at a foreign run still pages only this agent's own runs.
  it("never returns another workspace's run through a well-formed cursor", async () => {
    const cursor = Buffer.from(JSON.stringify({ t: new Date(NOW).toISOString(), id: foreignRunId }), 'utf8').toString('base64url');
    const res = await get(`/agents/${agentF}/stats/runs`, { ...win30(), cursor });
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((i: { run_id: string }) => i.run_id);
    expect(ids).not.toContain(foreignRunId);
    expect(ids).toHaveLength(2);
  });

  // AC-22 beyond the 30-day happy path: an idle agent and a 1-day window give the same figures on both surfaces.
  it('gives the Stats tab and the dashboard row identical figures for an idle agent and for a 1-day window (AC-22)', async () => {
    for (const w of [win30(), win('1d')]) {
      const dash = (await get('/agents/performance', w)).json();
      for (const id of [agentF, agentZ, agentIdle]) {
        const row = dash.rows.find((r: { agent_id: string }) => r.agent_id === id);
        const stats = (await get(`/agents/${id}/stats`, w)).json();
        expect(stats.figures, `${id} ${w.period}`).toEqual(row.current);
        expect(stats.previous).toEqual(row.previous);
      }
    }
  });
});
