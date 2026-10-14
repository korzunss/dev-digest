import { describe, it, expect } from 'vitest';
import { buildVersionDiff, isConfigChange, toAgentVersionDto } from '../src/modules/agents/helpers.js';
import type { AgentVersionRow } from '../src/modules/agents/repository.js';

const current = {
  version: 3,
  provider: 'openai',
  model: 'gpt-4o',
  systemPrompt: 'new prompt',
  outputSchema: null,
  strategy: 'single-pass',
  ciFailOn: 'critical',
  repoIntel: false,
};

const config = (over: Record<string, unknown> = {}) => ({
  provider: 'openai',
  model: 'gpt-4o',
  system_prompt: 'new prompt',
  output_schema: null,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: false,
  skills: [],
  ...over,
});

const base = { from: 1, current, currentSkills: [], liveNames: new Map<string, string>() };

describe('buildVersionDiff', () => {
  it('reports identical when nothing differs', () => {
    const d = buildVersionDiff({ ...base, fromConfig: config() });
    expect(d).toMatchObject({ identical: true, prompt_patch: '', fields: [], config_available: true });
  });

  it('builds a prompt patch and field changes', () => {
    const d = buildVersionDiff({ ...base, fromConfig: config({ system_prompt: 'old', model: 'gpt-4o-mini' }) });
    expect(d.prompt_patch).toContain('-old');
    expect(d.prompt_patch).toContain('+new prompt');
    expect(d.fields).toEqual([{ field: 'model', from: 'gpt-4o-mini', to: 'gpt-4o' }]);
    expect(d.identical).toBe(false);
  });

  it('treats an old null output_schema as unchanged but shows a differing one as JSON', () => {
    const cur = { ...current, outputSchema: { a: 1 } };
    expect(buildVersionDiff({ ...base, current: cur, fromConfig: config() }).fields).toEqual([]);
    const d = buildVersionDiff({ ...base, current: cur, fromConfig: config({ output_schema: { a: 2 } }) });
    expect(d.fields).toEqual([{ field: 'output_schema', from: '{"a":2}', to: '{"a":1}' }]);
  });

  it('does not report an output_schema change that is only a key reorder', () => {
    const cur = { ...current, outputSchema: { a: 1, b: { x: 1, y: 2 } } };
    const d = buildVersionDiff({ ...base, current: cur, fromConfig: config({ output_schema: { b: { y: 2, x: 1 }, a: 1 } }) });
    expect(d.fields).toEqual([]);
    expect(d.identical).toBe(true);
  });

  it('computes added / removed / order and resolves names live, recorded, none', () => {
    const d = buildVersionDiff({
      ...base,
      fromConfig: config({ skills: ['a', 'b', 'gone'], skill_names: { a: 'old-a', gone: 'Gone skill' } }),
      currentSkills: [
        { id: 'b', name: 'B' },
        { id: 'a', name: 'A' },
        { id: 'n', name: 'N' },
      ],
      liveNames: new Map([['a', 'A'], ['b', 'B'], ['n', 'N']]),
    });
    expect(d.skills.added.map((s) => s.id)).toEqual(['n']);
    expect(d.skills.removed).toEqual([{ id: 'gone', name: 'Gone skill', deleted: true }]);
    expect(d.skills.order_changed).toBe(true);
    expect(d.skills.from[0]).toEqual({ id: 'a', name: 'A', deleted: false });
    const none = buildVersionDiff({ ...base, fromConfig: config({ skills: ['x'] }) });
    expect(none.skills.removed).toEqual([{ id: 'x', name: null, deleted: true }]);
  });

  it('marks an unreadable snapshot and keeps string skill ids', () => {
    const d = buildVersionDiff({ ...base, fromConfig: { skills: ['s1'], model: 5 } });
    expect(d).toMatchObject({ config_available: false, prompt_patch: '', fields: [] });
    expect(d.skills.removed.map((s) => s.id)).toEqual(['s1']);
    expect(buildVersionDiff({ ...base, fromConfig: null }).skills.from).toEqual([]);
  });
});

describe('isConfigChange', () => {
  const existing = {
    provider: 'openai',
    model: 'm',
    systemPrompt: 'p',
    strategy: 'single-pass',
    ciFailOn: 'critical',
    repoIntel: false,
    outputSchema: { a: 1 },
  } as Parameters<typeof isConfigChange>[0];

  it('ignores name / description edits', () => {
    expect(isConfigChange(existing, { name: 'x', description: 'y' })).toBe(false);
  });
  it('ignores an equal output schema, detects a different one', () => {
    expect(isConfigChange(existing, { outputSchema: { a: 1 } })).toBe(false);
    expect(isConfigChange(existing, { outputSchema: { a: 2 } })).toBe(true);
  });
  it('compares output schemas regardless of key order', () => {
    const e = { ...existing, outputSchema: { a: 1, b: { x: 1, y: [{ p: 1, q: 2 }] } } };
    expect(isConfigChange(e, { outputSchema: { b: { y: [{ q: 2, p: 1 }], x: 1 }, a: 1 } })).toBe(false);
  });
  it('detects a model change', () => {
    expect(isConfigChange(existing, { model: 'z' })).toBe(true);
  });
});

describe('toAgentVersionDto', () => {
  it('maps an unreadable snapshot to config null and a missing message to null', () => {
    const row = { agentId: 'a', version: 1, configJson: { bad: 1 }, message: null, createdAt: new Date(0) };
    expect(toAgentVersionDto(row as unknown as AgentVersionRow)).toMatchObject({ config: null, message: null });
  });
});
