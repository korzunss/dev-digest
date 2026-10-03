import { describe, expect, it } from 'vitest';
import { FINDINGS_CAP, RATIONALE_MAX, conciseReview, latestReviews, prFindings } from '../src/core/findings.js';
import { makeReview } from './fakes.js';
import type { FindingRecord } from '@devdigest/shared';

function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: 'f',
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file: 'a.ts',
    start_line: 3,
    end_line: 4,
    rationale: 'r',
    suggestion: 'SUGGEST',
    confidence: 0.5,
    review_id: 'rev-1',
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

describe('latestReviews', () => {
  it('keeps the newest review per agent and skips summaries', () => {
    const out = latestReviews([
      makeReview({ id: 'old', created_at: '2026-01-01' }),
      makeReview({ id: 'new', created_at: '2026-02-01' }),
      makeReview({ id: 'sum', kind: 'summary', created_at: '2026-03-01' }),
      makeReview({ id: 'other', agent_id: 'a2', created_at: '2026-01-01' }),
    ]);
    expect(out.map((r) => r.id).sort()).toEqual(['new', 'other']);
  });

  it('filters by agent and by run', () => {
    const rs = [makeReview({ id: 'x' }), makeReview({ id: 'y', agent_id: 'a2', run_id: 'run-2' })];
    expect(latestReviews(rs, { agentId: 'a2' }).map((r) => r.id)).toEqual(['y']);
    expect(latestReviews(rs, { runId: 'run-2' }).map((r) => r.id)).toEqual(['y']);
  });
});

describe('conciseReview', () => {
  it('sorts by severity, caps at 20 and reports total', () => {
    const findings = [
      finding({ id: '1', severity: 'SUGGESTION' }),
      ...Array.from({ length: 25 }, (_, i) => finding({ id: `w${i}` })),
      finding({ id: 'c', severity: 'CRITICAL' }),
    ];
    const out = conciseReview(makeReview({ findings }));
    expect(out.total).toBe(27);
    expect(out.returned).toBe(FINDINGS_CAP);
    expect(out.findings[0]?.severity).toBe('CRITICAL');
    expect(out.findings[0]?.line).toBe(3);
  });

  it('cuts rationale, never exposes suggestion, drops dismissed', () => {
    const out = conciseReview(
      makeReview({
        findings: [finding({ rationale: 'x'.repeat(300) }), finding({ dismissed_at: '2026-01-01' })],
      }),
    );
    expect(out.total).toBe(1);
    expect(out.findings[0]?.rationale).toHaveLength(RATIONALE_MAX + 1);
    expect(out.findings[0]?.rationale.endsWith('…')).toBe(true);
    expect(JSON.stringify(out)).not.toContain('SUGGEST');
  });

  it('applies min_severity', () => {
    const findings = [
      finding({ severity: 'SUGGESTION' }),
      finding({ severity: 'WARNING' }),
      finding({ severity: 'CRITICAL' }),
    ];
    expect(conciseReview(makeReview({ findings }), { minSeverity: 'WARNING' }).total).toBe(2);
    expect(conciseReview(makeReview({ findings }), { minSeverity: 'CRITICAL' }).total).toBe(1);
  });

  it('caps title at RATIONALE_MAX chars', () => {
    const out = conciseReview(
      makeReview({ findings: [finding({ title: 't'.repeat(500) })] }),
    );
    expect(out.findings[0]?.title).toHaveLength(RATIONALE_MAX + 1);
  });
});

describe('prFindings', () => {
  const input = { repo: 'acme/web', pr: 7 };

  it('sorts by agent name with unnamed agents last', () => {
    const out = prFindings(input, [
      makeReview({ id: '1', agent_name: 'Security' }),
      makeReview({ id: '2', agent_name: null, run_id: 'run-n' }),
      makeReview({ id: '3', agent_name: 'Bugs', run_id: 'run-b' }),
    ]);
    expect(out.reviews.map((r) => r.agent)).toEqual(['Bugs', 'Security', null]);
  });

  // two reviews of the same agent are ordered by run_id, so the output is stable
  it('breaks agent ties by run_id', () => {
    const out = prFindings(input, [
      makeReview({ id: '1', agent_name: 'Bugs', run_id: 'run-b' }),
      makeReview({ id: '2', agent_name: 'Bugs', run_id: 'run-a' }),
    ]);
    expect(out.reviews.map((r) => r.run_id)).toEqual(['run-a', 'run-b']);
  });

  it('counts total_findings before the cap', () => {
    const many = Array.from({ length: 25 }, (_, i) => finding({ id: `f${i}` }));
    const out = prFindings(input, [
      makeReview({ findings: many }),
      makeReview({ agent_name: 'Bugs', run_id: 'run-b', findings: [finding(), finding()] }),
    ]);
    expect(out.total_findings).toBe(27);
    expect(out.reviews.find((r) => r.agent === 'Security')?.returned).toBe(FINDINGS_CAP);
  });

  it('does not count dismissed or filtered-out findings', () => {
    const findings = [
      finding({ severity: 'CRITICAL' }),
      finding({ severity: 'WARNING' }),
      finding({ severity: 'CRITICAL', dismissed_at: '2026-01-01' }),
    ];
    expect(prFindings(input, [makeReview({ findings })]).total_findings).toBe(2);
    expect(prFindings(input, [makeReview({ findings })], { minSeverity: 'CRITICAL' }).total_findings).toBe(1);
  });

  it('echoes repo and pr, and handles empty input', () => {
    expect(prFindings(input, [])).toEqual({ repo: 'acme/web', pr: 7, total_findings: 0, reviews: [] });
  });
});
