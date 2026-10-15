import { describe, it, expect } from 'vitest';
import type { AgentColumn, AgentColumnFinding, Severity } from '@devdigest/shared';
import {
  sortFindings,
  groupFindings,
  buildConflicts,
  median,
  firstSentence,
  estimatesFrom,
  runTotals,
  toColumnStatus,
  overallStatus,
  orderRecent,
} from '../src/modules/reviews/multi-agent.helpers.js';

let seq = 0;
function finding(file: string, start: number, end: number | null, severity: Severity = 'WARNING', title = 't'): AgentColumnFinding {
  seq += 1;
  return {
    id: `f${seq}`,
    severity,
    category: 'bug',
    title,
    file,
    start_line: start,
    end_line: end as number,
    rationale: 'r',
    confidence: 0.9,
    review_id: 'rv',
    accepted_at: null,
    dismissed_at: null,
    group_id: null,
    also_flagged_by: [],
  };
}

function column(id: string, findings: AgentColumnFinding[], over: Partial<AgentColumn> = {}): AgentColumn {
  return {
    run_id: id,
    agent_id: `agent-${id}`,
    agent_name: `Agent ${id}`,
    agent_deleted: false,
    provider: 'openai',
    model: 'm',
    status: 'done',
    error: null,
    verdict: 'comment',
    score: 80,
    summary: null,
    duration_ms: 1000,
    cost_usd: 0.01,
    cost_source: 'api',
    tokens_in: 1,
    tokens_out: 1,
    grounding: null,
    ran_at: '2026-01-01T00:00:00.000Z',
    finished_at: '2026-01-01T00:00:10.000Z',
    findings,
    ...over,
  };
}

describe('groupFindings', () => {
  it('groups a chain A-B-C into one group although A and C do not overlap', () => {
    const cols = groupFindings([
      column('a', [finding('x.ts', 1, 5)]),
      column('b', [finding('x.ts', 5, 12)]),
      column('c', [finding('x.ts', 12, 20)]),
    ]);
    const ids = new Set(cols.flatMap((c) => c.findings.map((f) => f.group_id)));
    expect(ids.size).toBe(1);
    expect([...ids][0]).not.toBeNull();
    expect(cols[0]!.findings[0]!.also_flagged_by.sort()).toEqual(['b', 'c']);
  });

  it('treats a shared single line as an overlap', () => {
    const cols = groupFindings([column('a', [finding('x.ts', 7, 7)]), column('b', [finding('x.ts', 7, 9)])]);
    expect(cols[0]!.findings[0]!.group_id).toBe(cols[1]!.findings[0]!.group_id);
    expect(cols[0]!.findings[0]!.group_id).not.toBeNull();
  });

  it('treats a null end_line as the start line', () => {
    const cols = groupFindings([column('a', [finding('x.ts', 7, null)]), column('b', [finding('x.ts', 7, 7)])]);
    expect(cols[0]!.findings[0]!.group_id).not.toBeNull();
    const apart = groupFindings([column('a', [finding('x.ts', 7, null)]), column('b', [finding('x.ts', 8, 9)])]);
    expect(apart[0]!.findings[0]!.group_id).toBeNull();
  });

  it('groups a wide finding (>10 lines) by its start line only', () => {
    const cols = groupFindings([
      column('a', [finding('x.ts', 14, 53)]),
      column('b', [finding('x.ts', 18, 18)]),
      column('c', [finding('x.ts', 24, 24)]),
    ]);
    expect(cols.flatMap((c) => c.findings).every((f) => f.group_id === null)).toBe(true);
    expect(cols[0]!.findings[0]!.end_line).toBe(53);
    const joined = groupFindings([column('a', [finding('x.ts', 14, 53)]), column('b', [finding('x.ts', 14, 14)])]);
    expect(joined[0]!.findings[0]!.group_id).not.toBeNull();
    expect(joined[0]!.findings[0]!.group_id).toBe(joined[1]!.findings[0]!.group_id);
  });

  it('still groups a 10-line finding by its full range', () => {
    const cols = groupFindings([column('a', [finding('x.ts', 14, 23)]), column('b', [finding('x.ts', 23, 23)])]);
    expect(cols[0]!.findings[0]!.group_id).not.toBeNull();
    expect(cols[0]!.findings[0]!.group_id).toBe(cols[1]!.findings[0]!.group_id);
  });

  it('lists an agent once in also_flagged_by when it flagged the group twice', () => {
    const cols = groupFindings([
      column('a', [finding('x.ts', 1, 3)]),
      column('b', [finding('x.ts', 2, 2), finding('x.ts', 3, 4)]),
    ]);
    expect(cols[0]!.findings[0]!.also_flagged_by).toEqual(['b']);
  });

  it('does not group across files, nor a single run with itself', () => {
    const cols = groupFindings([
      column('a', [finding('x.ts', 1, 3), finding('x.ts', 2, 4)]),
      column('b', [finding('y.ts', 1, 3)]),
    ]);
    expect(cols.flatMap((c) => c.findings).every((f) => f.group_id === null)).toBe(true);
  });

  it('copies findings instead of merging them', () => {
    const input = [column('a', [finding('x.ts', 1, 3)]), column('b', [finding('x.ts', 1, 3)])];
    const out = groupFindings(input);
    expect(out[0]!.findings).toHaveLength(1);
    expect(out[1]!.findings).toHaveLength(1);
    expect(input[0]!.findings[0]!.group_id).toBeNull();
  });
});

describe('buildConflicts', () => {
  it('takes the heading from the highest severity, then the lowest start line', () => {
    const cols = groupFindings([
      column('a', [finding('x.ts', 10, 12, 'WARNING', 'late warning')]),
      column('b', [finding('x.ts', 11, 14, 'CRITICAL', 'crit high'), finding('x.ts', 9, 10, 'CRITICAL', 'crit low')]),
    ]);
    const [c] = buildConflicts(cols);
    expect(c!.title).toBe('crit low');
    expect(c!.line).toBe(9);
    expect(c!.severity).toBe('CRITICAL');
  });

  it('marks a conflict when an agent did not flag the group', () => {
    const cols = groupFindings([
      column('a', [finding('x.ts', 1, 2)]),
      column('b', [finding('x.ts', 1, 2)]),
      column('c', []),
    ]);
    const [c] = buildConflicts(cols);
    expect(c!.is_conflict).toBe(true);
    expect(c!.takes.find((t) => t.run_id === 'c')!.verdict).toBe('ignored');
  });

  it('marks a conflict when severities differ and lists agreeing groups as non-conflicts', () => {
    const differ = buildConflicts(
      groupFindings([column('a', [finding('x.ts', 1, 2, 'CRITICAL')]), column('b', [finding('x.ts', 1, 2, 'SUGGESTION')])]),
    );
    expect(differ[0]!.is_conflict).toBe(true);
    const agree = buildConflicts(
      groupFindings([column('a', [finding('x.ts', 1, 2)]), column('b', [finding('x.ts', 1, 2)])]),
    );
    expect(agree).toHaveLength(1);
    expect(agree[0]!.is_conflict).toBe(false);
  });

  it('gives a failed column no take', () => {
    const cols = groupFindings([
      column('a', [finding('x.ts', 1, 2)]),
      column('b', [finding('x.ts', 1, 2)]),
      column('c', [], { status: 'failed' }),
    ]);
    const [c] = buildConflicts(cols);
    expect(c!.takes.map((t) => t.run_id)).toEqual(['a', 'b']);
    expect(c!.is_conflict).toBe(false);
  });

  it('returns nothing when every column failed', () => {
    const cols = groupFindings([column('a', [], { status: 'failed' }), column('b', [], { status: 'failed' })]);
    expect(buildConflicts(cols)).toEqual([]);
  });
});

describe('sortFindings', () => {
  it('orders by severity, then file, then start line', () => {
    const sorted = sortFindings([
      finding('b.ts', 1, 1, 'SUGGESTION'),
      finding('b.ts', 5, 5, 'CRITICAL'),
      finding('a.ts', 9, 9, 'CRITICAL'),
      finding('a.ts', 2, 2, 'WARNING'),
      finding('a.ts', 1, 1, 'WARNING'),
    ]).map((f) => `${f.severity}:${f.file}:${f.start_line}`);
    expect(sorted).toEqual([
      'CRITICAL:a.ts:9',
      'CRITICAL:b.ts:5',
      'WARNING:a.ts:1',
      'WARNING:a.ts:2',
      'SUGGESTION:b.ts:1',
    ]);
  });
});

describe('median / firstSentence', () => {
  it('handles odd, even and empty inputs', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('cuts at the first sentence end, newline, or 200 chars', () => {
    expect(firstSentence('Looks fine. Second one.')).toBe('Looks fine.');
    expect(firstSentence('v1.2 is fine!  Next')).toBe('v1.2 is fine!');
    expect(firstSentence('no end\nsecond line')).toBe('no end');
    expect(firstSentence('x'.repeat(300))).toHaveLength(200);
    expect(firstSentence('  ')).toBe('');
  });
});

describe('estimatesFrom', () => {
  const at = (n: number) => new Date(2026, 0, n);
  it('uses medians, the sample size and the newest summary; an unknown agent gets nulls', () => {
    const rows = [
      { agentId: 'a', runId: 'r1', durationMs: 1000, costUsd: 0.1, ranAt: at(1) },
      { agentId: 'a', runId: 'r2', durationMs: 3000, costUsd: null, ranAt: at(2) },
      { agentId: 'a', runId: 'r3', durationMs: 2000, costUsd: 0.3, ranAt: at(3) },
    ];
    const summaries = [
      { runId: 'r1', summary: 'Old one. More', createdAt: at(1) },
      { runId: 'r3', summary: '   ', createdAt: at(4) },
      { runId: 'r2', summary: 'Newest real. Tail', createdAt: at(2) },
    ];
    const [a, b] = estimatesFrom(rows, summaries, ['a', 'b']);
    expect(a).toEqual({
      agent_id: 'a',
      duration_ms: 2000,
      cost_usd: 0.2,
      sample_size: 3,
      last_verdict: 'Newest real.',
    });
    expect(b).toEqual({ agent_id: 'b', duration_ms: null, cost_usd: null, sample_size: 0, last_verdict: null });
  });
});

describe('runTotals / toColumnStatus', () => {
  it('is null while a column runs, and flags partial cost', () => {
    const running = runTotals([column('a', []), column('b', [], { status: 'running', finished_at: null })]);
    expect(running.total_duration_ms).toBeNull();
    const done = runTotals([
      column('a', [], { finished_at: '2026-01-01T00:00:05.000Z' }),
      column('b', [], { finished_at: '2026-01-01T00:00:12.000Z', cost_usd: null }),
    ]);
    expect(done.total_duration_ms).toBe(12000);
    expect(done.total_cost_usd).toBe(0.01);
    expect(done.total_cost_partial).toBe(true);
  });

  it('maps unknown statuses to failed', () => {
    expect(toColumnStatus('done')).toBe('done');
    expect(toColumnStatus(null)).toBe('failed');
    expect(toColumnStatus('weird')).toBe('failed');
  });
});

describe('overallStatus', () => {
  it('derives the overall state (AC-15a)', () => {
    expect(overallStatus(['done', 'running', 'failed'])).toBe('running');
    expect(overallStatus(['done', 'done'])).toBe('done');
    expect(overallStatus(['done', 'failed'])).toBe('partially_failed');
    expect(overallStatus(['done', 'cancelled'])).toBe('partially_failed');
    expect(overallStatus(['failed', 'cancelled'])).toBe('failed');
    expect(overallStatus([])).toBe('failed');
  });
});

describe('orderRecent', () => {
  const r = (id: string, status: 'running' | 'done', ran_at: string) => ({ id, status, ran_at });

  it('lists running runs first, then newest first, keeping ties stable', () => {
    const out = orderRecent([
      r('done-new', 'done', '2026-10-15T12:00:00Z'),
      r('run-old', 'running', '2026-10-15T08:00:00Z'),
      r('done-old', 'done', '2026-10-15T09:00:00Z'),
      r('run-new', 'running', '2026-10-15T10:00:00Z'),
      r('tie-a', 'done', '2026-10-15T07:00:00Z'),
      r('tie-b', 'done', '2026-10-15T07:00:00Z'),
    ]);
    expect(out.map((x) => x.id)).toEqual(['run-new', 'run-old', 'done-new', 'done-old', 'tie-a', 'tie-b']);
  });
});
