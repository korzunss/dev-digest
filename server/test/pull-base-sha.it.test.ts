/**
 * PR base SHA persistence (plan 07, S4): list sync + poll write `base_sha`,
 * a GitLab-style list (no base_sha) keeps it while the head is unchanged and
 * clears it once the head moved, and the detail refresh sets base/head/files_head.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockForgeClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const BASE_A = 'a'.repeat(40);
const BASE_B = 'b'.repeat(40);

// Non-zero additions so the stats backfill does not run and overwrite the sync.
const pr = (over: Partial<PrMeta> = {}): PrMeta => ({
  number: 11,
  title: 'T',
  author: 'me',
  branch: 'feat/x',
  base: 'main',
  head_sha: 'head1',
  base_sha: BASE_A,
  additions: 5,
  deletions: 1,
  files_count: 1,
  status: 'open',
  ...over,
});

let seq = 0;

d('PR base_sha persistence (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newRepo() {
    const name = `base-sha-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return repo!;
  }
  const row = async (repoId: string) => {
    const [r] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repoId));
    return r!;
  };
  async function list(repoId: string, prs: PrMeta[]) {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { forge: new MockForgeClient({ pulls: prs }) },
    });
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls` });
    expect(res.statusCode).toBe(200);
  }

  it('list sync persists base_sha', async () => {
    const repo = await newRepo();
    await list(repo.id, [pr()]);
    expect((await row(repo.id)).baseSha).toBe(BASE_A);
  });

  it('a re-sync without base_sha and the same head keeps it', async () => {
    const repo = await newRepo();
    await list(repo.id, [pr()]);
    await list(repo.id, [pr({ base_sha: undefined })]);
    expect((await row(repo.id)).baseSha).toBe(BASE_A);
  });

  it('a re-sync without base_sha and a new head clears it', async () => {
    const repo = await newRepo();
    await list(repo.id, [pr()]);
    await list(repo.id, [pr({ base_sha: null, head_sha: 'head2' })]);
    const r = await row(repo.id);
    expect(r.baseSha).toBeNull();
    expect(r.headSha).toBe('head2');
  });

  it('POST /repos/:id/poll persists base_sha', async () => {
    const repo = await newRepo();
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { forge: new MockForgeClient({ pulls: [pr({ base_sha: BASE_B })] }) },
    });
    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/poll` });
    expect(res.statusCode).toBe(200);
    expect((await row(repo.id)).baseSha).toBe(BASE_B);
  });

  it('GET /pulls/:id sets base_sha, head_sha and files_head_sha from the detail', async () => {
    const repo = await newRepo();
    await list(repo.id, [pr()]);
    const before = await row(repo.id);
    const detail = { ...pr({ base_sha: BASE_B, head_sha: 'head9', base: 'develop' }), files: [], commits: [] };
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { forge: new MockForgeClient({ detail }) },
    });
    const res = await app.inject({ method: 'GET', url: `/pulls/${before.id}` });
    expect(res.statusCode).toBe(200);
    const after = await row(repo.id);
    expect(after).toMatchObject({
      baseSha: BASE_B,
      headSha: 'head9',
      base: 'develop',
      filesHeadSha: 'head9',
    });
  });
});
