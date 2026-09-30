import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredRequest, StructuredResult, UnifiedDiff } from '@devdigest/shared';
import { reviewPullRequest } from '../src/index.js';

const review = { verdict: 'approve', summary: 's', score: 100, findings: [] };

function fake(servedBy?: string) {
  const reqs: StructuredRequest<unknown>[] = [];
  const llm = {
    id: 'openrouter',
    completeStructured: async (req: StructuredRequest<unknown>) => {
      reqs.push(req);
      return { data: review, model: req.model, tokensIn: 1, tokensOut: 7, costUsd: null, raw: '{}', attempts: 1, ...(servedBy ? { servedBy } : {}) } as StructuredResult<unknown>;
    },
  } as unknown as LLMProvider;
  return { llm, reqs };
}

function diffOf(paths: string[]): UnifiedDiff {
  const raw = paths
    .map((p) => `diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n@@ -1,1 +1,1 @@\n-a\n+b`)
    .join('\n');
  return {
    raw,
    files: paths.map((path) => ({ path, additions: 1, deletions: 1, hunks: [] })),
  } as unknown as UnifiedDiff;
}

const base = { systemPrompt: 'sys', model: 'm' };

describe('reviewPullRequest reliability', () => {
  it('size guard: single-pass + 2 files over threshold -> map-reduce', async () => {
    const { llm, reqs } = fake();
    const msgs: string[] = [];
    const out = await reviewPullRequest({ ...base, llm, diff: diffOf(['a.ts', 'b.ts']), strategy: 'single-pass', singlePassMaxDiffTokens: 10, onEvent: (e) => msgs.push(e.msg) });
    expect(out.mode).toBe('map-reduce');
    expect(reqs).toHaveLength(2);
    expect(msgs.some((m) => m.includes('instead of one pass'))).toBe(true);
  });

  it('single oversized file stays single-pass with a warning', async () => {
    const { llm, reqs } = fake();
    const msgs: string[] = [];
    const out = await reviewPullRequest({ ...base, llm, diff: diffOf(['a.ts']), singlePassMaxDiffTokens: 10, onEvent: (e) => msgs.push(e.msg) });
    expect(out.mode).toBe('single-pass');
    expect(reqs).toHaveLength(1);
    expect(msgs.some((m) => m.includes('cannot split'))).toBe(true);
  });

  it('passes caps/routing, logs settings once and served-by per chunk', async () => {
    const { llm, reqs } = fake('AtlasCloud');
    const msgs: string[] = [];
    await reviewPullRequest({
      ...base, llm, diff: diffOf(['a.ts', 'b.ts']), strategy: 'map-reduce',
      maxOutputTokens: 32000, requireParameters: true, routing: { sort: 'throughput' }, callDeadlineMs: 600_000,
      onEvent: (e) => msgs.push(e.msg),
    });
    expect(reqs[0].maxTokens).toBe(32000);
    expect(reqs[0].requireParameters).toBe(true);
    expect(reqs[0].routing).toEqual({ sort: 'throughput' });
    expect(msgs.filter((m) => m.startsWith('LLM call:'))).toHaveLength(1);
    expect(msgs.filter((m) => m.includes('served by AtlasCloud'))).toHaveLength(2);
    expect(msgs.some((m) => m.includes('7 output tokens'))).toBe(true);
  });

  it('aborted signal surfaces checkCancelled error', async () => {
    const llm = {
      id: 'openrouter',
      completeStructured: (req: StructuredRequest<unknown>) =>
        new Promise((_, reject) => req.signal!.addEventListener('abort', () => reject({ name: 'AbortError' }))),
    } as unknown as LLMProvider;
    const ac = new AbortController();
    const p = reviewPullRequest({ ...base, llm, diff: diffOf(['a.ts']), signal: ac.signal, checkCancelled: () => { if (ac.signal.aborted) throw new Error('run cancelled'); } });
    ac.abort();
    await expect(p).rejects.toThrow('run cancelled');
  });
});
