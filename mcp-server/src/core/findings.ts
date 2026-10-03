import type { FindingRecord, ReviewRecord, Severity } from '@devdigest/shared';
import { cut, TEXT_MAX } from './text.js';

export const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const satisfies readonly Severity[];

// Compile-time: fails if `Severity` gains a member missing from SEVERITIES.
type _AllSeverities = Severity extends (typeof SEVERITIES)[number] ? true : never;
const _exhaustive: _AllSeverities = true;
void _exhaustive;

export const FINDINGS_CAP = 20;
export const RATIONALE_MAX = TEXT_MAX;

export interface ConciseFinding {
  severity: Severity;
  category: string;
  title: string;
  file: string;
  line: number;
  rationale: string;
}

export interface ConciseReview {
  agent: string | null;
  run_id: string | null;
  verdict: ReviewRecord['verdict'];
  score: number | null;
  total: number;
  returned: number;
  findings: ConciseFinding[];
}

/** Newest full review per agent, or the review of one run. Summary rows are ignored. */
export function latestReviews(
  reviews: ReviewRecord[],
  opts: { agentId?: string; runId?: string } = {},
): ReviewRecord[] {
  const full = reviews.filter((r) => r.kind === 'review');
  if (opts.runId !== undefined) return full.filter((r) => r.run_id === opts.runId);
  const newest = new Map<string, ReviewRecord>();
  for (const r of full) {
    const key = r.agent_id ?? '';
    if (opts.agentId !== undefined && key !== opts.agentId) continue;
    const cur = newest.get(key);
    if (!cur || r.created_at > cur.created_at) newest.set(key, r);
  }
  return [...newest.values()];
}

function toConcise(f: FindingRecord): ConciseFinding {
  return {
    severity: f.severity,
    category: cut(f.category),
    title: cut(f.title),
    file: cut(f.file),
    line: f.start_line,
    rationale: cut(f.rationale),
  };
}

/** Sorted by severity, dismissed dropped, capped; `total` counts everything that passed the filters. */
export function conciseReview(review: ReviewRecord, opts: { minSeverity?: Severity } = {}): ConciseReview {
  const limit = opts.minSeverity ? SEVERITIES.indexOf(opts.minSeverity) : SEVERITIES.length - 1;
  const kept = review.findings
    .filter((f) => !f.dismissed_at && SEVERITIES.indexOf(f.severity) <= limit)
    .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
  const findings = kept.slice(0, FINDINGS_CAP).map(toConcise);
  return {
    agent: review.agent_name ?? null,
    run_id: review.run_id,
    verdict: review.verdict,
    score: review.score,
    total: kept.length,
    returned: findings.length,
    findings,
  };
}
