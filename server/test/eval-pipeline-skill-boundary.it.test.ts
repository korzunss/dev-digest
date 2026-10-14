import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { EvalExpectation, Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ScriptedLLMProvider } from './helpers/llm-stubs.js';
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
const mustFind: EvalExpectation = { expect: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11 };
const PICK = { provider: 'openai', model: 'gpt-test' } as const;

// Trust boundaries of the paid skill-eval POSTs (plan 35): body shape, ownership, state refusals.
d('eval pipeline: skill eval trust boundaries (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: Awaited<ReturnType<typeof buildEvalApp>>;
  let llm: ScriptedLLMProvider;
  let skillId: string;
  let foreignSkill: string;
  let foreignCase: string;
  let skillCaseId: string;

  const post = (url: string, payload?: unknown) => app.inject({ method: 'POST', url, ...(payload === undefined ? {} : { payload }) });
  const runs = (id: string) => app.inject({ method: 'GET', url: `/skills/${id}/eval-cases` });
  const lastResults = async (id: string) =>
    ((await runs(id)).json() as { last_result: unknown }[]).map((c) => c.last_result);

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
    llm = new ScriptedLLMProvider([{ match: 'using only the skill', review: FOUND }, { match: 'BOUNDARY-AGENT', review: FOUND }]);
    app = await buildEvalApp(pg, { openai: llm });

    skillId = await insertSkill(pg.handle.db, workspaceId, { name: 'Boundary Skill' });
    const saved = await post(`/skills/${skillId}/eval-cases`, {
      name: 'own',
      input: { diff: PR_DIFF },
      expected_output: [mustFind],
    });
    skillCaseId = saved.json().id;

    // A skill and a case that belong to another workspace.
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'Foreign' }).returning();
    foreignSkill = await insertSkill(pg.handle.db, other!.id, { name: 'Foreign Skill' });
    const [row] = await pg.handle.db
      .insert(t.evalSuiteCases)
      .values({
        workspaceId: other!.id,
        skillId: foreignSkill,
        agentId: null,
        name: 'foreign-case',
        inputDiff: PR_DIFF,
        inputFiles: ['src/config.ts'],
        expected: [mustFind],
      })
      .returning();
    foreignCase = row!.id;
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  // Another workspace's skill is invisible on every skill route: 404, nothing runs, nothing is written.
  it('answers 404 on every skill route for a skill of another workspace and spends nothing', async () => {
    const calls = llm.calls.length;
    const before = await suiteCounts(pg.handle.db);
    const base = `/skills/${foreignSkill}`;
    const responses = [
      await app.inject({ method: 'GET', url: `${base}/eval-run` }),
      await app.inject({ method: 'GET', url: `${base}/eval-run-agents` }),
      await post(`${base}/eval-runs`, { ...PICK, confirm: true }),
      await post(`${base}/eval-run-agents`, { confirm: true }),
      await post(`${base}/eval-draft-runs`, { input: { diff: PR_DIFF }, expected_output: [mustFind], ...PICK }),
      await post(`${base}/eval-cases`, { name: 'x', input: { diff: PR_DIFF }, expected_output: [mustFind] }),
    ];
    expect(responses.map((r) => r.statusCode)).toEqual([404, 404, 404, 404, 404, 404]);
    expect(llm.calls.length).toBe(calls);
    expect(await suiteCounts(pg.handle.db)).toEqual(before);
    const row = (await pg.handle.db.select().from(t.evalSuiteCases).where(eq(t.evalSuiteCases.id, foreignCase)))[0];
    expect(row?.lastResult).toBeNull();
  });

  // A case id from another workspace can be neither run, edited nor deleted.
  it('answers 404 for a case of another workspace on run, edit and delete', async () => {
    const calls = llm.calls.length;
    const run = await post(`/eval-cases/${foreignCase}/runs`, PICK);
    const edit = await app.inject({
      method: 'PUT',
      url: `/eval-cases/${foreignCase}`,
      payload: { name: 'hijack', input: { diff: PR_DIFF }, expected_output: [mustFind] },
    });
    const del = await app.inject({ method: 'DELETE', url: `/eval-cases/${foreignCase}` });
    expect([run.statusCode, edit.statusCode, del.statusCode]).toEqual([404, 404, 404]);
    expect(llm.calls.length).toBe(calls);
    const row = (await pg.handle.db.select().from(t.evalSuiteCases).where(eq(t.evalSuiteCases.id, foreignCase)))[0];
    expect(row).toMatchObject({ name: 'foreign-case', lastResult: null });
  });

  // A malformed pick never reaches the service: 422, no model call, no progress, no stored result.
  it('rejects an invalid provider or model on Run all evals with 422 and starts nothing', async () => {
    const calls = llm.calls.length;
    const bad: object[] = [
      { provider: 'bogus', model: 'm', confirm: true },
      { provider: 'OpenAI', model: 'm', confirm: true },
      { provider: 'openai', model: '', confirm: true },
      { provider: 'openai', model: '   ', confirm: true },
      { provider: 'openai', model: 'm'.repeat(201), confirm: true },
      { provider: 'openai', model: 42, confirm: true },
      { provider: 'openai', confirm: true },
      { model: 'm', confirm: true },
      { ...PICK },
      { ...PICK, confirm: 'true' },
    ];
    for (const payload of bad) {
      const res = await post(`/skills/${skillId}/eval-runs`, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(422);
    }
    expect((await app.inject({ method: 'GET', url: `/skills/${skillId}/eval-run` })).json().progress).toBeNull();
    expect(await lastResults(skillId)).toEqual([null]);
    expect(llm.calls.length).toBe(calls);
  });

  // The same pick validation guards a single skill-case run and a draft run.
  it('rejects an invalid pick on a single skill-case run and on a draft run', async () => {
    const calls = llm.calls.length;
    for (const payload of [{ provider: 'bogus', model: 'm' }, { provider: 'openai', model: '' }, { provider: 'openai', model: 'm'.repeat(201) }]) {
      const single = await post(`/eval-cases/${skillCaseId}/runs`, payload);
      expect(single.statusCode, JSON.stringify(payload)).toBe(422);
      const draft = await post(`/skills/${skillId}/eval-draft-runs`, { input: { diff: PR_DIFF }, expected_output: [mustFind], ...payload });
      expect(draft.statusCode, JSON.stringify(payload)).toBe(422);
    }
    expect(llm.calls.length).toBe(calls);
    expect(await lastResults(skillId)).toEqual([null]);
  });

  // A missing or incomplete draft body is refused before the service, so no model call is made.
  it('rejects a missing or incomplete draft-run and save body with 4xx', async () => {
    const calls = llm.calls.length;
    const before = await suiteCounts(pg.handle.db);
    const attempts = [
      post(`/skills/${skillId}/eval-draft-runs`),
      post(`/skills/${skillId}/eval-draft-runs`, {}),
      post(`/skills/${skillId}/eval-draft-runs`, { expected_output: [mustFind], ...PICK }),
      post(`/skills/${skillId}/eval-draft-runs`, { input: { diff: PR_DIFF }, ...PICK }),
      post(`/skills/${skillId}/eval-draft-runs`, { input: { diff: PR_DIFF }, expected_output: [mustFind] }),
      post(`/skills/${skillId}/eval-cases`, { input: { diff: PR_DIFF }, expected_output: [mustFind] }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).toBeLessThan(500);
    }
    expect(llm.calls.length).toBe(calls);
    expect(await suiteCounts(pg.handle.db)).toEqual(before);
  });

  // The :id param is a uuid; anything else is refused before the handler.
  it('rejects a non-uuid skill id on the paid POSTs with 422', async () => {
    const calls = llm.calls.length;
    for (const [url, payload] of [
      ['/skills/not-a-uuid/eval-runs', { ...PICK, confirm: true }],
      ['/skills/not-a-uuid/eval-run-agents', { confirm: true }],
      ['/skills/not-a-uuid/eval-draft-runs', { input: { diff: PR_DIFF }, expected_output: [mustFind], ...PICK }],
    ] as const) {
      expect((await post(url, payload)).statusCode, url).toBe(422);
    }
    expect(llm.calls.length).toBe(calls);
  });

  // A disabled skill and a skill without agents are refused on Run on evals and spend nothing,
  // even when an agent with a suite exists elsewhere.
  it('refuses Run on evals for a disabled skill (409) and a skill with no agents (422) without a model call', async () => {
    const calls = llm.calls.length;
    const before = await suiteCounts(pg.handle.db);
    const agent = (
      await post('/agents', { name: 'Boundary Agent', provider: 'openai', model: 'agent-model', system_prompt: 'BOUNDARY-AGENT prompt' })
    ).json().id as string;
    await post(`/agents/${agent}/eval-cases`, { name: 'c', input: { diff: PR_DIFF }, expected_output: [mustFind] });
    const off = await insertSkill(pg.handle.db, workspaceId, { name: 'Boundary Off', enabled: false });
    await attachSkill(pg.handle.db, agent, off);
    const unused = await insertSkill(pg.handle.db, workspaceId, { name: 'Boundary Unused' });

    const disabled = await post(`/skills/${off}/eval-run-agents`, { confirm: true });
    expect([disabled.statusCode, disabled.json().error.code]).toEqual([409, 'skill_disabled']);
    const none = await post(`/skills/${unused}/eval-run-agents`, { confirm: true });
    expect([none.statusCode, none.json().error.code]).toEqual([422, 'no_agents']);

    expect(llm.calls.length).toBe(calls);
    expect((await suiteCounts(pg.handle.db)).runs).toBe(before.runs);
  });
});
