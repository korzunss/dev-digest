/**
 * PR-list rollup helpers (`modules/pulls/status.ts`) — the pure derivation that
 * decides each PR's review STATUS and tallies its FINDINGS for the list. The DB
 * `status` column holds GitHub's merge state; the review status
 * (needs_review / reviewed / stale) is derived here from head vs lastReviewedSha
 * + age, so it gets unit coverage independent of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveReviewStatus,
  rollupCost,
  rollupSeverities,
  STALE_DAYS,
} from '../src/modules/pulls/status.js';

const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 11);

describe('deriveReviewStatus', () => {
  it('needs_review when never reviewed, or when head moved since the last review', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: null, headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'old', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
  });

  it('reviewed when the current head was reviewed and the PR is recent', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now - DAY), now }),
    ).toBe('reviewed');
  });

  it('stale when the current head was reviewed but the PR is older than STALE_DAYS', () => {
    expect(
      deriveReviewStatus({
        ghStatus: 'open',
        lastReviewedSha: 'abc',
        headSha: 'abc',
        updatedAt: new Date(now - (STALE_DAYS + 1) * DAY),
        now,
      }),
    ).toBe('stale');
  });

  it('keeps merged/closed regardless of review state', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'merged', lastReviewedSha: null, headSha: 'abc', updatedAt: null, now }),
    ).toBe('merged');
    expect(
      deriveReviewStatus({ ghStatus: 'closed', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('closed');
  });
});

describe('rollupSeverities', () => {
  it('tallies findings into critical / warning / suggestion buckets (ignores unknown)', () => {
    expect(
      rollupSeverities([
        { severity: 'CRITICAL' },
        { severity: 'CRITICAL' },
        { severity: 'WARNING' },
        { severity: 'SUGGESTION' },
        { severity: 'WEIRD' },
      ]),
    ).toEqual({ critical: 2, warning: 1, suggestion: 1 });
  });

  it('is all-zero for no findings', () => {
    expect(rollupSeverities([])).toEqual({ critical: 0, warning: 0, suggestion: 0 });
  });
});

describe('rollupCost (spec 001)', () => {
  it('sums the runs that have a price', () => {
    expect(
      rollupCost([
        { costUsd: 0.0013, costSource: 'api' },
        { costUsd: 0.0014, costSource: 'api' },
        { costUsd: 0.0012, costSource: 'api' },
      ]),
    ).toEqual({ cost_usd: 0.0013 + 0.0014 + 0.0012, cost_source: 'api' });
  });

  it('is null — not 0 — when no run of the PR was ever priced', () => {
    // 0 would claim the reviews were free; this PR simply has no numbers.
    expect(rollupCost([{ costUsd: null, costSource: null }])).toEqual({
      cost_usd: null,
      cost_source: null,
    });
    expect(rollupCost([])).toEqual({ cost_usd: null, cost_source: null });
  });

  it('skips unpriced runs instead of poisoning the sum', () => {
    expect(
      rollupCost([
        { costUsd: 0.01, costSource: 'api' },
        { costUsd: null, costSource: null },
      ]),
    ).toEqual({ cost_usd: 0.01, cost_source: 'api' });
  });

  it('is worst-wins: one estimated run makes the whole sum an estimate', () => {
    expect(
      rollupCost([
        { costUsd: 0.01, costSource: 'api' },
        { costUsd: 0.02, costSource: 'estimate' },
      ]).cost_source,
    ).toBe('estimate');
  });

  it('keeps a free run (0) in the sum — 0 is a price, not a missing one', () => {
    expect(rollupCost([{ costUsd: 0, costSource: 'api' }])).toEqual({
      cost_usd: 0,
      cost_source: 'api',
    });
  });
});
