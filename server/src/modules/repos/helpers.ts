import type { ForgeProvider, RepoRef, Repo } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { AppError } from '../../platform/errors.js';
import {
  FORGE_PUBLIC_HOST,
  GIT_TOKEN_USERNAME,
  FORBIDDEN_PATH_SEGMENTS,
} from './constants.js';

/**
 * F1 — repos pure helpers. Pure functions only — no I/O, no DB, no container.
 */

export interface ParsedRepoUrl {
  provider: ForgeProvider;
  /**
   * Origin + any path prefix of a self-managed instance, or null for the
   * forge's public host. Null keeps hosted repos identical to before.
   */
  apiBase: string | null;
  /** Everything before the last '/' — may contain '/' for nested GitLab groups. */
  owner: string;
  name: string;
  /** Full project path, i.e. `owner/name`. */
  fullName: string;
}

export interface ParseRepoUrlOptions {
  /**
   * Forge hint from the request body. It DISAMBIGUATES among hosts we already
   * trust — it never authorises a new one. See the unknown-host branch: a
   * caller must not be able to point the app at an arbitrary instance just by
   * naming a provider, because that instance then receives the forge PAT both
   * as a PRIVATE-TOKEN header and embedded in the clone URL.
   */
  provider?: ForgeProvider;
  /**
   * Configured self-managed GitLab bases, as full URLs
   * (`https://git.acme.com`, `https://acme.com/gitlab`). A base is matched as a
   * PREFIX, which is what disambiguates a relative-URL install: without it,
   * `https://acme.com/gitlab/group/proj` is indistinguishable from a repo in a
   * top-level group literally named `gitlab`.
   */
  gitlabBases?: string[];
}

/** `git@host:group/project.git` and `ssh://git@host:2222/group/project.git` → https form. */
function normalizeScpLike(url: string): string {
  if (/^ssh:\/\//i.test(url)) {
    try {
      const u = new URL(url.replace(/^ssh:/i, 'https:'));
      // An SSH port says nothing about where the HTTPS API lives, and leaving
      // it on makes the host miss both the configured-base prefix match and
      // the public-host table. A custom port on an https:// URL is kept.
      u.username = '';
      u.password = '';
      u.port = '';
      return u.toString();
    } catch {
      /* fall through to the scp-like branch */
    }
  }
  // scp syntax has no port: the colon separates host from path.
  const scp = url.match(/^[\w.-]+@([^:/]+):(.+)$/);
  if (scp) return `https://${scp[1]}/${scp[2]}`;
  return url;
}

function stripBase(url: string, base: string): string | null {
  const b = base.replace(/\/+$/, '');
  if (url === b) return '';
  return url.startsWith(`${b}/`) ? url.slice(b.length + 1) : null;
}

function cleanProjectPath(raw: string, url: string): { owner: string; name: string; fullName: string } {
  const path = raw.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/, '');
  const segments = path.split('/');
  if (segments.length < 2 || segments.some((s) => FORBIDDEN_PATH_SEGMENTS.has(s))) {
    // The old two-segment GitHub regex made traversal impossible by accident;
    // widening it for nested GitLab groups removes that guard, so check here.
    throw new AppError('invalid_repo_url', `Could not parse owner/repo from '${url}'`, 400);
  }
  const name = segments[segments.length - 1]!;
  const owner = segments.slice(0, -1).join('/');
  return { owner, name, fullName: `${owner}/${name}` };
}

/**
 * Parse a repo URL into forge + instance + project path. Supports https and
 * both ssh spellings, nested GitLab groups, and self-managed instances
 * (including one installed under a relative URL).
 */
export function parseRepoUrl(url: string, opts: ParseRepoUrlOptions = {}): ParsedRepoUrl {
  const normalized = normalizeScpLike(url.trim());

  // 1. A configured self-managed base wins — it is the only way to tell a URL
  //    prefix apart from a top-level group.
  for (const base of opts.gitlabBases ?? []) {
    const rest = stripBase(normalized, base);
    if (rest) {
      return {
        provider: 'gitlab',
        apiBase: base.replace(/\/+$/, ''),
        ...cleanProjectPath(rest, url),
      };
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new AppError('invalid_repo_url', `Could not parse owner/repo from '${url}'`, 400);
  }

  // Everything downstream assumes a web origin: the REST base is
  // `${origin}/api/v4` and the clone URL carries credentials. `z.string().url()`
  // accepts file:, ftp: and friends, whose origin is the string 'null'.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AppError(
      'invalid_repo_url',
      `Only http(s) repository URLs are supported, got '${parsed.protocol}'`,
      400,
    );
  }

  // 2. Known public hosts.
  const host = parsed.host.toLowerCase();
  const hosted = (Object.entries(FORGE_PUBLIC_HOST) as [ForgeProvider, string][]).find(
    ([, h]) => host === h || host === `www.${h}`,
  );
  if (hosted) {
    // An explicit provider that contradicts the host is a mistake, not a
    // preference — honouring either side silently would send the wrong token.
    if (opts.provider && opts.provider !== hosted[0]) {
      throw new AppError(
        'provider_mismatch',
        `'${parsed.host}' is ${hosted[0]}, but the request asked for ${opts.provider}.`,
        400,
      );
    }
    return {
      provider: hosted[0],
      apiBase: null,
      ...cleanProjectPath(parsed.pathname, url),
    };
  }

  // 3. Unknown host. It is NOT enough for the caller to name a provider: doing
  //    so would let any request hand the forge PAT to a host of its choosing —
  //    the token travels as a PRIVATE-TOKEN header to `${origin}/api/v4`, and
  //    `withForgeToken` embeds it in the clone URL for any https host. A
  //    self-managed instance has to be allowlisted by the operator first.
  throw new AppError(
    'unknown_forge_host',
    `'${parsed.host}' is not a known forge instance. Add it to GITLAB_HOST to use it.`,
    400,
  );
}

/**
 * Embed a token into an https clone URL so private clones authenticate
 * non-interactively. Matches on the URL's OWN host rather than a constant, so
 * a self-managed instance authenticates too. Non-https URLs are left untouched.
 */
export function withForgeToken(url: string, token: string, provider: ForgeProvider): string {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return url;
    u.username = GIT_TOKEN_USERNAME[provider];
    u.password = token;
    return u.toString();
  } catch {
    /* non-URL (e.g. git@host:group/project.git) — leave as-is */
  }
  return url;
}

/** The https clone URL for a persisted repo row. */
export function cloneUrlFor(row: {
  provider: string;
  apiBase: string | null;
  fullName: string;
}): string {
  const provider = row.provider as ForgeProvider;
  const base = row.apiBase ?? `https://${FORGE_PUBLIC_HOST[provider] ?? FORGE_PUBLIC_HOST.github}`;
  return `${base.replace(/\/+$/, '')}/${row.fullName}.git`;
}

/**
 * Adapter-facing ref for a persisted repo. Built here, in one place, so no call
 * site can forget `provider`/`apiBase` and silently talk to the wrong forge.
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

/** Map a persisted repo row to the API `Repo` DTO. */
export function toRepoDto(row: typeof t.repos.$inferSelect): Repo {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    // Cast, not an exhaustive switch: `text(..., { enum })` has no SQL
    // constraint, so the column can hold a value TypeScript forbids.
    provider: row.provider as ForgeProvider,
    api_base: row.apiBase,
    owner: row.owner,
    name: row.name,
    full_name: row.fullName,
    default_branch: row.defaultBranch,
    clone_path: row.clonePath,
    last_polled_at: row.lastPolledAt?.toISOString() ?? null,
    created_by: row.createdBy,
  };
}
