import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-version-backfill] Docker not available — skipping integration tests.');
}

/** The `--custom` data migration that precedes `agent_versions.message` (0026). */
function backfillSql(): string {
  const journalUrl = new URL('../src/db/migrations/meta/_journal.json', import.meta.url);
  const journal = JSON.parse(readFileSync(fileURLToPath(journalUrl), 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const entry = journal.entries.find((e) => e.tag.startsWith('0026_'));
  if (!entry) throw new Error('0026 backfill migration missing from the journal');
  const sqlUrl = new URL(`../src/db/migrations/${entry.tag}.sql`, import.meta.url);
  return readFileSync(fileURLToPath(sqlUrl), 'utf8');
}

d('agent version snapshots: 0026 backfill and seed (real Postgres)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('seed() snapshots every seeded agent at its version, and re-seeding adds none', async () => {
    const { db } = pg.handle;
    const agents = await db.select().from(t.agents);
    expect(agents.length).toBeGreaterThan(0);
    const before = await db.select().from(t.agentVersions);
    expect(before).toHaveLength(agents.length);
    for (const a of agents) {
      const v = before.find((r) => r.agentId === a.id && r.version === a.version);
      expect(v).toBeDefined();
      expect(v!.message).toBeNull();
    }
    await seed(db);
    expect(await db.select().from(t.agentVersions)).toHaveLength(before.length);
  });

  it('backfills an agent without a snapshot with ordered skills + names, and is idempotent', async () => {
    const { db, sql } = pg.handle;
    await db.delete(t.agentVersions);
    const [agent] = await db.select().from(t.agents).orderBy(t.agents.name);
    const links = await db
      .select({ id: t.skills.id, name: t.skills.name, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(eq(t.agentSkills.agentId, agent!.id))
      .orderBy(t.agentSkills.order);

    await sql.unsafe(backfillSql());

    const rows = await db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agent!.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.version).toBe(agent!.version);
    expect(rows[0]!.message).toBeNull();
    const cfg = rows[0]!.configJson as Record<string, unknown>;
    expect(cfg.skills).toEqual(links.map((l) => l.id));
    expect(cfg.skill_names).toEqual(Object.fromEntries(links.map((l) => [l.id, l.name])));
    expect(cfg.model).toBe(agent!.model);
    expect(cfg.system_prompt).toBe(agent!.systemPrompt);

    const total = (await db.select().from(t.agentVersions)).length;
    await sql.unsafe(backfillSql());
    expect(await db.select().from(t.agentVersions)).toHaveLength(total);
  });
});
