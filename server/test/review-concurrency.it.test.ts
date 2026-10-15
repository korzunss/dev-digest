import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Review, StructuredRequest, StructuredResult } from '@devdigest/shared';
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
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;
const APPROVE: Review = { verdict: 'approve', summary: 'Fine.', score: 95, findings: [] };
const TERMINAL = new Set(['done', 'failed', 'cancelled']);

/**
 * Review calls stay pending until released. The PR-intent call (shared
 * preparation) is rejected at once, which never fails a run; a system prompt
 * containing `failMarker` is rejected at once as that one agent's failure.
 */
class GatedProvider extends DeferredLLMProvider {
  constructor(
    id: ConstructorParameters<typeof DeferredLLMProvider>[0],
    private failMarker?: string,
  ) {
    super(id);
  }
  override completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const system = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => String(m.content))
      .join('\n');
    if (system.includes('You classify the INTENT')) return Promise.reject(new Error('intent stubbed out'));
    if (this.failMarker && system.includes(this.failMarker)) {
      return Promise.reject(new Error('agent exploded: boom'));
    }
    return super.completeStructured(req);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

d('review runs execute with a concurrency limit (Testcontainers pg)', () => {
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

  async function setup(failMarker?: string) {
    const stubs = llmUnderEveryProvider((id) => new GatedProvider(id, failMarker));
    const git = new MockGitClient({ diff: DIFF });
    const app = await buildApp({
      config: isolatedTestConfig(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git, secrets: new MockSecretsProvider({}), llm: stubs },
    });
    const db = pg.handle.db;
    const name = `conc-repo-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
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
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    const all = Object.values(stubs);
    const pending = () => all.reduce((n, s) => n + s.pendingCount, 0);
    const runs = () => db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr!.id));
    const until = async (cond: () => boolean | Promise<boolean>, what: string, timeoutMs = 10_000) => {
      const start = Date.now();
      while (!(await cond())) {
        if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${what}`);
        await sleep(15);
      }
    };
    /** Release pending calls until every run is terminal. */
    const drain = async () => {
      await until(
        async () => {
          for (const s of all) s.release(APPROVE);
          const rows = await runs();
          return rows.length > 0 && rows.every((r) => TERMINAL.has(r.status ?? ''));
        },
        'all runs terminal',
      );
      return runs();
    };
    const runAll = async () => {
      const res = await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { all: true } });
      expect(res.statusCode).toBe(200);
      return res.json().runs as { run_id: string; agent_id: string }[];
    };
    return { app, git, pending, runs, until, drain, runAll };
  }

  it('runs at most 4 agents at once; the 5th starts when a slot frees (AC-25, AC-29) and prepares the diff once (AC-24)', async () => {
    const env = await setup();
    try {
      await env.runAll();
      await env.until(() => env.pending() >= 4, '4 pending review calls');
      await sleep(150);
      expect(env.pending()).toBe(4);
      expect(env.git.diffCommitsCalls).toHaveLength(1);

      // Free the 4 slots: the 5th agent's call arrives only now.
      const rows = await env.drain();
      expect(rows).toHaveLength(5);
      expect(rows.every((r) => r.status === 'done')).toBe(true);
      expect(env.git.diffCommitsCalls).toHaveLength(1);
      // Run-all stays unlinked from any multi-agent run (AC-8).
      expect(rows.every((r) => r.multiAgentRunId === null)).toBe(true);
    } finally {
      await env.app.close();
    }
  });

  it('one failing agent does not stop the others (AC-26, AC-28)', async () => {
    const env = await setup('application security engineer');
    try {
      await env.runAll();
      const rows = await env.drain();
      const failed = rows.filter((r) => r.status === 'failed');
      expect(failed).toHaveLength(1);
      expect(failed[0]!.error).toBeTruthy();
      expect(rows.filter((r) => r.status === 'done')).toHaveLength(4);
    } finally {
      await env.app.close();
    }
  });

  it('cancelling one run leaves the rest to finish (AC-26)', async () => {
    const env = await setup();
    try {
      const started = await env.runAll();
      await env.until(() => env.pending() >= 4, '4 pending review calls');
      const victim = started[0]!.run_id;
      const res = await env.app.inject({ method: 'POST', url: `/runs/${victim}/cancel` });
      expect(res.statusCode).toBeLessThan(300);
      const rows = await env.drain();
      expect(rows.find((r) => r.id === victim)!.status).toBe('cancelled');
      expect(rows.filter((r) => r.status === 'done')).toHaveLength(4);
    } finally {
      await env.app.close();
    }
  });
});
