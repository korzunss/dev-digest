/**
 * eval:replay entrypoint (`replay-cli.ts` main): argument validation and the
 * gate -> exit-code mapping (0 passed or skipped, 1 failed; a throw is mapped to 2
 * by the entrypoint). The DB, container and engine are stubbed, so no paid LLM
 * call and no database is ever touched.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const h = vi.hoisted(() => ({
  close: vi.fn(async () => {}),
  createDb: vi.fn(),
  runReplay: vi.fn(),
  workspace: { id: 'w1' } as { id: string } | null,
  pull: { id: 'p1' } as { id: string } | null,
  agents: [] as { id: string; name: string; provider: string; model: string; systemPrompt: string }[],
}));

vi.mock('dotenv/config', () => ({}));
vi.mock('../src/db/client.js', () => ({ createDb: h.createDb }));
vi.mock('../src/platform/config.js', () => ({ loadConfig: () => ({ databaseUrl: 'postgres://test' }) }));
vi.mock('../src/platform/container.js', () => ({
  Container: class {
    git = {};
    tokenizer = { count: () => 0 };
    priceBook = { estimate: () => 0 };
    agentsRepo = { list: async () => h.agents, linkedSkills: async () => [] };
    llm = async () => ({});
  },
}));
vi.mock('../src/modules/eval/repository.js', () => ({
  EvalRepository: class {
    findWorkspaceByName = async () => h.workspace;
    findPull = async () => h.pull;
    getPullRow = async () => h.pull;
  },
}));
vi.mock('../src/modules/eval/replay.js', async (importActual) => ({
  ...(await importActual<typeof import('../src/modules/eval/replay.js')>()),
  runReplay: h.runReplay,
}));

import { main } from '../src/modules/eval/replay-cli.js';

const SHA = 'a'.repeat(40);
const baseFixture = {
  id: 'f',
  repo: 'acme/app',
  pr: 1,
  head_sha: SHA,
  line_tolerance: 3,
  lanes: { general: 'General Reviewer' },
  issues: [],
  acceptable_extras: [],
};

let dir: string;
let withBase: string;
let noBase: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'replay-cli-'));
  withBase = join(dir, 'with-base.json');
  noBase = join(dir, 'no-base.json');
  await writeFile(withBase, JSON.stringify({ ...baseFixture, base_sha: 'b'.repeat(40) }));
  await writeFile(noBase, JSON.stringify(baseFixture));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

beforeEach(() => {
  h.createDb.mockReset().mockReturnValue({ db: {}, close: h.close });
  h.close.mockClear();
  h.runReplay.mockReset();
  h.workspace = { id: 'w1' };
  h.pull = { id: 'p1' };
  h.agents = [{ id: 'a1', name: 'General Reviewer', provider: 'openai', model: 'm', systemPrompt: 'p' }];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const result = (gatePassed: boolean | null) => ({
  arms: {},
  gate: [],
  gatePassed,
  fixtureFiles: [],
  missingFixtureFiles: [],
  allPathsCount: 0,
});

describe('replay-cli main — exit code', () => {
  // gate passed -> 0
  it('returns 0 when the gate passed', async () => {
    h.runReplay.mockResolvedValue(result(true));
    await expect(main(['--fixture', withBase])).resolves.toBe(0);
    expect(h.close).toHaveBeenCalledTimes(1);
  });
  // gate failed -> 1
  it('returns 1 when the gate failed', async () => {
    h.runReplay.mockResolvedValue(result(false));
    await expect(main(['--fixture', withBase])).resolves.toBe(1);
  });
  // a skipped gate (null) is not a failure
  it('returns 0 when the gate was skipped', async () => {
    h.runReplay.mockResolvedValue(result(null));
    await expect(main(['--fixture', withBase])).resolves.toBe(0);
  });
  // a lookup failure throws (the entrypoint turns a throw into exit 2) and still closes the DB
  it('throws and closes the DB when the workspace is missing', async () => {
    h.workspace = null;
    await expect(main(['--fixture', withBase])).rejects.toThrow(/workspace "[^"]+" not found/);
    expect(h.runReplay).not.toHaveBeenCalled();
    expect(h.close).toHaveBeenCalledTimes(1);
  });
  it('throws when a lane agent is missing from the workspace', async () => {
    h.agents = [];
    await expect(main(['--fixture', withBase])).rejects.toThrow(/agent "General Reviewer".*not found/);
    expect(h.runReplay).not.toHaveBeenCalled();
  });
  // an engine error propagates (exit 2), it is not swallowed into a gate result
  it('propagates a runReplay error', async () => {
    h.runReplay.mockRejectedValue(new Error('boom'));
    await expect(main(['--fixture', withBase])).rejects.toThrow('boom');
    expect(h.close).toHaveBeenCalledTimes(1);
  });
});

describe('replay-cli main — argument validation (nothing runs on bad input)', () => {
  const bad: [string, string[], RegExp][] = [
    ['no --fixture', [], /--fixture <path> is required/],
    ['--rounds 0', ['--fixture', 'x', '--rounds', '0'], /--rounds is invalid/],
    ['--rounds above the maximum', ['--fixture', 'x', '--rounds', '21'], /--rounds is invalid/],
    ['--rounds not a number', ['--fixture', 'x', '--rounds', 'many'], /--rounds is invalid/],
    ['--concurrency 0', ['--fixture', 'x', '--concurrency', '0'], /--concurrency is invalid/],
    ['an unknown arm', ['--fixture', 'x', '--arms', 'base,nope'], /--arms\[1\] is invalid/],
    ['an unknown strategy', ['--fixture', 'x', '--strategy', 'fast'], /--strategy is invalid/],
    ['an unknown flag', ['--fixture', 'x', '--bogus', '1'], /bogus/],
  ];
  it.each(bad)('rejects %s before the DB or the engine is reached', async (_name, argv, msg) => {
    await expect(main(argv)).rejects.toThrow(msg);
    expect(h.createDb).not.toHaveBeenCalled();
    expect(h.runReplay).not.toHaveBeenCalled();
  });
  // a fixture without base_sha cannot be replayed: refuse before touching the DB
  it('rejects a fixture without base_sha before the DB is opened', async () => {
    await expect(main(['--fixture', noBase])).rejects.toThrow(/base_sha/);
    expect(h.createDb).not.toHaveBeenCalled();
    expect(h.runReplay).not.toHaveBeenCalled();
  });
  // defaults and de-duplication reach the engine
  it('passes default rounds/strategy and de-duplicates --arms', async () => {
    h.runReplay.mockResolvedValue(result(true));
    await main(['--fixture', withBase, '--arms', 'base,base,opt1+opt2']);
    const opts = h.runReplay.mock.calls[0]![1] as { rounds: number; strategy: string; arms: string[] };
    expect(opts.arms).toEqual(['base', 'opt1+opt2']);
    expect(opts.rounds).toBe(8);
    expect(opts.strategy).toBe('map-reduce');
  });
});
