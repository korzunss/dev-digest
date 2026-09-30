import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { guard, ok, READ_ONLY, type ToolDeps } from './result.js';

const DESC_MAX = 120;

export function registerListAgents(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'list_agents',
    {
      description:
        'List the configured DevDigest reviewer agents (id, name, model, enabled). Use an id or name from here as `agent` in run_agent_on_pr and get_findings.',
      annotations: READ_ONLY,
    },
    () =>
      guard(deps, async () => {
        const agents = await deps.api.listAgents();
        return ok({
          agents: agents.map((a) => ({
            id: a.id,
            name: a.name,
            model: a.model,
            enabled: a.enabled,
            description: (a.description ?? '').slice(0, DESC_MAX),
          })),
        });
      }),
  );
}
