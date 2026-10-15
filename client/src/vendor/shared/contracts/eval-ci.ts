import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import { EvalRun, EvalOwnerKind, Conformance, Provider, CiFailOn } from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalRunRecord),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** Events the generated workflow reacts to (`on.pull_request.types`). */
export const CiTrigger = z.enum(['opened', 'synchronize', 'reopened']);
export type CiTrigger = z.infer<typeof CiTrigger>;

/** Where the runner posts its review. */
export const CiPostAs = z.enum(['github_review', 'pr_comment', 'none']);
export type CiPostAs = z.infer<typeof CiPostAs>;

/** Outcome of one CI run. `running` is never stored (it is an in-flight state only). */
export const CiRunStatus = z.enum(['passed', 'gate_failed', 'error']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/** Version of the `AgentManifest` format written to `.devdigest/agents/<slug>.yaml`. */
export const AGENT_MANIFEST_SCHEMA_VERSION = 1;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`CiService.agentYaml`) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  schema_version: z.literal(AGENT_MANIFEST_SCHEMA_VERSION),
  /** The agent version this manifest was exported from. */
  agent_version: z.number().int().min(1),
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Why an export / install is refused. */
export const CiInstallErrorCode = z.enum([
  'provider_not_openrouter',
  'manifest_invalid',
  'workflow_invalid',
  'token_missing',
  'missing_workflow_permission',
  'branch_protected',
  'foreign_commits',
  'branch_moved',
  'repo_not_github',
  'repo_has_other_agent',
]);
export type CiInstallErrorCode = z.infer<typeof CiInstallErrorCode>;

/** Request body for `POST /agents/:id/ci/preview`. */
export const CiPreviewInput = z.object({
  repo_id: z.string().uuid(),
  triggers: z.array(CiTrigger).min(1).max(3),
  post_as: CiPostAs,
});
export type CiPreviewInput = z.infer<typeof CiPreviewInput>;

/** Request body for `POST /agents/:id/ci/install` (preview + mode + edited workflow). */
export const CiInstallInput = CiPreviewInput.extend({
  mode: z.enum(['open_pr', 'zip']),
  /** The (possibly edited) workflow file; omitted → the generated one. */
  workflow: z.string().max(65_536).optional(),
});
export type CiInstallInput = z.infer<typeof CiInstallInput>;

/** Request body for `POST /agents/:id/ci/validate-workflow`. */
export const CiValidateWorkflowInput = z.object({
  workflow: z.string().max(65_536),
  triggers: z.array(CiTrigger).min(1).max(3),
  post_as: CiPostAs,
});
export type CiValidateWorkflowInput = z.infer<typeof CiValidateWorkflowInput>;

/** Response of `POST /agents/:id/ci/preview`. */
export const CiPreview = z.object({
  files: z.array(CiFile),
  file_count: z.number().int(),
  /** Set when this agent is already installed on the repo (re-export updates it). */
  existing_installation_id: z.string().nullable(),
  blocked: z
    .object({
      code: CiInstallErrorCode,
      message: z.string(),
      field: z.string().optional(),
    })
    .nullable(),
});
export type CiPreview = z.infer<typeof CiPreview>;

const CiWorkflowIssue = z.object({
  invariant: z.string(),
  message: z.string(),
  line: z.number().int().optional(),
});

/** Response of `POST /agents/:id/ci/validate-workflow`. */
export const CiWorkflowCheck = z.object({
  errors: z.array(CiWorkflowIssue),
  warnings: z.array(CiWorkflowIssue),
});
export type CiWorkflowCheck = z.infer<typeof CiWorkflowCheck>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  /** Full name, `owner/name`. */
  repo: z.string(),
  repo_id: z.string().nullable(),
  target_type: CiTarget,
  mode: z.enum(['pr', 'manual']),
  exported_agent_version: z.number().int().nullable(),
  exported_ci_fail_on: CiFailOn.nullable(),
  workflow_version: z.number().int().nullable(),
  runner_version: z.string().nullable(),
  triggers: z.array(CiTrigger),
  post_as: CiPostAs,
  pr_number: z.number().int().nullable(),
  pr_url: z.string().nullable(),
  installed_at: z.string(),
  updated_at: z.string(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** An installation plus the state the CI tab derives for it. */
export const CiInstallationView = CiInstallation.extend({
  pr_state: z.enum(['open', 'merged', 'closed', 'unknown', 'none']),
  state: z.enum(['active', 'pending_merge', 'inactive']),
  out_of_date: z.boolean(),
  gate_drift: z.boolean(),
  latest_run: z.object({ status: CiRunStatus, ran_at: z.string() }).nullable(),
});
export type CiInstallationView = z.infer<typeof CiInstallationView>;

/** Response of `POST /agents/:id/ci/install`. */
export const CiInstallResult = z.object({
  installation: CiInstallation,
  pr_url: z.string().nullable(),
  /** Base64 zip of the files, set for `mode: 'zip'`. */
  zip_base64: z.string().nullable(),
});
export type CiInstallResult = z.infer<typeof CiInstallResult>;

/** A CI run as listed on the CI Runs page / in the CI tab. */
export const CiRunView = z.object({
  id: z.string(),
  repo: z.string(),
  pr_number: z.number().int().nullable(),
  /** Set when the PR is also tracked locally (links to the studio PR page). */
  local_pr: z.object({ repo_id: z.string(), number: z.number().int() }).nullable(),
  agent_id: z.string().nullable(),
  agent_name: z.string(),
  agent_deleted: z.boolean(),
  verdict: Verdict.nullable(),
  status: CiRunStatus,
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  ran_at: z.string(),
  job_url: z.string().nullable(),
});
export type CiRunView = z.infer<typeof CiRunView>;

/** Query of `GET /ci/runs`. */
export const CiRunsQuery = z.object({
  since: z.string().max(40).optional(),
  agent_id: z.string().uuid().optional(),
  repo: z.string().max(200).optional(),
  status: CiRunStatus.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type CiRunsQuery = z.infer<typeof CiRunsQuery>;

/** Response of `GET /ci/runs` (keyset paging on `next_cursor`). */
export const CiRunsPage = z.object({
  items: z.array(CiRunView),
  next_cursor: z.string().nullable(),
});
export type CiRunsPage = z.infer<typeof CiRunsPage>;

/** Request body of `POST /ci/refresh` — an object, so a bodyless cross-site POST is refused. */
export const CiRefreshInput = z.object({
  /** Refresh one agent's installations; `null` refreshes the whole workspace. */
  agent_id: z.string().uuid().nullable(),
});
export type CiRefreshInput = z.infer<typeof CiRefreshInput>;

/** Response of `POST /ci/refresh`. */
export const CiRefreshResult = z.object({
  recorded: z.number().int(),
  rejected: z.array(
    z.object({ repo: z.string(), run_id: z.string(), reason: z.string() }),
  ),
  errors: z.array(z.object({ repo: z.string(), message: z.string() })),
});
export type CiRefreshResult = z.infer<typeof CiRefreshResult>;

/**
 * The artifact uploaded by the CI runner (`devdigest-result.json`, v1).
 * Ingested back on refresh to populate `ci_runs`. Counts only — finding
 * bodies live in the GitHub review. Identity (repo, PR, job) never comes
 * from here: the studio reads those from GitHub metadata.
 */
export const CiResultArtifact = z
  .object({
    schema_version: z.literal(1),
    status: CiRunStatus,
    verdict: Verdict.nullable(),
    gate_tripped: z.boolean(),
    findings_count: z.number().int().min(0),
    critical: z.number().int().min(0),
    warning: z.number().int().min(0),
    suggestion: z.number().int().min(0),
    cost_usd: z.number().nullable(),
    duration_ms: z.number().int().min(0),
    tokens_in: z.number().int().min(0),
    tokens_out: z.number().int().min(0),
    manifest_schema_version: z.number().int(),
    agent_name: z.string().max(200),
    agent_version: z.number().int(),
    model: z.string().max(200),
    runner_version: z.string().max(50),
    deps: z.record(z.string(), z.string()),
    node_version: z.string().max(50),
    commit_sha: z.string().regex(/^[0-9a-f]{40}$/),
    run_id: z.number().int(),
    run_attempt: z.number().int().min(1),
    error_class: z.string().max(100).nullable(),
  })
  .strict();
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
