import { describe, it, expect, vi, afterEach } from 'vitest';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { callWithDeadline, LLM_WAIT_HEARTBEAT_MS, LlmDeadlineError, LlmConnectionError, LlmOutputTruncatedError, LlmOutputInvalidError } from '../src/index.js';

const ok = { data: 1, model: 'm', tokensIn: 1, tokensOut: 1, costUsd: null, raw: '', attempts: 1 } as StructuredResult<number>;

type Behavior = (req: StructuredRequest<number>, n: number) => Promise<StructuredResult<number>>;

function fake(behavior: Behavior) {
  const reqs: StructuredRequest<number>[] = [];
  const llm = {
    id: 'openrouter',
    completeStructured: (req: StructuredRequest<number>) => {
      reqs.push(req);
      return behavior(req, reqs.length);
    },
  } as unknown as LLMProvider;
  return { llm, reqs };
}

const hang: Behavior = (req) =>
  new Promise((_, reject) => {
    req.signal!.addEventListener('abort', () => reject({ name: 'AbortError' }));
  });

const base = { model: 'm', schema: {} as never, schemaName: 'S', messages: [], requireParameters: true, routing: { sort: 'throughput' as const } };

afterEach(() => vi.useRealTimers());

describe('callWithDeadline', () => {
  it('deadline -> error line, retry with retryRouting, two deadlines throw after 2 calls', async () => {
    vi.useFakeTimers();
    const { llm, reqs } = fake(hang);
    const lines: string[] = [];
    const p = callWithDeadline<number>({
      llm, request: base, retryRouting: {}, deadlineMs: 60_000, label: 'x',
      emit: (k, m) => lines.push(`${k}:${m}`),
    });
    const assertion = expect(p).rejects.toBeInstanceOf(LlmDeadlineError);
    await vi.advanceTimersByTimeAsync(200_000);
    await assertion;
    expect(reqs).toHaveLength(2);
    expect(reqs[1].routing).toEqual({});
    expect(reqs[1].requireParameters).toBe(true);
    expect(lines.some((l) => l.startsWith('error:') && l.includes('within 1 min'))).toBe(true);
    expect(lines.some((l) => l.includes('retrying once'))).toBe(true);
  });

  it('deadline then success uses retryRouting on the 2nd request', async () => {
    vi.useFakeTimers();
    const { llm, reqs } = fake((req, n) => (n === 1 ? hang(req, n) : Promise.resolve(ok)));
    const p = callWithDeadline<number>({ llm, request: base, retryRouting: {}, deadlineMs: 1000, label: 'x', emit: () => {} });
    await vi.advanceTimersByTimeAsync(1500);
    await expect(p).resolves.toMatchObject({ data: 1, costSource: 'estimate', tokensIn: 1, tokensOut: 17 });
    expect(reqs[0].routing).toEqual({ sort: 'throughput' });
    expect(reqs[1].routing).toEqual({});
  });

  it('external abort calls checkCancelled and its error wins', async () => {
    const { llm } = fake(hang);
    const ac = new AbortController();
    const p = callWithDeadline<number>({
      llm, request: base, signal: ac.signal, label: 'x', emit: () => {},
      checkCancelled: () => { throw new Error('cancelled!'); },
    });
    ac.abort();
    await expect(p).rejects.toThrow('cancelled!');
  });

  it('heartbeats at 2 and 4 minutes', async () => {
    vi.useFakeTimers();
    const { llm } = fake((req) => new Promise((res) => setTimeout(() => res(ok), 250_000)));
    const lines: string[] = [];
    const p = callWithDeadline<number>({ llm, request: base, deadlineMs: 600_000, label: 'x', emit: (_k, m) => lines.push(m) });
    await vi.advanceTimersByTimeAsync(2 * LLM_WAIT_HEARTBEAT_MS + 10_000);
    const beats = lines.filter((l) => l.includes('still waiting'));
    expect(beats).toHaveLength(2);
    expect(beats[1]).toContain('4 min elapsed');
    await vi.advanceTimersByTimeAsync(20_000);
    await p;
  });

  it('503 then success -> one retry line', async () => {
    const { llm, reqs } = fake((_r, n) => (n === 1 ? Promise.reject({ status: 503, name: 'InternalServerError' }) : Promise.resolve(ok)));
    const lines: string[] = [];
    await callWithDeadline<number>({ llm, request: base, label: 'x', emit: (_k, m) => lines.push(m) });
    expect(reqs).toHaveLength(2);
    expect(lines.filter((l) => l.includes('retrying once'))).toHaveLength(1);
  });

  it('LlmConnectionError then success -> one retry line', async () => {
    const { llm, reqs } = fake((_r, n) => (n === 1 ? Promise.reject(new LlmConnectionError('m', false)) : Promise.resolve(ok)));
    const lines: string[] = [];
    await callWithDeadline<number>({ llm, request: base, label: 'x', emit: (_k, m) => lines.push(m) });
    expect(reqs).toHaveLength(2);
    expect(lines.filter((l) => l.includes('retrying once'))).toHaveLength(1);
  });

  describe('truncation and onFinalFailure', () => {
    const report = { tokensIn: 1000, tokensOut: 32000, costUsd: 0.01, costSource: 'api' as const };

    it('T1 truncation then success retries once with retryRouting and merges the usage', async () => {
      const { llm, reqs } = fake(async (req, n) => {
        if (n === 1) {
          req.onUsage!(report);
          throw new LlmOutputTruncatedError('m', 32000, 32000);
        }
        return { ...ok, tokensIn: 10, tokensOut: 20, costUsd: 0.001, costSource: 'api' } as StructuredResult<number>;
      });
      const lines: string[] = [];
      const r = await callWithDeadline<number>({
        llm, request: base, retryRouting: {}, label: 'x', emit: (_k, m) => lines.push(m),
      });
      expect(reqs).toHaveLength(2);
      expect(reqs[1].routing).toEqual({});
      expect(reqs[1].requireParameters).toBe(true);
      expect(lines.filter((l) => l.includes('retrying once (LlmOutputTruncatedError)'))).toHaveLength(1);
      expect(r.tokensIn).toBe(1010);
      expect(r.tokensOut).toBe(32020);
      expect(r.costUsd).toBeCloseTo(0.011);
    });

    it('T2 truncation twice rejects after 2 calls; onFinalFailure gets the sum', async () => {
      const { llm, reqs } = fake(async (req) => {
        req.onUsage!(report);
        throw new LlmOutputTruncatedError('m', 32000, 32000);
      });
      const onFinalFailure = vi.fn();
      await expect(
        callWithDeadline<number>({ llm, request: base, label: 'x', emit: () => {}, onFinalFailure }),
      ).rejects.toBeInstanceOf(LlmOutputTruncatedError);
      expect(reqs).toHaveLength(2);
      expect(onFinalFailure).toHaveBeenCalledTimes(1);
      expect(onFinalFailure.mock.calls[0][0]).toMatchObject({ tokensIn: 2000, tokensOut: 64000, deadline: false });
      expect(onFinalFailure.mock.calls[0][0].costUsd).toBeCloseTo(0.02);
    });

    it('T3 invalid output is not retried; onFinalFailure gets that attempt', async () => {
      const { llm, reqs } = fake(async (req) => {
        req.onUsage!(report);
        throw new LlmOutputInvalidError('m', 'S', 3);
      });
      const onFinalFailure = vi.fn();
      await expect(
        callWithDeadline<number>({ llm, request: base, label: 'x', emit: () => {}, onFinalFailure }),
      ).rejects.toBeInstanceOf(LlmOutputInvalidError);
      expect(reqs).toHaveLength(1);
      expect(onFinalFailure).toHaveBeenCalledTimes(1);
      expect(onFinalFailure.mock.calls[0][0]).toMatchObject({ tokensIn: 1000, tokensOut: 32000 });
    });

    it('T4 external cancel does not call onFinalFailure', async () => {
      const { llm } = fake(hang);
      const ac = new AbortController();
      const onFinalFailure = vi.fn();
      const p = callWithDeadline<number>({
        llm, request: base, signal: ac.signal, label: 'x', emit: () => {}, onFinalFailure,
        checkCancelled: () => { throw new Error('cancelled!'); },
      });
      ac.abort();
      await expect(p).rejects.toThrow('cancelled!');
      expect(onFinalFailure).not.toHaveBeenCalled();
    });

    it('T4b a cancel after a reported round does not call onFinalFailure', async () => {
      // cancel wins even when the aborted attempt already reported usage
      const { llm } = fake((req) => {
        req.onUsage!(report);
        return hang(req, 1);
      });
      const ac = new AbortController();
      const onFinalFailure = vi.fn();
      const p = callWithDeadline<number>({
        llm, request: base, signal: ac.signal, label: 'x', emit: () => {}, onFinalFailure,
        checkCancelled: () => { throw new Error('cancelled!'); },
      });
      ac.abort();
      await expect(p).rejects.toThrow('cancelled!');
      expect(onFinalFailure).not.toHaveBeenCalled();
    });

    it('T6 a first-attempt usage is not counted twice when the retry also fails', async () => {
      // first attempt reports, the retry reports nothing: the total is the first attempt only
      const { llm } = fake(async (req, n) => {
        if (n === 1) {
          req.onUsage!(report);
          throw new LlmOutputTruncatedError('m', 32000, 32000);
        }
        throw new LlmOutputInvalidError('m', 'S', 3);
      });
      const onFinalFailure = vi.fn();
      await expect(
        callWithDeadline<number>({ llm, request: base, label: 'x', emit: () => {}, onFinalFailure }),
      ).rejects.toBeInstanceOf(LlmOutputInvalidError);
      expect(onFinalFailure).toHaveBeenCalledTimes(1);
      expect(onFinalFailure.mock.calls[0][0]).toMatchObject({ tokensIn: 1000, tokensOut: 32000 });
    });

    it('T5 transient twice with no reports does not call onFinalFailure', async () => {
      const { llm, reqs } = fake(() => Promise.reject(Object.assign(new Error('boom'), { status: 503 })));
      const onFinalFailure = vi.fn();
      await expect(
        callWithDeadline<number>({ llm, request: base, label: 'x', emit: () => {}, onFinalFailure }),
      ).rejects.toThrow('boom');
      expect(reqs).toHaveLength(2);
      expect(onFinalFailure).not.toHaveBeenCalled();
    });
  });

  describe('failed-attempt usage', () => {
    const res = (tokensIn: number, tokensOut: number, costUsd: number | null, costSource?: 'api' | 'estimate') =>
      ({ ...ok, tokensIn, tokensOut, costUsd, ...(costSource ? { costSource } : {}) }) as StructuredResult<number>;
    const transient = () => Object.assign(new Error('boom'), { status: 503 });

    it('L1 merges reported rounds of a transient failure into the retry', async () => {
      const { llm } = fake(async (req, n) => {
        if (n === 1) {
          req.onUsage!({ tokensIn: 1000, tokensOut: 200, costUsd: 0.002, costSource: 'api' });
          throw transient();
        }
        return res(1200, 300, 0.003, 'api');
      });
      const lines: string[] = [];
      const r = await callWithDeadline<number>({ llm, request: base, label: 'x', emit: (_k, m) => lines.push(m) });
      expect(r.tokensIn).toBe(2200);
      expect(r.tokensOut).toBe(500);
      expect(r.costUsd).toBeCloseTo(0.005);
      expect(r.costSource).toBe('api');
      expect(lines.filter((l) => l.includes('counted failed attempt'))).toHaveLength(1);
    });

    it('L2 estimates a deadline-aborted round with a known price', async () => {
      vi.useFakeTimers();
      const { llm } = fake((req, n) => (n === 1 ? hang(req, n) : Promise.resolve(res(1, 1, 0.01, 'api'))));
      const p = callWithDeadline<number>({
        llm, request: base, deadlineMs: 60_000, label: 'x', emit: () => {},
        countTokens: () => 100, estimateCost: (_m, i, o) => (i + o) / 1e6,
      });
      await vi.advanceTimersByTimeAsync(61_000);
      const r = await p;
      expect(r.tokensIn).toBe(101);
      expect(r.tokensOut).toBe(961);
      expect(r.costUsd).toBeCloseTo(0.01106);
      expect(r.costSource).toBe('estimate');
    });

    it('L3 counts tokens unpriced when the price book has no price', async () => {
      vi.useFakeTimers();
      const { llm } = fake((req, n) => (n === 1 ? hang(req, n) : Promise.resolve(res(1, 1, 0.01, 'api'))));
      const lines: string[] = [];
      const p = callWithDeadline<number>({
        llm, request: base, deadlineMs: 60_000, label: 'x', emit: (_k, m) => lines.push(m),
        countTokens: () => 100, estimateCost: () => null,
      });
      await vi.advanceTimersByTimeAsync(61_000);
      const r = await p;
      expect(r).toMatchObject({ tokensIn: 101, tokensOut: 961, costUsd: 0.01, costSource: 'estimate' });
      expect(lines.some((l) => l.includes('could not be priced'))).toBe(true);
    });

    it('L4 uses the last round as input and caps output at maxTokens', async () => {
      vi.useFakeTimers();
      const { llm } = fake((req, n) => {
        if (n === 1) {
          req.onUsage!({ tokensIn: 500, tokensOut: 50, costUsd: 0.001, costSource: 'api' });
          return hang(req, n);
        }
        return Promise.resolve(res(0, 0, 0, 'api'));
      });
      const p = callWithDeadline<number>({
        llm, request: { ...base, maxTokens: 100 }, deadlineMs: 60_000, label: 'x', emit: () => {},
        estimateCost: () => 0,
      });
      await vi.advanceTimersByTimeAsync(61_000);
      const r = await p;
      expect(r.tokensIn).toBe(500 + 550);
      expect(r.tokensOut).toBe(50 + 100);
    });

    it('L5 returns a first-attempt success unchanged, with no counted line', async () => {
      const { llm } = fake(async () => ok);
      const lines: string[] = [];
      const r = await callWithDeadline<number>({ llm, request: base, label: 'x', emit: (_k, m) => lines.push(m) });
      expect(r).toBe(ok);
      expect(lines.some((l) => l.includes('counted'))).toBe(false);
    });
  });
});
