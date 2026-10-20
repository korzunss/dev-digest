import { describe, expect, it } from 'vitest';
import type { PerfRow } from '@devdigest/shared/contracts/agent-performance.js';
import {
  acceptRate,
  decodeCursor,
  encodeCursor,
  pickMostActive,
  recentSummary,
  resolveWindow,
  sumAggregates,
  sumDecisions,
  toFigures,
  toPrevious,
} from '../src/modules/agent-performance/helpers.js';
import type { AggregateRow, RecentRunRow } from '../src/modules/agent-performance/types.js';
import { ValidationError } from '../src/platform/errors.js';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const H = 3_600_000;
const D = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();

function agg(over: Partial<AggregateRow> = {}): AggregateRow {
  return {
    agentId: 'a',
    doneRuns: 0,
    notCountedRuns: 0,
    costKnownRuns: 0,
    costApiUsd: 0,
    costEstimateUsd: 0,
    costUnrecordedUsd: 0,
    durationKnownRuns: 0,
    durationSumMs: 0,
    lastRunAt: null,
    ...over,
  };
}

describe('resolveWindow (AC-4, AC-5)', () => {
  const q = (period: '1d' | '30d' | 'custom', from: number, to: number) => ({
    period,
    from: iso(from),
    to: iso(to),
  });
  const now = NOW.getTime();

  it('accepts a rolling 1d and 30d window and gives the equal-length previous window (AC-5)', () => {
    const w = resolveWindow(q('1d', now - D, now), NOW);
    expect(w.unit).toBe('hour');
    expect(w.previousTo.getTime()).toBe(now - D);
    expect(w.previousFrom.getTime()).toBe(now - 2 * D);
    const m = resolveWindow(q('30d', now - 30 * D, now), NOW);
    expect(m.unit).toBe('day');
    expect(m.previousFrom.getTime()).toBe(now - 60 * D);
  });

  it('rejects a reversed or empty range', () => {
    expect(() => resolveWindow(q('custom', now, now - D), NOW)).toThrow(ValidationError);
    expect(() => resolveWindow(q('custom', now - D, now - D), NOW)).toThrow(ValidationError);
  });

  it('rejects an end in the future beyond the clock skew, tolerates the skew', () => {
    expect(() => resolveWindow(q('custom', now - D, now + 5 * 60_000), NOW)).toThrow(ValidationError);
    expect(() => resolveWindow(q('custom', now - D, now + 30_000), NOW)).not.toThrow();
  });

  it('rejects a 1d / 30d whose length is wrong', () => {
    expect(() => resolveWindow(q('1d', now - 2 * D, now), NOW)).toThrow(ValidationError);
    expect(() => resolveWindow(q('30d', now - 7 * D, now), NOW)).toThrow(ValidationError);
  });

  it('rejects a custom range over 365 days, accepts 365 days and a DST hour', () => {
    expect(() => resolveWindow(q('custom', now - 366 * D, now), NOW)).toThrow(ValidationError);
    expect(() => resolveWindow(q('custom', now - 365 * D - H, now), NOW)).not.toThrow();
  });

  it('rejects an unparsable instant', () => {
    expect(() => resolveWindow({ period: 'custom', from: 'nope', to: iso(now) }, NOW)).toThrow(ValidationError);
  });
});

describe('acceptRate and figures (M-7, M-8, M-10)', () => {
  it('is null at 0 decisions and a share otherwise', () => {
    expect(acceptRate(0, 0)).toBeNull();
    expect(acceptRate(3, 1)).toBe(0.75);
    expect(acceptRate(0, 4)).toBe(0);
  });

  it('pools accept rate: pooled is not the mean of per-agent rates (M-10)', () => {
    const a = { agentId: 'a', accepted: 1, dismissed: 0 }; // 100 %
    const b = { agentId: 'b', accepted: 1, dismissed: 9 }; // 10 %
    const pooled = sumDecisions([a, b]);
    expect(acceptRate(pooled.accepted, pooled.dismissed)).toBe(2 / 11);
    expect(acceptRate(pooled.accepted, pooled.dismissed)).not.toBe((1 + 0.1) / 2);
  });

  it('gives null rates, null cost and zero runs for an empty scope (no NaN)', () => {
    const f = toFigures(undefined, undefined);
    expect(f.runs).toBe(0);
    expect(f.total_cost_usd).toBeNull();
    expect(f.avg_cost_usd).toBeNull();
    expect(f.avg_duration_ms).toBeNull();
    expect(f.accept_rate).toBeNull();
    expect(f.last_run_at).toBeNull();
  });

  it('computes cost, averages, split and unknown-cost count (M-3..M-6)', () => {
    const f = toFigures(
      agg({
        doneRuns: 4,
        notCountedRuns: 2,
        costKnownRuns: 3,
        costApiUsd: 0.3,
        costEstimateUsd: 0.2,
        costUnrecordedUsd: 0.1,
        durationKnownRuns: 2,
        durationSumMs: 3000,
        lastRunAt: new Date('2026-10-18T10:00:00Z'),
      }),
      { agentId: 'a', accepted: 3, dismissed: 1 },
    );
    expect(f.runs).toBe(4);
    expect(f.runs_not_counted).toBe(2);
    expect(f.cost_unknown_runs).toBe(1);
    expect(f.total_cost_usd).toBeCloseTo(0.6);
    expect(f.avg_cost_usd).toBeCloseTo(0.2);
    expect(f.avg_duration_ms).toBe(1500);
    expect(f.accept_rate).toBe(0.75);
    expect(f.last_run_at).toBe('2026-10-18T10:00:00.000Z');
    expect(toPrevious(f).avg_cost_usd).toBe(f.avg_cost_usd);
  });

  it('treats a free run (cost 0) as known: total 0, not null', () => {
    const f = toFigures(agg({ doneRuns: 1, costKnownRuns: 1 }), undefined);
    expect(f.total_cost_usd).toBe(0);
    expect(f.avg_cost_usd).toBe(0);
  });

  it('keeps the last run null when the scope has no counted run', () => {
    const f = toFigures(agg({ notCountedRuns: 2, lastRunAt: new Date() }), undefined);
    expect(f.last_run_at).toBeNull();
  });

  it('sums aggregates and keeps the newest last run', () => {
    const s = sumAggregates([
      agg({ doneRuns: 2, costKnownRuns: 1, costApiUsd: 1, lastRunAt: new Date('2026-10-01T00:00:00Z') }),
      agg({ agentId: null, doneRuns: 3, costKnownRuns: 3, costEstimateUsd: 2, lastRunAt: new Date('2026-10-05T00:00:00Z') }),
    ]);
    expect(s.doneRuns).toBe(5);
    expect(s.costKnownRuns).toBe(4);
    expect(s.costApiUsd).toBe(1);
    expect(s.costEstimateUsd).toBe(2);
    expect(s.lastRunAt?.toISOString()).toBe('2026-10-05T00:00:00.000Z');
  });
});

describe('pickMostActive (M-11)', () => {
  function row(over: Partial<PerfRow> & { runs: number; last?: string | null }): PerfRow {
    const { runs, last, ...rest } = over;
    const f = toFigures(
      agg({ doneRuns: runs, lastRunAt: last ? new Date(last) : null }),
      { agentId: 'x', accepted: 1, dismissed: 1 },
    );
    return {
      kind: 'agent',
      agent_id: '11111111-1111-4111-8111-111111111111',
      agent_name: 'x',
      enabled: true,
      current: f,
      previous: toPrevious(toFigures(undefined, undefined)),
      recent: recentSummary([]),
      ...rest,
    };
  }

  it('returns null when nobody has a counted run', () => {
    expect(pickMostActive([row({ runs: 0 })])).toBeNull();
  });

  it('prefers more runs, then the newer last run, then name A to Z', () => {
    const more = row({ agent_name: 'zed', runs: 5, last: '2026-10-01T00:00:00Z' });
    const newer = row({ agent_name: 'mid', runs: 4, last: '2026-10-10T00:00:00Z' });
    const older = row({ agent_name: 'old', runs: 4, last: '2026-10-02T00:00:00Z' });
    expect(pickMostActive([older, newer, more])?.agent_name).toBe('zed');
    expect(pickMostActive([older, newer])?.agent_name).toBe('mid');
    const a = row({ agent_name: 'alpha', runs: 4, last: '2026-10-10T00:00:00Z' });
    const b = row({ agent_name: 'beta', runs: 4, last: '2026-10-10T00:00:00Z' });
    expect(pickMostActive([b, a])?.agent_name).toBe('alpha');
  });

  it('never picks the Deleted agents row', () => {
    const deleted = row({ kind: 'deleted', agent_id: null, agent_name: null, runs: 99 });
    const real = row({ agent_name: 'real', runs: 1 });
    expect(pickMostActive([deleted, real])?.agent_name).toBe('real');
    expect(pickMostActive([deleted])).toBeNull();
  });
});

describe('recentSummary (AC-15)', () => {
  const run = (day: number, durationMs: number | null, costUsd: number | null, costSource: 'api' | 'estimate' | null = null): RecentRunRow => ({
    agentId: 'a',
    ranAt: new Date(Date.UTC(2026, 9, day)),
    durationMs,
    costUsd,
    costSource,
  });

  it('keeps the newest 5, oldest to newest, and averages over exactly those', () => {
    const s = recentSummary([
      run(7, 700, 7), run(1, 100, 1), run(6, 600, 6), run(2, 200, 2), run(5, 500, 5), run(4, 400, 4), run(3, 300, 3),
    ]);
    expect(s.runs.map((r) => r.duration_ms)).toEqual([300, 400, 500, 600, 700]);
    expect(s.avg_duration_ms).toBe(500);
    expect(s.avg_cost_usd).toBe(5);
  });

  it('skips unknown and negative values and splits cost by source', () => {
    const s = recentSummary([run(1, null, null), run(2, -1, -1), run(3, 1000, 0.5, 'estimate'), run(4, 3000, 1.5, 'api')]);
    expect(s.avg_duration_ms).toBe(2000);
    expect(s.avg_cost_usd).toBe(1);
    expect(s.cost_split).toEqual({ api_usd: 1.5, estimate_usd: 0.5, unrecorded_usd: 0 });
    expect(s.runs[1]!.duration_ms).toBeNull();
    expect(s.runs[1]!.cost_usd).toBeNull();
  });

  it('is empty with null averages for no runs', () => {
    const s = recentSummary([]);
    expect(s.runs).toEqual([]);
    expect(s.avg_duration_ms).toBeNull();
    expect(s.avg_cost_usd).toBeNull();
  });
});

describe('history cursor', () => {
  const id = '22222222-2222-4222-8222-222222222222';

  it('round-trips', () => {
    const c = { ranAt: new Date('2026-10-19T10:00:00.000Z'), id };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it('turns a forged cursor into a ValidationError', () => {
    const b64 = (v: unknown) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
    for (const bad of [
      'not-base64-json',
      b64('not json'),
      b64({ t: 'yesterday', id }),
      b64({ t: '2026-10-19T10:00:00.000Z', id: "1' OR '1'='1" }),
      b64({ t: '2026-10-19T10:00:00.000Z' }),
      b64([]),
    ]) {
      expect(() => decodeCursor(bad)).toThrow(ValidationError);
    }
  });
});
