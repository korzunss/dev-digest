import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import { registerGetBlastRadius } from '../src/tools/get-blast-radius.js';
import { registerGetConventions } from '../src/tools/get-conventions.js';
import { registerListAgents } from '../src/tools/list-agents.js';
import { fakeApi, fakeClock, makeAgent, makeRepo } from './fakes.js';
import { connect, textOf } from './harness.js';

async function setup(over: Parameters<typeof fakeApi>[0] = {}) {
  const api = fakeApi(over);
  const deps = { api, clock: fakeClock(), waitMs: 1000, pollMs: 100 };
  const server = new McpServer({ name: 't', version: '0' });
  registerListAgents(server, deps);
  registerGetConventions(server, deps);
  registerGetBlastRadius(server);
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
  it('is an error that says impact is UNKNOWN and makes no API call', async () => {
    const { api, client } = await setup();
    const res = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/web', pr: 7 } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('UNKNOWN');
    expect(api.calls).toEqual([]);
  });
});
