import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { isolatedTestConfig } from './helpers/config.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { LlmOutputTruncatedError } from '@devdigest/reviewer-core';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** Poll until `cond` holds; throws on timeout (waitForPrRuns returns silently). */
async function until(cond: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Review calls (schemaName 'Review') are handled by `onReview`; anything else gets a rejection. */
function provider(
  onReview: <T>(req: StructuredRequest<T>) => Promise<StructuredResult<T>>,
): LLMProvider {
  return {
    id: 'openai',
    listModels: async () => [],
    complete: async () => {
      throw new Error('complete not expected');
    },
    completeStructured: async <T>(req: StructuredRequest<T>) => {
      if (req.schemaName === 'Review') return onReview(req);
      throw new Error('unexpected structured call');
    },
    embed: async () => [],
  };
}

d('run cancel + truncation (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function setup(llm: LLMProvider) {
    const app = await buildApp({
      config: isolatedTestConfig(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
      },
    });
    const db = pg.handle.db;
    const name = `cancel-api-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'T',
        author: 'a',
        branch: 'feat/x',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'b',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr!.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    return { app, prId: pr!.id, runId: res.json().runs[0].run_id as string };
  }

  it('POST /runs/:id/cancel aborts the in-flight call and the run ends cancelled', async () => {
    let seen: AbortSignal | undefined;
    const llm = provider(
      <T>(req: StructuredRequest<T>) =>
        new Promise<StructuredResult<T>>((_, reject) => {
          seen = req.signal;
          req.signal?.addEventListener('abort', () => reject({ name: 'AbortError' }));
        }),
    );
    const { app, prId, runId } = await setup(llm);
    await until(() => seen !== undefined, 'the review call to start');

    const cancelRes = await app.inject({ method: 'POST', url: `/runs/${runId}/cancel` });
    expect(cancelRes.statusCode).toBeLessThan(300);
    await until(() => seen!.aborted, 'the signal to abort', 2_000);

    await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('cancelled');
    await app.close();
  });

  it('an output-truncated call fails the run with the cap in the error', async () => {
    let calls = 0;
    const llm = provider(async () => {
      calls++;
      throw new LlmOutputTruncatedError('gpt-4.1', 32_000, 32_000);
    });
    const { app, prId, runId } = await setup(llm);
    await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('failed');
    expect(run!.error).toContain('output cap');
    // single-pass: retried once, never skipped
    expect(calls).toBe(2);
    await app.close();
  });
});
