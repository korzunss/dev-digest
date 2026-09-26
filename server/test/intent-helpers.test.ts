import { describe, it, expect } from 'vitest';
import {
  capConfidence,
  descriptionHash,
  extractIntentLinks,
  headersFromPatch,
  redactRef,
  staleness,
  type IntentLinkForge,
} from '../src/modules/intent/helpers.js';

/**
 * Pure helpers behind the intent classifier (spec 006 S9). No I/O — every
 * case here is a plain input → output assertion.
 */

const GITHUB: IntentLinkForge = { host: 'github.com', owner: 'acme', name: 'api', provider: 'github' };
const GITLAB_NESTED: IntentLinkForge = {
  host: 'git.acme.com',
  owner: 'group/subgroup',
  name: 'project',
  provider: 'gitlab',
};

describe('extractIntentLinks — issue references', () => {
  it('recognizes a bare #N and a closing-keyword #N the same way', () => {
    const bare = extractIntentLinks('See #42 for context.', GITHUB);
    expect(bare.issues).toEqual([{ owner: 'acme', name: 'api', number: 42, ref: '#42' }]);

    const closed = extractIntentLinks('Closes #42.', GITHUB);
    expect(closed.issues[0]).toMatchObject({ owner: 'acme', name: 'api', number: 42 });
  });

  it('recognizes GitLab-only closing keywords ("implements")', () => {
    const found = extractIntentLinks('Implements #7.', GITHUB);
    expect(found.issues[0]).toMatchObject({ number: 7 });
  });

  it('D7: owner/repo#N on the SAME host is a cross-repo issue, distinct from the current repo', () => {
    const found = extractIntentLinks('Depends on other/service#3', GITHUB);
    expect(found.issues).toEqual([{ owner: 'other', name: 'service', number: 3, ref: 'other/service#3' }]);
  });

  it('a same-host issue URL is recognized', () => {
    const found = extractIntentLinks('https://github.com/acme/api/issues/9', GITHUB);
    expect(found.issues[0]).toMatchObject({ owner: 'acme', name: 'api', number: 9 });
  });

  it('an issue-shaped URL on a DIFFERENT host is external, never an issue (host allowlist first)', () => {
    const found = extractIntentLinks('https://evil.com/acme/api/issues/1', GITHUB);
    expect(found.issues).toEqual([]);
    expect(found.external).toHaveLength(1);
    expect(found.external[0]!.ref).toContain('evil.com');
  });

  it('a non-http(s) scheme (file:) is never extracted as anything', () => {
    const found = extractIntentLinks('See file:///etc/passwd for the secret.', GITHUB);
    expect(found.issues).toEqual([]);
    expect(found.docs).toEqual([]);
    expect(found.external).toEqual([]);
  });
});

describe('extractIntentLinks — linked docs (V1, V4, V7)', () => {
  it('a bare repo-root doc path is recognized', () => {
    const found = extractIntentLinks('See docs/plan.md for the design.', GITHUB);
    expect(found.docs).toEqual([{ path: 'docs/plan.md', ref: 'docs/plan.md' }]);
  });

  it('V4: a doc path that only appears as the SUFFIX of a nested path is not matched', () => {
    const found = extractIntentLinks('See server/docs/plan.md for the design.', GITHUB);
    expect(found.docs).toEqual([]);
  });

  it('a same-repo blob URL is a doc', () => {
    const found = extractIntentLinks('https://github.com/acme/api/blob/main/docs/plan.md', GITHUB);
    expect(found.docs).toEqual([{ path: 'docs/plan.md', ref: 'https://github.com/acme/api/blob/main/docs/plan.md' }]);
  });

  it('V1: a same-host blob URL of ANOTHER repo is external, never read as this repo\'s doc', () => {
    const found = extractIntentLinks('https://github.com/other/service/blob/main/docs/plan.md', GITHUB);
    expect(found.docs).toEqual([]);
    expect(found.external).toHaveLength(1);
  });

  it('V7: a GitLab nested-group blob URL matches the FULL group path, not just its first segment', () => {
    const found = extractIntentLinks(
      'https://git.acme.com/group/subgroup/project/-/blob/main/docs/plan.md',
      GITLAB_NESTED,
    );
    expect(found.docs).toEqual([
      {
        path: 'docs/plan.md',
        ref: 'https://git.acme.com/group/subgroup/project/-/blob/main/docs/plan.md',
      },
    ]);
  });

  it('V10: a mixed-case owner/repo in a same-host blob URL is still THIS repo\'s doc, not external', () => {
    // GitHub/GitLab route owner/repo paths case-insensitively — the URL casing
    // pasted by an author must not turn this repo's own doc into "external".
    const found = extractIntentLinks('https://github.com/Acme/Repo/blob/main/docs/plan.md', {
      host: 'github.com',
      owner: 'acme',
      name: 'repo',
      provider: 'github',
    });
    expect(found.docs).toEqual([
      { path: 'docs/plan.md', ref: 'https://github.com/Acme/Repo/blob/main/docs/plan.md' },
    ]);
    expect(found.external).toEqual([]);
  });

  it('V10: a DIFFERENT owner, in any casing, is still external — case-insensitivity does not widen the match', () => {
    for (const ownerRepo of ['Other/Repo', 'OTHER/REPO', 'other/repo']) {
      const found = extractIntentLinks(`https://github.com/${ownerRepo}/blob/main/docs/plan.md`, {
        host: 'github.com',
        owner: 'acme',
        name: 'repo',
        provider: 'github',
      });
      expect(found.docs).toEqual([]);
      expect(found.external).toHaveLength(1);
    }
  });

  it('V10: the HOST check is unaffected — a different host is external regardless of casing anywhere', () => {
    const found = extractIntentLinks('https://EVIL.com/Acme/Repo/blob/main/docs/plan.md', {
      host: 'github.com',
      owner: 'acme',
      name: 'repo',
      provider: 'github',
    });
    expect(found.docs).toEqual([]);
    expect(found.external).toHaveLength(1);
  });
});

describe('redactRef', () => {
  it('strips userinfo, query (incl. ?token=) and fragment from a URL', () => {
    expect(redactRef('https://user:pw@github.com/acme/api?token=SECRET#frag')).toBe(
      'https://github.com/acme/api',
    );
  });

  it('returns a non-URL (bare path) unchanged — nothing in it to redact', () => {
    expect(redactRef('docs/plan.md')).toBe('docs/plan.md');
  });
});

describe('headersFromPatch', () => {
  it('keeps only the numeric @@ header, dropping trailing context and every body line', () => {
    const patch = [
      '@@ -10,3 +10,4 @@ function foo() {',
      '   port: 3000,',
      '+  stripeKey: "sk_live_xxx",',
      '   redisUrl: x,',
    ].join('\n');
    expect(headersFromPatch(patch)).toEqual(['@@ -10,3 +10,4 @@']);
  });

  it('returns [] for an empty/absent patch', () => {
    expect(headersFromPatch(null)).toEqual([]);
    expect(headersFromPatch('')).toEqual([]);
  });
});

describe('capConfidence', () => {
  it('caps to low with no description and no ok linked source, regardless of the model\'s own value', () => {
    expect(capConfidence('high', { hasDescription: false, okLinked: 0, failedLinked: 0 })).toBe('low');
  });

  it('V6: any failed/unsupported linked source caps at medium', () => {
    expect(capConfidence('high', { hasDescription: true, okLinked: 1, failedLinked: 1 })).toBe('medium');
  });

  it('passes the model\'s own value through otherwise', () => {
    expect(capConfidence('high', { hasDescription: true, okLinked: 1, failedLinked: 0 })).toBe('high');
    expect(capConfidence('medium', { hasDescription: true, okLinked: 0, failedLinked: 0 })).toBe('medium');
  });
});

describe('descriptionHash', () => {
  it('is stable across CRLF vs LF and trailing whitespace, but changes with the title or body', () => {
    const lf = descriptionHash('Add rate limiting', 'Line one.\nLine two.\n');
    const crlf = descriptionHash('Add rate limiting', 'Line one.\r\nLine two.\r\n');
    expect(crlf).toBe(lf);

    const titleChanged = descriptionHash('Add rate limiting v2', 'Line one.\nLine two.\n');
    expect(titleChanged).not.toBe(lf);

    const bodyChanged = descriptionHash('Add rate limiting', 'Different body.');
    expect(bodyChanged).not.toBe(lf);
  });

  it('treats a null body the same as an empty string', () => {
    expect(descriptionHash('t', null)).toBe(descriptionHash('t', ''));
  });
});

describe('staleness', () => {
  const pull = { headSha: 'newsha', title: 'Add rate limiting', body: 'new body' };
  const freshHash = descriptionHash(pull.title, pull.body);

  it('is not stale when both head and description hash match', () => {
    expect(staleness({ headSha: 'newsha', descriptionHash: freshHash }, pull)).toEqual({
      stale: false,
      staleReason: null,
    });
  });

  it('reports head_moved when the head sha differs', () => {
    expect(staleness({ headSha: 'oldsha', descriptionHash: freshHash }, pull)).toEqual({
      stale: true,
      staleReason: 'head_moved',
    });
  });

  it('reports description_changed when only the description hash differs', () => {
    expect(staleness({ headSha: 'newsha', descriptionHash: 'stale-hash' }, pull)).toEqual({
      stale: true,
      staleReason: 'description_changed',
    });
  });

  it('head_moved wins when BOTH head and description changed', () => {
    expect(staleness({ headSha: 'oldsha', descriptionHash: 'stale-hash' }, pull)).toEqual({
      stale: true,
      staleReason: 'head_moved',
    });
  });

  it('a NULL stored description_hash (pre-migration row) is treated as description_changed', () => {
    expect(staleness({ headSha: 'newsha', descriptionHash: null }, pull)).toEqual({
      stale: true,
      staleReason: 'description_changed',
    });
  });
});
