import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { latestReviews, prFindings, SEVERITIES } from '../core/findings.js';
import { resolveAgent, resolvePull, resolveRepo } from '../core/resolve.js';
import { runStatus } from '../core/run-review.js';
import { noReviewText, resolutionText, runCancelledText, runFailedText, unknownRunText } from './messages.js';
import { fail, guard, ok, READ_ONLY, type ToolDeps } from './result.js';

export function registerGetFindings(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'get_findings',
    {
      description:
        'Get the whole review picture of a pull request in one call: the latest review of every agent with its findings, plus total_findings. Read-only. Pass agent or run_id only to narrow it.',
      inputSchema: {
        repo: z.string().min(1).max(200).describe('Repository as owner/name'),
        pr: z.number().int().positive().describe('Pull request number, not an internal id'),
        agent: z.string().min(1).max(200).optional().describe('Optional: only this agent (id or name)'),
        run_id: z.string().uuid().optional().describe('Optional: run id returned by run_agent_on_pr'),
        min_severity: z
          .enum(SEVERITIES)
          .optional()
          .describe('Optional: hide findings below CRITICAL, WARNING or SUGGESTION'),
      },
      annotations: READ_ONLY,
    },
    ({ repo, pr, agent, run_id, min_severity }) =>
      guard(deps, async () => {
        const r = await resolveRepo(deps.api, repo);
        if (!r.ok) return fail(resolutionText(r, { repo }));
        const p = await resolvePull(deps.api, r.repo.id, pr);
        if (!p.ok) return fail(resolutionText(p, { repo, pr }));

        let agentId: string | undefined;
        if (agent !== undefined) {
          const a = resolveAgent(await deps.api.listAgents(), agent);
          if (!a.ok) return fail(resolutionText(a, { repo, pr, agent }));
          agentId = a.agent.id;
        }

        const reviews = latestReviews(await deps.api.listReviews(p.pullId), {
          ...(agentId !== undefined ? { agentId } : {}),
          ...(run_id !== undefined ? { runId: run_id } : {}),
        });
        if (reviews.length > 0) {
          return ok(prFindings({ repo, pr }, reviews, min_severity !== undefined ? { minSeverity: min_severity } : {}));
        }
        if (run_id !== undefined) {
          const s = await runStatus(deps.api, p.pullId, run_id);
          if (!s) return fail(unknownRunText(run_id, repo, pr));
          if (s.status === 'running') return ok({ status: 'running', run_id });
          if (s.status === 'failed') return fail(runFailedText(run_id, s.error));
          if (s.status === 'cancelled') return fail(runCancelledText(run_id));
        }
        return fail(noReviewText(repo, pr));
      }),
  );
}
