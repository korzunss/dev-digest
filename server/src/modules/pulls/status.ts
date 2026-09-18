import type { CostSource, PrStatus, SeverityCounts } from '@devdigest/shared';

/**
 * PR-list rollup helpers (pure — no DB / `this`, so they unit-test cleanly).
 *
 * The Pull Requests list shows, per PR: the latest review's SCORE, a FINDINGS
 * severity breakdown, and a review STATUS. The DB `status` column holds
 * GitHub's merge state (open/merged/closed); the review status
 * (needs_review / reviewed / stale) is DERIVED here for OPEN PRs from the
 * commit a review last ran against (`lastReviewedSha`) vs the PR head, plus age.
 */

/** Open PRs whose current head was reviewed but untouched this long read "stale". */
export const STALE_DAYS = 7;

/**
 * Tally finding severities (CRITICAL / WARNING / SUGGESTION) for one PR.
 *
 * The shape is on the wire as `PrMeta.findings` (spec 002), so the type comes
 * from `shared` rather than being declared here — one definition, not two.
 * Callers decide null-vs-zero: an empty row set tallies to all-zero, and only
 * the caller knows whether that means "reviewed and clean" or "never reviewed".
 */
export function rollupSeverities(rows: { severity: string }[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.critical += 1;
    else if (r.severity === 'WARNING') c.warning += 1;
    else if (r.severity === 'SUGGESTION') c.suggestion += 1;
  }
  return c;
}

/** What one PR's COST column shows: the sum, and how trustworthy it is. */
export interface CostRollup {
  cost_usd: number | null;
  cost_source: CostSource | null;
}

/**
 * Total cost of a PR's agent runs (spec 001) — the list's COST column.
 *
 * Two rules carry the whole design:
 *  - a run with no known price contributes NOTHING, and when no run has one the
 *    answer is `null` (rendered "—"), never `0` — `0` is a free model, not
 *    ignorance;
 *  - provenance is WORST-WINS: one estimated run makes the whole sum an
 *    estimate, so a `~` never gets dropped by aggregation.
 */
export function rollupCost(
  rows: { costUsd: number | null; costSource: string | null }[],
): CostRollup {
  let total: number | null = null;
  let source: CostSource | null = null;
  for (const r of rows) {
    if (r.costUsd == null) continue;
    total = (total ?? 0) + r.costUsd;
    if (r.costSource === 'estimate') source = 'estimate';
    else if (r.costSource === 'api' && source !== 'estimate') source = 'api';
  }
  return { cost_usd: total, cost_source: total == null ? null : source };
}

/**
 * Review-freshness status for the PR list. Merged/closed PRs keep their GitHub
 * merge state; open PRs map to:
 *  - `needs_review` — never reviewed, OR head moved since the last review
 *  - `stale`        — current head was reviewed but the PR is older than STALE_DAYS
 *  - `reviewed`     — current head reviewed and recent
 */
export function deriveReviewStatus(args: {
  /** DB `status` column = GitHub merge state (open/merged/closed). */
  ghStatus: string;
  lastReviewedSha: string | null;
  headSha: string;
  updatedAt: Date | null;
  now: number;
  staleDays?: number;
}): PrStatus {
  const { ghStatus, lastReviewedSha, headSha, updatedAt, now } = args;
  if (ghStatus === 'merged' || ghStatus === 'closed') return ghStatus as PrStatus;
  if (!lastReviewedSha || lastReviewedSha !== headSha) return 'needs_review';
  const staleMs = (args.staleDays ?? STALE_DAYS) * 86_400_000;
  if (updatedAt && now - updatedAt.getTime() > staleMs) return 'stale';
  return 'reviewed';
}
