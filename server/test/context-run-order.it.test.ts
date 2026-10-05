import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { isolatedTestConfig } from './helpers/config.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = { verdict: 'comment', summary: 'Fine.', score: 90, findings: [] };

/**
 * What the run executor does with the attachments it merges: the order across
 * an agent's own documents and SEVERAL skills, and that the repo's own search
 * roots (not the defaults) decide at run time what is read or skipped.
 */
d('run executor — project-context merge order and skip reasons', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let cloneDir: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    cloneDir = await mkdtemp(path.join(tmpdir(), 'devdigest-order-'));
    await mkdir(path.join(cloneDir, 'specs'), { recursive: true });
    await mkdir(path.join(cloneDir, 'docs'), { recursive: true });
    await writeFile(path.join(cloneDir, 'specs', 'first.md'), '# First');
    await writeFile(path.join(cloneDir, 'specs', 'second.md'), '# Second');
    await writeFile(path.join(cloneDir, 'docs', 'own.md'), '# Own');
    await writeFile(path.join(cloneDir, 'docs', 'shared.md'), '# Shared');
  });
  afterAll(async () => {
    await pg?.stop();
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true });
  });

  function makeApp() {
    const git = new MockGitClient({ diff: DIFF });
    git.clonePathFor = () => cloneDir;
    return buildApp({
      config: isolatedTestConfig(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git,
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }
  type App = Awaited<ReturnType<typeof makeApp>>;

  async function setupPr(contextGlobs?: string[]) {
    const db = pg.handle.db;
    const name = `order-repo-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        ...(contextGlobs ? { contextGlobs } : {}),
      })
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
        headSha: 'a1b2c3d4',
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
    return pr!;
  }

  const post = async (app: App, url: string, payload: unknown) =>
    (await app.inject({ method: 'POST', url, payload })).json();
  const put = (app: App, url: string, payload: unknown) =>
    app.inject({ method: 'PUT', url, payload });

  const makeAgent = (app: App, name: string) =>
    post(app, '/agents', { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' });
  const makeSkill = (app: App, name: string) =>
    post(app, '/skills', { name, description: `What ${name} is for.`, type: 'custom', body: '# rule' });

  async function runAndReadTrace(app: App, prId: string, agentId: string) {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    const start = Date.now();
    for (;;) {
      const tr = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
      if (tr.statusCode === 200 && tr.json()?.prompt_assembly) {
        const [row] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
        return { trace: tr.json(), status: row!.status };
      }
      if (Date.now() - start > 10_000) throw new Error(`trace for run ${runId} never appeared`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  // own docs first, then skill 1's, then skill 2's (doc order within each); a repeat keeps its first slot
  it('orders own documents, then each skill in attach order, de-duplicated', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app, 'Order Reviewer');
    const s1 = await makeSkill(app, 'order-skill-1');
    const s2 = await makeSkill(app, 'order-skill-2');
    await post(app, `/agents/${agent.id}/skills`, { skill_ids: [s1.id, s2.id] });
    await put(app, `/skills/${s1.id}/context`, { paths: ['specs/first.md', 'docs/shared.md'] });
    await put(app, `/skills/${s2.id}/context`, { paths: ['specs/second.md', 'docs/shared.md'] });
    await put(app, `/agents/${agent.id}/context`, { paths: ['docs/own.md', 'docs/shared.md'] });

    const { trace } = await runAndReadTrace(app, (await setupPr()).id, agent.id);

    expect(trace.specs_read).toEqual([
      'docs/own.md',
      'docs/shared.md',
      'specs/first.md',
      'specs/second.md',
    ]);
    // the prompt carries them in that same order
    const spec: string = trace.prompt_assembly.specs;
    const at = (p: string) => spec.indexOf(`<untrusted source="${p}">`);
    expect(at('docs/own.md')).toBeGreaterThanOrEqual(0);
    expect(at('docs/own.md')).toBeLessThan(at('docs/shared.md'));
    expect(at('docs/shared.md')).toBeLessThan(at('specs/first.md'));
    expect(at('specs/first.md')).toBeLessThan(at('specs/second.md'));
    await app.close();
  });

  // the repo's own roots decide at run time: a default-root file outside a custom root is skipped, run still succeeds
  it('applies the repo custom search roots at run time and the run still completes', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app, 'Roots Reviewer');
    await put(app, `/agents/${agent.id}/context`, { paths: ['specs/first.md', 'docs/own.md'] });

    const { trace, status } = await runAndReadTrace(app, (await setupPr(['docs/**/*.md'])).id, agent.id);

    expect(status).toBe('done');
    expect(trace.specs_read).toEqual(['docs/own.md']);
    expect(trace.specs_skipped).toEqual([{ path: 'specs/first.md', reason: 'outside_search_roots' }]);
    expect(JSON.stringify(trace.log)).toContain('specs/first.md (outside_search_roots)');
    expect(trace.prompt_assembly.specs).not.toContain('# First');
    await app.close();
  });
});
