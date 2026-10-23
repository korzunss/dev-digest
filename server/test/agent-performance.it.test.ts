import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
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
  console.warn('[agent-performance] Docker not available — skipping integration tests.');
}

const DAY = 86_400_000;
const NOW = Date.now();
const SHA = 'd'.repeat(40);
const ago = (ms: number) => new Date(NOW - ms);
const HOUR = 3_600_000;

type App = Awaited<ReturnType<typeof buildApp>>;

/** Spec 015 / plan 42 (S7): the four read-only routes over a seeded Postgres. */
d('agent performance routes (spec 015)', () => {
  let pg: PgFixture;
  let app: App;
  let wsId: string;
  let agentA: string;
  let agentB: string;
  let agentZ: string;
  let agentH: string;
  let agentX: string;
  const X_LAST = ago(20 * 60_000);
  let runA1: string;

  const win30 = () => ({ period: '30d', from: ago(30 * DAY).toISOString(), to: new Date().toISOString(), tz: 'UTC' });
  const get = (url: string, query: Record<string, string>) => app.inject({ method: 'GET', url, query });
  const runCount = async () => {
    const [r] = await pg.handle.db.select({ n: sql<number>`count(*)::int` }).from(t.agentRuns);
    return r!.n;
  };

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.name, 'Default'));
    wsId = ws?.id ?? (await db.select().from(t.workspaces))[0]!.id;
    app = await buildApp({ config: isolatedTestConfig(), db, overrides: { secrets: new MockSecretsProvider({}) } });

    const mkAgent = async (workspaceId: string, name: string, enabled = true) =>
      (
        await db
          .insert(t.agents)
          .values({ workspaceId, name, provider: 'openrouter', model: 'x/y', systemPrompt: 'p', enabled })
          .returning()
      )[0]!.id;
    agentA = await mkAgent(wsId, 'PerfA');
    agentB = await mkAgent(wsId, 'PerfB', false);
    agentZ = await mkAgent(wsId, 'PerfZ');
    agentH = await mkAgent(wsId, 'PerfH');
    agentX = await mkAgent(wsId, 'PerfX');
    const agentD = await mkAgent(wsId, 'PerfDeleted');

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'acme', name: 'perf', fullName: 'acme/perf' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: wsId, repoId: repo!.id, number: 7, title: 't', author: 'a', branch: 'b', base: 'main',
        headSha: SHA, additions: 1, deletions: 0, filesCount: 1, status: 'needs_review',
      })
      .returning();

    const run = async (agentId: string, o: Partial<typeof t.agentRuns.$inferInsert>) =>
      (
        await db
          .insert(t.agentRuns)
          .values({ workspaceId: wsId, agentId, status: 'done', source: 'local', model: 'm1', ranAt: ago(HOUR), ...o })
          .returning()
      )[0]!;

    // Agent A: five counted runs (one CI), two uncounted, one running, one in the previous window.
    const a1 = await run(agentA, { prId: pr!.id, costUsd: 0.1, costSource: 'api', durationMs: 1000, tokensIn: 5, tokensOut: 6, findingsCount: 4, ranAt: ago(1 * HOUR) });
    runA1 = a1.id;
    await run(agentA, { costUsd: 0.2, costSource: 'estimate', durationMs: 3000, ranAt: ago(2 * HOUR) });
    await run(agentA, { ranAt: ago(3 * HOUR) });
    await run(agentA, { costUsd: -1, durationMs: -5, ranAt: ago(4 * HOUR) });
    const ci = await run(agentA, { source: 'ci', costUsd: 0.3, costSource: null, durationMs: 2000, ranAt: ago(5 * HOUR) });
    await run(agentA, { status: 'failed', costUsd: 5, costSource: 'api', ranAt: ago(6 * HOUR) });
    await run(agentA, { status: 'cancelled', ranAt: ago(7 * HOUR) });
    await run(agentA, { status: 'running', ranAt: ago(8 * HOUR) });
    await run(agentA, { costUsd: 9, costSource: 'api', ranAt: ago(45 * DAY) });
    await db.insert(t.ciRuns).values({
      workspaceId: wsId, agentId: agentA, agentName: 'PerfA', agentRunId: ci.id, repoFullName: 'acme/perf',
      githubRunId: 123, runAttempt: 1, headSha: SHA, prNumber: 9,
    });
    await db.insert(t.runTraces).values({ runId: a1.id, trace: {} });

    // Decisions on A's first run: accepted, dismissed, both (counts as accepted), pending.
    const [rv] = await db
      .insert(t.reviews)
      .values({ workspaceId: wsId, prId: pr!.id, agentId: agentA, runId: a1.id, kind: 'review' })
      .returning();
    const f = { reviewId: rv!.id, file: 'a.ts', startLine: 1, endLine: 1, severity: 'warning', category: 'bug', title: 't', rationale: 'r', confidence: 0.5 };
    const at = new Date();
    await db.insert(t.findings).values([
      { ...f, acceptedAt: at },
      { ...f, dismissedAt: at },
      { ...f, acceptedAt: at, dismissedAt: at },
      { ...f },
    ]);

    // Agent B (disabled): one run, its only decision dismissed.
    const b1 = await run(agentB, { costUsd: 0.4, costSource: 'api', model: 'm2', durationMs: 500 });
    const [rvB] = await db
      .insert(t.reviews)
      .values({ workspaceId: wsId, prId: pr!.id, agentId: agentB, runId: b1.id, kind: 'review' })
      .returning();
    await db.insert(t.findings).values({ ...f, reviewId: rvB!.id, dismissedAt: at });

    // A deleted agent's run: the FK sets agent_id null.
    await run(agentD, { costUsd: 0.5, costSource: 'api', model: null, durationMs: 700 });
    await db.delete(t.agents).where(eq(t.agents.id, agentD));

    // Another workspace: huge cost that must never show up.
    const [other] = await db.insert(t.workspaces).values({ name: 'perf-other' }).returning();
    const otherAgent = await mkAgent(other!.id, 'Other');
    await db.insert(t.agentRuns).values({ workspaceId: other!.id, agentId: otherAgent, status: 'done', costUsd: 1000, costSource: 'api', ranAt: ago(HOUR) });

    // Agent X: one run on a PR of each of two repos in the same workspace (AC-7), newest at X_LAST (M-12).
    const [repo2] = await db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'acme', name: 'perf2', fullName: 'acme/perf2' })
      .returning();
    const [pr2] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: wsId, repoId: repo2!.id, number: 8, title: 't2', author: 'a', branch: 'b', base: 'main',
        headSha: SHA, additions: 1, deletions: 0, filesCount: 1, status: 'needs_review',
      })
      .returning();
    await run(agentX, { prId: pr!.id, costUsd: 0.1, costSource: 'api', durationMs: 100, ranAt: ago(30 * 60_000) });
    await run(agentX, { prId: pr2!.id, costUsd: 0.1, costSource: 'api', durationMs: 100, ranAt: X_LAST });

    // Agent H: 120 counted runs, one a minute apart.
    await db.insert(t.agentRuns).values(
      Array.from({ length: 120 }, (_, i) => ({
        workspaceId: wsId, agentId: agentH, status: 'done', source: 'local' as const, costUsd: 0.01, costSource: 'api' as const, ranAt: ago(10 * HOUR + i * 60_000),
      })),
    );
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('routes /agents/performance to the dashboard, not the /agents/:id UUID check', async () => {
    const res = await get('/agents/performance', win30());
    expect(res.statusCode).toBe(200);
  });

  it('computes the M-figures per row, pools totals and ignores other workspaces', async () => {
    const before = await runCount();
    const body = (await get('/agents/performance', win30())).json();
    const row = (id: string) => body.rows.find((r: { agent_id: string }) => r.agent_id === id);

    const a = row(agentA).current;
    expect(a.runs).toBe(5);
    expect(a.runs_not_counted).toBe(2);
    expect(a.cost_known_runs).toBe(3);
    expect(a.cost_unknown_runs).toBe(2);
    expect(a.total_cost_usd).toBeCloseTo(0.6, 6);
    expect(a.cost_split.api_usd).toBeCloseTo(0.1, 6);
    expect(a.cost_split.estimate_usd).toBeCloseTo(0.2, 6);
    expect(a.cost_split.unrecorded_usd).toBeCloseTo(0.3, 6);
    expect(a.avg_cost_usd).toBeCloseTo(0.2, 6);
    expect(a.avg_duration_ms).toBeCloseTo(2000, 6);
    expect(a.accepted).toBe(2);
    expect(a.dismissed).toBe(1);
    expect(a.accept_rate).toBeCloseTo(2 / 3, 6);
    expect(row(agentA).previous.runs).toBe(1);

    expect(row(agentB).enabled).toBe(false);
    expect(row(agentB).current.accept_rate).toBe(0);
    expect(row(agentZ).current.runs).toBe(0);
    expect(row(agentZ).current.accept_rate).toBeNull();
    expect(row(agentZ).current.total_cost_usd).toBeNull();

    const deleted = body.rows.find((r: { kind: string }) => r.kind === 'deleted');
    expect(deleted.agent_id).toBeNull();
    expect(deleted.current.runs).toBe(1);

    // AC-14: totals are the sum of the rows; AC-17: each breakdown sums to the total cost.
    const sum = (k: string) => body.rows.reduce((s: number, r: { current: Record<string, number> }) => s + (r.current[k] ?? 0), 0);
    expect(body.totals.runs).toBe(sum('runs'));
    expect(body.totals.runs_not_counted).toBe(sum('runs_not_counted'));
    const segs = (list: { amount_usd: number }[]) => list.reduce((s, x) => s + x.amount_usd, 0);
    expect(segs(body.cost_by_agent)).toBeCloseTo(body.totals.total_cost_usd, 6);
    expect(segs(body.cost_by_model)).toBeCloseTo(body.totals.total_cost_usd, 6);
    expect(body.totals.total_cost_usd).toBeLessThan(100);
    expect(body.cost_by_model.some((m: { label: string | null }) => m.label === null)).toBe(true);
    expect(body.buckets.length).toBeGreaterThanOrEqual(30);
    expect(body.most_active.agent_id).toBe(agentH);

    // AC-28: reading changes nothing.
    expect(await runCount()).toBe(before);
  });

  it('counts an agent runs across every repo of the workspace (AC-7) and reports last_run_at (M-12)', async () => {
    const body = (await get('/agents/performance', win30())).json();
    const x = body.rows.find((r: { agent_id: string }) => r.agent_id === agentX).current;
    expect(x.runs).toBe(2);
    expect(Date.parse(x.last_run_at)).toBe(X_LAST.getTime());
    const a = body.rows.find((r: { agent_id: string }) => r.agent_id === agentA).current;
    // A's newest counted (done) run is a1 at 1 h ago; the failed/running rows never move it.
    expect(Date.parse(a.last_run_at)).toBe(ago(HOUR).getTime());
    const z = body.rows.find((r: { agent_id: string }) => r.agent_id === agentZ).current;
    expect(z.last_run_at).toBeNull();
    const stats = (await get(`/agents/${agentX}/stats`, win30())).json();
    expect(stats.figures.runs).toBe(2);
  });

  it('serves the agent Stats tab with the same figures as the dashboard row (AC-22)', async () => {
    const dash = (await get('/agents/performance', win30())).json();
    const stats = (await get(`/agents/${agentA}/stats`, win30())).json();
    const row = dash.rows.find((r: { agent_id: string }) => r.agent_id === agentA);
    expect(stats.figures).toEqual(row.current);
    expect(stats.previous).toEqual(row.previous);
    expect(stats.agent_name).toBe('PerfA');
  });

  it('counts a skill only in the runs that injected it (narrowed run_skills, AC-30a)', async () => {
    const mk = async (name: string, paths: string[]) =>
      (
        await app.inject({
          method: 'POST',
          url: '/skills',
          payload: { name, description: `${name} desc`, type: 'custom', body: `# ${name}`, paths },
        })
      ).json().id as string;
    const scoped = await mk('narrow-cs-rule', ['**/*.cs']);
    const unscoped = await mk('narrow-any-rule', []);
    const runs = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.agentId, agentX));
    // The scoped skill never reached a call (a PR with no .cs file); the unscoped one reached both runs.
    await pg.handle.db
      .insert(t.runSkills)
      .values(runs.map((r) => ({ runId: r.id, skillId: unscoped, order: 0, tokens: 10 })));

    const stats = (await get(`/agents/${agentX}/stats/breakdown`, win30())).json();
    const rows: { skill_id: string; runs: number }[] = stats.skills.rows;
    expect(rows.find((r) => r.skill_id === unscoped)?.runs).toBe(runs.length);
    expect(rows.find((r) => r.skill_id === scoped)).toBeUndefined();

    const scopedStats = (await get(`/skills/${scoped}/stats`, win30())).json();
    const unscopedStats = (await get(`/skills/${unscoped}/stats`, win30())).json();
    expect(scopedStats.runs_with_skill).toBe(0);
    expect(unscopedStats.runs_with_skill).toBe(runs.length);
    expect(unscopedStats.pull_rate).toBeGreaterThan(0);
  });

  it('counts runs for the Try-30-days suggestion, workspace-wide and per agent', async () => {
    const all = (await get('/agents/performance/runs-count', win30())).json();
    expect(all.runs).toBeGreaterThanOrEqual(127);
    const one = (await get('/agents/performance/runs-count', { ...win30(), agent_id: agentA })).json();
    expect(one.runs).toBe(5);
  });

  it('rejects an unknown time zone and every AC-4 violation with 422', async () => {
    const base = win30();
    expect((await get('/agents/performance', { ...base, tz: 'Mars/Base' })).statusCode).toBe(422);
    expect((await get('/agents/performance', { ...base, from: base.to, to: base.from })).statusCode).toBe(422);
    const future = new Date(NOW + 2 * DAY).toISOString();
    expect((await get('/agents/performance', { period: 'custom', from: base.to, to: future, tz: 'UTC' })).statusCode).toBe(422);
    expect((await get('/agents/performance', { ...base, period: '1d' })).statusCode).toBe(422);
    const wide = { period: 'custom', from: ago(400 * DAY).toISOString(), to: base.to, tz: 'UTC' };
    expect((await get('/agents/performance', wide)).statusCode).toBe(422);
  });

  it('answers 404 for an unknown agent', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    expect((await get(`/agents/${ghost}/stats`, win30())).statusCode).toBe(404);
    expect((await get(`/agents/${ghost}/stats/runs`, win30())).statusCode).toBe(404);
    expect((await get('/agents/performance/runs-count', { ...win30(), agent_id: ghost })).statusCode).toBe(404);
  });

  it('pages the Run history 50/50/20 with no repeat after a newer run arrives', async () => {
    const q = { ...win30(), limit: '50' };
    const p1 = (await get(`/agents/${agentH}/stats/runs`, q)).json();
    expect(p1.items).toHaveLength(50);
    expect(p1.next_cursor).toBeTruthy();

    await pg.handle.db.insert(t.agentRuns).values({ workspaceId: wsId, agentId: agentH, status: 'done', ranAt: ago(1000) });

    const p2 = (await get(`/agents/${agentH}/stats/runs`, { ...q, cursor: p1.next_cursor })).json();
    expect(p2.items).toHaveLength(50);
    const p3 = (await get(`/agents/${agentH}/stats/runs`, { ...q, cursor: p2.next_cursor })).json();
    expect(p3.items).toHaveLength(20);
    expect(p3.next_cursor).toBeNull();

    const ids = [...p1.items, ...p2.items, ...p3.items].map((i: { run_id: string }) => i.run_id);
    expect(new Set(ids).size).toBe(120);
  });

  it('rejects a forged cursor with 422', async () => {
    const res = await get(`/agents/${agentH}/stats/runs`, { ...win30(), cursor: 'bm90LWEtY3Vyc29y' });
    expect(res.statusCode).toBe(422);
  });

  it('reports PR number, trace and source on history rows (local, CI)', async () => {
    const items = (await get(`/agents/${agentA}/stats/runs`, win30())).json().items as Array<{
      run_id: string; pr_number: number | null; has_trace: boolean; source: string; tokens: number | null;
    }>;
    const local = items.find((i) => i.run_id === runA1)!;
    expect(local).toMatchObject({ pr_number: 7, has_trace: true, source: 'local', tokens: 11 });
    const ci = items.find((i) => i.source === 'ci')!;
    expect(ci).toMatchObject({ pr_number: 9, has_trace: false });
  });
});
