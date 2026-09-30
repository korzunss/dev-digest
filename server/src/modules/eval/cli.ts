import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createDb } from '../../db/client.js';
import { DEFAULT_WORKSPACE_NAME } from '../../db/seed.js';
import { loadConfig } from '../../platform/config.js';
import { parseFixture } from './fixture.js';
import { formatReport } from './helpers.js';
import { EvalRepository } from './repository.js';
import { EvalService } from './service.js';

const DEFAULT_FIXTURE = fileURLToPath(new URL('./fixtures/pr-export-planted.json', import.meta.url));
const RunId = z.string().uuid();

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
    },
  });
  const runIds = (values.run ?? []).map((id) => {
    const parsed = RunId.safeParse(id);
    if (!parsed.success) throw new Error(`--run expects a uuid, got "${id}"`);
    return parsed.data;
  });
  const url = loadConfig().databaseUrl;

  const fixture = parseFixture(JSON.parse(await readFile(values.fixture as string, 'utf8')));
  const { db, close } = createDb(url);
  try {
    const service = new EvalService({ repo: new EvalRepository(db) });
    const result = await service.scoreReviewFixture(fixture, {
      workspaceName: values.workspace as string,
      runIds,
    });
    console.log(formatReport(result));
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
