import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import { registerGetBlastRadius } from '../src/tools/get-blast-radius.js';
import { registerGetConventions } from '../src/tools/get-conventions.js';
import { registerListAgents } from '../src/tools/list-agents.js';
import { fakeApi, fakeClock, makeAgent, makeBlast, makeRepo } from './fakes.js';
import { connect, textOf } from './harness.js';

async function setup(over: Parameters<typeof fakeApi>[0] = {}) {
  const api = fakeApi(over);
  const deps = { api, clock: fakeClock(), waitMs: 1000, pollMs: 100 };
  const server = new McpServer({ name: 't', version: '0' });
  registerListAgents(server, deps);
  registerGetConventions(server, deps);
  registerGetBlastRadius(server, deps);
  return { api, client: await connect(server) };
}

describe('list_agents', () => {
  it('returns five fields per agent and never the prompt', async () => {
    const { client } = await setup({ agents: [makeAgent({ description: 'x'.repeat(300) })] });
    const res = await client.callTool({ name: 'list_agents', arguments: {} });
    const body = JSON.parse(textOf(res));
    expect(Object.keys(body.agents[0]).sort()).toEqual(['description', 'enabled', 'id', 'model', 'name']);
    expect(body.agents[0].description).toHaveLength(120);
    expect(textOf(res)).not.toContain('SECRET PROMPT');
  });

  it('turns an unreachable API into a next-step error', async () => {
    const { api, client } = await setup();
    const { ApiError } = await import('../src/core/errors.js');
    api.listAgents = async () => {
      throw new ApiError(0, 'unreachable');
    };
    const res = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('./scripts/dev.sh');
  });
});

describe('get_conventions', () => {
  it('lists known repos when the repo is unknown', async () => {
    const { client } = await setup({ repos: [makeRepo()] });
    const res = await client.callTool({ name: 'get_conventions', arguments: { repo: 'nope/x' } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('acme/web');
  });

  it('hints when no scan exists', async () => {
    const { client } = await setup();
    const res = await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/web' } });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(textOf(res))).toMatchObject({ scanned: false, accepted: [], hint: expect.stringContaining('no scan') });
  });
});

describe('get_blast_radius', () => {
  const args = { repo: 'acme/web', pr: 7 };

  it('returns the map from one getBlast call', async () => {
    const { api, client } = await setup();
    const res = await client.callTool({ name: 'get_blast_radius', arguments: args });
    expect(res.isError).toBeFalsy();
    expect(api.calls.filter((c) => c.startsWith('getBlast'))).toEqual(['getBlast(pull-1)']);
    const body = JSON.parse(textOf(res));
    expect(body.downstream[0].callers[0]).toMatchObject({ file: 'src/api.ts', line: 12 });
    expect(body.hint).toBeUndefined();
  });

  it('adds a hint when degraded', async () => {
    const { client } = await setup({ blast: makeBlast({ degraded: true, reason: 'no_data' }) });
    const res = await client.callTool({ name: 'get_blast_radius', arguments: args });
    expect(JSON.parse(textOf(res)).hint).toContain('UNKNOWN');
  });

  it('is an error listing recent PRs for an unknown PR, without calling getBlast', async () => {
    const { api, client } = await setup();
    const res = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/web', pr: 99 } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('#7');
    expect(api.calls.some((c) => c.startsWith('getBlast'))).toBe(false);
  });

  // an unknown repo is an error that never reaches the blast endpoint
  it('is an error for an unknown repo, without calling getBlast', async () => {
    const { api, client } = await setup();
    const res = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/nope', pr: 7 } });
    expect(res.isError).toBe(true);
    expect(api.calls.some((c) => c.startsWith('getBlast'))).toBe(false);
  });

  // PR-written text in the response is capped on the tool path too (data, not instructions)
  it('caps an oversized summary returned by the API', async () => {
    const { client } = await setup({ blast: makeBlast({ summary: 'y'.repeat(500) }) });
    const res = await client.callTool({ name: 'get_blast_radius', arguments: args });
    expect(JSON.parse(textOf(res)).summary).toBe(`${'y'.repeat(200)}…`);
  });
});
