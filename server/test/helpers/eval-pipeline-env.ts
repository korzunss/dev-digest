import { buildApp } from '../../src/app.js';
import { MockEmbedder, MockGitClient, MockSecretsProvider } from '../../src/adapters/mocks.js';
import * as t from '../../src/db/schema.js';
import { isolatedTestConfig } from './config.js';
import type { PgFixture } from './pg.js';
import type { LLMProvider } from '@devdigest/shared';

/** Shared set-up of the eval-pipeline `.it` tests: one mock PR, hermetic app, finding rows. */
export type Db = PgFixture['handle']['db'];

/** What the mock git client returns for any PR: one added line (new line 11) in src/config.ts. */
export const PR_DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/**
 * An app with no reachable API key: secrets are an empty stub (the local
 * provider would fall back to `process.env`), and only the providers in `llm`
 * resolve. Any other provider id raises `ConfigError` -> `no_api_key`.
 */
export function buildEvalApp(
  pg: PgFixture,
  llm: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>,
) {
  return buildApp({
    config: isolatedTestConfig(),
    db: pg.handle.db,
    overrides: {
      embedder: new MockEmbedder(),
      git: new MockGitClient({ diff: PR_DIFF }),
      secrets: new MockSecretsProvider({}),
      llm,
    },
  });
}

let seq = 0;

/** A repo plus one PR whose stored patch matches `PR_DIFF`. */
export async function insertPr(db: Db, workspaceId: string) {
  const name = `eval-repo-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 100 + seq,
      title: 'Add config',
      author: 'dev',
      branch: 'feat/x',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: '',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

/** A review by `agentId` (null = a vanished agent) holding one finding. */
export async function insertFinding(
  db: Db,
  ids: { workspaceId: string; prId: string; agentId: string | null },
  f: { file?: string; line?: number; title?: string } = {},
): Promise<string> {
  const [review] = await db
    .insert(t.reviews)
    .values({ workspaceId: ids.workspaceId, prId: ids.prId, agentId: ids.agentId, kind: 'review' })
    .returning();
  const line = f.line ?? 11;
  const [row] = await db
    .insert(t.findings)
    .values({
      reviewId: review!.id,
      file: f.file ?? 'src/config.ts',
      startLine: line,
      endLine: line,
      severity: 'high',
      category: 'security',
      title: f.title ?? 'Hardcoded Stripe secret key',
      rationale: 'r',
      confidence: 0.9,
    })
    .returning();
  return row!.id;
}

/** Row counts of the three suite tables: proof that a call "wrote nothing". */
export async function suiteCounts(db: Db) {
  const [cases, runs, results] = await Promise.all([
    db.select().from(t.evalSuiteCases),
    db.select().from(t.evalSuiteRuns),
    db.select().from(t.evalCaseResults),
  ]);
  return { cases: cases.length, runs: runs.length, results: results.length };
}
