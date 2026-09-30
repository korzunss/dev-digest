import { describe, it, expect, vi, afterEach } from 'vitest';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { callWithDeadline, LLM_WAIT_HEARTBEAT_MS, LlmDeadlineError, LlmOutputTruncatedError } from '../src/index.js';

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
    await expect(p).resolves.toBe(ok);
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

  it('truncation is not retried', async () => {
    const { llm, reqs } = fake(() => Promise.reject(new LlmOutputTruncatedError('m', 10, 10)));
    await expect(callWithDeadline<number>({ llm, request: base, label: 'x', emit: () => {} })).rejects.toBeInstanceOf(LlmOutputTruncatedError);
    expect(reqs).toHaveLength(1);
  });
});
