import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { isolatedTestConfig } from './helpers/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { Container } from '../src/platform/container.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import { AgentsService } from '../src/modules/agents/service.js';
import { syncBuiltinAgents } from '../src/modules/agents/sync-builtin.js';
import { GENERAL_DETACHED_SKILLS } from '../src/modules/agents/constants.js';
import { BUILTIN_AGENT_PROMPTS, GENERAL_REVIEWER_PROMPT } from '../src/db/seed-prompts.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-sync-builtin] Docker not available — skipping integration tests.');
}

d('agents:sync-builtin', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let service: AgentsService;
  let generalId: string;
  let seedLinks: string[];

  const db = () => pg.handle.db;

  async function skillNamesOf(agentId: string): Promise<string[]> {
    const rows = await db()
      .select({ name: t.skills.name, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId));
    return rows.sort((a, b) => a.order - b.order).map((r) => r.name);
  }

  async function versionCount(agentId: string): Promise<number> {
    return (await db().select().from(t.agentVersions).where(eq(t.agentVersions.agentId, agentId)))
      .length;
  }

  async function ensureSkill(name: string): Promise<string> {
    const [existing] = await db()
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    if (existing) return existing.id;
    const [row] = await db()
      .insert(t.skills)
      .values({
        workspaceId,
        name,
        description: name,
        type: 'rubric',
        source: 'manual',
        body: `# ${name}`,
        enabled: true,
        version: 1,
      })
      .returning();
    return row!.id;
  }

  /** Poll pg_stat_activity until another backend is waiting on a lock in a query on `agents`. */
  async function waitForBlockedAgentsQuery(timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const rows = await db().execute(sql`
        SELECT 1 FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
          AND query ILIKE '%"agents"%'`);
      if (rows.length > 0) return;
      await new Promise((res) => setTimeout(res, 5));
    }
    throw new Error(`no backend blocked on a lock for the agents table within ${timeoutMs}ms`);
  }

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(db()));
    service = new AgentsService(new Container(isolatedTestConfig(), db()));

    const general = (await service.list(workspaceId)).find((a) => a.name === 'General Reviewer')!;
    generalId = general.id;
    seedLinks = await skillNamesOf(generalId);

    // Old prompt + the two skills that the sync must detach, after the seed links.
    await service.update(workspaceId, generalId, { system_prompt: 'old' });
    for (const [i, name] of GENERAL_DETACHED_SKILLS.entries()) {
      const id = await ensureSkill(name);
      await service.linkSkill(workspaceId, generalId, id, seedLinks.length + i);
    }
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('dryRun reports the change and writes nothing', async () => {
    const before = await service.get(workspaceId, generalId);
    const versions = await versionCount(generalId);
    const lines = await syncBuiltinAgents(service, workspaceId, { dryRun: true });

    expect(lines.join('\n')).toContain('General Reviewer: detached: dev-digest-conventions, contract-change-gate');
    expect(lines.join('\n')).toContain(`v${before!.version} → v${before!.version + 1} (dry run)`);
    const after = await service.get(workspaceId, generalId);
    expect(after!.system_prompt).toBe('old');
    expect(after!.version).toBe(before!.version);
    expect(await versionCount(generalId)).toBe(versions);
    expect(await skillNamesOf(generalId)).toEqual([...seedLinks, ...GENERAL_DETACHED_SKILLS]);
  });

  it('restores the prompt, bumps the version once and snapshots without the two skills', async () => {
    const before = await service.get(workspaceId, generalId);
    const versions = await versionCount(generalId);
    const lines = await syncBuiltinAgents(service, workspaceId, {});

    const after = await service.get(workspaceId, generalId);
    expect(after!.system_prompt).toBe(GENERAL_REVIEWER_PROMPT);
    expect(after!.version).toBe(before!.version + 1);
    expect(await versionCount(generalId)).toBe(versions + 1);

    const [snap] = await db()
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, generalId), eq(t.agentVersions.version, after!.version)));
    const skillIds = (snap!.configJson as { skills: string[] }).skills;
    const names = await db().select({ id: t.skills.id, name: t.skills.name }).from(t.skills);
    const snapNames = skillIds.map((id) => names.find((n) => n.id === id)!.name);
    expect(snapNames).toEqual(seedLinks);
    expect(await skillNamesOf(generalId)).toEqual(seedLinks);

    // The other four agents already carry the seed prompt.
    for (const name of Object.keys(BUILTIN_AGENT_PROMPTS).filter((n) => n !== 'General Reviewer')) {
      expect(lines).toContain(`${name}: unchanged`);
    }
  });

  it('is idempotent: a second sync writes nothing', async () => {
    const before = await service.get(workspaceId, generalId);
    const versions = await versionCount(generalId);
    const lines = await syncBuiltinAgents(service, workspaceId, {});

    expect(lines.every((l) => l.endsWith(': unchanged'))).toBe(true);
    expect((await service.get(workspaceId, generalId))!.version).toBe(before!.version);
    expect(await versionCount(generalId)).toBe(versions);
  });

  it('a detach-only sync still bumps the version once and snapshots without the skill', async () => {
    const skill = GENERAL_DETACHED_SKILLS[0]!;
    await service.linkSkill(workspaceId, generalId, await ensureSkill(skill), seedLinks.length);
    const before = await service.get(workspaceId, generalId);
    expect(before!.system_prompt).toBe(GENERAL_REVIEWER_PROMPT);

    const lines = await syncBuiltinAgents(service, workspaceId, {});

    expect(lines.join('\n')).toContain('General Reviewer: detached:');
    expect(lines).toContain(`General Reviewer: v${before!.version} → v${before!.version + 1}`);
    const after = await service.get(workspaceId, generalId);
    expect(after!.version).toBe(before!.version + 1);
    const [snap] = await db()
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, generalId), eq(t.agentVersions.version, after!.version)));
    const skillIds = (snap!.configJson as { skills: string[] }).skills;
    const names = await db().select({ id: t.skills.id, name: t.skills.name }).from(t.skills);
    expect(skillIds.map((id) => names.find((n) => n.id === id)!.name)).not.toContain(skill);
    expect(await skillNamesOf(generalId)).toEqual(seedLinks);
  });

  it('rolls back every write when the transaction callback throws', async () => {
    const before = await skillNamesOf(generalId);
    await expect(
      new AgentsRepository(db()).transaction(async (r) => {
        await r.setSkills(generalId, []);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await skillNamesOf(generalId)).toEqual(before);
  });

  it('syncBuiltin waits on a concurrent writer and reads its committed version (row lock)', async () => {
    const before = await service.get(workspaceId, generalId);
    const versions = await versionCount(generalId);
    const repo = new AgentsRepository(db());
    let sync!: ReturnType<AgentsService['syncBuiltin']>;

    await repo.transaction(async (r) => {
      await r.lockById(workspaceId, generalId);
      sync = service.syncBuiltin(workspaceId, generalId, {
        systemPrompt: 'after lock',
        detachSkillNames: [],
      });
      // Unlocked, the sync would read the old version here: wait until its backend is blocked on our row lock.
      await waitForBlockedAgentsQuery();
      await r.update(workspaceId, generalId, { systemPrompt: 'writer' });
    });

    const res = await sync;
    expect(res).toMatchObject({ changed: true, fromVersion: before!.version + 1, toVersion: before!.version + 2 });
    expect((await service.get(workspaceId, generalId))!.version).toBe(before!.version + 2);
    expect(await versionCount(generalId)).toBe(versions + 2);
  });
});
