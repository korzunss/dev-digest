import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { DeferredLLMProvider, ScriptedLLMProvider, ThrowingLLMProvider } from './helpers/llm-stubs.js';
import { buildEvalApp, suiteCounts } from './helpers/eval-pipeline-env.js';
import { EXPECTED_NEW, EXPECTED_OLD, FIXTURE_CASES, FIXTURE_SCRIPTS, NEW_PROMPT, OLD_PROMPT } from './helpers/eval-pipeline-suite.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const NO_FINDINGS: Review = { verdict: 'approve', summary: 's', score: 100, findings: [] };
const GHOST = '00000000-0000-4000-8000-000000000000';

type App = Awaited<ReturnType<typeof buildEvalApp>>;

d('eval pipeline: suite runs, compare, promote (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: App;
  const scripted = new ScriptedLLMProvider(FIXTURE_SCRIPTS);
  const deferred = new DeferredLLMProvider('anthropic');
  const throwing = new ThrowingLLMProvider(new Error('401 bad key sk-abcdefghijklmnop'), 'openrouter');

  const json = async (req: Parameters<App['inject']>[0]) => {
    const res = await app.inject(req);
    return { status: res.statusCode, body: res.json() };
  };
  const mkAgent = async (provider: string, name: string, system_prompt: string) =>
    (await json({ method: 'POST', url: '/agents', payload: { name, provider, model: 'm', system_prompt } })).body.id as string;
  const addFixtureCases = async (agentId: string, n = FIXTURE_CASES.length) => {
    for (const c of FIXTURE_CASES.slice(0, n)) {
      const res = await app.inject({
        method: 'POST',
        url: `/agents/${agentId}/eval-cases`,
        payload: { name: c.name, input: { diff: c.diff }, expected_output: c.expected },
      });
      expect(res.statusCode, c.name).toBe(201);
    }
  };
  const startRun = (agentId: string) => json({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
  const getRun = async (id: string) => (await json({ method: 'GET', url: `/eval-runs/${id}` })).body;
  /** Poll until the run leaves `running`; throws on its own timeout. */
  const waitRun = async (id: string, timeoutMs = 15_000) => {
    const start = Date.now();
    for (;;) {
      const run = await getRun(id);
      if (run.status !== 'running') return run;
      if (Date.now() - start > timeoutMs) throw new Error(`suite run ${id} still running after ${timeoutMs} ms`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  const runToEnd = async (agentId: string) => {
    const started = await startRun(agentId);
    expect(started.status).toBe(202);
    expect(started.body.status).toBe('running');
    return waitRun(started.body.id);
  };

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
    app = await buildEvalApp(pg, { openai: scripted, anthropic: deferred, openrouter: throwing });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  // The agent whose history the next tests build on (state is shared on purpose).
  let agentId: string;
  let run1: string;
  let run2: string;
  let run3: string;
  let skillId: string;

  it('records version, model and skills on a suite run and scores old/new prompts differently (AC-30, 31, 62 #3, 37)', async () => {
    agentId = await mkAgent('openai', 'History Agent', OLD_PROMPT);
    await addFixtureCases(agentId);
    const started = await startRun(agentId);
    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({
      status: 'running',
      agent_version: 1,
      provider: 'openai',
      model: 'm',
      skills: [],
      cases_total: 8,
    });
    run1 = started.body.id;
    const done = await waitRun(run1);
    expect(done).toMatchObject({ status: 'completed', cases_done: 8, cases_passed: EXPECTED_OLD.passed, cases_errored: 0 });
    expect(done.metrics.recall).toBeCloseTo(EXPECTED_OLD.recall);
    expect(done.metrics.precision).toBeCloseTo(EXPECTED_OLD.precision);
    expect(done.metrics.citation_accuracy).toBeLessThan(1);
    expect(done.cost_usd).toBeCloseTo(0.008);
    expect(done.results).toHaveLength(8);
    expect(scripted.calls).toHaveLength(8); // one model call per case, scoring adds none
  });

  it('a second run with the new prompt scores higher, and the detail shows deltas and trend (AC-47, 62 #3)', async () => {
    await json({ method: 'PUT', url: `/agents/${agentId}`, payload: { system_prompt: NEW_PROMPT } });
    const done = await runToEnd(agentId);
    run2 = done.id;
    expect(done).toMatchObject({ agent_version: 2, cases_passed: EXPECTED_NEW.passed });
    expect(done.metrics).toEqual({ recall: 1, precision: 1, citation_accuracy: 1 });

    const detail = (await json({ method: 'GET', url: `/agents/${agentId}/eval?period=all` })).body;
    expect(detail).toMatchObject({ cases_total: 8, runs_total: 2, alert: null });
    expect(detail.latest.id).toBe(run2);
    expect(detail.deltas.recall).toBeCloseTo(1 - EXPECTED_OLD.recall);
    expect(detail.trend.map((p: { run_id: string }) => p.run_id)).toEqual([run1, run2]);
    expect((await json({ method: 'GET', url: `/agents/${agentId}/eval?period=bogus` })).status).toBe(422);
  });

  it('sets each case\'s last_result to the suite run\'s result, so the passing count follows it (AC-19, AC-20)', async () => {
    const run = await getRun(run2);
    const cases = (await json({ method: 'GET', url: `/agents/${agentId}/eval-cases` })).body as {
      id: string;
      last_result: { status: string } | null;
    }[];
    expect(cases).toHaveLength(8);
    for (const c of cases) {
      const entry = run.results.find((r: { case_id: string }) => r.case_id === c.id);
      expect(entry).toBeDefined();
      expect(c.last_result).not.toBeNull();
      expect(c.last_result).toEqual(entry.result);
    }
    expect(cases.filter((c) => c.last_result?.status === 'passed')).toHaveLength(EXPECTED_NEW.passed);
    expect(run.cases_passed).toBe(EXPECTED_NEW.passed);
  });

  it('records the attached skills on a run and sends their bodies to the model (AC-75)', async () => {
    const skill = await json({
      method: 'POST',
      url: '/skills',
      payload: { name: 'eval-skill', description: 'd', type: 'custom', body: 'SKILL-BODY-XYZ' },
    });
    expect(skill.status).toBe(201);
    skillId = skill.body.id;
    const set = await json({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_ids: [skillId] } });
    expect(set.status).toBeLessThan(300);

    const done = await runToEnd(agentId);
    run3 = done.id;
    expect(done.skills.map((s: { id: string }) => s.id)).toEqual([skillId]);
    expect(JSON.stringify(scripted.lastRequest?.messages)).toContain('SKILL-BODY-XYZ');
  });

  it('compares two runs in time order with prompt and skill diffs (AC-52, 53, 54)', async () => {
    const swapped = await json({ method: 'GET', url: `/eval-runs/compare?a=${run2}&b=${run1}` });
    expect(swapped.status).toBe(200);
    expect(swapped.body.older.id).toBe(run1);
    expect(swapped.body.newer.id).toBe(run2);
    expect(swapped.body.same_version).toBe(false);
    expect(swapped.body.prompt_diff.some((l: { op: string }) => l.op !== 'same')).toBe(true);

    const withSkill = (await json({ method: 'GET', url: `/eval-runs/compare?a=${run2}&b=${run3}` })).body;
    expect(withSkill.same_skills).toBe(false);
    expect(withSkill.skills_diff.added.map((s: { id: string }) => s.id)).toEqual([skillId]);

    expect((await json({ method: 'GET', url: `/eval-runs/compare?a=${run1}&b=${run1}` })).body.error.code).toBe('runs_not_comparable');
    expect((await json({ method: 'GET', url: `/eval-runs/compare?a=${run1}&b=${GHOST}` })).status).toBe(404);
  });

  it('promotes an older version as a NEW version, restoring its prompt and skill set (AC-56, 75, 80)', async () => {
    const before = (await json({ method: 'GET', url: `/agents/${agentId}/versions` })).body;
    const current = (await json({ method: 'GET', url: `/agents/${agentId}` })).body.version as number;

    const promoted = await json({ method: 'POST', url: `/eval-runs/${run1}/promote` });
    expect(promoted.status).toBe(200);
    expect(promoted.body).toMatchObject({ agent_id: agentId, version: current + 1 });

    const agent = (await json({ method: 'GET', url: `/agents/${agentId}` })).body;
    expect(agent.system_prompt).toBe(OLD_PROMPT);
    expect((await json({ method: 'GET', url: `/agents/${agentId}/skills` })).body).toHaveLength(0);
    const after = (await json({ method: 'GET', url: `/agents/${agentId}/versions` })).body;
    expect(after).toHaveLength(before.length + 1); // past versions are kept

    // The compare now offers promote for a run of an older version than the current one.
    const cmp = (await json({ method: 'GET', url: `/eval-runs/compare?a=${run2}&b=${run3}` })).body;
    expect(cmp.promote).toMatchObject({ version: expect.any(Number) });
    expect(cmp.promote.restore.map((s: { id: string }) => s.id)).toEqual([skillId]);
  });

  it('refuses a promote whose stored config is gone (AC-57)', async () => {
    await pg.handle.db
      .delete(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, 1)));
    const res = await json({ method: 'POST', url: `/eval-runs/${run1}/promote` });
    expect([res.status, res.body.error.code]).toEqual([422, 'version_config_missing']);
  });

  it('keeps past metrics when a case is deleted, but drops its per-case results (AC-21)', async () => {
    const cases = (await json({ method: 'GET', url: `/agents/${agentId}/eval-cases` })).body;
    const victim = cases[0].id as string;
    const before = await getRun(run2);
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${victim}` })).statusCode).toBe(204);
    const after = await getRun(run2);
    expect(after.metrics).toEqual(before.metrics);
    expect(after.cases_total).toBe(before.cases_total);
    expect(after.results.length).toBe(before.results.length - 1);
  });

  it('keeps the review-eval CLI tables apart from the suite (AC-1, 2)', async () => {
    const { db } = pg.handle;
    const [legacy] = await db
      .insert(t.evalCases)
      .values({ workspaceId, ownerKind: 'agent', ownerId: agentId, name: 'planted-fixture', inputDiff: 'x', expectedOutput: {} })
      .returning();
    await db.insert(t.evalRuns).values({ caseId: legacy!.id, pass: true, recall: 1, precision: 1 });
    const legacyBefore = [(await db.select().from(t.evalCases)).length, (await db.select().from(t.evalRuns)).length];

    const listed = (await json({ method: 'GET', url: `/agents/${agentId}/eval-cases` })).body;
    expect(listed.some((c: { name: string }) => c.name === 'planted-fixture')).toBe(false);
    await runToEnd(agentId);
    expect([(await db.select().from(t.evalCases)).length, (await db.select().from(t.evalRuns)).length]).toEqual(legacyBefore);
  });

  it('turns a failing model into errored cases and a failed run with no metrics (AC-32)', async () => {
    const id = await mkAgent('openrouter', 'Failing Agent', 'FAIL-PROMPT');
    await addFixtureCases(id, 3);
    const done = await runToEnd(id);
    expect(done).toMatchObject({ status: 'failed', cases_errored: 3, cases_passed: 0, cases_done: 3 });
    expect(done.metrics).toEqual({ recall: null, precision: null, citation_accuracy: null });
    expect(done.results[0].result.status).toBe('errored');
    expect(done.results[0].result.error).not.toContain('sk-abcdefghijklmnop');
    expect(throwing.calls).toHaveLength(3);
  });

  it('refuses an empty suite and creates no run (AC-36)', async () => {
    const id = await mkAgent('openai', 'Empty Agent', OLD_PROMPT);
    const before = await suiteCounts(pg.handle.db);
    const res = await startRun(id);
    expect([res.status, res.body.error.code]).toEqual([422, 'suite_empty']);
    expect(await suiteCounts(pg.handle.db)).toEqual(before);
    expect((await startRun(GHOST)).status).toBe(404);
  });

  it('refuses a second start while a run is in progress and skips it in run-all (AC-34, 35)', async () => {
    const id = await mkAgent('anthropic', 'Slow Agent', 'SLOW-PROMPT');
    await addFixtureCases(id, 2);
    const first = await startRun(id);
    expect(first.status).toBe(202);

    const second = await startRun(id);
    expect([second.status, second.body.error.code]).toEqual([409, 'run_in_progress']);
    expect((await json({ method: 'GET', url: `/agents/${id}/eval` })).body.runs[0]).toMatchObject({ status: 'running' });

    const preview = (await json({ method: 'GET', url: '/eval/run-all' })).body;
    expect(preview.skipped).toContainEqual({ agent_id: id, name: 'Slow Agent', provider: 'anthropic', reason: 'run_in_progress' });
    expect(preview.agents.map((a: { agent_id: string }) => a.agent_id)).not.toContain(id);

    const all = (await json({ method: 'POST', url: '/eval/run-all', payload: { confirm: true } })).body;
    expect(all.skipped).toContainEqual({ agent_id: id, name: 'Slow Agent', provider: 'anthropic', reason: 'run_in_progress' });
    expect(all.started.map((s: { agent_id: string }) => s.agent_id)).toContain(agentId);

    // Let the slow run finish; the guard is released afterwards.
    const start = Date.now();
    while (deferred.pendingCount === 0) {
      if (Date.now() - start > 10_000) throw new Error('the slow run never called the model');
      await new Promise((r) => setTimeout(r, 25));
    }
    deferred.release(NO_FINDINGS);
    const done = await waitRun(first.body.id);
    expect(done.status).toBe('completed');
    const again = await startRun(id);
    expect(again.status).toBe(202);
    const pendingStart = Date.now();
    while (deferred.pendingCount === 0 && Date.now() - pendingStart < 10_000) await new Promise((r) => setTimeout(r, 25));
    deferred.release(NO_FINDINGS);
    await waitRun(again.body.id);
    // run-all started the other agents too: wait for them so nothing is left running.
    for (const s of all.started as { run_id: string }[]) await waitRun(s.run_id);
  });

  it('records a result with a null case_id when its case is deleted mid-run, and the run completes (PR2)', async () => {
    const id = await mkAgent('anthropic', 'Mid-run Delete Agent', 'DELETE-PROMPT');
    await addFixtureCases(id, 2);
    const cases = (await json({ method: 'GET', url: `/agents/${id}/eval-cases` })).body as { id: string; name: string }[];
    const started = await startRun(id);
    expect(started.status).toBe(202);
    const start = Date.now();
    while (deferred.pendingCount === 0) {
      if (Date.now() - start > 10_000) throw new Error('the run never called the model');
      await new Promise((r) => setTimeout(r, 25));
    }
    const victim = cases[0]!;
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${victim.id}` })).statusCode).toBe(204);
    // Release every held call until the run leaves `running`.
    const runStart = Date.now();
    for (;;) {
      deferred.release(NO_FINDINGS);
      if ((await getRun(started.body.id)).status !== 'running') break;
      if (Date.now() - runStart > 15_000) throw new Error('the run never finished');
      await new Promise((r) => setTimeout(r, 25));
    }
    const done = await getRun(started.body.id);
    expect(done.status).toBe('completed');
    const rows = await pg.handle.db
      .select()
      .from(t.evalCaseResults)
      .where(eq(t.evalCaseResults.suiteRunId, started.body.id));
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.caseId === null).map((r) => r.caseName)).toEqual([victim.name]);
    const after = (await json({ method: 'GET', url: `/agents/${id}/eval-cases` })).body as {
      id: string;
      last_result: unknown;
    }[];
    expect(after.map((c) => c.id)).not.toContain(victim.id);
    const survivor = rows.find((r) => r.caseId === cases[1]!.id);
    expect(survivor).toBeDefined();
    expect(after.find((c) => c.id === cases[1]!.id)?.last_result).toEqual(survivor!.result);
  });

  // SF1: "Run all agents" is paid and has no id, so a cross-origin no-cors POST must not start it.
  it('refuses a bodyless or non-JSON POST to run-all and starts nothing', async () => {
    const before = await suiteCounts(pg.handle.db);
    const attempts = [
      { method: 'POST' as const, url: '/eval/run-all' },
      { method: 'POST' as const, url: '/eval/run-all', headers: { 'content-type': 'text/plain' }, payload: '{"confirm":true}' },
      { method: 'POST' as const, url: '/eval/run-all', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'confirm=true' },
      { method: 'POST' as const, url: '/eval/run-all', payload: {} },
      { method: 'POST' as const, url: '/eval/run-all', payload: { confirm: false } },
    ];
    for (const req of attempts) {
      const res = await app.inject(req);
      expect(res.statusCode, JSON.stringify(req)).toBeGreaterThanOrEqual(400);
      expect(res.statusCode, JSON.stringify(req)).toBeLessThan(500);
    }
    expect(await suiteCounts(pg.handle.db)).toEqual(before);
  });

  it('lists the 20 newest runs, newest first, and never-run agents last (AC-61)', async () => {
    const { db } = pg.handle;
    const id = await mkAgent('openai', 'Busy Agent', OLD_PROMPT);
    const base = Date.now() + 3_600_000;
    await db.insert(t.evalSuiteRuns).values(
      Array.from({ length: 25 }, (_, i) => ({
        workspaceId,
        agentId: id,
        agentVersion: 1,
        provider: 'openai',
        model: 'm',
        skills: [],
        status: 'completed' as const,
        startedAt: new Date(base + i * 1000),
        casesTotal: 1,
        casesDone: 1,
        casesPassed: 1,
        recall: 1,
        precision: 1,
        citationAccuracy: 1,
      })),
    );
    const view = (await json({ method: 'GET', url: '/eval/dashboard' })).body;
    expect(view.recent_runs).toHaveLength(20);
    const times = view.recent_runs.map((r: { started_at: string }) => Date.parse(r.started_at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(view.agents[0].agent_id).toBe(id);
    const never = view.agents.filter((a: { latest: unknown }) => a.latest === null);
    expect(view.agents.slice(-never.length).every((a: { latest: unknown }) => a.latest === null)).toBe(true);
  });

  it('marks a run left running by a dead process as failed on boot, and nothing else (AC-31)', async () => {
    const { db } = pg.handle;
    const id = await mkAgent('openai', 'Orphan Agent', OLD_PROMPT);
    const [stale] = await db
      .insert(t.evalSuiteRuns)
      .values({ workspaceId, agentId: id, agentVersion: 1, provider: 'openai', model: 'm', skills: [], status: 'running', casesTotal: 4 })
      .returning();
    const [finished] = await db
      .insert(t.evalSuiteRuns)
      .values({ workspaceId, agentId: id, agentVersion: 1, provider: 'openai', model: 'm', skills: [], status: 'completed', casesTotal: 1 })
      .returning();

    const second = await buildEvalApp(pg, {});
    await second.close();

    const rows = await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, id));
    expect(rows.find((r) => r.id === stale!.id)!.status).toBe('failed');
    expect(rows.find((r) => r.id === finished!.id)!.status).toBe('completed');
  });
});
