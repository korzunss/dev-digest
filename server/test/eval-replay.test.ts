import { describe, it, expect } from 'vitest';
import { MockGitClient } from '../src/adapters/mocks.js';
import { parseFixture } from '../src/modules/eval/fixture.js';
import {
  buildArmAgents,
  describeJobError,
  formatGate,
  runReplay,
  type DbAgent,
  type ReplayDeps,
  type ReplayOptions,
} from '../src/modules/eval/replay.js';

const BASE = 'b'.repeat(40);
const HEAD = 'a'.repeat(40);

const raw = ['a.ts', 'b.ts', 'c.ts']
  .map((p) => `diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n@@ -1,1 +1,2 @@\n x\n+y in ${p}`)
  .join('\n');

const issue = (id: string, file: string, kw: string) => ({
  id,
  lane: 'general',
  title: id,
  locations: [{ file, start_line: 1, end_line: 2 }],
  categories: ['bug'],
  keywords: [kw],
});

const fixture = parseFixture({
  id: 'f',
  repo: 'acme/app',
  pr: 1,
  base_sha: BASE,
  head_sha: HEAD,
  line_tolerance: 2,
  lanes: { general: 'General Reviewer' },
  issues: [issue('p1', 'a.ts', 'planted')],
  acceptable_extras: [],
  false_positives: [issue('fp1', 'b.ts', 'wrongclaim')],
});

const dbAgents: DbAgent[] = [
  {
    lane: 'general',
    name: 'General Reviewer',
    provider: 'openrouter',
    model: 'm',
    systemPrompt: 'DB general',
    skills: [
      { name: 'dev-digest-conventions', rendered: 'R1', enabled: true },
      { name: 'keep-me', rendered: 'R2', enabled: true },
      { name: 'off', rendered: 'R3', enabled: false },
    ],
  },
  { lane: 'security', name: 'Security Reviewer', provider: 'openrouter', model: 'm', systemPrompt: 'DB sec', skills: [] },
];
const builtin = { 'General Reviewer': 'NEW general', 'Security Reviewer': 'NEW sec' };

type Call = Record<string, unknown>;

function setup(
  opts: {
    fail?: (c: Call) => boolean;
    finding?: (arm: string) => { title: string; severity: string; file: string } | null;
  } = {},
) {
  const calls: Call[] = [];
  const git = new MockGitClient({ diff: raw });
  const deps = {
    git,
    llmFor: () => ({}) as never,
    review: (async (input: Call) => {
      calls.push(input);
      if (opts.fail?.(input)) throw new Error('boom');
      const arm =
        input.repoRules || input.changedFiles ? 'opt1+opt2' : input.systemPrompt === 'DB general' || input.systemPrompt === 'DB sec' ? 'base' : 'opt1';
      const f = opts.finding?.(arm);
      const finding = f ? { id: 'x', category: 'bug', start_line: 1, end_line: 2, rationale: 'r', confidence: 1, ...f } : null;
      return {
        review: { findings: finding ? [finding] : [] },
        costUsd: arm === 'opt1+opt2' ? 0.012 : 0.01,
        skipped: [],
      };
    }) as unknown as ReplayDeps['review'],
    loadRules: async () => ({ sets: [{ scope: '', source: 'AGENTS.md', text: 'rule' }] }),
    callOptions: {},
  } satisfies ReplayDeps;
  return { calls, git, deps };
}

const options = (over: Partial<ReplayOptions> = {}): ReplayOptions => ({
  rounds: 2,
  arms: ['base', 'opt1', 'opt1+opt2'],
  concurrency: 3,
  strategy: 'map-reduce',
  repo: { owner: 'acme', name: 'app' },
  pull: { body: 'body' },
  task: 'task',
  dbAgents,
  builtinPrompts: builtin,
  detachedSkills: ['dev-digest-conventions'],
  generalAgentName: 'General Reviewer',
  repoRulesMaxChars: 8000,
  diffTimeoutMs: 90_000,
  ...over,
});

describe('buildArmAgents', () => {
  it('base keeps the DB prompt and enabled skills', () => {
    const [general] = buildArmAgents('base', dbAgents, builtin, ['dev-digest-conventions'], 'General Reviewer');
    expect(general?.systemPrompt).toBe('DB general');
    expect(general?.skills).toEqual(['R1', 'R2']);
  });
  it('opt arms take the built-in prompt and General drops detached skills', () => {
    const agents = buildArmAgents('opt1', dbAgents, builtin, ['dev-digest-conventions'], 'General Reviewer');
    expect(agents.map((a) => a.systemPrompt)).toEqual(['NEW general', 'NEW sec']);
    expect(agents[0]?.skills).toEqual(['R2']);
  });
  it('throws when a built-in prompt is missing', () => {
    expect(() => buildArmAgents('opt1', dbAgents, {}, [], 'General Reviewer')).toThrow(/no built-in prompt/);
  });
});

describe('runReplay', () => {
  it('feeds only fixture files, all paths as changedFiles, rules only in opt1+opt2', async () => {
    const { calls, git, deps } = setup();
    const r = await runReplay(fixture, options(), deps);
    expect(git.diffCommitsCalls).toEqual([{ base: BASE, head: HEAD }]);
    expect(r.fixtureFiles).toEqual(['a.ts', 'b.ts']);
    expect(r.allPathsCount).toBe(3);
    expect(calls).toHaveLength(3 * 2 * 2);
    for (const c of calls) {
      const diff = c.diff as { files: { path: string }[]; raw: string };
      expect(diff.files.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
      expect(diff.raw).not.toContain('c.ts');
    }
    const withRules = calls.filter((c) => c.repoRules);
    expect(withRules).toHaveLength(2 * 2);
    expect(withRules.every((c) => (c.changedFiles as string[]).length === 3)).toBe(true);
    expect(calls.filter((c) => c.changedFiles)).toHaveLength(4);
    const general = calls.filter((c) => c.systemPrompt === 'DB general');
    expect(general.every((c) => (c.skills as string[]).includes('R1'))).toBe(true);
    const optGeneral = calls.filter((c) => c.systemPrompt === 'NEW general');
    expect(optGeneral.every((c) => (c.skills as string[]).join() === 'R2')).toBe(true);
  });

  it('records a throwing job as failed and excludes its round', async () => {
    let n = 0;
    const { deps } = setup({ fail: (c) => c.systemPrompt === 'DB sec' && ++n === 1 });
    const r = await runReplay(fixture, options({ arms: ['base'] }), deps);
    expect(r.arms.base?.failedJobs).toBe(1);
    expect(r.arms.base?.completeRounds).toBe(1);
    expect(r.gatePassed).toBeNull();
  });

  it('reports the failure reason in the progress event', async () => {
    let n = 0;
    const { deps } = setup({ fail: (c) => c.systemPrompt === 'DB sec' && ++n === 1 });
    const events: { ok: boolean; error?: string }[] = [];
    await runReplay(fixture, options({ arms: ['base'], onProgress: (e) => events.push(e) }), deps);
    expect(events.filter((e) => !e.ok).map((e) => e.error)).toEqual(['boom']);
    expect(events.filter((e) => e.ok).every((e) => e.error === undefined)).toBe(true);
  });

  it('bounds diffCommits with an AbortSignal', async () => {
    const { git, deps } = setup();
    const signals: (AbortSignal | undefined)[] = [];
    const diffCommits = git.diffCommits.bind(git);
    const spied = {
      ...deps,
      git: {
        readFileAt: git.readFileAt.bind(git),
        diffCommits: (repo, base, head, signal) => {
          signals.push(signal);
          return diffCommits(repo, base, head);
        },
      } satisfies ReplayDeps['git'],
    };
    await runReplay(fixture, options({ arms: ['base'], rounds: 1 }), spied);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0]?.aborted).toBe(false);
  });

  it('passes the gate when opt1+opt2 removes false criticals', async () => {
    const { deps } = setup({
      finding: (arm) => (arm === 'opt1+opt2' ? null : { title: 'wrongclaim', severity: 'CRITICAL', file: 'b.ts' }),
    });
    const r = await runReplay(fixture, options(), deps);
    expect(r.arms.base?.summary.falseCriticals.mean).toBe(2);
    expect(r.gate.map((c) => [c.name, c.pass])).toEqual([
      ['suiteRecall', true],
      ['falseCriticals', true],
      ['costUsd', true],
    ]);
    expect(r.gatePassed).toBe(true);
    expect(formatGate(r).at(-1)).toBe('gate: PASS');
  });

  it('fails the gate when false criticals stay the same', async () => {
    const { deps } = setup({ finding: () => ({ title: 'wrongclaim', severity: 'CRITICAL', file: 'b.ts' }) });
    const r = await runReplay(fixture, options(), deps);
    expect(r.gate.find((c) => c.name === 'falseCriticals')?.pass).toBe(false);
    expect(r.gatePassed).toBe(false);
    expect(formatGate(r).at(-1)).toBe('gate: FAIL');
  });

  it('has no falseCriticals gate check when the fixture labels no false positives', async () => {
    const { deps } = setup({ finding: () => ({ title: 'wrongclaim', severity: 'CRITICAL', file: 'b.ts' }) });
    const r = await runReplay({ ...fixture, false_positives: [] }, options(), deps);
    expect(r.gate.some((c) => c.name === 'falseCriticals')).toBe(false);
    expect(r.arms.base?.summary.falseCriticals).toBeDefined();
  });

  it('fails the gate with too few complete rounds', async () => {
    const { deps } = setup({ fail: (c) => Boolean(c.repoRules) });
    const r = await runReplay(fixture, options(), deps);
    expect(r.gate[0]).toMatchObject({ name: 'rounds', arm: 'opt1+opt2', pass: false, actual: 0, limit: 2 });
    expect(r.gatePassed).toBe(false);
  });

  it('skips the gate without the base arm', async () => {
    const { deps } = setup();
    const r = await runReplay(fixture, options({ arms: ['opt1+opt2'] }), deps);
    expect(r.gatePassed).toBeNull();
    expect(formatGate(r)).toEqual(['gate: skipped (needs the base and opt1+opt2 arms)']);
  });

  it('throws before any call when base_sha is missing', async () => {
    const { calls, git, deps } = setup();
    const { base_sha: _drop, ...rest } = fixture;
    await expect(runReplay(rest as typeof fixture, options(), deps)).rejects.toThrow(/base_sha/);
    expect(calls).toHaveLength(0);
    expect(git.diffCommitsCalls).toHaveLength(0);
  });
});

describe('describeJobError', () => {
  it('keeps only the first line', () => {
    expect(describeJobError(new Error('timeout after 60s\n  at stack'))).toBe('timeout after 60s');
  });
  it('redacts token-like strings', () => {
    const msg = describeJobError(new Error('401 for key sk-or-v1-abc123 with Bearer xyz.789'));
    expect(msg).toBe('401 for key [redacted] with [redacted]');
  });
  it('caps the length', () => {
    const msg = describeJobError(new Error('word '.repeat(100)));
    expect(msg.length).toBe(200);
    expect(msg.endsWith('…')).toBe(true);
  });
  it('handles non-Error throws and empty messages', () => {
    expect(describeJobError('plain')).toBe('plain');
    expect(describeJobError(new Error(''))).toBe('unknown error');
  });
});
