import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { EvalExpectation, Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ScriptedLLMProvider } from './helpers/llm-stubs.js';
import { PR_DIFF, buildEvalApp, insertSkill, suiteCounts } from './helpers/eval-pipeline-env.js';

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

const mustFind = (line = 11): EvalExpectation => ({
  expect: 'must_find',
  file: 'src/config.ts',
  start_line: line,
  end_line: line,
});
const GHOST = '00000000-0000-4000-8000-000000000000';
const PICK = { provider: 'openai', model: 'gpt-test' } as const;

d('eval pipeline: skill cases and drafts (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let llm: ScriptedLLMProvider;
  let app: Awaited<ReturnType<typeof buildEvalApp>>;
  let skillId: string;
  let offSkillId: string;

  const body = (name: string, expected: unknown = [mustFind()], extra: object = {}) => ({
    name,
    input: { diff: PR_DIFF },
    expected_output: expected,
    ...extra,
  });
  const save = (name: string, expected?: unknown, extra: object = {}, id = skillId) =>
    app.inject({ method: 'POST', url: `/skills/${id}/eval-cases`, payload: body(name, expected, extra) });
  const draft = (extra: object = {}, id = skillId) =>
    app.inject({
      method: 'POST',
      url: `/skills/${id}/eval-draft-runs`,
      payload: { input: { diff: PR_DIFF }, expected_output: [mustFind()], ...PICK, ...extra },
    });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
    // openai answers; anthropic has neither an override nor a key (AC-79).
    llm = new ScriptedLLMProvider([{ match: 'using only the skill', review: FOUND }]);
    app = await buildEvalApp(pg, { openai: llm });
    skillId = await insertSkill(pg.handle.db, workspaceId, { name: 'Cases Skill', body: 'SKILLCASES-MARK rule' });
    offSkillId = await insertSkill(pg.handle.db, workspaceId, {
      name: 'Off Skill',
      body: 'SKILLCASES-MARK off rule',
      enabled: false,
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('saves, lists and scopes skill cases to their skill (AC-1, 7, 81, 94)', async () => {
    expect((await app.inject({ method: 'GET', url: `/skills/${skillId}/eval-cases` })).json()).toEqual([]);
    const res = await save('first');
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ agent_id: null, skill_id: skillId, name: 'first', last_result: null });

    const other = await insertSkill(pg.handle.db, workspaceId, { name: 'Other Skill' });
    expect((await app.inject({ method: 'GET', url: `/skills/${other}/eval-cases` })).json()).toEqual([]);
    // The same name is free in another suite and refused in this one.
    expect((await save('first', undefined, {}, other)).statusCode).toBe(201);
    const dup = await save('first');
    expect([dup.statusCode, dup.json().error.code]).toEqual([422, 'validation_error']);
    const listed = (await app.inject({ method: 'GET', url: `/skills/${skillId}/eval-cases` })).json();
    expect(listed.map((c: { name: string }) => c.name)).toEqual(['first']);
  });

  it('answers 404 for an unknown skill and for a skill of another workspace', async () => {
    expect((await app.inject({ method: 'GET', url: `/skills/${GHOST}/eval-cases` })).statusCode).toBe(404);
    expect((await save('x', undefined, {}, GHOST)).statusCode).toBe(404);

    const [foreignWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'Foreign' }).returning();
    const foreign = await insertSkill(pg.handle.db, foreignWs!.id, { name: 'Foreign Skill' });
    expect((await app.inject({ method: 'GET', url: `/skills/${foreign}/eval-cases` })).statusCode).toBe(404);
    expect((await save('x', undefined, {}, foreign)).statusCode).toBe(404);
    expect((await draft({}, foreign)).statusCode).toBe(404);
  });

  it('runs a draft with the pick, persists nothing and Save attaches the run only for the same input (AC-62 #8, 33, 85)', async () => {
    const before = await suiteCounts(pg.handle.db);
    const calls = llm.calls.length;
    const run = await draft();
    expect(run.statusCode).toBe(200);
    expect(run.json().result).toMatchObject({ status: 'passed', must_find_matched: 1, skill_version: 1, model: 'gpt-test' });
    expect(llm.calls.length).toBe(calls + 1);
    expect(await suiteCounts(pg.handle.db)).toEqual(before);

    const saved = await save('draft-attached', [mustFind()], { draft_run_token: run.json().run_token });
    expect(saved.statusCode).toBe(201);
    expect(saved.json().last_result).toMatchObject({ status: 'passed', skill_version: 1 });

    // A changed expectation, and a spent token, never inherit a result.
    const run2 = await draft();
    const edited = await save('draft-edited', [mustFind(10)], { draft_run_token: run2.json().run_token });
    expect(edited.json().last_result).toBeNull();
    const reused = await save('draft-reused', [mustFind()], { draft_run_token: run.json().run_token });
    expect(reused.json().last_result).toBeNull();
  });

  it('refuses a draft run without a usable key before any write or call (AC-79)', async () => {
    const before = await suiteCounts(pg.handle.db);
    const calls = llm.calls.length;
    const res = await draft({ provider: 'anthropic' });
    expect([res.statusCode, res.json().error.code]).toEqual([422, 'no_api_key']);
    expect(llm.calls.length).toBe(calls);
    expect(await suiteCounts(pg.handle.db)).toEqual(before);
  });

  it('validates the body at the boundary: pick fields and the expected list (AC-95)', async () => {
    const calls = llm.calls.length;
    for (const extra of [{ provider: 'bogus' }, { model: '' }, { model: 'm'.repeat(201) }]) {
      const res = await draft(extra);
      expect(res.statusCode, JSON.stringify(extra)).toBe(422);
    }
    const bad = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/eval-draft-runs`,
      payload: { input: { diff: 'not a diff' }, expected_output: [mustFind()], ...PICK },
    });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    expect(bad.statusCode).toBeLessThan(500);
    expect(llm.calls.length).toBe(calls);
  });

  it('keeps a disabled skill testable on its own suite (AC-93)', async () => {
    const run = await draft({}, offSkillId);
    expect(run.statusCode).toBe(200);
    expect((await save('off-case', undefined, {}, offSkillId)).statusCode).toBe(201);
  });

  it('keeps the cases and their last result when the skill body gets a new version (AC-95)', async () => {
    const id = await insertSkill(pg.handle.db, workspaceId, { name: 'Versioned Skill', body: 'SKILLCASES-MARK v1' });
    const run = await draft({}, id);
    const saved = await save('keep-me', [mustFind()], { draft_run_token: run.json().run_token }, id);
    expect(saved.json().last_result).toMatchObject({ status: 'passed', skill_version: 1 });
    const list = async () => (await app.inject({ method: 'GET', url: `/skills/${id}/eval-cases` })).json();
    const before = await list();

    const put = await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { body: 'SKILLCASES-MARK v2 changed' } });
    expect(put.statusCode).toBe(200);
    expect(put.json().version).toBe(2);

    const after = await list();
    expect(after).toEqual(before);
    expect(after[0].last_result).toMatchObject({ skill_version: 1 });
  });

  it('lets PUT /eval-cases/:id edit a skill case with an owner-scoped name check (AC-26)', async () => {
    const a = (await save('rename-a')).json();
    await save('rename-b');
    const clash = await app.inject({ method: 'PUT', url: `/eval-cases/${a.id}`, payload: body('rename-b') });
    expect([clash.statusCode, clash.json().error.code]).toEqual([422, 'validation_error']);
    const ok = await app.inject({ method: 'PUT', url: `/eval-cases/${a.id}`, payload: body('rename-a2') });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ skill_id: skillId, agent_id: null, name: 'rename-a2' });
  });

  it('rejects a two-owner and a no-owner row at the database (CHECK)', async () => {
    const [agent] = await pg.handle.db.select().from(t.agents).limit(1);
    const base = { workspaceId, name: 'check-row', inputDiff: PR_DIFF, inputFiles: [], expected: [] };
    if (agent) {
      await expect(
        pg.handle.db.insert(t.evalSuiteCases).values({ ...base, agentId: agent.id, skillId }),
      ).rejects.toThrow();
    }
    await expect(pg.handle.db.insert(t.evalSuiteCases).values({ ...base, agentId: null, skillId: null })).rejects.toThrow();
  });

  it('deletes the cases with their skill (cascade)', async () => {
    const doomed = await insertSkill(pg.handle.db, workspaceId, { name: 'Doomed Skill' });
    await save('gone', undefined, {}, doomed);
    await pg.handle.db.delete(t.skills).where(eq(t.skills.id, doomed));
    const left = await pg.handle.db.select().from(t.evalSuiteCases).where(eq(t.evalSuiteCases.skillId, doomed));
    expect(left).toEqual([]);
  });
});
