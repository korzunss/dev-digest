/**
 * F1 — repos module constants (extracted from routes.ts; no behaviour change).
 */
import type { ForgeProvider } from '@devdigest/shared';

/** JobRunner kind for the asynchronous `git clone` job. */
export const CLONE_JOB_KIND = 'clone';

/** Clone depth — shallow clone (latest commit only) keeps imports fast. */
export const CLONE_DEPTH = 1;

/** Public host per forge, used to rebuild a clone URL for a hosted repo. */
export const FORGE_PUBLIC_HOST: Record<ForgeProvider, string> = {
  github: 'github.com',
  gitlab: 'gitlab.com',
};

/**
 * Username embedded into an authenticated https clone URL. GitHub wants
 * `x-access-token`; GitLab only accepts `oauth2` (or `gitlab-ci-token`) — using
 * GitHub's here fails authentication on GitLab with a misleading 403.
 */
export const GIT_TOKEN_USERNAME: Record<ForgeProvider, string> = {
  github: 'x-access-token',
  gitlab: 'oauth2',
};

/** Path segments we refuse outright — they escape the clone directory. */
export const FORBIDDEN_PATH_SEGMENTS = new Set(['.', '..', '']);
