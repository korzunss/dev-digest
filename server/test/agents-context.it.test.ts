import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockForgeClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-context] Docker not available — skipping integration tests.');
}

/**
 * `GET/PUT /agents/:id/context` over a real Postgres: ordered own links,
 * docs inherited from ENABLED skills (skill order, minus own paths), the
 * tenancy boundary, input validation, and that links never bump the version.
 */
d('/agents/:id/context', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), forge: new MockForgeClient() },
    });
  }

  type App = Awaited<ReturnType<typeof makeApp>>;

  async function createAgent(app: App, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number };
  }

  async function createSkill(app: App, name: string, enabled = true) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: 'd', type: 'custom', body: '# Rule', enabled },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  it('stores own links in the posted order and drops duplicates', async () => {
    const app = await makeApp();
    const agent = await createAgent(app, 'ctx-order');
    const put = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context`,
      payload: { paths: ['specs/b.md', 'docs/a.md', 'specs/b.md'] },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().links.map((l: { path: string }) => l.path)).toEqual([
      'specs/b.md',
      'docs/a.md',
    ]);
    const read = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/context` })).json();
    expect(read.links.map((l: { order: number }) => l.order)).toEqual([0, 1]);
    expect(read.inherited).toEqual([]);
    await app.close();
  });

  it('stores canonical paths: ./ and // collapse, duplicates drop', async () => {
    const app = await makeApp();
    const agent = await createAgent(app, 'ctx-canonical');
    const put = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context`,
      payload: { paths: ['./specs/a.md', 'specs/a.md', 'docs//b.md'] },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().links.map((l: { path: string }) => l.path)).toEqual([
      'specs/a.md',
      'docs/b.md',
    ]);
    await app.close();
  });

  it('inherits docs from enabled skills in skill order, without own paths or disabled skills', async () => {
    const app = await makeApp();
    const agent = await createAgent(app, 'ctx-inherit');
    const first = await createSkill(app, 'ctx-skill-first');
    const second = await createSkill(app, 'ctx-skill-second');
    const off = await createSkill(app, 'ctx-skill-off', false);
    const put = (skillId: string, paths: string[]) =>
      app.inject({ method: 'PUT', url: `/skills/${skillId}/context`, payload: { paths } });
    await put(first.id, ['docs/one.md', 'docs/own.md']);
    await put(second.id, ['docs/two.md', 'docs/one.md']);
    await put(off.id, ['docs/off.md']);
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [first.id, second.id, off.id] },
    });
    await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context`,
      payload: { paths: ['docs/own.md'] },
    });

    const read = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/context` })).json();
    expect(read.inherited).toEqual([
      { path: 'docs/one.md', skill_id: first.id, skill_name: 'ctx-skill-first' },
      { path: 'docs/two.md', skill_id: second.id, skill_name: 'ctx-skill-second' },
    ]);
    await app.close();
  });

  it("another workspace's agent is a 404 for GET and PUT", async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-ctx' }).returning();
    const foreign = await new AgentsRepository(db).insert({
      workspaceId: otherWs!.id,
      name: 'Foreign ctx',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'x',
    });
    expect(
      (await app.inject({ method: 'GET', url: `/agents/${foreign.id}/context` })).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/agents/${foreign.id}/context`,
          payload: { paths: ['docs/a.md'] },
        })
      ).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('rejects traversal, absolute and non-markdown paths', async () => {
    const app = await makeApp();
    const agent = await createAgent(app, 'ctx-validate');
    for (const bad of ['../x.md', '/etc/a.md', 'a.txt']) {
      const res = await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}/context`,
        payload: { paths: [bad] },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).toBeLessThan(500);
    }
    await app.close();
  });

  // `C:/a.md` passes the body schema, so only the service's normalisePath can refuse it
  it('a path the schema lets through but normalisePath refuses is a 422 and stores nothing', async () => {
    const app = await makeApp();
    const agent = await createAgent(app, 'ctx-normalise-reject');
    const url = `/agents/${agent.id}/context`;
    const ok = await app.inject({ method: 'PUT', url, payload: { paths: ['specs/keep.md'] } });
    expect(ok.statusCode).toBe(200);

    const res = await app.inject({ method: 'PUT', url, payload: { paths: ['docs/fine.md', 'C:/a.md'] } });
    expect(res.statusCode).toBe(422);
    const read = (await app.inject({ method: 'GET', url })).json();
    expect(read.links.map((l: { path: string }) => l.path)).toEqual(['specs/keep.md']);

    for (const bad of ['a\\..\\..\\b.md', 'specs/../../b.md']) {
      const r = await app.inject({ method: 'PUT', url, payload: { paths: [bad] } });
      expect(r.statusCode, bad).toBeGreaterThanOrEqual(400);
      expect(r.statusCode, bad).toBeLessThan(500);
    }
    await app.close();
  });

  it('does not bump the agent version', async () => {
    const app = await makeApp();
    const agent = await createAgent(app, 'ctx-version');
    await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context`,
      payload: { paths: ['docs/a.md'] },
    });
    const after = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(after.version).toBe(agent.version);
    await app.close();
  });
});
