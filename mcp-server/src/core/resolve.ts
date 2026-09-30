import type { Agent, PrMeta, Repo } from '@devdigest/shared';
import type { DevDigestApi } from './ports.js';

const LIST_MAX = 10;

export type RepoResolution =
  | { ok: true; repo: Repo }
  | { ok: false; kind: 'repo_not_found'; known: string[] }
  | { ok: false; kind: 'repo_ambiguous'; matches: string[] };

export type PullResolution =
  | { ok: true; pullId: string; pr: PrMeta }
  | { ok: false; kind: 'pr_not_found'; recent: number[] }
  | { ok: false; kind: 'pr_not_imported' };

export type AgentResolution =
  | { ok: true; agent: Agent }
  | { ok: false; kind: 'agent_not_found' }
  | { ok: false; kind: 'agent_disabled'; name: string };

/** Match `owner/name` first (case-insensitive), then a bare `name`. */
export async function resolveRepo(api: DevDigestApi, repo: string): Promise<RepoResolution> {
  const repos = await api.listRepos();
  const needle = repo.trim().toLowerCase();
  const byFull = repos.filter((r) => r.full_name.toLowerCase() === needle);
  const matches = byFull.length > 0 ? byFull : repos.filter((r) => r.name.toLowerCase() === needle);
  const [first] = matches;
  if (first && matches.length === 1) return { ok: true, repo: first };
  if (matches.length > 1) {
    return { ok: false, kind: 'repo_ambiguous', matches: matches.slice(0, LIST_MAX).map((r) => r.full_name) };
  }
  return { ok: false, kind: 'repo_not_found', known: repos.slice(0, LIST_MAX).map((r) => r.full_name) };
}

/** Find a PR by its number; an unimported PR has no internal id yet. */
export async function resolvePull(api: DevDigestApi, repoId: string, pr: number): Promise<PullResolution> {
  const pulls = await api.listPulls(repoId);
  const found = pulls.find((p) => p.number === pr);
  if (!found) {
    return { ok: false, kind: 'pr_not_found', recent: pulls.slice(0, LIST_MAX).map((p) => p.number) };
  }
  if (found.id == null) return { ok: false, kind: 'pr_not_imported' };
  return { ok: true, pullId: found.id, pr: found };
}

/** Exact id first, then case-insensitive name. */
export function resolveAgent(agents: Agent[], agent: string): AgentResolution {
  const needle = agent.trim().toLowerCase();
  const found = agents.find((a) => a.id === agent) ?? agents.find((a) => a.name.toLowerCase() === needle);
  if (!found) return { ok: false, kind: 'agent_not_found' };
  if (!found.enabled) return { ok: false, kind: 'agent_disabled', name: found.name };
  return { ok: true, agent: found };
}
