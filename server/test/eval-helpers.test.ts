import { describe, it, expect } from 'vitest';
import { parseFixture, type EvalIssue } from '../src/modules/eval/fixture';
import {
  formatReport,
  matchFinding,
  scoreSuite,
  type AgentRunInput,
  type EvalFindingInput,
} from '../src/modules/eval/helpers';

const F = 'a.ts';
const issue = (id: string, lane: EvalIssue['lane'], a: number, b: number, kw: string[], cat = 'bug'): EvalIssue =>
  ({ id, lane, title: id, locations: [{ file: F, start_line: a, end_line: b }], categories: [cat], keywords: kw }) as EvalIssue;

const fixture = parseFixture({
  id: 'x',
  repo: 'o/r',
  pr: 1,
  head_sha: 'a'.repeat(40),
  line_tolerance: 3,
  lanes: { general: 'G', security: 'S', performance: 'P', test_quality: 'T', api_contract: 'A' },
  issues: [
    issue('sqli', 'security', 10, 12, ['injection']),
    issue('key', 'security', 14, 15, ['hardcoded']),
    issue('gen', 'general', 30, 32, ['nan']),
  ],
  acceptable_extras: [issue('zod', 'api_contract', 50, 52, ['zod'])],
});

const fnd = (id: string, s: number, e: number, text: string, category = 'bug', file = F): EvalFindingInput =>
  ({ id, file, start_line: s, end_line: e, category, title: text, rationale: '' }) as EvalFindingInput;

describe('matchFinding', () => {
  const c = fixture.issues;
  it('matches at ±3 lines but not ±4', () => {
    expect(matchFinding(fnd('1', 15, 15, 'SQL injection'), [c[0]!], 3)?.issueId).toBe('sqli');
    expect(matchFinding(fnd('1', 16, 16, 'SQL injection'), [c[0]!], 3)).toBeNull();
    expect(matchFinding(fnd('1', 7, 7, 'SQL injection'), [c[0]!], 3)?.issueId).toBe('sqli');
    expect(matchFinding(fnd('1', 6, 6, 'SQL injection'), [c[0]!], 3)).toBeNull();
  });
  it('rejects wrong category, missing keyword and other file', () => {
    expect(matchFinding(fnd('1', 11, 11, 'injection', 'style'), c, 3)).toBeNull();
    expect(matchFinding(fnd('1', 11, 11, 'something else'), c, 3)).toBeNull();
    expect(matchFinding(fnd('1', 11, 11, 'injection', 'bug', 'b.ts'), c, 3)).toBeNull();
  });
  it('is case-insensitive and reports exact overlap', () => {
    expect(matchFinding(fnd('1', 11, 11, 'SQL INJECTION'), c, 3)).toEqual({ issueId: 'sqli', exact: true });
    expect(matchFinding(fnd('1', 13, 13, 'SQL INJECTION'), c, 3)).toEqual({ issueId: 'sqli', exact: false });
  });
  it('resolves adjacent issues by keywords, then distance, and picks only one', () => {
    expect(matchFinding(fnd('1', 12, 14, 'hardcoded key'), c, 3)?.issueId).toBe('key');
    expect(matchFinding(fnd('2', 12, 14, 'injection'), c, 3)?.issueId).toBe('sqli');
    const both = [issue('p', 'general', 10, 10, ['x']), issue('q', 'general', 12, 12, ['x'])];
    expect(matchFinding(fnd('3', 12, 12, 'x'), both, 3)?.issueId).toBe('q');
    const eq = [issue('p', 'general', 10, 10, ['x']), issue('q', 'general', 10, 10, ['x'])];
    expect(matchFinding(fnd('4', 10, 10, 'x'), eq, 3)?.issueId).toBe('p');
  });
});

describe('scoreSuite', () => {
  const runs: AgentRunInput[] = [
    {
      agentName: 'S', lane: 'security', runId: 'r1', durationMs: 1000, costUsd: 0.1,
      findings: [fnd('s1', 11, 11, 'injection'), fnd('s2', 40, 41, 'noise')],
    },
    {
      agentName: 'G', lane: 'general', runId: 'r2', durationMs: 2000, costUsd: 0.2,
      findings: [fnd('g1', 31, 31, 'NaN result'), fnd('g2', 11, 11, 'injection here'), fnd('g3', 50, 50, 'zod', 'bug')],
    },
    { agentName: 'A', lane: 'api_contract', runId: 'r3', durationMs: null, costUsd: null, findings: [] },
  ];
  const s = scoreSuite(fixture, runs);
  const by = (n: string) => s.agents.find((a) => a.agentName === n)!;

  it('computes recall and precision per agent', () => {
    expect(by('S').recall).toBe(0.5);
    expect(by('S').precision).toBe(0.5);
    expect(by('S').laneMissed).toEqual(['key']);
    expect(by('G').recall).toBe(1);
    expect(by('G').precision).toBe(1);
    expect(by('G').offLane).toEqual(['sqli']);
    expect(by('G').extras).toEqual(['zod']);
  });
  it('lists only cross-agent duplicates and suite recall', () => {
    expect(s.duplicates).toEqual([{ issueId: 'sqli', agents: ['G', 'S'] }]);
    expect(s.missedBySuite).toEqual(['key']);
    expect(s.suiteRecall).toBeCloseTo(2 / 3);
  });
  it('gives null for an empty lane and for 0 findings', () => {
    expect(by('A').recall).toBeNull();
    expect(by('A').precision).toBeNull();
    expect(by('A').citationAccuracy).toBeNull();
  });
  it('computes citationAccuracy with zero tolerance', () => {
    const r = scoreSuite(fixture, [
      { agentName: 'S', lane: 'security', runId: 'r', durationMs: 1, costUsd: 1,
        findings: [fnd('a', 11, 11, 'injection'), fnd('b', 14, 14, 'injection')] },
    ]);
    expect(r.agents[0]!.citationAccuracy).toBe(0.5);
  });
  it('handles no runs and renders a report', () => {
    const e = scoreSuite(fixture, []);
    expect(e.agents).toEqual([]);
    expect(e.suiteRecall).toBe(0);
    expect(formatReport(s)).toContain('suite recall: 67%');
    expect(formatReport(s)).toContain('duplicates: sqli (G, S)');
  });
});

describe('scoreSuite line tolerance from the fixture', () => {
  const wide = parseFixture({ ...fixture, line_tolerance: 8 });
  const runs: AgentRunInput[] = [
    { agentName: 'S', lane: 'security', runId: 'r1', durationMs: 1, costUsd: 0, findings: [fnd('s1', 19, 19, 'injection')] },
  ];
  it('matches a drifted citation only when the fixture tolerance allows it', () => {
    expect(scoreSuite(fixture, runs).agents.find((a) => a.lane === 'security')!.recall).toBe(0);
    expect(scoreSuite(wide, runs).agents.find((a) => a.lane === 'security')!.recall).toBe(0.5);
  });
});
