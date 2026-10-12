import { z } from 'zod';
import { Provider } from './knowledge.js';

/**
 * Eval pipeline (plan 34) — regression suites per agent.
 *
 * Own contract file: it does not touch the base `Eval*` shapes of `knowledge.ts`
 * and `eval-ci.ts` (those serve the skill/agent eval cases). A suite case is an
 * `EvalSuiteCase`; a run of the whole suite is an `EvalSuiteRun`.
 *
 * Metrics are nullable (never optional): `null` means "no data", not zero.
 */

// ===========================================================================
// Expectation + case input
// ===========================================================================

export const EvalExpectationKind = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationKind = z.infer<typeof EvalExpectationKind>;

/** One expected-output entry. `title`/`severity`/`category` are display-only. */
export const EvalExpectation = z
  .object({
    expect: EvalExpectationKind,
    file: z.string().min(1),
    start_line: z.number().int().min(1),
    end_line: z.number().int().min(1).optional(),
    title: z.string().optional(),
    severity: z.string().optional(),
    category: z.string().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.end_line !== undefined && v.start_line > v.end_line) {
      ctx.addIssue({
        code: 'custom',
        path: ['start_line'],
        message: 'start_line must not be greater than end_line',
      });
    }
  });
export type EvalExpectation = z.infer<typeof EvalExpectation>;

export const EvalPrMeta = z.object({
  repo_id: z.string().nullable(),
  repo: z.string(),
  pr_number: z.number().int(),
  title: z.string(),
  head_sha: z.string(),
});
export type EvalPrMeta = z.infer<typeof EvalPrMeta>;

export const EvalSuiteCaseInput = z.object({
  diff: z.string(),
  files: z.array(z.string()),
  pr_meta: EvalPrMeta.nullable(),
});
export type EvalSuiteCaseInput = z.infer<typeof EvalSuiteCaseInput>;

/** Where a case came from; every field is null for a hand-written case. */
export const EvalCaseSource = z.object({
  finding_id: z.string().nullable(),
  pr_id: z.string().nullable(),
  repo_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
});
export type EvalCaseSource = z.infer<typeof EvalCaseSource>;

// ===========================================================================
// Case result
// ===========================================================================

export const EvalCaseStatus = z.enum(['passed', 'failed', 'errored']);
export type EvalCaseStatus = z.infer<typeof EvalCaseStatus>;

export const EvalFindingBrief = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
  severity: z.string(),
});
export type EvalFindingBrief = z.infer<typeof EvalFindingBrief>;

export const EvalCaseResult = z.object({
  status: EvalCaseStatus,
  expected_count: z.number().int(),
  actual_count: z.number().int(),
  must_find_total: z.number().int(),
  must_find_matched: z.number().int(),
  noise: z.number().int(),
  kept: z.number().int(),
  dropped: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  error: z.string().nullable(),
  ran_at: z.string(),
  // Plan 35: a stored plan-34 result has neither `skill_version` nor `model`, so all
  // three are optional/nullish (it must still parse). A skill-case run carries
  // `skill_version`; an agent-case run carries `agent_version`.
  agent_version: z.number().int().optional(),
  skill_version: z.number().int().nullish(),
  model: z.string().nullish(),
  findings: z.array(EvalFindingBrief),
});
export type EvalCaseResult = z.infer<typeof EvalCaseResult>;

export const EvalSuiteCase = z.object({
  id: z.string(),
  // Exactly one owner is set (DB CHECK): an agent case or a skill case.
  agent_id: z.string().nullable(),
  skill_id: z.string().nullable(),
  name: z.string(),
  input: EvalSuiteCaseInput,
  expected: z.array(EvalExpectation),
  source: EvalCaseSource,
  created_at: z.string(),
  updated_at: z.string(),
  last_result: EvalCaseResult.nullable(),
});
export type EvalSuiteCase = z.infer<typeof EvalSuiteCase>;

// ===========================================================================
// Save / draft bodies
// ===========================================================================

export const EvalCaseSaveBody = z.object({
  name: z.string().min(1),
  input: z.object({ diff: z.string(), pr_meta: EvalPrMeta.nullish() }),
  expected_output: z.unknown(),
  source_finding_id: z.string().uuid().optional(),
  draft_run_token: z.string().optional(),
});
export type EvalCaseSaveBody = z.infer<typeof EvalCaseSaveBody>;

export const EvalDraft = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  provider: z.string(),
  model: z.string(),
  name: z.string(),
  input: EvalSuiteCaseInput,
  expected: z.array(EvalExpectation),
  source: EvalCaseSource,
  seeded_from: z.enum(['accepted', 'dismissed']),
});
export type EvalDraft = z.infer<typeof EvalDraft>;

export const EvalDraftSeed = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('draft'), draft: EvalDraft }),
  z.object({ kind: z.literal('existing'), case: EvalSuiteCase }),
]);
export type EvalDraftSeed = z.infer<typeof EvalDraftSeed>;

export const EvalDraftRunBody = z.object({
  input: z.object({ diff: z.string(), pr_meta: EvalPrMeta.nullish() }),
  expected_output: z.unknown(),
});
export type EvalDraftRunBody = z.infer<typeof EvalDraftRunBody>;

export const EvalDraftRunResult = z.object({
  result: EvalCaseResult,
  run_token: z.string(),
});
export type EvalDraftRunResult = z.infer<typeof EvalDraftRunResult>;

// ===========================================================================
// Suite runs
// ===========================================================================

const Metric = z.number().min(0).max(1).nullable();

export const EvalMetrics = z.object({
  recall: Metric,
  precision: Metric,
  citation_accuracy: Metric,
});
export type EvalMetrics = z.infer<typeof EvalMetrics>;

export const EvalSkillRef = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int(),
});
export type EvalSkillRef = z.infer<typeof EvalSkillRef>;

export const EvalSuiteRunStatus = z.enum(['running', 'completed', 'failed']);
export type EvalSuiteRunStatus = z.infer<typeof EvalSuiteRunStatus>;

export const EvalSuiteRun = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  agent_version: z.number().int(),
  provider: z.string(),
  model: z.string(),
  skills: z.array(EvalSkillRef),
  status: EvalSuiteRunStatus,
  started_at: z.string(),
  finished_at: z.string().nullable(),
  cases_total: z.number().int(),
  cases_done: z.number().int(),
  cases_passed: z.number().int(),
  cases_errored: z.number().int(),
  metrics: EvalMetrics,
  cost_usd: z.number().nullable(),
});
export type EvalSuiteRun = z.infer<typeof EvalSuiteRun>;

export const EvalSuiteRunDetail = EvalSuiteRun.extend({
  results: z.array(
    z.object({
      case_id: z.string().nullable(),
      case_name: z.string(),
      result: EvalCaseResult,
    }),
  ),
});
export type EvalSuiteRunDetail = z.infer<typeof EvalSuiteRunDetail>;

// ===========================================================================
// Trend, deltas, alert
// ===========================================================================

export const EvalSuiteTrendPoint = z.object({
  run_id: z.string(),
  started_at: z.string(),
  agent_version: z.number().int(),
  cost_usd: z.number().nullable(),
  metrics: EvalMetrics,
});
export type EvalSuiteTrendPoint = z.infer<typeof EvalSuiteTrendPoint>;

export const EvalMetricDeltas = z.object({
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
});
export type EvalMetricDeltas = z.infer<typeof EvalMetricDeltas>;

const MetricPoints = z.object({ metric: z.string(), points: z.number() });

export const EvalAlert = z.object({
  version: z.number().int(),
  dropped: z.array(MetricPoints),
  rose: z.array(MetricPoints),
});
export type EvalAlert = z.infer<typeof EvalAlert>;

export const EvalPeriod = z.enum(['30d', 'all']);
export type EvalPeriod = z.infer<typeof EvalPeriod>;

export const EvalAgentDetail = z.object({
  agent: z.object({
    id: z.string(),
    name: z.string(),
    provider: z.string(),
    model: z.string(),
    version: z.number().int(),
  }),
  cases_total: z.number().int(),
  runs_total: z.number().int(),
  latest: EvalSuiteRun.nullable(),
  deltas: EvalMetricDeltas,
  alert: EvalAlert.nullable(),
  // Only `trend` and `runs` follow the requested period.
  trend: z.array(EvalSuiteTrendPoint),
  runs: z.array(EvalSuiteRun),
});
export type EvalAgentDetail = z.infer<typeof EvalAgentDetail>;

// ===========================================================================
// Compare + promote
// ===========================================================================

export const EvalPromptDiffLine = z.object({
  op: z.enum(['add', 'del', 'same']),
  text: z.string(),
});
export type EvalPromptDiffLine = z.infer<typeof EvalPromptDiffLine>;

export const EvalCompare = z.object({
  older: EvalSuiteRun,
  newer: EvalSuiteRun,
  deltas: EvalMetricDeltas.extend({ cost_usd: z.number().nullable() }),
  same_version: z.boolean(),
  prompt_diff: z.array(EvalPromptDiffLine).nullable(),
  skills_diff: z.object({
    added: z.array(EvalSkillRef),
    removed: z.array(EvalSkillRef),
    changed: z.array(z.object({ name: z.string(), from: z.number().int(), to: z.number().int() })),
  }),
  same_skills: z.boolean(),
  promote: z
    .object({
      version: z.number().int(),
      restore: z.array(EvalSkillRef),
      missing: z.array(z.string()),
    })
    .nullable(),
});
export type EvalCompare = z.infer<typeof EvalCompare>;

export const EvalPromoteResult = z.object({
  agent_id: z.string(),
  version: z.number().int(),
});
export type EvalPromoteResult = z.infer<typeof EvalPromoteResult>;

// ===========================================================================
// Dashboard + run-all
// ===========================================================================

export const EvalDashboardAgent = z.object({
  agent_id: z.string(),
  name: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  cases_total: z.number().int(),
  latest: EvalSuiteRun.nullable(),
  // Recall per completed run, oldest first.
  sparkline: z.array(z.number()),
});
export type EvalDashboardAgent = z.infer<typeof EvalDashboardAgent>;

export const EvalDashboardView = z.object({
  agents: z.array(EvalDashboardAgent),
  recent_runs: z.array(EvalSuiteRun),
});
export type EvalDashboardView = z.infer<typeof EvalDashboardView>;

export const EvalRunAllSkipReason = z.enum(['run_in_progress', 'no_api_key']);
export type EvalRunAllSkipReason = z.infer<typeof EvalRunAllSkipReason>;

const EvalRunAllSkipped = z.object({
  agent_id: z.string(),
  name: z.string(),
  // The agent's provider id, so a `no_api_key` skip can name which key is missing.
  provider: z.string(),
  reason: EvalRunAllSkipReason,
});

// POST /eval/run-all starts paid runs for every agent. The required JSON body makes a
// cross-origin "simple" request (text/plain or form POST, no CORS preflight) fail validation.
export const EvalRunAllBody = z.object({ confirm: z.literal(true) });
export type EvalRunAllBody = z.infer<typeof EvalRunAllBody>;

export const EvalRunAllPreview = z.object({
  agents: z.array(
    z.object({
      agent_id: z.string(),
      name: z.string(),
      model: z.string(),
      cases: z.number().int(),
    }),
  ),
  total_cases: z.number().int(),
  skipped: z.array(EvalRunAllSkipped),
});
export type EvalRunAllPreview = z.infer<typeof EvalRunAllPreview>;

export const EvalRunAllResult = z.object({
  started: z.array(z.object({ agent_id: z.string(), run_id: z.string() })),
  skipped: z.array(EvalRunAllSkipped),
});
export type EvalRunAllResult = z.infer<typeof EvalRunAllResult>;

// ===========================================================================
// Skill suites (plan 35)
// ===========================================================================

/** The provider/model a skill case runs on (a skill has none of its own). */
export const EvalModelPick = z.object({
  provider: Provider,
  model: z.string().trim().min(1).max(200),
});
export type EvalModelPick = z.infer<typeof EvalModelPick>;

/** Single run of a saved case; the route makes the body optional (agent cases ignore it). */
export const EvalCaseRunBody = EvalModelPick;
export type EvalCaseRunBody = z.infer<typeof EvalCaseRunBody>;

export const EvalSkillDraftRunBody = EvalDraftRunBody.extend(EvalModelPick.shape);
export type EvalSkillDraftRunBody = z.infer<typeof EvalSkillDraftRunBody>;

// Paid run of the whole skill suite; the required body defeats a CORS "simple" POST.
export const EvalSkillRunBody = EvalModelPick.extend({ confirm: z.literal(true) });
export type EvalSkillRunBody = z.infer<typeof EvalSkillRunBody>;

export const EvalSkillRunState = z.object({
  skill: z.object({
    id: z.string(),
    name: z.string(),
    version: z.number().int(),
    enabled: z.boolean(),
  }),
  progress: z.object({ done: z.number().int(), total: z.number().int() }).nullable(),
  default_pick: EvalModelPick.nullable(),
});
export type EvalSkillRunState = z.infer<typeof EvalSkillRunState>;

export const EvalSkillRunAgentsBlocked = z.enum(['skill_disabled', 'no_agents']);
export type EvalSkillRunAgentsBlocked = z.infer<typeof EvalSkillRunAgentsBlocked>;

export const EvalSkillRunAgentsPreview = EvalRunAllPreview.extend({
  blocked: EvalSkillRunAgentsBlocked.nullable(),
});
export type EvalSkillRunAgentsPreview = z.infer<typeof EvalSkillRunAgentsPreview>;
