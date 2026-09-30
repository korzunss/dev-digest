import type { FindingCategory } from '@devdigest/shared';
import type { EvalIssue, Lane, ReviewEvalFixture } from './fixture.js';

export interface EvalFindingInput {
  id: string;
  file: string;
  start_line: number;
  end_line: number;
  category: FindingCategory;
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
  findingsCount: number;
  durationMs: number | null;
  costUsd: number | null;
}

export interface SuiteScore {
  agents: AgentScore[];
  duplicates: { issueId: string; agents: string[] }[];
  suiteRecall: number;
  missedBySuite: string[];
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
  const laneOrder = Object.keys(fixture.lanes) as Lane[];
  const ordered = [...runs].sort((a, b) => laneOrder.indexOf(a.lane) - laneOrder.indexOf(b.lane));

  const foundBy = new Map<string, string[]>();
  const agents: AgentScore[] = ordered.map((run) => {
    const laneIssues = fixture.issues.filter((i) => i.lane === run.lane).map((i) => i.id);
    const matched = new Set<string>();
    const extras = new Set<string>();
    const unmatched: string[] = [];
    let matchedCount = 0;
    let exactCount = 0;
    for (const f of run.findings) {
      const m = matchFinding(f, candidates, fixture.line_tolerance);
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
  return { agents, duplicates, suiteRecall, missedBySuite };
}

const pct = (v: number | null) => (v === null ? 'n/a' : `${Math.round(v * 100)}%`);

export function formatReport(s: SuiteScore): string {
  const head = ['agent', 'recall', 'precision', 'findings', 'matched', 'off-lane', 'unmatched', 'cost', 'duration'];
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
      a.costUsd === null ? '-' : `$${a.costUsd.toFixed(4)}`,
      a.durationMs === null ? '-' : `${(a.durationMs / 1000).toFixed(1)}s`,
    ];
  });
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] as string).length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] as number)).join('  ').trimEnd();
  const out = [line(head), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)];
  out.push('');
  out.push(
    s.duplicates.length
      ? `duplicates: ${s.duplicates.map((d) => `${d.issueId} (${d.agents.join(', ')})`).join('; ')}`
      : 'duplicates: none',
  );
  out.push(`missed by suite: ${s.missedBySuite.length ? s.missedBySuite.join(', ') : 'none'}`);
  out.push(`suite recall: ${pct(s.suiteRecall)}`);
  return out.join('\n');
}
