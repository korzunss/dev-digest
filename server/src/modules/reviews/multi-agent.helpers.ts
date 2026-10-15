/**
 * Pure helpers of the multi-agent review: grouping overlapping findings across
 * agents, deriving conflicts, estimates and totals. No db, adapter or container
 * import. Findings are copied, never merged (every agent keeps its own).
 */
import type {
  AgentColumn,
  AgentColumnFinding,
  AgentColumnStatus,
  AgentEstimate,
  Conflict,
  ConflictTake,
  MultiAgentOverallStatus,
  Severity,
} from '@devdigest/shared';
import { MULTI_AGENT_WIDE_FINDING_MAX_LINES } from './constants.js';

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

const FIRST_SENTENCE_MAX_CHARS = 200;
const ESTIMATE_SAMPLE_SIZE = 5;

/** CRITICAL first, then WARNING, then SUGGESTION; then file, then start line. */
export function sortFindings<T extends { severity: Severity; file: string; start_line: number }>(
  findings: T[],
): T[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
      a.start_line - b.start_line,
  );
}

const endOf = (f: AgentColumnFinding): number => f.end_line ?? f.start_line;

/**
 * End of the range used for grouping. A finding wider than
 * MULTI_AGENT_WIDE_FINDING_MAX_LINES groups by its start line only, so one broad
 * finding does not chain unrelated findings; the finding keeps its full range.
 */
const groupEndOf = (f: AgentColumnFinding): number =>
  endOf(f) - f.start_line + 1 > MULTI_AGENT_WIDE_FINDING_MAX_LINES ? f.start_line : endOf(f);

/**
 * Link findings of different runs that overlap on the same file (inclusive
 * `[start_line, end_line ?? start_line]`, or `[start_line, start_line]` for a finding wider than
 * MULTI_AGENT_WIDE_FINDING_MAX_LINES; overlap chains are one group). A group
 * counts only when it spans 2+ runs. Returns new columns whose findings carry
 * `group_id` and `also_flagged_by` (the other runs' ids, deduplicated).
 */
export function groupFindings(columns: AgentColumn[]): AgentColumn[] {
  type Ref = { run: string; col: number; idx: number; f: AgentColumnFinding };
  const byFile = new Map<string, Ref[]>();
  columns.forEach((c, col) =>
    c.findings.forEach((f, idx) => {
      const list = byFile.get(f.file) ?? [];
      list.push({ run: c.run_id, col, idx, f });
      byFile.set(f.file, list);
    }),
  );

  const groupOf = new Map<string, { id: string; runs: Set<string> }>(); // "col:idx" -> group
  for (const [file, refs] of byFile) {
    const sorted = [...refs].sort((a, b) => a.f.start_line - b.f.start_line);
    // Sweep over start-sorted intervals: a finding starting past the running end opens a new component.
    let current: Ref[] = [];
    let currentEnd = -Infinity;
    const flush = () => {
      const runs = new Set(current.map((r) => r.run));
      if (runs.size >= 2) {
        const id = `${file}:${current[0]!.f.start_line}`;
        const group = { id, runs };
        for (const r of current) groupOf.set(`${r.col}:${r.idx}`, group);
      }
      current = [];
    };
    for (const r of sorted) {
      if (current.length > 0 && r.f.start_line > currentEnd) flush();
      current.push(r);
      currentEnd = Math.max(currentEnd, groupEndOf(r.f));
    }
    if (current.length > 0) flush();
  }

  return columns.map((c, col) => ({
    ...c,
    findings: c.findings.map((f, idx) => {
      const group = groupOf.get(`${col}:${idx}`);
      if (!group) return { ...f, group_id: null, also_flagged_by: [] };
      return {
        ...f,
        group_id: group.id,
        also_flagged_by: [...group.runs].filter((run) => run !== c.run_id),
      };
    }),
  }));
}

/**
 * One conflict entry per listed group, from columns already passed through
 * `groupFindings`. Listed: flagged by 2+ columns, or a real disagreement.
 */
export function buildConflicts(columns: AgentColumn[]): Conflict[] {
  const groups = new Map<string, { run: AgentColumn; f: AgentColumnFinding }[]>();
  for (const c of columns) {
    for (const f of c.findings) {
      if (!f.group_id) continue;
      const list = groups.get(f.group_id) ?? [];
      list.push({ run: c, f });
      groups.set(f.group_id, list);
    }
  }

  const doneColumns = columns.filter((c) => c.status === 'done');
  const out: Conflict[] = [];
  for (const [id, members] of groups) {
    const heading = [...members]
      .map((m) => m.f)
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.start_line - b.start_line)[0]!;

    const takes: ConflictTake[] = doneColumns.map((c) => {
      const mine = members.filter((m) => m.run.run_id === c.run_id).map((m) => m.f);
      const best = sortFindings(mine)[0];
      return {
        run_id: c.run_id,
        agent_id: c.agent_id,
        agent_name: c.agent_name,
        verdict: best ? best.severity : 'ignored',
        finding_id: best ? best.id : null,
        title: best ? best.title : null,
      };
    });

    const flagging = takes.filter((t) => t.verdict !== 'ignored');
    const isConflict =
      flagging.length < takes.length || new Set(flagging.map((t) => t.verdict)).size > 1;
    const flaggedBy = new Set(members.map((m) => m.run.run_id)).size;
    if (flaggedBy < 2 && !isConflict) continue;

    out.push({
      id,
      file: heading.file,
      line: heading.start_line,
      title: heading.title,
      severity: heading.severity,
      is_conflict: isConflict,
      takes,
    });
  }
  return out;
}

/** Median of the numbers; null for an empty list; the mean of the middle two when even. */
export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Text up to the first `.`, `!` or `?` followed by whitespace or the end, or the first newline; max 200 chars. */
export function firstSentence(text: string): string {
  const line = text.trim().split(/\r?\n/)[0] ?? '';
  const m = /^[\s\S]*?[.!?](?=\s|$)/.exec(line);
  return (m ? m[0] : line).trim().slice(0, FIRST_SENTENCE_MAX_CHARS);
}

/**
 * One estimate per agent from its last done runs (up to 5): median duration,
 * median of the known costs, how many runs were used, and the first sentence of
 * the newest non-empty summary among them.
 */
export function estimatesFrom(
  rows: { agentId: string; runId: string; durationMs: number | null; costUsd: number | null; ranAt: Date }[],
  summaries: { runId: string; summary: string | null; createdAt: Date }[],
  agentIds: string[],
): AgentEstimate[] {
  return agentIds.map((agentId) => {
    const runs = rows
      .filter((r) => r.agentId === agentId)
      .sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime())
      .slice(0, ESTIMATE_SAMPLE_SIZE);
    const runIds = new Set(runs.map((r) => r.runId));
    const duration = median(runs.flatMap((r) => (r.durationMs == null ? [] : [r.durationMs])));
    const cost = median(runs.flatMap((r) => (r.costUsd == null ? [] : [r.costUsd])));
    const latest = summaries
      .filter((s) => runIds.has(s.runId) && s.summary && s.summary.trim() !== '')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return {
      agent_id: agentId,
      duration_ms: duration == null ? null : Math.round(duration),
      cost_usd: cost,
      sample_size: runs.length,
      last_verdict: latest?.summary ? firstSentence(latest.summary) : null,
    };
  });
}

/**
 * Wall clock (latest `finished_at` minus earliest `ran_at`) is null while a
 * column is running or when nothing has finished. Cost sums the known costs and
 * is flagged partial when a done column has none.
 */
export function runTotals(
  columns: Pick<AgentColumn, 'status' | 'ran_at' | 'finished_at' | 'cost_usd'>[],
): {
  total_duration_ms: number | null;
  total_cost_usd: number | null;
  total_cost_partial: boolean;
} {
  const running = columns.some((c) => c.status === 'running');
  const ends = columns.flatMap((c) => (c.finished_at ? [Date.parse(c.finished_at)] : []));
  const starts = columns.map((c) => Date.parse(c.ran_at));
  const duration =
    running || ends.length === 0 || starts.length === 0
      ? null
      : Math.max(0, Math.round(Math.max(...ends) - Math.min(...starts)));
  const costs = columns.flatMap((c) => (c.cost_usd == null ? [] : [c.cost_usd]));
  return {
    total_duration_ms: duration,
    total_cost_usd: costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0),
    total_cost_partial: columns.some((c) => c.status === 'done' && c.cost_usd == null),
  };
}

/** Anything that is not a known status counts as failed. */
export function toColumnStatus(status: string | null | undefined): AgentColumnStatus {
  return status === 'running' || status === 'done' || status === 'failed' || status === 'cancelled'
    ? status
    : 'failed';
}

/**
 * Overall state of a multi-agent run from its agent runs' statuses: any running
 * -> running; all done -> done; some done -> partially_failed; none done (or no
 * runs, e.g. every agent was deleted) -> failed.
 */
export function overallStatus(statuses: AgentColumnStatus[]): MultiAgentOverallStatus {
  if (statuses.some((s) => s === 'running')) return 'running';
  if (statuses.length > 0 && statuses.every((s) => s === 'done')) return 'done';
  return statuses.some((s) => s === 'done') ? 'partially_failed' : 'failed';
}

/** Running runs first, then the rest; each group newest first by `ran_at`. Stable. */
export function orderRecent<T extends { status: MultiAgentOverallStatus; ran_at: string }>(
  summaries: T[],
): T[] {
  const rank = (x: T): number => (x.status === 'running' ? 0 : 1);
  return [...summaries].sort(
    (a, b) => rank(a) - rank(b) || Date.parse(b.ran_at) - Date.parse(a.ran_at),
  );
}
