import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { isolatedTestConfig } from './helpers/config.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { IntentClassification, Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[intent-review] Docker not available — skipping integration tests.');
}

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const CLASSIFICATION: IntentClassification = {
  intent: 'Add rate limiting to the public API endpoints',
  in_scope: ['Add limiter middleware'],
  out_of_scope: ['Unrelated config nits'],
  confidence: 'high',
};

/** Two serious (CRITICAL/security) out-of-scope findings, both grounded on
 * line 11 — the scope filter (D6) must collapse them into exactly one. */
const REVIEW_WITH_SERIOUS_OOS = {
  verdict: 'request_changes',
  summary: 'x',
  score: 20,
  findings: [
    {
      id: 'oos-a',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Serious OOS finding A',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'grounded',
      confidence: 0.9,
      kind: 'finding',
      out_of_scope: true,
    },
    {
      id: 'oos-b',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Serious OOS finding B',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'grounded',
      confidence: 0.9,
      kind: 'finding',
      out_of_scope: true,
    },
  ],
};

const CLEAN_REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string, body = 'Add rate limiting.') {
  const name = `intent-review-repo-${repoSeq++}`;
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
      body,
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('intent injected into the review run (spec 006 S12)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(opts: {
    intentLlm?: MockLLMProvider;
    reviewFixture?: unknown;
    withOpenrouter?: boolean;
  } = {}) {
    return buildApp({
      config: isolatedTestConfig(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          openai: new MockLLMProvider('openai', { structured: opts.reviewFixture ?? CLEAN_REVIEW }),
          ...(opts.withOpenrouter === false
            ? {}
            : { openrouter: opts.intentLlm ?? new MockLLMProvider('openai', { structured: CLASSIFICATION }) }),
        },
      },
    });
  }

  async function readTrace(app: Awaited<ReturnType<typeof makeApp>>, runId: string, timeoutMs = 15_000) {
    const start = Date.now();
    for (;;) {
      const res = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
      if (res.statusCode === 200 && res.json()?.prompt_assembly) return res.json();
      if (Date.now() - start > timeoutMs) {
        throw new Error(`trace for run ${runId} never appeared (last status ${res.statusCode})`);
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  async function makeAgent(app: Awaited<ReturnType<typeof makeApp>>) {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
  }

  it('AC8/AC9: two LLM calls happen (IntentClassification then Review); the trace carries the intent + a collapsed serious-OOS finding', async () => {
    const intentLlm = new MockLLMProvider('openai', { structured: CLASSIFICATION });
    const app = await makeApp({ intentLlm, reviewFixture: REVIEW_WITH_SERIOUS_OOS });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await makeAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const trace = await readTrace(app, runId);

    expect(intentLlm.calls.map((c) => c.method)).toContain('completeStructured');
    const intentCall = intentLlm.calls.find(
      (c) => (c.req as { schemaName?: string }).schemaName === 'IntentClassification',
    );
    expect(intentCall).toBeDefined();

    expect(trace.prompt_assembly.intent).toContain('Add rate limiting to the public API endpoints');
    const logText = JSON.stringify(trace.log);
    expect(logText).toContain('Resolving PR intent');

    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    expect(reviews[0].findings).toHaveLength(1);
    expect(reviews[0].findings[0].title).toMatch(/^Out of scope: /);

    await app.close();
  });

  it('AC12: with no OpenRouter override, the review still completes and the prompt has no intent section', async () => {
    const app = await makeApp({ withOpenrouter: false });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await makeAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const trace = await readTrace(app, runId);

    expect(trace.prompt_assembly.intent ?? null).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## PR intent');
    const logText = JSON.stringify(trace.log);
    expect(logText).toContain('intent unavailable');

    await app.close();
  });

  it('V2: the run-log message text (not just structured data) names the classifier model, tokens and cost', async () => {
    const app = await makeApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await makeAgent(app);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const trace = await readTrace(app, runId);

    // RunLogger.logFor persists only {t, kind, msg} — the counts must be in
    // the message TEXT, not only in the `data` payload that pino/SSE see.
    const messages: string[] = trace.log.map((l: { msg: string }) => l.msg);
    expect(messages.some((m) => /intent: prompt composition/.test(m) && /model=/.test(m))).toBe(true);
    expect(messages.some((m) => /intent: classified/.test(m) && /tokens_in=/.test(m) && /cost=/.test(m))).toBe(
      true,
    );

    await app.close();
  });

  it('re-classifies only when the PR body changed (cache hit on an unchanged PR)', async () => {
    const intentLlm = new MockLLMProvider('openai', { structured: CLASSIFICATION });
    const app = await makeApp({ intentLlm });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await makeAgent(app);

    const run1 = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    await readTrace(app, run1);
    const classifyCallsAfterFirst = intentLlm.calls.filter(
      (c) => (c.req as { schemaName?: string }).schemaName === 'IntentClassification',
    ).length;
    expect(classifyCallsAfterFirst).toBe(1);

    // Second review, nothing changed — no new IntentClassification call.
    const run2 = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    await readTrace(app, run2);
    expect(
      intentLlm.calls.filter((c) => (c.req as { schemaName?: string }).schemaName === 'IntentClassification')
        .length,
    ).toBe(1);

    // Body changes with the same head — a THIRD review re-classifies.
    await pg.handle.db
      .update(t.pullRequests)
      .set({ body: 'Add rate limiting. Also touches retries.' })
      .where(eq(t.pullRequests.id, pr.id));
    const run3 = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 3 });
    await readTrace(app, run3);
    expect(
      intentLlm.calls.filter((c) => (c.req as { schemaName?: string }).schemaName === 'IntentClassification')
        .length,
    ).toBe(2);

    await app.close();
  });
});
