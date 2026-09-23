import { describe, it, expect } from 'vitest';
import {
  parseRepoUrl,
  withForgeToken,
  cloneUrlFor,
  toRepoRef,
} from '../src/modules/repos/helpers.js';
import { parseForgeBases } from '../src/platform/config.js';
import {
  forgeTokenKeys,
  forgeCacheKey,
  gitlabApiRoot,
} from '../src/platform/forge-resolve.js';
import { resolveTestApiBase } from '../src/modules/settings/constants.js';

describe('parseRepoUrl — public hosts', () => {
  it('parses github https and ssh forms identically', () => {
    for (const url of [
      'https://github.com/acme/payments-api',
      'https://github.com/acme/payments-api.git',
      'git@github.com:acme/payments-api.git',
    ]) {
      expect(parseRepoUrl(url)).toEqual({
        provider: 'github',
        apiBase: null,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
      });
    }
  });

  it('parses gitlab.com and leaves apiBase null for the hosted instance', () => {
    expect(parseRepoUrl('https://gitlab.com/acme/payments-api')).toEqual({
      provider: 'gitlab',
      apiBase: null,
      owner: 'acme',
      name: 'payments-api',
      fullName: 'acme/payments-api',
    });
  });

  it('keeps a nested GitLab group in `owner`', () => {
    // owner carries the '/' — clonePathFor joins it into nested directories,
    // which is what makes `<cloneDir>/acme/backend/payments-api` work.
    expect(parseRepoUrl('https://gitlab.com/acme/backend/payments-api')).toMatchObject({
      provider: 'gitlab',
      owner: 'acme/backend',
      name: 'payments-api',
      fullName: 'acme/backend/payments-api',
    });
  });
});

describe('parseRepoUrl — self-managed', () => {
  const bases = parseForgeBases('git.acme.com, https://acme.com/gitlab');

  it('normalises a bare host into an https base', () => {
    expect(bases).toEqual(['https://git.acme.com', 'https://acme.com/gitlab']);
  });

  it('resolves a self-managed host from the configured list', () => {
    expect(parseRepoUrl('https://git.acme.com/team/api', { gitlabBases: bases })).toEqual({
      provider: 'gitlab',
      apiBase: 'https://git.acme.com',
      owner: 'team',
      name: 'api',
      fullName: 'team/api',
    });
  });

  it('strips a relative-URL install prefix instead of reading it as a group', () => {
    // Without the configured base this is indistinguishable from a top-level
    // group literally named "gitlab" — the prefix match is what decides.
    expect(parseRepoUrl('https://acme.com/gitlab/team/api', { gitlabBases: bases })).toEqual({
      provider: 'gitlab',
      apiBase: 'https://acme.com/gitlab',
      owner: 'team',
      name: 'api',
      fullName: 'team/api',
    });
  });

  it('handles an ssh URL on a non-default port', () => {
    expect(
      parseRepoUrl('ssh://git@git.acme.com:2222/team/api.git', { gitlabBases: bases }),
    ).toMatchObject({ provider: 'gitlab', owner: 'team', name: 'api' });
  });

  it('rejects an unknown host even when the caller names a provider', () => {
    // `provider` disambiguates among hosts we already trust; it must not be
    // able to authorise a new one. An unlisted instance that got through would
    // receive the forge PAT as a PRIVATE-TOKEN header AND embedded in the
    // clone URL by withForgeToken.
    expect(() => parseRepoUrl('https://git.other.com/team/api')).toThrow(/not a known forge/);
    expect(() =>
      parseRepoUrl('https://git.other.com/team/api', { provider: 'gitlab' }),
    ).toThrow(/not a known forge/);
    // Allowlisting it is the operator's call, and then it works.
    expect(
      parseRepoUrl('https://git.other.com/team/api', {
        gitlabBases: ['https://git.other.com'],
      }),
    ).toMatchObject({ provider: 'gitlab', apiBase: 'https://git.other.com' });
  });

  it('rejects a provider that contradicts a known host', () => {
    // Silently honouring either side would send the wrong forge's token.
    expect(() =>
      parseRepoUrl('https://gitlab.com/a/b', { provider: 'github' }),
    ).toThrow(/is gitlab, but the request asked for github/);
    expect(() =>
      parseRepoUrl('https://github.com/a/b', { provider: 'gitlab' }),
    ).toThrow(/is github, but the request asked for gitlab/);
    // Agreeing with the host is fine.
    expect(parseRepoUrl('https://gitlab.com/a/b', { provider: 'gitlab' })).toMatchObject({
      provider: 'gitlab',
    });
  });

  it('rejects a non-web scheme', () => {
    // z.string().url() accepts file:/ftp:, whose origin is the string 'null'.
    for (const u of ['file:///etc/passwd', 'ftp://host/a/b']) {
      expect(() => parseRepoUrl(u, { provider: 'gitlab' })).toThrow(/http\(s\)/);
    }
  });
});

describe('parseRepoUrl — traversal guard', () => {
  it('rejects ".." on the configured-base branch, which bypasses URL parsing', () => {
    // This is the ONLY branch where a ".." can reach clonePathFor: stripBase
    // works on the raw string, before `new URL` ever sees it.
    const bases = ['https://acme.com/gitlab'];
    expect(() =>
      parseRepoUrl('https://acme.com/gitlab/../../evil/x', { gitlabBases: bases }),
    ).toThrow(/Could not parse/);
  });

  it('documents that WHATWG URL collapses ".." before the guard can see it', () => {
    // Verified, not assumed: `new URL('https://gitlab.com/acme/../../etc/passwd')`
    // has pathname '/etc/passwd'. So the guard never fires here — the input
    // silently resolves to a DIFFERENT but well-formed project rather than
    // escaping anywhere. Asserted so a future parser rewrite that stops
    // normalising (e.g. dropping `new URL`) fails this test loudly.
    expect(parseRepoUrl('https://gitlab.com/acme/../../etc/passwd')).toMatchObject({
      owner: 'etc',
      name: 'passwd',
    });
    // Collapsing can also shorten the path below two segments, which does throw.
    expect(() => parseRepoUrl('https://gitlab.com/../evil')).toThrow(/Could not parse/);
  });

  it('rejects a single-segment path', () => {
    expect(() => parseRepoUrl('https://github.com/acme')).toThrow(/Could not parse/);
  });
});

describe('withForgeToken', () => {
  it('uses the username each forge actually accepts', () => {
    expect(withForgeToken('https://github.com/a/b.git', 'tok', 'github')).toContain(
      'x-access-token:tok@github.com',
    );
    // GitLab rejects x-access-token with a misleading 403.
    expect(withForgeToken('https://gitlab.com/a/b.git', 'tok', 'gitlab')).toContain(
      'oauth2:tok@gitlab.com',
    );
  });

  it('authenticates a self-managed host too (matches the URL, not a constant)', () => {
    expect(withForgeToken('https://git.acme.com/a/b.git', 'tok', 'gitlab')).toContain(
      'oauth2:tok@git.acme.com',
    );
  });

  it('leaves a non-https URL untouched', () => {
    const ssh = 'git@gitlab.com:a/b.git';
    expect(withForgeToken(ssh, 'tok', 'gitlab')).toBe(ssh);
  });
});

describe('cloneUrlFor', () => {
  it('rebuilds from the repo row, never a hardcoded host', () => {
    expect(cloneUrlFor({ provider: 'gitlab', apiBase: null, fullName: 'a/b' })).toBe(
      'https://gitlab.com/a/b.git',
    );
    expect(
      cloneUrlFor({ provider: 'gitlab', apiBase: 'https://acme.com/gitlab', fullName: 'a/b' }),
    ).toBe('https://acme.com/gitlab/a/b.git');
    expect(cloneUrlFor({ provider: 'github', apiBase: null, fullName: 'a/b' })).toBe(
      'https://github.com/a/b.git',
    );
  });
});

describe('toRepoRef', () => {
  it('carries provider, apiBase and the full path', () => {
    expect(
      toRepoRef({
        owner: 'acme/backend',
        name: 'api',
        fullName: 'acme/backend/api',
        provider: 'gitlab',
        apiBase: 'https://git.acme.com',
      }),
    ).toEqual({
      owner: 'acme/backend',
      name: 'api',
      path: 'acme/backend/api',
      provider: 'gitlab',
      apiBase: 'https://git.acme.com',
    });
  });
});

describe('forge-resolve', () => {
  it('prefers an instance-scoped secret over the canonical one', () => {
    expect(forgeTokenKeys('gitlab', 'https://git.acme.com')).toEqual([
      'GITLAB_TOKEN@git.acme.com',
      'GITLAB_TOKEN',
    ]);
    expect(forgeTokenKeys('gitlab', null)).toEqual(['GITLAB_TOKEN']);
    expect(forgeTokenKeys('github', null)).toEqual(['GITHUB_TOKEN']);
  });

  it('keys the client cache per instance, not just per provider', () => {
    expect(forgeCacheKey('gitlab', 'https://a.com')).not.toBe(
      forgeCacheKey('gitlab', 'https://b.com'),
    );
    expect(forgeCacheKey('gitlab', null)).toBe('gitlab:https://gitlab.com');
  });

  it('keeps a relative-URL prefix in the REST root', () => {
    expect(gitlabApiRoot('https://acme.com/gitlab')).toBe('https://acme.com/gitlab/api/v4');
    expect(gitlabApiRoot('https://git.acme.com/')).toBe('https://git.acme.com/api/v4');
    expect(gitlabApiRoot(null)).toBe('https://gitlab.com/api/v4');
  });
});

describe('resolveTestApiBase', () => {
  const bases = ['https://gitlab.sharksw.com', 'https://git.other.com'];

  it('uses the configured instance, not gitlab.com', () => {
    // Regression: test-connection has no repo context, so without this a
    // self-managed PAT was checked against gitlab.com and came back 401 —
    // the token was fine, the host was wrong.
    expect(resolveTestApiBase('gitlab', undefined, bases)).toBe(
      'https://gitlab.sharksw.com',
    );
  });

  it('prefers an explicit api_base from the request', () => {
    expect(resolveTestApiBase('gitlab', 'https://git.other.com/', bases)).toBe(
      'https://git.other.com',
    );
  });

  it('falls back to the public host when nothing is configured', () => {
    expect(resolveTestApiBase('gitlab', undefined, [])).toBeNull();
  });

  it('never redirects a GitHub test at a GitLab base', () => {
    expect(resolveTestApiBase('github', undefined, bases)).toBeNull();
  });
});
