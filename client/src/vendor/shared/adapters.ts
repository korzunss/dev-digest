import { z } from 'zod';
import type {
  PrMeta,
  PrDetail,
  IssueMeta,
  PrReviewComment,
  ForgeProvider,
} from './contracts/platform.js';
import type { CostSource } from './contracts/trace.js';

/**
 * Adapter interfaces. ALL external calls go behind these interfaces.
 * Real implementations live in `apps/api/src/adapters/*`; mock implementations
 * live alongside for tests/dev (Services depend on the interface, not the impl).
 */

// ---------- LLM ----------
export const ModelInfo = z.object({
  id: z.string(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']),
  label: z.string().nullish(),
  created: z.number().int().nullish(),
  /** Pricing in USD per 1M tokens (when the provider exposes it, e.g. OpenRouter). */
  pricing: z
    .object({ promptPerM: z.number(), completionPerM: z.number() })
    .nullish(),
  /** Max context window in tokens (when the provider exposes it). */
  contextLength: z.number().int().nullish(),
});
export type ModelInfo = z.infer<typeof ModelInfo>;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  /**
   * Whether `costUsd` was REPORTED by the provider or priced by us from token
   * counts (spec 001). Only the provider that produced the number knows, so it
   * is set there and never re-derived downstream. Undefined ⇒ unknown.
   */
  costSource?: CostSource;
}

/**
 * Routing hint for gateway providers (OpenRouter maps it into its `provider`
 * object). Direct providers ignore it; `{}` = the gateway's default balancing.
 */
export interface LlmRouting {
  sort?: 'throughput' | 'latency' | 'price';
}

/** Usage of ONE completed round, reported as soon as the response arrives. */
export interface LlmUsageReport {
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  costSource?: CostSource;
}

/**
 * Structured-output request. `schema` is a Zod schema; `schemaName` names the
 * tool / json_schema. `maxRetries` controls reprompt-on-error.
 */
export interface StructuredRequest<T> {
  model: string;
  schema: z.ZodType<T>;
  schemaName: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /**
   * OpenRouter-only: forces `provider.require_parameters` so routing excludes
   * any upstream endpoint that doesn't support this request's parameters
   * (e.g. structured outputs). Other providers ignore it.
   */
  requireParameters?: boolean;
  /** Gateway routing hint; see LlmRouting. Ignored by direct providers. */
  routing?: LlmRouting;
  /**
   * Caller-owned cancellation. Providers pass it to the SDK request and check
   * it before each reprompt attempt; an aborted call rejects. Never
   * serialised into the request body.
   */
  signal?: AbortSignal;
  /**
   * Called once per completed round with that round's own usage (not
   * cumulative), before any throw that follows the round. Never serialised
   * into the request body; providers that don't support it ignore it.
   */
  onUsage?: (u: LlmUsageReport) => void;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  /** See CompletionResult.costSource. Undefined ⇒ unknown. */
  costSource?: CostSource;
  /** Upstream provider that answered, when the gateway reports it; undefined otherwise. */
  servedBy?: string;
  raw: string;
  attempts: number;
}

export interface LLMProvider {
  readonly id: 'openai' | 'anthropic';
  listModels(): Promise<ModelInfo[]>;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
  embed(texts: string[]): Promise<number[][]>;
}

// ---------- Embedder ----------
export interface Embedder {
  /** OpenAI text-embedding-3-small → 1536 dims. */
  embed(texts: string[]): Promise<number[][]>;
  readonly dims: number;
}

// ---------- GitHub (Octokit REST, thin) ----------
export interface RepoRef {
  owner: string;
  name: string;
  /** Full project path (GitLab nested groups keep their '/'). */
  path?: string;
  provider?: ForgeProvider;
  /** Origin + any path prefix of a self-managed instance. */
  apiBase?: string;
}

export interface GitHubReviewPayload {
  body: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  comments?: { path: string; line: number; body: string }[];
}

/** Create one standalone inline review comment (or a reply to a thread). */
export interface CreateReviewCommentInput {
  /** Head commit the comment pins to (GitHub requires commit_id). */
  commitId: string;
  path: string;
  line: number;
  side?: 'LEFT' | 'RIGHT';
  body: string;
  /** When set, post as a reply to that comment's thread instead of a new one. */
  inReplyTo?: number | string;
}

export interface OpenPrPayload {
  title: string;
  head: string;
  base: string;
  body: string;
}

/** A single file to write in a commit (path relative to repo root + UTF-8 text). */
export interface CommitFile {
  path: string;
  contents: string;
}

export interface CommitFilesPayload {
  /** Branch to create-or-update with the commit (e.g. "devdigest/ci"). */
  branch: string;
  /** Base branch to fork from when `branch` does not yet exist (e.g. "main"). */
  base: string;
  message: string;
  files: CommitFile[];
  /**
   * Head sha the caller last saw on `branch`. When set and the branch has moved,
   * the commit is refused (`branch_moved`); `null` means "create the branch fresh".
   */
  expectedHeadSha: string | null;
  /**
   * Stale-file pruning: after layering `files` on the parent tree, every existing
   * blob whose path starts with `prefix` (a directory, trailing `/`), ends with
   * `suffix`, and is not in `files` is deleted in the same commit.
   */
  prune?: CommitPruneRule[];
}

/** One directory + extension whose files not in the commit are removed. */
export interface CommitPruneRule {
  /** Directory path with a trailing slash, e.g. `.devdigest/agents/`. Direct children only. */
  prefix: string;
  /** File-name suffix, e.g. `.yaml`. */
  suffix: string;
}

/** One commit of a branch, as the forge reports it. Author and date are untrusted display text. */
export interface CommitAhead {
  sha: string;
  message: string;
  /** Author login, else the git author name; null when the forge reports neither. */
  author?: string | null;
  /** Author date, ISO 8601. */
  date?: string | null;
}

/** A branch as seen on the forge. */
export interface BranchState {
  sha: string;
  protected: boolean;
}

/** One GitHub Actions workflow run (metadata only). */
export interface WorkflowRunMeta {
  id: number;
  run_attempt: number;
  head_sha: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  /** Last change of the run; a re-run (same `created_at`, new attempt) moves it. */
  updated_at: string;
  html_url: string;
  /** Numbers of the PRs the run is associated with. */
  pr_numbers: number[];
}

/** One artifact attached to a workflow run. */
export interface RunArtifactMeta {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
}

/** Where the studio reads the committed agent-runner bundle from. */
export interface RunnerBundleSource {
  read(): Promise<string>;
}

/** A merged PR that touched some of the queried paths. */
export interface MergedPrTouching {
  number: number;
  title: string;
  author: string;
  merged_at: string;
  paths: string[];
}

export interface MergedPrLookup {
  /** False when this forge cannot answer the question (items is then empty). */
  supported: boolean;
  items: MergedPrTouching[];
}

export interface ForgeClient {
  readonly provider: ForgeProvider;
  listPullRequests(repo: RepoRef): Promise<PrMeta[]>;
  getPullRequest(repo: RepoRef, n: number): Promise<PrDetail>;
  postReview(repo: RepoRef, n: number, review: GitHubReviewPayload): Promise<{ id: string }>;
  /** List inline review comments on a PR (for the "Files changed" tab). */
  listReviewComments(repo: RepoRef, n: number): Promise<PrReviewComment[]>;
  /** Create one inline review comment (or reply) on a PR; returns the new comment. */
  createReviewComment(
    repo: RepoRef,
    n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment>;
  openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string; number: number }>;
  /**
   * Commit `files` onto `branch` as ONE atomic commit (Git Data API: blobs →
   * tree → commit → ref). Creates the branch from `base` if missing, else
   * fast-forwards it. Never forces; refuses when `expectedHeadSha` is stale.
   */
  commitFiles(repo: RepoRef, payload: CommitFilesPayload): Promise<{ branch: string }>;
  /** The open PR whose head is `branch`, if any (so re-publish reuses it). */
  findOpenPr(repo: RepoRef, branch: string): Promise<{ url: string; number: number } | null>;
  /** The repo's default branch name. */
  getDefaultBranch(repo: RepoRef): Promise<string>;
  /** The branch's head sha + protection flag, or null when it does not exist. */
  getBranch(repo: RepoRef, name: string): Promise<BranchState | null>;
  /** Commits on `head` that are not on `base` (compare API, capped), oldest first. */
  listCommitsAhead(
    repo: RepoRef,
    base: string,
    head: string,
  ): Promise<CommitAhead[]>;
  deleteBranch(repo: RepoRef, name: string): Promise<void>;
  /** OAuth scopes of the token (classic PAT), or null when the forge reports none. */
  tokenScopes(): Promise<string[] | null>;
  getPullState(repo: RepoRef, n: number): Promise<'open' | 'merged' | 'closed'>;
  /** Newest-first runs of one workflow file; `page` is 1-based, `createdSince` an ISO lower bound. */
  listWorkflowRuns(
    repo: RepoRef,
    workflowFile: string,
    opts: { perPage: number; page?: number; createdSince?: string },
  ): Promise<WorkflowRunMeta[]>;
  listRunArtifacts(repo: RepoRef, runId: number): Promise<RunArtifactMeta[]>;
  /** URL of the first job of one run attempt, or null when it cannot be resolved. */
  firstJobUrl(repo: RepoRef, runId: number, attempt: number): Promise<string | null>;
  /** Download an artifact zip; rejects when it exceeds `maxBytes`. */
  downloadArtifact(repo: RepoRef, artifactId: number, maxBytes: number): Promise<Uint8Array>;
  getIssue(repo: RepoRef, n: number): Promise<IssueMeta>;
  /** GET /user — for "posting as @user". */
  currentLogin(): Promise<string>;
  /** Merged PRs (newest first) that touched any of `paths`, excluding PR `excludeNumber`. */
  listMergedPullsTouching(
    repo: RepoRef,
    paths: string[],
    opts: { excludeNumber: number; commitsPerPath: number; limit: number },
  ): Promise<MergedPrLookup>;
}

// ---------- Git (simple-git, heavy) ----------
export interface CloneOptions {
  depth?: number;
  branch?: string;
}

export interface DiffHunk {
  file: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Lines present in the *new* file covered by this hunk (for grounding). */
  newLineNumbers: number[];
}

export interface UnifiedDiff {
  raw: string;
  files: { path: string; additions: number; deletions: number; hunks: DiffHunk[] }[];
}

export interface BlameLine {
  line: number;
  sha: string;
  author: string;
  date: string;
  summary: string;
}

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface GitClient {
  clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }>;
  fetchPullHead(repo: RepoRef, n: number, signal?: AbortSignal): Promise<void>;
  currentHead(repo: RepoRef): Promise<string>;
  diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff>;
  /**
   * Diff two commit SHAs (`base...head`). Both must be full commit SHAs; either
   * is fetched when missing locally, and the clone is deepened until a merge-base
   * exists. Throws when a SHA is malformed or no merge-base is found within the
   * deepening cap. Aborting `signal` stops the running git process and the call
   * rejects with `signal.reason`; time spent waiting for the clone's lock counts
   * toward the signal.
   */
  diffCommits(
    repo: RepoRef,
    base: string,
    head: string,
    signal?: AbortSignal,
  ): Promise<UnifiedDiff>;
  blame(repo: RepoRef, path: string): Promise<BlameLine[]>;
  log(repo: RepoRef, path?: string): Promise<GitCommit[]>;
  readFile(repo: RepoRef, path: string): Promise<string>;
  /**
   * Read `path` as it existed at `ref` (a commit SHA), without checking that
   * commit out (`git show <ref>:<path>`). Used to fetch a linked doc/spec at
   * the PR's head so the intent classifier sees the version the PR actually
   * changed (spec 006).
   */
  readFileAt(repo: RepoRef, ref: string, path: string, signal?: AbortSignal): Promise<string>;
  clonePathFor(repo: RepoRef): string;
}

// ---------- CodeIndex (ripgrep + tree-sitter) ----------
export interface CodeMatch {
  path: string;
  line: number;
  text: string;
}

export interface CodeSymbol {
  path: string;
  name: string;
  kind: string;
  line: number;
}

export interface CodeReference {
  fromPath: string;
  toSymbol: string;
  line: number;
}

export interface CodeIndex {
  grep(repo: RepoRef, pattern: string): Promise<CodeMatch[]>;
  symbols(repo: RepoRef): Promise<CodeSymbol[]>;
  references(repo: RepoRef, symbol: string): Promise<CodeReference[]>;
}

// ---------- Auth (pluggable; MVP = LocalNoAuthProvider) ----------
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthWorkspace {
  id: string;
  name: string;
}

export interface AuthProvider {
  currentUser(req: unknown): Promise<AuthUser>;
  currentWorkspace(req: unknown): Promise<AuthWorkspace>;
}

// ---------- Secrets (pluggable; MVP = LocalSecretsProvider) ----------
export type SecretKey =
  | 'OPENAI_API_KEY'
  | 'ANTHROPIC_API_KEY'
  | 'GITHUB_TOKEN'
  | 'GITLAB_TOKEN'
  | 'DATABASE_URL'
  | (string & {});

export interface SecretsProvider {
  get(key: SecretKey): Promise<string | undefined>;
  /**
   * Persist a secret (BYO key entered via the UI). Optional — read-only
   * providers (e.g. the env-only MVP backend) may omit it.
   */
  set?(key: SecretKey, value: string): Promise<void>;
}
