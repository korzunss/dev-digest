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

const NOTHING: Review = { verdict: 'approve', summary: 's', score: 100, findings: [] };
const MUST_FIND: EvalExpectation = { expect: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11 };

type App = Awaited<ReturnType<typeof buildEvalApp>>;

/**
 * Trust boundaries of the eval-pipeline routes: route input is rejected before
 * the service runs, and a resource of another workspace is invisible (404) to
 * every route, read or write, paid or free.
 */
d('eval pipeline: route input and workspace isolation (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: App;
  let llm: ScriptedLLMProvider;
  let ownWs: string;
  let foreignWs: string;
  let ownAgent: string;
  let foreignAgent: string;
  let foreignCase: string;
  let foreignRun: string;
  let ownRun: string;
  let ownOtherAgentRun: string;
  let foreignFinding: string;

  const call = async (req: Parameters<App['inject']>[0]) => {
    const res = await app.inject(req);
    return { status: res.statusCode, body: res.json() };
  };
  const insertRun = async (workspaceId: string, agentId: string) =>
    (
      await pg.handle.db
        .insert(t.evalSuiteRuns)
        .values({ workspaceId, agentId, agentVersion: 1, provider: 'openai', model: 'm', skills: [], status: 'completed' })
        .returning()
    )[0]!.id;
  const validBody = { name: 'a-case', input: { diff: PR_DIFF }, expected_output: [MUST_FIND] };

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    ownWs = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
    llm = new ScriptedLLMProvider([{ match: 'BOUNDARY', review: NOTHING }]);
    app = await buildEvalApp(pg, { openai: llm });

    const mk = async (name: string) =>
      (await call({ method: 'POST', url: '/agents', payload: { name, provider: 'openai', model: 'm', system_prompt: 'BOUNDARY' } })).body.id as string;
    ownAgent = await mk('Own Agent');
    const otherOwn = await mk('Other Own Agent');

    // A second workspace with its own agent, case, run and finding.
    foreignWs = (await pg.handle.db.insert(t.workspaces).values({ name: 'foreign' }).returning())[0]!.id;
    foreignAgent = (
      await pg.handle.db
        .insert(t.agents)
        .values({ workspaceId: foreignWs, name: 'Foreign Agent', provider: 'openai', model: 'm', systemPrompt: 'BOUNDARY' })
        .returning()
    )[0]!.id;
    foreignCase = (
      await pg.handle.db
        .insert(t.evalSuiteCases)
        .values({
          workspaceId: foreignWs,
          agentId: foreignAgent,
          name: 'foreign-case',
          inputDiff: PR_DIFF,
          inputFiles: [],
          expected: [MUST_FIND],
        })
        .returning()
    )[0]!.id;
    foreignRun = await insertRun(foreignWs, foreignAgent);
    ownRun = await insertRun(ownWs, ownAgent);
    ownOtherAgentRun = await insertRun(ownWs, otherOwn);
    const { pr } = await insertPr(pg.handle.db, foreignWs);
    foreignFinding = await insertFinding(pg.handle.db, { workspaceId: foreignWs, prId: pr.id, agentId: foreignAgent });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  // Every route that names a foreign resource answers 404 and changes nothing.
  it('hides another workspace\'s agent, case, run and finding from every route (horizontal)', async () => {
    const before = await suiteCounts(pg.handle.db);
    const foreignAgentRow = (await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, foreignAgent)))[0]!;
    const probes: Parameters<App['inject']>[0][] = [
      { method: 'GET', url: `/agents/${foreignAgent}/eval-cases` },
      { method: 'POST', url: `/agents/${foreignAgent}/eval-cases`, payload: validBody },
      { method: 'GET', url: `/agents/${foreignAgent}/eval` },
      { method: 'POST', url: `/agents/${foreignAgent}/eval-runs` },
      { method: 'POST', url: `/agents/${foreignAgent}/eval-draft-runs`, payload: { input: validBody.input, expected_output: [MUST_FIND] } },
      { method: 'PUT', url: `/eval-cases/${foreignCase}`, payload: { ...validBody, name: 'hijacked' } },
      { method: 'DELETE', url: `/eval-cases/${foreignCase}` },
      { method: 'POST', url: `/eval-cases/${foreignCase}/runs` },
      { method: 'GET', url: `/eval-runs/${foreignRun}` },
      { method: 'POST', url: `/eval-runs/${foreignRun}/promote` },
      { method: 'GET', url: `/eval-runs/compare?a=${ownRun}&b=${foreignRun}` },
      { method: 'GET', url: `/findings/${foreignFinding}/eval-draft` },
      // An own agent must not adopt a foreign finding as its case source either.
      { method: 'POST', url: `/agents/${ownAgent}/eval-cases`, payload: { ...validBody, source_finding_id: foreignFinding } },
    ];
    for (const probe of probes) {
      const res = await app.inject(probe);
      expect(res.statusCode, `${probe.method} ${probe.url}`).toBe(404);
    }
    // Nothing was written, spent, renamed or promoted.
    expect(await suiteCounts(pg.handle.db)).toEqual(before);
    expect(llm.calls.length).toBe(0);
    const [fcase] = await pg.handle.db.select().from(t.evalSuiteCases).where(eq(t.evalSuiteCases.id, foreignCase));
    expect(fcase!.name).toBe('foreign-case');
    const after = (await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, foreignAgent)))[0]!;
    expect(after.version).toBe(foreignAgentRow.version);
  });

  // The workspace-wide views and "Run all agents" never reach into another workspace.
  it('leaves the foreign agent out of the dashboard and out of run-all (horizontal)', async () => {
    const dash = await call({ method: 'GET', url: '/eval/dashboard' });
    expect(dash.status).toBe(200);
    expect(JSON.stringify(dash.body)).not.toContain(foreignAgent);
    expect(JSON.stringify(dash.body)).not.toContain(foreignRun);

    const all = await call({ method: 'POST', url: '/eval/run-all', payload: { confirm: true } });
    expect(all.status).toBe(200);
    expect(JSON.stringify(all.body)).not.toContain(foreignAgent);
    const foreignRuns = await pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, foreignAgent));
    expect(foreignRuns.map((r) => r.id)).toEqual([foreignRun]);
    expect(llm.calls.length).toBe(0);
  });

  // Two runs of different agents are not a comparison, even inside one workspace.
  it('refuses to compare runs of two different agents with 422', async () => {
    const res = await call({ method: 'GET', url: `/eval-runs/compare?a=${ownRun}&b=${ownOtherAgentRun}` });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('runs_not_comparable');
  });

  // A malformed request is rejected by the route schema, before the service or the model.
  it('rejects malformed bodies, queries and ids with 422, writing nothing and calling no model', async () => {
    const before = await suiteCounts(pg.handle.db);
    const probes: Parameters<App['inject']>[0][] = [
      { method: 'POST', url: `/agents/${ownAgent}/eval-cases`, payload: { input: { diff: PR_DIFF }, expected_output: [] } },
      { method: 'POST', url: `/agents/${ownAgent}/eval-cases`, payload: { ...validBody, name: '' } },
      { method: 'POST', url: `/agents/${ownAgent}/eval-cases`, payload: { ...validBody, input: {} } },
      { method: 'POST', url: `/agents/${ownAgent}/eval-cases`, payload: { ...validBody, source_finding_id: 'not-a-uuid' } },
      { method: 'POST', url: `/agents/${ownAgent}/eval-draft-runs`, payload: {} },
      { method: 'PUT', url: `/eval-cases/${foreignCase}`, payload: {} },
      { method: 'GET', url: `/agents/${ownAgent}/eval?period=forever` },
      { method: 'GET', url: `/eval-runs/compare?a=${ownRun}` },
      { method: 'GET', url: `/eval-runs/compare?a=${ownRun}&b=nope` },
      { method: 'GET', url: '/eval-runs/not-a-uuid' },
      { method: 'POST', url: '/eval-runs/not-a-uuid/promote' },
      { method: 'POST', url: '/agents/not-a-uuid/eval-runs' },
      { method: 'GET', url: '/findings/not-a-uuid/eval-draft' },
    ];
    for (const probe of probes) {
      const res = await app.inject(probe);
      expect(res.statusCode, `${probe.method} ${probe.url}`).toBe(422);
    }
    expect(await suiteCounts(pg.handle.db)).toEqual(before);
    expect(llm.calls.length).toBe(0);
  });
});
