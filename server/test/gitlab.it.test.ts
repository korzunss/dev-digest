/**
 * GitLab repos end-to-end through the API surface: adding a GitLab URL, having
 * every forge call route to the GitLab client rather than the GitHub one, and
 * keeping the offline degradation path intact.
 *
 * Gated on Docker (needs Postgres for the repo/PR rows), like the other
 * integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockForgeClient, MockGitClient } from '../src/adapters/mocks.js';
import { RepoService } from '../src/modules/repos/service.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { ForgeClient, RepoRef, PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () =>
  loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    GITLAB_HOST: 'git.acme.com, https://acme.com/gitlab',
  } as NodeJS.ProcessEnv);

/** A forge that also answers the version probe, like the real GitLab client. */
class VersioningForge extends MockForgeClient {
  constructor(private version: string | null) {
    super({ provider: 'gitlab', login: 'korzunss' });
  }
  async instanceVersion(): Promise<string | null> {
    return this.version;
  }
}

/** Records the refs it was called with, so we can assert routing, not just output. */
class RecordingForge extends MockForgeClient {
  public refs: RepoRef[] = [];
  constructor(opts: { pulls?: PrMeta[] } = {}) {
    super({ ...opts, provider: 'gitlab' });
  }
  override async listPullRequests(repo: RepoRef): Promise<PrMeta[]> {
    this.refs.push(repo);
    return super.listPullRequests(repo);
  }
}

d('GitLab repos', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let forge: RecordingForge;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    forge = new RecordingForge();
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { forge, git: new MockForgeGit() },
    });
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('persists provider=gitlab and a null api_base for a gitlab.com URL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: { url: 'https://gitlab.com/acme/backend/payments-api' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.provider).toBe('gitlab');
    expect(body.api_base).toBeNull();
    // A nested group stays in `owner`, so the clone lands nested too.
    expect(body.owner).toBe('acme/backend');
    expect(body.name).toBe('payments-api');
    expect(body.full_name).toBe('acme/backend/payments-api');
  });

  it('records api_base for a self-managed instance under a path prefix', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: { url: 'https://acme.com/gitlab/team/api' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      provider: 'gitlab',
      api_base: 'https://acme.com/gitlab',
      full_name: 'team/api',
    });
  });

  it('refuses an unlisted instance, with or without an explicit provider', async () => {
    // Accepting it would hand the GitLab PAT to a host chosen by the request.
    for (const payload of [
      { url: 'https://git.elsewhere.com/team/api' },
      { url: 'https://git.elsewhere.com/team/api', provider: 'gitlab' },
    ]) {
      const res = await app.inject({ method: 'POST', url: '/repos', payload });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('unknown_forge_host');
    }
  });

  it('refuses a provider that contradicts a known host', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: { url: 'https://github.com/a/b', provider: 'gitlab' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('provider_mismatch');
  });

  it('keeps the same full_name on two forges as two distinct repos', async () => {
    const a = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: { url: 'https://github.com/dual/repo' },
    });
    const b = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: { url: 'https://gitlab.com/dual/repo' },
    });
    expect(a.statusCode).toBe(201);
    // Would be a 200 "already exists" if provider weren't part of the key.
    expect(b.statusCode).toBe(201);
    expect(a.json().id).not.toBe(b.json().id);
  });

  it('routes the PR list through the GitLab client with a provider-bearing ref', async () => {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        provider: 'gitlab',
        apiBase: 'https://git.acme.com',
        owner: 'team/sub',
        name: 'svc',
        fullName: 'team/sub/svc',
      })
      .returning();

    forge.refs = [];
    const res = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls` });
    expect(res.statusCode).toBe(200);

    const ref = forge.refs.at(-1)!;
    expect(ref.provider).toBe('gitlab');
    expect(ref.apiBase).toBe('https://git.acme.com');
    // The full path is what the adapter URL-encodes into the project id.
    expect(ref.path).toBe('team/sub/svc');
  });

  it('clones a GitLab repo from its own host, with the username GitLab accepts', async () => {
    // The riskiest line in the change: refresh() used to rebuild the clone URL
    // as https://github.com/<full_name>.git unconditionally, which would send a
    // GitLab repo (and its PAT) to the wrong host.
    const git = new MockGitClient();
    const secrets = {
      get: async (key: string) =>
        key === 'GITLAB_TOKEN@gitlab.sharksw.com' ? 'scoped-pat' : undefined,
    };
    const app2 = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { forge, git, secrets },
    });
    const service = new RepoService(app2.container);

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        provider: 'gitlab',
        apiBase: 'https://gitlab.sharksw.com',
        owner: 'team',
        name: 'cloned',
        fullName: 'team/cloned',
      })
      .returning();

    await service.runCloneJob({
      repoId: repo!.id,
      owner: 'team',
      name: 'cloned',
      url: 'https://gitlab.sharksw.com/team/cloned.git',
      provider: 'gitlab',
      apiBase: 'https://gitlab.sharksw.com',
    });

    // oauth2, not x-access-token: GitLab rejects GitHub's username with a
    // misleading 403. And the instance-scoped secret wins over a plain one.
    expect(git.cloned.at(-1)!.url).toBe(
      'https://oauth2:scoped-pat@gitlab.sharksw.com/team/cloned.git',
    );
    await app2.close();
  });

  it('clones unauthenticated rather than with the wrong forge token', async () => {
    const git = new MockGitClient();
    // Only a GitHub token is configured; a GitLab clone must not reach for it.
    const secrets = { get: async (key: string) => (key === 'GITHUB_TOKEN' ? 'ghp' : undefined) };
    const app2 = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { forge, git, secrets },
    });
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        provider: 'gitlab',
        apiBase: null,
        owner: 'team',
        name: 'anon',
        fullName: 'team/anon',
      })
      .returning();

    await new RepoService(app2.container).runCloneJob({
      repoId: repo!.id,
      owner: 'team',
      name: 'anon',
      url: 'https://gitlab.com/team/anon.git',
      provider: 'gitlab',
    });

    expect(git.cloned.at(-1)!.url).toBe('https://gitlab.com/team/anon.git');
    await app2.close();
  });

  it('test-connection reports the instance version and where it connected', async () => {
    // Which diff endpoint exists depends on this number, so it is not decor —
    // and a self-managed PAT checked against gitlab.com is how today's 401 read.
    const app2 = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        forge: new VersioningForge('14.5.2'),
        secrets: { get: async () => 'pat', set: async () => {} },
      },
    });
    const res = await app2.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'gitlab' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toBe(
      'Connected as @korzunss · GitLab 14.5.2 at https://git.acme.com',
    );
    await app2.close();
  });

  it('test-connection still succeeds when the version cannot be read', async () => {
    const app2 = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        forge: new VersioningForge(null),
        secrets: { get: async () => 'pat', set: async () => {} },
      },
    });
    const res = await app2.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'gitlab' },
    });
    expect(res.json().message).toBe('Connected as @korzunss at https://git.acme.com');
    await app2.close();
  });

  it('still serves persisted PRs when the forge client cannot be built', async () => {
    // No `forge` override and no GITLAB_TOKEN ⇒ container.forge() throws; the
    // route must degrade rather than 500.
    const offline = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { secrets: { get: async () => undefined } },
    });
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'team/sub/svc'));
    const res = await offline.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls` });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    await offline.close();
  });
});

/** Minimal GitClient stand-in — the clone job must not shell out in tests. */
class MockForgeGit {
  async clone(repo: { owner: string; name: string }) {
    return { path: `/tmp/${repo.owner}/${repo.name}` };
  }
  async sync() {
    return { head: 'deadbeef' };
  }
  async currentHead() {
    return 'deadbeef';
  }
  async diff() {
    return { raw: '', files: [] };
  }
  async diffNameOnly() {
    return [];
  }
  async fetchPullHead() {}
  async blame() {
    return [];
  }
  async log() {
    return [];
  }
  async readFile() {
    return '';
  }
  clonePathFor(repo: { owner: string; name: string }) {
    return `/tmp/${repo.owner}/${repo.name}`;
  }
}
