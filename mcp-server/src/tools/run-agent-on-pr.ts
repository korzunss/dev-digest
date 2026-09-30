import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { conciseReview } from '../core/findings.js';
import { resolveAgent, resolvePull, resolveRepo } from '../core/resolve.js';
import { runAndWait } from '../core/run-review.js';
import { resolutionText, runCancelledText, runFailedText } from './messages.js';
import { fail, guard, ok, type ToolDeps } from './result.js';

export function registerRunAgentOnPr(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      description:
        'Run one reviewer agent on a pull request and return its verdict and top findings. Starts a paid LLM review; if it takes longer than ~45 s, returns status "running" — then call get_findings.',
      inputSchema: {
        repo: z.string().min(1).max(200).describe('Repository as owner/name'),
        pr: z.number().int().positive().describe('Pull request number, not an internal id'),
        agent: z.string().min(1).max(200).describe('Agent id or name from list_agents'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    ({ repo, pr, agent }, extra) =>
      guard(deps, async () => {
        const r = await resolveRepo(deps.api, repo);
        if (!r.ok) return fail(resolutionText(r, { repo }));
        const p = await resolvePull(deps.api, r.repo.id, pr);
        if (!p.ok) return fail(resolutionText(p, { repo, pr }));
        const a = resolveAgent(await deps.api.listAgents(), agent);
        if (!a.ok) return fail(resolutionText(a, { repo, pr, agent }));

        const out = await runAndWait(
          deps.api,
          deps.clock,
          { pullId: p.pullId, agentId: a.agent.id },
          { budgetMs: deps.waitMs, pollMs: deps.pollMs, signal: extra.signal },
        );
        switch (out.status) {
          case 'done':
            return ok({ status: 'done', ...conciseReview(out.review) });
          case 'running':
            return ok({
              status: 'running',
              run_id: out.runId,
              next: 'Call get_findings with the same repo and pr (and run_id) in a minute.',
            });
          case 'failed':
            return fail(runFailedText(out.runId, out.error));
          case 'cancelled':
            return fail(runCancelledText(out.runId));
        }
      }),
  );
}
