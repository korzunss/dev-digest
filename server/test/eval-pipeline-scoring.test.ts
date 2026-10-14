import { describe, it, expect } from 'vitest';
import type { EvalExpectation, EvalMetrics } from '@devdigest/shared';
import {
  aggregateRun,
  findingMatches,
  linesIntersect,
  metricDeltas,
  regressionAlert,
  scoreCase,
  skillSetDiff,
  trendPoints,
} from '../src/modules/eval/pipeline-scoring.js';

const mf = (file: string, s: number, e?: number): EvalExpectation => ({
  expect: 'must_find',
  file,
  start_line: s,
  ...(e === undefined ? {} : { end_line: e }),
});
const mn = (file: string, s: number, e?: number): EvalExpectation => ({ ...mf(file, s, e), expect: 'must_not_flag' });
const f = (file: string, s: number, e = s) => ({ file, start_line: s, end_line: e });

describe('linesIntersect / findingMatches', () => {
  it('is inclusive at the edges and has no adjacency tolerance', () => {
    expect(findingMatches(f('a.ts', 10, 12), mf('a.ts', 13))).toBe(false);
    expect(findingMatches(f('a.ts', 12, 14), mf('a.ts', 13))).toBe(true);
    expect(findingMatches(f('a.ts', 13), mf('a.ts', 13))).toBe(true);
    expect(linesIntersect(1, 3, 3, 5)).toBe(true);
    expect(linesIntersect(5, 1, 6, 8)).toBe(false);
  });
  it('requires the same file', () => {
    expect(findingMatches(f('b.ts', 13), mf('a.ts', 13))).toBe(false);
  });
  it('ignores display fields', () => {
    const e = { ...mf('a.ts', 3), title: 'x', severity: 'high', category: 'bug' };
    expect(findingMatches(f('a.ts', 3), e)).toBe(true);
  });
});

describe('scoreCase', () => {
  it('passes when every must_find matched and nothing is noise', () => {
    const s = scoreCase({ expected: [mf('a.ts', 5)], kept: [f('a.ts', 4, 6)], droppedCount: 1 });
    expect(s).toMatchObject({ status: 'passed', must_find_total: 1, must_find_matched: 1, noise: 0, kept: 1, dropped: 1 });
  });
  it('fails on a missed must_find', () => {
    const s = scoreCase({ expected: [mf('a.ts', 5)], kept: [], droppedCount: 0 });
    expect(s.status).toBe('failed');
    expect(s.must_find_matched).toBe(0);
  });
  it('counts a finding on a must_not_flag as noise', () => {
    const s = scoreCase({ expected: [mn('a.ts', 5, 8)], kept: [f('a.ts', 8)], droppedCount: 0 });
    expect(s).toMatchObject({ status: 'failed', noise: 1 });
  });
  it('does not count a finding elsewhere as noise when expected has entries', () => {
    const s = scoreCase({ expected: [mf('a.ts', 5)], kept: [f('a.ts', 5), f('a.ts', 50)], droppedCount: 0 });
    expect(s).toMatchObject({ status: 'passed', noise: 0, actual_count: 2 });
  });
  it('treats every kept finding as noise when expected is empty', () => {
    expect(scoreCase({ expected: [], kept: [f('a.ts', 1), f('b.ts', 2)], droppedCount: 0 })).toMatchObject({
      status: 'failed',
      noise: 2,
      expected_count: 0,
    });
    expect(scoreCase({ expected: [], kept: [], droppedCount: 3 })).toMatchObject({ status: 'passed', dropped: 3 });
  });
});

describe('aggregateRun', () => {
  const pass = scoreCase({ expected: [mf('a.ts', 1)], kept: [f('a.ts', 1)], droppedCount: 1 });
  const fail = scoreCase({ expected: [mf('a.ts', 1), mn('a.ts', 9)], kept: [f('a.ts', 9)], droppedCount: 0 });

  it('computes recall, precision and citation over completed cases', () => {
    const r = aggregateRun([pass, fail], 0);
    expect(r.status).toBe('completed');
    expect(r.cases_passed).toBe(1);
  });

  it('uses the sums, not the mean of per-case ratios', () => {
    // pass: mustFind 1 matched 1 kept 1 dropped 1; fail: mustFind 1 matched 0 noise 1 kept 1
    const r = aggregateRun([pass, fail], 0);
    expect(r.metrics).toEqual({ recall: 0.5, precision: 0.5, citation_accuracy: 2 / 3 });
  });

  it('gives null for a zero denominator', () => {
    const empty = scoreCase({ expected: [], kept: [], droppedCount: 0 });
    expect(aggregateRun([empty], 0).metrics).toEqual({ recall: null, precision: null, citation_accuracy: null });
  });

  it('fails a run where every case errored, and ignores errored cases otherwise', () => {
    expect(aggregateRun([], 2)).toEqual({
      status: 'failed',
      metrics: { recall: null, precision: null, citation_accuracy: null },
      cases_passed: 0,
    });
    expect(aggregateRun([pass], 1).status).toBe('completed');
    expect(aggregateRun([], 0).status).toBe('completed');
  });
});

describe('metricDeltas / regressionAlert', () => {
  const m = (recall: number | null, precision: number | null, citation_accuracy: number | null): EvalMetrics => ({
    recall,
    precision,
    citation_accuracy,
  });

  it('subtracts per metric and gives null when a side is null', () => {
    const d = metricDeltas(m(0.5, null, 0.9), m(0.75, 0.5, 0.8));
    expect(d.recall).toBeCloseTo(-0.25);
    expect(d.precision).toBeNull();
    expect(d.citation_accuracy).toBeCloseTo(0.1);
    expect(metricDeltas(null, m(1, 1, 1))).toEqual({ recall: null, precision: null, citation_accuracy: null });
    expect(metricDeltas(m(1, 1, 1), null)).toEqual({ recall: null, precision: null, citation_accuracy: null });
  });

  it('alerts on a drop of at least one whole point and lists rises', () => {
    const a = regressionAlert(3, { recall: -0.25, precision: 0.1, citation_accuracy: null });
    expect(a).toEqual({ version: 3, dropped: [{ metric: 'recall', points: 25 }], rose: [{ metric: 'precision', points: 10 }] });
  });

  it('does not alert when the drop rounds to zero or nothing dropped', () => {
    expect(regressionAlert(1, { recall: -0.004, precision: 0, citation_accuracy: 0.2 })).toBeNull();
    expect(regressionAlert(1, { recall: -0.005, precision: null, citation_accuracy: null })).toBeNull();
    expect(regressionAlert(1, { recall: -0.0051, precision: null, citation_accuracy: null })).not.toBeNull();
  });
});

describe('skillSetDiff', () => {
  const s = (id: string, v: number) => ({ id, name: `n-${id}`, version: v });
  it('matches by id', () => {
    const d = skillSetDiff([s('a', 1), s('b', 1)], [s('b', 2), s('c', 1)]);
    expect(d.added).toEqual([s('c', 1)]);
    expect(d.removed).toEqual([s('a', 1)]);
    expect(d.changed).toEqual([{ name: 'n-b', from: 1, to: 2 }]);
  });
  it('is empty for identical sets', () => {
    expect(skillSetDiff([s('a', 1)], [s('a', 1)])).toEqual({ added: [], removed: [], changed: [] });
  });
});

describe('trendPoints', () => {
  const met: EvalMetrics = { recall: 1, precision: 1, citation_accuracy: 1 };
  it('keeps completed runs only, oldest first', () => {
    const pts = trendPoints([
      { id: 'b', startedAt: '2026-02-01T00:00:00Z', agentVersion: 2, costUsd: 0.2, status: 'completed', metrics: met },
      { id: 'x', startedAt: '2026-01-15T00:00:00Z', agentVersion: 1, costUsd: null, status: 'failed', metrics: met },
      { id: 'r', startedAt: '2026-03-01T00:00:00Z', agentVersion: 2, costUsd: null, status: 'running', metrics: met },
      { id: 'a', startedAt: '2026-01-01T00:00:00Z', agentVersion: 1, costUsd: 0.1, status: 'completed', metrics: met },
    ]);
    expect(pts.map((p) => p.run_id)).toEqual(['a', 'b']);
    expect(pts[0]).toEqual({ run_id: 'a', started_at: '2026-01-01T00:00:00Z', agent_version: 1, cost_usd: 0.1, metrics: met });
  });
});

describe('mutation survivors', () => {
  const met: EvalMetrics = { recall: 1, precision: 1, citation_accuracy: 1 };
  const run = (i: number, day: number) => ({
    id: `r${i}`,
    startedAt: `2026-01-${String(day + 1).padStart(2, '0')}T00:00:00Z`,
    agentVersion: 1,
    costUsd: null,
    status: 'completed' as const,
    metrics: met,
  });

  // Survivor 80 (`s.status === 'passed'` flipped to `!==` in aggregateRun): one passed and one
  // failed case give 1 either way, so the existing test could not tell. Two passed + one failed can.
  it('aggregateRun counts the passed cases, not the failed ones', () => {
    const pass = scoreCase({ expected: [mf('a.ts', 1)], kept: [f('a.ts', 1)], droppedCount: 0 });
    const fail = scoreCase({ expected: [mf('a.ts', 1), mn('a.ts', 9)], kept: [f('a.ts', 9)], droppedCount: 0 });
    expect(pass.status).toBe('passed');
    expect(fail.status).not.toBe('passed');
    expect(aggregateRun([pass, pass, fail], 0).cases_passed).toBe(2);
    expect(aggregateRun([fail, fail, pass], 0).cases_passed).toBe(1);
  });

  // Survivors 129 and 131 (`points > 0` replaced by `true` / `points >= 0`): a metric whose delta is
  // zero, or rounds to zero, is neither a drop nor a rise, so it must not be listed under `rose`.
  it('regressionAlert lists a rise only for a metric that rose by a whole point', () => {
    const a = regressionAlert(2, { recall: -0.25, precision: 0, citation_accuracy: 0.004 });
    expect(a).toEqual({ version: 2, dropped: [{ metric: 'recall', points: 25 }], rose: [] });
    const b = regressionAlert(2, { recall: -0.25, precision: 0.01, citation_accuracy: 0.0049 });
    expect(b?.rose).toEqual([{ metric: 'precision', points: 1 }]);
  });

  // Survivors 176-179 (the `startedAt > ...` half of the trendPoints comparator) are equivalent
  // mutants: V8's stable sort acts only on `order < 0`, so 0, 1, true, false give the same order
  // (checked for 2..1000 elements, 2..10 distinct keys). These two tests pin the observable
  // contract the comparator must keep: ascending time, input order kept on ties.
  it('trendPoints orders a long scrambled list by time and keeps input order on equal times', () => {
    const runs = Array.from({ length: 200 }, (_, i) => run(i, (i * 37) % 10));
    const expected = runs
      .map((r, i) => ({ r, i }))
      .sort((x, y) => (x.r.startedAt === y.r.startedAt ? x.i - y.i : x.r.startedAt < y.r.startedAt ? -1 : 1))
      .map((x) => x.r.id);
    expect(trendPoints(runs).map((p) => p.run_id)).toEqual(expected);
  });

  it('trendPoints sorts a strictly descending list ascending', () => {
    const runs = Array.from({ length: 60 }, (_, i) => run(i, 59 - i)).map((r, i) => ({
      ...r,
      startedAt: new Date(Date.UTC(2026, 0, 1) + (59 - i) * 86_400_000).toISOString(),
    }));
    const ids = trendPoints(runs).map((p) => p.run_id);
    expect(ids).toEqual(runs.map((r) => r.id).reverse());
  });
});
