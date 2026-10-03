# mcp-server/ — `@devdigest/mcp-server`

A local **stdio MCP server**: a thin HTTP client over the DevDigest API that gives
Claude Code five review tools. Package manager: **pnpm**.

## Commands

`pnpm test` (vitest, hermetic, <1 s) · `pnpm typecheck` — typecheck is the build;
the package never emits JS · `pnpm start` (stdio server) · `pnpm inspect` (MCP Inspector).

## Map

```
src/core/ports.ts      DevDigestApi port + Clock
src/core/errors.ts     ApiError { status, code }
src/core/resolve.ts    resolveRepo · resolvePull · resolveAgent (matching, pure)
src/core/findings.ts   latestReviews · conciseReview (sort, cap 20, truncate) · prFindings (PR picture, total_findings)
src/core/conventions.ts  acceptedConventions
src/core/run-review.ts runAndWait (trigger once, bounded poll) · runStatus
src/http/client.ts     createHttpApi — the only I/O (fetch)
src/tools/*.ts         one file per tool + result.ts · messages.ts
src/server.ts          buildServer — registers the 5 tools + instructions
src/index.ts           composition root — the only process.env reader
src/log.ts             stderr-only logging
test/                  unit tests, fakes.ts, harness.ts (in-memory MCP client)
```

## Conventions (non-default)

- **Layering (onion).** `core/` is pure: imports only shared *types* and itself — no
  `http/`, `tools/`, SDK, `fetch`, `process.env` or timers. `tools/` and `server.ts`
  never import `http/` or `fetch`. Only `index.ts` wires them.
- **Shared contracts are `import type` only** (`@devdigest/shared`) — never
  redefined, never runtime-imported.
- **stdout is JSON-RPC only.** Log through `src/log.ts` (stderr); never
  `console.log` or `process.stdout`.
- **Zod imports are `zod/v3`** in tools and `index.ts` (see Gotchas).
- **Footprint budget:** `tools/list` + `instructions` ≤ 6,000 chars; descriptions
  ≤200 chars. `test/server.test.ts` enforces it.
- **Read tools are GET-only**, pinned by a unit test; only `run_agent_on_pr` POSTs.
- **When a tool is added, renamed or changes side effects, re-review the allowlist**
  in `.claude/settings.json` (`allow` = reads, `ask` = `run_agent_on_pr`).
- Results, not operations: concise `{verdict, findings[]}`; every failure is
  `isError:true` with a next step, never a raw status or stack.

## Gotchas

- Plain `zod` fails typecheck (TS2322) against the SDK under the tsconfig `paths`
  alias — a different type identity; use `zod/v3`.
- `AbortSignal.timeout` aborts with `name === 'TimeoutError'`, not `AbortError`.
- Tests use `@modelcontextprotocol/sdk/inMemory.js`; vitest needs no alias because
  shared imports are type-only.

## Read on demand

- Setup, tools, env → `README.md`
- Rules in force (read first) → `insights/gotchas.md`; solved bugs and surprises → `INSIGHTS.md`
- Plan and decisions → `../docs/plans/06-mcp-server.md`
