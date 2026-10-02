import type { ConventionScanResult } from '@devdigest/shared';
import { cut } from './text.js';

export const CONVENTIONS_CAP = 30;

export interface AcceptedConvention {
  rule: string;
  category: string;
  file: string;
  line: number;
  confidence: number;
}

export interface ConciseConventions {
  scanned: boolean;
  accepted: AcceptedConvention[];
  pending_count: number;
}

/** Accepted rules only (highest confidence first, capped) plus how many still await review. */
export function acceptedConventions(result: ConventionScanResult): ConciseConventions {
  const accepted = result.candidates
    .filter((c) => c.status === 'accepted')
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, CONVENTIONS_CAP)
    .map((c) => ({
      rule: cut(c.rule),
      category: c.category,
      file: cut(c.evidence_path),
      line: c.evidence_line,
      confidence: c.confidence,
    }));
  return {
    scanned: result.scan !== null,
    accepted,
    pending_count: result.candidates.filter((c) => c.status === 'pending').length,
  };
}
