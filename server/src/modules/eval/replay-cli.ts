import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import type { Provider } from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { createDb } from '../../db/client.js';
import { BUILTIN_AGENT_PROMPTS } from '../../db/seed-prompts.js';
import { DEFAULT_WORKSPACE_NAME } from '../../db/seed.js';
import { loadConfig } from '../../platform/config.js';
import { Container } from '../../platform/container.js';
import { GENERAL_AGENT_NAME, GENERAL_DETACHED_SKILLS } from '../agents/constants.js';
import {
  REVIEW_CALL_DEADLINE_MS,
  REVIEW_MAX_OUTPUT_TOKENS,
  REVIEW_MAX_SKIPPED_CHUNK_FRACTION,
  REVIEW_REPO_RULES_MAX_CHARS,
  REVIEW_RETRY_ROUTING,
  REVIEW_ROUTING,
} from '../reviews/constants.js';
import { taskLine } from '../reviews/helpers.js';
import { loadRepoRules } from '../reviews/repo-rules.js';
import { renderSkillBlock } from '../skills/helpers.js';
import { MAX_EVAL_ROUNDS } from './constants.js';
import { parseFixture } from './fixture.js';
import { formatRounds } from './helpers.js';
import { EvalRepository } from './repository.js';
import { REPLAY_ARMS, formatGate, runReplay, type DbAgent, type ReplayArm } from './replay.js';

const Rounds = z.coerce.number().int().min(1).max(MAX_EVAL_ROUNDS);
const Concurrency = z.coerce.number().int().min(1).max(16);
const Strategy = z.enum(['auto', 'single-pass', 'map-reduce']);
const Arm = z.enum(['base', 'opt1', 'opt1+opt2']);
const NonEmpty = z.string().trim().min(1).max(512);

function flag<T>(name: string, schema: z.ZodType<T>, raw: string | undefined, fallback: T): T {
  if (raw === undefined) return fallback;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error(`${name} is invalid: "${raw}" (${parsed.error.issues[0]?.message})`);
  return parsed.data;
}

function parseArms(raw: string | undefined): ReplayArm[] {
  if (raw === undefined) return [...REPLAY_ARMS];
  const arms = raw.split(',').map((a, i) => flag(`--arms[${i}]`, Arm, a.trim(), 'base' as ReplayArm));
  return [...new Set(arms)];
}

/**
 * `pnpm eval:replay` — replays a pinned commit range through the review engine
 * (prompt arms x N rounds) and scores it against the fixture. Makes paid LLM
 * calls; the provider key is resolved only inside `container.llm`. This file is
 * the transport and the composition root of the entrypoint, so it is the one
 * eval file that imports other modules.
 *
 * Exit code (set by the caller of `main`): 0 gate passed or skipped, 1 gate failed.
 * Any error throws, which the entrypoint maps to 2.
 */
export async function main(argv: string[]): Promise<0 | 1> {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      fixture: { type: 'string' },
      rounds: { type: 'string' },
      arms: { type: 'string' },
      concurrency: { type: 'string' },
      strategy: { type: 'string' },
      workspace: { type: 'string' },
    },
  });
  if (!values.fixture) throw new Error('--fixture <path> is required');
  const fixturePath = flag('--fixture', NonEmpty, values.fixture, '');
  const rounds = flag('--rounds', Rounds, values.rounds, 8);
  const arms = parseArms(values.arms);
  const concurrency = flag('--concurrency', Concurrency, values.concurrency, 8);
  const strategy = flag('--strategy', Strategy, values.strategy, 'map-reduce');
  const workspaceName = flag('--workspace', NonEmpty, values.workspace, DEFAULT_WORKSPACE_NAME);

  const fixture = parseFixture(JSON.parse(await readFile(fixturePath, 'utf8')));
  if (!fixture.base_sha) throw new Error('fixture has no base_sha: pin the range to replay it');

  const config = loadConfig();
  const { db, close } = createDb(config.databaseUrl);
  const started = Date.now();
  try {
    const container = new Container(config, db);
    const evalRepo = new EvalRepository(db);
    const workspace = await evalRepo.findWorkspaceByName(workspaceName);
    if (!workspace) throw new Error(`workspace "${workspaceName}" not found`);
    const found = await evalRepo.findPull(workspace.id, fixture.repo, fixture.pr);
    if (!found) throw new Error(`pull ${fixture.repo}#${fixture.pr} not found in workspace "${workspaceName}"`);
    const pull = await evalRepo.getPullRow(found.id);
    if (!pull) throw new Error(`pull ${fixture.repo}#${fixture.pr} not found`);
    const [owner, name] = fixture.repo.split('/') as [string, string];

    const rows = await container.agentsRepo.list(workspace.id);
    const dbAgents: DbAgent[] = [];
    for (const [lane, agentName] of Object.entries(fixture.lanes) as [DbAgent['lane'], string][]) {
      const agent = rows.find((a) => a.name === agentName);
      if (!agent) throw new Error(`agent "${agentName}" (lane ${lane}) not found in workspace "${workspaceName}"`);
      const links = await container.agentsRepo.linkedSkills(agent.id);
      dbAgents.push({
        lane,
        name: agent.name,
        provider: agent.provider as Provider,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        skills: links.map((l) => ({
          name: l.skill.name,
          rendered: renderSkillBlock(l.skill.name, l.skill.body),
          enabled: l.skill.enabled,
        })),
      });
    }

    // llmFor is sync; resolve each provider once up front (throws here if a key is missing).
    const llms = new Map<Provider, Awaited<ReturnType<Container['llm']>>>();
    for (const p of new Set(dbAgents.map((a) => a.provider))) llms.set(p, await container.llm(p));

    const result = await runReplay(
      fixture,
      {
        rounds,
        arms,
        concurrency,
        strategy,
        repo: { owner, name },
        pull,
        task: taskLine(pull),
        dbAgents,
        builtinPrompts: BUILTIN_AGENT_PROMPTS,
        detachedSkills: GENERAL_DETACHED_SKILLS,
        generalAgentName: GENERAL_AGENT_NAME,
        repoRulesMaxChars: REVIEW_REPO_RULES_MAX_CHARS,
        onProgress: (e) =>
          console.error(
            `${e.arm} r${e.round} ${e.agent} ${e.ok ? `${e.findings} finding(s)` : 'FAILED'} ` +
              `${e.costUsd === null ? 'cost n/a' : `$${e.costUsd.toFixed(4)}`} ${e.seconds.toFixed(1)}s`,
          ),
      },
      {
        git: container.git,
        llmFor: (provider) => {
          const llm = llms.get(provider);
          if (!llm) throw new Error(`no LLM provider resolved for "${provider}"`);
          return llm;
        },
        review: reviewPullRequest,
        loadRules: loadRepoRules,
        countTokens: (s) => container.tokenizer.count(s),
        estimateCost: (model, tokensIn, tokensOut) => container.priceBook.estimate(model, tokensIn, tokensOut),
        callOptions: {
          callDeadlineMs: REVIEW_CALL_DEADLINE_MS,
          maxOutputTokens: REVIEW_MAX_OUTPUT_TOKENS,
          routing: REVIEW_ROUTING,
          retryRouting: REVIEW_RETRY_ROUTING,
          maxSkippedChunkFraction: REVIEW_MAX_SKIPPED_CHUNK_FRACTION,
        },
      },
    );

    console.log(
      `fixture ${fixture.id}: ${result.fixtureFiles.length} file(s) of ${result.allPathsCount} in the diff` +
        (result.missingFixtureFiles.length ? ` (not in diff: ${result.missingFixtureFiles.join(', ')})` : ''),
    );
    let totalCost = 0;
    for (const arm of arms) {
      const r = result.arms[arm];
      if (!r) continue;
      console.log(`\n== arm ${arm} ==`);
      console.log(formatRounds(r.summary, []));
      console.log(`complete rounds: ${r.completeRounds}/${rounds}, failed jobs: ${r.failedJobs}, skipped chunks: ${r.skippedChunks}`);
      totalCost += (r.summary.costUsd?.mean ?? 0) * r.completeRounds;
    }
    console.log('');
    console.log(`total cost (complete rounds): $${totalCost.toFixed(4)}`);
    console.log(`wall time: ${((Date.now() - started) / 1000).toFixed(0)}s`);
    // Gate lines last, so the final stdout line is `gate: PASS|FAIL|skipped …`.
    for (const line of formatGate(result)) console.log(line);
    return result.gatePassed === false ? 1 : 0;
  } finally {
    await close();
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      console.error(`✗ eval:replay failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 2;
    },
  );
}
