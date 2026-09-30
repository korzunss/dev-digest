import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v3';
import { createHttpApi } from './http/client.js';
import { log } from './log.js';
import { buildServer } from './server.js';

const Env = z.object({
  DEVDIGEST_API_URL: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//.test(u), 'must be http(s)')
    .default('http://127.0.0.1:3001'),
  DEVDIGEST_MCP_WAIT_MS: z.coerce.number().int().min(0).max(600_000).default(45_000),
  DEVDIGEST_MCP_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(2_000),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  log.error(`invalid environment: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  process.exit(1);
}
const env = parsed.data;

const clock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

const server = buildServer({
  api: createHttpApi(env.DEVDIGEST_API_URL),
  clock,
  waitMs: env.DEVDIGEST_MCP_WAIT_MS,
  pollMs: env.DEVDIGEST_MCP_POLL_MS,
  apiUrl: env.DEVDIGEST_API_URL,
});

log.info(`starting, API ${env.DEVDIGEST_API_URL}`);
await server.connect(new StdioServerTransport());
