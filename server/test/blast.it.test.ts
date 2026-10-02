import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { isolatedTestConfig } from './helpers/config.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import { MockForgeClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import { BFS_DEPTH, INDEXER_VERSION, MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';
import { BlastRadius, PrHistory } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('GET /pulls/:id/blast and /history (plan 18)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    return buildApp({
      config: isolatedTestConfig(),
      db: pg.handle.db,
      overrides: {
        forge: new MockForgeClient({
          mergedPulls: [
            { number: 42, title: 'self', author: 'me', merged_at: '2026-01-02T00:00:00Z', paths: ['src/lib/money.ts'] },
            { number: 7, title: 'Prior', author: 'bob', merged_at: '2026-01-01T00:00:00Z', paths: ['src/lib/money.ts'] },
          ],
        }),
      },
    });
  }

  async function insertPr(files: string[], wsId: string = workspaceId) {
    const db = pg.handle.db;
    const name = `blast-repo-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: wsId,
        repoId: repo!.id,
        number: 42,
        title: 'Touch money',
        author: 'me',
        branch: 'feat/m',
        base: 'main',
        headSha: 'abcdef0123456789',
        additions: 0,
        deletions: 0,
        filesCount: files.length,
        status: 'needs_review',
      })
      .returning();
    await db.insert(t.prFiles).values(files.map((path) => ({ prId: pr!.id, path, additions: 1, deletions: 0 })));
    return { repo: repo!, pr: pr! };
  }

  async function buildIndex(repoId: string) {
    const r = new RepoIntelRepository(pg.handle.db);
    const sym = (path: string, name: string, exported = true) => ({
      repoId, path, name, kind: 'function', line: 1, endLine: 10, exported, signature: null, contentHash: 'h',
    });
    const ref = (fromPath: string, toSymbol: string, line: number) => ({
      repoId, fromPath, toSymbol, line, contentHash: 'h',
    });
    await r.insertSymbols([
      sym('src/lib/money.ts', 'formatMoney'),
      sym('src/routes/invoices.ts', 'listInvoices'),
      sym('src/routes/billing.ts', 'billingCron'),
      sym('src/routes/api.ts', 'mountApi'),
    ]);
    await r.insertReferences([
      ref('src/routes/invoices.ts', 'formatMoney', 12),
      ref('src/routes/billing.ts', 'formatMoney', 20),
      ref('src/routes/api.ts', 'listInvoices', 5),
    ]);
    await r.replaceEdges(repoId, [
      { fromFile: 'src/routes/invoices.ts', toFile: 'src/lib/money.ts' },
      { fromFile: 'src/routes/billing.ts', toFile: 'src/lib/money.ts' },
      { fromFile: 'src/routes/api.ts', toFile: 'src/routes/invoices.ts' },
    ]);
    await r.resolveReferences(repoId, { reset: true });
    await r.replaceFileRank(
      repoId,
      ['src/lib/money.ts', 'src/routes/invoices.ts', 'src/routes/billing.ts', 'src/routes/api.ts'].map(
        (filePath, i) => ({ filePath, pagerank: 0.1, hotness: 0, rank: 0.5 - i * 0.1, percentile: 50 }),
      ),
    );
    await r.replaceFileFacts(repoId, [
      { filePath: 'src/routes/invoices.ts', endpoints: ['GET /invoices'], crons: [] },
      { filePath: 'src/routes/billing.ts', endpoints: [], crons: ['0 0 * * *'] },
    ]);
    await r.upsertIndexState({
      repoId,
      lastIndexedSha: 'abc',
      indexerVersion: INDEXER_VERSION,
      status: 'full',
      filesIndexed: 4,
      filesSkipped: 0,
      stats: {},
    });
  }

  it('returns the grouped map over a seeded index', async () => {
    const { repo, pr } = await insertPr(['src/lib/money.ts']);
    await buildIndex(repo.id);
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadius.parse(res.json());
    expect(body.degraded).toBe(false);
    expect(body.reason).toBeNull();
    expect(body.limits).toEqual({ callers_per_symbol: MAX_CALLERS_PER_SYMBOL, depth: BFS_DEPTH });
    const g = body.downstream.find((x) => x.symbol === 'formatMoney')!;
    const files = g.callers.map((c) => c.file);
    expect(files).toEqual(expect.arrayContaining(['src/routes/invoices.ts', 'src/routes/billing.ts']));
    expect(files).not.toContain('src/lib/money.ts');
    expect(g.endpoints_affected).toContain('GET /invoices');
    expect(g.crons_affected).toEqual(['0 0 * * *']);
    expect(g.endpoints_affected).not.toContain('0 0 * * *');
    const d2 = g.callers.find((c) => c.depth === 2)!;
    expect(d2).toMatchObject({ file: 'src/routes/api.ts', via: 'listInvoices' });
    await app.close();
  });

  it('degrades with no_data when the repo has no index', async () => {
    const { pr } = await insertPr(['src/lib/money.ts']);
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = BlastRadius.parse(res.json());
    expect(body.degraded).toBe(true);
    expect(body.reason).toBe('no_data');
    await app.close();
  });

  it('404s for an unknown pull request', async () => {
    const app = await makeApp();
    for (const p of ['blast', 'history']) {
      const res = await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/${p}` });
      expect(res.statusCode).toBe(404);
    }
    await app.close();
  });

  it('returns prior PRs and excludes the PR itself', async () => {
    const { pr } = await insertPr(['src/lib/money.ts']);
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/history` });
    expect(res.statusCode).toBe(200);
    const body = PrHistory.parse(res.json());
    expect(body.status).toBe('ok');
    expect(body.history.map((h) => h.pr_number)).toEqual([7]);
    await app.close();
  });

  // a PR id that is not a UUID is rejected by the params schema, never reaching the service
  it('422s for a non-UUID pull request id', async () => {
    const app = await makeApp();
    for (const p of ['blast', 'history']) {
      const res = await app.inject({ method: 'GET', url: `/pulls/not-a-uuid/${p}` });
      expect(res.statusCode).toBe(422);
    }
    await app.close();
  });

  // horizontal escalation: a PR in another workspace is invisible (404), even with its real id
  it('404s for a pull request that belongs to another workspace', async () => {
    const [other] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-${seq++}` })
      .returning();
    const { pr } = await insertPr(['src/lib/money.ts'], other!.id);
    const app = await makeApp();
    for (const p of ['blast', 'history']) {
      const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/${p}` });
      expect(res.statusCode).toBe(404);
    }
    await app.close();
  });

  // a forge failure degrades to status 'unavailable' with HTTP 200 and leaks no error text
  it('reports history as unavailable (200) when the forge throws, without leaking the error', async () => {
    const { pr } = await insertPr(['src/lib/money.ts']);
    class FailingForge extends MockForgeClient {
      override async listMergedPullsTouching(): Promise<never> {
        throw new Error('upstream failed with token test-token-123');
      }
    }
    const app = await buildApp({
      config: isolatedTestConfig(),
      db: pg.handle.db,
      overrides: { forge: new FailingForge() },
    });
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/history` });
    expect(res.statusCode).toBe(200);
    expect(PrHistory.parse(res.json())).toEqual({ status: 'unavailable', history: [] });
    expect(res.body).not.toContain('test-token-123');
    await app.close();
  });
});
