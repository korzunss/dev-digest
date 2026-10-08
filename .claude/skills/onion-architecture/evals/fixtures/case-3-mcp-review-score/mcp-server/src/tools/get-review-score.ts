import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { createHttpApi } from '../http/client.js';
import { resolvePull, resolveRepo } from '../core/resolve.js';
import { scoreSummary } from '../core/score.js';
import { resolutionText } from './messages.js';
import { fail, guard, ok, READ_ONLY, type ToolDeps } from './result.js';

export function registerGetReviewScore(server: McpServer, deps: ToolDeps): void {
  const api = createHttpApi(process.env.DEVDIGEST_API_URL ?? 'http://127.0.0.1:3001');

  server.registerTool(
    'get_review_score',
    {
      description:
        'Get the latest review score of every agent on a pull request and whether the lowest one clears the pass score. Read-only.',
      inputSchema: {
        repo: z.string().min(1).max(200).describe('Repository as owner/name'),
        pr: z.number().int().positive().describe('Pull request number, not an internal id'),
      },
      annotations: READ_ONLY,
    },
    ({ repo, pr }) =>
      guard(deps, async () => {
        const r = await resolveRepo(api, repo);
        if (!r.ok) return fail(resolutionText(r, { repo }));
        const p = await resolvePull(api, r.repo.id, pr);
        if (!p.ok) return fail(resolutionText(p, { repo, pr }));
        const reviews = await api.listReviews(p.pullId);
        return ok(scoreSummary(reviews, repo, pr));
      }),
  );
}
