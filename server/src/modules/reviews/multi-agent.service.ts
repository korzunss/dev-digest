import type {
  AgentColumn,
  AgentColumnFinding,
  AgentEstimate,
  LatestMultiAgentRun,
  MultiAgentRun,
  MultiAgentRunSummary,
} from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import type { ReviewRepository, MultiAgentRunHeader } from './repository.js';
import { RECENT_RUNS_LIMIT } from './constants.js';
import type { Logger } from './run-executor.js';
import { findingRowToDto } from './helpers.js';
import {
  buildConflicts,
  estimatesFrom,
  groupFindings,
  orderRecent,
  overallStatus,
  runTotals,
  sortFindings,
  toColumnStatus,
} from './multi-agent.helpers.js';

/** The repository calls the multi-agent service makes (structural; the container passes the real one). */
export type MultiAgentRepoPort = Pick<
  ReviewRepository,
  | 'getPull'
  | 'insertMultiAgentRun'
  | 'deleteMultiAgentRun'
  | 'failRunningRunsOfMultiRun'
  | 'getMultiAgentRun'
  | 'recentMultiAgentRunsForRepo'
  | 'latestMultiAgentRunForPull'
  | 'agentRunsForMultiRuns'
  | 'agentRunsForMultiRun'
  | 'reviewsWithFindingsForRuns'
  | 'lastDoneRunsPerAgent'
  | 'summariesForRuns'
>;

/** Starts one agent run per target and links each to the multi-agent run. */
export type StartRunsPort = (
  workspaceId: string,
  prId: string,
  targets: AgentRow[],
  logger?: Logger,
  opts?: { multiAgentRunId?: string },
) => Promise<unknown>;

export interface MultiAgentServiceDeps {
  repo: MultiAgentRepoPort;
  agents: { list(workspaceId: string): Promise<AgentRow[]> };
  startRuns: StartRunsPort;
}

/**
 * Multi-agent review: start the selected agents on one PR as a linked group and
 * read the group back as columns + conflicts. Makes no model call itself.
 */
const START_FAILED_MESSAGE = 'Multi-agent start failed';

export class MultiAgentService {
  constructor(private deps: MultiAgentServiceDeps) {}

  /** Validate, create the grouping row, start the runs, return the running group. */
  async start(
    workspaceId: string,
    prId: string,
    agentIds: string[],
    logger?: Logger,
  ): Promise<MultiAgentRun> {
    const pull = await this.deps.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const wanted = [...new Set(agentIds)];
    const all = await this.deps.agents.list(workspaceId);
    const byId = new Map(all.map((a) => [a.id, a]));
    const targets: AgentRow[] = [];
    for (const id of wanted) {
      const agent = byId.get(id);
      if (!agent) throw new NotFoundError('Agent not found');
      targets.push(agent);
    }

    const { id } = await this.deps.repo.insertMultiAgentRun({ workspaceId, prId });
    try {
      await this.deps.startRuns(workspaceId, prId, targets, logger, { multiAgentRunId: id });
    } catch (err) {
      // Part of the group may already exist: fail those runs (they would stay `running`
      // forever once unlinked), then do not leave an empty group behind.
      // A fixed text: the raw message may carry provider or path detail and this column is
      // returned to the client; the detail stays in the rethrown error (logged by the handler).
      // Independent steps: a failure marking the runs must not leave the empty group behind.
      try {
        await this.deps.repo.failRunningRunsOfMultiRun(workspaceId, id, START_FAILED_MESSAGE);
      } catch (cleanupErr) {
        logger?.error(
          { multiAgentRunId: id, err: (cleanupErr as Error).message },
          'multi-agent: failing the runs after a failed start failed',
        );
      }
      try {
        await this.deps.repo.deleteMultiAgentRun(workspaceId, id);
      } catch (cleanupErr) {
        logger?.error(
          { multiAgentRunId: id, err: (cleanupErr as Error).message },
          'multi-agent: deleting the group after a failed start failed',
        );
      }
      throw err;
    }
    return this.get(workspaceId, id);
  }

  /** The group as it stands now: one column per agent run, plus conflicts and totals. */
  async get(workspaceId: string, id: string): Promise<MultiAgentRun> {
    const multi = await this.deps.repo.getMultiAgentRun(workspaceId, id);
    if (!multi) throw new NotFoundError('Multi-agent run not found');

    const runs = await this.deps.repo.agentRunsForMultiRun(id);
    const reviewed = await this.deps.repo.reviewsWithFindingsForRuns(runs.map((r) => r.run.id));
    const byRun = new Map(reviewed.map((r) => [r.review.runId, r]));

    const built: AgentColumn[] = runs.map(({ run, agentName }) => {
      const got = byRun.get(run.id);
      const findings: AgentColumnFinding[] = sortFindings(
        (got?.findings ?? []).map((f) => ({ ...findingRowToDto(f), group_id: null, also_flagged_by: [] })),
      );
      return {
        run_id: run.id,
        agent_id: run.agentId,
        agent_name: agentName,
        agent_deleted: run.agentId === null,
        provider: run.provider,
        model: run.model,
        status: toColumnStatus(run.status),
        error: run.error,
        verdict: got?.review.verdict ?? null,
        score: run.score ?? got?.review.score ?? null,
        summary: got?.review.summary ?? null,
        duration_ms: run.durationMs,
        cost_usd: run.costUsd,
        cost_source: run.costSource,
        tokens_in: run.tokensIn,
        tokens_out: run.tokensOut,
        grounding: run.grounding,
        ran_at: run.ranAt.toISOString(),
        finished_at: run.finishedAt ? run.finishedAt.toISOString() : null,
        findings,
      };
    });

    const columns = groupFindings(built);
    const totals = runTotals(columns);
    return {
      id: multi.id,
      pr_id: multi.prId,
      pr_number: multi.prNumber,
      pr_title: multi.prTitle,
      ran_at: multi.ranAt.toISOString(),
      agent_count: columns.length,
      ...totals,
      columns,
      conflicts: buildConflicts(columns),
    };
  }

  /** One estimate per agent of the workspace, from its last done runs. */
  async estimates(workspaceId: string): Promise<AgentEstimate[]> {
    const agents = await this.deps.agents.list(workspaceId);
    const rows = await this.deps.repo.lastDoneRunsPerAgent(workspaceId);
    const summaries = await this.deps.repo.summariesForRuns(rows.map((r) => r.runId));
    return estimatesFrom(
      rows,
      summaries,
      agents.map((a) => a.id),
    );
  }

  /** The newest runs on a repository's PRs as headers (no columns): running first, then newest. */
  async recent(workspaceId: string, repoId: string): Promise<MultiAgentRunSummary[]> {
    const headers = await this.deps.repo.recentMultiAgentRunsForRepo(
      workspaceId,
      repoId,
      RECENT_RUNS_LIMIT,
    );
    return orderRecent(await this.summarise(headers));
  }

  /** The newest multi-agent run of a PR, or `{ run: null }` (PR outside the workspace -> NotFound). */
  async latestForPull(workspaceId: string, prId: string): Promise<LatestMultiAgentRun> {
    const pull = await this.deps.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const header = await this.deps.repo.latestMultiAgentRunForPull(workspaceId, prId);
    if (!header) return { run: null };
    const [run] = await this.summarise([header]);
    return { run: run ?? null };
  }

  /** Headers -> summaries with one bulk query for all their agent runs. */
  private async summarise(headers: MultiAgentRunHeader[]): Promise<MultiAgentRunSummary[]> {
    const runs = await this.deps.repo.agentRunsForMultiRuns(headers.map((h) => h.id));
    return headers.map((h) => {
      const mine = runs.filter((r) => r.multiAgentRunId === h.id);
      const columns = mine.map(({ run, agentName }) => ({
        status: toColumnStatus(run.status),
        agent_name: agentName,
        ran_at: run.ranAt.toISOString(),
        finished_at: run.finishedAt ? run.finishedAt.toISOString() : null,
        cost_usd: run.costUsd,
      }));
      const totals = runTotals(columns);
      return {
        id: h.id,
        pr_id: h.prId,
        pr_number: h.prNumber,
        pr_title: h.prTitle,
        ran_at: h.ranAt.toISOString(),
        status: overallStatus(columns.map((c) => c.status)),
        agent_count: columns.length,
        agent_names: columns.map((c) => c.agent_name),
        ...totals,
      };
    });
  }
}
