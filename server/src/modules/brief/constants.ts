import type { BriefInput } from '@devdigest/shared';

/** Input-token budget of the one brief call (AC-11). */
export const BRIEF_INPUT_TOKEN_BUDGET = 8000;
/** Fixed estimate of the `response_format` schema cost, subtracted before fitting. */
export const SCHEMA_TOKEN_RESERVE = 800;
export const BRIEF_SCHEMA_NAME = 'pr_brief';
export const BRIEF_LLM_TIMEOUT_MS = 90_000;
export const BRIEF_MAX_OUTPUT_TOKENS = 2_000;

export const FOCUS_MAX = 6;
export const RISK_FILE_REFS_MAX = 5;

/** Caps applied to the blast-radius facts at collection (AC-44). */
export const BLAST_SYMBOLS_MAX = 30;
export const BLAST_ENDPOINTS_MAX = 20;
export const BLAST_CRONS_MAX = 20;

/** Groups cut first-to-last when the facts are over budget (AC-12). */
export const TRIM_ORDER = [
  'attached_specs',
  'linked_issue',
  'pr_description',
  'blast_callers',
  'blast_symbols',
  'review_findings',
  'changed_files',
] as const;
export type TrimGroup = (typeof TRIM_ORDER)[number];

/** The `missing_inputs` input each trim group is recorded under. */
export const TRIM_GROUP_INPUT: Record<TrimGroup, BriefInput> = {
  attached_specs: 'attached_specs',
  linked_issue: 'linked_issue',
  pr_description: 'pr_description',
  blast_callers: 'blast_radius',
  blast_symbols: 'blast_radius',
  review_findings: 'review_findings',
  changed_files: 'changed_files',
};
