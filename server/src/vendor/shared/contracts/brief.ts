import { z } from 'zod';
import { CostSource } from './trace.js';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

/** Confidence the classifier has in its own output (spec 006). */
export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

/** What kind of source fed the intent classifier. */
export const IntentSourceKind = z.enum([
  'pr_title',
  'pr_description',
  'linked_issue',
  'linked_doc',
  'external_link',
  'file_list',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

/** Whether a source was actually read (`ok`), attempted and failed
 * (`failed`), or deliberately not fetched (`unsupported`, e.g. non-forge
 * links per spec 006 D3). */
export const IntentSourceStatus = z.enum(['ok', 'failed', 'unsupported']);
export type IntentSourceStatus = z.infer<typeof IntentSourceStatus>;

/** One source the classifier drew on (or tried to). `ref` is redacted —
 * never a raw URL with credentials/query. */
export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string(),
  status: IntentSourceStatus,
  reason: z.string().nullish(),
  chars: z.number().int().nullish(),
});
export type IntentSource = z.infer<typeof IntentSource>;

/** A source that could not be read, surfaced to the user as a warning. */
export const MissingContext = z.object({
  kind: IntentSourceKind,
  ref: z.string(),
  reason: z.string(),
});
export type MissingContext = z.infer<typeof MissingContext>;

/** The classifier's structured output: Intent plus its own confidence. */
export const IntentClassification = Intent.extend({
  confidence: IntentConfidence,
});
export type IntentClassification = z.infer<typeof IntentClassification>;

// ---- Blast radius ----
export const DegradedReason = z.enum([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
]);
export type DegradedReason = z.infer<typeof DegradedReason>;

export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
  /** Declaring file's file_rank; 0 when degraded. */
  rank: z.number(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
  depth: z.number().int().min(1),
  /** Depth-1 caller name a depth-2 caller reaches through; null at depth 1. */
  via: z.string().nullable(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
  rank: z.number(),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
  degraded: z.boolean(),
  reason: DegradedReason.nullable(),
  limits: z.object({
    callers_per_symbol: z.number().int(),
    depth: z.number().int(),
  }),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  status: z.enum(['ok', 'unsupported', 'unavailable']),
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
// declaration order = display order
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
/** An input the brief generator draws on. */
export const BriefInput = z.enum([
  'intent',
  'blast_radius',
  'review_findings',
  'linked_issue',
  'attached_specs',
  'pr_description',
  'changed_files',
]);
export type BriefInput = z.infer<typeof BriefInput>;

/** How an input fell short of full: absent, partly read, cut to fit the
 * token budget, or older than the PR head. */
export const BriefInputStatus = z.enum(['missing', 'partial', 'truncated', 'stale']);
export type BriefInputStatus = z.infer<typeof BriefInputStatus>;

export const BriefMissingInput = z.object({
  input: BriefInput,
  status: BriefInputStatus,
  ref: z.string().nullable(),
  reason: z.string().nullable(),
});
export type BriefMissingInput = z.infer<typeof BriefMissingInput>;

export const ReviewFocusItem = z.object({
  file: z.string(),
  line: z.number().int(),
  reason: z.string(),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

export const BriefModel = z.object({
  provider: z.string(),
  model: z.string(),
});
export type BriefModel = z.infer<typeof BriefModel>;

/** What the model is asked to produce (no refinements: provider schemas). */
export const PrBriefModelOutput = z.object({
  summary: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(ReviewFocusItem),
});
export type PrBriefModelOutput = z.infer<typeof PrBriefModelOutput>;

/** Usage of the brief's own model call; every value nullable (AC-49). */
export const BriefUsage = z.object({
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  cost_source: CostSource.nullable(),
});
export type BriefUsage = z.infer<typeof BriefUsage>;

/** The stored brief. `intent`/`blast`/`history` are legacy and never written:
 * the cards read live data. */
export const PrBrief = z.object({
  summary: z.string(),
  risks: Risks,
  review_focus: z.array(ReviewFocusItem),
  missing_inputs: z.array(BriefMissingInput),
  head_sha: z.string(),
  generated_at: z.string(),
  model: BriefModel,
  /** Absent on rows stored before the usage field existed. */
  usage: BriefUsage.optional(),
  intent: Intent.optional(),
  blast: BlastRadius.optional(),
  history: PrHistory.optional(),
});
export type PrBrief = z.infer<typeof PrBrief>;

export const BriefFailureReason = z.enum(['no_key', 'over_budget', 'failed', 'in_progress']);
export type BriefFailureReason = z.infer<typeof BriefFailureReason>;

/** What GET/POST /pulls/:id/brief serve. */
export const PrBriefView = z.object({
  pr_id: z.string(),
  pr_head_sha: z.string(),
  brief: PrBrief.nullable(),
  stale: z.boolean(),
  generating: z.boolean(),
  failure: BriefFailureReason.nullable(),
});
export type PrBriefView = z.infer<typeof PrBriefView>;
