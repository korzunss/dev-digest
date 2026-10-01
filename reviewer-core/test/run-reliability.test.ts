import { describe, it, expect, vi, afterEach } from 'vitest';
import type { LLMProvider, StructuredRequest, StructuredResult, UnifiedDiff } from '@devdigest/shared';
import { reviewPullRequest, ReviewChunksSkippedError, LlmOutputTruncatedError, LlmOutputInvalidError } from '../src/index.js';

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

afterEach(() => vi.useRealTimers());

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

  it('R1 sums a failed attempt\'s reported usage into the outcome', async () => {
    let n = 0;
    const llm = {
      id: 'openrouter',
      completeStructured: async (req: StructuredRequest<unknown>) => {
        n++;
        if (n === 1) {
          req.onUsage!({ tokensIn: 1000, tokensOut: 200, costUsd: 0.002, costSource: 'api' });
          throw Object.assign(new Error('boom'), { status: 503 });
        }
        return { data: review, model: req.model, tokensIn: 1200, tokensOut: 300, costUsd: 0.003, costSource: 'api', raw: '{}', attempts: 1 } as StructuredResult<unknown>;
      },
    } as unknown as LLMProvider;
    const out = await reviewPullRequest({ ...base, llm, diff: diffOf(['a.ts']) });
    expect(out.tokensIn).toBe(2200);
    expect(out.tokensOut).toBe(500);
    expect(out.costUsd).toBeCloseTo(0.005);
    expect(out.costSource).toBe('api');
  });

  it('R2 forwards estimateCost and countTokens to the deadline estimate', async () => {
    vi.useFakeTimers();
    let n = 0;
    const llm = {
      id: 'openrouter',
      completeStructured: (req: StructuredRequest<unknown>) => {
        n++;
        if (n === 1) return new Promise((_, reject) => req.signal!.addEventListener('abort', () => reject({ name: 'AbortError' })));
        return Promise.resolve({ data: review, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: 0.01, costSource: 'api', raw: '{}', attempts: 1 } as StructuredResult<unknown>);
      },
    } as unknown as LLMProvider;
    const estimateCost = vi.fn(() => 0.5);
    const p = reviewPullRequest({ ...base, llm, diff: diffOf(['a.ts']), callDeadlineMs: 1000, estimateCost, countTokens: () => 100 });
    await vi.advanceTimersByTimeAsync(1500);
    const out = await p;
    expect(estimateCost).toHaveBeenCalledWith('m', 100, 16);
    expect(out.costSource).toBe('estimate');
    expect(out.costUsd).toBeCloseTo(0.51);
  });
  describe('skipped chunks (A1)', () => {
    const lastContent = (req: StructuredRequest<unknown>) => req.messages[req.messages.length - 1].content;

    /** `fail` maps a path substring to what that file's calls do. */
    function perFile(fail: Record<string, 'truncate' | 'invalid' | 'unpriced' | '503'>) {
      const calls: string[] = [];
      const llm = {
        id: 'openrouter',
        completeStructured: async (req: StructuredRequest<unknown>) => {
          const content = lastContent(req);
          const key = Object.keys(fail).find((k) => content.includes(k));
          calls.push(key ?? 'ok');
          if (key && fail[key] === '503') throw Object.assign(new Error('boom'), { status: 503 });
          if (key && fail[key] === 'invalid') {
            req.onUsage!({ tokensIn: 500, tokensOut: 100, costUsd: 0.01, costSource: 'api' });
            throw new LlmOutputInvalidError('m', 'Review', 3);
          }
          if (key) {
            req.onUsage!({ tokensIn: 1000, tokensOut: 32000, costUsd: fail[key] === 'unpriced' ? null : 0.01, costSource: 'api' });
            throw new LlmOutputTruncatedError('m', 32000, 32000);
          }
          return { data: review, model: req.model, tokensIn: 1, tokensOut: 7, costUsd: 0.001, costSource: 'api', raw: '{}', attempts: 1 } as StructuredResult<unknown>;
        },
      } as unknown as LLMProvider;
      return { llm, calls };
    }
    const three = diffOf(['aa.ts', 'bb.ts', 'cc.ts']);

    it('K1 skips a twice-truncated file, counts its usage, adds the partial note', async () => {
      const { llm, calls } = perFile({ 'bb.ts': 'truncate' });
      const msgs: string[] = [];
      const out = await reviewPullRequest({ ...base, llm, diff: three, strategy: 'map-reduce', maxSkippedChunkFraction: 0.1, onEvent: (e) => msgs.push(e.msg) });
      expect(out.skipped).toEqual([{ label: 'bb.ts', reason: 'LlmOutputTruncatedError' }]);
      expect(calls).toEqual(['ok', 'bb.ts', 'bb.ts', 'ok']);
      expect(out.tokensIn).toBe(2 + 2000);
      expect(out.tokensOut).toBe(14 + 64000);
      expect(out.costSource).toBe('api');
      expect(out.review.summary.startsWith('Partial review: 1 of 3')).toBe(true);
      expect(msgs.some((m) => m.includes('Reviewed 2/3 files'))).toBe(true);
    });

    it('K2 an unpriced skipped attempt makes the cost an estimate', async () => {
      const { llm } = perFile({ 'bb.ts': 'unpriced' });
      const msgs: string[] = [];
      const out = await reviewPullRequest({ ...base, llm, diff: three, strategy: 'map-reduce', maxSkippedChunkFraction: 0.1, onEvent: (e) => msgs.push(e.msg) });
      expect(out.costSource).toBe('estimate');
      expect(msgs.some((m) => m.includes('could not be priced'))).toBe(true);
    });

    it('K3 fails fast once the limit is exceeded', async () => {
      const { llm, calls } = perFile({ 'aa.ts': 'truncate', 'bb.ts': 'truncate' });
      await expect(
        reviewPullRequest({ ...base, llm, diff: three, strategy: 'map-reduce', maxSkippedChunkFraction: 0.1 }),
      ).rejects.toBeInstanceOf(ReviewChunksSkippedError);
      expect(calls).not.toContain('ok');
      expect(calls).toHaveLength(4);
    });

    it('K4 single-pass never skips', async () => {
      const { llm, calls } = perFile({ 'aa.ts': 'truncate' });
      await expect(
        reviewPullRequest({ ...base, llm, diff: diffOf(['aa.ts']), maxSkippedChunkFraction: 1 }),
      ).rejects.toBeInstanceOf(LlmOutputTruncatedError);
      expect(calls).toHaveLength(2);
    });

    it('K5 all chunks skipped throws instead of approving', async () => {
      const { llm } = perFile({ 'aa.ts': 'truncate', 'bb.ts': 'truncate' });
      await expect(
        reviewPullRequest({ ...base, llm, diff: diffOf(['aa.ts', 'bb.ts']), strategy: 'map-reduce', maxSkippedChunkFraction: 1 }),
      ).rejects.toBeInstanceOf(ReviewChunksSkippedError);
    });

    it('K6 a 503 twice is not skipped', async () => {
      const { llm } = perFile({ 'bb.ts': '503' });
      await expect(
        reviewPullRequest({ ...base, llm, diff: three, strategy: 'map-reduce', maxSkippedChunkFraction: 0.1 }),
      ).rejects.toThrow('boom');
    });

    it('K8 invalid output is skipped without a retry and its usage is counted', async () => {
      const { llm, calls } = perFile({ 'bb.ts': 'invalid' });
      const out = await reviewPullRequest({ ...base, llm, diff: three, strategy: 'map-reduce', maxSkippedChunkFraction: 0.1 });
      expect(out.skipped).toEqual([{ label: 'bb.ts', reason: 'LlmOutputInvalidError' }]);
      expect(calls).toEqual(['ok', 'bb.ts', 'ok']);
      expect(out.tokensIn).toBe(2 + 500);
      expect(out.tokensOut).toBe(14 + 100);
    });

    it('K9 the limit is floor(chunks x fraction): 3 of 10 pass, a 4th throws', async () => {
      const paths = Array.from({ length: 10 }, (_, i) => `f${i}.ts`);
      const ten = diffOf(paths);
      const three = perFile({ 'f1.ts': 'truncate', 'f2.ts': 'truncate', 'f3.ts': 'truncate' });
      const out = await reviewPullRequest({ ...base, llm: three.llm, diff: ten, strategy: 'map-reduce', maxSkippedChunkFraction: 0.35 });
      expect(out.skipped).toHaveLength(3);
      const four = perFile({ 'f1.ts': 'truncate', 'f2.ts': 'truncate', 'f3.ts': 'truncate', 'f4.ts': 'truncate' });
      await expect(
        reviewPullRequest({ ...base, llm: four.llm, diff: ten, strategy: 'map-reduce', maxSkippedChunkFraction: 0.35 }),
      ).rejects.toBeInstanceOf(ReviewChunksSkippedError);
    });

    it('K7 without maxSkippedChunkFraction a truncation rejects as before', async () => {
      const { llm } = perFile({ 'bb.ts': 'truncate' });
      await expect(
        reviewPullRequest({ ...base, llm, diff: three, strategy: 'map-reduce' }),
      ).rejects.toBeInstanceOf(LlmOutputTruncatedError);
    });
  });
});
