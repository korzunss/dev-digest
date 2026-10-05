import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

// 'imported_file' covers a skill uploaded as a .md file or a .zip archive.
// Every value but 'manual' means the body came from outside this workspace, so
// it lands disabled and carries a "needs vetting" badge until a human enables it
// (spec 003). The column is plain `text` with no CHECK, so adding a value here
// needs no migration.
export const SkillSource = z.enum([
  'manual',
  'imported_file',
  'imported_url',
  'extracted',
  'community',
]);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  // Rolled up by the LIST endpoint only (like PrMeta.score): the rail's card
  // footer needs them, a single skill read does not pay for the joins, and the
  // Stats tab fetches the full picture separately.
  agent_count: z.number().int().nullish(),
  // Share of completed runs in the window whose prompt included this skill,
  // and the accept rate of those runs' findings. Both nullish rather than 0 —
  // "never pulled" is a different statement from "pulled and never accepted".
  pull_rate: z.number().nullish(),
  accept_rate: z.number().nullish(),
});
export type Skill = z.infer<typeof Skill>;

/**
 * One immutable body snapshot from `skill_versions`. A version IS a body: only
 * a body change creates one, because the body is the thing that reaches the
 * prompt. Renaming a skill or toggling it does not.
 */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  /** What the author said changed. Optional — older versions carry none. */
  message: z.string().nullish(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/**
 * A project-context document attached to a skill, in prompt order.
 *
 * The link stores a PATH, not an id: context documents are files in the repo
 * clone and have no identity in the database. A workspace can hold several
 * repos, so an attached path may simply not exist in the repo of a given PR —
 * the run executor skips those and says so in the run log rather than failing.
 */
export const SkillContextLink = z.object({
  skill_id: z.string(),
  path: z.string(),
  order: z.number().int(),
});
export type SkillContextLink = z.infer<typeof SkillContextLink>;

/** A project-context document attached to an agent, in prompt order. */
export const AgentContextLink = z.object({
  agent_id: z.string(),
  path: z.string(),
  order: z.number().int(),
});
export type AgentContextLink = z.infer<typeof AgentContextLink>;

/** A document an agent receives through one of its enabled skills. */
export const InheritedContextDoc = z.object({
  path: z.string(),
  skill_id: z.string(),
  skill_name: z.string(),
});
export type InheritedContextDoc = z.infer<typeof InheritedContextDoc>;

export const AgentContext = z.object({
  links: z.array(AgentContextLink),
  inherited: z.array(InheritedContextDoc),
});
export type AgentContext = z.infer<typeof AgentContext>;

export const SkillContext = z.object({
  links: z.array(SkillContextLink),
  used_by_agents: z.number().int(),
});
export type SkillContext = z.infer<typeof SkillContext>;

/** One agent that has this skill attached — the Stats tab's "used by" list. */
export const SkillStatsAgent = z.object({ id: z.string(), name: z.string() });
export type SkillStatsAgent = z.infer<typeof SkillStatsAgent>;

/**
 * Per-skill usage figures.
 *
 * `agent_count` and `agents` are exact. Everything else is TRANSITIVE: it is
 * measured over the runs whose prompt contained this skill, which says the
 * skill was present when a finding appeared — not that it caused it. Nothing
 * attributes a finding to a skill, and asking the model to do so would change
 * the response contract (spec 003, "Not in scope"). The UI must label these as
 * correlation, and a skill with no runs in the window reports nulls, not zeros.
 */
export const SkillStats = z.object({
  skill_id: z.string(),
  agent_count: z.number().int(),
  agents: z.array(SkillStatsAgent),
  runs_with_skill: z.number().int(),
  runs_total: z.number().int(),
  pull_rate: z.number().nullable(),
  accept_rate: z.number().nullable(),
  findings_30d: z.number().int(),
  findings_by_category: z.record(z.string(), z.number().int()),
});
export type SkillStats = z.infer<typeof SkillStats>;

/**
 * The parsed core of an imported skill, returned by `POST /skills/import/preview`.
 * Nothing is persisted at preview time: the client holds this, shows it, and
 * posts it back to `POST /skills` only if the user confirms. `ignored` lists the
 * archive entries that were NOT processed — scripts and binaries are never
 * unpacked to disk and never executed, and showing them is how that becomes
 * visible rather than merely asserted.
 */
export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  source: SkillSource,
  ignored: z.array(z.string()),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
/**
 * The bucket a house rule falls into. A CLOSED set on purpose: the model picks
 * from it rather than inventing a label, so candidates from two different scans
 * group together and the "one skill per category" split is stable.
 */
export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'error-handling',
  'async',
  'data-access',
  'api',
  'testing',
  'tooling',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

/** Where a candidate stands with the human reviewing it. */
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

/**
 * One extracted house rule, AFTER the evidence gate.
 *
 * `evidence_path` + `evidence_line` are guaranteed to point at code that really
 * exists in the scanned commit — a candidate whose snippet could not be found in
 * the file it cited never becomes one of these (see the conventions module's
 * grounding step, which mirrors `groundFindings`). That is what makes the
 * GitHub deep-link on the card safe to render.
 */
export const ConventionCandidate = z.object({
  id: z.string(),
  repo_id: z.string(),
  scan_id: z.string(),
  rule: z.string(),
  category: ConventionCategory,
  evidence_path: z.string(),
  evidence_line: z.number().int(),
  evidence_end_line: z.number().int(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  /** The skill this candidate was folded into, once one was created. */
  skill_id: z.string().nullish(),
  created_at: z.string(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

/**
 * One extraction run. `commit_sha` is the point of the row: evidence links are
 * pinned to it, so a later push cannot slide a cited line out from under a card.
 * `sample_paths` records exactly what the model was shown, which is the only way
 * to tell "the repo has no such convention" from "we never showed it that file".
 */
export const ConventionScan = z.object({
  id: z.string(),
  repo_id: z.string(),
  commit_sha: z.string().nullable(),
  provider: z.string(),
  model: z.string(),
  sample_paths: z.array(z.string()),
  candidates_raw: z.number().int(),
  candidates_kept: z.number().int(),
  /** Per-reason drop tally from the evidence gate, e.g. `{ snippet_absent: 3 }`. */
  dropped: z.record(z.string(), z.number().int()).nullish(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  status: z.enum(['running', 'done', 'error']),
  error: z.string().nullish(),
  created_at: z.string(),
  finished_at: z.string().nullish(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

/** What `GET /repos/:id/conventions` and the extract route both return. */
export const ConventionScanResult = z.object({
  scan: ConventionScan.nullable(),
  candidates: z.array(ConventionCandidate),
});
export type ConventionScanResult = z.infer<typeof ConventionScanResult>;

/**
 * What a skill built from accepted candidates WOULD look like. Persisted by
 * nothing — the modal holds it, the user edits it, and only a confirmed preview
 * comes back as a create. Same contract shape as `SkillImportPreview` for the
 * same reason: abandoning the flow must leave no row behind.
 */
export const ConventionSkillPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  evidence_files: z.array(z.string()),
  /** Which candidates this preview was built from — echoed back on commit. */
  candidate_ids: z.array(z.string()),
});
export type ConventionSkillPreview = z.infer<typeof ConventionSkillPreview>;

// ---- Agents ----
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// ---- Onboarding tour ----
export const OnboardingUnavailableCause = z.enum(['language_not_indexed', 'index_failed', 'model_failed']);
export type OnboardingUnavailableCause = z.infer<typeof OnboardingUnavailableCause>;

/** Per-section availability. `reason` is a code the client maps to i18n copy. */
export const OnboardingAvailability = z.object({
  available: z.boolean(),
  cause: OnboardingUnavailableCause.nullable(),
  reason: z.string().nullable(),
});
export type OnboardingAvailability = z.infer<typeof OnboardingAvailability>;

export const OnboardingFileRow = z.object({
  path: z.string(),
  reason: z.string().nullable(),
  rank_position: z.number().int().nullable(),
  importers: z.number().int().nullable(),
  chain: z.array(z.string()),
});
export type OnboardingFileRow = z.infer<typeof OnboardingFileRow>;

export const OnboardingCommand = z.object({
  command: z.string(),
  note: z.string().nullable(),
});
export type OnboardingCommand = z.infer<typeof OnboardingCommand>;

export const OnboardingTask = z.object({
  title: z.string(),
  body: z.string(), // markdown
  files: z.array(z.string()),
});
export type OnboardingTask = z.infer<typeof OnboardingTask>;

export const OnboardingModel = z.object({
  provider: Provider,
  model: z.string(),
});
export type OnboardingModel = z.infer<typeof OnboardingModel>;

export const OnboardingTour = z.object({
  source: z.enum(['llm', 'skeleton']),
  built_sha: z.string().nullable(),
  generated_at: z.string().nullable(),
  index_files: z.number().int(),
  model: OnboardingModel.nullable(),
  architecture: z.object({
    availability: OnboardingAvailability,
    body: z.string(), // markdown
    diagram: z.string().nullable(), // mermaid — only the architecture section has one
    stack: z.array(z.string()),
    structure: z.array(z.string()),
  }),
  critical_paths: z.object({
    availability: OnboardingAvailability,
    rows: z.array(OnboardingFileRow),
  }),
  run_locally: z.object({
    availability: OnboardingAvailability,
    commands: z.array(OnboardingCommand),
  }),
  reading_path: z.object({
    availability: OnboardingAvailability,
    steps: z.array(OnboardingFileRow),
  }),
  first_tasks: z.object({
    availability: OnboardingAvailability,
    tasks: z.array(OnboardingTask),
  }),
});
export type OnboardingTour = z.infer<typeof OnboardingTour>;

export const OnboardingTourView = z.object({
  repo_id: z.string(),
  clone: z.object({
    state: z.enum(['none', 'cloning', 'ready', 'failed']),
    error: z.string().nullable(),
  }),
  index: z.object({
    status: z.enum(['full', 'partial', 'degraded', 'failed']),
    reason: z.string().nullable(),
    files_indexed: z.number().int(),
    source_files_total: z.number().int().nullable(),
    coverage_partial: z.boolean(),
    partial_cause: z.enum(['file_cap', 'parse_errors', 'graph_failed', 'soft_budget']).nullable(),
    last_indexed_sha: z.string(),
  }),
  model: OnboardingModel,
  generating: z.boolean(),
  stale: z.boolean(),
  last_failure: z
    .object({
      reason: z.enum(['no_key', 'no_model', 'timeout', 'invalid_output', 'provider_error']),
      message: z.string(),
      at: z.string(),
    })
    .nullable(),
  stored: z.boolean(),
  tour: OnboardingTour,
});
export type OnboardingTourView = z.infer<typeof OnboardingTourView>;
// ---- end Onboarding tour ----

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a CI review should BLOCK (REQUEST_CHANGES + fail the
// check) vs just comment. Deterministic from severities; acted on ONLY in CI.
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
  // How many skills are attached. Rolled up by the LIST endpoint only (like
  // PrMeta.score): a single agent read doesn't pay for the join, and the editor
  // reads the links themselves anyway.
  skill_count: z.number().int().nullish(),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;
