import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { isolatedTestConfig } from './helpers/config.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { SmartDiffResponse } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[smart-diff] Docker not available — skipping integration tests.');
}

d('GET /pulls/:id/smart-diff (S7, spec 007)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoSeq = 0;

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
    // This route calls no LLM/git/forge — the isolated config keeps it from
    // ever reaching a real secrets.json (server/insights/gotchas.md).
    return buildApp({ config: isolatedTestConfig(), db: pg.handle.db });
  }

  async function insertPrWithFiles(files: [string, number, number][]) {
    const db = pg.handle.db;
    const name = `smart-diff-repo-${repoSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 501,
        title: 'Add a rate limiter',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4a1b2c3d4',
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'needs_review',
      })
      .returning();

    await db
      .insert(t.prFiles)
      .values(files.map(([path, additions, deletions]) => ({ prId: pr!.id, path, additions, deletions })));

    const totalLines = files.reduce((sum, [, a, del]) => sum + a + del, 0);
    return { pr: pr!, totalLines };
  }

  async function setupPr() {
    const db = pg.handle.db;
    const files: [string, number, number][] = [
      ['src/limiter.ts', 20, 2],
      ['src/limiter.test.ts', 15, 0],
      ['vitest.config.ts', 3, 0],
      ['src/index.ts', 1, 0],
      ['README.md', 4, 1],
      ['pnpm-lock.yaml', 30, 5],
    ];
    const { pr, totalLines } = await insertPrWithFiles(files);

    const now = Date.now();

    // Older kind='review' review — a finding here must NOT surface (D3): only
    // the latest kind='review' review counts.
    const [older] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        model: 'seed',
        createdAt: new Date(now - 3 * 60_000),
      })
      .returning();
    await db.insert(t.findings).values({
      reviewId: older!.id,
      file: 'src/index.ts',
      startLine: 7,
      endLine: 7,
      severity: 'WARNING',
      category: 'style',
      title: 'Old finding',
      rationale: 'From a superseded review.',
      confidence: 0.5,
    });

    // Newer kind='summary' review — never counts toward D3's "latest kind='review'".
    const [summary] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'summary',
        model: 'seed',
        createdAt: new Date(now - 2 * 60_000),
      })
      .returning();
    await db.insert(t.findings).values({
      reviewId: summary!.id,
      file: 'src/limiter.ts',
      startLine: 99,
      endLine: 99,
      severity: 'CRITICAL',
      category: 'correctness',
      title: 'Summary finding',
      rationale: 'From a summary review, not a review.',
      confidence: 0.9,
    });

    // Newest kind='review' review — the one D3/D4 draw from.
    const [latest] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        model: 'seed',
        createdAt: new Date(now - 60_000),
      })
      .returning();
    await db.insert(t.findings).values([
      {
        reviewId: latest!.id,
        file: 'src/limiter.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'correctness',
        title: 'Missing bound check',
        rationale: 'Duplicate #1.',
        confidence: 0.8,
      },
      {
        reviewId: latest!.id,
        file: 'src/limiter.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'correctness',
        title: 'Missing bound check (dup)',
        rationale: 'Duplicate #2 — same line, must de-dupe.',
        confidence: 0.8,
      },
      {
        reviewId: latest!.id,
        file: 'src/limiter.test.ts',
        startLine: 3,
        endLine: 3,
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Name the test more precisely',
        rationale: 'Vague test title.',
        confidence: 0.4,
      },
      {
        reviewId: latest!.id,
        file: 'README.md',
        startLine: 1,
        endLine: 1,
        severity: 'WARNING',
        category: 'docs',
        title: 'Outdated doc line',
        rationale: 'Dismissed — must be excluded (D4).',
        confidence: 0.6,
        dismissedAt: new Date(),
      },
    ]);

    return { pr, totalLines };
  }

  it('returns role-ordered groups with the latest review\'s undismissed finding_lines', async () => {
    const app = await makeApp();
    const { pr, totalLines } = await setupPr();

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SmartDiffResponse;

    expect(body.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);

    const byPath = new Map(body.groups.flatMap((g) => g.files.map((f) => [f.path, f] as const)));
    expect(byPath.get('src/limiter.ts')!.finding_lines).toEqual([12]);
    expect(byPath.get('src/index.ts')!.finding_lines).toEqual([]);
    expect(byPath.get('README.md')!.finding_lines).toEqual([]);
    expect(byPath.get('src/limiter.test.ts')!.finding_lines).toEqual([3]);

    const boilerplate = body.groups.find((g) => g.role === 'boilerplate')!;
    expect(boilerplate.files.map((f) => f.path)).toEqual(['pnpm-lock.yaml']);

    expect(body.split_suggestion).toEqual({ too_big: false, total_lines: totalLines, proposed_splits: [] });

    await app.close();
  });

  it('404s for an unknown PR id', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/smart-diff` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('404s for a PR belonging to another workspace (horizontal isolation)', async () => {
    const app = await makeApp();
    const db = pg.handle.db;
    const [otherWs] = await db.insert(t.workspaces).values({ name: `other-ws-${repoSeq++}` }).returning();
    const [otherRepo] = await db
      .insert(t.repos)
      .values({ workspaceId: otherWs!.id, owner: 'other', name: 'secret', fullName: 'other/secret' })
      .returning();
    const [otherPr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: otherWs!.id,
        repoId: otherRepo!.id,
        number: 1,
        title: 'Other workspace PR',
        author: 'x',
        branch: 'b',
        base: 'main',
        headSha: 'cccccccccccccccc',
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'needs_review',
      })
      .returning();

    const res = await app.inject({ method: 'GET', url: `/pulls/${otherPr!.id}/smart-diff` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('groups files before any review exists, with empty finding_lines and no LLM call', async () => {
    const m1 = new MockLLMProvider('openai');
    const m2 = new MockLLMProvider('anthropic');
    const m3 = new MockLLMProvider('openai');
    const db = pg.handle.db;
    const app = await buildApp({
      config: isolatedTestConfig(),
      db,
      overrides: { llm: { openai: m1, anthropic: m2, openrouter: m3 } },
    });

    const { pr, totalLines } = await insertPrWithFiles([
      ['src/limiter.ts', 20, 2],
      ['src/limiter.test.ts', 15, 0],
      ['README.md', 4, 1],
      ['pnpm-lock.yaml', 30, 5],
    ]);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SmartDiffResponse;

    expect(body.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs', 'boilerplate']);
    for (const group of body.groups) {
      for (const file of group.files) {
        expect(file.finding_lines).toEqual([]);
      }
    }
    expect(body.split_suggestion.total_lines).toBe(totalLines);

    expect([m1, m2, m3].every((m) => m.calls.length === 0)).toBe(true);

    const reviews = await db.select().from(t.reviews).where(eq(t.reviews.prId, pr.id));
    expect(reviews).toHaveLength(0);

    await app.close();
  });
});
