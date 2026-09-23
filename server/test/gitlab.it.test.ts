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
import { MockForgeClient } from '../src/adapters/mocks.js';
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

  it('rejects an unknown host unless the provider is explicit', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: { url: 'https://git.elsewhere.com/team/api' },
    });
    expect(bad.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'POST',
      url: '/repos',
      payload: { url: 'https://git.elsewhere.com/team/api', provider: 'gitlab' },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().api_base).toBe('https://git.elsewhere.com');
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
