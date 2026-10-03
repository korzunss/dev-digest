import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { conciseBlast } from '../core/blast.js';
import { resolvePull, resolveRepo } from '../core/resolve.js';
import { blastDegradedHint, cut, resolutionText } from './messages.js';
import { fail, guard, ok, READ_ONLY, type ToolDeps } from './result.js';

export function registerGetBlastRadius(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'get_blast_radius',
    {
      description:
        "Map what a PR's changes affect: changed symbols, their callers (file:line), HTTP endpoints and crons, from the repo index. Call before judging a PR's risk or review scope.",
      inputSchema: {
        repo: z.string().min(1).max(200).describe('Repository as owner/name'),
        pr: z.number().int().positive().describe('Pull request number, not an internal id'),
      },
      annotations: READ_ONLY,
    },
    ({ repo, pr }) =>
      guard(deps, async () => {
        const r = await resolveRepo(deps.api, repo);
        if (!r.ok) return fail(resolutionText(r, { repo }));
        const p = await resolvePull(deps.api, r.repo.id, pr);
        if (!p.ok) return fail(resolutionText(p, { repo, pr }));
        const b = await deps.api.getBlast(p.pullId);
        const concise = conciseBlast(b, cut);
        return ok(b.degraded ? { ...concise, hint: blastDegradedHint(b.reason ?? 'no_data') } : concise);
      }),
  );
}
