import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { EvalExpectation, Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ScriptedLLMProvider } from './helpers/llm-stubs.js';
import { PR_DIFF, buildEvalApp, insertFinding, insertPr, suiteCounts } from './helpers/eval-pipeline-env.js';

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

const mustFind = (line = 11, file = 'src/config.ts'): EvalExpectation => ({
  expect: 'must_find',
  file,
  start_line: line,
  end_line: line,
});

d('eval pipeline: cases and drafts (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let llm: ScriptedLLMProvider;
  let app: Awaited<ReturnType<typeof buildEvalApp>>;
  let agentId: string;
  let anthropicAgentId: string;
  let prId: string;

  const decide = async (findingId: string, action: 'accept' | 'dismiss') => {
    const res = await app.inject({ method: 'POST', url: `/findings/${findingId}/${action}` });
    expect(res.statusCode).toBe(200);
  };
  const newFinding = async (opts: { agent?: string | null; file?: string; line?: number } = {}) =>
    insertFinding(
      pg.handle.db,
      { workspaceId, prId, agentId: opts.agent === undefined ? agentId : opts.agent },
      { file: opts.file, line: opts.line },
    );
  const saveBody = (name: string, expected: unknown = [mustFind()], extra: object = {}) => ({
    name,
    input: { diff: PR_DIFF },
    expected_output: expected,
    ...extra,
  });
  const save = (name: string, expected?: unknown, extra: object = {}, agent = agentId) =>
    app.inject({ method: 'POST', url: `/agents/${agent}/eval-cases`, payload: saveBody(name, expected, extra) });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    // The openai provider answers; anthropic has neither an override nor a key (AC-79).
    llm = new ScriptedLLMProvider([{ match: 'CASES-AGENT', review: FOUND }]);
    app = await buildEvalApp(pg, { openai: llm });
    const mk = async (provider: string, name: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/agents',
          payload: { name, provider, model: 'm', system_prompt: 'CASES-AGENT prompt' },
        })
      ).json().id as string;
    agentId = await mk('openai', 'Cases Agent');
    anthropicAgentId = await mk('anthropic', 'No Key Agent');
    prId = (await insertPr(pg.handle.db, workspaceId)).pr.id;
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('seeds a must_find draft from an accepted finding and writes nothing (AC-10, 11, 12, 13)', async () => {
    const fid = await newFinding();
    await decide(fid, 'accept');
    const before = await suiteCounts(pg.handle.db);

    const res = await app.inject({ method: 'GET', url: `/findings/${fid}/eval-draft` });
    expect(res.statusCode).toBe(200);
    const seedBody = res.json();
    expect(seedBody.kind).toBe('draft');
    expect(seedBody.draft).toMatchObject({
      agent_id: agentId,
      seeded_from: 'accepted',
      expected: [{ expect: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11 }],
      source: { finding_id: fid, pr_id: prId },
    });
    expect(seedBody.draft.name).toMatch(/^must-find-/);
    expect(seedBody.draft.input.diff).toContain('+  stripeKey');
    expect(seedBody.draft.input.files).toEqual(['src/config.ts']);
    expect(await suiteCounts(pg.handle.db)).toEqual(before);
  });

  it('seeds a must_not_flag draft from a dismissed finding (AC-62 #5)', async () => {
    const fid = await newFinding();
    await decide(fid, 'dismiss');
    const body = (await app.inject({ method: 'GET', url: `/findings/${fid}/eval-draft` })).json();
    expect(body.draft.seeded_from).toBe('dismissed');
    expect(body.draft.expected[0].expect).toBe('must_not_flag');
    expect(body.draft.name).toMatch(/^must-not-flag-/);
  });

  // AC-62 #5: open and a draft run write nothing; only Save creates the case, and it is must_not_flag.
  it('walks a dismissed finding: open and draft run write nothing, Save creates exactly one must_not_flag case', async () => {
    const fid = await newFinding();
    await decide(fid, 'dismiss');
    const before = await suiteCounts(pg.handle.db);

    const opened = await app.inject({ method: 'GET', url: `/findings/${fid}/eval-draft` });
    expect(opened.statusCode).toBe(200);
    const draft = opened.json().draft;
    expect(draft.expected).toHaveLength(1);
    expect(draft.expected[0]).toMatchObject({ expect: 'must_not_flag', file: 'src/config.ts' });
    expect(await suiteCounts(pg.handle.db)).toEqual(before);

    const run = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/eval-draft-runs`,
      payload: { input: draft.input, expected_output: draft.expected },
    });
    expect(run.statusCode).toBe(200);
    expect(await suiteCounts(pg.handle.db)).toEqual(before);

    const saved = await save(draft.name, draft.expected, { source_finding_id: fid, draft_run_token: run.json().run_token });
    expect(saved.statusCode).toBe(201);
    expect(saved.json().expected).toHaveLength(1);
    expect(saved.json().expected[0]).toMatchObject({ expect: 'must_not_flag' });
    expect(await suiteCounts(pg.handle.db)).toEqual({ ...before, cases: before.cases + 1 });
    const rows = await pg.handle.db.select().from(t.evalSuiteCases).where(eq(t.evalSuiteCases.sourceFindingId, fid));
    expect(rows).toHaveLength(1);
    expect((rows[0]!.expected as EvalExpectation[]).map((e) => e.expect)).toEqual(['must_not_flag']);
  });

  it('refuses an undecided finding, a vanished agent and a file without diff text (AC-9, 14, 15)', async () => {
    const before = await suiteCounts(pg.handle.db);
    const undecided = await newFinding();
    let res = await app.inject({ method: 'GET', url: `/findings/${undecided}/eval-draft` });
    expect([res.statusCode, res.json().error.code]).toEqual([409, 'finding_undecided']);

    const orphan = await newFinding({ agent: null });
    await decide(orphan, 'accept');
    res = await app.inject({ method: 'GET', url: `/findings/${orphan}/eval-draft` });
    expect([res.statusCode, res.json().error.code]).toEqual([409, 'agent_missing']);

    const noDiff = await newFinding({ file: 'src/not-in-the-diff.ts' });
    await decide(noDiff, 'accept');
    res = await app.inject({ method: 'GET', url: `/findings/${noDiff}/eval-draft` });
    expect([res.statusCode, res.json().error.code]).toEqual([422, 'no_diff_text']);
    expect(res.json().error.message).toBe('no diff text available for src/not-in-the-diff.ts');
    expect(await suiteCounts(pg.handle.db)).toEqual(before);
  });

  it('runs a draft without persisting anything, and Save attaches the run only for the same input (AC-67, 69, 70)', async () => {
    const before = await suiteCounts(pg.handle.db);
    const callsBefore = llm.calls.length;
    const run = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/eval-draft-runs`,
      payload: { input: { diff: PR_DIFF }, expected_output: [mustFind()] },
    });
    expect(run.statusCode).toBe(200);
    expect(run.json().result).toMatchObject({ status: 'passed', must_find_matched: 1 });
    expect(llm.calls.length).toBe(callsBefore + 1);
    expect(await suiteCounts(pg.handle.db)).toEqual(before);

    const token = run.json().run_token as string;
    const saved = await save('draft-run-attached', [mustFind()], { draft_run_token: token });
    expect(saved.statusCode).toBe(201);
    expect(saved.json().last_result).toMatchObject({ status: 'passed' });

    // The token is single-use, and a changed expectation never inherits a result.
    const run2 = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/eval-draft-runs`,
      payload: { input: { diff: PR_DIFF }, expected_output: [mustFind()] },
    });
    const edited = await save('draft-run-edited', [mustFind(10)], { draft_run_token: run2.json().run_token });
    expect(edited.statusCode).toBe(201);
    expect(edited.json().last_result).toBeNull();
    const reused = await save('draft-run-reused', [mustFind()], { draft_run_token: token });
    expect(reused.json().last_result).toBeNull();
  });

  it('saves one case per finding and offers the existing one afterwards (AC-3, 7, 16, 72)', async () => {
    const fid = await newFinding();
    await decide(fid, 'accept');
    const first = await save('from-finding', [mustFind()], { source_finding_id: fid });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      agent_id: agentId,
      source: { finding_id: fid, pr_id: prId },
      expected: [{ expect: 'must_find' }],
      last_result: null,
    });

    const again = await save('from-finding-again', [mustFind()], { source_finding_id: fid });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toMatchObject({ code: 'case_exists', details: { case_id: first.json().id } });

    const seedBody = (await app.inject({ method: 'GET', url: `/findings/${fid}/eval-draft` })).json();
    expect(seedBody.kind).toBe('existing');
    expect(seedBody.case.id).toBe(first.json().id);
    const rows = await pg.handle.db.select().from(t.evalSuiteCases).where(eq(t.evalSuiteCases.sourceFindingId, fid));
    expect(rows).toHaveLength(1);
  });

  it('never re-derives a saved input when the PR changes afterwards (AC-4)', async () => {
    const saved = (await save('frozen-input')).json();
    await pg.handle.db.update(t.prFiles).set({ patch: '@@ -1 +1 @@\n-x\n+y' }).where(eq(t.prFiles.prId, prId));
    const listed = (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` })).json();
    expect(listed.find((c: { id: string }) => c.id === saved.id).input.diff).toBe(PR_DIFF);
  });

  it('refuses an invalid save and writes no case (AC-24, 25, 26, 69, 74)', async () => {
    await save('dup-name');
    const before = await suiteCounts(pg.handle.db);
    const refuse = async (name: string, expected: unknown, diff = PR_DIFF) => {
      const res = await app.inject({
        method: 'POST',
        url: `/agents/${agentId}/eval-cases`,
        payload: { name, input: { diff }, expected_output: expected },
      });
      expect(res.statusCode).toBe(422);
      return res.json().error as { code: string; message: string; details: { index?: number; field: string }[] };
    };

    expect((await refuse('dup-name', [mustFind()])).message).toMatch(/already used/);
    expect((await refuse('   ', [mustFind()])).code).toBe('validation_error');
    expect((await refuse('hunks-only', [], '@@ -1 +1 @@\n-a\n+b')).details[0]!.field).toBe('input.diff');
    expect((await refuse('not-a-diff', [], 'just text')).details[0]!.field).toBe('input.diff');
    const wrongFile = await refuse('wrong-file', [mustFind(11), mustFind(11, 'src/other.ts')]);
    expect(wrongFile.details[0]).toMatchObject({ index: 1 });
    expect((await refuse('wrong-line', [mustFind(500)])).details[0]).toMatchObject({ index: 0 });
    const badJson = await refuse('bad-element', [mustFind(), { expect: 'maybe', file: 'a', start_line: 0 }]);
    expect(badJson.details[0]).toMatchObject({ index: 1, field: 'expected_output' });
    expect((await refuse('not-a-list', 'nope')).details[0]!.field).toBe('expected_output');
    expect(await suiteCounts(pg.handle.db)).toEqual(before);
  });

  it('runs a saved case, edits clear its result, delete removes it (AC-21, 33)', async () => {
    const saved = (await save('run-edit-delete')).json();
    const ran = await app.inject({ method: 'POST', url: `/eval-cases/${saved.id}/runs` });
    expect(ran.statusCode).toBe(200);
    expect(ran.json().last_result).toMatchObject({ status: 'passed', agent_version: 1 });

    const edit = await app.inject({
      method: 'PUT',
      url: `/eval-cases/${saved.id}`,
      payload: saveBody('run-edit-delete', [mustFind(), { ...mustFind(), expect: 'must_not_flag', start_line: 10, end_line: 10 }]),
    });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().last_result).toBeNull();
    expect(edit.json().expected).toHaveLength(2);

    const del = await app.inject({ method: 'DELETE', url: `/eval-cases/${saved.id}` });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${saved.id}` })).statusCode).toBe(404);
    const listed = (await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` })).json();
    expect(listed.some((c: { id: string }) => c.id === saved.id)).toBe(false);
  });

  it('checks a PUT name against the case owner\'s own suite (AC-26, plan 35)', async () => {
    const db = pg.handle.db;
    const [skill] = await db
      .insert(t.skills)
      .values({ workspaceId, name: 'owner-scope-skill', description: 'd', type: 'custom', source: 'manual', body: 'b' })
      .returning();
    const skillCase = (name: string) => ({
      workspaceId,
      agentId: null,
      skillId: skill!.id,
      name,
      inputDiff: PR_DIFF,
      inputFiles: ['src/config.ts'],
      expected: [mustFind()],
    });
    const [first, second] = await db
      .insert(t.evalSuiteCases)
      .values([skillCase('skill-one'), skillCase('skill-two')])
      .returning();
    const agentCase = (await save('agent-owned-name')).json();

    // A skill case may reuse a name that only the agent suite holds ...
    const ok = await app.inject({ method: 'PUT', url: `/eval-cases/${first!.id}`, payload: saveBody('agent-owned-name') });
    expect([ok.statusCode, ok.json().skill_id, ok.json().agent_id]).toEqual([200, skill!.id, null]);
    // ... but not one held by a sibling skill case.
    const dup = await app.inject({ method: 'PUT', url: `/eval-cases/${second!.id}`, payload: saveBody('agent-owned-name') });
    expect(dup.statusCode).toBe(422);
    expect(dup.json().error.message).toMatch(/already used/);
    // The agent case keeps its own name untouched.
    const still = await app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` });
    expect(still.json().some((c: { id: string; skill_id: unknown }) => c.id === agentCase.id && c.skill_id === null)).toBe(true);
  });

  it('refuses every paid call when the provider has no key, and creates nothing (AC-79)', async () => {
    const own = await save('anthropic-case', [mustFind()], {}, anthropicAgentId);
    expect(own.statusCode).toBe(201); // saving is free; only runs need a key
    const before = await suiteCounts(pg.handle.db);
    const callsBefore = llm.calls.length;

    const draft = await app.inject({
      method: 'POST',
      url: `/agents/${anthropicAgentId}/eval-draft-runs`,
      payload: { input: { diff: PR_DIFF }, expected_output: [mustFind()] },
    });
    expect([draft.statusCode, draft.json().error.code]).toEqual([422, 'no_api_key']);
    expect(draft.json().error.message).toBe('no API key for anthropic');

    const single = await app.inject({ method: 'POST', url: `/eval-cases/${own.json().id}/runs` });
    expect(single.json().error.code).toBe('no_api_key');
    const suite = await app.inject({ method: 'POST', url: `/agents/${anthropicAgentId}/eval-runs` });
    expect(suite.json().error.code).toBe('no_api_key');

    expect(await suiteCounts(pg.handle.db)).toEqual({ ...before });
    expect(llm.calls.length).toBe(callsBefore);
  });

  it('answers 404 for an unknown agent and 422 for a malformed id', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/agents/${ghost}/eval-cases` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/agents/not-a-uuid/eval-cases' })).statusCode).toBe(422);
  });
});
