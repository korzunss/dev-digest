import { describe, expect, it } from 'vitest';
import { resolveAgent, resolvePull, resolveRepo } from '../src/core/resolve.js';
import { fakeApi, makeAgent, makePr, makeRepo } from './fakes.js';

describe('resolveRepo', () => {
  it('matches full_name case-insensitively', async () => {
    const r = await resolveRepo(fakeApi(), 'ACME/Web');
    expect(r).toMatchObject({ ok: true, repo: { id: 'repo-1' } });
  });

  it('falls back to bare name and reports ambiguity', async () => {
    const api = fakeApi({
      repos: [makeRepo({ id: 'a', full_name: 'a/x', name: 'x' }), makeRepo({ id: 'b', full_name: 'b/x', name: 'x' })],
    });
    expect(await resolveRepo(api, 'x')).toEqual({ ok: false, kind: 'repo_ambiguous', matches: ['a/x', 'b/x'] });
  });

  it('lists at most 10 known repos when unknown', async () => {
    const repos = Array.from({ length: 12 }, (_, i) => makeRepo({ id: `r${i}`, full_name: `o/r${i}`, name: `r${i}` }));
    const r = await resolveRepo(fakeApi({ repos }), 'nope');
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'repo_not_found') expect(r.known).toHaveLength(10);
  });
});

describe('resolvePull', () => {
  it('finds by number', async () => {
    expect(await resolvePull(fakeApi(), 'repo-1', 7)).toMatchObject({ ok: true, pullId: 'pull-1' });
  });

  it('reports not found with recent numbers', async () => {
    expect(await resolvePull(fakeApi(), 'repo-1', 99)).toEqual({ ok: false, kind: 'pr_not_found', recent: [7] });
  });

  it('reports not imported when id is nullish', async () => {
    const api = fakeApi({ pulls: { 'repo-1': [makePr({ id: null })] } });
    expect(await resolvePull(api, 'repo-1', 7)).toEqual({ ok: false, kind: 'pr_not_imported' });
  });
});

describe('resolveAgent', () => {
  const agents = [makeAgent(), makeAgent({ id: 'a2', name: 'Perf', enabled: false })];

  it('matches by id and by name', () => {
    expect(resolveAgent(agents, 'agent-1')).toMatchObject({ ok: true });
    expect(resolveAgent(agents, 'security')).toMatchObject({ ok: true });
  });

  it('reports unknown and disabled', () => {
    expect(resolveAgent(agents, 'zzz')).toEqual({ ok: false, kind: 'agent_not_found' });
    expect(resolveAgent(agents, 'a2')).toEqual({ ok: false, kind: 'agent_disabled', name: 'Perf' });
  });
});
