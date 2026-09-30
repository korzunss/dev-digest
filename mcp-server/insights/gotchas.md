# mcp-server — current gotchas

Last reconciled with ../INSIGHTS.md: 2026-09-29

This is a curated index of rules still in force. Full write-ups live in
[`../INSIGHTS.md`](../INSIGHTS.md) (append-only log). A rule that stops holding
is edited or removed here. Items are added or updated by the
`engineering-insights` skill.

## Contracts
- **Import `zod/v3` in `src/tools/*.ts` and `src/index.ts`, keep the `paths` alias for `zod`, and use `import type` for shared contracts** — spot it: TS2322 "ZodNumber not assignable to AnySchema" on `registerTool` — [INSIGHTS: 2026-09-29 — plain `import { z } from 'zod'` fails typecheck against the MCP SDK](../INSIGHTS.md#2026-09-29--plain-import--z--from-zod-fails-typecheck-against-the-mcp-sdk-use-zodv3)

## Security
- **Every model- or PR-written string a tool returns goes through `cut()` (200 chars)** — spot it: a new output field copied straight from a `ReviewRecord`/convention — [INSIGHTS: 2026-09-29 — cap every model-written string](../INSIGHTS.md#2026-09-29--cap-every-model-written-string-before-it-reaches-the-agent-not-just-rationale)

## Tooling
- **Map both `TimeoutError` and `AbortError` to `ApiError(0, 'timeout')`** — spot it: an HTTP timeout surfaces as "DevDigest API error …" instead of "not reachable" — [INSIGHTS: 2026-09-29 — `AbortSignal.timeout` rejects with `TimeoutError`](../INSIGHTS.md#2026-09-29--abortsignaltimeout-rejects-with-timeouterror-not-aborterror)
