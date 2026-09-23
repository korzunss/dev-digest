import { describe, it, expect, vi, afterEach } from 'vitest';
import { GitLabRestClient, GitLabHttpError, redactUrl } from '../src/adapters/gitlab/rest.js';
import {
  mapMrState,
  countDiffLines,
  mapDiffsToFiles,
  sumFileStats,
  mapDiscussions,
  buildPosition,
  supportsDiffsEndpoint,
  parseVersion,
} from '../src/adapters/gitlab/mappers.js';

const REPO = { owner: 'acme', name: 'api', path: 'acme/api', provider: 'gitlab' as const };

/** Minimal fetch stub: route by (method, pathname) and record every call. */
function stubFetch(routes: Record<string, unknown>) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  const impl = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      url: url.pathname + url.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const key = `${method} ${url.pathname}`;
    if (!(key in routes)) {
      return new Response('not found', { status: 404, statusText: 'Not Found' });
    }
    const payload = routes[key];
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', impl);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('mappers — MR state and diff stats', () => {
  it('treats GitLab state as authoritative (no merged_at to consult)', () => {
    expect(mapMrState('merged')).toBe('merged');
    expect(mapMrState('closed')).toBe('closed');
    expect(mapMrState('opened')).toBe('open');
    // `locked` is an open MR with discussion frozen.
    expect(mapMrState('locked')).toBe('open');
  });

  it('counts +/- lines and ignores the +++/--- file headers', () => {
    const diff = '--- a/x.ts\n+++ b/x.ts\n@@ -1,2 +1,3 @@\n ctx\n+added\n+added2\n-removed\n';
    expect(countDiffLines(diff)).toEqual({ additions: 2, deletions: 1 });
    expect(countDiffLines(null)).toEqual({ additions: 0, deletions: 0 });
  });

  it('derives file stats from diffs, never from the capped changes_count string', () => {
    const files = mapDiffsToFiles([
      { old_path: 'a.ts', new_path: 'a.ts', diff: '+one\n+two\n-three\n' },
      { old_path: 'b.ts', new_path: 'b.ts', diff: '+only\n' },
    ]);
    expect(sumFileStats(files)).toEqual({ additions: 3, deletions: 1, files_count: 2 });
  });

  it('falls back to old_path for a deleted file', () => {
    const [file] = mapDiffsToFiles([
      { old_path: 'gone.ts', new_path: '', diff: '-x\n', deleted_file: true },
    ]);
    expect(file!.path).toBe('gone.ts');
  });
});

describe('mappers — version gate on the diff endpoint', () => {
  it('parses major.minor', () => {
    expect(parseVersion('14.5.2')).toEqual({ major: 14, minor: 5 });
    expect(parseVersion('17.11.0-ee')).toEqual({ major: 17, minor: 11 });
    expect(parseVersion('nonsense')).toBeNull();
  });

  it('gates /diffs at 15.7 and assumes the OLD endpoint when unknown', () => {
    expect(supportsDiffsEndpoint('14.5.2')).toBe(false);
    expect(supportsDiffsEndpoint('15.6.9')).toBe(false);
    expect(supportsDiffsEndpoint('15.7.0')).toBe(true);
    expect(supportsDiffsEndpoint('17.4.1')).toBe(true);
    // Guessing old is recoverable (/changes is deprecated, not removed);
    // guessing new 404s on <15.7.
    expect(supportsDiffsEndpoint(null)).toBe(false);
  });
});

describe('mappers — discussions', () => {
  const discussions = [
    {
      id: 'abc123',
      notes: [
        {
          id: 1,
          body: 'root',
          type: 'DiffNote',
          author: { username: 'alice' },
          created_at: '2026-06-01T00:00:00Z',
          position: { new_path: 'src/a.ts', new_line: 12, head_sha: 'HEAD1' },
        },
        {
          id: 2,
          body: 'reply',
          type: 'DiffNote',
          author: { username: 'bob' },
          created_at: '2026-06-01T01:00:00Z',
          position: { new_path: 'src/a.ts', new_line: 12, head_sha: 'HEAD1' },
        },
      ],
    },
    {
      id: 'old999',
      notes: [
        {
          id: 3,
          body: 'stale',
          type: 'DiffNote',
          author: { username: 'carol' },
          created_at: '2026-05-01T00:00:00Z',
          position: { new_path: 'src/a.ts', new_line: 4, head_sha: 'HEADOLD' },
        },
      ],
    },
    {
      id: 'sys',
      notes: [{ id: 4, body: 'changed title', system: true, created_at: 'x' }],
    },
  ];

  const mapped = mapDiscussions(discussions, {
    webBase: 'https://acme.com/gitlab',
    projectPath: 'acme/api',
    iid: 7,
    currentHeadSha: 'HEAD1',
  });

  it('drops system notes and keeps DiffNotes', () => {
    expect(mapped.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it('exposes the discussion id as thread_id — the only handle a reply accepts', () => {
    expect(mapped[0]!.thread_id).toBe('abc123');
    expect(mapped[1]!.thread_id).toBe('abc123');
  });

  it('points a reply at the thread root, not at itself', () => {
    expect(mapped[0]!.in_reply_to_id).toBeNull();
    expect(mapped[1]!.in_reply_to_id).toBe(1);
  });

  it('marks a note outdated when its position head differs from the MR head', () => {
    // GitLab keeps the position of the version a note was written against, so
    // "outdated" is a sha comparison — not a missing field as on GitHub.
    expect(mapped[2]!.is_outdated).toBe(true);
    expect(mapped[2]!.line).toBeNull();
    expect(mapped[2]!.original_line).toBe(4);
    expect(mapped[0]!.is_outdated).toBe(false);
  });

  it('builds a note URL that keeps a relative-URL install prefix', () => {
    expect(mapped[0]!.html_url).toBe(
      'https://acme.com/gitlab/acme/api/-/merge_requests/7#note_1',
    );
  });
});

describe('mappers — position', () => {
  const refs = { base_sha: 'B', start_sha: 'S', head_sha: 'H' };

  it('carries all three shas, not just head', () => {
    expect(buildPosition(refs, { path: 'src/a.ts', line: 9 })).toEqual({
      base_sha: 'B',
      start_sha: 'S',
      head_sha: 'H',
      position_type: 'text',
      old_path: 'src/a.ts',
      new_path: 'src/a.ts',
      new_line: 9,
    });
  });

  it('uses old_line for a LEFT-side comment', () => {
    expect(buildPosition(refs, { path: 'a.ts', line: 3, side: 'LEFT' })).toMatchObject({
      old_line: 3,
    });
  });
});

describe('GitLabRestClient — transport', () => {
  it('throws an error carrying `status` so withRetry can classify it', async () => {
    // fetch resolves on 4xx/5xx; resilience.defaultIsRetryable reads err.status.
    // Without this, every call would be wrapped in withRetry and never retry.
    stubFetch({});
    const client = new GitLabRestClient('tok');
    await expect(client.currentLogin()).rejects.toMatchObject({ status: 404 });
    await expect(client.currentLogin()).rejects.toBeInstanceOf(GitLabHttpError);
  });

  it('keeps credentials out of the error message', async () => {
    // The message is not internal: test-connection returns err.message to the
    // HTTP client. apiRoot is operator-supplied and parseForgeBases passes
    // userinfo through, so a GITLAB_HOST carrying a PAT would print it back.
    stubFetch({});
    const client = new GitLabRestClient('tok', 'https://oauth2:glpat-SECRET@git.acme.com');
    await expect(client.currentLogin()).rejects.toThrow(/git\.acme\.com/);
    await expect(client.currentLogin()).rejects.not.toThrow(/glpat-SECRET|oauth2/);
  });

  it('redacts only the userinfo, leaving the URL diagnosable', () => {
    // A 401 here is usually a token checked against the wrong instance, so the
    // host and path have to survive — redacting the whole URL would remove the
    // one thing the message exists to show.
    expect(redactUrl(new URL('https://oauth2:glpat-SECRET@git.acme.com/api/v4/user'))).toBe(
      'https://git.acme.com/api/v4/user',
    );
    expect(redactUrl(new URL('https://git.acme.com/api/v4/user?page=2'))).toBe(
      'https://git.acme.com/api/v4/user?page=2',
    );
  });

  it('retries a 429 and succeeds', async () => {
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        n++;
        return n === 1
          ? new Response('slow down', { status: 429, statusText: 'Too Many Requests' })
          : new Response(JSON.stringify({ username: 'alice' }), { status: 200 });
      }),
    );
    await expect(new GitLabRestClient('tok').currentLogin()).resolves.toBe('alice');
    expect(n).toBe(2);
  });

  it('keeps a relative-URL prefix in every request path', async () => {
    const calls = stubFetch({ 'GET /gitlab/api/v4/user': { username: 'alice' } });
    await new GitLabRestClient('tok', 'https://acme.com/gitlab').currentLogin();
    expect(calls[0]!.url).toBe('/gitlab/api/v4/user');
  });

  it('maps the list payload into PrMeta, keyed by iid rather than id', async () => {
    const calls = stubFetch({
      'GET /api/v4/projects/acme%2Fapi/merge_requests': [
        {
          // `id` is the global MR id and `iid` the per-project one shown in the
          // URL. They differ in production and coincide in most hand-written
          // fixtures, which is how a mix-up survives review — so they differ here.
          id: 90210,
          iid: 7,
          title: 'Add rate limiting',
          state: 'opened',
          author: { username: 'alice' },
          source_branch: 'feat/rate-limit',
          target_branch: 'main',
          sha: 'HEAD1',
          created_at: '2026-09-01T10:00:00Z',
          updated_at: '2026-09-02T11:00:00Z',
        },
        {
          // No `sha` on the payload: the head falls back to diff_refs, and a
          // missing author must not read as a crash or an empty string.
          id: 90211,
          iid: 8,
          title: 'Bump deps',
          state: 'merged',
          author: null,
          source_branch: 'chore/deps',
          target_branch: 'main',
          diff_refs: { base_sha: 'B', start_sha: 'S', head_sha: 'HEAD2' },
        },
        // locked is a real GitLab state and is not a fourth status for us.
        { iid: 9, title: 'Old', state: 'locked', source_branch: 'x', target_branch: 'main' },
        { iid: 10, title: 'Rejected', state: 'closed', source_branch: 'y', target_branch: 'main' },
      ],
    });

    const pulls = await new GitLabRestClient('tok').listPullRequests(REPO);

    expect(pulls.map((p) => p.number)).toEqual([7, 8, 9, 10]);
    expect(pulls.map((p) => p.status)).toEqual(['open', 'merged', 'open', 'closed']);
    expect(pulls[0]).toEqual({
      number: 7,
      title: 'Add rate limiting',
      author: 'alice',
      branch: 'feat/rate-limit',
      base: 'main',
      head_sha: 'HEAD1',
      // Not on the list payload — the pulls route backfills them from detail,
      // so zeroes here are the contract, not a mapping miss.
      additions: 0,
      deletions: 0,
      files_count: 0,
      status: 'open',
      opened_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-02T11:00:00Z',
    });
    expect(pulls[1]).toMatchObject({ head_sha: 'HEAD2', author: 'unknown' });
    expect(pulls[2]).toMatchObject({ head_sha: '', opened_at: null, updated_at: null });

    // The query is what keeps merged/closed in the list at all, matching the
    // Octokit client's `state: 'all'` rather than GitLab's `opened` default.
    const listCall = calls.find((c) => c.url.includes('/merge_requests'))!;
    expect(listCall.url).toContain('state=all');
    expect(listCall.url).toContain('scope=all');
  });

  it('URL-encodes a nested group path into the project id', async () => {
    const calls = stubFetch({
      'GET /api/v4/version': { version: '17.0.0' },
      'GET /api/v4/projects/acme%2Fbackend%2Fapi/merge_requests': [],
    });
    await new GitLabRestClient('tok').listPullRequests({
      owner: 'acme/backend',
      name: 'api',
      path: 'acme/backend/api',
    });
    expect(calls.some((c) => c.url.startsWith('/api/v4/projects/acme%2Fbackend%2Fapi/'))).toBe(
      true,
    );
  });
});

describe('GitLabRestClient — version-gated diff retrieval', () => {
  const MR = {
    iid: 7,
    title: 'Add rate limiting',
    state: 'opened',
    author: { username: 'alice' },
    source_branch: 'feat/x',
    target_branch: 'main',
    sha: 'HEAD1',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-02T00:00:00Z',
    description: 'Closes #471',
    diff_refs: { base_sha: 'B', start_sha: 'S', head_sha: 'HEAD1' },
    changes_count: '1000+',
  };

  it('uses /changes on 14.5.2, where /diffs does not exist', async () => {
    const calls = stubFetch({
      'GET /api/v4/version': { version: '14.5.2' },
      'GET /api/v4/projects/acme%2Fapi/merge_requests/7': MR,
      'GET /api/v4/projects/acme%2Fapi/merge_requests/7/changes': {
        changes: [{ old_path: 'a.ts', new_path: 'a.ts', diff: '+x\n+y\n-z\n' }],
      },
      'GET /api/v4/projects/acme%2Fapi/merge_requests/7/commits': [
        { id: 'c1', message: 'm', author_name: 'alice', created_at: '2026-06-01T00:00:00Z' },
      ],
      'GET /api/v4/projects/acme%2Fapi/issues/471': {
        iid: 471,
        title: 'Rate limit',
        description: null,
        state: 'opened',
      },
    });

    const detail = await new GitLabRestClient('tok').getPullRequest(REPO, 7);

    expect(calls.some((c) => c.url.includes('/changes'))).toBe(true);
    expect(calls.some((c) => c.url.includes('/diffs'))).toBe(false);
    // changes_count was "1000+" — stats must come from the diffs, not from it.
    expect(detail.additions).toBe(2);
    expect(detail.deletions).toBe(1);
    expect(detail.files_count).toBe(1);
    expect(detail.number).toBe(7);
    expect(detail.linked_issue?.number).toBe(471);
  });

  it('uses /diffs on a modern instance AND walks every page', async () => {
    // Fetching only page 1 would silently review the first N files of a large
    // MR — a correctness bug that reads like a model failure.
    const pages: Record<string, unknown[]> = {
      '1': [{ old_path: 'a.ts', new_path: 'a.ts', diff: '+1\n' }],
      '2': [{ old_path: 'b.ts', new_path: 'b.ts', diff: '+2\n' }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string) => {
        const url = new URL(String(input));
        const json = (body: unknown, headers: Record<string, string> = {}) =>
          new Response(JSON.stringify(body), { status: 200, headers });
        if (url.pathname.endsWith('/version')) return json({ version: '17.4.1' });
        if (url.pathname.endsWith('/diffs')) {
          const page = url.searchParams.get('page') ?? '1';
          return json(pages[page] ?? [], page === '1' ? { 'x-next-page': '2' } : {});
        }
        if (url.pathname.endsWith('/commits')) return json([]);
        if (url.pathname.endsWith('/merge_requests/7')) return json(MR);
        return new Response('[]', { status: 200 });
      }),
    );

    const detail = await new GitLabRestClient('tok').getPullRequest(REPO, 7);
    expect(detail.files.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
    expect(detail.files_count).toBe(2);
  });
});

describe('GitLabRestClient — writes', () => {
  const MR_WITH_REFS = {
    iid: 7,
    title: 't',
    state: 'opened',
    source_branch: 'a',
    target_branch: 'main',
    sha: 'HEAD1',
    diff_refs: { base_sha: 'B', start_sha: 'S', head_sha: 'HEAD1' },
  };

  const diffNote = (id: number, body: string, line: number) => ({
    id,
    body,
    type: 'DiffNote',
    author: { username: 'alice' },
    created_at: '2026-06-01T00:00:00Z',
    position: { new_path: 'src/a.ts', new_line: line, head_sha: 'HEAD1' },
  });

  it('builds the new thread from the POST response, not from a re-read', async () => {
    const calls = stubFetch({
      'GET /api/v4/projects/acme%2Fapi/merge_requests/7': MR_WITH_REFS,
      'POST /api/v4/projects/acme%2Fapi/merge_requests/7/discussions': {
        id: 'd1',
        notes: [diffNote(10, 'looks wrong', 12)],
      },
    });

    const created = await new GitLabRestClient('tok').createReviewComment(REPO, 7, {
      commitId: 'HEAD1',
      path: 'src/a.ts',
      line: 12,
      body: 'looks wrong',
    });

    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toMatchObject({
      body: 'looks wrong',
      position: { base_sha: 'B', start_sha: 'S', head_sha: 'HEAD1', new_line: 12 },
    });
    expect(created).toMatchObject({
      id: 10,
      thread_id: 'd1',
      line: 12,
      // It is the thread root, so it replies to nothing.
      in_reply_to_id: null,
      is_outdated: false,
    });
    // The old implementation listed every comment back and matched on body.
    expect(calls.some((c) => c.method === 'GET' && c.url.endsWith('/discussions'))).toBe(false);
  });

  it('returns the right comment when an identical body exists on another line', async () => {
    // The exact case a re-read + body match got wrong: same text, same file,
    // different line. The POST response carries the id GitLab assigned.
    const calls = stubFetch({
      'GET /api/v4/projects/acme%2Fapi/merge_requests/7': MR_WITH_REFS,
      'POST /api/v4/projects/acme%2Fapi/merge_requests/7/discussions': {
        id: 'd-new',
        notes: [diffNote(99, 'unchecked cast', 40)],
      },
      // An older identical comment that a reverse body-match could have picked.
      'GET /api/v4/projects/acme%2Fapi/merge_requests/7/discussions': [
        { id: 'd-old', notes: [diffNote(11, 'unchecked cast', 12)] },
      ],
    });

    const created = await new GitLabRestClient('tok').createReviewComment(REPO, 7, {
      commitId: 'HEAD1',
      path: 'src/a.ts',
      line: 40,
      body: 'unchecked cast',
    });

    expect(created.id).toBe(99);
    expect(created.line).toBe(40);
    expect(created.thread_id).toBe('d-new');
    expect(calls.some((c) => c.url.includes('/discussions') && c.method === 'GET')).toBe(false);
  });

  it('replies by discussion id and reports the thread root, so the thread stays one', async () => {
    // The web client groups by `in_reply_to_id ?? id`; a reply that reported no
    // root would render as a second thread on the same line.
    const calls = stubFetch({
      'GET /api/v4/projects/acme%2Fapi/merge_requests/7/discussions/d1': {
        id: 'd1',
        notes: [diffNote(10, 'looks wrong', 12)],
      },
      'POST /api/v4/projects/acme%2Fapi/merge_requests/7/discussions/d1/notes': diffNote(
        11,
        'agreed',
        12,
      ),
    });

    const created = await new GitLabRestClient('tok').createReviewComment(REPO, 7, {
      commitId: 'HEAD1',
      path: 'src/a.ts',
      line: 12,
      body: 'agreed',
      inReplyTo: 'd1',
    });

    expect(calls.some((c) => c.method === 'POST' && c.url.includes('/discussions/d1/notes'))).toBe(
      true,
    );
    expect(created).toMatchObject({ id: 11, thread_id: 'd1', in_reply_to_id: 10 });
  });

  it('resolves a numeric reply target to its discussion', async () => {
    // GitHub addresses a reply by note id; that shape still has to work here.
    const calls = stubFetch({
      'GET /api/v4/projects/acme%2Fapi/merge_requests/7/discussions': [
        { id: 'd1', notes: [diffNote(10, 'looks wrong', 12)] },
      ],
      'POST /api/v4/projects/acme%2Fapi/merge_requests/7/discussions/d1/notes': diffNote(
        12,
        'agreed',
        12,
      ),
    });

    const created = await new GitLabRestClient('tok').createReviewComment(REPO, 7, {
      commitId: 'HEAD1',
      path: 'src/a.ts',
      line: 12,
      body: 'agreed',
      inReplyTo: 10,
    });

    expect(created.in_reply_to_id).toBe(10);
    expect(created.thread_id).toBe('d1');
    expect(calls.some((c) => c.url.includes('/discussions/d1/notes'))).toBe(true);
  });

  it('fails loudly when a reply targets a discussion that does not exist', async () => {
    stubFetch({ 'GET /api/v4/projects/acme%2Fapi/merge_requests/7/discussions': [] });
    await expect(
      new GitLabRestClient('tok').createReviewComment(REPO, 7, {
        commitId: 'HEAD1',
        path: 'src/a.ts',
        line: 12,
        body: 'agreed',
        inReplyTo: 404404,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('opens a merge request with GitLab field names, not GitHub ones', async () => {
    // head/base on our port are source_branch/target_branch here, and the PR
    // body is `description` — three renames, all silent if wrong.
    const calls = stubFetch({
      'POST /api/v4/projects/acme%2Fapi/merge_requests': {
        web_url: 'https://gitlab.com/acme/api/-/merge_requests/3',
      },
    });

    const res = await new GitLabRestClient('tok').openPullRequest(REPO, {
      title: 'Add CI',
      head: 'devdigest/ci',
      base: 'main',
      body: 'Generated.',
    });

    expect(calls[0]!.body).toEqual({
      source_branch: 'devdigest/ci',
      target_branch: 'main',
      title: 'Add CI',
      description: 'Generated.',
    });
    expect(res.url).toBe('https://gitlab.com/acme/api/-/merge_requests/3');
  });

  it('finds an open MR by source branch, and reports null when there is none', async () => {
    const calls = stubFetch({
      'GET /api/v4/projects/acme%2Fapi/merge_requests': [
        { web_url: 'https://gitlab.com/acme/api/-/merge_requests/3' },
      ],
    });
    const found = await new GitLabRestClient('tok').findOpenPr(REPO, 'devdigest/ci');
    expect(found).toEqual({ url: 'https://gitlab.com/acme/api/-/merge_requests/3' });
    expect(calls[0]!.url).toContain('state=opened');
    expect(calls[0]!.url).toContain('source_branch=devdigest%2Fci');

    stubFetch({ 'GET /api/v4/projects/acme%2Fapi/merge_requests': [] });
    await expect(new GitLabRestClient('tok').findOpenPr(REPO, 'nope')).resolves.toBeNull();
  });
});

describe('GitLabRestClient — commitFiles', () => {
  const PAYLOAD = {
    branch: 'devdigest/ci',
    base: 'main',
    message: 'Add CI config',
    files: [
      { path: '.gitlab-ci.yml', contents: 'stages: []' },
      { path: 'docs/new.md', contents: '# new' },
    ],
  };

  /** Routes with an explicit set of paths that already exist on the probe ref. */
  function stubRepo(opts: { branchExists: boolean; existing: string[] }) {
    const calls: { method: string; url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string, init?: RequestInit) => {
        const url = new URL(String(input));
        const method = init?.method ?? 'GET';
        calls.push({
          method,
          url: url.pathname + url.search,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        const miss = () => new Response('404 Not Found', { status: 404, statusText: 'Not Found' });
        if (url.pathname.includes('/repository/branches/')) {
          return opts.branchExists ? new Response('{}', { status: 200 }) : miss();
        }
        if (url.pathname.includes('/repository/files/')) {
          const path = decodeURIComponent(url.pathname.split('/repository/files/')[1]!);
          return opts.existing.includes(path) ? new Response('{}', { status: 200 }) : miss();
        }
        return new Response('{}', { status: 200 });
      }),
    );
    return calls;
  }

  it('picks create or update per file — GitLab rejects the wrong one', async () => {
    const calls = stubRepo({ branchExists: true, existing: ['.gitlab-ci.yml'] });
    await new GitLabRestClient('tok').commitFiles(REPO, PAYLOAD);

    const commit = calls.find((c) => c.url.endsWith('/repository/commits'))!;
    expect(commit.body).toMatchObject({
      branch: 'devdigest/ci',
      commit_message: 'Add CI config',
      actions: [
        { action: 'update', file_path: '.gitlab-ci.yml', content: 'stages: []' },
        { action: 'create', file_path: 'docs/new.md', content: '# new' },
      ],
    });
  });

  it('forks from base with start_branch only when the branch is missing', async () => {
    const missing = stubRepo({ branchExists: false, existing: [] });
    await new GitLabRestClient('tok').commitFiles(REPO, PAYLOAD);
    expect(
      missing.find((c) => c.url.endsWith('/repository/commits'))!.body,
    ).toMatchObject({ start_branch: 'main' });

    const exists = stubRepo({ branchExists: true, existing: [] });
    await new GitLabRestClient('tok').commitFiles(REPO, PAYLOAD);
    // Passing start_branch for a branch that exists makes GitLab reject the commit.
    expect(
      exists.find((c) => c.url.endsWith('/repository/commits'))!.body,
    ).not.toHaveProperty('start_branch');
  });

  it('probes the branch when it exists, and the base when it does not', async () => {
    const calls = stubRepo({ branchExists: false, existing: [] });
    await new GitLabRestClient('tok').commitFiles(REPO, PAYLOAD);
    const probes = calls.filter((c) => c.url.includes('/repository/files/'));
    expect(probes).toHaveLength(2);
    // A new branch has no content of its own yet — probing it would 404 every
    // file and turn every action into a create, which then fails on the base.
    for (const p of probes) expect(p.url).toContain('ref=main');
  });

  it('propagates a non-404 probe failure instead of guessing create', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string) => {
        const url = new URL(String(input));
        if (url.pathname.includes('/repository/branches/')) return new Response('{}', { status: 200 });
        if (url.pathname.includes('/repository/files/')) {
          return new Response('boom', { status: 500, statusText: 'Server Error' });
        }
        return new Response('{}', { status: 200 });
      }),
    );
    await expect(
      new GitLabRestClient('tok').commitFiles(REPO, PAYLOAD),
    ).rejects.toMatchObject({ status: 500 });
  });
});

describe('GitLabRestClient — review', () => {
  it.each(['COMMENT', 'REQUEST_CHANGES'] as const)(
    'posts %s as a plain note and never reaches for approve',
    async (event) => {
      // The branch that matters is the one that does NOT run. GitLab has no
      // request-changes verb, so these events are notes only; if the APPROVE
      // guard were dropped or inverted, a Free instance would answer 403 and
      // the catch would swallow it, hiding the bug — while on an instance where
      // approve succeeds, a COMMENT review would silently approve the MR.
      const calls = stubFetch({
        'POST /api/v4/projects/acme%2Fapi/merge_requests/7/notes': { id: 4242 },
      });

      const res = await new GitLabRestClient('tok').postReview(REPO, 7, {
        body: 'needs a second look',
        event,
      });

      // id is a number on the wire and a string on the port.
      expect(res).toEqual({ id: '4242' });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        method: 'POST',
        url: '/api/v4/projects/acme%2Fapi/merge_requests/7/notes',
        body: { body: 'needs a second look' },
      });
      expect(calls.some((c) => c.url.endsWith('/approve'))).toBe(false);
    },
  );

  it('posts the note and swallows a Premium-only 403 from approve', async () => {
    // On GitLab 14.x approve/unapprove are Premium ("Moved to Premium in 13.9"),
    // so a Free/CE instance answers 403 — the review must still land as a note.
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string, init?: RequestInit) => {
        const url = new URL(String(input));
        seen.push(`${init?.method ?? 'GET'} ${url.pathname}`);
        if (url.pathname.endsWith('/approve')) {
          return new Response('forbidden', { status: 403, statusText: 'Forbidden' });
        }
        return new Response(JSON.stringify({ id: 99 }), { status: 200 });
      }),
    );

    const res = await new GitLabRestClient('tok').postReview(REPO, 7, {
      body: 'LGTM',
      event: 'APPROVE',
    });

    expect(res.id).toBe('99');
    expect(seen).toContain('POST /api/v4/projects/acme%2Fapi/merge_requests/7/notes');
    expect(seen).toContain('POST /api/v4/projects/acme%2Fapi/merge_requests/7/approve');
  });
});
