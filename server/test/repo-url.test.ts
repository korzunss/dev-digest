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
  forgeHostOf,
  toRepoRef as toRepoRefFromPlatform,
} from '../src/platform/forge-resolve.js';
import { resolveTestApiBase } from '../src/modules/settings/constants.js';
import { AppError } from '../src/platform/errors.js';

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

  it('treats a www. host as the same instance, not a different one', () => {
    // The point is not that the URL parses — it is that it parses IDENTICALLY.
    // apiBase stays null, so findByFullName dedupes a www. paste against the
    // bare-host row instead of adding a second copy of the same repo.
    const github = parseRepoUrl('https://github.com/acme/payments-api');
    expect(parseRepoUrl('https://www.github.com/acme/payments-api')).toEqual(github);

    const gitlab = parseRepoUrl('https://gitlab.com/acme/payments-api');
    expect(parseRepoUrl('https://www.gitlab.com/acme/payments-api')).toEqual(gitlab);

    // Case folding here is WHATWG's, not ours: new URL lowercases the host
    // before `.toLowerCase()` ever sees it, so this passes even without that
    // call. Asserted anyway, so a rewrite that drops `new URL` for a regex
    // fails loudly instead of quietly accepting only the lowercase spelling.
    expect(parseRepoUrl('https://WWW.GitHub.COM/acme/payments-api')).toEqual(github);
  });

  it('does not let www. widen the allowlist into a suffix match', () => {
    // The obvious way to write the www. branch is `host.endsWith(h)`, which is
    // the same class of hole as the provider hint: 'evilgithub.com' ends with
    // 'github.com', so an attacker-registered host would be parsed as GitHub
    // and handed the PAT. Only the bare host and its www. form are the host.
    for (const host of ['evilgithub.com', 'notgitlab.com', 'github.com.evil.net']) {
      expect(() => parseRepoUrl(`https://${host}/a/b`, { provider: 'github' })).toThrow(
        /not a known forge instance/,
      );
    }

    // www. is a spelling of a known instance, not a way past the provider check.
    expect(() =>
      parseRepoUrl('https://www.gitlab.com/acme/payments-api', { provider: 'github' }),
    ).toThrow(/gitlab/);
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

  it('accepts http, which then silently declines to authenticate', () => {
    // http is deliberately allowed alongside https: a self-managed instance on
    // a LAN may not have TLS. Nothing downstream re-checks the scheme, so pin
    // where that lands. parseRepoUrl treats the URL as ordinary...
    const parsed = parseRepoUrl('http://gitlab.com/acme/api', {});
    expect(parsed).toMatchObject({ provider: 'gitlab', apiBase: null, fullName: 'acme/api' });

    // ...but withForgeToken refuses to put a PAT on a cleartext URL, so the
    // clone goes out anonymous and a private project fails with a 404 that
    // names neither the scheme nor the missing credential.
    expect(withForgeToken('http://gitlab.com/acme/api.git', 'tok', 'gitlab')).toBe(
      'http://gitlab.com/acme/api.git',
    );
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

  it('rejects input `new URL` cannot parse at all, as a 400 and not a crash', () => {
    // A distinct branch from the single-segment case below: that one parses
    // fine and fails on the path, this one never becomes a URL. Both share a
    // code and a message, which is why the status is what is worth asserting —
    // these reach the route as an AppError, and anything that is not one comes
    // back to the UI as a 500 with a stack instead of a message a user can act on.
    for (const input of ['', '   ', 'not-a-url', 'github.com/acme/api', 'git@host:']) {
      expect(() => parseRepoUrl(input)).toThrow(AppError);
      expect(() => parseRepoUrl(input)).toThrow(/Could not parse/);
      try {
        parseRepoUrl(input);
      } catch (err) {
        expect(err).toMatchObject({ code: 'invalid_repo_url', statusCode: 400 });
      }
    }

    // `github.com/acme/api` with no scheme is the realistic one — it is what a
    // browser address bar shows and what people paste. It is NOT silently
    // upgraded to https, and the message quotes what the user actually typed,
    // untrimmed, rather than the normalized string the parser worked on.
    expect(() => parseRepoUrl('  not-a-url  ')).toThrow("'  not-a-url  '");
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

  it('falls back to the canonical key when apiBase yields no host', () => {
    // Two different routes into the same fallback, and only the first is a
    // throw: a bare host has no scheme so new URL rejects it, while file:///x
    // parses fine and just has an empty host. Both must degrade to the
    // canonical key rather than producing a key with an empty or literal
    // undefined host, which would miss every secret and clone unauthenticated.
    expect(forgeTokenKeys('gitlab', 'not-a-url')).toEqual(['GITLAB_TOKEN']);
    expect(forgeTokenKeys('gitlab', 'git.acme.com')).toEqual(['GITLAB_TOKEN']);
    expect(forgeTokenKeys('gitlab', 'file:///x')).toEqual(['GITLAB_TOKEN']);
    expect(forgeTokenKeys('github', '')).toEqual(['GITHUB_TOKEN']);
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

  it('S15a: forgeHostOf reads the host of a well-formed apiBase', () => {
    expect(forgeHostOf('gitlab', 'https://git.acme.com/gitlab')).toBe('git.acme.com');
  });

  it('S15a: forgeHostOf falls back to the provider\'s public host on a malformed apiBase', () => {
    expect(forgeHostOf('gitlab', 'not-a-url')).toBe('gitlab.com');
    expect(forgeHostOf('github', 'not-a-url')).toBe('github.com');
  });

  it('S15a: forgeHostOf falls back to the public host when apiBase is null', () => {
    expect(forgeHostOf('gitlab', null)).toBe('gitlab.com');
    expect(forgeHostOf('github', null)).toBe('github.com');
  });
});

describe('D9-A: repos/helpers.ts re-exports the SAME toRepoRef, not a copy', () => {
  it('the shim import is the identical function object as platform/forge-resolve.ts', () => {
    // Two different importers must never end up with two different
    // `toRepoRef`s — F1 moved the function so the container-friendly
    // `IntentService` (which imports the platform copy) and the pre-existing
    // callers (`repos/helpers.ts` and its re-export consumers) can never
    // silently diverge in behaviour.
    expect(toRepoRef).toBe(toRepoRefFromPlatform);
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

  it('refuses an api_base the operator never configured', () => {
    // The request body is the attacker-controlled input here, not GITLAB_HOST.
    // container.forge({provider, apiBase}) sends the stored PAT to
    // `${apiBase}/api/v4/user` as a PRIVATE-TOKEN header, and the canonical-key
    // fallback means an unknown host still resolves a token rather than none.
    // There is no auth in front of this route (LocalNoAuthProvider).
    expect(() => resolveTestApiBase('gitlab', 'https://evil.example.net', bases)).toThrow(
      /not a known forge instance/,
    );
    // A path prefix on a legitimate host is still a different base.
    expect(() => resolveTestApiBase('gitlab', 'https://git.other.com/evil', bases)).toThrow(
      /not a known forge instance/,
    );
    // The public host stays reachable with nothing configured.
    expect(resolveTestApiBase('gitlab', 'https://gitlab.com', [])).toBe('https://gitlab.com');
  });

  it('ignores an api_base for a provider with no self-managed support', () => {
    // GitHub Enterprise is not a thing here — there is no GITHUB_HOST — so an
    // api_base on a github test can only ever be a redirect of its PAT.
    expect(resolveTestApiBase('github', 'https://evil.example.net', bases)).toBeNull();
  });

  it('never redirects a GitHub test at a GitLab base', () => {
    expect(resolveTestApiBase('github', undefined, bases)).toBeNull();
  });
});
