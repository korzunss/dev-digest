import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import type { CiRefreshResult, CiRunsPage, WorkflowRunMeta } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { isolatedTestConfig } from './helpers/config.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockForgeClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import { AppError, ConfigError } from '../src/platform/errors.js';
import { ARTIFACT_FILE } from '../src/modules/ci/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-ingest] Docker not available — skipping integration tests.');
}

const SHA = 'a'.repeat(40);
const HOUR = 3_600_000;

const artifactJson = (run: { id: number; attempt?: number; sha?: string }, over: Record<string, unknown> = {}) => ({
  schema_version: 1,
  status: 'passed',
  verdict: 'comment',
  gate_tripped: false,
  findings_count: 3,
  critical: 0,
  warning: 2,
  suggestion: 1,
  cost_usd: 0.02,
  duration_ms: 4200,
  tokens_in: 1000,
  tokens_out: 200,
  manifest_schema_version: 1,
  agent_name: 'Reviewer',
  agent_version: 1,
  model: 'x/y',
  runner_version: '1.0.0',
  deps: {},
  node_version: 'v22.0.0',
  commit_sha: run.sha ?? SHA,
  run_id: run.id,
  run_attempt: run.attempt ?? 1,
  error_class: null,
  ...over,
});
const zipOf = (json: unknown) => zipSync({ [ARTIFACT_FILE]: strToU8(JSON.stringify(json)) });

/** Ingest + views (plan 41, S13, T9): real Postgres, MockForgeClient `ci` options. */
d('CI ingest routes (plan 41)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
  let runSeq = 1_000_000;
  const apps: Array<{ close: () => Promise<unknown> }> = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  async function makeApp(forge: MockForgeClient) {
    const app = await buildApp({
      config: isolatedTestConfig(),
      db: pg.handle.db,
      overrides: { secrets: new MockSecretsProvider({}), forge },
    });
    apps.push(app);
    return app;
  }

  async function setup(opts: { repoId?: boolean } = {}) {
    const db = pg.handle.db;
    const name = `ing-repo-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [agent] = await db
      .insert(t.agents)
      .values({ workspaceId, name: `Reviewer ${seq}`, provider: 'openrouter', model: 'x/y', systemPrompt: 'p' })
      .returning();
    const [inst] = await db
      .insert(t.ciInstallations)
      .values({
        agentId: agent!.id,
        repo: repo!.fullName,
        repoId: opts.repoId === false ? null : repo!.id,
        targetType: 'gha',
        mode: 'pr',
        exportedAgentVersion: 1,
        exportedCiFailOn: 'critical',
        workflowVersion: 1,
        prNumber: 5,
      })
      .returning();
    return { repo: repo!, agent: agent!, inst: inst! };
  }

  /** A completed run + its artifact, created `agoMs` ago. */
  function runFixture(agoMs = HOUR, json: Record<string, unknown> = {}, meta: Partial<WorkflowRunMeta> = {}) {
    const id = runSeq++;
    const run: WorkflowRunMeta = {
      id,
      run_attempt: 1,
      head_sha: SHA,
      status: 'completed',
      conclusion: 'success',
      created_at: new Date(Date.now() - agoMs).toISOString(),
      updated_at: new Date(Date.now() - agoMs + 60_000).toISOString(),
      html_url: `https://github.com/acme/x/actions/runs/${id}`,
      pr_numbers: [5],
      ...meta,
    };
    return {
      run,
      artifacts: [{ id: id * 10, name: 'devdigest-result', size_in_bytes: 100, expired: false }],
      bytes: zipOf(artifactJson({ id, attempt: run.run_attempt, sha: run.head_sha }, json)),
    };
  }
  function forgeWith(fixtures: ReturnType<typeof runFixture>[], extra: Record<string, unknown> = {}) {
    return new MockForgeClient({
      ci: {
        runs: fixtures.map((f) => f.run),
        artifacts: Object.fromEntries(fixtures.map((f) => [f.run.id, f.artifacts])),
        artifactBytes: Object.fromEntries(fixtures.filter((f) => f.artifacts[0]).map((f) => [f.artifacts[0]!.id, f.bytes])),
        ...extra,
      },
    });
  }
  const refresh = async (app: Awaited<ReturnType<typeof makeApp>>, agentId: string | null) =>
    (await app.inject({ method: 'POST', url: '/ci/refresh', payload: { agent_id: agentId } })).json() as CiRefreshResult;
  const runs = async (app: Awaited<ReturnType<typeof makeApp>>, qs = '') =>
    (await app.inject({ method: 'GET', url: `/ci/runs${qs}` })).json() as CiRunsPage;

  it('AC-49: records each (run, attempt) once across two refreshes and links the local PR', async () => {
    const { repo, agent, inst } = await setup();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: repo.id, number: 5, title: 't', author: 'a', branch: 'b', base: 'main',
        headSha: SHA, additions: 1, deletions: 0, filesCount: 1, status: 'needs_review',
      })
      .returning();
    const f = runFixture();
    const app = await makeApp(forgeWith([f], { jobUrl: 'https://github.com/acme/x/actions/runs/1/job/9' }));

    expect((await refresh(app, agent.id)).recorded).toBe(1);
    expect((await refresh(app, agent.id)).recorded).toBe(0);

    const page = await runs(app, `?agent_id=${agent.id}`);
    expect(page.items).toHaveLength(1);
    const item = page.items[0]!;
    expect(item).toMatchObject({
      repo: repo.fullName, pr_number: 5, status: 'passed', verdict: 'comment', findings_count: 3,
      agent_deleted: false, job_url: 'https://github.com/acme/x/actions/runs/1/job/9',
      local_pr: { repo_id: repo.id, number: 5 },
    });
    const [cursorRow] = await pg.handle.db.select().from(t.ciInstallations).where(eq(t.ciInstallations.id, inst.id));
    expect(cursorRow!.scanCursor).not.toBeNull();
    expect(pr!.id).toBeTruthy();
  });

  it('AC-69: the mirror agent_runs row has source ci, no pr_id and no run_skills', async () => {
    const { agent } = await setup();
    const f = runFixture();
    const app = await makeApp(forgeWith([f]));
    await refresh(app, agent.id);
    const rows = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.agentId, agent.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe('ci');
    expect(rows[0]!.prId).toBeNull();
    expect(rows[0]!.status).toBe('done');
    const skills = await pg.handle.db.select().from(t.runSkills).where(eq(t.runSkills.runId, rows[0]!.id));
    expect(skills).toHaveLength(0);
  });

  it('AC-47: a SHA mismatch is rejected with a reason and not recorded', async () => {
    const { agent } = await setup();
    const f = runFixture(HOUR, { commit_sha: 'b'.repeat(40) });
    const app = await makeApp(forgeWith([f]));
    const out = await refresh(app, agent.id);
    expect(out.recorded).toBe(0);
    expect(out.rejected).toEqual([expect.objectContaining({ run_id: String(f.run.id), reason: 'sha_mismatch' })]);
    expect((await runs(app, `?agent_id=${agent.id}`)).items).toHaveLength(0);
  });

  it('AC-50: a run without an artifact (or an expired one) records nothing', async () => {
    const { agent } = await setup();
    const none = runFixture();
    none.artifacts = [];
    const expired = runFixture();
    expired.artifacts = [{ ...expired.artifacts[0]!, expired: true }];
    const forge = forgeWith([none, expired]);
    const listArtifacts = vi.spyOn(forge, 'listRunArtifacts');
    const app = await makeApp(forge);
    const out = await refresh(app, agent.id);
    expect(out).toMatchObject({ recorded: 0, rejected: [], errors: [] });
    expect(listArtifacts).toHaveBeenCalledTimes(2);
    // The scan cursor moved past both runs: a second refresh does not list their artifacts again.
    expect(await refresh(app, agent.id)).toMatchObject({ recorded: 0, rejected: [], errors: [] });
    expect(listArtifacts).toHaveBeenCalledTimes(2);
  });

  it('AC-61: an installation whose repo is gone is not polled', async () => {
    const { agent } = await setup({ repoId: false });
    const app = await makeApp(forgeWith([runFixture()]));
    expect((await refresh(app, agent.id)).recorded).toBe(0);
  });

  it('AC-58: a run older than 30 days is not ingested', async () => {
    const { agent } = await setup();
    const app = await makeApp(forgeWith([runFixture(31 * 24 * HOUR)]));
    expect((await refresh(app, agent.id)).recorded).toBe(0);
  });

  it('AC-51: a token error is reported per repo and keeps the earlier runs', async () => {
    const { agent } = await setup();
    const good = await makeApp(forgeWith([runFixture()]));
    await refresh(good, agent.id);
    const bad = await makeApp(
      new MockForgeClient({ ci: { errors: { listWorkflowRuns: new ConfigError('GITHUB_TOKEN is not configured') } } }),
    );
    const out = await refresh(bad, agent.id);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]!.message).toContain('GITHUB_TOKEN');
    expect((await runs(bad, `?agent_id=${agent.id}`)).items).toHaveLength(1);
  });

  it('AC-55: a deleted agent’s run stays listed as deleted; removing an installation keeps runs (AC-60)', async () => {
    const { agent, inst } = await setup();
    const app = await makeApp(forgeWith([runFixture()]));
    await refresh(app, agent.id);
    const del = await app.inject({ method: 'DELETE', url: `/ci/installations/${inst.id}` });
    expect(del.statusCode).toBe(204);
    expect((await runs(app, `?agent_id=${agent.id}`)).items).toHaveLength(1);

    await pg.handle.db.delete(t.agents).where(eq(t.agents.id, agent.id));
    const page = await runs(app, '?since=2000-01-01T00:00:00Z');
    const gone = page.items.filter((i) => i.agent_id === null && i.agent_deleted);
    expect(gone.length).toBeGreaterThanOrEqual(1);
  });

  it('paginates runs with an opaque cursor, and rejects a forged one', async () => {
    const { agent } = await setup();
    const fx = [runFixture(HOUR), runFixture(2 * HOUR), runFixture(3 * HOUR)];
    const app = await makeApp(forgeWith(fx));
    await refresh(app, agent.id);
    const first = await runs(app, `?agent_id=${agent.id}&limit=2`);
    expect(first.items).toHaveLength(2);
    expect(first.next_cursor).not.toBeNull();
    const res2 = await app.inject({ method: 'GET', url: `/ci/runs?agent_id=${agent.id}&limit=2&cursor=${first.next_cursor}` });
    expect(res2.statusCode).toBe(200);
    const second = res2.json() as CiRunsPage;
    expect(second.items).toHaveLength(1);
    expect(second.next_cursor).toBeNull();
    const bad = await app.inject({ method: 'GET', url: '/ci/runs?cursor=not-a-cursor' });
    expect(bad.statusCode).toBe(422);
  });

  it('POST /ci/refresh without a body is refused', async () => {
    const app = await makeApp(new MockForgeClient());
    const res = await app.inject({ method: 'POST', url: '/ci/refresh' });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  // AC-58: a refresh looks at no more than the newest 100 runs
  it('AC-58: a window with more than 100 runs is read page by page, nothing is dropped', async () => {
    const { agent, inst } = await setup();
    const fx = Array.from({ length: 101 }, (_, i) => runFixture(HOUR + i * 60_000));
    const app = await makeApp(forgeWith(fx));
    const out = await refresh(app, agent.id);
    expect(out).toMatchObject({ recorded: 101, errors: [] });
    const rows = await pg.handle.db.select().from(t.ciRuns).where(eq(t.ciRuns.repoFullName, inst.repo));
    expect(rows.map((r) => r.githubRunId)).toContain(fx[100]!.run.id);
  });

  it('a re-run (same created_at, new attempt, newer updated_at) is ingested; the old attempt is not re-fetched', async () => {
    const { agent } = await setup();
    const first = runFixture();
    const forge1 = forgeWith([first]);
    expect((await refresh(await makeApp(forge1), agent.id)).recorded).toBe(1);

    const rerun = {
      ...first,
      run: { ...first.run, run_attempt: 2, updated_at: new Date().toISOString() },
      bytes: zipOf(artifactJson({ id: first.run.id, attempt: 2, sha: first.run.head_sha }, {})),
    };
    const forge2 = forgeWith([rerun]);
    const listArtifacts = vi.spyOn(forge2, 'listRunArtifacts');
    const app2 = await makeApp(forge2);
    expect((await refresh(app2, agent.id)).recorded).toBe(1);
    expect(listArtifacts).toHaveBeenCalledTimes(1);
    // Nothing changed since: no further artifact calls.
    expect((await refresh(app2, agent.id)).recorded).toBe(0);
    expect(listArtifacts).toHaveBeenCalledTimes(1);
    expect((await runs(app2, `?agent_id=${agent.id}`)).items).toHaveLength(2);
  });

  // AC-46: repo / PR / SHA / agent name come from GitHub + our DB, never from artifact claims
  it('AC-46: identity comes from the GitHub run and our DB, not the artifact', async () => {
    const { agent, inst } = await setup();
    const withPr = runFixture(HOUR, { agent_name: 'Impostor' }, { pr_numbers: [5], head_sha: SHA });
    const noPr = runFixture(2 * HOUR, {}, { pr_numbers: [] });
    const app = await makeApp(forgeWith([withPr, noPr]));
    expect((await refresh(app, agent.id)).recorded).toBe(2);
    const rows = await pg.handle.db.select().from(t.ciRuns).where(eq(t.ciRuns.repoFullName, inst.repo));
    const a = rows.find((r) => r.githubRunId === withPr.run.id)!;
    expect(a.agentName).toBe(agent.name);
    expect(a.agentName).not.toBe('Impostor');
    expect(a.prNumber).toBe(5);
    expect(a.headSha).toBe(SHA);
    expect(rows.find((r) => r.githubRunId === noPr.run.id)!.prNumber).toBeNull();
  });

  // AC-46: an artifact that tries to name its own repo / PR is rejected by the strict schema
  it('AC-46: an artifact carrying extra identity fields is rejected as schema_invalid', async () => {
    const { agent } = await setup();
    const f = runFixture(HOUR, { repo: 'victim/repo', pr_number: 99 });
    const app = await makeApp(forgeWith([f]));
    const out = await refresh(app, agent.id);
    expect(out.recorded).toBe(0);
    expect(out.rejected).toEqual([expect.objectContaining({ run_id: String(f.run.id), reason: 'schema_invalid' })]);
  });

  // AC-47: each artifact defect is rejected with its own reason and records nothing
  it('AC-47: oversized zip, oversized json, bad schema and an attempt mismatch are rejected, not recorded', async () => {
    const { agent, inst } = await setup();
    const bigZip = runFixture(HOUR);
    bigZip.bytes = new Uint8Array(1_048_577);
    const bigJson = runFixture(2 * HOUR);
    bigJson.bytes = zipSync({ [ARTIFACT_FILE]: new Uint8Array(300_000) });
    const badSchema = runFixture(3 * HOUR, { findings_count: -1 });
    const otherAttempt = runFixture(4 * HOUR, { run_attempt: 2 });
    const app = await makeApp(forgeWith([bigZip, bigJson, badSchema, otherAttempt]));
    const out = await refresh(app, agent.id);
    expect(out.recorded).toBe(0);
    const reasonOf = (f: ReturnType<typeof runFixture>) => out.rejected.find((r) => r.run_id === String(f.run.id))?.reason;
    expect(reasonOf(bigZip)).toBe('zip_too_large');
    expect(reasonOf(bigJson)).toBe('json_too_large');
    expect(reasonOf(badSchema)).toBe('schema_invalid');
    expect(reasonOf(otherAttempt)).toBe('attempt_mismatch');
    const rows = await pg.handle.db.select().from(t.ciRuns).where(eq(t.ciRuns.repoFullName, inst.repo));
    expect(rows).toHaveLength(0);
  });

  // the forge refuses a download over the cap before we ever see bytes
  it('a download the forge refuses as too large is rejected as zip_too_large', async () => {
    const { agent } = await setup();
    const f = runFixture();
    const app = await makeApp(
      forgeWith([f], { errors: { downloadArtifact: new AppError('artifact_too_large', 'too big', 413) } }),
    );
    const out = await refresh(app, agent.id);
    expect(out.recorded).toBe(0);
    expect(out.rejected).toEqual([expect.objectContaining({ run_id: String(f.run.id), reason: 'zip_too_large' })]);
  });

  // an artifact that expires between listing and download (410) is skipped, not an error
  it('a 410 on download is skipped without an error or a record', async () => {
    const { agent, inst } = await setup();
    const f = runFixture();
    // listed as live, but the mock has no bytes for it => 410 on download
    const app = await makeApp(
      new MockForgeClient({ ci: { runs: [f.run], artifacts: { [f.run.id]: f.artifacts } } }),
    );
    const out = await refresh(app, agent.id);
    expect(out).toMatchObject({ recorded: 0, rejected: [], errors: [] });
    const rows = await pg.handle.db.select().from(t.ciRuns).where(eq(t.ciRuns.repoFullName, inst.repo));
    expect(rows).toHaveLength(0);
  });

  // horizontal escalation: refresh, removal and the run list stay inside the caller's workspace
  it('another workspace’s installation is not polled, removable, or listed', async () => {
    const db = pg.handle.db;
    const [other] = await db.insert(t.workspaces).values({ name: `other-ing-${seq++}` }).returning();
    const [fAgent] = await db
      .insert(t.agents)
      .values({ workspaceId: other!.id, name: 'Foreign', provider: 'openrouter', model: 'x/y', systemPrompt: 'p' })
      .returning();
    const [fRepo] = await db
      .insert(t.repos)
      .values({ workspaceId: other!.id, owner: 'evil', name: `f${seq}`, fullName: `evil/f${seq}` })
      .returning();
    const [fInst] = await db
      .insert(t.ciInstallations)
      .values({
        agentId: fAgent!.id, repo: fRepo!.fullName, repoId: fRepo!.id, targetType: 'gha', mode: 'pr',
        exportedAgentVersion: 1, exportedCiFailOn: 'critical', workflowVersion: 1, prNumber: 5,
      })
      .returning();
    const f = runFixture();
    const app = await makeApp(forgeWith([f]));

    expect((await refresh(app, fAgent!.id)).recorded).toBe(0);
    expect((await app.inject({ method: 'DELETE', url: `/ci/installations/${fInst!.id}` })).statusCode).toBe(404);
    const stillThere = await db.select().from(t.ciInstallations).where(eq(t.ciInstallations.id, fInst!.id));
    expect(stillThere).toHaveLength(1);
    const foreignRows = await db.select().from(t.ciRuns).where(eq(t.ciRuns.repoFullName, fRepo!.fullName));
    expect(foreignRows).toHaveLength(0);
    const listed = await runs(app, `?agent_id=${fAgent!.id}&since=2000-01-01T00:00:00Z`);
    expect(listed.items).toHaveLength(0);
  });

  // route input: every malformed shape is a 422 and no forge call happens
  it('refresh and runs reject malformed input with 422 before reaching the service', async () => {
    const { agent } = await setup();
    const forge = forgeWith([runFixture()]);
    const app = await makeApp(forge);
    for (const payload of [{}, { agent_id: 'not-a-uuid' }, [agent.id] as unknown as object]) {
      const res = await app.inject({ method: 'POST', url: '/ci/refresh', payload });
      expect(res.statusCode).toBe(422);
    }
    expect((await runs(app, `?agent_id=${agent.id}`)).items).toHaveLength(0);

    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = [
      b64({ ranAt: 'not-a-date', id: 'x' }),
      b64({ ranAt: new Date().toISOString(), id: "1' OR '1'='1" }),
      b64([1, 2]),
      b64({ ranAt: new Date().toISOString() }),
    ];
    for (const cursor of forged) {
      expect((await app.inject({ method: 'GET', url: `/ci/runs?cursor=${cursor}` })).statusCode).toBe(422);
    }
    for (const qs of ['since=garbage', 'status=hacked', 'limit=101', 'limit=0', 'agent_id=nope']) {
      expect((await app.inject({ method: 'GET', url: `/ci/runs?${qs}` })).statusCode).toBe(422);
    }
  });

  it('installations view flags an out-of-date export and a drifted gate', async () => {
    const { agent } = await setup();
    await pg.handle.db.update(t.agents).set({ version: 3, ciFailOn: 'any' }).where(eq(t.agents.id, agent.id));
    const app = await makeApp(new MockForgeClient({ ci: { pullStates: { 5: 'merged' } } }));
    const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci/installations` })).json();
    expect(list[0]).toMatchObject({ pr_state: 'merged', state: 'active', out_of_date: true, gate_drift: true, latest_run: null });
  });
});
