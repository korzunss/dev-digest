import type { ApiError } from '../core/errors.js';
import type { AgentResolution, PullResolution, RepoResolution } from '../core/resolve.js';

const MAX = 200;
const cut = (s: string) => (s.length > MAX ? `${s.slice(0, MAX)}…` : s);

export function apiErrorText(err: ApiError, apiUrl?: string): string {
  switch (err.code) {
    case 'unreachable':
    case 'timeout':
      return `DevDigest API is not reachable${apiUrl ? ` at ${apiUrl}` : ''}. Start it with ./scripts/dev.sh, then retry.`;
    case 'no_run':
      return 'DevDigest did not start a run. Check the agent is enabled, then call run_agent_on_pr again.';
    default:
      if (err.status === 429) {
        return 'Review rate limit reached (10/min). Wait a minute, then retry or call get_findings.';
      }
      return `DevDigest API error ${err.code}: ${cut(err.message)}.`;
  }
}

type Failed<T> = Extract<T, { ok: false }>;

/** Text for a failed resolveRepo / resolvePull / resolveAgent. Exhaustive over `kind`. */
export function resolutionText(
  r: Failed<RepoResolution> | Failed<PullResolution> | Failed<AgentResolution>,
  ctx: { repo: string; pr?: number; agent?: string },
): string {
  switch (r.kind) {
    case 'repo_not_found':
      return `Repo '${ctx.repo}' not found. Known repos: ${r.known.join(', ') || 'none'}. Pass owner/name.`;
    case 'repo_ambiguous':
      return `'${ctx.repo}' matches ${r.matches.join(', ')}. Pass owner/name.`;
    case 'pr_not_found':
      return `PR #${ctx.pr} not found in ${ctx.repo}. Recent PRs: ${r.recent.map((n) => `#${n}`).join(', ') || 'none'}.`;
    case 'pr_not_imported':
      return `PR #${ctx.pr} is not imported yet. Open it once in the DevDigest studio, then retry.`;
    case 'agent_not_found':
      return `Agent '${ctx.agent ?? ''}' not found. Call list_agents for valid ids.`;
    case 'agent_disabled':
      return `Agent '${r.name}' is disabled. Enable it in the studio or pick another from list_agents.`;
  }
}

export const runFailedText = (id: string, error: string) =>
  `Run ${id} failed: ${cut(error)}. Check the agent's model and API key in DevDigest settings, then call run_agent_on_pr again.`;
export const runCancelledText = (id: string) =>
  `Run ${id} was cancelled. Call run_agent_on_pr to start a new run.`;
export const noReviewText = (repo: string, pr: number) =>
  `No finished review for ${repo}#${pr}. Call run_agent_on_pr to start one.`;
export const unknownRunText = (id: string, repo: string, pr: number) =>
  `Run ${id} not found for ${repo}#${pr}. Omit run_id to get the latest review.`;
export const BLAST_TEXT =
  'get_blast_radius is not available yet. Impact is UNKNOWN, not zero — do not conclude the PR has no impact; inspect callers of the changed files instead.';
