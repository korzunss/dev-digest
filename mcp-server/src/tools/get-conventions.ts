import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { acceptedConventions } from '../core/conventions.js';
import { resolveRepo } from '../core/resolve.js';
import { fail, guard, ok, READ_ONLY, type ToolDeps } from './result.js';
import { resolutionText } from './messages.js';

export function registerGetConventions(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'get_conventions',
    {
      description:
        "Get the team-accepted coding conventions of a repository (rule, category, example file). Use them to judge whether code follows this repo's own style.",
      inputSchema: { repo: z.string().min(1).max(200).describe('Repository as owner/name') },
      annotations: READ_ONLY,
    },
    ({ repo }) =>
      guard(deps, async () => {
        const r = await resolveRepo(deps.api, repo);
        if (!r.ok) return fail(resolutionText(r, { repo }));
        const c = acceptedConventions(await deps.api.getConventions(r.repo.id));
        const hint = !c.scanned
          ? 'no scan yet — run one in the studio'
          : c.accepted.length === 0 && c.pending_count > 0
            ? `${c.pending_count} pending — accept them in the studio`
            : undefined;
        return ok(hint ? { ...c, hint } : c);
      }),
  );
}
