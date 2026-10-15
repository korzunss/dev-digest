import { Octokit } from 'octokit';
import type {
  ForgeClient,
  ForgeProvider,
  RepoRef,
  PrMeta,
  PrDetail,
  PrStatus,
  GitHubReviewPayload,
  CreateReviewCommentInput,
  PrReviewComment,
  OpenPrPayload,
  CommitFilesPayload,
  CommitPruneRule,
  IssueMeta,
  MergedPrLookup,
  BranchState,
  CommitAhead,
  WorkflowRunMeta,
  RunArtifactMeta,
} from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import { withRetry, withTimeout } from '../../platform/resilience.js';
import { collectMergedPrs } from './merged-prs.js';

const TIMEOUT = 30_000;
/** Artifact downloads move up to a few MiB through a second host. */
const DOWNLOAD_TIMEOUT = 60_000;

function statusOf(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : undefined;
}

/**
 * 403/404 on a write that needs the `workflow` scope (classic) or the
 * Workflows permission (fine-grained) → a typed, actionable error. Anything
 * else is rethrown untouched.
 */
function mapWritePermission(err: unknown): never {
  const s = statusOf(err);
  if (s === 403 || s === 404) {
    const headers = (err as { response?: { headers?: Record<string, string | undefined> } })
      .response?.headers;
    const accepted = headers?.['x-accepted-github-permissions'];
    throw new AppError(
      'missing_workflow_permission',
      'The GitHub token cannot write workflow files (needs the "workflow" scope, or the Workflows permission on a fine-grained token).',
      403,
      accepted ? { accepted_permissions: accepted } : undefined,
    );
  }
  throw err;
}

function mapStatus(state: string, merged: boolean | undefined): PrStatus {
  if (merged) return 'merged';
  if (state === 'closed') return 'closed';
  return 'open';
}

/**
 * ForgeClient over Octokit REST — thin. PAT auth (fine-grained).
 * Reads PR list/detail/files/commits/issue; posts reviews; opens PRs.
 */
export class OctokitGitHubClient implements ForgeClient {
  readonly provider: ForgeProvider = 'github';
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async listPullRequests(repo: RepoRef): Promise<PrMeta[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          // Fetch open + recently merged/closed (most-recently-updated first) so
          // the list shows which PRs are merged vs still open — not just open.
          const res = await this.octokit.rest.pulls.list({
            owner: repo.owner,
            repo: repo.name,
            state: 'all',
            sort: 'updated',
            direction: 'desc',
            per_page: 50,
          });
          return res.data.map((pr) => ({
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? 'unknown',
            branch: pr.head.ref,
            base: pr.base.ref,
            head_sha: pr.head.sha,
            base_sha: pr.base.sha,
            additions: 0,
            deletions: 0,
            files_count: 0, // not present on the list payload; populated by getPullRequest
            status: mapStatus(pr.state, Boolean(pr.merged_at)) as PrStatus,
            opened_at: pr.created_at,
            updated_at: pr.updated_at,
          }));
        })(),
        TIMEOUT,
      ),
    );
  }

  async getPullRequest(repo: RepoRef, n: number): Promise<PrDetail> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const { data: pr } = await this.octokit.rest.pulls.get({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
          });
          const { data: files } = await this.octokit.rest.pulls.listFiles({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          const { data: commits } = await this.octokit.rest.pulls.listCommits({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          const linkedIssue = await this.resolveLinkedIssue(repo, pr.body ?? '');
          return {
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? 'unknown',
            branch: pr.head.ref,
            base: pr.base.ref,
            head_sha: pr.head.sha,
            base_sha: pr.base.sha,
            additions: pr.additions,
            deletions: pr.deletions,
            files_count: pr.changed_files,
            status: mapStatus(pr.state, Boolean(pr.merged_at)) as PrStatus,
            opened_at: pr.created_at,
            updated_at: pr.updated_at,
            body: pr.body,
            files: files.map((f) => ({
              path: f.filename,
              additions: f.additions,
              deletions: f.deletions,
              patch: f.patch,
            })),
            commits: commits.map((c) => ({
              sha: c.sha,
              message: c.commit.message,
              author: c.commit.author?.name ?? c.author?.login ?? 'unknown',
              committed_at: c.commit.author?.date,
            })),
            linked_issue: linkedIssue,
          };
        })(),
        TIMEOUT,
      ),
    );
  }

  /** linked issue via regex on PR body (#123 / closes #123). */
  private async resolveLinkedIssue(repo: RepoRef, body: string): Promise<IssueMeta | undefined> {
    const m = body.match(/(?:closes|fixes|resolves)?\s*#(\d+)/i);
    if (!m?.[1]) return undefined;
    try {
      return await this.getIssue(repo, Number(m[1]));
    } catch {
      return undefined;
    }
  }

  async postReview(
    repo: RepoRef,
    n: number,
    review: GitHubReviewPayload,
  ): Promise<{ id: string }> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.createReview({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            body: review.body,
            event: review.event,
            comments: review.comments?.map((c) => ({
              path: c.path,
              line: c.line,
              body: c.body,
            })),
          });
          return { id: String(res.data.id) };
        })(),
        TIMEOUT,
      ),
    );
  }

  /** Shape an Octokit review-comment payload into our DTO. */
  private mapReviewComment(c: {
    id: number;
    path: string;
    line?: number | null;
    original_line?: number | null;
    side?: string | null;
    body: string;
    user: { login: string } | null;
    created_at: string;
    html_url: string;
    in_reply_to_id?: number;
  }): PrReviewComment {
    return {
      id: c.id,
      path: c.path,
      line: c.line ?? null,
      original_line: c.original_line ?? null,
      side: c.side === 'LEFT' ? 'LEFT' : 'RIGHT',
      body: c.body,
      user: c.user?.login ?? 'unknown',
      created_at: c.created_at,
      html_url: c.html_url,
      in_reply_to_id: c.in_reply_to_id ?? null,
      // GitHub addresses a thread by its root comment's numeric id, so it has
      // no separate thread handle — the field exists for GitLab's sake.
      thread_id: null,
      // GitHub drops `line` when the comment can no longer be placed on the diff.
      is_outdated: c.line == null,
    };
  }

  async listReviewComments(repo: RepoRef, n: number): Promise<PrReviewComment[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.listReviewComments({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          return res.data.map((c) => this.mapReviewComment(c));
        })(),
        TIMEOUT,
      ),
    );
  }

  async createReviewComment(
    repo: RepoRef,
    n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          if (input.inReplyTo != null) {
            // `inReplyTo` is widened to number|string for GitLab's 40-char
            // discussion ids; GitHub's are always numeric.
            const commentId = Number(input.inReplyTo);
            if (!Number.isInteger(commentId)) {
              throw new Error(`GitHub reply target must be a numeric comment id, got '${input.inReplyTo}'`);
            }
            const res = await this.octokit.rest.pulls.createReplyForReviewComment({
              owner: repo.owner,
              repo: repo.name,
              pull_number: n,
              comment_id: commentId,
              body: input.body,
            });
            return this.mapReviewComment(res.data);
          }
          const res = await this.octokit.rest.pulls.createReviewComment({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            commit_id: input.commitId,
            path: input.path,
            line: input.line,
            side: input.side ?? 'RIGHT',
            body: input.body,
          });
          return this.mapReviewComment(res.data);
        })(),
        TIMEOUT,
      ),
    );
  }

  async openPullRequest(
    repo: RepoRef,
    payload: OpenPrPayload,
  ): Promise<{ url: string; number: number }> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.create({
            owner: repo.owner,
            repo: repo.name,
            title: payload.title,
            head: payload.head,
            base: payload.base,
            body: payload.body,
          });
          return { url: res.data.html_url, number: res.data.number };
        })(),
        TIMEOUT,
      ),
    );
  }

  async commitFiles(
    repo: RepoRef,
    payload: CommitFilesPayload,
  ): Promise<{ branch: string }> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const owner = repo.owner;
          const name = repo.name;
          const g = this.octokit.rest.git;

          // Parent commit: the target branch if it already exists, else the base.
          // ONLY a 404 means "absent"; any other failure must not fall through to
          // a commit on the base branch.
          let parentSha: string;
          let branchExists = false;
          try {
            const ref = await g.getRef({ owner, repo: name, ref: `heads/${payload.branch}` });
            parentSha = ref.data.object.sha;
            branchExists = true;
          } catch (err) {
            if (statusOf(err) !== 404) throw err;
            const baseRef = await g.getRef({ owner, repo: name, ref: `heads/${payload.base}` });
            parentSha = baseRef.data.object.sha;
          }
          if (payload.expectedHeadSha !== null && (!branchExists || parentSha !== payload.expectedHeadSha)) {
            throw new AppError(
              'branch_moved',
              `Branch ${payload.branch} changed since it was inspected; retry the export.`,
              409,
            );
          }

          // New tree layered on the parent's tree (so unrelated files are kept).
          const parentCommit = await g.getCommit({ owner, repo: name, commit_sha: parentSha });
          // Files the export used to ship and no longer does (a renamed agent, a
          // dropped skill) go away in the same commit: `sha: null` deletes an entry.
          const stale = await this.staleBlobs(
            owner,
            name,
            parentCommit.data.tree.sha,
            payload.prune ?? [],
            new Set(payload.files.map((f) => f.path)),
          );
          const tree = await g
            .createTree({
              owner,
              repo: name,
              base_tree: parentCommit.data.tree.sha,
              tree: [
                ...payload.files.map((f) => ({
                  path: f.path,
                  mode: '100644' as const,
                  type: 'blob' as const,
                  content: f.contents,
                })),
                ...stale.map((path) => ({
                  path,
                  mode: '100644' as const,
                  type: 'blob' as const,
                  sha: null,
                })),
              ],
            })
            .catch(mapWritePermission);

          const commit = await g.createCommit({
            owner,
            repo: name,
            message: payload.message,
            tree: tree.data.sha,
            parents: [parentSha],
          });

          if (branchExists) {
            // Never forced: a concurrent push makes this a non-fast-forward 422.
            await g
              .updateRef({
                owner,
                repo: name,
                ref: `heads/${payload.branch}`,
                sha: commit.data.sha,
                force: false,
              })
              .catch(mapWritePermission);
          } else {
            await g
              .createRef({
                owner,
                repo: name,
                ref: `refs/heads/${payload.branch}`,
                sha: commit.data.sha,
              })
              .catch(mapWritePermission);
          }
          return { branch: payload.branch };
        })(),
        TIMEOUT,
      ),
    );
  }

  /**
   * Blobs directly under each rule's directory that match its suffix and are not
   * in `keep`. Walks the tree one directory at a time (a missing directory is
   * simply empty), so a huge repo never hits the recursive listing's truncation.
   */
  private async staleBlobs(
    owner: string,
    repo: string,
    rootTreeSha: string,
    rules: readonly CommitPruneRule[],
    keep: ReadonlySet<string>,
  ): Promise<string[]> {
    type Entry = { path?: string; type?: string; sha?: string };
    const entries = async (treeSha: string): Promise<Entry[]> =>
      (await this.octokit.rest.git.getTree({ owner, repo, tree_sha: treeSha })).data.tree;
    const out: string[] = [];
    for (const rule of rules) {
      const dirs = rule.prefix.split('/').filter(Boolean);
      let sha: string | undefined = rootTreeSha;
      for (const dir of dirs) {
        sha = (await entries(sha)).find((e) => e.path === dir && e.type === 'tree')?.sha;
        if (!sha) break;
      }
      if (!sha) continue;
      for (const e of await entries(sha)) {
        if (e.type !== 'blob' || !e.path?.endsWith(rule.suffix)) continue;
        const path = `${rule.prefix}${e.path}`;
        if (!keep.has(path)) out.push(path);
      }
    }
    return out;
  }

  async findOpenPr(
    repo: RepoRef,
    branch: string,
  ): Promise<{ url: string; number: number } | null> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.list({
            owner: repo.owner,
            repo: repo.name,
            state: 'open',
            head: `${repo.owner}:${branch}`,
            per_page: 1,
          });
          const pr = res.data[0];
          return pr ? { url: pr.html_url, number: pr.number } : null;
        })(),
        TIMEOUT,
      ),
    );
  }

  async getDefaultBranch(repo: RepoRef): Promise<string> {
    const res = await withRetry(() =>
      withTimeout(this.octokit.rest.repos.get({ owner: repo.owner, repo: repo.name }), TIMEOUT),
    );
    return res.data.default_branch;
  }

  async getBranch(repo: RepoRef, name: string): Promise<BranchState | null> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          try {
            const res = await this.octokit.rest.repos.getBranch({
              owner: repo.owner,
              repo: repo.name,
              branch: name,
            });
            return { sha: res.data.commit.sha, protected: res.data.protected };
          } catch (err) {
            if (statusOf(err) === 404) return null;
            throw err;
          }
        })(),
        TIMEOUT,
      ),
    );
  }

  async listCommitsAhead(
    repo: RepoRef,
    base: string,
    head: string,
  ): Promise<CommitAhead[]> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.repos.compareCommitsWithBasehead({
          owner: repo.owner,
          repo: repo.name,
          basehead: `${base}...${head}`,
          per_page: 100,
        }),
        TIMEOUT,
      ),
    );
    const commits: CommitAhead[] = res.data.commits.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.author?.login ?? c.commit.author?.name ?? null,
      date: c.commit.author?.date ?? null,
    }));
    // More commits than one page: the rest are unseen, so append a commit that
    // carries no export trailer — the caller then refuses (`foreign_commits`).
    if (res.data.ahead_by > commits.length) commits.push({ sha: '', message: '(truncated)' });
    return commits;
  }

  async deleteBranch(repo: RepoRef, name: string): Promise<void> {
    await withRetry(() =>
      withTimeout(
        this.octokit.rest.git.deleteRef({
          owner: repo.owner,
          repo: repo.name,
          ref: `heads/${name}`,
        }),
        TIMEOUT,
      ),
    );
  }

  async tokenScopes(): Promise<string[] | null> {
    const res = await withRetry(() =>
      withTimeout(this.octokit.request('GET /user'), TIMEOUT),
    );
    const header = res.headers['x-oauth-scopes'];
    if (typeof header !== 'string') return null;
    return header
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async getPullState(repo: RepoRef, n: number): Promise<'open' | 'merged' | 'closed'> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.pulls.get({ owner: repo.owner, repo: repo.name, pull_number: n }),
        TIMEOUT,
      ),
    );
    return mapStatus(res.data.state, Boolean(res.data.merged_at)) as 'open' | 'merged' | 'closed';
  }

  async listWorkflowRuns(
    repo: RepoRef,
    workflowFile: string,
    opts: { perPage: number; page?: number; createdSince?: string },
  ): Promise<WorkflowRunMeta[]> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.actions.listWorkflowRuns({
          owner: repo.owner,
          repo: repo.name,
          workflow_id: workflowFile,
          per_page: opts.perPage,
          ...(opts.page ? { page: opts.page } : {}),
          // GitHub's date qualifier documents second precision only — drop milliseconds.
          ...(opts.createdSince
            ? { created: `>=${opts.createdSince.replace(/\.\d+Z$/, 'Z')}` }
            : {}),
        }),
        TIMEOUT,
      ),
    );
    return res.data.workflow_runs.map((r) => ({
      id: r.id,
      run_attempt: r.run_attempt ?? 1,
      head_sha: r.head_sha,
      status: r.status ?? 'unknown',
      conclusion: r.conclusion ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      html_url: r.html_url,
      pr_numbers: (r.pull_requests ?? []).map((p) => p.number),
    }));
  }

  async listRunArtifacts(repo: RepoRef, runId: number): Promise<RunArtifactMeta[]> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.actions.listWorkflowRunArtifacts({
          owner: repo.owner,
          repo: repo.name,
          run_id: runId,
          per_page: 100,
        }),
        TIMEOUT,
      ),
    );
    return res.data.artifacts.map((a) => ({
      id: a.id,
      name: a.name,
      size_in_bytes: a.size_in_bytes,
      expired: a.expired,
    }));
  }

  async firstJobUrl(repo: RepoRef, runId: number, attempt: number): Promise<string | null> {
    try {
      const res = await withRetry(() =>
        withTimeout(
          this.octokit.rest.actions.listJobsForWorkflowRunAttempt({
            owner: repo.owner,
            repo: repo.name,
            run_id: runId,
            attempt_number: attempt,
            per_page: 1,
          }),
          TIMEOUT,
        ),
      );
      return res.data.jobs[0]?.html_url ?? null;
    } catch (err) {
      if (statusOf(err) === 404) return null;
      throw err;
    }
  }

  async downloadArtifact(
    repo: RepoRef,
    artifactId: number,
    maxBytes: number,
  ): Promise<Uint8Array> {
    // Step 1 (authenticated, no redirect-follow): the API answers 302 + Location,
    // a short-lived signed URL on another host. The token must never reach it.
    const location = await withRetry(() =>
      withTimeout(this.artifactLocation(repo, artifactId), TIMEOUT),
    );
    let url: URL;
    try {
      url = new URL(location);
    } catch {
      throw Object.assign(new Error('artifact redirect is not a URL'), { status: 502 });
    }
    if (url.protocol !== 'https:') {
      throw Object.assign(new Error('artifact redirect is not https'), { status: 502 });
    }

    // Step 2 (plain fetch, no auth header), capped by bytes.
    return withRetry(() =>
      withTimeout(
        (async () => {
          // The signal cancels the request itself; `withTimeout` only stops waiting for it.
          const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT) });
          if (!res.ok) {
            throw Object.assign(new Error(`artifact download failed: ${res.status}`), {
              status: res.status,
            });
          }
          const declared = Number(res.headers.get('content-length'));
          if (Number.isFinite(declared) && declared > maxBytes) {
            await res.body?.cancel();
            throw new AppError('artifact_too_large', 'Artifact exceeds the size cap', 413);
          }
          const reader = res.body?.getReader();
          if (!reader) return new Uint8Array(0);
          const chunks: Uint8Array[] = [];
          let total = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) {
              await reader.cancel();
              throw new AppError('artifact_too_large', 'Artifact exceeds the size cap', 413);
            }
            chunks.push(value);
          }
          const out = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) {
            out.set(c, off);
            off += c.byteLength;
          }
          return out;
        })(),
        DOWNLOAD_TIMEOUT,
      ),
    );
  }

  /** Resolve the signed download URL without following the redirect. */
  private async artifactLocation(repo: RepoRef, artifactId: number): Promise<string> {
    const fromHeaders = (headers: Record<string, unknown> | undefined): string | null => {
      const l = headers?.location;
      return typeof l === 'string' && l ? l : null;
    };
    try {
      const res = await this.octokit.request(
        'GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}',
        {
          owner: repo.owner,
          repo: repo.name,
          artifact_id: artifactId,
          archive_format: 'zip',
          request: { redirect: 'manual' },
        },
      );
      const loc = fromHeaders(res.headers as Record<string, unknown>);
      if (loc) return loc;
    } catch (err) {
      // Some octokit versions surface the 302 as a RequestError.
      const e = err as { status?: number; response?: { headers?: Record<string, unknown> } };
      if (e.status === 302) {
        const loc = fromHeaders(e.response?.headers);
        if (loc) return loc;
      }
      throw err;
    }
    throw Object.assign(new Error('artifact has no download location'), { status: 410 });
  }

  async getIssue(repo: RepoRef, n: number): Promise<IssueMeta> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.issues.get({ owner: repo.owner, repo: repo.name, issue_number: n }),
        TIMEOUT,
      ),
    );
    return {
      number: res.data.number,
      title: res.data.title,
      body: res.data.body,
      state: res.data.state,
    };
  }

  async currentLogin(): Promise<string> {
    const res = await withRetry(() =>
      withTimeout(this.octokit.rest.users.getAuthenticated(), TIMEOUT),
    );
    return res.data.login;
  }

  async listMergedPullsTouching(
    repo: RepoRef,
    paths: string[],
    opts: { excludeNumber: number; commitsPerPath: number; limit: number },
  ): Promise<MergedPrLookup> {
    const items = await collectMergedPrs(
      paths,
      {
        listCommits: async (path) => {
          const res = await withRetry(() =>
            withTimeout(
              this.octokit.rest.repos.listCommits({
                owner: repo.owner,
                repo: repo.name,
                path,
                per_page: opts.commitsPerPath,
              }),
              TIMEOUT,
            ),
          );
          return res.data.map((c) => c.sha);
        },
        prsForCommit: async (sha) => {
          const res = await withRetry(() =>
            withTimeout(
              this.octokit.rest.repos.listPullRequestsAssociatedWithCommit({
                owner: repo.owner,
                repo: repo.name,
                commit_sha: sha,
                per_page: 5,
              }),
              TIMEOUT,
            ),
          );
          return res.data.map((pr) => ({
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? null,
            merged_at: pr.merged_at,
            baseRepo: pr.base?.repo?.full_name ?? null,
          }));
        },
      },
      {
        excludeNumber: opts.excludeNumber,
        limit: opts.limit,
        repoFullName: `${repo.owner}/${repo.name}`,
      },
    );
    return { supported: true, items };
  }
}
