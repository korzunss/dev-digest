import { describe, it, expect } from 'vitest';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { validateCase } from '../src/modules/eval/pipeline-helpers.js';
import { runCase } from '../src/modules/eval/pipeline-runner.js';
import { aggregateRun, type CaseScore } from '../src/modules/eval/pipeline-scoring.js';
import type { EvalAgentSnapshot } from '../src/modules/eval/types.js';
import {
  EXPECTED_NEW,
  EXPECTED_OLD,
  FIXTURE_CASES,
  FIXTURE_SCRIPTS,
  NEW_PROMPT,
  OLD_PROMPT,
} from './helpers/eval-pipeline-suite.js';
import { ScriptedLLMProvider } from './helpers/llm-stubs.js';

const snapshot = (systemPrompt: string): EvalAgentSnapshot => ({
  id: 'agent-1',
  provider: 'openai',
  model: 'gpt-4.1',
  systemPrompt,
  strategy: 'single-pass',
  version: 1,
  skills: [],
  rendered: [],
});

const deps = { review: reviewPullRequest, parseDiff: parseUnifiedDiff, callOptions: {}, now: () => new Date(0) };

/** Run the whole fixture suite under one prompt and aggregate it like a suite run. */
async function runSuite(prompt: string) {
  const llm = new ScriptedLLMProvider(FIXTURE_SCRIPTS);
  const scores: CaseScore[] = [];
  for (const c of FIXTURE_CASES) {
    const r = await runCase(snapshot(prompt), llm, { diff: c.diff }, c.expected, deps);
    expect(r.status).not.toBe('errored');
    scores.push({ ...r, status: r.status as 'passed' | 'failed' });
  }
  return { agg: aggregateRun(scores, 0), llm };
}

describe('eval pipeline fixture suite (AC-62 #4)', () => {
  it('holds at least 8 valid cases covering every expectation shape', () => {
    expect(FIXTURE_CASES.length).toBeGreaterThanOrEqual(8);
    const names: string[] = [];
    for (const c of FIXTURE_CASES) {
      const v = validateCase({ diff: c.diff, expected: c.expected, name: c.name, takenNames: names, parseDiff: parseUnifiedDiff });
      expect(v, c.name).toMatchObject({ ok: true });
      names.push(c.name);
    }
    const kinds = new Set(FIXTURE_CASES.flatMap((c) => c.expected.map((e) => e.expect)));
    expect(kinds).toEqual(new Set(['must_find', 'must_not_flag']));
    expect(FIXTURE_CASES.some((c) => c.expected.length === 0)).toBe(true);
  });

  it('scores the old prompt below the new one, with one model call per case', async () => {
    const old = await runSuite(OLD_PROMPT);
    const next = await runSuite(NEW_PROMPT);
    expect(old.llm.calls).toHaveLength(FIXTURE_CASES.length);

    expect(old.agg.cases_passed).toBe(EXPECTED_OLD.passed);
    expect(old.agg.metrics.recall).toBeCloseTo(EXPECTED_OLD.recall);
    expect(old.agg.metrics.precision).toBeCloseTo(EXPECTED_OLD.precision);
    expect(old.agg.metrics.citation_accuracy).toBeLessThan(1); // the line-99 finding is dropped

    expect(next.agg.cases_passed).toBe(EXPECTED_NEW.passed);
    expect(next.agg.metrics).toEqual({ recall: 1, precision: 1, citation_accuracy: 1 });
  });
});
