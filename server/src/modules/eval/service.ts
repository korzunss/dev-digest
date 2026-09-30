import type { FindingCategory } from '@devdigest/shared';
import type { EvalRepository, RunRow } from './repository.js';
import type { Lane, ReviewEvalFixture } from './fixture.js';
import { scoreSuite, type AgentRunInput, type SuiteScore } from './helpers.js';

export interface EvalServiceDeps {
  repo: EvalRepository;
}

export interface ScoreOptions {
  workspaceName: string;
  /** Explicit run ids; each overrides the latest `done` run of its agent. */
  runIds?: string[];
}

export interface ScoreResult extends SuiteScore {
  /** ids of the stored `eval_runs` rows, in agent order. */
  evalRunIds: string[];
  /** Agent names of lanes with no run to score (no row written). */
  noRun: string[];
  warnings: string[];
}

/**
 * Scores stored review runs against a planted-issue fixture. Every precondition
 * throws before the first write, so a failed eval leaves nothing half-written.
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

    // Run selection: explicit ids first, the newest done run for the rest.
    const runByAgent = new Map<string, RunRow>();
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
        if (runByAgent.has(row.agentId)) throw new Error(`more than one --run given for the agent of run ${id}`);
        runByAgent.set(row.agentId, row);
      }
    }
    const rest = [...agentByLane.values()].filter((a) => !runByAgent.has(a.id)).map((a) => a.id);
    for (const row of await repo.latestDoneRuns(pull.id, rest)) {
      if (row.agentId) runByAgent.set(row.agentId, row);
    }

    const scored: { lane: Lane; agent: { id: string; name: string }; run: RunRow }[] = [];
    for (const [lane, agent] of agentByLane) {
      const run = runByAgent.get(agent.id);
      if (run) scored.push({ lane, agent, run });
      else noRun.push(agent.name);
    }

    const findingRows = await repo.findingsForRuns(
      pull.id,
      scored.map((s) => s.run.id),
    );
    const inputs: AgentRunInput[] = scored.map(({ lane, agent, run }) => ({
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
          title: f.title,
          rationale: f.rationale,
        })),
    }));

    const suite = scoreSuite(fixture, inputs);

    const evalRunIds: string[] = [];
    for (const score of suite.agents) {
      const s = scored.find((x) => x.run.id === score.runId)!;
      const caseId = await repo.upsertEvalCase({
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
      });
      evalRunIds.push(
        await repo.insertEvalRun({
          caseId,
          pass: null,
          recall: score.recall,
          precision: score.precision,
          citationAccuracy: score.citationAccuracy,
          durationMs: score.durationMs,
          costUsd: score.costUsd,
          actualOutput: {
            run_id: score.runId,
            recall: score.recall,
            precision: score.precision,
            lane_found: score.laneFound,
            lane_missed: score.laneMissed,
            off_lane: score.offLane,
            extras: score.extras,
            unmatched: score.unmatched,
            duplicates: suite.duplicates.filter((d) => d.agents.includes(score.agentName)),
            suite_recall: suite.suiteRecall,
          },
        }),
      );
    }

    return { ...suite, evalRunIds, noRun, warnings };
  }
}
