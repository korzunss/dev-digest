import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createDb } from '../../db/client.js';
import { DEFAULT_WORKSPACE_NAME } from '../../db/seed.js';
import { loadConfig } from '../../platform/config.js';
import { parseFixture } from './fixture.js';
import { MAX_EVAL_ROUNDS } from './constants.js';
import { formatReport, formatRounds } from './helpers.js';
import { EvalRepository } from './repository.js';
import { EvalService } from './service.js';

const DEFAULT_FIXTURE = fileURLToPath(new URL('./fixtures/pr-export-planted.json', import.meta.url));
const RunId = z.string().uuid();
const Runs = z.coerce.number().int().min(1).max(MAX_EVAL_ROUNDS);
const Unit = z.coerce.number().min(0).max(1);
const NonNegative = z.coerce.number().min(0);

function flag<T>(name: string, schema: z.ZodType<T>, raw: string | undefined): T | undefined {
  if (raw === undefined) return undefined;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error(`${name} is invalid: "${raw}" (${parsed.error.issues[0]?.message})`);
  return parsed.data;
}

/**
 * `pnpm eval:review` — scores the stored runs of the fixture PR. Manual tool:
 * no LLM call, no network. This file is the module's transport and the
 * composition root of this one entrypoint (it needs only `db`, not the container).
 */
export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      fixture: { type: 'string', default: DEFAULT_FIXTURE },
      workspace: { type: 'string', default: DEFAULT_WORKSPACE_NAME },
      run: { type: 'string', multiple: true },
      runs: { type: 'string' },
      'baseline-recall': { type: 'string' },
      'baseline-false-criticals': { type: 'string' },
      'baseline-cost': { type: 'string' },
    },
  });
  const runIds = (values.run ?? []).map((id) => {
    const parsed = RunId.safeParse(id);
    if (!parsed.success) throw new Error(`--run expects a uuid, got "${id}"`);
    return parsed.data;
  });
  const rounds = flag('--runs', Runs, values.runs) ?? 1;
  if (rounds > 1 && runIds.length) throw new Error('--run cannot be combined with --runs > 1');
  const baseline = {
    suiteRecall: flag('--baseline-recall', Unit, values['baseline-recall']),
    falseCriticals: flag('--baseline-false-criticals', NonNegative, values['baseline-false-criticals']),
    costUsd: flag('--baseline-cost', NonNegative, values['baseline-cost']),
  };
  const url = loadConfig().databaseUrl;

  const fixture = parseFixture(JSON.parse(await readFile(values.fixture as string, 'utf8')));
  const { db, close } = createDb(url);
  try {
    const service = new EvalService({ repo: new EvalRepository(db) });
    const result = await service.scoreReviewFixture(fixture, {
      workspaceName: values.workspace as string,
      runIds,
      rounds,
      baseline: Object.fromEntries(Object.entries(baseline).filter(([, v]) => v !== undefined)),
    });
    console.log(rounds > 1 ? formatRounds(result.summary, result.gate) : formatReport(result));
    if (rounds === 1 && result.gate.length) console.log(formatRounds(result.summary, result.gate).split('\n').filter((l) => l.startsWith('gate ')).join('\n'));
    for (const w of result.warnings) console.log(`warning: ${w}`);
    for (const name of result.noRun) console.log(`no run: ${name}`);
    console.log(`stored eval_runs: ${result.evalRunIds.join(', ') || 'none'}`);
  } finally {
    await close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    () => process.exit(0),
    (err: unknown) => {
      console.error(`✗ eval failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    },
  );
}
