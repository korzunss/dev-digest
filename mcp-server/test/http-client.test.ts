import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/core/errors.js';
import { createHttpApi } from '../src/http/client.js';

function recorder(respond: () => Response | Promise<Response>) {
  const calls: { method: string; url: string; body?: string }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url, ...(init?.body ? { body: String(init.body) } : {}) });
    return respond();
  }) as unknown as typeof fetch;
  return { calls, f };
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

describe('createHttpApi', () => {
  it('uses the right method and URL per call, encoding ids', async () => {
    const { calls, f } = recorder(() => json([]));
    const api = createHttpApi('http://x:1/', f);
    await api.listRepos();
    await api.listPulls('a/b');
    await api.listAgents();
    await api.listRuns('p 1');
    await api.listReviews('p1');
    await api.getConventions('r1');
    await api.triggerReview('p1', 'ag');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET http://x:1/repos',
      'GET http://x:1/repos/a%2Fb/pulls',
      'GET http://x:1/agents',
      'GET http://x:1/pulls/p%201/runs',
      'GET http://x:1/pulls/p1/reviews',
      'GET http://x:1/repos/r1/conventions',
      'POST http://x:1/pulls/p1/review',
    ]);
    expect(calls[6]?.body).toBe('{"agentId":"ag"}');
  });

  it('maps an API error envelope to ApiError with its code', async () => {
    const { f } = recorder(() => json({ error: { code: 'not_found', message: 'nope' } }, 404));
    const err = await createHttpApi('http://x', f).listAgents().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: 'not_found' });
  });

  it('falls back to not_found / http_error without an envelope', async () => {
    const a = await createHttpApi('http://x', recorder(() => json({}, 404)).f).listAgents().catch((e) => e);
    const b = await createHttpApi('http://x', recorder(() => json({}, 500)).f).listAgents().catch((e) => e);
    expect(a.code).toBe('not_found');
    expect(b.code).toBe('http_error');
  });

  it('maps a rejected fetch to unreachable and an abort to timeout', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const slow = (async () => {
      throw Object.assign(new Error('t'), { name: 'TimeoutError' });
    }) as unknown as typeof fetch;
    expect((await createHttpApi('http://x', down).listRepos().catch((e) => e)).code).toBe('unreachable');
    expect((await createHttpApi('http://x', slow).listRepos().catch((e) => e)).code).toBe('timeout');
  });
});
