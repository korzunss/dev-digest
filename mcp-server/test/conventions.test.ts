import { describe, expect, it } from 'vitest';
import { RATIONALE_MAX } from '../src/core/findings.js';
import { CONVENTIONS_CAP, acceptedConventions } from '../src/core/conventions.js';
import type { ConventionCandidate, ConventionScanResult } from '@devdigest/shared';

function cand(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: 'c',
    repo_id: 'r',
    scan_id: 's',
    rule: 'rule',
    category: 'api',
    evidence_path: 'a.ts',
    evidence_line: 5,
    evidence_end_line: 6,
    evidence_snippet: 'SNIPPET',
    confidence: 0.5,
    status: 'accepted',
    created_at: 'x',
    ...over,
  } as ConventionCandidate;
}

const scan = {} as NonNullable<ConventionScanResult['scan']>;

describe('acceptedConventions', () => {
  it('returns accepted rows only, counts pending, hides snippets', () => {
    const out = acceptedConventions({
      scan,
      candidates: [cand(), cand({ status: 'pending' }), cand({ status: 'rejected' })],
    });
    expect(out.scanned).toBe(true);
    expect(out.accepted).toHaveLength(1);
    expect(out.pending_count).toBe(1);
    expect(out.accepted[0]).toEqual({ rule: 'rule', category: 'api', file: 'a.ts', line: 5, confidence: 0.5 });
  });

  it('orders by confidence, caps at 30, flags no scan', () => {
    const candidates = Array.from({ length: 35 }, (_, i) => cand({ id: `${i}`, confidence: i / 100 }));
    const out = acceptedConventions({ scan: null, candidates });
    expect(out.scanned).toBe(false);
    expect(out.accepted).toHaveLength(CONVENTIONS_CAP);
    expect(out.accepted[0]?.confidence).toBe(0.34);
  });

  it('caps a long rule at RATIONALE_MAX chars', () => {
    const out = acceptedConventions({ scan, candidates: [cand({ rule: 'x'.repeat(500) })] });
    expect(out.accepted[0]!.rule).toHaveLength(RATIONALE_MAX + 1);
  });
});
