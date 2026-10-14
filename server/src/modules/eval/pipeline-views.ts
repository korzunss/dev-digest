import { diffLines } from 'diff';
import {
  EvalCaseResult,
  EvalExpectation,
  EvalSkillRef,
  type EvalAgentDetail,
  type EvalCompare,
  type EvalDashboardView,
  type EvalMetrics,
  type EvalPromptDiffLine,
  type EvalSuiteCase,
  type EvalSuiteRun,
  type EvalSuiteRunDetail,
} from '@devdigest/shared';
import { EVAL_RECENT_RUNS } from './constants.js';
import { metricDeltas, regressionAlert, skillSetDiff, trendPoints } from './pipeline-scoring.js';

/**
 * Read models of the eval pipeline (plan 34). Pure: rows in, contract shapes out.
 * Inputs are structural, so nothing here imports a repository or `db/schema`.
 */

export interface RunRowLike {
  id: string;
  agentId: string;
  agentVersion: number;
  provider: string;
  model: string;
  skills: unknown;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  casesTotal: number;
  casesDone: number;
  casesPassed: number;
  casesErrored: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  costUsd: number | null;
}

export interface CaseRowLike {
  id: string;
  agentId: string | null;
  skillId: string | null;
  name: string;
  inputDiff: string;
  inputFiles: unknown;
  inputMeta: unknown;
  expected: unknown;
  sourceFindingId: string | null;
  sourcePrId: string | null;
  lastResult: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResultRowLike {
  caseId: string | null;
  caseName: string;
  result: unknown;
}

const SkillList = EvalSkillRef.array();

export function parseSkills(value: unknown): EvalSkillRef[] {
  const parsed = SkillList.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseExpected(value: unknown): EvalExpectation[] {
  const out: EvalExpectation[] = [];
  if (!Array.isArray(value)) return out;
  for (const item of value) {
    const parsed = EvalExpectation.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function parseResult(value: unknown): EvalCaseResult | null {
  const parsed = EvalCaseResult.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const asStatus = (s: string): EvalSuiteRun['status'] =>
  s === 'completed' || s === 'failed' ? s : 'running';

export function runMetrics(row: RunRowLike): EvalMetrics {
  return { recall: row.recall, precision: row.precision, citation_accuracy: row.citationAccuracy };
}

export function toRunDto(row: RunRowLike, agentName: string): EvalSuiteRun {
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_name: agentName,
    agent_version: row.agentVersion,
    provider: row.provider,
    model: row.model,
    skills: parseSkills(row.skills),
    status: asStatus(row.status),
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
    cases_total: row.casesTotal,
    cases_done: row.casesDone,
    cases_passed: row.casesPassed,
    cases_errored: row.casesErrored,
    metrics: runMetrics(row),
    cost_usd: row.costUsd,
  };
}

export function toRunDetail(
  row: RunRowLike,
  agentName: string,
  results: readonly ResultRowLike[],
): EvalSuiteRunDetail {
  const out: EvalSuiteRunDetail['results'] = [];
  for (const r of results) {
    const result = parseResult(r.result);
    if (result) out.push({ case_id: r.caseId, case_name: r.caseName, result });
  }
  return { ...toRunDto(row, agentName), results: out };
}

export function toCaseDto(row: CaseRowLike): EvalSuiteCase {
  const meta = (row.inputMeta ?? null) as {
    repo_id?: string | null;
    repo: string;
    pr_number: number;
    title: string;
    head_sha: string;
  } | null;
  return {
    id: row.id,
    agent_id: row.agentId,
    skill_id: row.skillId,
    name: row.name,
    input: {
      diff: row.inputDiff,
      files: Array.isArray(row.inputFiles) ? (row.inputFiles as string[]) : [],
      pr_meta: meta ? { ...meta, repo_id: meta.repo_id ?? null } : null,
    },
    expected: parseExpected(row.expected),
    source: {
      finding_id: row.sourceFindingId,
      pr_id: row.sourcePrId,
      repo_id: meta?.repo_id ?? null,
      pr_number: meta?.pr_number ?? null,
    },
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    last_result: parseResult(row.lastResult),
  };
}

/** Newest first by start time. */
const byNewest = (a: RunRowLike, b: RunRowLike): number =>
  b.startedAt.getTime() - a.startedAt.getTime();

const completedNewestFirst = (runs: readonly RunRowLike[]): RunRowLike[] =>
  runs.filter((r) => r.status === 'completed').sort(byNewest);

/**
 * One agent's detail. `allRuns` is every run of the agent; only `trend` and
 * `runs` follow the period (`since` null = all time). Deltas compare the latest
 * completed run with the one before it.
 */
export function buildAgentDetail(input: {
  agent: { id: string; name: string; provider: string; model: string; version: number };
  casesTotal: number;
  allRuns: readonly RunRowLike[];
  since: Date | null;
}): EvalAgentDetail {
  const { agent, allRuns, since } = input;
  const completed = completedNewestFirst(allRuns);
  const latest = completed[0] ?? null;
  const previous = completed[1] ?? null;
  const deltas = metricDeltas(latest ? runMetrics(latest) : null, previous ? runMetrics(previous) : null);
  const inPeriod = allRuns.filter((r) => since === null || r.startedAt.getTime() >= since.getTime());
  return {
    agent: { id: agent.id, name: agent.name, provider: agent.provider, model: agent.model, version: agent.version },
    cases_total: input.casesTotal,
    runs_total: allRuns.length,
    latest: latest ? toRunDto(latest, agent.name) : null,
    deltas,
    alert: latest ? regressionAlert(latest.agentVersion, deltas) : null,
    trend: trendPoints(
      inPeriod.map((r) => ({
        id: r.id,
        startedAt: r.startedAt.toISOString(),
        agentVersion: r.agentVersion,
        costUsd: r.costUsd,
        status: asStatus(r.status),
        metrics: runMetrics(r),
      })),
    ),
    runs: inPeriod.slice().sort(byNewest).map((r) => toRunDto(r, agent.name)),
  };
}

const delta = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : b - a;

function promptDiff(older: string, newer: string): EvalPromptDiffLine[] {
  const lines: EvalPromptDiffLine[] = [];
  for (const part of diffLines(older, newer)) {
    const op = part.added ? 'add' : part.removed ? 'del' : 'same';
    const text = part.value.endsWith('\n') ? part.value.slice(0, -1) : part.value;
    for (const line of text.split('\n')) lines.push({ op, text: line });
  }
  return lines;
}

/**
 * Compare two runs of one agent (`older` started before `newer`). The prompt
 * diff is null for the same version, or when either stored config is missing.
 * Promote is offered when the newer run's version is not the agent's current one;
 * its restore list keeps the recorded skills that still exist.
 */
export function buildCompare(input: {
  agentName: string;
  older: RunRowLike;
  newer: RunRowLike;
  olderPrompt: string | null;
  newerPrompt: string | null;
  currentVersion: number;
  existingSkillIds: ReadonlySet<string>;
}): EvalCompare {
  const { older, newer } = input;
  const sameVersion = older.agentVersion === newer.agentVersion;
  const olderSkills = parseSkills(older.skills);
  const newerSkills = parseSkills(newer.skills);
  const skillsDiff = skillSetDiff(olderSkills, newerSkills);
  const offered = newer.agentVersion !== input.currentVersion;
  return {
    older: toRunDto(older, input.agentName),
    newer: toRunDto(newer, input.agentName),
    deltas: {
      recall: delta(older.recall, newer.recall),
      precision: delta(older.precision, newer.precision),
      citation_accuracy: delta(older.citationAccuracy, newer.citationAccuracy),
      cost_usd: delta(older.costUsd, newer.costUsd),
    },
    same_version: sameVersion,
    prompt_diff:
      sameVersion || input.olderPrompt === null || input.newerPrompt === null
        ? null
        : promptDiff(input.olderPrompt, input.newerPrompt),
    skills_diff: skillsDiff,
    same_skills:
      skillsDiff.added.length === 0 &&
      skillsDiff.removed.length === 0 &&
      skillsDiff.changed.length === 0,
    promote: offered
      ? {
          version: newer.agentVersion,
          restore: newerSkills.filter((s) => input.existingSkillIds.has(s.id)),
          missing: newerSkills.filter((s) => !input.existingSkillIds.has(s.id)).map((s) => s.name),
        }
      : null,
  };
}

/**
 * The dashboard: every agent (latest completed run newest first, never-run
 * agents last by name), a recall sparkline per agent, and the newest runs.
 */
export function buildDashboard(input: {
  agents: readonly {
    id: string;
    name: string;
    model: string;
    enabled: boolean;
    casesTotal: number;
    runs: readonly RunRowLike[];
  }[];
  recentRuns: readonly RunRowLike[];
  agentNames: ReadonlyMap<string, string>;
}): EvalDashboardView {
  const rows = input.agents.map((a) => {
    const completed = completedNewestFirst(a.runs);
    const latest = completed[0] ?? null;
    return {
      latest,
      view: {
        agent_id: a.id,
        name: a.name,
        model: a.model,
        enabled: a.enabled,
        cases_total: a.casesTotal,
        latest: latest ? toRunDto(latest, a.name) : null,
        sparkline: completed
          .slice()
          .reverse()
          .map((r) => r.recall)
          .filter((v): v is number => v !== null),
      },
    };
  });
  rows.sort((x, y) => {
    if (x.latest && y.latest) return y.latest.startedAt.getTime() - x.latest.startedAt.getTime();
    if (x.latest) return -1;
    if (y.latest) return 1;
    return x.view.name.localeCompare(y.view.name);
  });
  return {
    agents: rows.map((r) => r.view),
    recent_runs: input.recentRuns
      .slice()
      .sort(byNewest)
      .slice(0, EVAL_RECENT_RUNS)
      .map((r) => toRunDto(r, input.agentNames.get(r.agentId) ?? '')),
  };
}
