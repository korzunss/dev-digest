import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { MultiAgentService } from '../src/modules/reviews/multi-agent.service.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('multi-agent start failure and stale-run reaping (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    workspaceId = (await db.select().from(t.workspaces))[0]!.id;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'fixes', fullName: 'acme/fixes' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'T',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'c'.repeat(40),
        baseSha: 'b'.repeat(40),
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'needs_review',
      })
      .returning();
    prId = pr!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('leaves no multi_agent_runs row when starting the runs throws (PR-S1)', async () => {
    const db = pg.handle.db;
    const agent = (await db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId)))[0]!;
    const before = (await db.select().from(t.multiAgentRuns)).length;
    const service = new MultiAgentService({
      repo: new ReviewRepository(db),
      agents: new AgentsRepository(db),
      startRuns: () => Promise.reject(new Error('start boom')),
    });
    await expect(service.start(workspaceId, prId, [agent.id])).rejects.toThrow('start boom');
    expect((await db.select().from(t.multiAgentRuns)).length).toBe(before);
  });

  it('fails the already-created runs when a later one cannot start (PR2-S1)', async () => {
    const db = pg.handle.db;
    const repo = new ReviewRepository(db);
    const agent = (await db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId)))[0]!;
    let createdRunId = '';
    const service = new MultiAgentService({
      repo,
      agents: new AgentsRepository(db),
      startRuns: async (ws, pr, _targets, _logger, opts) => {
        createdRunId = await repo.createAgentRun({
          workspaceId: ws,
          agentId: agent.id,
          prId: pr,
          provider: null,
          model: null,
          multiAgentRunId: opts?.multiAgentRunId ?? null,
        });
        throw new Error('second run boom');
      },
    });
    await expect(service.start(workspaceId, prId, [agent.id])).rejects.toThrow('second run boom');
    const [row] = await db.select().from(t.agentRuns).where(eq(t.agentRuns.id, createdRunId));
    expect(row!.status).toBe('failed');
    expect(row!.finishedAt).toBeInstanceOf(Date);
    expect(row!.error).toBe('Multi-agent start failed'); // fixed text, no raw detail (PR3-S1)
    expect(row!.error).not.toContain('second run boom');
    expect(row!.multiAgentRunId).toBeNull();
  });

  it('logs a failed cleanup instead of swallowing it (PR2-S2)', async () => {
    const db = pg.handle.db;
    const agent = (await db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId)))[0]!;
    const real = new ReviewRepository(db);
    const logged: { obj: unknown; msg?: string }[] = [];
    const logger = {
      info: () => undefined,
      warn: () => undefined,
      debug: () => undefined,
      error: (obj: unknown, msg?: string) => void logged.push({ obj, msg }),
    };
    const service = new MultiAgentService({
      repo: {
        getPull: real.getPull.bind(real),
        insertMultiAgentRun: real.insertMultiAgentRun.bind(real),
        failRunningRunsOfMultiRun: real.failRunningRunsOfMultiRun.bind(real),
        deleteMultiAgentRun: () => Promise.reject(new Error('delete boom')),
      } as never,
      agents: new AgentsRepository(db),
      startRuns: () => Promise.reject(new Error('start boom')),
    });
    await expect(service.start(workspaceId, prId, [agent.id], logger)).rejects.toThrow('start boom');
    expect(logged).toHaveLength(1);
    expect(JSON.stringify(logged[0]!.obj)).toContain('delete boom');
  });

  it('still deletes the group when failing its runs throws (PR3-S2)', async () => {
    const db = pg.handle.db;
    const agent = (await db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId)))[0]!;
    const real = new ReviewRepository(db);
    let groupId = '';
    const logged: unknown[] = [];
    const logger = {
      info: () => undefined,
      warn: () => undefined,
      debug: () => undefined,
      error: (obj: unknown) => void logged.push(obj),
    };
    const service = new MultiAgentService({
      repo: {
        getPull: real.getPull.bind(real),
        insertMultiAgentRun: async (...a: Parameters<typeof real.insertMultiAgentRun>) => {
          const r = await real.insertMultiAgentRun(...a);
          groupId = r.id;
          return r;
        },
        failRunningRunsOfMultiRun: () => Promise.reject(new Error('update boom')),
        deleteMultiAgentRun: real.deleteMultiAgentRun.bind(real),
      } as never,
      agents: new AgentsRepository(db),
      startRuns: () => Promise.reject(new Error('start boom')),
    });
    await expect(service.start(workspaceId, prId, [agent.id], logger)).rejects.toThrow('start boom');
    expect(JSON.stringify(logged)).toContain('update boom');
    expect(await db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.id, groupId))).toHaveLength(0);
  });

  it('stamps finished_at on a reaped running run (PR-S2)', async () => {
    const db = pg.handle.db;
    const repo = new ReviewRepository(db);
    const runId = await repo.createAgentRun({
      workspaceId,
      agentId: null,
      prId,
      provider: null,
      model: null,
    });
    const reaped = await repo.reapStaleRunningRuns();
    expect(reaped).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(row!.status).toBe('failed');
    expect(row!.finishedAt).toBeInstanceOf(Date);
  });
});
