import { describe, expect, it } from 'vitest';
import { createHttpApi } from '../src/http/client.js';
import { buildServer, INSTRUCTIONS } from '../src/server.js';
import { fakeApi, fakeClock } from './fakes.js';
import { connect } from './harness.js';

const NAMES = ['get_blast_radius', 'get_conventions', 'get_findings', 'list_agents', 'run_agent_on_pr'];

async function listed() {
  const client = await connect(buildServer({ api: fakeApi(), clock: fakeClock(), waitMs: 1, pollMs: 1 }));
  return (await client.listTools()).tools;
}

describe('buildServer', () => {
  it('registers exactly the 5 tools with explicit annotations', async () => {
    const tools = await listed();
    expect(tools.map((t) => t.name).sort()).toEqual(NAMES);
    for (const t of tools) {
      const a = t.annotations;
      expect(a?.readOnlyHint, t.name).toBeTypeOf('boolean');
      expect(a?.destructiveHint, t.name).toBeTypeOf('boolean');
      expect(a?.idempotentHint, t.name).toBeTypeOf('boolean');
      expect(a?.openWorldHint, t.name).toBeTypeOf('boolean');
      expect(a?.readOnlyHint, t.name).toBe(t.name !== 'run_agent_on_pr');
    }
  });

  it('keeps the startup footprint small', async () => {
    const tools = await listed();
    expect(INSTRUCTIONS.length).toBeLessThanOrEqual(500);
    expect(JSON.stringify(tools).length + INSTRUCTIONS.length).toBeLessThanOrEqual(6000);
    for (const t of tools) {
      expect(t.description?.length ?? 0, t.name).toBeLessThanOrEqual(200);
      const props = (t.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
      for (const [k, p] of Object.entries(props)) {
        expect(p.description?.length ?? 0, `${t.name}.${k}`).toBeLessThanOrEqual(80);
      }
    }
  });
});

describe('GET-only pin', () => {
  function recording() {
    const seen: string[] = [];
    const routes: Record<string, unknown> = {
      '/repos': [{ id: 'r1', full_name: 'acme/web', name: 'web' }],
      '/repos/r1/pulls': [{ id: 'p1', number: 7 }],
      '/agents': [{ id: 'a1', name: 'Security', enabled: true, model: 'm', description: '' }],
      '/pulls/p1/runs': [{ run_id: 'run-1', agent_id: 'a1', status: 'running' }],
      '/pulls/p1/reviews': [],
      '/pulls/p1/blast': {
        changed_symbols: [],
        downstream: [],
        summary: '',
        degraded: false,
        reason: null,
        limits: { callers_per_symbol: 10, depth: 2 },
      },
      '/repos/r1/conventions': { scan: null, candidates: [] },
      '/pulls/p1/review': { pr_id: 'p1', runs: [{ run_id: 'run-1', agent_id: 'a1', agent_name: 'Security' }], reviews: [] },
    };
    const f = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      seen.push(method);
      const body = routes[new URL(url).pathname];
      return new Response(JSON.stringify(body ?? {}), { status: body === undefined ? 404 : 200 });
    }) as unknown as typeof fetch;
    return { seen, f };
  }

  it('read tools only ever GET; run_agent_on_pr POSTs once', async () => {
    const { seen, f } = recording();
    const client = await connect(
      buildServer({ api: createHttpApi('http://x', f), clock: fakeClock(), waitMs: 10, pollMs: 5 }),
    );
    const repo = 'acme/web';
    await client.callTool({ name: 'list_agents', arguments: {} });
    await client.callTool({ name: 'get_findings', arguments: { repo, pr: 7 } });
    await client.callTool({ name: 'get_conventions', arguments: { repo } });
    await client.callTool({ name: 'get_blast_radius', arguments: { repo, pr: 7 } });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBeGreaterThanOrEqual(5);
    expect(new Set(seen)).toEqual(new Set(['GET']));

    seen.length = 0;
    await client.callTool({ name: 'run_agent_on_pr', arguments: { repo, pr: 7, agent: 'Security' } });
    expect(seen.filter((m) => m === 'POST')).toHaveLength(1);
  });
});
