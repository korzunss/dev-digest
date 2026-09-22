/**
 * Internal types for the conventions extractor. The wire DTOs live in
 * `@devdigest/shared` (`ConventionCandidate`, `ConventionScan`, …); these are
 * the shapes the module's pure stages hand to each other.
 */
import type { ConventionCategory } from '@devdigest/shared';

/** One sampled file, already read, capped and split into lines. */
export interface SampleFile {
  /** Repo-relative path, POSIX separators. */
  path: string;
  /** The (possibly truncated) text actually shown to the model. */
  text: string;
  /** `text` split on newlines — index 0 is line 1. */
  lines: string[];
  /** True when the file was cut by MAX_SAMPLE_BYTES / MAX_SAMPLE_LINES. */
  truncated: boolean;
}

/** What the model proposes, before any verification. Mirrors the LLM schema. */
export interface RawCandidate {
  category: ConventionCategory;
  rule: string;
  evidence_path: string;
  evidence_line: number;
  evidence_snippet: string;
  confidence: number;
}

/** A candidate that survived the evidence gate, with its line CORRECTED. */
export interface GroundedCandidate extends RawCandidate {
  /** Last line of the cited snippet (>= evidence_line). */
  evidence_end_line: number;
  /** Stable identity across scans — normalised rule + path. */
  fingerprint: string;
}

/**
 * Why a candidate was dropped. Kept as a closed set so the tally persisted on
 * the scan is comparable between runs rather than a bag of free-text reasons.
 */
export type DropReason =
  | 'unsampled_file'
  | 'snippet_absent'
  | 'empty_rule'
  | 'duplicate';

/** The gate's verdict over one model response. */
export interface GroundingResult {
  kept: GroundedCandidate[];
  /** How many the model proposed, before the gate. */
  raw: number;
  /** Per-reason counts; reasons with no drops are omitted. */
  dropped: Partial<Record<DropReason, number>>;
}
