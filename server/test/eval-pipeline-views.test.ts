import { describe, it, expect } from 'vitest';
import {
  buildAgentDetail,
  buildCompare,
  buildDashboard,
  type RunRowLike,
} from '../src/modules/eval/pipeline-views.js';
import { ConfigError } from '../src/platform/errors.js';
import { EvalPipelineService } from '../src/modules/eval/pipeline-service.js';
import type { EvalAgent, EvalPipelineServiceDeps, EvalSkill } from '../src/modules/eval/types.js';

const T0 = Date.parse('2026-10-01T00:00:00Z');
const DAY = 86_400_000;

function run(over: Partial<RunRowLike> & { id: string; day: number }): RunRowLike {
  const { day, ...rest } = over;
  return {
    agentId: 'a1',
    agentVersion: 1,
    provider: 'openai',
    model: 'm',
    skills: [],
    status: 'completed',
    startedAt: new Date(T0 + day * DAY),
    finishedAt: new Date(T0 + day * DAY + 1000),
    casesTotal: 4,
    casesDone: 4,
    casesPassed: 3,
    casesErrored: 0,
    recall: 0.8,
    precision: 0.9,
    citationAccuracy: 1,
    costUsd: 0.01,
    ...rest,
  } as RunRowLike;
}

const agent = { id: 'a1', name: 'Security Reviewer', provider: 'openai', model: 'm', version: 3 };

describe('buildAgentDetail', () => {
  const runs = [
    run({ id: 'r1', day: 0, recall: 0.9, precision: 0.9 }),
    run({ id: 'r2', day: 20, recall: 0.8, precision: 0.95, agentVersion: 2 }),
    run({ id: 'r3', day: 40, recall: 0.7, precision: 0.95, agentVersion: 3 }),
    run({ id: 'r4', day: 41, status: 'running', recall: null, precision: null, citationAccuracy: null }),
  ];
  const now = T0 + 45 * DAY;

  it('computes deltas and the alert from the latest two completed runs, ignoring a running one', () => {
    const d = buildAgentDetail({ agent, casesTotal: 4, allRuns: runs, since: null });
    expect(d.latest?.id).toBe('r3');
    expect(d.deltas.recall).toBeCloseTo(-0.1);
    expect(d.deltas.precision).toBeCloseTo(0);
    expect(d.alert?.version).toBe(3);
    expect(d.alert?.dropped).toEqual([{ metric: 'recall', points: 10 }]);
    expect(d.runs_total).toBe(4);
  });

  it('limits only trend and runs to the period', () => {
    const since = new Date(now - 30 * DAY);
    const d = buildAgentDetail({ agent, casesTotal: 4, allRuns: runs, since });
    expect(d.runs.map((r) => r.id)).toEqual(['r4', 'r3', 'r2']);
    expect(d.trend.map((p) => p.run_id)).toEqual(['r2', 'r3']);
    expect(d.runs_total).toBe(4);
    expect(d.latest?.id).toBe('r3');
  });

  it('has no latest, deltas or alert for an agent that never ran', () => {
    const d = buildAgentDetail({ agent, casesTotal: 0, allRuns: [], since: null });
    expect(d.latest).toBeNull();
    expect(d.alert).toBeNull();
    expect(d.deltas).toEqual({ recall: null, precision: null, citation_accuracy: null });
    expect(d.trend).toEqual([]);
  });
});

describe('buildCompare', () => {
  const base = {
    agentName: 'Security Reviewer',
    existingSkillIds: new Set(['s1']),
  };

  it('has no prompt diff for the same version, and no promote when the newer run is current', () => {
    const c = buildCompare({
      ...base,
      older: run({ id: 'o', day: 0, agentVersion: 3 }),
      newer: run({ id: 'n', day: 1, agentVersion: 3, recall: 0.9 }),
      olderPrompt: 'a',
      newerPrompt: 'a',
      currentVersion: 3,
    });
    expect(c.same_version).toBe(true);
    expect(c.prompt_diff).toBeNull();
    expect(c.promote).toBeNull();
    expect(c.deltas.recall).toBeCloseTo(0.1);
  });

  it('diffs the prompts line by line and offers promote with restore and missing skills', () => {
    const c = buildCompare({
      ...base,
      older: run({ id: 'o', day: 0, agentVersion: 1, skills: [{ id: 's1', name: 'Sec', version: 1 }] }),
      newer: run({
        id: 'n',
        day: 1,
        agentVersion: 2,
        skills: [
          { id: 's1', name: 'Sec', version: 2 },
          { id: 's2', name: 'Gone', version: 1 },
        ],
      }),
      olderPrompt: 'one\ntwo\n',
      newerPrompt: 'one\nthree\n',
      currentVersion: 3,
    });
    expect(c.prompt_diff).toEqual([
      { op: 'same', text: 'one' },
      { op: 'del', text: 'two' },
      { op: 'add', text: 'three' },
    ]);
    expect(c.skills_diff.changed).toEqual([{ name: 'Sec', from: 1, to: 2 }]);
    expect(c.skills_diff.added.map((s) => s.name)).toEqual(['Gone']);
    expect(c.same_skills).toBe(false);
    expect(c.promote).toEqual({
      version: 2,
      restore: [{ id: 's1', name: 'Sec', version: 2 }],
      missing: ['Gone'],
    });
  });

  it('says same skills when the sets are equal, even for different versions', () => {
    const c = buildCompare({
      ...base,
      older: run({ id: 'o', day: 0, agentVersion: 1 }),
      newer: run({ id: 'n', day: 1, agentVersion: 2 }),
      olderPrompt: 'a',
      newerPrompt: 'b',
      currentVersion: 2,
    });
    expect(c.same_skills).toBe(true);
    expect(c.promote).toBeNull();
    expect(c.prompt_diff).toEqual([
      { op: 'del', text: 'a' },
      { op: 'add', text: 'b' },
    ]);
  });
});

describe('buildDashboard', () => {
  const mk = (id: string, name: string, runs: RunRowLike[]) => ({
    id,
    name,
    model: 'm',
    enabled: true,
    casesTotal: runs.length,
    runs,
  });

  it('orders by latest completed run newest first, never-run agents last', () => {
    const view = buildDashboard({
      agents: [
        mk('b', 'Zeta never', []),
        mk('c', 'Old', [run({ id: 'c1', agentId: 'c', day: 1 })]),
        mk('d', 'New', [
          run({ id: 'd1', agentId: 'd', day: 2, recall: 0.5 }),
          run({ id: 'd2', agentId: 'd', day: 5, recall: 0.7 }),
        ]),
        mk('a', 'Alpha never', []),
      ],
      recentRuns: [],
      agentNames: new Map(),
    });
    expect(view.agents.map((a) => a.agent_id)).toEqual(['d', 'c', 'a', 'b']);
    expect(view.agents[0]!.sparkline).toEqual([0.5, 0.7]);
    expect(view.agents[0]!.latest?.id).toBe('d2');
    expect(view.agents[2]!.latest).toBeNull();
  });

  it('caps recent runs at 20, newest first, with agent names', () => {
    const many = Array.from({ length: 25 }, (_, i) => run({ id: `r${i}`, day: i }));
    const view = buildDashboard({
      agents: [],
      recentRuns: many,
      agentNames: new Map([['a1', 'Security Reviewer']]),
    });
    expect(view.recent_runs).toHaveLength(20);
    expect(view.recent_runs[0]!.id).toBe('r24');
    expect(view.recent_runs[0]!.agent_name).toBe('Security Reviewer');
  });
});

describe('EvalPipelineService run on evals (plan 35)', () => {
  const agent = (id: string, over: Partial<EvalAgent> = {}): EvalAgent => ({
    id,
    name: id,
    provider: 'openai',
    model: 'gpt-4.1',
    systemPrompt: 'p',
    strategy: 'single-pass',
    version: 1,
    enabled: true,
    ...over,
  });

  function make(opts: { skill?: Partial<EvalSkill>; using: string[]; agents: EvalAgent[]; cases: Record<string, number>; noKey?: string[] }) {
    const skill: EvalSkill = { id: 'sk', name: 'S', version: 1, enabled: true, rendered: 'B', paths: [], ...opts.skill };
    const deps = {
      repo: {
        countCases: async (_ws: string, o: { agentId: string }) => opts.cases[o.agentId] ?? 0,
        hasRunning: async () => false,
      },
      agents: { listAll: async () => opts.agents },
      skills: {
        getById: async (_ws: string, id: string) => (id === 'sk' ? skill : undefined),
        agentsUsing: async () => opts.using.map((id) => ({ id, name: id })),
      },
      llm: async (provider: string) => {
        if (opts.noKey?.includes(provider)) throw new ConfigError('no key');
        return {};
      },
    } as unknown as EvalPipelineServiceDeps;
    return new EvalPipelineService(deps);
  }

  const agents = [
    agent('a-using'),
    agent('a-off', { enabled: false }),
    agent('a-nocases'),
    agent('a-other'),
    agent('a-nokey', { provider: 'anthropic' }),
  ];
  const cases = { 'a-using': 3, 'a-off': 2, 'a-other': 4, 'a-nokey': 1 };
  const using = ['a-using', 'a-off', 'a-nocases', 'a-nokey'];

  it('previews only enabled agents that use the skill and have cases, and lists the keyless one as skipped', async () => {
    const svc = make({ agents, cases, using, noKey: ['anthropic'] });
    const p = await svc.runOnEvalsPreview('ws', 'sk');
    expect(p.blocked).toBeNull();
    expect(p.agents).toEqual([{ agent_id: 'a-using', name: 'a-using', model: 'gpt-4.1', cases: 3 }]);
    expect(p.total_cases).toBe(3);
    expect(p.skipped).toEqual([expect.objectContaining({ agent_id: 'a-nokey', reason: 'no_api_key' })]);
  });

  it('reports skill_disabled and no_agents as blocked reasons', async () => {
    expect((await make({ agents, cases, using, skill: { enabled: false } }).runOnEvalsPreview('ws', 'sk')).blocked).toBe('skill_disabled');
    expect((await make({ agents, cases, using: ['a-nocases'] }).runOnEvalsPreview('ws', 'sk')).blocked).toBe('no_agents');
  });

  it('POST re-checks the skill: 409 skill_disabled, 422 no_agents, 404 unknown', async () => {
    await expect(make({ agents, cases, using, skill: { enabled: false } }).runOnEvals('ws', 'sk')).rejects.toMatchObject({
      code: 'skill_disabled',
      statusCode: 409,
    });
    await expect(make({ agents, cases, using: ['a-nocases'] }).runOnEvals('ws', 'sk')).rejects.toMatchObject({
      code: 'no_agents',
      statusCode: 422,
    });
    await expect(make({ agents, cases, using }).runOnEvals('ws', 'zzz')).rejects.toMatchObject({ statusCode: 404 });
  });
});
