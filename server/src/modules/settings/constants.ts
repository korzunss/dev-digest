/** Constants for the settings module. */
import type { ConnTestProvider, SecretKey } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { FORGE_PUBLIC_HOST } from '../repos/constants.js';

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

/** Trailing-slash-free, lowercase-origin spelling of a base, for comparison. */
function normalizeBase(base: string): string | null {
  try {
    const u = new URL(base);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.origin.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

/**
 * Which instance a connection test should talk to.
 *
 * `test-connection` has no repo context, so without this a self-managed GitLab
 * PAT is checked against gitlab.com and comes back 401 — the token is fine, the
 * host is wrong. Absent an `api_base`, the first configured GITLAB_HOST entry;
 * otherwise the public host.
 *
 * An explicit `api_base` only DISAMBIGUATES among instances the operator has
 * already allowlisted — it can never add one. The body is attacker-controlled
 * input and this route carries no auth, while `container.forge({provider,
 * apiBase})` puts the stored PAT in a PRIVATE-TOKEN header aimed at
 * `${apiBase}/api/v4`; the canonical-key fallback means an unknown host
 * resolves a real token rather than none. Same rule, and same error, as
 * `parseRepoUrl`'s unknown-host branch.
 */
export function resolveTestApiBase(
  provider: string,
  explicit: string | undefined,
  gitlabBases: string[],
): string | null {
  // Only GitLab has self-managed instances here — there is no GITHUB_HOST — so
  // an api_base on any other provider can only redirect its PAT.
  if (provider !== 'gitlab') return null;
  if (!explicit) return gitlabBases[0] ?? null;

  const wanted = normalizeBase(explicit);
  const allowed = [...gitlabBases, `https://${FORGE_PUBLIC_HOST.gitlab}`]
    .map(normalizeBase)
    .filter((b): b is string => b !== null);
  if (!wanted || !allowed.includes(wanted)) {
    throw new AppError(
      'unknown_forge_host',
      `'${explicit}' is not a known forge instance. Add it to GITLAB_HOST to use it.`,
      400,
    );
  }
  return wanted;
}
