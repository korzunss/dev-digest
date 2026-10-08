import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FEATURE_MODELS, OnboardingTourView } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { isolatedTestConfig } from './helpers/config.js';
import { TempCloneGitClient } from './helpers/temp-clone.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockForgeClient, MockSecretsProvider } from '../src/adapters/mocks.js';

// The settings read that resolves the feature model fails: the page GET must still answer.
vi.mock('../src/modules/settings/feature-models.js', async (importActual) => ({
  ...(await importActual<typeof import('../src/modules/settings/feature-models.js')>()),
  resolveFeatureModel: vi.fn().mockRejectedValue(new Error('settings read failed')),
}));

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding-view-resilience] Docker not available — skipping integration tests.');
}

/**
 * SPEC-09 AC-12, AC-24, AC-36: opening the page is a read that never 500s because a
 * side read (here: the model setting) failed — only a missing repo is a 404.
 * Hermetic: `isolatedTestConfig()` and an empty secrets provider; no model is called.
 */
const DEFAULT_MODEL = FEATURE_MODELS.find((f) => f.id === 'onboarding')!;

d('Onboarding Tour GET resilience (SPEC-09)', () => {
  let pg: PgFixture;
  let root: string;
  let workspaceId: string;
  const apps: Array<{ close: () => Promise<unknown> }> = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    root = await mkdtemp(path.join(tmpdir(), 'devdigest-onb-resilience-'));
  });
  afterAll(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
    await rm(root, { recursive: true, force: true }).catch(() => {});
    await pg?.stop();
  });

  // AC-12, AC-24, AC-36: a failing model-setting read falls back to the registry default, status 200
  it('AC-12, AC-36: GET returns 200 with the registry default model when the model setting cannot be read', async () => {
    const app = await buildApp({
      config: isolatedTestConfig(),
      db: pg.handle.db,
      overrides: {
        git: new TempCloneGitClient(root, 'feedfacec0ffee01'),
        forge: new MockForgeClient(),
        secrets: new MockSecretsProvider({}), // never fall back to a real key in the environment
      },
    });
    apps.push(app);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'onb-resilience', fullName: 'acme/onb-resilience', clonePath: null })
      .returning();

    const res = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/onboarding` });

    expect(res.statusCode).toBe(200);
    const view = OnboardingTourView.parse(res.json());
    expect(view.model).toEqual({ provider: DEFAULT_MODEL.defaultProvider, model: DEFAULT_MODEL.defaultModel });
    expect(view.tour.source).toBe('skeleton');
  });
});
