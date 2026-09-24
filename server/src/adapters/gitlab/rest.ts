import type {
  ForgeClient,
  ForgeProvider,
  RepoRef,
  PrMeta,
  PrDetail,
  PrFile,
  GitHubReviewPayload,
  CreateReviewCommentInput,
  PrReviewComment,
  OpenPrPayload,
  CommitFilesPayload,
  IssueMeta,
} from '@devdigest/shared';
import { withRetry, withTimeout } from '../../platform/resilience.js';
import { DEFAULT_API_BASE, gitlabApiRoot } from '../../platform/forge-resolve.js';
import {
  mapMrToPrMeta,
  mapMrState,
  mapDiffsToFiles,
  sumFileStats,
  mapCommits,
  mapDiscussions,
  mapNote,
  diffNotesOf,
  buildPosition,
  supportsDiffsEndpoint,
  type GlMergeRequest,
  type GlDiff,
  type GlCommit,
  type GlDiscussion,
  type GlDiffRefs,
  type GlNote,
} from './mappers.js';

const TIMEOUT = 30_000;
/** GitLab's max page size. `/diffs` rejected >30 on early 16.x; 100 is current. */
const PAGE_SIZE = 50;
/** Pages we will walk before giving up, so a broken cursor cannot spin forever. */
const MAX_PAGES = 40;

/** An HTTP error that `platform/resilience.ts` can actually classify. */
export class GitLabHttpError extends Error {
  constructor(readonly status: number, message: string, readonly body?: string) {
    super(message);
    this.name = 'GitLabHttpError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

/**
 * ForgeClient over the GitLab REST API v4 — thin, `fetch`-based, PAT auth.
 *
 * No SDK on purpose: the surface here is ~10 endpoints, auth is one header and
 * pagination is one header, so a gitbeaker dependency would buy nothing.
 *
 * Works against both gitlab.com and a self-managed instance, including one
 * installed under a relative URL — which is why the base is an `apiBase`
 * (origin + optional path prefix) and never a bare host.
 */
/**
 * A URL safe to put in an error message. `test-connection` returns an adapter's
 * `err.message` straight to the HTTP client, and `apiRoot` is operator-supplied:
 * `parseForgeBases` passes userinfo through untouched, so a GITLAB_HOST written
 * as `https://oauth2:<pat>@git.acme.com` — the exact shape `withForgeToken`
 * builds for clones, so an easy thing to copy across — would otherwise print
 * the PAT back out. The PRIVATE-TOKEN header is not in the URL and never was;
 * this covers the credential that can be.
 */
export function redactUrl(url: URL): string {
  if (!url.username && !url.password) return url.href;
  const safe = new URL(url.href);
  safe.username = '';
  safe.password = '';
  return safe.href;
}

export class GitLabRestClient implements ForgeClient {
  readonly provider: ForgeProvider = 'gitlab';
  private readonly apiRoot: string;
  private readonly webBase: string;
  private versionProbe?: Promise<string | null>;

  constructor(private token: string, apiBase?: string | null) {
    this.apiRoot = gitlabApiRoot(apiBase ?? null);
    this.webBase = (apiBase ?? DEFAULT_API_BASE.gitlab).replace(/\/+$/, '');
  }

  // ---- transport -------------------------------------------------------

  /**
   * One request. Throws `GitLabHttpError` carrying `status` on a non-2xx:
   * `fetch` resolves rather than throwing for 4xx/5xx, and
   * `resilience.defaultIsRetryable` classifies by `err.status` — without this,
   * every call would be wrapped in `withRetry` and silently never retry.
   */
  private async request<T>(path: string, opts: RequestOptions = {}): Promise<{
    data: T;
    headers: Headers;
  }> {
    const url = new URL(`${this.apiRoot}${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        // PRIVATE-TOKEN works on every version in scope; Bearer is OAuth-shaped
        // and not universally accepted for PATs on older self-managed builds.
        'PRIVATE-TOKEN': this.token,
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // Name the FULL url, not just the path: a 401 here is usually a token
      // being checked against the wrong instance, and the path alone hides
      // that. HTTP/2 carries no reason phrase, so statusText is often empty —
      // include the response body instead, which is where GitLab explains.
      const detail = body.trim().slice(0, 200);
      throw new GitLabHttpError(
        res.status,
        `GitLab ${opts.method ?? 'GET'} ${redactUrl(url)} failed: ${res.status}` +
          (res.statusText ? ` ${res.statusText}` : '') +
          (detail ? ` — ${detail}` : ''),
        body,
      );
    }
    const text = await res.text();
    return { data: (text ? JSON.parse(text) : null) as T, headers: res.headers };
  }

  /** `withRetry(withTimeout(...))`, matching the Octokit client's nesting. */
  private call<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return withRetry(() =>
      withTimeout(
        this.request<T>(path, opts).then((r) => r.data),
        TIMEOUT,
      ),
    );
  }

  /** Walk offset pages until `x-next-page` is empty. */
  private async paginate<T>(path: string, query: RequestOptions['query'] = {}): Promise<T[]> {
    const out: T[] = [];
    let page: string | undefined = '1';
    for (let i = 0; i < MAX_PAGES && page; i++) {
      const res: { data: T[]; headers: Headers } = await withRetry(() =>
        withTimeout(
          this.request<T[]>(path, { query: { ...query, per_page: PAGE_SIZE, page } }),
          TIMEOUT,
        ),
      );
      out.push(...(res.data ?? []));
      page = res.headers.get('x-next-page') || undefined;
    }
    return out;
  }

  /** `encodeURIComponent` of the full project path — nested groups included. */
  private projectId(repo: RepoRef): string {
    return encodeURIComponent(projectPath(repo));
  }

  private mrPath(repo: RepoRef, iid: number): string {
    return `/projects/${this.projectId(repo)}/merge_requests/${iid}`;
  }

  // ---- version (one probe, one decision) -------------------------------

  /** `GET /version` → "14.5.2". Null when it can't be read (degrades to old API). */
  async instanceVersion(): Promise<string | null> {
    this.versionProbe ??= this.call<{ version?: string }>('/version')
      .then((v) => v.version ?? null)
      .catch(() => null);
    return this.versionProbe;
  }

  // ---- reads -----------------------------------------------------------

  async listPullRequests(repo: RepoRef): Promise<PrMeta[]> {
    const mrs = await this.paginate<GlMergeRequest>(
      `/projects/${this.projectId(repo)}/merge_requests`,
      { scope: 'all', state: 'all', order_by: 'updated_at', sort: 'desc' },
    );
    return mrs.map(mapMrToPrMeta);
  }

  /**
   * Diff retrieval is the ONE method that differs across supported versions:
   * `…/changes` is the only option below 15.7 and returns everything in one
   * (silently truncated) response; `…/diffs` replaced it in 15.7 and is
   * paginated. Fetching only page 1 of `/diffs` would silently review the first
   * N files of a large MR — a correctness bug that reads like a model failure.
   */
  private async fetchDiffs(repo: RepoRef, iid: number): Promise<PrFile[]> {
    if (supportsDiffsEndpoint(await this.instanceVersion())) {
      const diffs = await this.paginate<GlDiff>(`${this.mrPath(repo, iid)}/diffs`);
      return mapDiffsToFiles(diffs);
    }
    const legacy = await this.call<{ changes?: GlDiff[] }>(`${this.mrPath(repo, iid)}/changes`);
    return mapDiffsToFiles(legacy.changes ?? []);
  }

  async getPullRequest(repo: RepoRef, n: number): Promise<PrDetail> {
    const mr = await this.call<GlMergeRequest>(this.mrPath(repo, n));
    const [files, commits] = await Promise.all([
      this.fetchDiffs(repo, n),
      this.paginate<GlCommit>(`${this.mrPath(repo, n)}/commits`),
    ]);
    const stats = sumFileStats(files);
    const linkedIssue = await this.resolveLinkedIssue(repo, mr.description ?? '');
    return {
      ...mapMrToPrMeta(mr),
      ...stats,
      status: mapMrState(mr.state),
      body: mr.description ?? null,
      files,
      commits: mapCommits(commits),
      linked_issue: linkedIssue,
    };
  }

  /** Linked issue via regex on the MR description (`#123` / `Closes #123`). */
  private async resolveLinkedIssue(repo: RepoRef, body: string): Promise<IssueMeta | undefined> {
    const m = body.match(/(?:closes|fixes|resolves)?\s*#(\d+)/i);
    if (!m?.[1]) return undefined;
    try {
      return await this.getIssue(repo, Number(m[1]));
    } catch {
      return undefined;
    }
  }

  async listReviewComments(repo: RepoRef, n: number): Promise<PrReviewComment[]> {
    // The MR is fetched for its `diff_refs.head_sha`: a GitLab note keeps the
    // position of the version it was written against, so "outdated" is a
    // comparison against the CURRENT head, not a missing field as on GitHub.
    const [mr, discussions] = await Promise.all([
      this.call<GlMergeRequest>(this.mrPath(repo, n)),
      this.paginate<GlDiscussion>(`${this.mrPath(repo, n)}/discussions`),
    ]);
    return mapDiscussions(discussions, {
      webBase: this.webBase,
      projectPath: projectPath(repo),
      iid: n,
      currentHeadSha: mr.diff_refs?.head_sha ?? null,
    });
  }

  async getIssue(repo: RepoRef, n: number): Promise<IssueMeta> {
    const issue = await this.call<{
      iid: number;
      title: string;
      description?: string | null;
      state: string;
    }>(`/projects/${this.projectId(repo)}/issues/${n}`);
    return {
      number: issue.iid,
      title: issue.title,
      body: issue.description ?? null,
      state: issue.state,
    };
  }

  async currentLogin(): Promise<string> {
    const user = await this.call<{ username?: string }>('/user');
    return user.username ?? 'unknown';
  }

  // ---- writes ----------------------------------------------------------

  async createReviewComment(
    repo: RepoRef,
    n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment> {
    const thread = await this.resolveThread(repo, n, input.inReplyTo);
    const base = {
      webBase: this.webBase,
      projectPath: projectPath(repo),
      iid: n,
      // A note that was just created is anchored to the current diff by
      // construction, so there is nothing to compare a head sha against.
      currentHeadSha: null,
    };

    // Both POSTs return the object GitLab created, so the ids and URL come
    // from GitLab rather than from matching on our own text afterwards: two
    // comments can carry the same body on different lines, and a body GitLab
    // normalises would match nothing at all.
    if (thread) {
      const note = await this.call<GlNote>(
        `${this.mrPath(repo, n)}/discussions/${thread.discussionId}/notes`,
        { method: 'POST', body: { body: input.body } },
      );
      return mapNote(note, {
        ...base,
        discussionId: thread.discussionId,
        rootNoteId: thread.rootNoteId,
      });
    }

    const mr = await this.call<GlMergeRequest>(this.mrPath(repo, n));
    const refs = mr.diff_refs;
    if (!refs) {
      throw new GitLabHttpError(
        422,
        'Merge request has no diff_refs — it has no diff to anchor a comment to.',
      );
    }
    const created = await this.call<GlDiscussion>(`${this.mrPath(repo, n)}/discussions`, {
      method: 'POST',
      body: { body: input.body, position: buildPosition(refs as GlDiffRefs, input) },
    });
    const note = diffNotesOf(created)[0];
    if (!note) {
      throw new GitLabHttpError(
        500,
        'GitLab accepted the comment but returned a discussion with no diff note.',
      );
    }
    // This note IS the thread root, hence no in_reply_to.
    return mapNote(note, { ...base, discussionId: created.id, rootNoteId: null });
  }

  /**
   * Resolve a reply target to the discussion it belongs to AND that thread's
   * first note. Both are needed: GitLab addresses a reply by DISCUSSION id (a
   * 40-char string), while the web client groups a thread by
   * `in_reply_to_id ?? id`, so a reply that reports no root splits the thread
   * in two on screen.
   */
  private async resolveThread(
    repo: RepoRef,
    n: number,
    inReplyTo: number | string | undefined,
  ): Promise<{ discussionId: string; rootNoteId: number | null } | null> {
    if (inReplyTo == null) return null;

    if (typeof inReplyTo === 'string') {
      // A thread_id we handed out earlier. One read tells us its root note and
      // validates the discussion exists, which beats a blind POST 404.
      const d = await this.call<GlDiscussion>(
        `${this.mrPath(repo, n)}/discussions/${encodeURIComponent(inReplyTo)}`,
      );
      return { discussionId: d.id, rootNoteId: diffNotesOf(d)[0]?.id ?? null };
    }

    // A numeric note id — find the discussion holding it.
    const discussions = await this.paginate<GlDiscussion>(
      `${this.mrPath(repo, n)}/discussions`,
    );
    const owning = discussions.find((d) => (d.notes ?? []).some((nt) => nt.id === inReplyTo));
    if (!owning) {
      throw new GitLabHttpError(404, `No discussion contains note ${inReplyTo}.`);
    }
    return { discussionId: owning.id, rootNoteId: diffNotesOf(owning)[0]?.id ?? null };
  }

  /**
   * Summary note, then approve. `REQUEST_CHANGES` has no GitLab equivalent, so
   * it degrades to a plain note. The approve call is BEST-EFFORT: on GitLab
   * 14.x the endpoint is Premium-only ("Moved to GitLab Premium in 13.9"), so a
   * Free/CE instance answers 403/404 — swallowing that leaves the review
   * posted as a comment instead of failing the whole run. Tier is not
   * probeable (`/license` is admin-only), so this cannot be a capability check.
   */
  async postReview(
    repo: RepoRef,
    n: number,
    review: GitHubReviewPayload,
  ): Promise<{ id: string }> {
    const note = await this.call<{ id: number }>(`${this.mrPath(repo, n)}/notes`, {
      method: 'POST',
      body: { body: review.body },
    });
    if (review.event === 'APPROVE') {
      try {
        await this.call(`${this.mrPath(repo, n)}/approve`, { method: 'POST' });
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status !== 403 && status !== 404) throw err;
      }
    }
    return { id: String(note.id) };
  }

  async openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }> {
    const mr = await this.call<{ web_url?: string }>(
      `/projects/${this.projectId(repo)}/merge_requests`,
      {
        method: 'POST',
        body: {
          source_branch: payload.head,
          target_branch: payload.base,
          title: payload.title,
          description: payload.body,
        },
      },
    );
    return { url: mr.web_url ?? `${this.webBase}/${projectPath(repo)}/-/merge_requests` };
  }

  async findOpenPr(repo: RepoRef, branch: string): Promise<{ url: string } | null> {
    const mrs = await this.call<{ web_url?: string }[]>(
      `/projects/${this.projectId(repo)}/merge_requests`,
      { query: { state: 'opened', source_branch: branch, per_page: 1 } },
    );
    const mr = mrs[0];
    return mr?.web_url ? { url: mr.web_url } : null;
  }

  /**
   * One Commits-API call with an `actions[]` batch — GitLab has no
   * blobs→tree→commit dance. `start_branch` creates the branch when missing.
   *
   * GitLab rejects `create` for a file that exists and `update` for one that
   * doesn't, so each action is chosen by probing the target ref. The probe is
   * per-file but cheap (a HEAD-shaped GET) and it is the only way to stay
   * idempotent across re-publishes.
   */
  async commitFiles(repo: RepoRef, payload: CommitFilesPayload): Promise<{ branch: string }> {
    const id = this.projectId(repo);
    const branchExists = await this.refExists(id, payload.branch);
    const probeRef = branchExists ? payload.branch : payload.base;

    const actions = await Promise.all(
      payload.files.map(async (f) => ({
        action: (await this.fileExists(id, f.path, probeRef)) ? 'update' : 'create',
        file_path: f.path,
        content: f.contents,
      })),
    );

    await this.call(`/projects/${id}/repository/commits`, {
      method: 'POST',
      body: {
        branch: payload.branch,
        ...(branchExists ? {} : { start_branch: payload.base }),
        commit_message: payload.message,
        actions,
      },
    });
    return { branch: payload.branch };
  }

  private async refExists(projectId: string, branch: string): Promise<boolean> {
    try {
      await this.call(`/projects/${projectId}/repository/branches/${encodeURIComponent(branch)}`);
      return true;
    } catch (err) {
      if ((err as { status?: number }).status === 404) return false;
      throw err;
    }
  }

  private async fileExists(projectId: string, path: string, ref: string): Promise<boolean> {
    try {
      await this.call(
        `/projects/${projectId}/repository/files/${encodeURIComponent(path)}`,
        { query: { ref } },
      );
      return true;
    } catch (err) {
      if ((err as { status?: number }).status === 404) return false;
      throw err;
    }
  }
}

/** Full project path for a ref — nested GitLab groups keep their slashes. */
function projectPath(repo: RepoRef): string {
  return repo.path ?? `${repo.owner}/${repo.name}`;
}
