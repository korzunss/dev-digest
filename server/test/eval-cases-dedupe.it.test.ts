import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed, DEFAULT_WORKSPACE_NAME } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-dedupe] Docker not available — skipping integration tests.');
}

function migrationChunks(): string[] {
  const journalUrl = new URL('../src/db/migrations/meta/_journal.json', import.meta.url);
  const journal = JSON.parse(readFileSync(fileURLToPath(journalUrl), 'utf8')) as {
    entries: { tag: string }[];
  };
  const entry = journal.entries.find((e) => e.tag.endsWith('_dedupe_eval_cases'));
  if (!entry) throw new Error('dedupe_eval_cases migration missing from the journal');
  const sqlUrl = new URL(`../src/db/migrations/${entry.tag}.sql`, import.meta.url);
  return readFileSync(fileURLToPath(sqlUrl), 'utf8')
    .split('--> statement-breakpoint')
    .map((c) => c.trim())
    .filter(Boolean);
}

d('0020 dedupe_eval_cases (real Postgres)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('keeps the case with the latest run, re-points runs, then the unique index can be created', async () => {
    const { db, sql } = pg.handle;
    const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
    const [agent] = await db.select().from(t.agents).limit(1);
    const workspaceId = ws!.id;
    const ownerId = agent!.id;

    await sql.unsafe('DROP INDEX eval_cases_owner_name_idx');

    const mkCase = async (name: string) => {
      const [c] = await db
        .insert(t.evalCases)
        .values({ workspaceId, ownerKind: 'agent', ownerId, name })
        .returning({ id: t.evalCases.id });
      return c!.id;
    };
    const mkRun = (caseId: string, ranAt: string) =>
      db.insert(t.evalRuns).values({ caseId, ranAt: new Date(ranAt) });

    const a = await mkCase('dup');
    const b = await mkCase('dup');
    const c = await mkCase('dup');
    const other = await mkCase('other');
    await mkRun(a, '2026-01-01');
    await mkRun(b, '2026-01-03');
    await mkRun(b, '2026-01-02');
    await mkRun(other, '2026-01-01');
    void c;

    for (const chunk of migrationChunks()) await sql.unsafe(chunk);

    const dups = await db.select().from(t.evalCases).where(eq(t.evalCases.name, 'dup'));
    expect(dups.map((r) => r.id)).toEqual([b]);
    const runs = await db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, b));
    expect(runs).toHaveLength(3);
    const otherRuns = await db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, other));
    expect(otherRuns).toHaveLength(1);
    expect(await db.select().from(t.evalCases).where(eq(t.evalCases.name, 'other'))).toHaveLength(1);

    await sql.unsafe(
      'CREATE UNIQUE INDEX eval_cases_owner_name_idx ON eval_cases (workspace_id, owner_kind, owner_id, name)',
    );
  });
});
