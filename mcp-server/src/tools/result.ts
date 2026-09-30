import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { ApiError } from '../core/errors.js';
import type { Clock, DevDigestApi } from '../core/ports.js';
import { apiErrorText } from './messages.js';

export interface ToolDeps {
  api: DevDigestApi;
  clock: Clock;
  waitMs: number;
  pollMs: number;
  /** Only used to name the API in the "not reachable" message. */
  apiUrl?: string;
}

export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** One compact-JSON text block. */
export function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

/** An error the agent can act on. Never a stack or a raw status. */
export function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/** Run a handler; turn any thrown error into a `fail` with a next step. */
export async function guard(deps: ToolDeps, fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return fail(apiErrorText(err, deps.apiUrl));
    return fail('Unexpected error in the DevDigest MCP server. Retry; if it persists, check the server stderr log.');
  }
}
