/** Constants for the settings module. */
import type { ConnTestProvider, SecretKey } from '@devdigest/shared';

/** Connection-test providers that are code forges, not LLM providers. */
export const FORGE_PROVIDERS = ['github', 'gitlab'] as const;

export function isForgeProvider(p: string): p is (typeof FORGE_PROVIDERS)[number] {
  return (FORGE_PROVIDERS as readonly string[]).includes(p);
}

/** Maps a connection-test provider to the SecretsProvider key it persists to. */
export const SECRET_KEY_BY_PROVIDER: Record<ConnTestProvider, SecretKey> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  github: 'GITHUB_TOKEN',
  gitlab: 'GITLAB_TOKEN',
};

/**
 * Which instance a connection test should talk to.
 *
 * `test-connection` has no repo context, so without this a self-managed GitLab
 * PAT is checked against gitlab.com and comes back 401 — the token is fine, the
 * host is wrong. An explicit `api_base` in the request wins; otherwise the first
 * configured GITLAB_HOST entry; otherwise the public host.
 */
export function resolveTestApiBase(
  provider: string,
  explicit: string | undefined,
  gitlabBases: string[],
): string | null {
  if (explicit) return explicit.replace(/\/+$/, '');
  if (provider === 'gitlab') return gitlabBases[0] ?? null;
  return null;
}
