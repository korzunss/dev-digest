import type {
  EvalAlert,
  EvalExpectation,
  EvalMetricDeltas,
  EvalMetrics,
  EvalSkillRef,
  EvalSuiteTrendPoint,
} from '@devdigest/shared';

/**
 * Code-only scoring for suite cases (plan 34, D4-A). Pure: no clock, no random,
 * no I/O. Matching uses only file + line range; display fields on an
 * expectation (`title`, `severity`, `category`) are never read.
 */

/** A kept (grounded) finding, reduced to what matching needs. */
export interface ScoredFinding {
  file: string;
  start_line: number;
  end_line: number;
}

export interface CaseScore {
  status: 'passed' | 'failed';
  expected_count: number;
  actual_count: number;
  must_find_total: number;
  must_find_matched: number;
  noise: number;
  kept: number;
  dropped: number;
}

/** Inclusive range overlap; the ends of either range may come in any order. */
export function linesIntersect(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  const aLo = Math.min(aStart, aEnd);
  const aHi = Math.max(aStart, aEnd);
  const bLo = Math.min(bStart, bEnd);
  const bHi = Math.max(bStart, bEnd);
  return aLo <= bHi && bLo <= aHi;
}

/** Same path, and the finding's lines intersect the expectation's lines. */
export function findingMatches(finding: ScoredFinding, expectation: EvalExpectation): boolean {
  if (finding.file !== expectation.file) return false;
  return linesIntersect(
    finding.start_line,
    finding.end_line,
    expectation.start_line,
    expectation.end_line ?? expectation.start_line,
  );
}

export function scoreCase(input: {
  expected: readonly EvalExpectation[];
  kept: readonly ScoredFinding[];
  droppedCount: number;
}): CaseScore {
  const { expected, kept, droppedCount } = input;
  const mustFind = expected.filter((e) => e.expect === 'must_find');
  const mustNot = expected.filter((e) => e.expect === 'must_not_flag');

  const matched = mustFind.filter((e) => kept.some((f) => findingMatches(f, e))).length;
  const noise =
    expected.length === 0
      ? kept.length
      : kept.filter((f) => mustNot.some((e) => findingMatches(f, e))).length;

  return {
    status: matched === mustFind.length && noise === 0 ? 'passed' : 'failed',
    expected_count: expected.length,
    actual_count: kept.length,
    must_find_total: mustFind.length,
    must_find_matched: matched,
    noise,
    kept: kept.length,
    dropped: droppedCount,
  };
}

export interface RunAggregate {
  status: 'completed' | 'failed';
  metrics: EvalMetrics;
  cases_passed: number;
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

/**
 * Run metrics over the completed (non-errored) cases. A zero denominator is
 * `null`, never 0. A run whose every case errored is `failed` with no metrics.
 */
export function aggregateRun(scores: readonly CaseScore[], erroredCount: number): RunAggregate {
  if (scores.length === 0 && erroredCount > 0) {
    return {
      status: 'failed',
      metrics: { recall: null, precision: null, citation_accuracy: null },
      cases_passed: 0,
    };
  }
  let mustFind = 0;
  let matched = 0;
  let noise = 0;
  let kept = 0;
  let dropped = 0;
  let passed = 0;
  for (const s of scores) {
    mustFind += s.must_find_total;
    matched += s.must_find_matched;
    noise += s.noise;
    kept += s.kept;
    dropped += s.dropped;
    if (s.status === 'passed') passed += 1;
  }
  const noiseShare = ratio(noise, kept);
  return {
    status: 'completed',
    metrics: {
      recall: ratio(matched, mustFind),
      precision: noiseShare === null ? null : 1 - noiseShare,
      citation_accuracy: ratio(kept, kept + dropped),
    },
    cases_passed: passed,
  };
}

const delta = (cur: number | null, prev: number | null): number | null =>
  cur === null || prev === null ? null : cur - prev;

/** Latest minus previous completed run; either side null gives null. */
export function metricDeltas(latest: EvalMetrics | null, previous: EvalMetrics | null): EvalMetricDeltas {
  return {
    recall: delta(latest?.recall ?? null, previous?.recall ?? null),
    precision: delta(latest?.precision ?? null, previous?.precision ?? null),
    citation_accuracy: delta(latest?.citation_accuracy ?? null, previous?.citation_accuracy ?? null),
  };
}

const METRIC_KEYS = ['recall', 'precision', 'citation_accuracy'] as const;

/**
 * Alert when any metric fell by at least one whole percentage point
 * (`Math.round(Δ × 100) < 0`). `points` are positive whole points.
 */
export function regressionAlert(version: number, deltas: EvalMetricDeltas): EvalAlert | null {
  const dropped: EvalAlert['dropped'] = [];
  const rose: EvalAlert['rose'] = [];
  for (const metric of METRIC_KEYS) {
    const d = deltas[metric];
    if (d === null) continue;
    const points = Math.round(d * 100);
    if (points < 0) dropped.push({ metric, points: -points });
    else if (points > 0) rose.push({ metric, points });
  }
  return dropped.length > 0 ? { version, dropped, rose } : null;
}

/** Skills matched by `id`; a version change is `changed`. */
export function skillSetDiff(
  older: readonly EvalSkillRef[],
  newer: readonly EvalSkillRef[],
): {
  added: EvalSkillRef[];
  removed: EvalSkillRef[];
  changed: { name: string; from: number; to: number }[];
} {
  const olderById = new Map(older.map((s) => [s.id, s]));
  const newerById = new Map(newer.map((s) => [s.id, s]));
  const added = newer.filter((s) => !olderById.has(s.id));
  const removed = older.filter((s) => !newerById.has(s.id));
  const changed: { name: string; from: number; to: number }[] = [];
  for (const n of newer) {
    const o = olderById.get(n.id);
    if (o && o.version !== n.version) changed.push({ name: n.name, from: o.version, to: n.version });
  }
  return { added, removed, changed };
}

export interface TrendRunInput {
  id: string;
  startedAt: string;
  agentVersion: number;
  costUsd: number | null;
  status: 'running' | 'completed' | 'failed';
  metrics: EvalMetrics;
}

/** Completed runs only, oldest first. A failed or running run gives no point. */
export function trendPoints(runs: readonly TrendRunInput[]): EvalSuiteTrendPoint[] {
  return runs
    .filter((r) => r.status === 'completed')
    .slice()
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0))
    .map((r) => ({
      run_id: r.id,
      started_at: r.startedAt,
      agent_version: r.agentVersion,
      cost_usd: r.costUsd,
      metrics: r.metrics,
    }));
}
