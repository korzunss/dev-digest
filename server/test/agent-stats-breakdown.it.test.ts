import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { isolatedTestConfig } from './helpers/config.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockSecretsProvider } from '../src/adapters/mocks.js';
import { AgentPerformanceRepository } from '../src/modules/agent-performance/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agent-stats-breakdown] Docker not available — skipping integration tests.');
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.now();
const SHA = 'e'.repeat(40);
const ago = (ms: number) => new Date(NOW - ms);

type App = Awaited<ReturnType<typeof buildApp>>;

/** Spec 016 / plan 43 (S6): `GET /agents/:id/stats/breakdown` over a seeded Postgres. */
d('agent stats breakdown (spec 016)', () => {
  let pg: PgFixture;
  let app: App;
  let wsId: string;
  let agentS: string;
  let agentCi: string;
  let agentOther: string;
  let repo: AgentPerformanceRepository;

  const win30 = () => ({ period: '30d', from: ago(30 * DAY).toISOString(), to: new Date().toISOString(), tz: 'UTC' });
  const win1d = () => ({ period: '1d', from: ago(DAY).toISOString(), to: new Date().toISOString(), tz: 'UTC' });
  const get = (id: string, query: Record<string, string>) =>
    app.inject({ method: 'GET', url: `/agents/${id}/stats/breakdown`, query });
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
    repo = new AgentPerformanceRepository(db);

    const mkAgent = async (workspaceId: string, name: string) =>
      (
        await db
          .insert(t.agents)
          .values({ workspaceId, name, provider: 'openrouter', model: 'x/y', systemPrompt: 'p' })
          .returning()
      )[0]!.id;
    agentS = await mkAgent(wsId, 'BrkS');
    agentCi = await mkAgent(wsId, 'BrkCi');
    const [other] = await db.insert(t.workspaces).values({ name: 'brk-other' }).returning();
    agentOther = await mkAgent(other!.id, 'BrkOther');

    const [rp] = await db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'acme', name: 'brk', fullName: 'acme/brk' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: wsId, repoId: rp!.id, number: 3, title: 't', author: 'a', branch: 'b', base: 'main',
        headSha: SHA, additions: 1, deletions: 0, filesCount: 1, status: 'needs_review',
      })
      .returning();

    const run = async (agentId: string, o: Partial<typeof t.agentRuns.$inferInsert>, workspaceId = wsId) =>
      (
        await db
          .insert(t.agentRuns)
          .values({ workspaceId, agentId, status: 'done', source: 'local', model: 'm1', ranAt: ago(HOUR), ...o })
          .returning()
      )[0]!;
    const skill = async (workspaceId: string, name: string) =>
      (
        await db
          .insert(t.skills)
          .values({ workspaceId, name, description: 'd', type: 'custom', source: 'manual', body: 'b' })
          .returning()
      )[0]!.id;
    const finding = (reviewId: string, severity: string, category: string, extra: object = {}) => ({
      reviewId, file: 'a.ts', startLine: 1, endLine: 1, severity, category, title: 't', rationale: 'r', confidence: 0.5, ...extra,
    });
    const review = async (agentId: string, runId: string) =>
      (
        await db
          .insert(t.reviews)
          .values({ workspaceId: wsId, prId: pr!.id, agentId, runId, kind: 'review' })
          .returning()
      )[0]!.id;

    // Agent S: R0 (20d, no skill, empty trace), R1 (5d), R2 (3d), CI run, R4 (1h), plus a failed run with a trace.
    const r0 = await run(agentS, { ranAt: ago(20 * DAY) });
    const r1 = await run(agentS, { ranAt: ago(5 * DAY) });
    const r2 = await run(agentS, { ranAt: ago(3 * DAY) });
    await run(agentS, { source: 'ci', ranAt: ago(2 * HOUR) });
    const r4 = await run(agentS, { ranAt: ago(HOUR) });
    const failed = await run(agentS, { status: 'failed', ranAt: ago(4 * DAY) });

    const skA = await skill(wsId, 'Alpha');
    const skB = await skill(wsId, 'Beta');
    const skGone = await skill(wsId, 'Gone');
    await db.insert(t.runSkills).values([
      { runId: r1.id, skillId: skA, order: 0 },
      { runId: r1.id, skillId: skB, order: 1 },
      { runId: r2.id, skillId: skA, order: 0 },
      { runId: r2.id, skillId: skGone, order: 1 },
    ]);
    await db.delete(t.skills).where(eq(t.skills.id, skGone)); // cascades its run_skills rows (AC-12)

    // A skill run of another workspace, older than everything above, must not move "tracked since".
    const skOther = await skill(other!.id, 'Foreign');
    const rOther = await run(agentOther, { ranAt: ago(40 * DAY) }, other!.id);
    await db.insert(t.runSkills).values({ runId: rOther.id, skillId: skOther, order: 0 });

    await db.insert(t.runTraces).values([
      { runId: r0.id, trace: {} },
      { runId: r1.id, trace: { memory_pulled: [{ text: 'm1', pr: 7 }, { text: 'm2', pr: null }] } },
      { runId: r2.id, trace: { memory_pulled: [{ text: 'm1', pr: 7 }] } },
      { runId: failed.id, trace: { memory_pulled: [{ text: 'ghost', pr: 1 }] } },
    ]);

    const rv1 = await review(agentS, r1.id);
    const rv2 = await review(agentS, r2.id);
    const rv4 = await review(agentS, r4.id);
    const at = new Date();
    await db.insert(t.findings).values([
      finding(rv1, 'CRITICAL', 'bug', { acceptedAt: at }),
      finding(rv1, 'WARNING', 'bug', { dismissedAt: at }),
      finding(rv1, 'INFO', 'weird-cat'),
      finding(rv1, 'warning', 'security'),
      finding(rv2, 'SUGGESTION', 'style'),
      finding(rv2, 'WARNING', 'performance'),
      finding(rv4, 'SUGGESTION', 'style'),
    ]);

    // Agent CI: one CI-only run.
    await run(agentCi, { source: 'ci', ranAt: ago(HOUR) });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('counts runs: counted includes CI, local does not (AC-41)', async () => {
    const body = (await get(agentS, win30())).json();
    expect(body.counted_runs).toBe(5);
    expect(body.local_runs).toBe(4);
    expect(body.window.period).toBe('30d');
  });

  it('skills: tracked since is the earliest skill run of this workspace; earlier runs leave the denominator (AC-4, 5, 6, 12)', async () => {
    const { skills } = (await get(agentS, win30())).json();
    expect(Date.parse(skills.tracked_since)).toBe(ago(5 * DAY).getTime());
    expect(skills.denominator).toBe(3); // R1, R2, R4 — not R0 (before), not the CI run
    expect(skills.rows.map((r: { name: string; runs: number }) => [r.name, r.runs])).toEqual([
      ['Alpha', 2],
      ['Beta', 1],
    ]);
  });

  it('memory: identity is text + pr, distinct runs, failed runs and empty traces ignored (AC-13, 14, 15)', async () => {
    const { memory } = (await get(agentS, win30())).json();
    expect(Date.parse(memory.tracked_since)).toBe(ago(20 * DAY).getTime());
    expect(memory.denominator).toBe(3); // R0, R1, R2 have a trace
    expect(memory.rows).toEqual([
      { text: 'm1', pr: 7, runs: 2 },
      { text: 'm2', pr: null, runs: 1 },
    ]);
  });

  it('a CI-only agent reports local_runs 0 (AC-11)', async () => {
    const body = (await get(agentCi, win30())).json();
    expect(body.counted_runs).toBe(1);
    expect(body.local_runs).toBe(0);
    expect(body.skills.denominator).toBe(0);
    expect(body.skills.rows).toEqual([]);
  });

  it('findings: total = sum of categories = sum of buckets; unknown kept, INFO and lower case are other (AC-20, 21, 25, 33)', async () => {
    const { findings } = (await get(agentS, win30())).json();
    expect(findings.total).toBe(7);
    const byCat = Object.fromEntries(findings.by_category.map((c: { category: string; count: number }) => [c.category, c.count]));
    expect(byCat).toEqual({ bug: 2, 'weird-cat': 1, security: 1, style: 2, performance: 1 });
    type B = { critical: number; warning: number; suggestion: number; other: number };
    const sum = (k: keyof B) => findings.buckets.reduce((s: number, b: B) => s + b[k], 0);
    expect([sum('critical'), sum('warning'), sum('suggestion'), sum('other')]).toEqual([1, 2, 2, 2]);
  });

  it('30d: weekly buckets, the last one shorter, empty ones present (AC-27, 28, 31)', async () => {
    const q = win30();
    const { findings, window } = (await get(agentS, q)).json();
    expect(findings.bucket_kind).toBe('7d');
    expect(findings.buckets).toHaveLength(5);
    const from = Date.parse(window.from);
    findings.buckets.forEach((b: { start: string }, i: number) => expect(Date.parse(b.start)).toBe(from + i * 7 * DAY));
    expect(findings.buckets[4].end).toBe(window.to);
    expect(findings.buckets[0]).toMatchObject({ critical: 0, warning: 0, suggestion: 0, other: 0 });
    expect(findings.buckets[3]).toMatchObject({ critical: 1, warning: 2, suggestion: 1, other: 2 });
    expect(findings.buckets[4]).toMatchObject({ suggestion: 1 });
  });

  it('1d: six 4-hour buckets (AC-27)', async () => {
    const { findings, window } = (await get(agentS, win1d())).json();
    expect(findings.bucket_kind).toBe('4h');
    expect(findings.buckets).toHaveLength(6);
    expect(findings.total).toBe(1);
    expect(findings.buckets[5].suggestion).toBe(1);
    expect(findings.buckets[5].end).toBe(window.to);
    expect(Date.parse(findings.buckets[1].start) - Date.parse(findings.buckets[0].start)).toBe(4 * HOUR);
  });

  it('custom over 90 local days uses month buckets (AC-28, 29)', async () => {
    const q = { period: 'custom', from: '2026-01-01T00:00:00.000Z', to: '2026-04-02T00:00:00.000Z', tz: 'UTC' };
    const { findings } = (await get(agentS, q)).json();
    expect(findings.bucket_kind).toBe('month');
    expect(findings.buckets.map((b: { start: string }) => b.start)).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
      '2026-03-01T00:00:00.000Z',
      '2026-04-01T00:00:00.000Z',
    ]);
    expect(findings.buckets[3].end).toBe(q.to);
    const ninety = { period: 'custom', from: '2026-01-01T00:00:00.000Z', to: '2026-04-01T00:00:00.000Z', tz: 'UTC' };
    expect((await get(agentS, ninety)).json().findings.bucket_kind).toBe('7d');
  });

  it('DST: 4h bounds are real hours across 2026-03-08 in America/New_York', async () => {
    const from = new Date('2026-03-08T05:00:00.000Z');
    const to = new Date('2026-03-09T05:00:00.000Z');
    const rows = await repo.severityBuckets(wsId, { from, to }, 'America/New_York', '4h', agentS);
    expect(rows).toHaveLength(6);
    rows.forEach((b, i) => expect(b.start.getTime()).toBe(from.getTime() + i * 4 * HOUR));
    expect(rows[5]!.end.getTime()).toBe(to.getTime());
  });

  it('DST: 7d buckets follow local days across 2025-11-02 in America/New_York', async () => {
    const from = new Date('2025-10-30T04:00:00.000Z'); // local midnight, EDT
    const to = new Date('2025-11-08T05:00:00.000Z'); // local midnight, EST
    const rows = await repo.severityBuckets(wsId, { from, to }, 'America/New_York', '7d', agentS);
    expect(rows.map((b) => [b.start.toISOString(), b.end.toISOString()])).toEqual([
      ['2025-10-30T04:00:00.000Z', '2025-11-06T05:00:00.000Z'], // 7 local days = 169 real hours
      ['2025-11-06T05:00:00.000Z', '2025-11-08T05:00:00.000Z'],
    ]);
  });

  it('Asia/Kolkata months start at +05:30 local midnight', async () => {
    const from = new Date('2025-12-31T18:30:00.000Z');
    const to = new Date('2026-04-01T18:30:00.000Z');
    const rows = await repo.severityBuckets(wsId, { from, to }, 'Asia/Kolkata', 'month', agentS);
    expect(rows.map((b) => b.start.toISOString())).toEqual([
      '2025-12-31T18:30:00.000Z',
      '2026-01-31T18:30:00.000Z',
      '2026-02-28T18:30:00.000Z',
      '2026-03-31T18:30:00.000Z',
    ]);
    expect(rows[3]!.end.getTime()).toBe(to.getTime());
  });

  it('AC-38: reading changes no run', async () => {
    const before = await runCount();
    await get(agentS, win30());
    expect(await runCount()).toBe(before);
  });

  it('AC-39: an unknown agent and another workspace agent are 404', async () => {
    expect((await get('00000000-0000-4000-8000-000000000000', win30())).statusCode).toBe(404);
    expect((await get(agentOther, win30())).statusCode).toBe(404);
  });

  it('AC-40: a bad tz or a bad period is 422', async () => {
    expect((await get(agentS, { ...win30(), tz: 'Mars/Base' })).statusCode).toBe(422);
    expect((await get(agentS, { ...win30(), period: '1d' })).statusCode).toBe(422);
    expect((await get(agentS, { period: 'bogus' })).statusCode).toBe(422);
  });

  const READS = [
    'countedRuns', 'skillsTrackedSince', 'memoryTrackedSince', 'skillUsage', 'memoryUsage',
    'findingsByCategory', 'severityBuckets',
  ] as const;
  const spyReads = () => READS.map((m) => vi.spyOn(AgentPerformanceRepository.prototype, m));
  afterEach(() => vi.restoreAllMocks());

  it('AC-40: an invalid window or tz is refused before any breakdown query runs', async () => {
    const spies = spyReads();
    const future = new Date(NOW + 10 * DAY).toISOString();
    const bad: Record<string, string>[] = [
      { ...win30(), tz: 'Mars/Base' },
      { ...win30(), tz: "UTC'; DROP TABLE agent_runs;--" }, // injection attempt in tz
      { ...win30(), tz: '../../etc/passwd' },
      { ...win30(), to: future }, // ends in the future
      { ...win30(), from: new Date(NOW + DAY).toISOString() }, // starts after it ends
      { period: 'custom', from: '2020-01-01T00:00:00.000Z', to: '2022-01-01T00:00:00.000Z', tz: 'UTC' }, // > 365 days
    ];
    for (const q of bad) expect((await get(agentS, q)).statusCode, JSON.stringify(q)).toBe(422);
    const { tz: _tz, ...noTz } = win30();
    expect((await get(agentS, noTz)).statusCode).toBe(422);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    expect(await runCount()).toBeGreaterThan(0); // the table is still there
  });

  it('AC-39: an unknown or other-workspace agent is refused before any breakdown query runs', async () => {
    const spies = spyReads();
    expect((await get(agentOther, win30())).statusCode).toBe(404);
    expect((await get('00000000-0000-4000-8000-000000000000', win30())).statusCode).toBe(404);
    expect((await get('not-a-uuid', win30())).statusCode).toBe(422);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it('AC-3/41: a window with no runs reports 0 counted runs, an empty total and zeroed buckets', async () => {
    const q = { period: 'custom', from: '2024-01-01T00:00:00.000Z', to: '2024-01-08T00:00:00.000Z', tz: 'UTC' };
    const body = (await get(agentS, q)).json();
    expect(body.counted_runs).toBe(0);
    expect(body.local_runs).toBe(0);
    expect(body.findings.total).toBe(0);
    expect(body.findings.by_category).toEqual([]);
    expect(body.findings.buckets.length).toBeGreaterThan(0);
    expect(body.skills.denominator).toBe(0);
    expect(body.skills.rows).toEqual([]);
    expect(body.skills.tracked_since).not.toBeNull(); // still lets the client say "No data before"
  });

  describe('workspace filter on the child rows', () => {
    // agentX: this workspace, one local run 30 minutes ago with an own skill, a trace and a finding.
    let agentX: string;
    let ownSkill: string;
    beforeAll(async () => {
      const db = pg.handle.db;
      const [ws2] = await db.insert(t.workspaces).values({ name: 'brk-foreign' }).returning();
      const foreignWs = ws2!.id;
      agentX = (
        await db.insert(t.agents).values({ workspaceId: wsId, name: 'BrkX', provider: 'openrouter', model: 'x/y', systemPrompt: 'p' }).returning()
      )[0]!.id;
      const mkSkill = async (workspaceId: string, name: string) =>
        (await db.insert(t.skills).values({ workspaceId, name, description: 'd', type: 'custom', source: 'manual', body: 'b' }).returning())[0]!.id;
      ownSkill = await mkSkill(wsId, 'OwnX');
      const foreignSkill = await mkSkill(foreignWs, 'ForeignX');
      const [rp] = await db.select().from(t.repos).where(eq(t.repos.fullName, 'acme/brk'));
      const [pr] = await db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, rp!.id));
      const mkRun = async (workspaceId: string, ranAt: Date) =>
        (await db.insert(t.agentRuns).values({ workspaceId, agentId: agentX, status: 'done', source: 'local', model: 'm', ranAt }).returning())[0]!;
      const mkFinding = async (workspaceId: string, runId: string) => {
        const [rv] = await db.insert(t.reviews).values({ workspaceId, prId: pr!.id, agentId: agentX, runId, kind: 'review' }).returning();
        await db.insert(t.findings).values({
          reviewId: rv!.id, file: 'a.ts', startLine: 1, endLine: 1, severity: 'CRITICAL', category: 'bug', title: 't', rationale: 'r', confidence: 0.5,
        });
      };
      const own = await mkRun(wsId, new Date(NOW - 30 * 60_000));
      // A skill of another workspace recorded under this workspace's run must not be listed.
      await db.insert(t.runSkills).values([
        { runId: own.id, skillId: ownSkill, order: 0 },
        { runId: own.id, skillId: foreignSkill, order: 1 },
      ]);
      await db.insert(t.runTraces).values({ runId: own.id, trace: { memory_pulled: [{ text: 'own-mem', pr: null }] } });
      await mkFinding(wsId, own.id);
      // A run stamped with another workspace, but carrying this workspace's agent id,
      // older than everything and fully populated: it must change nothing.
      const foreign = await mkRun(foreignWs, new Date(NOW - 60 * DAY));
      await db.insert(t.runSkills).values({ runId: foreign.id, skillId: ownSkill, order: 0 });
      await db.insert(t.runTraces).values({ runId: foreign.id, trace: { memory_pulled: [{ text: 'foreign-mem', pr: 9 }] } });
      await mkFinding(foreignWs, foreign.id);
      const recent = await mkRun(foreignWs, new Date(NOW - 20 * 60_000));
      await db.insert(t.runSkills).values({ runId: recent.id, skillId: ownSkill, order: 0 });
      await db.insert(t.runTraces).values({ runId: recent.id, trace: { memory_pulled: [{ text: 'foreign-mem', pr: 9 }] } });
      await mkFinding(foreignWs, recent.id);
    });

    // a foreign run stamped with this agent's id adds no counts, skills, memory or findings
    it('a run of another workspace with this agent id contributes to no panel', async () => {
      const b = (await get(agentX, win30())).json();
      expect(b.counted_runs).toBe(1);
      expect(b.local_runs).toBe(1);
      expect(b.skills.rows.map((r: { name: string; runs: number }) => [r.name, r.runs])).toEqual([['OwnX', 1]]);
      expect(b.skills.denominator).toBe(1);
      expect(b.memory.rows).toEqual([{ text: 'own-mem', pr: null, runs: 1 }]);
      expect(b.memory.denominator).toBe(1);
      expect(b.findings.total).toBe(1);
      expect(b.findings.buckets.reduce((s: number, x: { critical: number }) => s + x.critical, 0)).toBe(1);
    });

    // a skill row of another workspace under this workspace's run is not listed
    it('a skill of another workspace recorded under our run is not listed (AC-12 scope)', async () => {
      const { skills } = (await get(agentX, win30())).json();
      expect(skills.rows.map((r: { name: string }) => r.name)).not.toContain('ForeignX');
    });

    // the 60-day-old foreign trace and skill run must not move either tracked-since date
    it('tracked-since dates ignore other workspaces runs', async () => {
      const b = (await get(agentS, win30())).json();
      expect(Date.parse(b.skills.tracked_since)).toBe(ago(5 * DAY).getTime());
      expect(Date.parse(b.memory.tracked_since)).toBe(ago(20 * DAY).getTime());
    });
  });
  // Last on purpose: it empties run_skills for the whole shared fixture.
  it('AC-9: no run in the workspace has run_skills — tracked since is null and the denominator is 0', async () => {
    await pg.handle.db.delete(t.runSkills);
    const body = (await get(agentS, win30())).json();
    expect(body.local_runs).toBeGreaterThan(0);
    expect(body.skills.tracked_since).toBeNull();
    expect(body.skills.denominator).toBe(0);
    expect(body.skills.rows).toEqual([]);
  });
});
