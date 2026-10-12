import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockForgeClient } from '../src/adapters/mocks.js';
import { AgentsService } from '../src/modules/agents/service.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-versions] Docker not available — skipping integration tests.');
}

/**
 * Agent version history — the read path over `agent_versions` snapshots that
 * `POST/PUT /agents` already write. Covers: a fresh agent has v1, a config edit
 * appends v2 (newest-first), single-version fetch, and the 404s (unknown agent,
 * unknown version, cross-workspace).
 */
d('GET /agents/:id/versions', () => {
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

  const createBody = {
    name: 'Versioned Agent',
    provider: 'openai' as const,
    model: 'gpt-4o-mini',
    system_prompt: 'Review the diff.',
  };

  it('a new agent has exactly one version (v1) capturing its config', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/agents', payload: createBody });
    expect(created.statusCode).toBe(201);
    const agentId = created.json().id as string;

    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/versions` });
    expect(res.statusCode).toBe(200);
    const versions = res.json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      agent_id: agentId,
      version: 1,
      config: { provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review the diff.' },
    });
    expect(typeof versions[0].created_at).toBe('string');
    await app.close();
  });

  it('a config edit appends a new version; list is newest-first', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: createBody })
    ).json().id as string;

    // A config-affecting change (model) bumps the version → snapshot v2.
    const updated = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}`,
      payload: { model: 'gpt-4o' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);

    const versions = (
      await app.inject({ method: 'GET', url: `/agents/${agentId}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0].config.model).toBe('gpt-4o');
    expect(versions[1].config.model).toBe('gpt-4o-mini');
    await app.close();
  });

  it('toggling enabled does NOT create a new version', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: createBody })
    ).json().id as string;

    await app.inject({ method: 'PUT', url: `/agents/${agentId}`, payload: { enabled: false } });

    const versions = (
      await app.inject({ method: 'GET', url: `/agents/${agentId}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('GET /agents/:id/versions/:version returns one snapshot', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: createBody })
    ).json().id as string;
    await app.inject({ method: 'PUT', url: `/agents/${agentId}`, payload: { model: 'gpt-4o' } });

    const v1 = await app.inject({ method: 'GET', url: `/agents/${agentId}/versions/1` });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toMatchObject({ version: 1, config: { model: 'gpt-4o-mini' } });
    await app.close();
  });

  it('404s for an unknown agent and an unknown version', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: createBody })
    ).json().id as string;
    const ghost = '00000000-0000-0000-0000-000000000000';

    expect(
      (await app.inject({ method: 'GET', url: `/agents/${ghost}/versions` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/agents/${ghost}/versions/1` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/agents/${agentId}/versions/99` })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('a non-numeric :version is rejected at the edge (422, not 404)', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: createBody })
    ).json().id as string;
    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/versions/abc` });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('versions are workspace-scoped: another tenant cannot read them', async () => {
    const { db } = pg.handle;
    // An agent that lives in a DIFFERENT workspace than the request context.
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other' }).returning();
    const repo = new AgentsRepository(db);
    const foreign = await repo.insert({
      workspaceId: otherWs!.id,
      name: 'Foreign',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'x',
    });

    const service = new AgentsService({ db } as unknown as Container);
    const [{ id: defaultWs }] = await db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));

    // Owner can read; a different workspace is denied (undefined → 404 at route).
    expect(await service.listVersions(otherWs!.id, foreign.id)).toHaveLength(1);
    expect(await service.listVersions(defaultWs!, foreign.id)).toBeUndefined();
    expect(await service.getVersion(defaultWs!, foreign.id, 1)).toBeUndefined();
  });

  describe('messages, diff and restore', () => {
    const create = async (app: Awaited<ReturnType<typeof makeApp>>) =>
      (await app.inject({ method: 'POST', url: '/agents', payload: createBody })).json().id as string;
    const versionsOf = async (app: Awaited<ReturnType<typeof makeApp>>, id: string) =>
      (await app.inject({ method: 'GET', url: `/agents/${id}/versions` })).json();

    it('stores the message only on a bump; a name-only edit creates no version', async () => {
      const app = await makeApp();
      const id = await create(app);
      await app.inject({ method: 'PUT', url: `/agents/${id}`, payload: { name: 'Renamed', message: 'ignored' } });
      expect(await versionsOf(app, id)).toHaveLength(1);
      await app.inject({ method: 'PUT', url: `/agents/${id}`, payload: { model: 'gpt-4o', message: 'Bigger model' } });
      const list = await versionsOf(app, id);
      expect(list.map((v: { message: string | null }) => v.message)).toEqual(['Bigger model', null]);
      await app.close();
    });

    it('rejects a message over 500 characters with 422', async () => {
      const app = await makeApp();
      const id = await create(app);
      const res = await app.inject({
        method: 'PUT',
        url: `/agents/${id}`,
        payload: { model: 'gpt-4o', message: 'x'.repeat(501) },
      });
      expect(res.statusCode).toBe(422);
      await app.close();
    });

    it('lists a malformed snapshot as config: null', async () => {
      const app = await makeApp();
      const id = await create(app);
      await pg.handle.db
        .update(t.agentVersions)
        .set({ configJson: { nonsense: true } })
        .where(eq(t.agentVersions.agentId, id));
      const list = await versionsOf(app, id);
      expect(list[0].config).toBeNull();
      const restore = await app.inject({ method: 'POST', url: `/agents/${id}/versions/1/restore` });
      expect(restore.statusCode).toBe(422);
      await app.close();
    });

    it('diffs a version against the current config; 404s for unknown agent or version', async () => {
      const app = await makeApp();
      const id = await create(app);
      await app.inject({
        method: 'PUT',
        url: `/agents/${id}`,
        payload: { model: 'gpt-4o', system_prompt: 'Review the diff carefully.' },
      });
      const res = await app.inject({ method: 'GET', url: `/agents/${id}/versions/1/diff` });
      expect(res.statusCode).toBe(200);
      const diff = res.json();
      expect(diff).toMatchObject({ from: 1, to: 2, config_available: true, identical: false });
      expect(diff.fields).toEqual([{ field: 'model', from: 'gpt-4o-mini', to: 'gpt-4o' }]);
      expect(diff.prompt_patch).toContain('+Review the diff carefully.');
      expect((await app.inject({ method: 'GET', url: `/agents/${id}/versions/9/diff` })).statusCode).toBe(404);
      const ghost = '00000000-0000-4000-8000-000000000000';
      expect((await app.inject({ method: 'GET', url: `/agents/${ghost}/versions/1/diff` })).statusCode).toBe(404);
      await app.close();
    });

    it('restores a version as a NEW one with an automatic message, even when equal to the current', async () => {
      const app = await makeApp();
      const id = await create(app);
      await app.inject({ method: 'PUT', url: `/agents/${id}`, payload: { model: 'gpt-4o' } });
      const res = await app.inject({ method: 'POST', url: `/agents/${id}/versions/1/restore` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ agent_id: id, version: 3, restored_from: 1, dropped_skill_ids: [] });
      const again = await app.inject({
        method: 'POST',
        url: `/agents/${id}/versions/3/restore`,
        payload: { message: 'Back again' },
      });
      expect(again.json().version).toBe(4);
      const list = await versionsOf(app, id);
      expect(list.map((v: { message: string | null }) => v.message).slice(0, 2)).toEqual([
        'Back again',
        'Restored from v1',
      ]);
      expect(list[1].config.model).toBe('gpt-4o-mini');
      await app.close();
    });

    // --- skills, tenancy, bounds and concurrency (AC-11/16/21/28/32) ---
    type App = Awaited<ReturnType<typeof makeApp>>;
    const defaultWs = async () =>
      (
        await pg.handle.db
          .select({ id: t.workspaces.id })
          .from(t.workspaces)
          .where(eq(t.workspaces.name, 'default'))
      )[0]!.id;
    const makeSkill = async (workspaceId: string, name: string) =>
      (
        await pg.handle.db
          .insert(t.skills)
          .values({ workspaceId, name, description: name, type: 'rubric', source: 'manual', body: `# ${name}` })
          .returning({ id: t.skills.id })
      )[0]!.id;
    const setSkills = (app: App, id: string, skill_ids: string[], extra: object = {}) =>
      app.inject({ method: 'POST', url: `/agents/${id}/skills`, payload: { skill_ids, ...extra } });
    const linkedIds = async (app: App, id: string) =>
      ((await app.inject({ method: 'GET', url: `/agents/${id}/skills` })).json() as { skill_id: string }[]).map(
        (l) => l.skill_id,
      );

    // a skill deleted after the snapshot is reported with its recorded name and deleted: true
    it('diff labels a deleted skill by its recorded name', async () => {
      const app = await makeApp();
      const id = await create(app);
      const skill = await makeSkill(await defaultWs(), 'Doomed rubric');
      expect((await setSkills(app, id, [skill])).statusCode).toBe(200);
      await pg.handle.db.delete(t.skills).where(eq(t.skills.id, skill));
      const diff = (await app.inject({ method: 'GET', url: `/agents/${id}/versions/2/diff` })).json();
      const ref = { id: skill, name: 'Doomed rubric', deleted: true };
      expect(diff.skills.from).toEqual([ref]);
      expect(diff.skills.to).toEqual([]);
      expect(diff.skills.removed).toEqual([ref]);
      await app.close();
    });

    // a snapshot taken before names were recorded: name is null (the client shows "Deleted skill · <id>")
    it('diff gives a deleted skill with no recorded name a null name', async () => {
      const app = await makeApp();
      const id = await create(app);
      const skill = await makeSkill(await defaultWs(), 'Nameless');
      await setSkills(app, id, [skill]);
      const [row] = await pg.handle.db
        .select()
        .from(t.agentVersions)
        .where(and(eq(t.agentVersions.agentId, id), eq(t.agentVersions.version, 2)));
      const { skill_names: _drop, ...bare } = row!.configJson as Record<string, unknown>;
      await pg.handle.db
        .update(t.agentVersions)
        .set({ configJson: bare })
        .where(and(eq(t.agentVersions.agentId, id), eq(t.agentVersions.version, 2)));
      await pg.handle.db.delete(t.skills).where(eq(t.skills.id, skill));
      const diff = (await app.inject({ method: 'GET', url: `/agents/${id}/versions/2/diff` })).json();
      expect(diff.skills.from).toEqual([{ id: skill, name: null, deleted: true }]);
      await app.close();
    });

    // restore keeps recorded order, drops skills deleted since, and reports them
    it('restore drops deleted skills, keeps the rest in order and reports the dropped ids', async () => {
      const app = await makeApp();
      const id = await create(app);
      const ws = await defaultWs();
      const [a, b, c] = [await makeSkill(ws, 'ra'), await makeSkill(ws, 'rb'), await makeSkill(ws, 'rc')] as [
        string,
        string,
        string,
      ];
      await setSkills(app, id, [c, b, a]); // v2
      await pg.handle.db.delete(t.skills).where(eq(t.skills.id, b));
      await app.inject({ method: 'PUT', url: `/agents/${id}`, payload: { model: 'gpt-4o' } }); // v3
      const res = await app.inject({ method: 'POST', url: `/agents/${id}/versions/2/restore` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ version: 4, restored_from: 2, dropped_skill_ids: [b] });
      expect(await linkedIds(app, id)).toEqual([c, a]);
      const newest = (await versionsOf(app, id))[0];
      expect(newest.version).toBe(4);
      expect(newest.config.skills).toEqual([c, a]);
      await app.close();
    });

    // linking one skill: the note lands on the new version; repeating the same link writes nothing
    it('skill_id link stores the message and a repeated identical link creates no version', async () => {
      const app = await makeApp();
      const id = await create(app);
      const skill = await makeSkill(await defaultWs(), 'link-one');
      const link = () =>
        app.inject({
          method: 'POST',
          url: `/agents/${id}/skills`,
          payload: { skill_id: skill, order: 0, message: 'attach link-one' },
        });
      expect((await link()).statusCode).toBe(200);
      const before = await versionsOf(app, id);
      expect(before[0].version).toBe(2);
      expect(before[0].message).toBe('attach link-one');
      expect((await link()).statusCode).toBe(200);
      expect(await versionsOf(app, id)).toHaveLength(before.length);
      // re-linking without an order is a no-op too (no move to the end, no version)
      const relink = await app.inject({ method: 'POST', url: `/agents/${id}/skills`, payload: { skill_id: skill } });
      expect(relink.statusCode).toBe(200);
      expect(await versionsOf(app, id)).toHaveLength(before.length);
      await app.close();
    });

    // a foreign workspace's agent is invisible to diff and restore, and restore writes nothing there
    it('diff and restore of another workspace\'s agent are 404, and nothing is written', async () => {
      const app = await makeApp();
      const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-versions-http' }).returning();
      const foreign = await new AgentsRepository(pg.handle.db).insert({
        workspaceId: otherWs!.id,
        name: 'Foreign',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'x',
      });
      const diff = await app.inject({ method: 'GET', url: `/agents/${foreign.id}/versions/1/diff` });
      expect(diff.statusCode).toBe(404);
      const restore = await app.inject({ method: 'POST', url: `/agents/${foreign.id}/versions/1/restore` });
      expect(restore.statusCode).toBe(404);
      const rows = await pg.handle.db
        .select()
        .from(t.agentVersions)
        .where(eq(t.agentVersions.agentId, foreign.id));
      expect(rows).toHaveLength(1);
      await app.close();
    });

    // a note over 500 is refused on the skills save and on restore, before any write
    it('rejects a message over 500 characters on skills POST and restore, writing nothing', async () => {
      const app = await makeApp();
      const id = await create(app);
      const skill = await makeSkill(await defaultWs(), 'bounded');
      const long = 'x'.repeat(501);
      expect((await setSkills(app, id, [skill], { message: long })).statusCode).toBe(422);
      const restore = await app.inject({
        method: 'POST',
        url: `/agents/${id}/versions/1/restore`,
        payload: { message: long },
      });
      expect(restore.statusCode).toBe(422);
      expect(await versionsOf(app, id)).toHaveLength(1);
      expect(await linkedIds(app, id)).toEqual([]);
      // boundary: exactly 500 is accepted
      const ok = await app.inject({
        method: 'POST',
        url: `/agents/${id}/versions/1/restore`,
        payload: { message: 'x'.repeat(500) },
      });
      expect(ok.statusCode).toBe(200);
      await app.close();
    });

    // two restores racing on one agent queue on the row lock: no duplicate or skipped version number
    it('concurrent restores yield two consecutive, distinct versions', async () => {
      const app = await makeApp();
      const id = await create(app);
      await app.inject({ method: 'PUT', url: `/agents/${id}`, payload: { model: 'gpt-4o' } }); // v2
      const [r1, r2] = await Promise.all([
        app.inject({ method: 'POST', url: `/agents/${id}/versions/1/restore`, payload: { message: 'one' } }),
        app.inject({ method: 'POST', url: `/agents/${id}/versions/1/restore`, payload: { message: 'two' } }),
      ]);
      expect([r1.statusCode, r2.statusCode]).toEqual([200, 200]);
      expect([r1.json().version, r2.json().version].sort()).toEqual([3, 4]);
      const list = await versionsOf(app, id);
      expect(list.map((v: { version: number }) => v.version)).toEqual([4, 3, 2, 1]);
      expect(list.slice(0, 2).map((v: { message: string }) => v.message).sort()).toEqual(['one', 'two']);
      expect((await app.inject({ method: 'GET', url: `/agents/${id}` })).json().version).toBe(4);
      await app.close();
    });
  });
});
