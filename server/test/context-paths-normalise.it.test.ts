import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { asc, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed, DEFAULT_WORKSPACE_NAME } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { normaliseDocPath } from '../src/modules/context/helpers.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context-paths-normalise] Docker not available — skipping integration tests.');
}

function migrationChunks(): string[] {
  const journalUrl = new URL('../src/db/migrations/meta/_journal.json', import.meta.url);
  const journal = JSON.parse(readFileSync(fileURLToPath(journalUrl), 'utf8')) as {
    entries: { tag: string }[];
  };
  const entry = journal.entries.find((e) => e.tag.endsWith('_normalise_context_paths'));
  if (!entry) throw new Error('normalise_context_paths migration missing from the journal');
  const sqlUrl = new URL(`../src/db/migrations/${entry.tag}.sql`, import.meta.url);
  return readFileSync(fileURLToPath(sqlUrl), 'utf8')
    .split('--> statement-breakpoint')
    .map((c) => c.trim())
    .filter(Boolean);
}

// Stored (pre-canonical) rows, in `order` 0..n.
const STORED = ['./specs/a.md', 'specs/a.md', 'docs//b.md', 'docs/./c.md', '.\\insights\\d.md'];
const EXPECTED = ['specs/a.md', 'docs/b.md', 'docs/c.md', 'insights/d.md'];

d('0023 normalise_context_paths (real Postgres)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('the expectation matches normaliseDocPath (deduped)', () => {
    const viaHelper = [...new Set(STORED.map((p) => normaliseDocPath(p)))];
    expect(viaHelper).toEqual(EXPECTED);
  });

  it('canonicalises agent and skill rows, keeps the lower order, and is idempotent', async () => {
    const { db } = pg.handle;
    const [ws] = await db
      .select()
      .from(t.workspaces)
      .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
    const [agent] = await db.select().from(t.agents).limit(1);
    const [skill] = await db
      .insert(t.skills)
      .values({
        workspaceId: ws!.id,
        name: 'normalise-ctx',
        description: 'd',
        type: 'custom',
        source: 'manual',
        body: 'b',
      })
      .returning({ id: t.skills.id });

    await db
      .insert(t.agentContextDocs)
      .values(STORED.map((path, order) => ({ agentId: agent!.id, path, order })));
    await db
      .insert(t.skillContextDocs)
      .values(STORED.map((path, order) => ({ skillId: skill!.id, path, order })));

    const read = async () => ({
      agent: await db
        .select()
        .from(t.agentContextDocs)
        .where(eq(t.agentContextDocs.agentId, agent!.id))
        .orderBy(asc(t.agentContextDocs.order)),
      skill: await db
        .select()
        .from(t.skillContextDocs)
        .where(eq(t.skillContextDocs.skillId, skill!.id))
        .orderBy(asc(t.skillContextDocs.order)),
    });
    const run = async () => {
      for (const chunk of migrationChunks()) await pg.handle.sql.unsafe(chunk);
    };

    await run();
    const first = await read();
    expect(first.agent.map((r) => r.path)).toEqual(EXPECTED);
    expect(first.skill.map((r) => r.path)).toEqual(EXPECTED);
    // `specs/a.md` kept the lower order of the two collapsed rows.
    expect(first.agent[0]).toMatchObject({ path: 'specs/a.md', order: 0 });
    expect(first.skill[0]).toMatchObject({ path: 'specs/a.md', order: 0 });

    await run();
    expect(await read()).toEqual(first);
  });
});
