import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { isolatedTestConfig } from './helpers/config.js';
import { buildApp } from '../src/app.js';
import { RunBus } from '../src/platform/sse.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';
import { loadRepoRules } from '../src/modules/reviews/repo-rules.js';

// Delegates to the real loader; one test makes it reject once to prove a load failure never fails the run.
vi.mock('../src/modules/reviews/repo-rules.js', async (importActual) => {
  const actual = await importActual<typeof import('../src/modules/reviews/repo-rules.js')>();
  return { ...actual, loadRepoRules: vi.fn(actual.loadRepoRules) };
});

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const BASE = 'b'.repeat(40);
const HEAD = 'c'.repeat(40);

const DIFF = `diff --git a/server/src/config.ts b/server/src/config.ts
--- a/server/src/config.ts
+++ b/server/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = { verdict: 'comment', summary: 'Looks fine.', score: 90, findings: [] };

/** Repo rules read at the base SHA reach the assembled prompt as untrusted context. */
d('repo rules reach the prompt', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeApp() {
    return buildApp({
      config: isolatedTestConfig(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({
          diff: DIFF,
          filesAt: {
            [`${BASE}:server/insights/gotchas.md`]:
              '# s\n\n## Tests\n- BASE_GOTCHA_TEXT keep it\n\n## Security\n- SECURITY_SECTION_TEXT\n',
            [`${HEAD}:server/AGENTS.md`]: '## Gotchas\n- HEAD_ONLY_TEXT',
          },
        }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  async function setupPr(baseSha: string | null) {
    const db = pg.handle.db;
    const name = `rules-repo-${prSeq++}`;
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
        headSha: HEAD,
        baseSha,
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'server/src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return pr!;
  }

  async function runAndReadTrace(prId: string) {
    const app = await makeApp();
    const created = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Rules Reviewer ${prSeq}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      })
    ).json();
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId: created.id } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    const start = Date.now();
    for (;;) {
      const tr = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
      if (tr.statusCode === 200 && tr.json()?.prompt_assembly) {
        await app.close();
        return tr.json();
      }
      if (Date.now() - start > 10_000) throw new Error(`trace for run ${runId} never appeared`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  it('puts base-SHA rules, the changed path and the guard in the user prompt', async () => {
    const pr = await setupPr(BASE);
    const trace = await runAndReadTrace(pr.id);
    const user: string = trace.prompt_assembly.user;
    expect(user).toContain('<untrusted source="repo-context">');
    expect(user).toContain('BASE_GOTCHA_TEXT');
    expect(user).toContain('server/src/config.ts');
    expect(user).toContain('Repo-rules rule:');
    expect(user).not.toContain('SECURITY_SECTION_TEXT');
    expect(user).not.toContain('HEAD_ONLY_TEXT');
    const msgs = (trace.log as { msg: string }[]).map((l) => l.msg);
    expect(msgs.some((m) => m.startsWith('repo rules: 1 file(s) from base bbbbbbb'))).toBe(true);
  });

  it('a null base sha completes with "repo rules: skipped"', async () => {
    const pr = await setupPr(null);
    const trace = await runAndReadTrace(pr.id);
    expect(trace.prompt_assembly.user).not.toContain('BASE_GOTCHA_TEXT');
    const msgs = (trace.log as { msg: string }[]).map((l) => l.msg);
    expect(msgs).toContain('repo rules: skipped (no base SHA)');
    expect(msgs.some((m) => m.includes('load failed'))).toBe(false);
  });

  // a throwing rules load must not fail the run: it completes, with no rules in the prompt
  it('a rules load failure completes the run without rule text and logs "load failed"', async () => {
    vi.mocked(loadRepoRules).mockRejectedValueOnce(new Error('git exploded'));
    const pr = await setupPr(BASE);
    const trace = await runAndReadTrace(pr.id);
    const user: string = trace.prompt_assembly.user;
    expect(user).not.toContain('BASE_GOTCHA_TEXT');
    expect(user).not.toContain('Rules from');
    expect(user).toContain('Files changed in this PR (1):');
    const msgs = (trace.log as { msg: string }[]).map((l) => l.msg);
    expect(msgs).toContain('repo rules: skipped (load failed)');
    const runs = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id));
    expect(runs.map((r) => r.status)).toEqual(['done']);
  });

  // one batch signal serves the whole pre-work, and it is the signal the rule-file reads receive
  it('creates one batch signal per run batch and hands it to every rule-file read', async () => {
    const batchSignals: AbortSignal[] = [];
    const real = RunBus.prototype.signalForAll;
    vi.spyOn(RunBus.prototype, 'signalForAll').mockImplementation(function (this: RunBus, ids: string[]) {
      const sig = real.call(this, ids);
      batchSignals.push(sig);
      return sig;
    });
    const readSignals: (AbortSignal | undefined)[] = [];
    const realRead = MockGitClient.prototype.readFileAt;
    vi.spyOn(MockGitClient.prototype, 'readFileAt').mockImplementation(async function (
      this: MockGitClient,
      r,
      ref,
      path,
      signal,
    ) {
      readSignals.push(signal);
      return realRead.call(this, r, ref, path, signal);
    });

    const pr = await setupPr(BASE);
    await runAndReadTrace(pr.id);

    expect(batchSignals).toHaveLength(1);
    expect(readSignals.length).toBeGreaterThan(0);
    expect(readSignals.every((s) => s instanceof AbortSignal)).toBe(true);
  });

  // cancelling the (only) run of the batch aborts the signal of the in-flight rule-file read
  it('cancelling the run aborts the in-flight rule-file read', async () => {
    let seen: AbortSignal | undefined;
    vi.spyOn(MockGitClient.prototype, 'readFileAt').mockImplementation(
      (_r, _ref, _path, signal) =>
        new Promise<string>((_res, rej) => {
          seen = signal;
          signal?.addEventListener('abort', () => rej(signal.reason), { once: true });
        }),
    );
    const pr = await setupPr(BASE);
    const app = await makeApp();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Cancel Reviewer ${prSeq}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      })
    ).json();
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    const runId = res.json().runs[0].run_id as string;

    const start = Date.now();
    while (!seen) {
      if (Date.now() - start > 10_000) throw new Error('rule-file read never started');
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(seen.aborted).toBe(false);
    const cancel = await app.inject({ method: 'POST', url: `/runs/${runId}/cancel` });
    expect(cancel.statusCode).toBeLessThan(300);
    expect(seen.aborted).toBe(true);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    await app.close();
  });
});
