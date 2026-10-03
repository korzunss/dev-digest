# mcp-server — current gotchas

Last reconciled with ../INSIGHTS.md: 2026-10-03

This is a curated index of rules still in force. Full write-ups live in
[`../INSIGHTS.md`](../INSIGHTS.md) (append-only log). A rule that stops holding
is edited or removed here. Items are added or updated by the
`engineering-insights` skill.

## Contracts
- **Import `zod/v3` in `src/tools/*.ts` and `src/index.ts`, keep the `paths` alias for `zod`, and use `import type` for shared contracts** — spot it: TS2322 "ZodNumber not assignable to AnySchema" on `registerTool` — [INSIGHTS: 2026-09-29 — plain `import { z } from 'zod'` fails typecheck against the MCP SDK](../INSIGHTS.md#2026-09-29--plain-import--z--from-zod-fails-typecheck-against-the-mcp-sdk-use-zodv3)

## Security
- **Every model- or PR-written string a tool returns goes through `cut()` (200 chars)** — spot it: a new output field copied straight from a `ReviewRecord`/convention — [INSIGHTS: 2026-09-29 — cap every model-written string](../INSIGHTS.md#2026-09-29--cap-every-model-written-string-before-it-reaches-the-agent-not-just-rationale)

## Tooling
- **A read-only tool failing with "Review rate limit reached (10/min)" usually hit the API's global 120/min limit** — `messages.ts` maps every 429 to the review message; throttle your own scripted calls to `:3001` or wait a minute — spot it: `get_findings`/`get_blast_radius` reports the review limit although no review was started — [INSIGHTS: 2026-10-03 — "Review rate limit reached (10/min)" from a read-only tool](../INSIGHTS.md#2026-10-03--review-rate-limit-reached-10min-from-a-read-only-tool-means-the-apis-global-120min-limit)
- **Keep a blocking tool call under the MCP client's 60 s request timeout** (`DEVDIGEST_MCP_WAIT_MS` ≤ 50 000, poll sleep clamped to the deadline, stop on `extra.signal`) — spot it: `run_agent_on_pr` times out on the client with no `run_id` while a paid run keeps going — [INSIGHTS: 2026-09-30 — a `run_agent_on_pr` wait budget above ~50 s loses the `run_id` of a paid run](../INSIGHTS.md#2026-09-30--a-run_agent_on_pr-wait-budget-above-50-s-loses-the-run_id-of-a-paid-run)
- **Map both `TimeoutError` and `AbortError` to `ApiError(0, 'timeout')`, in the `fetch()` catch *and* the `res.json()` catch** — spot it: an HTTP timeout surfaces as "DevDigest API error …" instead of "not reachable", or a 2xx turns into "Unexpected error" — [INSIGHTS: 2026-09-29 — `AbortSignal.timeout` rejects with `TimeoutError`](../INSIGHTS.md#2026-09-29--abortsignaltimeout-rejects-with-timeouterror-not-aborterror)
