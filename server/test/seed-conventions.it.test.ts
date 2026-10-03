import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { ConventionScanResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { isolatedTestConfig } from './helpers/config.js';
import { buildApp } from '../src/app.js';
import { seed, seedDemoConventions } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SEED_CONVENTIONS } from '../src/db/seed-conventions.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('seedDemoConventions', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('seed() alone writes no convention rows', async () => {
    expect(await pg.handle.db.select().from(t.conventions)).toHaveLength(0);
    expect(await pg.handle.db.select().from(t.conventionScans)).toHaveLength(0);
  });

  it('is idempotent: 1 scan, 3 rows, same ids after a second call', async () => {
    const { db } = pg.handle;
    await seedDemoConventions(db, workspaceId);
    const first = await db.select().from(t.conventions);
    await seedDemoConventions(db, workspaceId);
    const second = await db.select().from(t.conventions);
    expect(await db.select().from(t.conventionScans)).toHaveLength(1);
    expect(second).toHaveLength(SEED_CONVENTIONS.length);
    expect(second.map((r) => r.id).sort()).toEqual(first.map((r) => r.id).sort());
  });

  it('GET /repos/:id/conventions serves the done scan and pending candidates', async () => {
    const app = await buildApp({ config: isolatedTestConfig(), db: pg.handle.db });
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ConventionScanResult;
    expect(body.scan?.status).toBe('done');
    expect(body.candidates).toHaveLength(3);
    expect(body.candidates.every((c) => c.status === 'pending')).toBe(true);
    expect(body.candidates[0]!.rule).toBe(SEED_CONVENTIONS[0]!.rule);
  });
});

d('seedDemoConventions guards', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;
  });

  afterAll(async () => {
    await pg?.stop();
  });

  // a workspace without the acme/payments-api repo is a no-op, not an error
  it('writes nothing when the repo does not exist in the workspace', async () => {
    const { db } = pg.handle;
    await seedDemoConventions(db, '00000000-0000-4000-8000-000000000000');
    expect(await db.select().from(t.conventions)).toHaveLength(0);
    expect(await db.select().from(t.conventionScans)).toHaveLength(0);
  });

  // a scan that already exists (e.g. a real one) is never touched or extended with demo rows
  it('leaves the repo alone when any scan already exists', async () => {
    const { db } = pg.handle;
    await db.insert(t.conventionScans).values({
      workspaceId,
      repoId,
      provider: 'real',
      model: 'real',
      samplePaths: [],
      status: 'error',
    });
    await seedDemoConventions(db, workspaceId);
    const scans = await db.select().from(t.conventionScans);
    expect(scans).toHaveLength(1);
    expect(scans[0]!.provider).toBe('real');
    expect(await db.select().from(t.conventions)).toHaveLength(0);
  });
});
