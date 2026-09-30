import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v3';
import { BLAST_TEXT } from './messages.js';
import { fail, READ_ONLY } from './result.js';

/** Stub: final schema and annotations, no I/O. Impact is UNKNOWN, never "none". */
export function registerGetBlastRadius(server: McpServer): void {
  server.registerTool(
    'get_blast_radius',
    {
      description:
        "NOT AVAILABLE YET — always returns an error. Will map what code a PR's changes affect. Never read its error as \"no impact\".",
      inputSchema: {
        repo: z.string().min(1).max(200).describe('Repository as owner/name'),
        pr: z.number().int().positive().describe('Pull request number, not an internal id'),
      },
      annotations: READ_ONLY,
    },
    () => fail(BLAST_TEXT),
  );
}
