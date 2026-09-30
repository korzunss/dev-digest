/** stderr only — stdout is reserved for JSON-RPC. */
export const log = {
  info: (msg: string): void => {
    process.stderr.write(`[devdigest-mcp] ${msg}\n`);
  },
  error: (msg: string): void => {
    process.stderr.write(`[devdigest-mcp] ERROR ${msg}\n`);
  },
};
