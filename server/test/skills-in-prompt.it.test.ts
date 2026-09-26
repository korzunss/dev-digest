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

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-in-prompt] Docker not available — skipping integration tests.');
}

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'Looks fine.',
  score: 90,
  findings: [],
};

/**
 * The end of the wire: an agent's attached skills reach the assembled prompt,
 * in the attached order, and the trace records what that block cost. This is
 * the half of the feature that was dead code before spec 003 — the slot existed
 * in reviewer-core and the panel existed in the drawer, but nothing passed
 * anything between them.
 */
d('skills reach the prompt', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let cloneDir: string;
  let prSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    // A stand-in working clone with real context documents on disk.
    cloneDir = await mkdtemp(path.join(tmpdir(), 'devdigest-ctx-'));
    await mkdir(path.join(cloneDir, 'specs'), { recursive: true });
    await mkdir(path.join(cloneDir, 'docs'), { recursive: true });
    await writeFile(
      path.join(cloneDir, 'specs', 'public-api.md'),
      '# Public API\n\nEvery route is versioned.',
    );
    await writeFile(
      path.join(cloneDir, 'docs', 'architecture.md'),
      '# Architecture\n\nOne module per feature.',
    );
  });
  afterAll(async () => {
    await pg?.stop();
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true });
  });

  /**
   * `MockGitClient.clonePathFor` points at `/mock/clones/...`, which does not
   * exist — fine for every test that does not read a file, wrong for the ones
   * that do. Shadow the method with our temp directory.
   */
  function gitAtClone() {
    const git = new MockGitClient({ diff: DIFF });
    git.clonePathFor = () => cloneDir;
    return git;
  }

  function makeApp(opts: { withClone?: boolean } = {}) {
    return buildApp({
      // Isolated from the developer's real secrets.json (spec 006 Option B) —
      // see server/test/helpers/config.ts.
      config: isolatedTestConfig(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: opts.withClone ? gitAtClone() : new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  /** A fresh repo+PR per run — MockForgeClient only ever lists PR #482. */
  async function setupPr() {
    const db = pg.handle.db;
    const name = `skills-repo-${prSeq++}`;
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

  type App = Awaited<ReturnType<typeof makeApp>>;

  async function makeAgent(app: App, name: string) {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      })
    ).json();
  }

  async function makeSkill(app: App, name: string, body: string) {
    return (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name, description: `What ${name} is for.`, type: 'custom', body },
      })
    ).json();
  }

  /**
   * Run one review and return its persisted trace.
   *
   * `waitForPrRuns` only waits for `agent_runs` to reach a terminal status, and
   * the trace document is written AFTER that — so reading the trace once races
   * the executor and fails only under load. Poll for the document itself.
   */
  async function readTrace(app: App, runId: string, timeoutMs = 10_000) {
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

  async function runAndReadTrace(app: App, prId: string, agentId: string) {
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${prId}/review`,
      payload: { agentId },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    return readTrace(app, runId);
  }

  it('assembles attached skills into the prompt in the attached order', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const agent = await makeAgent(app, 'Skilled Reviewer');
    const first = await makeSkill(app, 'alpha-rule', '# alpha\nAlways check alpha.');
    const second = await makeSkill(app, 'beta-rule', '# beta\nAlways check beta.');

    // Attached second-then-first on purpose: the assertion has to fail if the
    // executor sorts by anything other than the stored link order.
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [second.id, first.id] },
    });

    const trace = await runAndReadTrace(app, pr.id, agent.id);
    const block: string = trace.prompt_assembly.skills;

    expect(block).toContain('beta-rule');
    expect(block).toContain('alpha-rule');
    expect(block.indexOf('beta-rule')).toBeLessThan(block.indexOf('alpha-rule'));
    expect(block).toContain('Always check beta.');
    // The user message carries the section the model actually sees.
    expect(trace.prompt_assembly.user).toContain('## Skills / rules');
    // And the trace reports what the block cost.
    expect(trace.prompt_assembly.skills_tokens).toBeGreaterThan(0);

    await app.close();
  });

  it('a globally disabled skill drops out of the next run without being detached', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app, 'Toggle Reviewer');
    const kept = await makeSkill(app, 'kept-rule', '# kept\nStill applies.');
    const muted = await makeSkill(app, 'muted-rule', '# muted\nTurned off globally.');
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [kept.id, muted.id] },
    });

    await app.inject({ method: 'PUT', url: `/skills/${muted.id}`, payload: { enabled: false } });

    const trace = await runAndReadTrace(app, (await setupPr()).id, agent.id);
    expect(trace.prompt_assembly.skills).toContain('kept-rule');
    expect(trace.prompt_assembly.skills).not.toContain('Turned off globally.');

    // Still attached — the toggle is a mute, not a detach.
    const links = (
      await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })
    ).json();
    expect(links.map((l: { skill_id: string }) => l.skill_id)).toContain(muted.id);

    await app.close();
  });

  it('an agent with no skills produces no skills section at all', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app, 'Bare Reviewer');

    const trace = await runAndReadTrace(app, (await setupPr()).id, agent.id);
    // Absent, not an empty block — the drawer renders nothing for null.
    expect(trace.prompt_assembly.skills ?? null).toBeNull();
    expect(trace.prompt_assembly.skills_tokens ?? null).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## Skills / rules');

    await app.close();
  });

  it('a trace written before spec 003 still parses (skills_tokens is optional)', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app, 'Legacy Trace');
    const pr = await setupPr();
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    await readTrace(app, runId);

    // Rewrite THIS run's stored document as a pre-003 one: no skills_tokens key.
    const [row] = await pg.handle.db
      .select()
      .from(t.runTraces)
      .where(eq(t.runTraces.runId, runId));
    expect(row).toBeDefined();
    const doc = JSON.parse(JSON.stringify(row!.trace)) as {
      prompt_assembly: Record<string, unknown>;
    };
    delete doc.prompt_assembly.skills_tokens;
    await pg.handle.db
      .update(t.runTraces)
      .set({ trace: doc })
      .where(eq(t.runTraces.runId, runId));

    const trace = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
    expect(trace.statusCode).toBe(200);
    expect(trace.json().prompt_assembly.skills_tokens ?? null).toBeNull();

    await app.close();
  });

  it('records which skills the run pulled, in prompt order', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app, 'Recorded Reviewer');
    const first = await makeSkill(app, 'record-alpha', '# alpha');
    const second = await makeSkill(app, 'record-beta', '# beta');
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [second.id, first.id] },
    });

    const pr = await setupPr();
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    await readTrace(app, runId);

    const rows = await pg.handle.db
      .select()
      .from(t.runSkills)
      .where(eq(t.runSkills.runId, runId));
    const ordered = [...rows].sort((a, b) => a.order - b.order);
    expect(ordered.map((r) => r.skillId)).toEqual([second.id, first.id]);
    // Tokens are recorded per block so a skill's cost is attributable later.
    expect(ordered[0]!.tokens).toBeGreaterThan(0);
    await app.close();
  });

  it('a run that pulled no skill records no rows at all', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app, 'Skill-free Reviewer');
    const pr = await setupPr();
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    await readTrace(app, runId);

    const rows = await pg.handle.db
      .select()
      .from(t.runSkills)
      .where(eq(t.runSkills.runId, runId));
    expect(rows).toEqual([]);
    await app.close();
  });

  it('documents attached to a skill reach the prompt and the trace', async () => {
    const app = await makeApp({ withClone: true });
    const agent = await makeAgent(app, 'Context Reviewer');
    const skill = await makeSkill(app, 'context-carrier', '# rule\nApply the spec.');
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skill.id] },
    });
    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}/context`,
      payload: { paths: ['specs/public-api.md', 'docs/architecture.md'] },
    });

    const trace = await runAndReadTrace(app, (await setupPr()).id, agent.id);

    expect(trace.prompt_assembly.specs).toContain('Every route is versioned.');
    expect(trace.prompt_assembly.specs).toContain('One module per feature.');
    // The engine wraps each document as untrusted data — unlike a skill body,
    // a spec is not an instruction.
    expect(trace.prompt_assembly.specs).toContain('<untrusted source="spec-0">');
    expect(trace.prompt_assembly.user).toContain('## Project context');
    expect(trace.prompt_assembly.specs_tokens).toBeGreaterThan(0);
    expect(trace.specs_read).toEqual(['specs/public-api.md', 'docs/architecture.md']);
    await app.close();
  });

  it('an attached document missing from this repo is skipped, not fatal', async () => {
    const app = await makeApp({ withClone: true });
    const agent = await makeAgent(app, 'Tolerant Reviewer');
    const skill = await makeSkill(app, 'half-missing', '# rule');
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skill.id] },
    });
    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}/context`,
      payload: { paths: ['specs/public-api.md', 'specs/not-in-this-repo.md'] },
    });

    const trace = await runAndReadTrace(app, (await setupPr()).id, agent.id);

    // The run completed with what it could read.
    expect(trace.specs_read).toEqual(['specs/public-api.md']);
    const log = JSON.stringify(trace.log);
    expect(log).toContain('specs/not-in-this-repo.md');
    await app.close();
  });

  it('a stored path that escapes the clone is refused at read time', async () => {
    const app = await makeApp({ withClone: true });
    const agent = await makeAgent(app, 'Guarded Reviewer');
    const skill = await makeSkill(app, 'escaping-path', '# rule');
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skill.id] },
    });
    // A path is a request that was stored — it gets the same guard on the way
    // out as it would on the way in.
    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}/context`,
      payload: { paths: ['../../../etc/passwd'] },
    });

    const trace = await runAndReadTrace(app, (await setupPr()).id, agent.id);
    expect(trace.specs_read).toEqual([]);
    expect(trace.prompt_assembly.specs ?? null).toBeNull();
    await app.close();
  });

  it('an agent with no skills inherits no documents', async () => {
    const app = await makeApp({ withClone: true });
    const agent = await makeAgent(app, 'No Context Reviewer');
    const trace = await runAndReadTrace(app, (await setupPr()).id, agent.id);
    expect(trace.prompt_assembly.specs ?? null).toBeNull();
    expect(trace.specs_read).toEqual([]);
    await app.close();
  });

});
