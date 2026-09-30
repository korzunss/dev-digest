import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** Connect an SDK client to `server` over the in-memory transport. */
export async function connect(server: McpServer): Promise<Client> {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

export function textOf(res: unknown): string {
  const c = (res as { content: { type: string; text: string }[] }).content;
  return c.map((x) => x.text).join('');
}
