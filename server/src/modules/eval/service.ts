import { Severity, type FindingCategory } from '@devdigest/shared';
import { MAX_EVAL_ROUNDS } from './constants.js';
import type { EvalRepository, RunRow } from './repository.js';
import type { Lane, ReviewEvalFixture } from './fixture.js';
import {
  aggregateRounds,
  evaluateGate,
  scoreSuite,
  type AgentRunInput,
  type GateBaseline,
  type GateCheck,
  type RoundsSummary,
  type SuiteScore,
} from './helpers.js';

export interface EvalServiceDeps {
  repo: EvalRepository;
}

export interface ScoreOptions {
  workspaceName: string;
  /** Explicit run ids; each overrides the latest `done` run of its agent. */
  runIds?: string[];
  /** Score the N newest done runs of each agent as N rounds (default 1). */
  rounds?: number;
  /** Baseline means to gate the aggregate against. */
  baseline?: GateBaseline;
}

export interface ScoreResult extends SuiteScore {
  /** Every round's score; `rounds[0]` is the top-level `SuiteScore`. */
  rounds: SuiteScore[];
  summary: RoundsSummary;
  gate: GateCheck[];
  /** ids of the stored `eval_runs` rows, in agent order. */
  evalRunIds: string[];
  /** Agent names of lanes with no run to score (no row written). */
  noRun: string[];
  warnings: string[];
}

/**
 * Scores stored review runs against a planted-issue fixture. Every precondition
 * throws before the first write, and all writes run in one transaction, so a
 * failed eval leaves nothing half-written.
 * Makes no LLM call and touches no table but through the injected repository.
 */
export class EvalService {
  constructor(private deps: EvalServiceDeps) {}

  async scoreReviewFixture(fixture: ReviewEvalFixture, opts: ScoreOptions): Promise<ScoreResult> {
    const { repo } = this.deps;
    const where = `fixture PR ${fixture.repo}#${fixture.pr}`;

    const workspace = await repo.findWorkspaceByName(opts.workspaceName);
    if (!workspace) throw new Error(`${where} not found: workspace "${opts.workspaceName}" does not exist`);
    const pull = await repo.findPull(workspace.id, fixture.repo, fixture.pr);
    if (!pull) throw new Error(`${where} not found in workspace "${opts.workspaceName}"`);
    if (pull.headSha !== fixture.head_sha) {
      throw new Error(
        `${where} head is ${pull.headSha}, fixture expects ${fixture.head_sha}; line ranges may be stale`,
      );
    }

    const lanes = Object.entries(fixture.lanes) as [Lane, string][];
    const warnings: string[] = [];
    const noRun: string[] = [];
    const agentByLane = new Map<Lane, { id: string; name: string }>();
    const found = await repo.findAgentsByName(
      workspace.id,
      lanes.map(([, name]) => name),
    );
    for (const [lane, name] of lanes) {
      const matches = found.filter((a) => a.name === name);
      if (matches.length === 0) {
        noRun.push(name);
        continue;
      }
      if (matches.length > 1) warnings.push(`agent name "${name}" is ambiguous (${matches.length}); using the first by id`);
      agentByLane.set(lane, matches[0]!);
    }

    // Run selection: explicit ids first, the newest done runs for the rest.
    const rounds = opts.rounds ?? 1;
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > MAX_EVAL_ROUNDS) {
      throw new Error(`rounds must be an integer from 1 to ${MAX_EVAL_ROUNDS}, got ${rounds}`);
    }
    if (rounds > 1 && opts.runIds?.length) {
      throw new Error('--run cannot be combined with --runs > 1');
    }
    const runsByAgent = new Map<string, RunRow[]>();
    const laneOfAgent = new Map<string, Lane>([...agentByLane].map(([lane, a]) => [a.id, lane]));
    if (opts.runIds?.length) {
      const wanted = [...new Set(opts.runIds)];
      const rows = await repo.getRuns(wanted);
      for (const id of wanted) {
        const row = rows.find((r) => r.id === id);
        if (!row) throw new Error(`run ${id} not found`);
        if (row.prId !== pull.id) throw new Error(`run ${id} is not a run of ${where}`);
        if (row.status !== 'done') throw new Error(`run ${id} has status "${row.status}", expected "done"`);
        if (!row.agentId || !laneOfAgent.has(row.agentId)) {
          throw new Error(`run ${id} belongs to an agent outside the fixture lanes`);
        }
        if (runsByAgent.has(row.agentId)) throw new Error(`more than one --run given for the agent of run ${id}`);
        runsByAgent.set(row.agentId, [row]);
      }
    }
    const rest = [...agentByLane.values()].filter((a) => !runsByAgent.has(a.id)).map((a) => a.id);
    for (const row of await repo.latestDoneRuns(pull.id, rest, rounds)) {
      if (!row.agentId) continue;
      runsByAgent.set(row.agentId, [...(runsByAgent.get(row.agentId) ?? []), row]);
    }

    const scoredAgents: { lane: Lane; agent: { id: string; name: string }; runs: RunRow[] }[] = [];
    for (const [lane, agent] of agentByLane) {
      const runs = runsByAgent.get(agent.id);
      if (!runs?.length) {
        noRun.push(agent.name);
        continue;
      }
      if (runs.length < rounds) {
        throw new Error(
          `agent "${agent.name}" has ${runs.length} done run(s) on ${where}; --runs needs ${rounds}`,
        );
      }
      scoredAgents.push({ lane, agent, runs });
    }

    const findingRows = await repo.findingsForRuns(
      pull.id,
      scoredAgents.flatMap((s) => s.runs.slice(0, rounds).map((r) => r.id)),
    );
    const roundInputs: AgentRunInput[][] = [];
    const roundRuns: { lane: Lane; agent: { id: string; name: string }; run: RunRow }[][] = [];
    for (let k = 0; k < rounds; k++) {
      const scored = scoredAgents.map(({ lane, agent, runs }) => ({ lane, agent, run: runs[k] as RunRow }));
      roundRuns.push(scored);
      roundInputs.push(
        scored.map(({ lane, agent, run }) => ({
          agentName: agent.name,
          lane,
          runId: run.id,
          durationMs: run.durationMs,
          costUsd: run.costUsd,
          findings: findingRows
            .filter((f) => f.runId === run.id)
            .map((f) => ({
              id: f.id,
              file: f.file,
              start_line: f.startLine,
              end_line: f.endLine,
              // Stored as free text; a value outside the enum simply matches no issue.
              category: f.category as FindingCategory,
              // Same for severity: a non-enum value never counts as CRITICAL.
              severity: Severity.safeParse(f.severity).data ?? 'SUGGESTION',
              title: f.title,
              rationale: f.rationale,
            })),
        })),
      );
    }

    const roundSuites = roundInputs.map((inputs) => scoreSuite(fixture, inputs));
    const suite = roundSuites[0] as SuiteScore;
    const summary = aggregateRounds(roundSuites, fixture.issues.length);
    const gate = opts.baseline ? evaluateGate(summary, opts.baseline, fixture.issues.length) : [];

    const evalRunIds = await repo.transaction(async (tx) => {
      const ids: string[] = [];
      const caseIds = new Map<string, string>();
      for (const s of roundRuns[0] ?? []) {
        caseIds.set(
          s.agent.id,
          await tx.upsertEvalCase({
            workspaceId: workspace.id,
            ownerId: s.agent.id,
            name: fixture.id,
            inputMeta: { repo: fixture.repo, pr: fixture.pr, head_sha: fixture.head_sha },
            expectedOutput: {
              lane: s.lane,
              issues: fixture.issues.filter((i) => i.lane === s.lane),
              acceptable_extras: fixture.acceptable_extras.filter((i) => i.lane === s.lane),
              line_tolerance: fixture.line_tolerance,
            },
          }),
        );
      }
      for (let k = 0; k < rounds; k++) {
        const roundSuite = roundSuites[k] as SuiteScore;
        for (const score of roundSuite.agents) {
          const s = (roundRuns[k] ?? []).find((x) => x.run.id === score.runId)!;
          ids.push(
            await tx.insertEvalRun({
              caseId: caseIds.get(s.agent.id)!,
              pass: null,
              recall: score.recall,
              precision: score.precision,
              citationAccuracy: score.citationAccuracy,
              durationMs: score.durationMs,
              costUsd: score.costUsd,
              actualOutput: {
                run_id: score.runId,
                round: k + 1,
                rounds,
                recall: score.recall,
                precision: score.precision,
                lane_found: score.laneFound,
                lane_missed: score.laneMissed,
                off_lane: score.offLane,
                extras: score.extras,
                unmatched: score.unmatched,
                criticals: score.criticals,
                false_criticals: score.falseCriticals,
                known_false: score.knownFalse,
                unlabelled_criticals: score.unlabelledCriticals,
                duplicates: roundSuite.duplicates.filter((d) => d.agents.includes(score.agentName)),
                suite_recall: roundSuite.suiteRecall,
                gate,
              },
            }),
          );
        }
      }
      return ids;
    });

    return { ...suite, rounds: roundSuites, summary, gate, evalRunIds, noRun, warnings };
  }
}
