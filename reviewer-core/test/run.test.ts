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
    expect(outcome.review.verdict).toBe('request_changes');
    expect(outcome.review.summary).toBe('secret key committed');
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

describe('reviewPullRequest — verdict and summary from final findings', () => {
  const phantom = {
    id: 'f-phantom',
    severity: 'CRITICAL',
    category: 'bug',
    title: 'phantom critical on a line not in the diff',
    file: 'src/config.ts',
    start_line: 999,
    end_line: 999,
    rationale: 'not real',
    confidence: 0.9,
    kind: 'finding',
  };

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

  it('single-pass: a model request_changes whose only finding is grounded out becomes approve', async () => {
    const llm = new MockLLMProvider('openai', {
      structured: { verdict: 'request_changes', summary: 'bad', score: 10, findings: [phantom] },
    });
    const diff = await new MockGitClient().diff();
    const outcome = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm });
    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.review.verdict).toBe('approve');
  });

  it('map-reduce: the summary is computed, with no model text and no dropped title', async () => {
    const llm = new MockLLMProvider('openai', {
      structured: { verdict: 'request_changes', summary: 'MODEL TEXT', score: 10, findings: [phantom] },
    });
    const diff = await new MockGitClient({ diff: TWO_FILE_DIFF }).diff();
    const outcome = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm, strategy: 'map-reduce' });
    expect(outcome.mode).toBe('map-reduce');
    expect(outcome.review.summary.startsWith('Reviewed ')).toBe(true);
    expect(outcome.review.summary).not.toContain('MODEL TEXT');
    expect(outcome.review.summary).not.toContain(phantom.title);
  });

  // map-reduce: the only CRITICAL is grounded out, so the verdict is approve (not the model's request_changes)
  it('map-reduce: a grounded-out CRITICAL yields approve and "no findings"', async () => {
    const llm = new MockLLMProvider('openai', {
      structured: { verdict: 'request_changes', summary: 'MODEL TEXT', score: 10, findings: [phantom] },
    });
    const diff = await new MockGitClient({ diff: TWO_FILE_DIFF }).diff();
    const outcome = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm, strategy: 'map-reduce' });
    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.review.verdict).toBe('approve');
    expect(outcome.review.summary).toContain('no findings');
  });

  // both modes: a surviving CRITICAL forces request_changes even when the model said approve
  it.each(['single-pass', 'map-reduce'] as const)(
    '%s: a surviving CRITICAL overrides a model approve',
    async (strategy) => {
      const real = { ...phantom, id: 'f-real', title: 'real critical', file: 'src/a.ts', start_line: 2, end_line: 2 };
      const llm = new MockLLMProvider('openai', {
        structured: { verdict: 'approve', summary: 'MODEL TEXT', score: 100, findings: [real] },
      });
      const diff = await new MockGitClient({ diff: TWO_FILE_DIFF }).diff();
      const outcome = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm, strategy });
      expect(outcome.review.findings.length).toBeGreaterThan(0);
      expect(outcome.review.verdict).toBe('request_changes');
      if (strategy === 'map-reduce') {
        expect(outcome.review.summary).toContain('real critical (src/a.ts:2)');
        expect(outcome.review.summary).not.toContain('MODEL TEXT');
      } else {
        expect(outcome.review.summary).toBe('MODEL TEXT');
      }
    },
  );

  // single-pass keeps the model's own summary verbatim, even when the model verdict is overridden
  it('single-pass: keeps the model summary', async () => {
    const llm = new MockLLMProvider('openai', {
      structured: { verdict: 'request_changes', summary: 'MODEL TEXT', score: 10, findings: [phantom] },
    });
    const diff = await new MockGitClient().diff();
    const outcome = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm });
    expect(outcome.review.summary).toBe('MODEL TEXT');
  });
});

describe('reviewPullRequest — per-chunk repo context', () => {
  const clean = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };
  const DIFF = [
    'diff --git a/server/a.ts b/server/a.ts',
    '--- a/server/a.ts',
    '+++ b/server/a.ts',
    '@@ -1,2 +1,3 @@',
    ' const a = 1;',
    '+const b = 2;',
    ' export { a };',
    'diff --git a/client/b.ts b/client/b.ts',
    '--- a/client/b.ts',
    '+++ b/client/b.ts',
    '@@ -1,2 +1,3 @@',
    ' const c = 3;',
    '+const d = 4;',
    ' export { c };',
  ].join('\n');
  const repoRules = [
    { scope: 'server', source: 'server/AGENTS.md', text: 'SERVER-RULE' },
    { scope: 'client', source: 'client/AGENTS.md', text: 'CLIENT-RULE' },
    { scope: '', source: 'AGENTS.md', text: 'ROOT-RULE' },
  ];

  async function userPrompts(extra: Record<string, unknown>): Promise<string[]> {
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = await new MockGitClient({ diff: DIFF }).diff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm, strategy: 'map-reduce', ...extra });
    return llm.calls
      .filter((c) => c.method === 'completeStructured')
      .map((c) => (c.req as { messages: { content: string }[] }).messages[1]!.content);
  }

  it('scopes rules per chunk and lists every changed path in both', async () => {
    const [one, two] = await userPrompts({
      repoRules,
      changedFiles: ['server/a.ts', 'client/b.ts'],
    });
    expect(one).toContain('SERVER-RULE');
    expect(one).toContain('ROOT-RULE');
    expect(one).not.toContain('CLIENT-RULE');
    expect(two).toContain('CLIENT-RULE');
    expect(two).toContain('ROOT-RULE');
    expect(two).not.toContain('SERVER-RULE');
    for (const u of [one, two]) {
      expect(u).toContain('- server/a.ts');
      expect(u).toContain('- client/b.ts');
      expect(u).toContain('<untrusted source="repo-context">');
    }
  });

  // caller-supplied memory is kept and precedes the repo items
  it('keeps caller memory ahead of the repo rules', async () => {
    const [one] = await userPrompts({ memory: ['CALLER-MEM'], repoRules });
    expect(one).toContain('CALLER-MEM');
    expect(one!.indexOf('CALLER-MEM')).toBeLessThan(one!.indexOf('SERVER-RULE'));
  });

  // repoRulesMaxChars reaches the selector: the deepest set is cut, the root set is dropped
  it('applies repoRulesMaxChars per chunk', async () => {
    const [one] = await userPrompts({ repoRules, repoRulesMaxChars: 5 });
    expect(one).toContain('[truncated]');
    expect(one).not.toContain('SERVER-RULE');
    expect(one).not.toContain('ROOT-RULE');
  });

  // single-pass has one prompt and scopes rules by every changed path
  it('single-pass selects rules by all changed paths', async () => {
    const prompts = await userPrompts({ repoRules, changedFiles: ['server/a.ts'], strategy: 'single-pass' });
    expect(prompts).toHaveLength(1);
    for (const r of ['SERVER-RULE', 'CLIENT-RULE', 'ROOT-RULE']) expect(prompts[0]).toContain(r);
  });

  // only a file list: no rule text, but the untrusted block carries the list
  it('renders just the changed-file list when there are no rule sets', async () => {
    const [one] = await userPrompts({ changedFiles: ['server/a.ts'] });
    expect(one).toContain('Files changed in this PR (1):');
    expect(one).not.toContain('Rules from');
  });

  // empty rule list and no file list add nothing: same prompt as the baseline
  it('adds no block for an empty rule list', async () => {
    expect(await userPrompts({ repoRules: [] })).toEqual(await userPrompts({}));
  });

  it('is byte-identical to the baseline when both fields are absent', async () => {
    const base = await userPrompts({});
    expect(base.every((u) => !u.includes('Repo context'))).toBe(true);
    expect(await userPrompts({ repoRules: undefined, changedFiles: undefined })).toEqual(base);
  });
});
