import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The adapter builds its own Octokit; replace the class with one whose `rest`
// and `request` we control per test.
const g = {
  getRef: vi.fn(),
  getCommit: vi.fn(),
  createTree: vi.fn(),
  createCommit: vi.fn(),
  createRef: vi.fn(),
  updateRef: vi.fn(),
  getTree: vi.fn(),
};
const request = vi.fn();
const actions = { listWorkflowRuns: vi.fn() };

vi.mock('octokit', () => ({
  Octokit: class {
    rest = { git: g, actions };
    request = request;
  },
}));

import { OctokitGitHubClient } from '../src/adapters/github/octokit.js';
import { AppError } from '../src/platform/errors.js';

const REPO = { owner: 'acme', name: 'app' };
const payload = (expectedHeadSha: string | null) => ({
  branch: 'devdigest/ci',
  base: 'main',
  message: 'm',
  files: [{ path: 'a.txt', contents: 'x' }],
  expectedHeadSha,
});
const http = (status: number, extra: object = {}) => Object.assign(new Error(`http ${status}`), { status, ...extra });

beforeEach(() => {
  for (const f of Object.values(g)) f.mockReset();
  request.mockReset();
  g.getCommit.mockResolvedValue({ data: { tree: { sha: 't0' } } });
  g.createTree.mockResolvedValue({ data: { sha: 't1' } });
  g.createCommit.mockResolvedValue({ data: { sha: 'c1' } });
  g.updateRef.mockResolvedValue({});
  g.createRef.mockResolvedValue({});
});
afterEach(() => vi.unstubAllGlobals());

describe('OctokitGitHubClient.commitFiles', () => {
  it('fast-forwards an existing branch with force: false', async () => {
    g.getRef.mockResolvedValue({ data: { object: { sha: 'head1' } } });
    await new OctokitGitHubClient('t').commitFiles(REPO, payload('head1'));
    expect(g.updateRef).toHaveBeenCalledWith(expect.objectContaining({ force: false, sha: 'c1' }));
    expect(g.createCommit).toHaveBeenCalledWith(expect.objectContaining({ parents: ['head1'] }));
  });

  it('deletes stale manifests and skills (sha: null) but keeps the files it writes', async () => {
    g.getRef.mockResolvedValue({ data: { object: { sha: 'head1' } } });
    const tree = (...e: object[]) => ({ data: { tree: e } });
    g.getTree
      .mockResolvedValueOnce(tree({ path: '.devdigest', type: 'tree', sha: 'd' })) // root
      .mockResolvedValueOnce(tree({ path: 'agents', type: 'tree', sha: 'a' }, { path: 'skills', type: 'tree', sha: 's' })) // .devdigest
      .mockResolvedValueOnce(tree({ path: 'old.yaml', type: 'blob' }, { path: 'new.yaml', type: 'blob' }, { path: 'notes.txt', type: 'blob' })) // agents
      .mockResolvedValueOnce(tree({ path: '.devdigest', type: 'tree', sha: 'd' })) // root (2nd rule)
      .mockResolvedValueOnce(tree({ path: 'agents', type: 'tree', sha: 'a' }, { path: 'skills', type: 'tree', sha: 's' }))
      .mockResolvedValueOnce(tree({ path: 'gone.md', type: 'blob' })); // skills
    await new OctokitGitHubClient('t').commitFiles(REPO, {
      ...payload('head1'),
      files: [{ path: '.devdigest/agents/new.yaml', contents: 'x' }],
      prune: [
        { prefix: '.devdigest/agents/', suffix: '.yaml' },
        { prefix: '.devdigest/skills/', suffix: '.md' },
      ],
    });
    const entries = g.createTree.mock.calls[0]![0].tree as { path: string; sha?: null }[];
    expect(entries.filter((e) => e.sha === null).map((e) => e.path)).toEqual([
      '.devdigest/agents/old.yaml',
      '.devdigest/skills/gone.md',
    ]);
    expect(entries.find((e) => e.path === '.devdigest/agents/new.yaml')).toMatchObject({ content: 'x' });
  });

  it('prunes nothing when the directory does not exist', async () => {
    g.getRef.mockResolvedValue({ data: { object: { sha: 'head1' } } });
    g.getTree.mockResolvedValue({ data: { tree: [] } });
    await new OctokitGitHubClient('t').commitFiles(REPO, {
      ...payload('head1'),
      prune: [{ prefix: '.devdigest/agents/', suffix: '.yaml' }],
    });
    expect((g.createTree.mock.calls[0]![0].tree as object[]).length).toBe(1);
  });

  it('creates the branch from base only on a 404', async () => {
    g.getRef
      .mockRejectedValueOnce(http(404))
      .mockResolvedValueOnce({ data: { object: { sha: 'base1' } } });
    await new OctokitGitHubClient('t').commitFiles(REPO, payload(null));
    expect(g.createRef).toHaveBeenCalledOnce();
    expect(g.updateRef).not.toHaveBeenCalled();
  });

  it('does not treat a 500 on getRef as an absent branch', async () => {
    g.getRef.mockRejectedValue(http(500));
    await expect(new OctokitGitHubClient('t').commitFiles(REPO, payload(null))).rejects.toMatchObject({
      status: 500,
    });
    expect(g.createRef).not.toHaveBeenCalled();
    expect(g.createCommit).not.toHaveBeenCalled();
  }, 20_000);

  it('throws branch_moved (409) when the head differs from expectedHeadSha', async () => {
    g.getRef.mockResolvedValue({ data: { object: { sha: 'other' } } });
    const err = await new OctokitGitHubClient('t')
      .commitFiles(REPO, payload('head1'))
      .catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'branch_moved', statusCode: 409 });
    expect(g.createCommit).not.toHaveBeenCalled();
  });

  it('maps a 404 on createTree to missing_workflow_permission with the accepted-permissions header', async () => {
    g.getRef.mockResolvedValue({ data: { object: { sha: 'head1' } } });
    g.createTree.mockRejectedValue(
      http(404, { response: { headers: { 'x-accepted-github-permissions': 'contents=write, workflows=write' } } }),
    );
    const err = await new OctokitGitHubClient('t').commitFiles(REPO, payload('head1')).catch((e) => e);
    expect(err).toMatchObject({ code: 'missing_workflow_permission', statusCode: 403 });
    expect(err.details).toEqual({ accepted_permissions: 'contents=write, workflows=write' });
  });

  it('maps a 403 on createRef the same way', async () => {
    g.getRef
      .mockRejectedValueOnce(http(404))
      .mockResolvedValueOnce({ data: { object: { sha: 'base1' } } });
    g.createRef.mockRejectedValue(http(403));
    await expect(new OctokitGitHubClient('t').commitFiles(REPO, payload(null))).rejects.toMatchObject({
      code: 'missing_workflow_permission',
    });
  });
});

describe('OctokitGitHubClient.tokenScopes', () => {
  it('splits x-oauth-scopes', async () => {
    request.mockResolvedValue({ headers: { 'x-oauth-scopes': 'repo, workflow' } });
    expect(await new OctokitGitHubClient('t').tokenScopes()).toEqual(['repo', 'workflow']);
  });

  it('returns null when the header is absent (fine-grained token)', async () => {
    request.mockResolvedValue({ headers: {} });
    expect(await new OctokitGitHubClient('t').tokenScopes()).toBeNull();
  });
});

describe('OctokitGitHubClient.downloadArtifact', () => {
  const redirect = () =>
    request.mockResolvedValue({ status: 302, headers: { location: 'https://blob.example/a.zip' } });

  it('reads the Location and fetches it without an auth header', async () => {
    redirect();
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetchMock);
    const out = await new OctokitGitHubClient('secret-token').downloadArtifact(REPO, 7, 100);
    expect(Array.from(out)).toEqual([1, 2, 3]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://blob.example/a.zip');
    expect(JSON.stringify(init ?? {})).not.toContain('secret-token');
    expect((init as RequestInit | undefined)?.headers).toBeUndefined();
    // The request itself is cancellable, not just awaited under a timeout.
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
    expect(request.mock.calls[0]![1]).toMatchObject({ request: { redirect: 'manual' } });
  });

  it('rejects a content-length above the cap', async () => {
    redirect();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array(4), { headers: { 'content-length': '5000' } })),
    );
    await expect(new OctokitGitHubClient('t').downloadArtifact(REPO, 7, 100)).rejects.toMatchObject({
      code: 'artifact_too_large',
    });
  });

  it('stops reading past the cap when no content-length is declared', async () => {
    redirect();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(60));
        c.enqueue(new Uint8Array(60));
        c.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    await expect(new OctokitGitHubClient('t').downloadArtifact(REPO, 7, 100)).rejects.toMatchObject({
      code: 'artifact_too_large',
    });
  });

  it('throws an error carrying the numeric status on a non-2xx download', async () => {
    redirect();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gone', { status: 410 })));
    await expect(new OctokitGitHubClient('t').downloadArtifact(REPO, 7, 100)).rejects.toMatchObject({
      status: 410,
    });
  });

  it('refuses a non-https redirect target', async () => {
    request.mockResolvedValue({ status: 302, headers: { location: 'http://evil.example/a.zip' } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(new OctokitGitHubClient('t').downloadArtifact(REPO, 7, 100)).rejects.toThrow(/https/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('OctokitGitHubClient.listWorkflowRuns', () => {
  it('sends the created filter with second precision (no milliseconds)', async () => {
    actions.listWorkflowRuns.mockResolvedValue({ data: { workflow_runs: [] } });
    await new OctokitGitHubClient('t').listWorkflowRuns(REPO, 'devdigest-review.yml', {
      perPage: 100,
      createdSince: '2026-09-15T10:00:00.123Z',
    });
    expect(actions.listWorkflowRuns).toHaveBeenCalledWith(
      expect.objectContaining({ created: '>=2026-09-15T10:00:00Z', per_page: 100 }),
    );
  });
});
