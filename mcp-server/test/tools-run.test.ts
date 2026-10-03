import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import { registerGetFindings } from '../src/tools/get-findings.js';
import { registerRunAgentOnPr } from '../src/tools/run-agent-on-pr.js';
import { fakeApi, fakeClock, makeAgent, makeReview, makeRun } from './fakes.js';
import { connect, textOf } from './harness.js';

const RUN = '11111111-1111-4111-8111-111111111111';

async function setup(over: Parameters<typeof fakeApi>[0] = {}) {
  const api = fakeApi(over);
  const deps = { api, clock: fakeClock(), waitMs: 1000, pollMs: 100 };
  const server = new McpServer({ name: 't', version: '0' });
  registerRunAgentOnPr(server, deps);
  registerGetFindings(server, deps);
  return { api, client: await connect(server) };
}
const triggers = (calls: string[]) => calls.filter((c) => c.startsWith('triggerReview'));
const args = { repo: 'acme/web', pr: 7, agent: 'Security' };

describe('run_agent_on_pr', () => {
  it('returns done with a concise review after one trigger', async () => {
    const { api, client } = await setup({
      runs: [[makeRun({ status: 'done' })]],
      reviews: [makeReview()],
    });
    const res = await client.callTool({ name: 'run_agent_on_pr', arguments: args });
    expect(JSON.parse(textOf(res))).toMatchObject({ status: 'done', run_id: 'run-1', verdict: 'comment' });
    expect(triggers(api.calls)).toEqual(['triggerReview(pull-1,agent-1)']);
  });

  it('returns running with a next step when over budget', async () => {
    const { api, client } = await setup();
    const res = await client.callTool({ name: 'run_agent_on_pr', arguments: args });
    const body = JSON.parse(textOf(res));
    expect(body).toMatchObject({ status: 'running', run_id: 'run-1' });
    expect(body.next).toContain('get_findings');
    expect(triggers(api.calls)).toHaveLength(1);
  });

  it('fails a failed run with a next step', async () => {
    const { client } = await setup({ runs: [[makeRun({ status: 'failed', error: 'no key' })]] });
    const res = await client.callTool({ name: 'run_agent_on_pr', arguments: args });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('no key');
    expect(textOf(res)).toContain('call run_agent_on_pr again');
  });

  it('names list_agents when the agent is unknown, without triggering', async () => {
    const { api, client } = await setup({ agents: [makeAgent()] });
    const res = await client.callTool({ name: 'run_agent_on_pr', arguments: { ...args, agent: 'zzz' } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('list_agents');
    expect(triggers(api.calls)).toEqual([]);
  });
});

describe('get_findings', () => {
  it('returns the latest review per agent without triggering', async () => {
    const { api, client } = await setup({
      reviews: [makeReview(), makeReview({ agent_id: 'a2', agent_name: 'Bugs', id: 'r2', run_id: 'run-2' })],
    });
    const res = await client.callTool({ name: 'get_findings', arguments: { repo: 'acme/web', pr: 7 } });
    const body = JSON.parse(textOf(res));
    expect(body.repo).toBe('acme/web');
    expect(body.pr).toBe(7);
    expect(body.reviews.map((r: { agent: string }) => r.agent)).toEqual(['Bugs', 'Security']);
    expect(body.total_findings).toBe(body.reviews.reduce((n: number, r: { total: number }) => n + r.total, 0));
    expect(triggers(api.calls)).toEqual([]);
  });

  it('narrows to one agent in the same shape', async () => {
    const { client } = await setup({
      reviews: [makeReview(), makeReview({ agent_id: 'a2', agent_name: 'Bugs', id: 'r2', run_id: 'run-2' })],
    });
    const res = await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/web', pr: 7, agent: 'Security' },
    });
    const body = JSON.parse(textOf(res));
    expect(body.reviews).toHaveLength(1);
    expect(body.total_findings).toBe(0);
  });

  it('points to run_agent_on_pr when there is no review', async () => {
    const { client } = await setup();
    const res = await client.callTool({ name: 'get_findings', arguments: { repo: 'acme/web', pr: 7 } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('run_agent_on_pr');
  });

  it('reports a still-running run_id, and fails an unknown one', async () => {
    const { client } = await setup({ runs: [[makeRun({ run_id: RUN })]] });
    const running = await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/web', pr: 7, run_id: RUN },
    });
    expect(JSON.parse(textOf(running))).toEqual({ status: 'running', run_id: RUN });
    const unknown = await client.callTool({
      name: 'get_findings',
      arguments: { repo: 'acme/web', pr: 7, run_id: '22222222-2222-4222-8222-222222222222' },
    });
    expect(unknown.isError).toBe(true);
    expect(textOf(unknown)).toContain('Omit run_id');
  });
});
