import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ConventionScanResult, RepoRef } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockForgeClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { EXTRACTION_SCHEMA_NAME } from '../src/modules/conventions/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * The conventions extractor end to end (spec 004): a real Postgres, a real
 * (temporary) clone, and a model that answers with a fixture.
 *
 * The suite is deliberately one sequence rather than independent cases — the
 * feature's promises are all about what SURVIVES a step (a rejection survives a
 * re-scan; a rejected id cannot be smuggled into a skill), and each of those is
 * only meaningful on top of the state the previous step left behind. Every test
 * re-reads through `GET /repos/:id/conventions`, so the assertion is always
 * about what was persisted, never about a value held in a variable.
 *
 * `MockGitClient` hard-codes `/mock/clones/<owner>/<name>`, which does not
 * exist, so the fixture subclasses it to point at a temp tree — the same trick
 * `context.it.test.ts` uses. That also exercises the macOS `/var` → `/private/var`
 * path in `readSamples`: without `realpath` on BOTH sides of the containment
 * check, every read here would be refused and every scan would sample nothing.
 */
class TempCloneGitClient extends MockGitClient {
  constructor(private root: string) {
    super({ head: HEAD_SHA });
  }
  override clonePathFor(repo: RepoRef): string {
    return path.join(this.root, repo.owner, repo.name);
  }
}

/** What the evidence links are pinned to — `MockGitClient.currentHead()`. */
const HEAD_SHA = 'feedfacec0ffee01';

const USERS_TS = [
  "import { db } from '../db.js';", // 1
  '', // 2
  'export async function getUser(id: string) {', // 3
  '  const user = await db.users.find(id);', // 4
  '  const posts = await db.posts.findMany({ userId: id });', // 5
  '  return { ...user, posts };', // 6
  '}', // 7
].join('\n');

const ORDERS_TS = [
  "import { repo } from '../repo.js';", // 1
  '', // 2
  'export async function listOrders(customerId: string) {', // 3
  '  const orders = await repo.orders.where({ customerId });', // 4
  '  return orders;', // 5
  '}', // 6
].join('\n');

const RULE_ASYNC = 'Always use async/await instead of .then() chains.';
const RULE_NAMING = 'Name an exported accessor after the resource it returns.';
const RULE_GHOST = 'Wrap every outbound HTTP call in the shared retry helper.';
const RULE_ABSENT = 'Compute cart totals in the domain layer, never in a route handler.';

/**
 * One model answer covering all four outcomes of the evidence gate: a clean
 * citation, a real quote at the wrong line, a file that was never sampled, and
 * a quote that is in no file at all. Two survive; the scan's tally accounts for
 * the other two by reason.
 */
const EXTRACTION_FIXTURE = {
  conventions: [
    {
      category: 'async',
      rule: RULE_ASYNC,
      evidence_path: 'src/api/users.ts',
      evidence_line: 4,
      evidence_snippet: '  const user = await db.users.find(id);',
      confidence: 0.91,
    },
    {
      category: 'naming',
      rule: RULE_NAMING,
      // The quote is verbatim; it sits at line 3, not 41. Models quote well and
      // count badly, and this candidate must survive with the line corrected.
      evidence_path: 'src/api/orders.ts',
      evidence_line: 41,
      evidence_snippet: 'export async function listOrders(customerId: string) {',
      confidence: 0.72,
    },
    {
      category: 'error-handling',
      rule: RULE_GHOST,
      // A file the model was never shown — its deep-link would 404 on GitHub.
      evidence_path: 'src/api/ghost.ts',
      evidence_line: 12,
      evidence_snippet: 'return withRetry(() => fetch(url));',
      confidence: 0.88,
    },
    {
      category: 'structure',
      rule: RULE_ABSENT,
      evidence_path: 'src/api/users.ts',
      evidence_line: 5,
      evidence_snippet: 'const total = computeTotal(cart);',
      confidence: 0.64,
    },
  ],
};

d('/repos/:id/conventions', () => {
  let pg: PgFixture;
  let root: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const { db } = pg.handle;

    const [repo] = await db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;

    root = await mkdtemp(path.join(tmpdir(), 'devdigest-conventions-'));
    const clone = path.join(root, 'acme', 'payments-api');
    await mkdir(path.join(clone, 'src', 'api'), { recursive: true });
    await writeFile(path.join(clone, 'package.json'), '{\n  "name": "payments-api"\n}\n');
    await writeFile(path.join(clone, 'src', 'api', 'users.ts'), `${USERS_TS}\n`);
    await writeFile(path.join(clone, 'src', 'api', 'orders.ts'), `${ORDERS_TS}\n`);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true }).catch(() => {});
    await pg?.stop();
  });

  // The feature resolves its model through `resolveFeatureModel(…, 'conventions')`,
  // whose registry default is the cheap OpenRouter lane — so the mock has to be
  // injected under that id, not under 'openai'.
  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new TempCloneGitClient(root),
        forge: new MockForgeClient(),
        llm: {
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: { [EXTRACTION_SCHEMA_NAME]: EXTRACTION_FIXTURE },
          }),
        },
      },
    });
  }

  type App = Awaited<ReturnType<typeof makeApp>>;

  async function readConventions(app: App): Promise<ConventionScanResult> {
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  /** Skills this feature made. The seed ships a library, so a bare count of
   *  `/skills` would never be zero and "nothing was persisted" needs a set. */
  function extractedSkills() {
    return pg.handle.db.select().from(t.skills).where(eq(t.skills.source, 'extracted'));
  }

  const byPath = (result: ConventionScanResult, evidencePath: string) => {
    const found = result.candidates.find((c) => c.evidence_path === evidencePath);
    expect(found).toBeDefined();
    return found!;
  };

  it('extracts, grounds and persists a scan with its candidates', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
      payload: {},
    });
    expect(res.statusCode).toBe(201);

    const { scan, candidates } = res.json() as ConventionScanResult;
    expect(scan).toMatchObject({
      status: 'done',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      commit_sha: HEAD_SHA,
      candidates_raw: 4,
      candidates_kept: 2,
      tokens_in: 100,
      tokens_out: 50,
    });
    // Selection is code, not a model: the config allowlist first, then the
    // deterministic fallback walk — repo-intel has indexed nothing here, which
    // is the state of every freshly added repo.
    expect(scan!.sample_paths).toEqual([
      'package.json',
      'src/api/orders.ts',
      'src/api/users.ts',
    ]);
    expect(candidates).toHaveLength(2);

    // The GET returns the same scan; nothing about the result depended on being
    // the response to the POST that produced it.
    const reread = await readConventions(app);
    expect(reread.scan!.id).toBe(scan!.id);
    expect(reread.candidates.map((c) => c.id).sort()).toEqual(
      candidates.map((c) => c.id).sort(),
    );
    expect(reread.candidates.every((c) => c.status === 'pending')).toBe(true);

    const rows = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.repoId, repoId));
    expect(rows).toHaveLength(2);
    await app.close();
  });

  it('drops a citation to a file it was never shown, and the tally says why', async () => {
    const app = await makeApp();
    const { scan, candidates } = await readConventions(app);

    expect(candidates.map((c) => c.evidence_path)).not.toContain('src/api/ghost.ts');
    expect(candidates.map((c) => c.rule)).not.toContain(RULE_GHOST);
    expect(candidates.map((c) => c.rule)).not.toContain(RULE_ABSENT);
    // Read the tally before suspecting the model: it says how many went and why.
    expect(scan!.dropped).toEqual({ unsampled_file: 1, snippet_absent: 1 });
    await app.close();
  });

  it('CORRECTS a snippet quoted at the wrong line rather than dropping it', async () => {
    const app = await makeApp();
    const orders = byPath(await readConventions(app), 'src/api/orders.ts');

    expect(orders.rule).toBe(RULE_NAMING);
    // Claimed 41, really 3. An off-by-38 must not cost a true rule.
    expect(orders.evidence_line).toBe(3);
    expect(orders.evidence_end_line).toBe(3);
    await app.close();
  });

  it('a rejected candidate is absent from the skill preview', async () => {
    const app = await makeApp();
    const before = await readConventions(app);
    const users = byPath(before, 'src/api/users.ts');
    const orders = byPath(before, 'src/api/orders.ts');

    const accepted = await app.inject({
      method: 'PATCH',
      url: `/conventions/${users.id}`,
      payload: { status: 'accepted' },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ id: users.id, status: 'accepted' });

    const rejected = await app.inject({
      method: 'PATCH',
      url: `/conventions/${orders.id}`,
      payload: { status: 'rejected' },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().status).toBe('rejected');

    const preview = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill/preview`,
      payload: {},
    });
    expect(preview.statusCode).toBe(200);
    const [merged] = preview.json();
    expect(merged).toMatchObject({
      name: 'payments-api-conventions',
      type: 'convention',
      description: '1 house conventions extracted from payments-api',
      evidence_files: ['src/api/users.ts'],
      candidate_ids: [users.id],
    });
    expect(merged.body).toContain(RULE_ASYNC);
    expect(merged.body).toContain('src/api/users.ts:4');
    expect(merged.body).not.toContain(RULE_NAMING);

    // The same call with no body at all, which is how the client sends it when
    // there is nothing to say. Fastify hands a missing body to the validator as
    // `null`, so this is a different code path from `payload: {}` — and it used
    // to 422.
    const bodyless = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill/preview`,
    });
    expect(bodyless.statusCode).toBe(200);
    expect(bodyless.json()).toEqual(preview.json());

    // A preview persists nothing — abandoning the modal leaves no row behind.
    expect(await extractedSkills()).toHaveLength(0);
    await app.close();
  });

  it('refuses a commit carrying a candidate that is not accepted', async () => {
    const app = await makeApp();
    const orders = byPath(await readConventions(app), 'src/api/orders.ts');
    const [merged] = (
      await app.inject({
        method: 'POST',
        url: `/repos/${repoId}/conventions/skill/preview`,
        payload: {},
      })
    ).json();

    // The hand-crafted request the modal would never send: a rejected id posted
    // straight to the commit endpoint. The server re-derives the accepted set,
    // so the answer does not depend on the UI having filtered anything.
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { skills: [{ ...merged, candidate_ids: [...merged.candidate_ids, orders.id] }] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    expect(res.json().error.details.candidate_ids).toEqual([orders.id]);

    // Refused means refused: no half-written skill, and no stamp on the rule.
    expect(await extractedSkills()).toHaveLength(0);
    expect(byPath(await readConventions(app), 'src/api/orders.ts').skill_id ?? null).toBeNull();
    await app.close();
  });

  it("creates a skill with source 'extracted' and its evidence files", async () => {
    const app = await makeApp();
    const [merged] = (
      await app.inject({
        method: 'POST',
        url: `/repos/${repoId}/conventions/skill/preview`,
        payload: {},
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { skills: [merged] },
    });
    expect(res.statusCode).toBe(201);

    const [skill] = res.json();
    expect(skill).toMatchObject({
      name: 'payments-api-conventions',
      type: 'convention',
      source: 'extracted',
      // Unlike an import, this body was assembled from evidence the user just
      // read and approved, so it lands usable rather than awaiting vetting.
      enabled: true,
      evidence_files: ['src/api/users.ts'],
      version: 1,
    });

    const readBack = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(readBack.statusCode).toBe(200);
    expect(readBack.json().body).toContain(RULE_ASYNC);

    // The candidate now points at the skill that consumed it.
    expect(byPath(await readConventions(app), 'src/api/users.ts').skill_id).toBe(skill.id);
    await app.close();
  });

  it('a re-scan keeps both decisions and adds no duplicate row', async () => {
    const app = await makeApp();
    const before = await readConventions(app);
    const skillId = byPath(before, 'src/api/users.ts').skill_id;

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const after = res.json() as ConventionScanResult;
    expect(after.scan!.id).not.toBe(before.scan!.id);

    // Same rules, same rows: the fingerprint upsert refreshed the sighting
    // rather than proposing the two rules a second time.
    const rows = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.repoId, repoId));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id).sort()).toEqual(before.candidates.map((c) => c.id).sort());
    expect(rows.every((r) => r.scanId === after.scan!.id)).toBe(true);

    // And the decisions are untouched — a rejected rule does not come back as
    // pending, an accepted one does not lose the skill it was folded into.
    const users = byPath(after, 'src/api/users.ts');
    const orders = byPath(after, 'src/api/orders.ts');
    expect(users.status).toBe('accepted');
    expect(users.skill_id).toBe(skillId);
    expect(orders.status).toBe('rejected');

    // The rejected rule stays out of the preview across the re-scan too.
    const previews = (
      await app.inject({
        method: 'POST',
        url: `/repos/${repoId}/conventions/skill/preview`,
        payload: {},
      })
    ).json();
    expect(previews[0].candidate_ids).toEqual([users.id]);
    await app.close();
  });

  it('404s for a repo in another workspace and 422s for a malformed patch', async () => {
    const app = await makeApp();
    const { db } = pg.handle;

    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-conventions' }).returning();
    const [foreign] = await db
      .insert(t.repos)
      .values({
        workspaceId: otherWs!.id,
        owner: 'other',
        name: 'tenant-repo',
        fullName: 'other/tenant-repo',
      })
      .returning();

    for (const url of [
      `/repos/${foreign!.id}/conventions`,
      `/repos/${foreign!.id}/conventions/skill/preview`,
    ]) {
      const method = url.endsWith('/preview') ? 'POST' : 'GET';
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode).toBe(404);
    }

    const ghost = '00000000-0000-0000-0000-000000000000';
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/conventions/${ghost}`,
          payload: { status: 'accepted' },
        })
      ).statusCode,
    ).toBe(404);

    const bad = await app.inject({
      method: 'PATCH',
      url: `/conventions/${ghost}`,
      payload: { status: 'maybe' },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('validation_error');
    await app.close();
  });
});
