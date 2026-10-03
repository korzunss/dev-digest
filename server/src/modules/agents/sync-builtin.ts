import 'dotenv/config';
import { parseArgs } from 'node:util';
import { createDb } from '../../db/client.js';
import { BUILTIN_AGENT_PROMPTS } from '../../db/seed-prompts.js';
import { loadConfig } from '../../platform/config.js';
import { Container } from '../../platform/container.js';
import { GENERAL_AGENT_NAME, GENERAL_DETACHED_SKILLS } from './constants.js';
import { AgentsService } from './service.js';

/**
 * `pnpm agents:sync-builtin [--dry-run]` — pushes the current built-in reviewer
 * prompts (`BUILTIN_AGENT_PROMPTS`) into the workspace's agents and detaches the
 * skills that moved into the repo-context block from General Reviewer. Manual
 * tool: no LLM call, no network. Prompts edited in the UI are overwritten; the
 * previous text stays in `agent_versions`. Each agent's sync is ONE transaction
 * (`AgentsService.syncBuiltin`): detach, prompt, version bump and snapshot
 * commit together or not at all.
 */
export async function syncBuiltinAgents(
  service: AgentsService,
  workspaceId: string,
  opts: { dryRun?: boolean } = {},
): Promise<string[]> {
  const dryRun = opts.dryRun === true;
  const agents = await service.list(workspaceId);
  const lines: string[] = [];
  for (const [name, prompt] of Object.entries(BUILTIN_AGENT_PROMPTS)) {
    const agent = agents.find((a) => a.name === name);
    if (!agent) {
      lines.push(`skip ${name}: not found in this workspace`);
      continue;
    }

    const result = await service.syncBuiltin(workspaceId, agent.id, {
      systemPrompt: prompt,
      detachSkillNames: name === GENERAL_AGENT_NAME ? GENERAL_DETACHED_SKILLS : [],
      dryRun,
    });
    if (!result) {
      lines.push(`skip ${name}: not found in this workspace`);
      continue;
    }
    if (result.detached.length) lines.push(`${name}: detached: ${result.detached.join(', ')}`);
    if (!result.changed) {
      lines.push(`${name}: unchanged`);
      continue;
    }
    lines.push(
      `${name}: v${result.fromVersion} → v${result.toVersion}${dryRun ? ' (dry run)' : ''}`,
    );
  }
  return lines;
}

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: { 'dry-run': { type: 'boolean', default: false } },
  });
  const { db, close } = createDb(loadConfig().databaseUrl);
  try {
    const container = new Container(loadConfig(), db);
    const workspace = await container.auth.currentWorkspace(undefined);
    const lines = await syncBuiltinAgents(new AgentsService(container), workspace.id, {
      dryRun: values['dry-run'] === true,
    });
    for (const line of lines) console.log(line);
  } finally {
    await close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    () => process.exit(0),
    (err: unknown) => {
      console.error(`✗ agents sync failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    },
  );
}
