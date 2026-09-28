import { z } from 'zod';
import { Finding, Verdict } from './findings.js';
import {
  IntentClassification,
  IntentSource,
  MissingContext,
  SmartDiff,
} from './brief.js';
import { CostSource, PromptSection } from './trace.js';

/**
 * A2 — Review-Core API surface contracts. These extend the core
 * Review/Finding/Intent/SmartDiff contracts with the persisted/transport shapes
 * the reviewer endpoints return. A2 owns this file; the barrel re-exports it.
 *
 * Distinct from `Finding` (the raw LLM-output unit): `FindingRecord` adds the
 * persisted row identity + action timestamps so the UI can render accept/dismiss
 * state and the `review_id` it belongs to.
 */

export const FindingRecord = Finding.extend({
  review_id: z.string(),
  accepted_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
});
export type FindingRecord = z.infer<typeof FindingRecord>;

/** A persisted review with its kept findings + grounding summary. */
export const ReviewRecord = z.object({
  id: z.string(),
  pr_id: z.string(),
  agent_id: z.string().nullable(),
  run_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.enum(['summary', 'review']),
  verdict: Verdict.nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  model: z.string().nullable(),
  grounding: z.string().nullish(),
  created_at: z.string(),
  findings: z.array(FindingRecord),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

/**
 * Response of `POST /pulls/:id/review`. Each requested agent produces a run that
 * streams over SSE at `/runs/:runId/events`; clients subscribe per run. The
 * persisted reviews are also returned once the (synchronous) run completes.
 */
export const ReviewRunTarget = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type ReviewRunTarget = z.infer<typeof ReviewRunTarget>;

export const ReviewRunResponse = z.object({
  pr_id: z.string(),
  runs: z.array(ReviewRunTarget),
  reviews: z.array(ReviewRecord),
});
export type ReviewRunResponse = z.infer<typeof ReviewRunResponse>;

/**
 * Intent persisted for a PR (spec 006): the classifier's structured output
 * plus everything needed to show it and decide whether it is stale.
 * `stale`/`stale_reason` are derived at read time from `head_sha` and
 * `description_hash` against the PR's current row — they are never
 * persisted columns themselves.
 */
export const PrIntentRecord = IntentClassification.extend({
  pr_id: z.string(),
  head_sha: z.string().nullable(),
  description_hash: z.string().nullable(),
  stale: z.boolean(),
  stale_reason: z.enum(['head_moved', 'description_changed']).nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  sources: z.array(IntentSource),
  missing_context: z.array(MissingContext),
  composition: z.array(PromptSection),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  cost_source: CostSource.nullable(),
  classified_at: z.string(),
});
export type PrIntentRecord = z.infer<typeof PrIntentRecord>;

/** Response of `GET /pulls/:id/intent`. `pr_head_sha` is the PR's CURRENT
 * head, independent of the (possibly stale) record's own `head_sha`, so the
 * client can show staleness without a second round trip. */
export const PrIntentResponse = z.object({
  intent: PrIntentRecord.nullable(),
  pr_head_sha: z.string(),
});
export type PrIntentResponse = z.infer<typeof PrIntentResponse>;

/** Smart-diff response for a PR (the SmartDiff). */
export const SmartDiffResponse = SmartDiff;
export type SmartDiffResponse = z.infer<typeof SmartDiffResponse>;
