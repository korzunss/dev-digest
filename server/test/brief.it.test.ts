import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PrBriefModelOutput, PrBriefView } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { isolatedTestConfig } from './helpers/config.js';
import { DeferredLLMProvider, ThrowingLLMProvider, llmUnderEveryProvider, totalCalls } from './helpers/llm-stubs.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockForgeClient, MockGitClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[brief] Docker not available — skipping integration tests.');
}

/**
 * The PR Brief API end to end (spec 010): real Postgres, a stub model under
 * every provider id, an empty secrets provider (server/INSIGHTS.md 2026-09-26).
 */
const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  limit: 10,\n   redisUrl: x,';
const LIVE_TITLE = 'LIVE_FINDING_TITLE';
const DISMISSED_TITLE = 'DISMISSED_FINDING_TITLE';

const FIXTURE: PrBriefModelOutput = {
  summary: 'Adds a rate limit.',
  risks: [
    { kind: 'behaviour', title: 'Limit too low', explanation: 'May throttle users.', severity: 'medium', file_refs: ['src/config.ts', 'ghost.ts'] },
  ],
  review_focus: [
    { file: 'src/config.ts', line: 11, reason: 'The new limit' },
    { file: 'src/config.ts', line: 900, reason: 'Outside any hunk' },
  ],
};

type Stubs = ReturnType<typeof llmUnderEveryProvider<MockLLMProvider>>;
const goodStubs = (): Stubs =>
  llmUnderEveryProvider(
    (id) => new MockLLMProvider(id === 'anthropic' ? 'anthropic' : 'openai', { structuredBySchema: { pr_brief: FIXTURE } }),
  );

d('PR Brief routes (spec 010)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
  const apps: Array<{ close: () => Promise<unknown> }> = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  async function makeApp(llm?: Record<string, unknown>) {
    const app = await buildApp({
      config: isolatedTestConfig(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        forge: new MockForgeClient(),
        secrets: new MockSecretsProvider({}),
        ...(llm ? { llm: llm as never } : {}),
      },
    });
    apps.push(app);
    return app;
  }
  type App = Awaited<ReturnType<typeof makeApp>>;

  async function setupPr(opts: { body?: string } = {}) {
    const db = pg.handle.db;
    const name = `brief-repo-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 482,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: opts.body ?? 'Add rate limiting.',
      })
      .returning();
    await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0, patch: PATCH });
    return pr!;
  }

  async function seedReview(prId: string) {
    const db = pg.handle.db;
    const [review] = await db.insert(t.reviews).values({ workspaceId, prId, kind: 'review', verdict: 'comment', score: 80 }).returning();
    const base = { reviewId: review!.id, file: 'src/config.ts', startLine: 11, endLine: 11, severity: 'medium', category: 'bug', rationale: 'RATIONALE_TEXT', confidence: 0.9 };
    await db.insert(t.findings).values([
      { ...base, title: LIVE_TITLE },
      { ...base, title: DISMISSED_TITLE, dismissedAt: new Date() },
    ]);
  }

  const get = async (app: App, prId: string) =>
    (await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json() as PrBriefView;
  const post = async (app: App, prId: string) =>
    (await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` })).json() as PrBriefView;

  it('AC-43: GET before any generation is empty and never calls the model', async () => {
    const pr = await setupPr();
    const stubs = goodStubs();
    const app = await makeApp(stubs);
    const view = await get(app, pr.id);
    expect(view.brief).toBeNull();
    expect(view.generating).toBe(false);
    expect(view.failure).toBeNull();
    expect(totalCalls(stubs)).toBe(0);
  });

  it('AC-3/6/40/41: POST stores a grounded brief; a later GET serves it with no new call', async () => {
    const pr = await setupPr();
    await seedReview(pr.id);
    const stubs = goodStubs();
    const app = await makeApp(stubs);

    const view = await post(app, pr.id);
    expect(totalCalls(stubs)).toBe(1);
    expect(view.failure).toBeNull();
    expect(view.brief?.review_focus).toEqual([{ file: 'src/config.ts', line: 11, reason: 'The new limit' }]);
    expect(view.brief?.risks.risks[0]?.file_refs).toEqual(['src/config.ts']);

    const again = await get(app, pr.id);
    expect(totalCalls(stubs)).toBe(1);
    expect(again.brief?.head_sha).toBe(pr.headSha);
    expect(again.brief?.generated_at).toBeTruthy();
    expect(again.brief?.model.model).toBeTruthy();
    expect(again.stale).toBe(false);
    expect(view.brief?.usage).toMatchObject({ tokens_in: expect.any(Number), tokens_out: expect.any(Number) });
    expect(again.brief?.usage).toEqual(view.brief?.usage);
  });

  it('a stored current-shape row without usage still returns a brief', async () => {
    const pr = await setupPr();
    const view0 = await post(await makeApp(goodStubs()), pr.id);
    const { usage: _u, ...legacy } = view0.brief!;
    await pg.handle.db.update(t.prBrief).set({ json: legacy }).where(eq(t.prBrief.prId, pr.id));
    const view = await get(await makeApp(goodStubs()), pr.id);
    expect(view.brief).not.toBeNull();
    expect(view.brief?.usage).toBeUndefined();
  });

  it('AC-42: a moved head makes the stored brief stale', async () => {
    const pr = await setupPr();
    const app = await makeApp(goodStubs());
    await post(app, pr.id);
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'ffff0000ffff0000' }).where(eq(t.pullRequests.id, pr.id));
    expect((await get(app, pr.id)).stale).toBe(true);
  });

  it('AC-5: two parallel POSTs make one model call', async () => {
    const pr = await setupPr();
    const stubs = llmUnderEveryProvider((id) => new DeferredLLMProvider(id));
    const app = await makeApp(stubs);
    const first = app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    const waitUntil = Date.now() + 5000;
    while (totalCalls(stubs) === 0) {
      if (Date.now() > waitUntil) throw new Error('timed out waiting for the model call');
      await new Promise((r) => setTimeout(r, 10));
    }
    const second = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).json() as PrBriefView;
    expect(second.failure).toBe('in_progress');
    expect(second.generating).toBe(true);
    for (const s of Object.values(stubs)) s.release(FIXTURE);
    const done = (await first).json() as PrBriefView;
    expect(totalCalls(stubs)).toBe(1);
    expect(done.brief).not.toBeNull();
  });

  it('AC-8: no key configured is no_key with no model call', async () => {
    const pr = await setupPr();
    const app = await makeApp();
    const view = await post(app, pr.id);
    expect(view.failure).toBe('no_key');
    expect(view.brief).toBeNull();
  });

  it('AC-7: a failed regeneration keeps the stored brief and reports failed', async () => {
    const pr = await setupPr();
    const first = await post(await makeApp(goodStubs()), pr.id);
    const [before] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));

    const failing = llmUnderEveryProvider((id) => new ThrowingLLMProvider(new Error('upstream exploded'), id));
    const view = await post(await makeApp(failing), pr.id);
    const [after] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));

    expect(view.failure).toBe('failed');
    expect(view.brief).toEqual(first.brief);
    expect(after!.json).toEqual(before!.json);
  });

  it('AC-19/10: a dismissed finding and finding rationale never reach the model', async () => {
    const pr = await setupPr();
    await seedReview(pr.id);
    const stubs = goodStubs();
    await post(await makeApp(stubs), pr.id);
    const sent = JSON.stringify(Object.values(stubs).flatMap((s) => s.calls));
    expect(sent).toContain(LIVE_TITLE);
    expect(sent).not.toContain(DISMISSED_TITLE);
    expect(sent).not.toContain('RATIONALE_TEXT');
  });

  it('Y12: the brief records blast_radius as missing or partial when the index is absent', async () => {
    const pr = await setupPr();
    const view = await post(await makeApp(goodStubs()), pr.id);
    const entry = view.brief?.missing_inputs.find((m) => m.input === 'blast_radius');
    expect(entry && ['missing', 'partial']).toContain(entry?.status);
  });

  it('AC-12/45: a huge description is cut (truncated pr_description) and the call still succeeds', async () => {
    const pr = await setupPr({ body: 'alpha beta gamma '.repeat(15_000) });
    const stubs = goodStubs();
    const view = await post(await makeApp(stubs), pr.id);
    expect(totalCalls(stubs)).toBe(1);
    expect(view.failure).toBeNull();
    expect(view.brief?.missing_inputs).toContainEqual({ input: 'pr_description', status: 'truncated', ref: null, reason: null });
  });

  it('an old-shape stored row is served as no brief', async () => {
    const pr = await setupPr();
    await pg.handle.db.insert(t.prBrief).values({ prId: pr.id, json: { intent: {}, risks: { risks: [] } } });
    const view = await get(await makeApp(goodStubs()), pr.id);
    expect(view.brief).toBeNull();
    expect(view.stale).toBe(false);
  });

  it('an unknown PR is 404 on both routes', async () => {
    const app = await makeApp(goodStubs());
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/pulls/${id}/brief` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/pulls/${id}/brief` })).statusCode).toBe(404);
  });
  // a non-uuid id is rejected at the route (422) and never reaches the service or the model
  it('rejects a malformed PR id with 422 and no model call', async () => {
    const stubs = goodStubs();
    const app = await makeApp(stubs);
    for (const method of ['GET', 'POST'] as const) {
      const res = await app.inject({ method, url: '/pulls/not-a-uuid/brief' });
      expect(res.statusCode).toBe(422);
    }
    expect(totalCalls(stubs)).toBe(0);
  });

  // horizontal: another workspace's PR is a 404 on both routes, with no model call and nothing stored
  it('treats a PR of another workspace as not found, without a model call', async () => {
    const db = pg.handle.db;
    const [other] = await db.insert(t.workspaces).values({ name: `other-ws-${seq++}` }).returning();
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: other!.id, owner: 'evil', name: `r${seq}`, fullName: `evil/r${seq++}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({ workspaceId: other!.id, repoId: repo!.id, number: 1, title: 'x', author: 'a', branch: 'b', base: 'main', headSha: 'cafe', additions: 0, deletions: 0, filesCount: 0, status: 'needs_review' })
      .returning();
    const stubs = goodStubs();
    const app = await makeApp(stubs);
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr!.id}/brief` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/brief` })).statusCode).toBe(404);
    expect(totalCalls(stubs)).toBe(0);
    expect(await db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr!.id))).toHaveLength(0);
  });

  // a model that cites a path outside the PR keeps no such ref in the stored row
  it('never persists an invented path or line from the model', async () => {
    const pr = await setupPr();
    const evil = llmUnderEveryProvider(
      (id) =>
        new MockLLMProvider(id === 'anthropic' ? 'anthropic' : 'openai', {
          structuredBySchema: {
            pr_brief: {
              summary: 's',
              risks: [{ kind: 'k', title: 't', explanation: 'e', severity: 'low', file_refs: ['/etc/passwd', '../x'] }],
              review_focus: [{ file: 'src/config.ts', line: 9999, reason: 'r' }],
            },
          },
        }),
    );
    await post(await makeApp(evil), pr.id);
    const [row] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    const stored = row!.json as { risks: { risks: unknown[] }; review_focus: unknown[] };
    expect(stored.risks.risks).toEqual([]);
    expect(stored.review_focus).toEqual([]);
  });
});
