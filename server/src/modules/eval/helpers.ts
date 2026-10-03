import type { FindingCategory, Severity } from '@devdigest/shared';
import { COST_GATE_RATIO, FALSE_CRITICALS_GATE_RATIO, RECALL_GATE_SLACK_ISSUES } from './constants.js';
import type { EvalIssue, Lane, ReviewEvalFixture } from './fixture.js';

export interface EvalFindingInput {
  id: string;
  file: string;
  start_line: number;
  end_line: number;
  category: FindingCategory;
  severity: Severity;
  title: string;
  rationale: string;
}

export interface AgentRunInput {
  agentName: string;
  lane: Lane;
  runId: string;
  durationMs: number | null;
  costUsd: number | null;
  findings: EvalFindingInput[];
}

export interface AgentScore {
  agentName: string;
  lane: Lane;
  runId: string;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  laneFound: string[];
  laneMissed: string[];
  offLane: string[];
  extras: string[];
  unmatched: string[];
  /** CRITICAL findings of the run. */
  criticals: number;
  /** CRITICALs that match no planted issue and no acceptable extra. */
  falseCriticals: number;
  /** Distinct `false_positives` ids matched by those false CRITICALs, in fixture order. */
  knownFalse: string[];
  /** Ids of false CRITICALs that match no `false_positives` entry. */
  unlabelledCriticals: string[];
  findingsCount: number;
  durationMs: number | null;
  costUsd: number | null;
}

export interface SuiteScore {
  agents: AgentScore[];
  duplicates: { issueId: string; agents: string[] }[];
  suiteRecall: number;
  missedBySuite: string[];
  /** Number of planted issues in the fixture (0 makes recall meaningless). */
  plantedCount: number;
}

export interface FindingMatch {
  issueId: string;
  exact: boolean;
}

/** Gap in lines between two inclusive ranges; 0 when they overlap. */
function gap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.max(aStart, bStart) - Math.min(aEnd, bEnd));
}

function keywordHits(f: EvalFindingInput, issue: EvalIssue): number {
  const text = `${f.title} ${f.rationale}`.toLowerCase();
  return issue.keywords.filter((k) => text.includes(k.toLowerCase())).length;
}

/**
 * AC2: same file, lines within ±tolerance of an issue range, category allowed,
 * ≥1 keyword. Ties: most keyword hits, smallest line distance, candidate order.
 */
export function matchFinding(
  f: EvalFindingInput,
  candidates: EvalIssue[],
  tolerance: number,
): FindingMatch | null {
  let best: { issueId: string; hits: number; dist: number } | null = null;
  for (const issue of candidates) {
    if (!issue.categories.includes(f.category)) continue;
    const hits = keywordHits(f, issue);
    if (hits === 0) continue;
    let dist = Infinity;
    for (const loc of issue.locations) {
      if (loc.file !== f.file) continue;
      dist = Math.min(dist, gap(f.start_line, f.end_line, loc.start_line, loc.end_line));
    }
    if (dist > tolerance) continue;
    if (!best || hits > best.hits || (hits === best.hits && dist < best.dist)) {
      best = { issueId: issue.id, hits, dist };
    }
  }
  return best ? { issueId: best.issueId, exact: best.dist === 0 } : null;
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

export function scoreSuite(fixture: ReviewEvalFixture, runs: AgentRunInput[]): SuiteScore {
  const candidates = [...fixture.issues, ...fixture.acceptable_extras];
  const plantedIds = new Set(fixture.issues.map((i) => i.id));
  // false_positives never count toward precision, recall or duplicates.
  const laneOrder = Object.keys(fixture.lanes) as Lane[];
  const ordered = [...runs].sort((a, b) => laneOrder.indexOf(a.lane) - laneOrder.indexOf(b.lane));

  const foundBy = new Map<string, string[]>();
  const agents: AgentScore[] = ordered.map((run) => {
    const laneIssues = fixture.issues.filter((i) => i.lane === run.lane).map((i) => i.id);
    const matched = new Set<string>();
    const extras = new Set<string>();
    const unmatched: string[] = [];
    const knownFalse = new Set<string>();
    const unlabelledCriticals: string[] = [];
    let criticals = 0;
    let falseCriticals = 0;
    let matchedCount = 0;
    let exactCount = 0;
    for (const f of run.findings) {
      const m = matchFinding(f, candidates, fixture.line_tolerance);
      if (f.severity === 'CRITICAL') {
        criticals++;
        if (!m) {
          falseCriticals++;
          const fp = matchFinding(f, fixture.false_positives, fixture.line_tolerance);
          if (fp) knownFalse.add(fp.issueId);
          else unlabelledCriticals.push(f.id);
        }
      }
      if (!m) {
        unmatched.push(f.id);
        continue;
      }
      matchedCount++;
      if (m.exact) exactCount++;
      if (plantedIds.has(m.issueId)) matched.add(m.issueId);
      else extras.add(m.issueId);
    }
    for (const id of matched) foundBy.set(id, [...(foundBy.get(id) ?? []), run.agentName]);
    const inOrder = (ids: Iterable<string>) => {
      const s = new Set(ids);
      return fixture.issues.filter((i) => s.has(i.id)).map((i) => i.id);
    };
    const laneFound = inOrder(matched).filter((id) => laneIssues.includes(id));
    return {
      agentName: run.agentName,
      lane: run.lane,
      runId: run.runId,
      recall: ratio(laneFound.length, laneIssues.length),
      precision: ratio(matchedCount, run.findings.length),
      citationAccuracy: ratio(exactCount, matchedCount),
      laneFound,
      laneMissed: laneIssues.filter((id) => !laneFound.includes(id)),
      offLane: inOrder(matched).filter((id) => !laneIssues.includes(id)),
      extras: fixture.acceptable_extras.filter((i) => extras.has(i.id)).map((i) => i.id),
      unmatched,
      criticals,
      falseCriticals,
      knownFalse: fixture.false_positives.filter((i) => knownFalse.has(i.id)).map((i) => i.id),
      unlabelledCriticals,
      findingsCount: run.findings.length,
      durationMs: run.durationMs,
      costUsd: run.costUsd,
    };
  });

  const duplicates = fixture.issues
    .filter((i) => (foundBy.get(i.id)?.length ?? 0) > 1)
    .map((i) => ({ issueId: i.id, agents: foundBy.get(i.id) as string[] }));
  const missedBySuite = fixture.issues.filter((i) => !foundBy.has(i.id)).map((i) => i.id);
  const suiteRecall =
    fixture.issues.length === 0 ? 0 : (fixture.issues.length - missedBySuite.length) / fixture.issues.length;
  return { agents, duplicates, suiteRecall, missedBySuite, plantedCount: fixture.issues.length };
}

const pct = (v: number | null) => (v === null ? 'n/a' : `${Math.round(v * 100)}%`);

/** Left-aligned columns: header, dashed rule, then one line per row. */
function formatTable(head: string[], rows: string[][]): string[] {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] as string).length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] as number)).join('  ').trimEnd();
  return [line(head), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)];
}

export function formatReport(s: SuiteScore): string {
  const head = ['agent', 'recall', 'precision', 'findings', 'matched', 'off-lane', 'unmatched', 'crit', 'false-crit', 'cost', 'duration'];
  const rows = s.agents.map((a) => {
    const laneSize = a.laneFound.length + a.laneMissed.length;
    const matched = a.findingsCount - a.unmatched.length;
    return [
      a.agentName,
      a.recall === null ? 'n/a' : `${a.laneFound.length}/${laneSize}`,
      pct(a.precision),
      String(a.findingsCount),
      String(matched),
      String(a.offLane.length),
      String(a.unmatched.length),
      String(a.criticals),
      String(a.falseCriticals),
      a.costUsd === null ? '-' : `$${a.costUsd.toFixed(4)}`,
      a.durationMs === null ? '-' : `${(a.durationMs / 1000).toFixed(1)}s`,
    ];
  });
  const out = formatTable(head, rows);
  out.push('');
  out.push(
    s.duplicates.length
      ? `duplicates: ${s.duplicates.map((d) => `${d.issueId} (${d.agents.join(', ')})`).join('; ')}`
      : 'duplicates: none',
  );
  out.push(`missed by suite: ${s.missedBySuite.length ? s.missedBySuite.join(', ') : 'none'}`);
  out.push(`suite recall: ${s.plantedCount === 0 ? 'n/a' : pct(s.suiteRecall)}`);
  return out.join('\n');
}

export interface Stat {
  mean: number;
  min: number;
  max: number;
}

export interface AgentRoundsSummary {
  agentName: string;
  recallMean: number | null;
  precisionMean: number | null;
  criticalsMean: number | null;
  falseCriticalsMean: number | null;
  costMean: number | null;
}

export interface RoundsSummary {
  rounds: number;
  /** `null` when the fixture has no planted issues. */
  suiteRecall: Stat | null;
  /** Summed over agents per round. */
  falseCriticals: Stat;
  /** Summed per round; `null` if any round has no cost at all. */
  costUsd: { mean: number } | null;
  perAgent: AgentRoundsSummary[];
}

export interface GateBaseline {
  suiteRecall?: number;
  falseCriticals?: number;
  costUsd?: number;
}

export interface GateCheck {
  name: 'suiteRecall' | 'falseCriticals' | 'costUsd';
  pass: boolean;
  actual: number | null;
  limit: number;
}

const EPS = 1e-9;

/** Mean of the non-null values; `null` when there are none. */
function meanOf(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length;
}

function statOf(values: number[]): Stat {
  if (values.length === 0) return { mean: 0, min: 0, max: 0 };
  return {
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export function aggregateRounds(rounds: SuiteScore[], plantedCount: number): RoundsSummary {
  const roundCosts = rounds.map((r) => {
    const costs = r.agents.map((a) => a.costUsd).filter((c): c is number => c !== null);
    return costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0);
  });
  const costs = roundCosts.filter((c): c is number => c !== null);
  const costUsd =
    rounds.length === 0 || costs.length !== roundCosts.length
      ? null
      : { mean: costs.reduce((a, b) => a + b, 0) / costs.length };

  const names: string[] = [];
  for (const r of rounds) for (const a of r.agents) if (!names.includes(a.agentName)) names.push(a.agentName);
  const perAgent = names.map((agentName) => {
    const rows = rounds.flatMap((r) => r.agents.filter((a) => a.agentName === agentName));
    return {
      agentName,
      recallMean: meanOf(rows.map((a) => a.recall)),
      precisionMean: meanOf(rows.map((a) => a.precision)),
      criticalsMean: meanOf(rows.map((a) => a.criticals)),
      falseCriticalsMean: meanOf(rows.map((a) => a.falseCriticals)),
      costMean: meanOf(rows.map((a) => a.costUsd)),
    };
  });

  return {
    rounds: rounds.length,
    suiteRecall:
      plantedCount === 0 || rounds.length === 0 ? null : statOf(rounds.map((r) => r.suiteRecall)),
    falseCriticals: statOf(rounds.map((r) => r.agents.reduce((n, a) => n + a.falseCriticals, 0))),
    costUsd,
    perAgent,
  };
}

/** One check per baseline value given; a check with no actual value fails. */
export function evaluateGate(
  summary: RoundsSummary,
  baseline: GateBaseline,
  plantedCount: number,
): GateCheck[] {
  const checks: GateCheck[] = [];
  if (baseline.suiteRecall !== undefined) {
    const actual = summary.suiteRecall?.mean ?? null;
    const limit = baseline.suiteRecall - RECALL_GATE_SLACK_ISSUES / Math.max(plantedCount, 1);
    checks.push({ name: 'suiteRecall', pass: actual !== null && actual >= limit - EPS, actual, limit });
  }
  if (baseline.falseCriticals !== undefined) {
    const actual = summary.falseCriticals.mean;
    const limit = baseline.falseCriticals * FALSE_CRITICALS_GATE_RATIO;
    checks.push({ name: 'falseCriticals', pass: actual <= limit + EPS, actual, limit });
  }
  if (baseline.costUsd !== undefined) {
    const actual = summary.costUsd?.mean ?? null;
    const limit = baseline.costUsd * COST_GATE_RATIO;
    checks.push({ name: 'costUsd', pass: actual !== null && actual <= limit + EPS, actual, limit });
  }
  return checks;
}

const num = (v: number | null, digits = 2) => (v === null ? 'n/a' : v.toFixed(digits));
const stat = (s: Stat | null, digits = 2) =>
  s === null ? 'n/a' : `mean ${num(s.mean, digits)} (min ${num(s.min, digits)}, max ${num(s.max, digits)})`;

export function formatRounds(summary: RoundsSummary, checks: GateCheck[]): string {
  const out = [`rounds: ${summary.rounds}`];
  out.push(`suite recall: ${stat(summary.suiteRecall)}`);
  out.push(`false criticals per round: ${stat(summary.falseCriticals)}`);
  out.push(`cost per round: ${summary.costUsd === null ? 'n/a' : `$${summary.costUsd.mean.toFixed(4)}`}`);
  const head = ['agent', 'recall', 'precision', 'crit', 'false-crit', 'cost'];
  const rows = summary.perAgent.map((a) => [
    a.agentName,
    pct(a.recallMean),
    pct(a.precisionMean),
    num(a.criticalsMean),
    num(a.falseCriticalsMean),
    a.costMean === null ? '-' : `$${a.costMean.toFixed(4)}`,
  ]);
  out.push('', ...formatTable(head, rows));
  if (checks.length) out.push('');
  for (const c of checks) {
    out.push(`gate ${c.name}: ${c.pass ? 'PASS' : 'FAIL'} (actual ${num(c.actual, 4)} limit ${num(c.limit, 4)})`);
  }
  return out.join('\n');
}
