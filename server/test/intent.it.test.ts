import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { isolatedTestConfig } from './helpers/config.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { IntentClassification } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[intent] Docker not available — skipping integration tests.');
}

/** The classifier's fixture output — confidence starts 'high'; capConfidence
 * (S9) lowers it once a linked source has failed. */
const CLASSIFICATION: IntentClassification = {
  intent: 'Add rate limiting to the public API endpoints',
  in_scope: ['Add limiter middleware'],
  out_of_scope: ['Auth changes'],
  confidence: 'high',
};

const PATCH_WITH_SECRET =
  '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

d('intent classification routes (spec 006 S11)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(opts: { llm?: MockLLMProvider; git?: MockGitClient } = {}) {
    return buildApp({
      config: isolatedTestConfig(),
      db: pg.handle.db,
      overrides: {
        git: opts.git ?? new MockGitClient(),
        llm: { openrouter: opts.llm ?? new MockLLMProvider('openai', { structured: CLASSIFICATION }) },
      },
    });
  }

  async function setupPr(opts: { body?: string; headSha?: string; withPatch?: boolean } = {}) {
    const db = pg.handle.db;
    const name = `intent-repo-${repoSeq++}`;
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
        headSha: opts.headSha ?? 'a1b2c3d4a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: opts.body ?? 'Add rate limiting.',
      })
      .returning();
    if (opts.withPatch !== false) {
      await db.insert(t.prFiles).values({
        prId: pr!.id,
        path: 'src/config.ts',
        additions: 1,
        deletions: 0,
        patch: PATCH_WITH_SECRET,
      });
    }
    return { repo: repo!, pr: pr! };
  }

  it('classifies, persists sources (title/description/file_list/linked_doc ok+failed), and re-classify refreshes classified_at (V3)', async () => {
    const app = await makeApp({
      git: new MockGitClient({ filesAt: { 'a1b2c3d4a1b2c3d4:docs/plans/x.md': '# The plan' } }),
    });
    const { pr } = await setupPr({
      body: 'Add rate limiting. See docs/plans/x.md and docs/plans/missing.md for the design.',
    });

    const first = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/classify` });
    expect(first.statusCode).toBe(200);
    const record = first.json();

    expect(record.intent).toBe(CLASSIFICATION.intent);
    expect(record.in_scope).toEqual(CLASSIFICATION.in_scope);

    const kinds = record.sources.map((s: { kind: string; status: string }) => `${s.kind}:${s.status}`);
    expect(kinds).toContain('pr_title:ok');
    expect(kinds).toContain('pr_description:ok');
    expect(kinds).toContain('file_list:ok');
    expect(kinds).toContain('linked_doc:ok');
    expect(kinds).toContain('linked_doc:failed');
    expect(
      record.missing_context.some((m: { ref: string }) => m.ref === 'docs/plans/missing.md'),
    ).toBe(true);

    await new Promise((r) => setTimeout(r, 5)); // ensure the clock actually advances
    const second = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/classify` });
    const record2 = second.json();
    expect(new Date(record2.classified_at).getTime()).toBeGreaterThan(
      new Date(record.classified_at).getTime(),
    );

    await app.close();
  });

  it('an empty PR body with no linked source caps confidence to low (AC6)', async () => {
    const app = await makeApp();
    const { pr } = await setupPr({ body: '' });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/classify` });
    expect(res.json().confidence).toBe('low');

    await app.close();
  });

  it('V6: a failed linked doc caps confidence at medium even when the model reports high', async () => {
    const app = await makeApp(); // no filesAt fixture → the doc read fails
    const { pr } = await setupPr({ body: 'Add rate limiting. See docs/plans/x.md for the design.' });

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/classify` });
    expect(res.json().confidence).toBe('medium');

    await app.close();
  });

  it('AC3: the classifier call carries the file path and the numeric hunk header, never the patch body', async () => {
    const llm = new MockLLMProvider('openai', { structured: CLASSIFICATION });
    const app = await makeApp({ llm });
    const { pr } = await setupPr();

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/classify` });

    const call = llm.calls.find(
      (c) => (c.req as { schemaName?: string }).schemaName === 'IntentClassification',
    );
    expect(call).toBeDefined();
    const text = JSON.stringify((call!.req as { messages: unknown }).messages);
    expect(text).toContain('src/config.ts');
    expect(text).toContain('@@ -10,3 +10,4 @@');
    expect(text).not.toContain('stripeKey');
    expect(text).not.toContain('sk_live_xxx');

    await app.close();
  });

  it('staleness: a moved head, then an unchanged-head body edit, are each detected and cleared by re-classify', async () => {
    const app = await makeApp();
    const { pr } = await setupPr({ headSha: 'aaaaaaaaaaaaaaaa' });

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/classify` });
    const fresh = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(fresh.json().intent.stale).toBe(false);

    await pg.handle.db
      .update(t.pullRequests)
      .set({ headSha: 'bbbbbbbbbbbbbbbb' })
      .where(eq(t.pullRequests.id, pr.id));
    const afterHeadMove = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(afterHeadMove.json().intent.stale).toBe(true);
    expect(afterHeadMove.json().intent.stale_reason).toBe('head_moved');

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/classify` });
    await pg.handle.db
      .update(t.pullRequests)
      .set({ body: 'A completely different description.' })
      .where(eq(t.pullRequests.id, pr.id));
    const afterBodyChange = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(afterBodyChange.json().intent.stale).toBe(true);
    expect(afterBodyChange.json().intent.stale_reason).toBe('description_changed');

    const reclassified = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent/classify` });
    expect(reclassified.json().stale).toBe(false);

    await app.close();
  });

  it('GET /pulls/:id/intent 404s for a PR belonging to another workspace (horizontal isolation)', async () => {
    const app = await makeApp();
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-${repoSeq++}` })
      .returning();
    const [otherRepo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: otherWs!.id, owner: 'other', name: 'secret', fullName: 'other/secret' })
      .returning();
    const [otherPr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: otherWs!.id,
        repoId: otherRepo!.id,
        number: 1,
        title: 'Other workspace PR',
        author: 'x',
        branch: 'b',
        base: 'main',
        headSha: 'cccccccccccccccc',
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'needs_review',
      })
      .returning();

    const res = await app.inject({ method: 'GET', url: `/pulls/${otherPr!.id}/intent` });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('AC10: the captured logger and structured log carry no secrets, tokens or raw content', async () => {
    const app = await makeApp({
      git: new MockGitClient({ filesAt: { 'a1b2c3d4a1b2c3d4:docs/plans/x.md': '# a secret plan body' } }),
    });
    const { pr } = await setupPr({
      body: 'Add rate limiting. See docs/plans/x.md?token=SECRETTOKEN for the design.',
    });

    const info = vi.fn();
    const warn = vi.fn();
    const onLog = vi.fn();
    await app.container.intent.classify(workspaceId, pr.id, { logger: { info, warn }, onLog });

    const allText = JSON.stringify([...info.mock.calls, ...warn.mock.calls, ...onLog.mock.calls]);
    expect(allText).not.toMatch(/Authorization/i);
    expect(allText).not.toContain('token=SECRETTOKEN');
    expect(allText).not.toContain('a secret plan body');
    expect(allText).not.toContain('sk_live_xxx');
    expect(allText).not.toContain('stripeKey');

    await app.close();
  });
});
