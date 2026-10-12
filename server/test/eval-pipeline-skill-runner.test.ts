import { describe, it, expect } from 'vitest';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import type { EvalExpectation, Review } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { EVAL_SKILL_HARNESS_PROMPT } from '../src/modules/eval/constants.js';
import { skillSnapshot } from '../src/modules/eval/pipeline-helpers.js';
import { runCase, type CaseRunnerDeps } from '../src/modules/eval/pipeline-runner.js';

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

const deps: CaseRunnerDeps = {
  review: reviewPullRequest,
  parseDiff: parseUnifiedDiff,
  callOptions: {},
  now: () => new Date('2026-01-01T00:00:00Z'),
};

const skill = { id: 'sk1', name: 'Null Checks', version: 5, enabled: true, rendered: '### Skill: Null Checks\n\nSKILL-ONLY-BODY' };
const review: Review = {
  verdict: 'comment',
  summary: 's',
  score: 80,
  findings: [
    { id: 'f', severity: 'WARNING', category: 'bug', title: 'T', file: 'src/a.ts', start_line: 2, end_line: 2, rationale: 'r', confidence: 0.9 },
  ],
};
const must: EvalExpectation = { expect: 'must_find', file: 'src/a.ts', start_line: 2, end_line: 2 };

describe('skill case run (real reviewPullRequest, mock LLM)', () => {
  it('makes one call whose prompt is the harness plus this skill only (AC-62 #9, AC-86)', async () => {
    const llm = new MockLLMProvider('openai', { structured: review });
    const snap = skillSnapshot(skill, { provider: 'openai', model: 'gpt-4.1' });
    const r = await runCase(snap, llm, { diff: DIFF }, [must], deps);

    const calls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(calls).toHaveLength(1);
    const req = JSON.stringify(calls[0]!.req);
    expect(req).toContain(JSON.stringify(EVAL_SKILL_HARNESS_PROMPT).slice(1, -1));
    expect(req).toContain('SKILL-ONLY-BODY');
    expect(req).not.toContain('## Project context');
    expect(req).not.toContain('## PR intent');
    expect(r).toMatchObject({ status: 'passed', model: 'gpt-4.1', skill_version: 5 });
    expect(r.agent_version).toBeUndefined();
  });

  it('scores in code: no extra model call (AC-62 #8)', async () => {
    const llm = new MockLLMProvider('openai', { structured: { ...review, findings: [] } });
    const r = await runCase(skillSnapshot(skill, { provider: 'openai', model: 'm' }), llm, { diff: DIFF }, [must], deps);
    expect(r.status).toBe('failed');
    expect(llm.calls.filter((c) => c.method === 'complete')).toHaveLength(0);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
  });
});
