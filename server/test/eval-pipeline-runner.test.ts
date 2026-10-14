import { describe, it, expect } from 'vitest';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import type { EvalExpectation, Review } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { runCase, type CaseRunnerDeps } from '../src/modules/eval/pipeline-runner.js';
import type { EvalAgentSnapshot } from '../src/modules/eval/types.js';
import { ThrowingLLMProvider } from './helpers/llm-stubs.js';

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,4 @@',
  ' one',
  '+two',
  '+three',
  ' four',
  '',
].join('\n');

const snapshot: EvalAgentSnapshot = {
  id: 'agent-1',
  provider: 'openai',
  model: 'gpt-4.1',
  systemPrompt: 'You are the SUITE-AGENT reviewer.',
  strategy: 'single-pass',
  version: 4,
  skills: [{ id: 's1', name: 'sk', version: 2 }],
  rendered: ['SKILL-BODY-ONE'],
};

let tick = 0;
const deps: CaseRunnerDeps = {
  review: reviewPullRequest,
  parseDiff: parseUnifiedDiff,
  callOptions: {},
  now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + 250 * tick++),
};

const finding = (file: string, start: number, end = start) => ({
  id: 'f',
  severity: 'WARNING' as const,
  category: 'bug' as const,
  title: 'T',
  file,
  start_line: start,
  end_line: end,
  rationale: 'r',
  confidence: 0.9,
});
const review = (findings: ReturnType<typeof finding>[]): Review => ({
  verdict: 'comment',
  summary: 's',
  score: 80,
  findings,
});
const must = (file: string, line: number): EvalExpectation => ({ expect: 'must_find', file, start_line: line, end_line: line });

describe('runCase', () => {
  it('makes exactly one model call and scores the grounded findings in code', async () => {
    const llm = new MockLLMProvider('openai', { structured: review([finding('src/a.ts', 2), finding('src/a.ts', 99)]) });
    const r = await runCase(snapshot, llm, { diff: DIFF }, [must('src/a.ts', 2)], deps);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    expect(llm.calls.filter((c) => c.method === 'complete')).toHaveLength(0);
    expect(r).toMatchObject({
      status: 'passed',
      expected_count: 1,
      actual_count: 1,
      must_find_total: 1,
      must_find_matched: 1,
      noise: 0,
      kept: 1,
      dropped: 1,
      agent_version: 4,
      error: null,
    });
    expect(r.cost_usd).toBeCloseTo(0.001);
    expect(r.duration_ms).toBe(250);
    expect(r.ran_at).toMatch(/^2026-01-01T00:00:\d{2}\.\d{3}Z$/);
    expect(r.findings).toEqual([{ file: 'src/a.ts', start_line: 2, end_line: 2, title: 'T', severity: 'WARNING' }]);
  });

  it('tags the result with the model and the agent version only', async () => {
    const llm = new MockLLMProvider('openai', { structured: review([]) });
    const r = await runCase(snapshot, llm, { diff: DIFF }, [], deps);
    expect(r).toMatchObject({ model: 'gpt-4.1', agent_version: 4 });
    expect(r.skill_version).toBeUndefined();
  });

  it('tags a skill-owner result with skill_version and no agent_version (AC-88)', async () => {
    const llm = new MockLLMProvider('openai', { structured: review([]) });
    const r = await runCase({ ...snapshot, owner: 'skill', version: 7 }, llm, { diff: DIFF }, [], deps);
    expect(r).toMatchObject({ model: 'gpt-4.1', skill_version: 7 });
    expect(r.agent_version).toBeUndefined();
  });

  it('marks a missed must_find as failed, not errored', async () => {
    const llm = new MockLLMProvider('openai', { structured: review([]) });
    const r = await runCase(snapshot, llm, { diff: DIFF }, [must('src/a.ts', 2)], deps);
    expect(r).toMatchObject({ status: 'failed', must_find_matched: 0, actual_count: 0 });
  });

  it('sends the agent prompt and skills but no project context or callers', async () => {
    const llm = new MockLLMProvider('openai', { structured: review([]) });
    await runCase(snapshot, llm, { diff: DIFF }, [], deps);
    const req = JSON.stringify(llm.calls.find((c) => c.method === 'completeStructured')!.req);
    expect(req).toContain('SUITE-AGENT');
    expect(req).toContain('SKILL-BODY-ONE');
    expect(req).not.toContain('## Project context');
    expect(req).not.toMatch(/callers/i);
    expect(req).not.toContain('## PR intent');
    expect(req).not.toContain('## Repo context');
  });

  it('turns a provider failure into an errored result with a redacted reason', async () => {
    const llm = new ThrowingLLMProvider(new Error('401 bad key sk-abcdefghijklmnop\nstack line'));
    const r = await runCase(snapshot, llm, { diff: DIFF }, [must('src/a.ts', 2)], deps);
    expect(r.status).toBe('errored');
    expect(r.error).toContain('[redacted]');
    expect(r.error).not.toContain('sk-abcdefghijklmnop');
    expect(r.error).not.toContain('stack line');
    expect(r).toMatchObject({ expected_count: 1, must_find_total: 1, must_find_matched: 0, actual_count: 0, cost_usd: null, findings: [] });
  });

  it('turns a diff parse failure into an errored result without calling the model', async () => {
    const llm = new MockLLMProvider('openai', { structured: review([]) });
    const r = await runCase(snapshot, llm, { diff: DIFF }, [], {
      ...deps,
      parseDiff: () => {
        throw new Error('cannot parse');
      },
    });
    expect(r).toMatchObject({ status: 'errored', error: 'cannot parse' });
    expect(llm.calls).toHaveLength(0);
  });

  it('drops a finding outside the diff and counts it', async () => {
    const llm = new MockLLMProvider('openai', { structured: review([finding('other.ts', 1)]) });
    const r = await runCase(snapshot, llm, { diff: DIFF }, [], deps);
    expect(r).toMatchObject({ status: 'passed', kept: 0, dropped: 1 });
  });
});
