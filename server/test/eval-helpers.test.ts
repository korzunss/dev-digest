import { describe, it, expect } from 'vitest';
import { parseFixture, type EvalIssue } from '../src/modules/eval/fixture';
import { readFileSync } from 'node:fs';
import {
  aggregateRounds,
  evaluateGate,
  formatRounds,
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

const fnd = (
  id: string,
  s: number,
  e: number,
  text: string,
  category = 'bug',
  file = F,
  severity = 'WARNING',
): EvalFindingInput =>
  ({ id, file, start_line: s, end_line: e, category, severity, title: text, rationale: '' }) as EvalFindingInput;

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
    const report = formatReport(e);
    expect(report).toContain('suite recall: 0%');
    expect(report).toContain('duplicates: none');
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

describe('false CRITICAL scoring', () => {
  const withFp = parseFixture({
    ...fixture,
    false_positives: [issue('fp-a', 'general', 70, 72, ['alpha']), issue('fp-b', 'general', 80, 82, ['beta'])],
  });
  const run = (findings: EvalFindingInput[]): AgentRunInput[] => [
    { agentName: 'G', lane: 'general', runId: 'r', durationMs: 1, costUsd: 1, findings },
  ];
  const g = (findings: EvalFindingInput[]) => scoreSuite(withFp, run(findings)).agents[0]!;

  it('does not count a CRITICAL that matches an issue or an extra', () => {
    const a = g([fnd('1', 31, 31, 'nan', 'bug', F, 'CRITICAL'), fnd('2', 50, 50, 'zod', 'bug', F, 'CRITICAL')]);
    expect(a.criticals).toBe(2);
    expect(a.falseCriticals).toBe(0);
  });
  it('counts a false_positives match in falseCriticals and knownFalse (fixture order, distinct)', () => {
    const a = g([
      fnd('1', 81, 81, 'beta', 'bug', F, 'CRITICAL'),
      fnd('2', 71, 71, 'alpha', 'bug', F, 'CRITICAL'),
      fnd('3', 71, 71, 'alpha again', 'bug', F, 'CRITICAL'),
    ]);
    expect(a.falseCriticals).toBe(3);
    expect(a.knownFalse).toEqual(['fp-a', 'fp-b']);
    expect(a.unlabelledCriticals).toEqual([]);
  });
  it('puts an unmatched CRITICAL into unlabelledCriticals', () => {
    const a = g([fnd('u1', 200, 200, 'unknown', 'bug', F, 'CRITICAL')]);
    expect(a.falseCriticals).toBe(1);
    expect(a.unlabelledCriticals).toEqual(['u1']);
    expect(a.knownFalse).toEqual([]);
  });
  it('never counts a WARNING, and false_positives do not touch precision or recall', () => {
    const a = g([fnd('w', 71, 71, 'alpha'), fnd('x', 200, 200, 'unknown', 'bug', F, 'SUGGESTION')]);
    expect(a.criticals).toBe(0);
    expect(a.falseCriticals).toBe(0);
    expect(a.precision).toBe(0);
    expect(scoreSuite(withFp, run([])).duplicates).toEqual([]);
  });
  it('prints the new columns and n/a recall for a fixture without planted issues', () => {
    expect(formatReport(scoreSuite(fixture, runs0()))).toMatch(/crit\s+false-crit/);
    const none = parseFixture({ ...fixture, issues: [] });
    expect(formatReport(scoreSuite(none, []))).toContain('suite recall: n/a');
  });
  function runs0(): AgentRunInput[] {
    return run([fnd('1', 31, 31, 'nan', 'bug', F, 'CRITICAL')]);
  }
});

describe('aggregateRounds / evaluateGate / formatRounds', () => {
  const round = (recallHits: number, fc: number, cost: number | null): ReturnType<typeof scoreSuite> => ({
    agents: [
      {
        agentName: 'G', lane: 'general', runId: 'r', recall: recallHits / 3, precision: 0.5, citationAccuracy: null,
        laneFound: [], laneMissed: [], offLane: [], extras: [], unmatched: [], criticals: fc + 1, falseCriticals: fc,
        knownFalse: [], unlabelledCriticals: [], findingsCount: 4, durationMs: 1, costUsd: cost,
      },
    ],
    duplicates: [], suiteRecall: recallHits / 3, missedBySuite: [], plantedCount: 3,
  });
  const rounds = [round(3, 4, 0.1), round(2, 2, 0.2), round(1, 0, 0.3)];
  const sum = aggregateRounds(rounds, 3);

  it('computes means, min and max over 3 rounds', () => {
    expect(sum.rounds).toBe(3);
    expect(sum.suiteRecall?.mean).toBeCloseTo(2 / 3);
    expect(sum.suiteRecall?.min).toBeCloseTo(1 / 3);
    expect(sum.suiteRecall?.max).toBe(1);
    expect(sum.falseCriticals).toEqual({ mean: 2, min: 0, max: 4 });
    expect(sum.costUsd?.mean).toBeCloseTo(0.2);
    expect(sum.perAgent).toHaveLength(1);
    expect(sum.perAgent[0]!.criticalsMean).toBe(3);
    expect(sum.perAgent[0]!.falseCriticalsMean).toBe(2);
    expect(sum.perAgent[0]!.costMean).toBeCloseTo(0.2);
  });
  it('is total on empty input and on null recall/cost', () => {
    const e = aggregateRounds([], 3);
    expect(e.suiteRecall).toBeNull();
    expect(e.costUsd).toBeNull();
    expect(e.falseCriticals).toEqual({ mean: 0, min: 0, max: 0 });
    expect(aggregateRounds(rounds, 0).suiteRecall).toBeNull();
    expect(aggregateRounds([round(1, 0, null)], 3).costUsd).toBeNull();
    expect(aggregateRounds([round(1, 0, null)], 3).perAgent[0]!.costMean).toBeNull();
  });
  it('passes at each limit and fails just past it', () => {
    const at = (s: Partial<typeof sum>) => ({ ...sum, ...s });
    // recall: limit = 0.9 - 0.5/3
    const rl = 0.9 - 0.5 / 3;
    const r = (v: number) =>
      evaluateGate(at({ suiteRecall: { mean: v, min: v, max: v } }), { suiteRecall: 0.9 }, 3)[0]!;
    expect(r(rl).pass).toBe(true);
    expect(r(rl - 0.001).pass).toBe(false);
    const f = (v: number) =>
      evaluateGate(at({ falseCriticals: { mean: v, min: v, max: v } }), { falseCriticals: 10 }, 3)[0]!;
    expect(f(5).pass).toBe(true);
    expect(f(5.001).pass).toBe(false);
    const c = (v: number) => evaluateGate(at({ costUsd: { mean: v } }), { costUsd: 1 }, 3)[0]!;
    expect(c(1.25).pass).toBe(true);
    expect(c(1.2501).pass).toBe(false);
  });
  it('returns one check per baseline given and prints PASS/FAIL lines', () => {
    expect(evaluateGate(sum, {}, 3)).toEqual([]);
    const checks = evaluateGate(sum, { falseCriticals: 10, costUsd: 0.1 }, 3);
    expect(checks.map((x) => x.name)).toEqual(['falseCriticals', 'costUsd']);
    const out = formatRounds(sum, checks);
    expect(out).toContain('gate falseCriticals: PASS');
    expect(out).toContain('gate costUsd: FAIL');
  });
});

describe('PR #13 fixture scored from the triage', () => {
  const raw = JSON.parse(
    readFileSync(new URL('../src/modules/eval/fixtures/pr13-general-false-criticals.json', import.meta.url), 'utf8'),
  );
  const f13 = parseFixture(raw);
  const asFinding = (i: (typeof f13.false_positives)[number], severity: string): EvalFindingInput => {
    const loc = i.locations[0]!;
    return {
      id: i.id, file: loc.file, start_line: loc.start_line, end_line: loc.end_line,
      category: i.categories[0]!, severity, title: i.keywords.join(' '), rationale: i.title,
    } as EvalFindingInput;
  };
  it('scores 15 false CRITICALs, all known, and matches the 3 extras', () => {
    const findings = [
      ...f13.false_positives.map((i) => asFinding(i, 'CRITICAL')),
      ...f13.acceptable_extras.map((i) => asFinding(i, 'WARNING')),
    ];
    const s = scoreSuite(f13, [{ agentName: 'General Reviewer', lane: 'general', runId: 'r', durationMs: 1, costUsd: 1, findings }]);
    const a = s.agents[0]!;
    expect(a.criticals).toBe(15);
    expect(a.falseCriticals).toBe(15);
    expect(a.knownFalse).toHaveLength(15);
    expect(a.unlabelledCriticals).toEqual([]);
    expect(a.extras).toHaveLength(3);
  });
});
