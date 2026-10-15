import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import type { PrMeta } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { isolatedTestConfig } from './helpers/config.js';
import { buildApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockForgeClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';
import { ARTIFACT_FILE } from '../src/modules/ci/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci-run-isolation] Docker not available — skipping integration tests.');
}

const SHA = 'c'.repeat(40);

/** AC-69 (plan 40, S6/S7): CI runs never leak into skill stats or the PR list cost. */
d('CI runs are isolated from local stats (AC-69)', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  // skill stats count only source='local' runs, even if a CI run somehow had a run_skills row
  it('skill stats ignore a completed CI run, including one linked to the skill', async () => {
    const db = pg.handle.db;
    const [ws] = await db.insert(t.workspaces).values({ name: 'ci-isolation-skills' }).returning();
    const [agent] = await db
      .insert(t.agents)
      .values({ workspaceId: ws!.id, name: 'A', provider: 'openrouter', model: 'x/y', systemPrompt: 'p' })
      .returning();
    const [skill] = await db
      .insert(t.skills)
      .values({ workspaceId: ws!.id, name: 'iso-skill', description: 'd', type: 'custom', source: 'manual', body: 'b', enabled: true })
      .returning();
    const base = { workspaceId: ws!.id, agentId: agent!.id, status: 'done', ranAt: new Date() };
    const [local] = await db.insert(t.agentRuns).values({ ...base, source: 'local' }).returning();
    const [ci] = await db.insert(t.agentRuns).values({ ...base, source: 'ci' }).returning();
    await db.insert(t.runSkills).values([
      { runId: local!.id, skillId: skill!.id, order: 0 },
      { runId: ci!.id, skillId: skill!.id, order: 0 },
    ]);

    const repo = new SkillsRepository(db);
    const since = new Date(Date.now() - 86_400_000);
    expect(await repo.completedRunCount(ws!.id, since)).toBe(1);
    expect((await repo.runCountsBySkill(ws!.id, [skill!.id], since)).get(skill!.id)).toBe(1);
  });

  // an ingested CI run for PR #5 adds nothing to that PR's cost column
  it('the PR list cost counts the local run only, not the ingested CI run of the same PR', async () => {
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'iso-list', fullName: 'acme/iso-list' })
      .returning();
    const [agent] = await db
      .insert(t.agents)
      .values({ workspaceId: ws!.id, name: 'IsoAgent', provider: 'openrouter', model: 'x/y', systemPrompt: 'p' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws!.id, repoId: repo!.id, number: 5, title: 't', author: 'a', branch: 'b', base: 'main',
        headSha: SHA, additions: 1, deletions: 0, filesCount: 1, status: 'needs_review',
      })
      .returning();
    await db.insert(t.agentRuns).values({
      workspaceId: ws!.id, agentId: agent!.id, prId: pr!.id, status: 'done', source: 'local', costUsd: 0.5, costSource: 'api',
    });
    await db.insert(t.ciInstallations).values({
      agentId: agent!.id, repo: repo!.fullName, repoId: repo!.id, targetType: 'gha', mode: 'pr',
      exportedAgentVersion: 1, exportedCiFailOn: 'critical', workflowVersion: 1, prNumber: 5,
    });

    const artifact = {
      schema_version: 1, status: 'passed', verdict: 'comment', gate_tripped: false, findings_count: 1,
      critical: 0, warning: 1, suggestion: 0, cost_usd: 7, duration_ms: 1, tokens_in: 1, tokens_out: 1,
      manifest_schema_version: 1, agent_name: 'IsoAgent', agent_version: 1, model: 'x/y', runner_version: '1.0.0',
      deps: {}, node_version: 'v22', commit_sha: SHA, run_id: 9_000_001, run_attempt: 1, error_class: null,
    };
    const forge = new MockForgeClient({
      ci: {
        runs: [{
          id: 9_000_001, run_attempt: 1, head_sha: SHA, status: 'completed', conclusion: 'success',
          created_at: new Date(Date.now() - 3_600_000).toISOString(), updated_at: new Date(Date.now() - 3_500_000).toISOString(), html_url: 'https://github.com/acme/iso-list/actions/runs/1',
          pr_numbers: [5],
        }],
        artifacts: { 9_000_001: [{ id: 1, name: 'devdigest-result', size_in_bytes: 10, expired: false }] },
        artifactBytes: { 1: zipSync({ [ARTIFACT_FILE]: strToU8(JSON.stringify(artifact)) }) },
      },
    });
    const app = await buildApp({
      config: isolatedTestConfig(),
      db,
      overrides: { secrets: new MockSecretsProvider({}), forge },
    });
    try {
      const out = (await app.inject({ method: 'POST', url: '/ci/refresh', payload: { agent_id: agent!.id } })).json();
      expect(out.recorded).toBe(1);
      const list = (await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls` })).json() as PrMeta[];
      const row = list.find((p) => p.number === 5)!;
      expect(row.cost_usd).toBe(0.5);
    } finally {
      await app.close();
    }
  });
});
