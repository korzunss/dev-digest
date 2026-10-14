import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { EvalExpectation, Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { DeferredLLMProvider, ScriptedLLMProvider } from './helpers/llm-stubs.js';
import { PR_DIFF, attachSkill, buildEvalApp, insertSkill, suiteCounts } from './helpers/eval-pipeline-env.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const FOUND: Review = {
  verdict: 'request_changes',
  summary: 's',
  score: 50,
  findings: [
    {
      id: 'x',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'r',
      confidence: 0.9,
      kind: 'finding',
    },
  ],
};
const NOTHING: Review = { verdict: 'approve', summary: 's', score: 100, findings: [] };

const mustFind: EvalExpectation = { expect: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11 };
const GHOST = '00000000-0000-4000-8000-000000000000';
const OPENAI = { provider: 'openai', model: 'gpt-test' } as const;

type App = Awaited<ReturnType<typeof buildEvalApp>>;

d('eval pipeline: skill suite runs and Run on evals (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: App;
  const scripted = new ScriptedLLMProvider([{ match: 'RUNS-AGENT', review: FOUND }, { match: 'using only the skill', review: FOUND }]);
  const deferred = new DeferredLLMProvider('anthropic');

  const json = async (req: Parameters<App['inject']>[0]) => {
    const res = await app.inject(req);
    return { status: res.statusCode, body: res.json() };
  };
  const mkSkill = (name: string, enabled = true) => insertSkill(pg.handle.db, workspaceId, { name, enabled });
  const mkAgent = async (name: string, provider = 'openai') =>
    (
      await json({
        method: 'POST',
        url: '/agents',
        payload: { name, provider, model: 'agent-model', system_prompt: 'RUNS-AGENT prompt' },
      })
    ).body.id as string;
  const addCase = async (url: string, name: string, expected: unknown = [mustFind]) => {
    const res = await json({ method: 'POST', url, payload: { name, input: { diff: PR_DIFF }, expected_output: expected } });
    expect(res.status, name).toBe(201);
    return res.body as { id: string };
  };
  const skillCase = (skillId: string, name: string) => addCase(`/skills/${skillId}/eval-cases`, name);
  const startRun = (skillId: string, pick: object = OPENAI) =>
    json({ method: 'POST', url: `/skills/${skillId}/eval-runs`, payload: { ...pick, confirm: true } });
  const state = async (skillId: string) => (await json({ method: 'GET', url: `/skills/${skillId}/eval-run` })).body;
  const until = async (what: string, ok: () => Promise<boolean> | boolean, timeoutMs = 15_000) => {
    const start = Date.now();
    while (!(await ok())) {
      if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${what}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  const waitIdle = (skillId: string) => until('suite run end', async () => (await state(skillId)).progress === null);
  const results = async (skillId: string) =>
    (await json({ method: 'GET', url: `/skills/${skillId}/eval-cases` })).body as {
      name: string;
      last_result: { status: string; skill_version: number; model: string } | null;
    }[];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
    app = await buildEvalApp(pg, { openai: scripted, anthropic: deferred });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('runs the whole suite on a pick, stores results on the cases and creates no run row (AC-62 #10, 87, 88, 90)', async () => {
    const skillId = await mkSkill('Suite Skill');
    await skillCase(skillId, 'one');
    await skillCase(skillId, 'two');
    const before = await suiteCounts(pg.handle.db);

    const started = await startRun(skillId);
    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({ skill: { id: skillId, version: 1, enabled: true }, progress: { total: 2 } });
    await waitIdle(skillId);

    const rows = await results(skillId);
    expect(rows.map((r) => r.last_result?.status)).toEqual(['passed', 'passed']);
    expect(rows[0]!.last_result).toMatchObject({ skill_version: 1, model: 'gpt-test' });
    const after = await suiteCounts(pg.handle.db);
    expect(after.runs).toBe(before.runs);
    expect(after.results).toBe(before.results);
  });

  it('refuses a run with no cases, an unusable key or a bad body, and starts nothing (AC-79, 91)', async () => {
    const skillId = await mkSkill('Empty Skill');
    const empty = await startRun(skillId);
    expect([empty.status, empty.body.error.code]).toEqual([422, 'suite_empty']);

    await skillCase(skillId, 'solo');
    const calls = scripted.calls.length;
    const noKey = await startRun(skillId, { provider: 'openrouter', model: 'm' });
    expect([noKey.status, noKey.body.error.code]).toEqual([422, 'no_api_key']);
    expect((await state(skillId)).progress).toBeNull();

    const attempts = [
      { method: 'POST' as const, url: `/skills/${skillId}/eval-runs` },
      { method: 'POST' as const, url: `/skills/${skillId}/eval-runs`, headers: { 'content-type': 'text/plain' }, payload: JSON.stringify({ ...OPENAI, confirm: true }) },
      { method: 'POST' as const, url: `/skills/${skillId}/eval-runs`, payload: OPENAI },
      { method: 'POST' as const, url: `/skills/${skillId}/eval-runs`, payload: { ...OPENAI, confirm: false } },
      { method: 'POST' as const, url: `/skills/${skillId}/eval-runs`, payload: { confirm: true } },
    ];
    for (const req of attempts) {
      const res = await app.inject(req);
      expect(res.statusCode, JSON.stringify(req)).toBeGreaterThanOrEqual(400);
      expect(res.statusCode, JSON.stringify(req)).toBeLessThan(500);
    }
    expect(scripted.calls.length).toBe(calls);
    expect((await results(skillId))[0]!.last_result).toBeNull();
    expect((await startRun(GHOST)).status).toBe(404);
  });

  it('refuses a second start while a run is in progress and still allows a single case run (AC-92, TQ3)', async () => {
    const skillId = await mkSkill('Slow Skill');
    const slow = await skillCase(skillId, 'slow');
    const first = await startRun(skillId, { provider: 'anthropic', model: 'm' });
    expect(first.status).toBe(202);
    await until('the model call', () => deferred.pendingCount > 0);

    expect((await state(skillId)).progress).toMatchObject({ done: 0, total: 1 });
    const second = await startRun(skillId);
    expect([second.status, second.body.error.code]).toEqual([409, 'run_in_progress']);
    const single = await json({ method: 'POST', url: `/eval-cases/${slow.id}/runs`, payload: OPENAI });
    expect(single.status).toBe(200);

    deferred.release(NOTHING);
    await waitIdle(skillId);
    // The in-flight run finished last and wrote the result of its (empty) review.
    expect((await results(skillId))[0]!.last_result?.status).toBe('failed');
    expect((await startRun(skillId)).status).toBe(202);
    await waitIdle(skillId);
  });

  it('lets a skill suite run and an agent suite run of an agent using the skill overlap, both ways (AC-89)', async () => {
    // Skill run in progress (held on the deferred provider) -> the agent run starts.
    const skillId = await mkSkill('Overlap Skill');
    await skillCase(skillId, 'held');
    const agentId = await mkAgent('Overlap Agent');
    await attachSkill(pg.handle.db, agentId, skillId);
    await addCase(`/agents/${agentId}/eval-cases`, 'a1');
    const pending = deferred.pendingCount;
    expect((await startRun(skillId, { provider: 'anthropic', model: 'm' })).status).toBe(202);
    await until('the skill model call', () => deferred.pendingCount > pending);
    const agentRun = await json({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    expect(agentRun.status).toBe(202);
    await until('agent run end', async () => (await json({ method: 'GET', url: `/eval-runs/${agentRun.body.id}` })).body.status !== 'running');
    deferred.release(NOTHING);
    await waitIdle(skillId);

    // Agent run in progress (an anthropic agent, held) -> the skill run starts.
    const slowAgent = await mkAgent('Overlap Slow Agent', 'anthropic');
    const skill2 = await mkSkill('Overlap Skill 2');
    await attachSkill(pg.handle.db, slowAgent, skill2);
    await skillCase(skill2, 'free');
    await addCase(`/agents/${slowAgent}/eval-cases`, 'a1');
    const pending2 = deferred.pendingCount;
    const slowRun = await json({ method: 'POST', url: `/agents/${slowAgent}/eval-runs` });
    expect(slowRun.status).toBe(202);
    await until('the agent model call', () => deferred.pendingCount > pending2);
    expect((await startRun(skill2)).status).toBe(202);
    await waitIdle(skill2);
    deferred.release(NOTHING);
    await until('slow agent run end', async () => (await json({ method: 'GET', url: `/eval-runs/${slowRun.body.id}` })).body.status !== 'running');
  });

  it('runs a single skill case on a pick, and refuses one without a pick (AC-85)', async () => {
    const skillId = await mkSkill('Single Skill');
    const c = await skillCase(skillId, 'single');
    const calls = scripted.calls.length;
    const bare = await json({ method: 'POST', url: `/eval-cases/${c.id}/runs` });
    expect([bare.status, bare.body.error.code]).toEqual([422, 'validation_error']);
    expect(scripted.calls.length).toBe(calls);

    const ran = await json({ method: 'POST', url: `/eval-cases/${c.id}/runs`, payload: OPENAI });
    expect(ran.status).toBe(200);
    expect(ran.body).toMatchObject({ skill_id: skillId, agent_id: null, last_result: { status: 'passed', skill_version: 1 } });

    const noKey = await json({ method: 'POST', url: `/eval-cases/${c.id}/runs`, payload: { provider: 'openrouter', model: 'm' } });
    expect([noKey.status, noKey.body.error.code]).toEqual([422, 'no_api_key']);
  });

  it('keeps the bodyless single run of an agent case working (AC-31, 89)', async () => {
    const agentId = await mkAgent('Bodyless Agent');
    const c = await addCase(`/agents/${agentId}/eval-cases`, 'agent-case');
    const ran = await json({ method: 'POST', url: `/eval-cases/${c.id}/runs` });
    expect(ran.status).toBe(200);
    expect(ran.body.last_result).toMatchObject({ status: 'passed', agent_version: 1 });
    // A pick on an agent case is ignored: it runs on the agent's own model.
    const withPick = await json({ method: 'POST', url: `/eval-cases/${c.id}/runs`, payload: OPENAI });
    expect(withPick.body.last_result).toMatchObject({ model: 'agent-model' });
  });

  it('proposes the first attached agent as the default pick, or none (AC-87)', async () => {
    const lone = await mkSkill('Lone Skill');
    expect((await state(lone)).default_pick).toBeNull();

    const skillId = await mkSkill('Picked Skill');
    await attachSkill(pg.handle.db, await mkAgent('Zeta Pick Agent'), skillId);
    await attachSkill(pg.handle.db, await mkAgent('Alpha Pick Agent', 'anthropic'), skillId);
    expect((await state(skillId)).default_pick).toEqual({ provider: 'anthropic', model: 'agent-model' });
  });

  it('previews and starts Run on evals for the enabled agents with cases (AC-91)', async () => {
    const skillId = await mkSkill('Shared Skill');
    const withCases = await mkAgent('Runs Agent');
    const noCases = await mkAgent('Casesless Agent');
    await attachSkill(pg.handle.db, withCases, skillId);
    await attachSkill(pg.handle.db, noCases, skillId);
    await addCase(`/agents/${withCases}/eval-cases`, 'c1');
    const outsider = await mkAgent('Outsider Agent');
    await addCase(`/agents/${outsider}/eval-cases`, 'c1');

    const preview = (await json({ method: 'GET', url: `/skills/${skillId}/eval-run-agents` })).body;
    expect(preview.blocked).toBeNull();
    expect(preview.agents.map((a: { agent_id: string }) => a.agent_id)).toEqual([withCases]);
    expect(preview.total_cases).toBe(1);

    const calls = scripted.calls.length;
    const start = await json({ method: 'POST', url: `/skills/${skillId}/eval-run-agents`, payload: { confirm: true } });
    expect(start.status).toBe(200);
    expect(start.body.started.map((s: { agent_id: string }) => s.agent_id)).toEqual([withCases]);
    for (const s of start.body.started as { run_id: string }[]) {
      await until('agent run end', async () => (await json({ method: 'GET', url: `/eval-runs/${s.run_id}` })).body.status !== 'running');
    }
    expect(scripted.calls.length).toBe(calls + 1);
  });

  it('blocks Run on evals for a disabled skill and when no agent qualifies (AC-92, 93)', async () => {
    const off = await mkSkill('Disabled Skill', false);
    const agentId = await mkAgent('Off Agent');
    await attachSkill(pg.handle.db, agentId, off);
    await addCase(`/agents/${agentId}/eval-cases`, 'c1');
    const calls = scripted.calls.length;

    expect((await json({ method: 'GET', url: `/skills/${off}/eval-run-agents` })).body).toMatchObject({ blocked: 'skill_disabled', agents: [] });
    const refused = await json({ method: 'POST', url: `/skills/${off}/eval-run-agents`, payload: { confirm: true } });
    expect([refused.status, refused.body.error.code]).toEqual([409, 'skill_disabled']);

    // "Disabled while the confirm is open": the preview said fine, the skill was then switched off.
    const flip = await mkSkill('Flip Skill');
    await attachSkill(pg.handle.db, agentId, flip);
    expect((await json({ method: 'GET', url: `/skills/${flip}/eval-run-agents` })).body.blocked).toBeNull();
    await pg.handle.db.update(t.skills).set({ enabled: false }).where(eq(t.skills.id, flip));
    const late = await json({ method: 'POST', url: `/skills/${flip}/eval-run-agents`, payload: { confirm: true } });
    expect([late.status, late.body.error.code]).toEqual([409, 'skill_disabled']);

    const lonely = await mkSkill('Unused Skill');
    expect((await json({ method: 'GET', url: `/skills/${lonely}/eval-run-agents` })).body.blocked).toBe('no_agents');
    const none = await json({ method: 'POST', url: `/skills/${lonely}/eval-run-agents`, payload: { confirm: true } });
    expect([none.status, none.body.error.code]).toEqual([422, 'no_agents']);

    expect(scripted.calls.length).toBe(calls);
    expect((await json({ method: 'GET', url: `/skills/${GHOST}/eval-run-agents` })).status).toBe(404);
  });

  it('still runs the suite of a disabled skill on its own (AC-93)', async () => {
    const off = await mkSkill('Disabled Suite Skill', false);
    await skillCase(off, 'solo');
    expect((await startRun(off)).status).toBe(202);
    await waitIdle(off);
    expect((await results(off))[0]!.last_result?.status).toBe('passed');
  });

  it('refuses a bodyless or non-JSON POST to Run on evals and starts nothing', async () => {
    const skillId = await mkSkill('Guarded Skill');
    const before = await suiteCounts(pg.handle.db);
    const calls = scripted.calls.length;
    const attempts = [
      { method: 'POST' as const, url: `/skills/${skillId}/eval-run-agents` },
      { method: 'POST' as const, url: `/skills/${skillId}/eval-run-agents`, headers: { 'content-type': 'text/plain' }, payload: '{"confirm":true}' },
      { method: 'POST' as const, url: `/skills/${skillId}/eval-run-agents`, payload: { confirm: false } },
    ];
    for (const req of attempts) {
      const res = await app.inject(req);
      expect(res.statusCode, JSON.stringify(req)).toBeGreaterThanOrEqual(400);
      expect(res.statusCode, JSON.stringify(req)).toBeLessThan(500);
    }
    expect(await suiteCounts(pg.handle.db)).toEqual(before);
    expect(scripted.calls.length).toBe(calls);
  });
});
