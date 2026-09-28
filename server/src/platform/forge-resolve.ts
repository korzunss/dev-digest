import type { ForgeProvider, RepoRef } from '@devdigest/shared';

/**
 * Pure helpers for resolving WHICH forge client and WHICH secret to use.
 * Kept out of container.ts so they are unit-testable without building a
 * container (and without a DB).
 */

/** Public default instance per forge, used when a repo carries no `api_base`. */
export const DEFAULT_API_BASE: Record<ForgeProvider, string> = {
  github: 'https://github.com',
  gitlab: 'https://gitlab.com',
};

/** Canonical secret name per forge. */
export const FORGE_TOKEN_SECRET: Record<ForgeProvider, string> = {
  github: 'GITHUB_TOKEN',
  gitlab: 'GITLAB_TOKEN',
};

/** Cache key for a resolved client: one per provider + instance. */
export function forgeCacheKey(provider: ForgeProvider, apiBase: string | null): string {
  return `${provider}:${apiBase ?? DEFAULT_API_BASE[provider]}`;
}

/**
 * Secret names to try, most specific first. A workspace pointing at two
 * self-managed instances needs two PATs, so an instance-scoped name
 * (`GITLAB_TOKEN@git.acme.com`) wins over the plain one.
 *
 * The scoped form resolves only from the stored secrets file: '@' is not a
 * legal character in an environment variable name, so the env fallback for it
 * always misses and drops through to the canonical key. That is intended — it
 * keeps single-instance setups working with a plain `GITLAB_TOKEN=` in `.env`.
 */
export function forgeTokenKeys(provider: ForgeProvider, apiBase: string | null): string[] {
  const canonical = FORGE_TOKEN_SECRET[provider];
  const host = apiBaseHost(apiBase);
  return host ? [`${canonical}@${host}`, canonical] : [canonical];
}

/** Host of an api base, or null when it is absent/unparseable. */
export function apiBaseHost(apiBase: string | null): string | null {
  if (!apiBase) return null;
  try {
    return new URL(apiBase).host;
  } catch {
    return null;
  }
}

/** REST root for a forge instance: `${apiBase}/api/v4`, prefix preserved. */
export function gitlabApiRoot(apiBase: string | null): string {
  const base = (apiBase ?? DEFAULT_API_BASE.gitlab).replace(/\/+$/, '');
  return `${base}/api/v4`;
}

/**
 * Adapter-facing ref for a persisted repo. Built here, in one place, so no call
 * site can forget `provider`/`apiBase` and silently talk to the wrong forge.
 *
 * (F1) Moved unchanged from `modules/repos/helpers.ts`, which now re-exports
 * it — this is pure cross-cutting resolution, not a repos-module concern.
 */
export function toRepoRef(row: {
  owner: string;
  name: string;
  fullName: string;
  provider: string;
  apiBase: string | null;
}): RepoRef {
  return {
    owner: row.owner,
    name: row.name,
    path: row.fullName,
    provider: row.provider as ForgeProvider,
    apiBase: row.apiBase ?? undefined,
  };
}

/**
 * The forge HOST for a repo: the host of its `api_base` when set and
 * well-formed, else the public host for its provider. Same result as the
 * old per-module `forgeHostFor` (`modules/intent/service.ts`), computed here
 * so it's reusable without importing a module's internals.
 */
export function forgeHostOf(provider: ForgeProvider, apiBase: string | null): string {
  return apiBaseHost(apiBase) ?? new URL(DEFAULT_API_BASE[provider] ?? DEFAULT_API_BASE.github).host;
}
