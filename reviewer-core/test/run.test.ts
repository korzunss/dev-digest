import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest } from '../src/index.js';

/**
 * Engine-level test for reviewPullRequest (the core lifted out of the server's
 * runOneAgent). Uses the server's mock LLM + git so we exercise the real
 * assemble → completeStructured → reduce → grounding pipeline with no DB/SSE.
 */
describe('reviewPullRequest (engine)', () => {
  // One grounded finding (line 11 is in the MockGitClient diff) + one
  // hallucinated finding (line 999) the grounding gate must drop.
  const fixture = {
    verdict: 'request_changes',
    summary: 'secret key committed',
    score: 38,
    findings: [
      {
        id: 'f1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'sk_live in diff',
        confidence: 0.98,
        kind: 'finding',
      },
      {
        id: 'f-hallucinated',
        severity: 'WARNING',
        category: 'bug',
        title: 'phantom finding on a line not in the diff',
        file: 'src/config.ts',
        start_line: 999,
        end_line: 999,
        rationale: 'not real',
        confidence: 0.3,
        kind: 'finding',
      },
    ],
  };

  it('single-pass: assembles, grounds, drops the hallucinated finding', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();

    const events: string[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      task: 'Review PR #482',
      onEvent: (e) => events.push(e.msg),
    });

    expect(outcome.mode).toBe('single-pass');
    expect(outcome.grounding).toBe('1/2 passed');
    expect(outcome.review.findings).toHaveLength(1);
    expect(outcome.review.findings[0]!.start_line).toBe(11);
    expect(outcome.dropped).toHaveLength(1);
    // Score is derived from the SURVIVING findings, not the model's self-reported
    // 38: one CRITICAL remains after grounding ⇒ 100 − 35 = 65.
    expect(outcome.review.score).toBe(65);
    // progress is surfaced (server bridges this onto SSE; runner logs it)
    expect(events.some((m) => m.includes('Citation grounding'))).toBe(true);
  });

  it('score is deterministic from findings: a clean approve scores 100', async () => {
    // Model "approves" but reports a nonsense low score (the cheap-model bug).
    // The engine must ignore that and score the zero findings as a perfect 100.
    const clean = { verdict: 'approve', summary: 'looks good', score: 10, findings: [] };
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'deepseek/deepseek-v4-flash',
      diff,
      llm,
      task: 'Review PR #5',
    });

    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.review.score).toBe(100);
  });

  it('checkCancelled throwing aborts before the LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();
    await expect(
      reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff,
        llm,
        checkCancelled: () => {
          throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
  });

  it('forwards sessionId to every LLM call (OpenRouter session grouping)', async () => {
    const seen: (string | undefined)[] = [];
    const recorder: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req): Promise<StructuredResult<T>> {
        seen.push(req.sessionId);
        return {
          data: fixture as unknown as T,
          model: req.model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          raw: '',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    const diff = await new MockGitClient().diff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: recorder, sessionId: 'sess-abc' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'sess-abc')).toBe(true);
  });
});

/**
 * Cost provenance (spec 001). The engine must carry BOTH the number and where
 * it came from: a price OpenRouter reported and one we guessed from tokens look
 * identical downstream otherwise, and the UI has to mark the guess.
 */
/**
 * Out-of-scope filter wired into the engine (spec 006 S5, D6). Grounding runs
 * FIRST and is unaffected by intent; the scope filter only ever removes a
 * grounding survivor, never restores a dropped one.
 */
describe('reviewPullRequest — out-of-scope filter (with intent)', () => {
  const intent = {
    intent: 'Add rate limiting to the public API',
    in_scope: ['Rate limiter middleware'],
    out_of_scope: ['Config refactors'],
  };

  it('an ungrounded finding is dropped by GROUNDING, even when marked in-scope', async () => {
    const fixture = {
      verdict: 'comment',
      summary: 'x',
      score: 90,
      findings: [
        {
          id: 'ungrounded',
          severity: 'WARNING',
          category: 'bug',
          title: 'phantom finding on a line not in the diff',
          file: 'src/config.ts',
          start_line: 999,
          end_line: 999,
          rationale: 'not real',
          confidence: 0.3,
          kind: 'finding',
        },
      ],
    };
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();
    const events: string[] = [];

    const outcome = await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff,
      llm,
      intent,
      onEvent: (e) => events.push(e.msg),
    });

    expect(outcome.review.findings).toHaveLength(0);
    expect(events.some((m) => m.includes('grounding dropped'))).toBe(true);
    expect(events.some((m) => m.includes('scope-filtered'))).toBe(false);
  });

  it('two serious (CRITICAL) out-of-scope findings collapse into exactly one kept finding', async () => {
    const seriousFinding = (id: string) => ({
      id,
      severity: 'CRITICAL',
      category: 'security',
      title: `Serious OOS finding ${id}`,
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'grounded on line 11',
      confidence: 0.9,
      kind: 'finding',
      out_of_scope: true,
    });
    const fixture = {
      verdict: 'request_changes',
      summary: 'x',
      score: 20,
      findings: [seriousFinding('a'), seriousFinding('b')],
    };
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();
    const events: string[] = [];

    const outcome = await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff,
      llm,
      intent,
      onEvent: (e) => events.push(e.msg),
    });

    expect(outcome.review.findings).toHaveLength(1);
    expect(outcome.review.findings[0]!.title).toMatch(/^Out of scope: /);
    expect(events.some((m) => m.includes('scope-filtered'))).toBe(true);
  });

  it('a non-serious out-of-scope finding is dropped entirely', async () => {
    const fixture = {
      verdict: 'comment',
      summary: 'x',
      score: 90,
      findings: [
        {
          id: 'oos-suggestion',
          severity: 'SUGGESTION',
          category: 'style',
          title: 'Config style nit',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'grounded on line 11',
          confidence: 0.7,
          kind: 'finding',
          out_of_scope: true,
        },
      ],
    };
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm, intent });
    expect(outcome.review.findings).toHaveLength(0);
  });

  it('no intent ⇒ out_of_scope is never consulted — the finding survives untouched', async () => {
    const fixture = {
      verdict: 'comment',
      summary: 'x',
      score: 90,
      findings: [
        {
          id: 'would-be-oos',
          severity: 'SUGGESTION',
          category: 'style',
          title: 'Config style nit',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'grounded on line 11',
          confidence: 0.7,
          kind: 'finding',
          out_of_scope: true,
        },
      ],
    };
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();
    const events: string[] = [];

    const outcome = await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff,
      llm,
      onEvent: (e) => events.push(e.msg),
    });

    expect(outcome.review.findings).toHaveLength(1);
    expect(outcome.review.findings[0]!.id).toBe('would-be-oos');
    expect(events.some((m) => m.includes('scope-filtered'))).toBe(false);
  });
});

describe('reviewPullRequest — cost provenance', () => {
  const clean = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

  // Two files + a big enough diff so 'map-reduce' really makes one call per file.
  const TWO_FILE_DIFF = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,2 +1,3 @@',
    ' const a = 1;',
    '+const b = 2;',
    ' export { a };',
    'diff --git a/src/b.ts b/src/b.ts',
    '--- a/src/b.ts',
    '+++ b/src/b.ts',
    '@@ -1,2 +1,3 @@',
    ' const c = 3;',
    '+const d = 4;',
    ' export { c };',
  ].join('\n');

  it('single-pass: reports the provider\'s own source', async () => {
    const diff = await new MockGitClient().diff();
    const reported = await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff,
      llm: new MockLLMProvider('openai', { structured: clean, cost: 0.002, costSource: 'api' }),
    });
    expect(reported.costUsd).toBe(0.002);
    expect(reported.costSource).toBe('api');
  });

  it('map-reduce: one estimated chunk makes the whole run an estimate (worst-wins)', async () => {
    const diff = await new MockGitClient({ diff: TWO_FILE_DIFF }).diff();
    const outcome = await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff,
      strategy: 'map-reduce',
      llm: new MockLLMProvider('openai', {
        structured: clean,
        costPerCall: [
          { cost: 0.001, source: 'api' },
          { cost: 0.002, source: 'estimate' },
        ],
      }),
    });
    expect(outcome.mode).toBe('map-reduce');
    expect(outcome.costUsd).toBeCloseTo(0.003, 10);
    expect(outcome.costSource).toBe('estimate');
  });

  it('no cost ⇒ no source (a provenance without a number is noise)', async () => {
    const diff = await new MockGitClient().diff();
    const outcome = await reviewPullRequest({
      systemPrompt: 's',
      model: 'unknown/model',
      diff,
      llm: new MockLLMProvider('openai', { structured: clean, cost: null, costSource: null }),
    });
    expect(outcome.costUsd).toBeNull();
    expect(outcome.costSource).toBeNull();
  });
});
