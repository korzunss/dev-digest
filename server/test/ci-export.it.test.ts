import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { CiInstallResult, CiPreview, CiInstallationView } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { isolatedTestConfig } from './helpers/config.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockForgeClient, MockRunnerBundleSource, MockSecretsProvider } from '../src/adapters/mocks.js';
import { AppError } from '../src/platform/errors.js';
import { CI_BRANCH } from '../src/modules/ci/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-export] Docker not available — skipping integration tests.');
}

const TRAILER_MSG = 'Add DevDigest CI review\n\nDevDigest-Export: agent=x version=1';

/** Export-to-CI preview / install (plan 41, S12, T8): real Postgres, MockForgeClient `ci` options. */
d('CI export routes (plan 41)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
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

  async function makeApp(forge?: MockForgeClient) {
    const app = await buildApp({
      config: isolatedTestConfig(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider({}),
        runnerBundle: new MockRunnerBundleSource(),
        ...(forge ? { forge } : {}),
      },
    });
    apps.push(app);
    return app;
  }

  async function setup(provider: 'openrouter' | 'openai' = 'openrouter') {
    const db = pg.handle.db;
    const name = `ci-repo-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [agent] = await db
      .insert(t.agents)
      .values({ workspaceId, name: `Agent ${seq}`, provider, model: 'x/y', systemPrompt: 'review' })
      .returning();
    return { repo: repo!, agent: agent! };
  }

  const body = (repoId: string, extra: Record<string, unknown> = {}) => ({
    repo_id: repoId,
    triggers: ['opened', 'synchronize'],
    post_as: 'github_review',
    ...extra,
  });
  const install = (app: Awaited<ReturnType<typeof makeApp>>, agentId: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/agents/${agentId}/ci/install`, payload: payload as object });
  const installations = async (db: PgFixture['handle']['db'], agentId: string) =>
    db.select().from(t.ciInstallations).where(eq(t.ciInstallations.agentId, agentId));

  it('preview lists the files and flags an existing installation', async () => {
    const { repo, agent } = await setup();
    const app = await makeApp(new MockForgeClient());
    const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/ci/preview`, payload: body(repo.id) });
    expect(res.statusCode).toBe(200);
    const pre = res.json() as CiPreview;
    expect(pre.blocked).toBeNull();
    expect(pre.file_count).toBe(pre.files.length);
    expect(pre.files.map((f) => f.path)).toContain('.github/workflows/devdigest-review.yml');
    expect(pre.existing_installation_id).toBeNull();
  });

  it('AC-68: a non-OpenRouter agent is blocked in preview and refused on install', async () => {
    const { repo, agent } = await setup('openai');
    const forge = new MockForgeClient();
    const app = await makeApp(forge);
    const pre = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/ci/preview`, payload: body(repo.id) })).json() as CiPreview;
    expect(pre.blocked?.code).toBe('provider_not_openrouter');
    expect(pre.files).toEqual([]);
    const res = await install(app, agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('provider_not_openrouter');
    expect(forge.committed).toEqual([]);
    expect(await installations(pg.handle.db, agent.id)).toHaveLength(0);
  });

  it('a repo that is not a connected GitHub repo is 422 repo_not_github', async () => {
    const { agent } = await setup();
    const app = await makeApp(new MockForgeClient());
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/ci/preview`,
      payload: body('00000000-0000-4000-8000-000000000000'),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('repo_not_github');
  });

  it('AC-30: zip mode returns the archive, touches no forge and records a manual installation', async () => {
    const { repo, agent } = await setup();
    const forge = new MockForgeClient();
    const app = await makeApp(forge);
    const res = await install(app, agent.id, body(repo.id, { mode: 'zip' }));
    expect(res.statusCode).toBe(200);
    const out = res.json() as CiInstallResult;
    expect(out.zip_base64).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(out.pr_url).toBeNull();
    expect(out.installation.mode).toBe('manual');
    expect(out.installation.runner_version).toBe('1.0.0');
    expect(forge.committed).toEqual([]);
    expect(forge.openedPrs).toEqual([]);
  });

  it('AC-10: preview reports the existing installation id once the agent is installed on the repo', async () => {
    const { repo, agent } = await setup();
    const app = await makeApp(new MockForgeClient());
    const out = (await install(app, agent.id, body(repo.id, { mode: 'zip' }))).json() as CiInstallResult;
    const pre = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/ci/preview`, payload: body(repo.id) })).json() as CiPreview;
    expect(pre.existing_installation_id).toBe(out.installation.id);
  });

  it('AC-14: memory.jsonl holds only this repo\'s entries, never global, team or another repo\'s', async () => {
    const { repo, agent } = await setup();
    const other = await setup();
    const db = pg.handle.db;
    const row = (scope: 'repo' | 'global' | 'team', repoId: string | null, content: string) => ({
      workspaceId,
      repoId,
      scope,
      kind: 'fact' as const,
      content,
    });
    await db.insert(t.memory).values([
      row('repo', repo.id, 'mine'),
      row('global', null, 'global-secret'),
      row('team', null, 'team-secret'),
      row('global', repo.id, 'global-with-repo'),
      row('repo', other.repo.id, 'other-repo'),
    ]);
    const forge = new MockForgeClient();
    const res = await install(await makeApp(forge), agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(res.statusCode).toBe(200);
    const mem = forge.committed[0]!.files.find((f) => f.path === '.devdigest/memory.jsonl')!;
    const lines = mem.contents.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toEqual([{ kind: 'fact', content: 'mine' }]);
  });

  it('opens an export PR on a fresh branch with the DevDigest-Export trailer, then upserts one row per (agent, repo)', async () => {
    const { repo, agent } = await setup();
    const branches = new Map();
    const forge = new MockForgeClient({ ci: { branches } });
    const app = await makeApp(forge);
    const res = await install(app, agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(res.statusCode).toBe(200);
    const out = res.json() as CiInstallResult;
    expect(out.pr_url).toBe('https://github.com/mock/mock/pull/1');
    expect(out.installation.pr_number).toBe(1);
    expect(forge.committed).toHaveLength(1);
    expect(forge.committed[0]!.expectedHeadSha).toBeNull();
    expect(forge.committed[0]!.message).toContain(`DevDigest-Export: agent=${agent.id} version=${agent.version}`);
    // Stale agent manifests / skills are pruned in the same commit.
    expect(forge.committed[0]!.prune).toEqual([
      { prefix: '.devdigest/agents/', suffix: '.yaml' },
      { prefix: '.devdigest/skills/', suffix: '.md' },
    ]);

    // Second install: the branch exists with our commit and the PR is open → reuse (AC-31).
    const again = await install(app, agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(again.statusCode).toBe(200);
    expect(await installations(pg.handle.db, agent.id)).toHaveLength(1);
  });

  it('refuses a second agent on a repo that already runs another one (409), in both modes, and commits nothing', async () => {
    const { repo, agent } = await setup();
    const [other] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name: 'Other Reviewer', provider: 'openrouter', model: 'x/y', systemPrompt: 'p' })
      .returning();
    const forge = new MockForgeClient({ ci: { branches: new Map() } });
    const app = await makeApp(forge);
    expect((await install(app, agent.id, body(repo.id, { mode: 'open_pr' }))).statusCode).toBe(200);

    for (const mode of ['open_pr', 'zip']) {
      const res = await install(app, other!.id, body(repo.id, { mode }));
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toMatchObject({ code: 'repo_has_other_agent' });
      expect(res.json().error.message).toContain(agent.name);
    }
    expect(forge.committed).toHaveLength(1);
    expect(await installations(pg.handle.db, other!.id)).toHaveLength(0);
    // The agent that owns the installation may still update it.
    expect((await install(app, agent.id, body(repo.id, { mode: 'open_pr' }))).statusCode).toBe(200);
  });

  it('AC-31: reuses an open export PR and commits on top of the branch head', async () => {
    const { repo, agent } = await setup();
    const forge = new MockForgeClient({
      ci: {
        branches: new Map([[CI_BRANCH, { sha: 'abc123', protected: false }]]),
        commitsAhead: { [CI_BRANCH]: [{ sha: '1', message: TRAILER_MSG }] },
        openPr: { url: 'https://github.com/acme/x/pull/7', number: 7 },
      },
    });
    const app = await makeApp(forge);
    const res = await install(app, agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(res.statusCode).toBe(200);
    expect((res.json() as CiInstallResult).installation.pr_number).toBe(7);
    expect(forge.committed[0]!.expectedHeadSha).toBe('abc123');
    expect(forge.openedPrs).toEqual([]);
    expect(forge.deletedBranches).toEqual([]);
  });

  it('AC-32: deletes and recreates the branch when no PR is open and every commit is ours', async () => {
    const { repo, agent } = await setup();
    const forge = new MockForgeClient({
      ci: {
        branches: new Map([[CI_BRANCH, { sha: 'abc123', protected: false }]]),
        commitsAhead: { [CI_BRANCH]: [{ sha: '1', message: TRAILER_MSG }] },
      },
    });
    const app = await makeApp(forge);
    const res = await install(app, agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(res.statusCode).toBe(200);
    expect(forge.deletedBranches).toEqual([CI_BRANCH]);
    expect(forge.committed[0]!.expectedHeadSha).toBeNull();
    expect(forge.openedPrs).toHaveLength(1);
  });

  it('AC-59: foreign commits and a protected branch are refused (409) and delete nothing', async () => {
    const { repo, agent } = await setup();
    const foreign = new MockForgeClient({
      ci: {
        branches: new Map([[CI_BRANCH, { sha: 'abc123', protected: false }]]),
        commitsAhead: { [CI_BRANCH]: [
          { sha: '1', message: TRAILER_MSG },
          {
            sha: 'be3b4eb0123456789',
            message: `\u202E${'x'.repeat(80)}\n\nbody line`,
            author: `burn\u2066\u200Fjohn${'y'.repeat(80)}`,
            date: '2026-07-08T10:00:00Z',
          },
        ] },
      },
    });
    const res = await install(await makeApp(foreign), agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('foreign_commits');
    expect(res.json().error.details).toEqual({
      truncated: false,
      sha: 'be3b4eb',
      author: `burnjohn${'y'.repeat(55)}…`, // bidi controls stripped, capped at 64
      date: '2026-07-08T10:00:00Z',
      subject: `${'x'.repeat(71)}…`,
      ahead_count: 2,
      branch_url: `https://github.com/${repo.fullName}/tree/${CI_BRANCH}`,
    });
    expect(foreign.deletedBranches).toEqual([]);
    expect(foreign.committed).toEqual([]);

    const prot = new MockForgeClient({ ci: { branches: new Map([[CI_BRANCH, { sha: 'abc', protected: true }]]) } });
    const res2 = await install(await makeApp(prot), agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(res2.statusCode).toBe(409);
    expect(res2.json().error.code).toBe('branch_protected');
    expect(prot.deletedBranches).toEqual([]);
    expect(await installations(pg.handle.db, agent.id)).toHaveLength(0);
  });

  it('foreign_commits: a real foreign commit before the page sentinel still reports truncated, without counting the sentinel', async () => {
    const { repo, agent } = await setup();
    const forge = new MockForgeClient({
      ci: {
        branches: new Map([[CI_BRANCH, { sha: 'abc123', protected: false }]]),
        commitsAhead: { [CI_BRANCH]: [{ sha: 'f00dbeef00', message: 'hand-made', date: 'not a date' }, { sha: '', message: '(truncated)' }] },
      },
    });
    const res = await install(await makeApp(forge), agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(res.json().error.details).toMatchObject({ truncated: true, sha: 'f00dbee', date: null, ahead_count: 1 });
  });

  // AC-59: the foreign-commit and protection checks run before an open PR can make the branch reusable
  it('AC-59: an open export PR does not make foreign commits or a protected branch pushable', async () => {
    const { repo, agent } = await setup();
    const open = { url: 'https://github.com/acme/x/pull/7', number: 7 };
    const foreign = new MockForgeClient({
      ci: {
        branches: new Map([[CI_BRANCH, { sha: 'abc', protected: false }]]),
        commitsAhead: { [CI_BRANCH]: [{ sha: '2', message: 'hand edit' }] },
        openPr: open,
      },
    });
    const r1 = await install(await makeApp(foreign), agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(r1.statusCode).toBe(409);
    expect(r1.json().error.code).toBe('foreign_commits');
    expect(foreign.committed).toEqual([]);

    const prot = new MockForgeClient({
      ci: { branches: new Map([[CI_BRANCH, { sha: 'abc', protected: true }]]), openPr: open },
    });
    const r2 = await install(await makeApp(prot), agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(r2.statusCode).toBe(409);
    expect(r2.json().error.code).toBe('branch_protected');
    expect(prot.committed).toEqual([]);
  });

  it('AC-59: the more-than-100-commits sentinel is refused with no sha', async () => {
    const { repo, agent } = await setup();
    const forge = new MockForgeClient({
      ci: {
        branches: new Map([[CI_BRANCH, { sha: 'abc', protected: false }]]),
        commitsAhead: { [CI_BRANCH]: [{ sha: '1', message: TRAILER_MSG }, { sha: '', message: '(truncated)' }] },
      },
    });
    const res = await install(await makeApp(forge), agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(res.statusCode).toBe(409);
    expect(res.json().error.details).toMatchObject({ truncated: true, sha: null, author: null, subject: null, ahead_count: 1 });
  });

  // AC-59: only a trailer at the start of a line marks a commit as ours
  it('AC-59: a commit that merely mentions the trailer mid-line is foreign', async () => {
    const { repo, agent } = await setup();
    const forge = new MockForgeClient({
      ci: {
        branches: new Map([[CI_BRANCH, { sha: 'abc', protected: false }]]),
        commitsAhead: { [CI_BRANCH]: [{ sha: '1', message: 'tweak, see DevDigest-Export: agent=x' }] },
      },
    });
    const res = await install(await makeApp(forge), agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('foreign_commits');
    expect(forge.deletedBranches).toEqual([]);
  });

  // AC-26/AC-29: a fine-grained token has no scope header, so the write itself reports the missing permission
  it('a commit refused for a missing workflow permission is 403 and records nothing', async () => {
    const { repo, agent } = await setup();
    const forge = new MockForgeClient({
      ci: {
        errors: { commitFiles: new AppError('missing_workflow_permission', 'needs workflows: write', 403) },
      },
    });
    const res = await install(await makeApp(forge), agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('missing_workflow_permission');
    expect(forge.openedPrs).toEqual([]);
    expect(await installations(pg.handle.db, agent.id)).toHaveLength(0);
  });

  // the branch moved between the read and the write: refuse, never overwrite
  it('a branch that moved under us is 409 branch_moved and records nothing', async () => {
    const { repo, agent } = await setup();
    const forge = new MockForgeClient({
      ci: {
        branches: new Map([[CI_BRANCH, { sha: 'abc', protected: false }]]),
        commitsAhead: { [CI_BRANCH]: [{ sha: '1', message: TRAILER_MSG }] },
        openPr: { url: 'https://github.com/acme/x/pull/7', number: 7 },
        errors: { commitFiles: new AppError('branch_moved', 'moved', 409) },
      },
    });
    const res = await install(await makeApp(forge), agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('branch_moved');
    expect(await installations(pg.handle.db, agent.id)).toHaveLength(0);
  });

  // horizontal escalation: another workspace's agent or repo cannot be exported
  it('an agent or repo of another workspace is refused', async () => {
    const db = pg.handle.db;
    const { repo, agent } = await setup();
    const [other] = await db.insert(t.workspaces).values({ name: `other-ci-${seq++}` }).returning();
    const [foreignAgent] = await db
      .insert(t.agents)
      .values({ workspaceId: other!.id, name: 'Foreign', provider: 'openrouter', model: 'x/y', systemPrompt: 'p' })
      .returning();
    const [foreignRepo] = await db
      .insert(t.repos)
      .values({ workspaceId: other!.id, owner: 'evil', name: `r${seq}`, fullName: `evil/r${seq}` })
      .returning();
    const forge = new MockForgeClient();
    const app = await makeApp(forge);

    const a = await install(app, foreignAgent!.id, body(repo.id, { mode: 'open_pr' }));
    expect(a.statusCode).toBe(404);
    const r = await install(app, agent.id, body(foreignRepo!.id, { mode: 'open_pr' }));
    expect(r.statusCode).toBe(422);
    expect(r.json().error.code).toBe('repo_not_github');
    const p = await app.inject({ method: 'POST', url: `/agents/${foreignAgent!.id}/ci/preview`, payload: body(repo.id) });
    expect(p.statusCode).toBe(404);
    expect(forge.committed).toEqual([]);
    expect(await installations(db, foreignAgent!.id)).toHaveLength(0);
  });

  it('AC-29: a classic token without the workflow scope is refused (403) and records nothing', async () => {
    const { repo, agent } = await setup();
    const forge = new MockForgeClient({ ci: { scopes: ['repo'] } });
    const res = await install(await makeApp(forge), agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('missing_workflow_permission');
    expect(forge.committed).toEqual([]);
    expect(await installations(pg.handle.db, agent.id)).toHaveLength(0);
  });

  it('a missing GitHub token is 422 token_missing', async () => {
    const { repo, agent } = await setup();
    const res = await install(await makeApp(), agent.id, body(repo.id, { mode: 'open_pr' }));
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('token_missing');
  });

  it('a submitted workflow that breaks an invariant is 422 workflow_invalid', async () => {
    const { repo, agent } = await setup();
    const forge = new MockForgeClient();
    const res = await install(
      await makeApp(forge),
      agent.id,
      body(repo.id, { mode: 'open_pr', workflow: 'name: x\non: push\n' }),
    );
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('workflow_invalid');
    expect(forge.committed).toEqual([]);
  });

  it('AC-19/AC-30: a workflow edited outside name/timeout/runner is refused in both modes, naming the field', async () => {
    const { repo, agent } = await setup();
    const forge = new MockForgeClient();
    const app = await makeApp(forge);
    const pre = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/ci/preview`, payload: body(repo.id) })).json() as CiPreview;
    const wf = pre.files.find((f) => f.path === '.github/workflows/devdigest-review.yml')!.contents;
    const tampered = wf.replace('    steps:', "    container: attacker/img\n    steps:");
    for (const mode of ['open_pr', 'zip']) {
      const res = await install(app, agent.id, body(repo.id, { mode, workflow: tampered }));
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('workflow_invalid');
      expect(res.json().error.message).toContain('jobs.review.container');
    }
    expect(forge.committed).toEqual([]);
    expect(await installations(pg.handle.db, agent.id)).toHaveLength(0);
    const ok = await install(app, agent.id, body(repo.id, { mode: 'zip', workflow: wf.replace('timeout-minutes: 20', 'timeout-minutes: 30') }));
    expect(ok.statusCode).toBe(200);
  });

  it('H1: the committed and zipped workflow is the regenerated text, not the submitted whitespace/comments', async () => {
    const { repo, agent } = await setup();
    const forge = new MockForgeClient();
    const app = await makeApp(forge);
    const pre = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/ci/preview`, payload: body(repo.id) })).json() as CiPreview;
    const wf = pre.files.find((f) => f.path === '.github/workflows/devdigest-review.yml')!.contents;
    const noisy = `# sneaky comment\n${wf.replace('timeout-minutes: 20', 'timeout-minutes:    30   # x')}\n\n`;
    const res = await install(app, agent.id, body(repo.id, { mode: 'open_pr', workflow: noisy }));
    expect(res.statusCode).toBe(200);
    const committed = JSON.stringify(forge.committed);
    const expected = wf.replace('name: DevDigest review', 'name: "DevDigest review"').replace('timeout-minutes: 20', 'timeout-minutes: 30');
    expect(forge.committed[0]!.files.find((f) => f.path === '.github/workflows/devdigest-review.yml')!.contents).toBe(expected);
    expect(committed).toContain('timeout-minutes: 30');
    expect(committed).not.toContain('sneaky comment');
  });

  it('installations view: a PR still open is pending_merge; a read error is unknown', async () => {
    const { repo, agent } = await setup();
    const forge = new MockForgeClient();
    const app = await makeApp(forge);
    await install(app, agent.id, body(repo.id, { mode: 'open_pr' }));
    const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci/installations` })).json() as CiInstallationView[];
    expect(list).toHaveLength(1);
    expect(list[0]!.pr_state).toBe('open');
    expect(list[0]!.state).toBe('pending_merge');

    const broken = await makeApp(new MockForgeClient({ ci: { errors: { getPullState: new Error('boom') } } }));
    const list2 = (await broken.inject({ method: 'GET', url: `/agents/${agent.id}/ci/installations` })).json() as CiInstallationView[];
    expect(list2[0]!.pr_state).toBe('unknown');
  });
});
