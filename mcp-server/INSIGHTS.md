# Insights — `@devdigest/mcp-server`

Append-only. Things that cost someone time in the MCP server. Repo-wide findings go
in [`../INSIGHTS.md`](../INSIGHTS.md), which carries the entry format, the section
guide and the promotion rule (a standing rule becomes one line under `Gotchas` in
`mcp-server/AGENTS.md`). The `engineering-insights` skill writes here.

```md
### YYYY-MM-DD — short title
**Symptom:** what you observed.
**Cause:** why it happened.
**Rule:** what to do from now on.
**Evidence:** `path/to/file.ts:42` · command · error string
```

---

## What Works

_Nothing yet._

## What Doesn't Work

_Nothing yet._

## Codebase Patterns

### 2026-09-29 — cap every model-written string before it reaches the agent, not just `rationale`
**Symptom:** security review SF1: `title`, `category` (findings) and `rule` (conventions) went to Claude Code uncapped, while only `rationale` was cut.
**Cause:** the shared contracts declare these as bare `z.string()` (`server/src/vendor/shared/contracts/findings.ts:63`). The text is reviewer-model output built from an attacker's PR diff or body, and MCP makes it the input of a second agent that has shell tools. That is an LLM-to-LLM path, and the contract gives no length guarantee.
**Rule:** every free-text field this server returns that the model or the PR author wrote goes through `cut()` (200 chars, `src/core/findings.ts:49`). When a tool starts returning a new string field, cap it and add a test.
**Evidence:** `src/core/findings.ts:56-60` · `src/core/conventions.ts:27` · plan 06 Verification log, SF1

## Tool & Library Notes

### 2026-09-30 — a `run_agent_on_pr` wait budget above ~50 s loses the `run_id` of a paid run
**Symptom:** with `DEVDIGEST_MCP_WAIT_MS` raised past a minute, a slow review ends on the agent side with a request timeout and no `run_id`. The review keeps running (and billing) on the server, and the agent's natural next move is to call the tool again, which starts a second paid run.
**Cause:** the MCP SDK's client-side `DEFAULT_REQUEST_TIMEOUT_MSEC` is `60000` (`node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.js:8`). The tool's time is the wait budget, plus the resolve calls, plus the last poll (two 10 s HTTP calls). The poll loop also used to overrun the budget by up to one `pollMs`.
**Rule:** keep the whole `run_agent_on_pr` call under 60 s. The env bound is `.max(50_000)`, and `runAndWait` clamps its sleep to the time left and stops on `extra.signal`. Any new blocking tool must return a handle (`run_id`) before the client's timeout, rather than wait for completion.
**Evidence:** `src/index.ts:13-14` · `src/core/run-review.ts:44-46` · `docs/plans/06-mcp-server.md` → SR8, SR9

### 2026-09-29 — plain `import { z } from 'zod'` fails typecheck against the MCP SDK; use `zod/v3`
**Symptom:** `registerTool` input schemas fail `pnpm typecheck` with TS2322 "ZodNumber not assignable to AnySchema", TS2589, and implicit-any handler args.
**Cause:** `tsconfig.json:24-25` aliases `zod` → `./node_modules/zod`, so the `zod` types seen through the alias and the ones the SDK resolves have different identities. The alias is still required: `../server/src/vendor/shared` imports runtime `zod`, and the `mcp-server` CI job never installs `server/node_modules`, so without the alias the shared types would not resolve in CI.
**Rule:** in `src/tools/*.ts` and `src/index.ts`, import `zod/v3`. Keep the `paths` alias for `zod` and `zod/*`. Import shared contracts with `import type` only, so a second zod install never loads at runtime.
**Evidence:** `tsconfig.json:24-25` · `src/tools/get-findings.ts:2` · `src/index.ts:2` · `server/src/vendor/shared/contracts/findings.ts:1`

### 2026-09-29 — `AbortSignal.timeout` rejects with `TimeoutError`, not `AbortError`
**Symptom:** a fetch timeout check on `err.name === 'AbortError'` alone misses the 10 s HTTP timeout, which then surfaces as a generic error with no next step.
**Cause:** Node's `AbortSignal.timeout(ms)` aborts with a `DOMException` named `TimeoutError`. Only a manual `controller.abort()` gives `AbortError`.
**Rule:** map both names to `ApiError(0, 'timeout')`.
**Evidence:** `src/http/client.ts:34`
**Addendum (2026-09-30):** the same signal also covers reading the body. A header-then-stall response rejects inside `res.json()`, not `fetch()`, so that catch needs the same mapping. Swallowing it returned `undefined` on a 2xx, and a caller then crashed with "Unexpected error". Evidence: `src/http/client.ts:40-44` · `docs/plans/06-mcp-server.md` → SR7.

## Recurring Errors & Fixes

### 2026-10-03 — "Review rate limit reached (10/min)" from a read-only tool means the API's global 120/min limit
**Symptom:** during plan 19's manual check, `get_findings` (read-only, starts no review) failed with "Review rate limit reached (10/min). Wait a minute…"; the same call succeeded a minute later.
**Cause:** `apiErrorText` maps every HTTP 429 to the review message (`src/tools/messages.ts:15-16`), but the API has two limits: 10/min on `POST /pulls/:id/review` (`server/src/modules/reviews/routes.ts:29`) and a global 120/min on every route (`server/src/app.ts:96`). ~200 scripted `curl` reads from the same host used up the global one.
**Rule:** when a read tool reports the review limit, first suspect the global 120/min limit — usually your own scripted calls to `:3001`. Throttle the script or wait a minute. Do not lower the MCP poll interval to "recover". Fixing the message needs the 429 body or route to tell the two limits apart (not done; out of plan 19's scope).
**Evidence:** `mcp-server/src/tools/messages.ts:15` · `server/src/app.ts:96` · `docs/plans/19-mentor-review-followups.md` → *Verification log* (manual check, side note)

## Session Notes

_Nothing yet._

## Open Questions

### 2026-09-29 — remove the SDK's `minimumReleaseAgeExclude` once 1.31.0 is past the cooldown
**Symptom:** the first `pnpm install` (pnpm 12) wrote `minimumReleaseAgeExclude: ['@modelcontextprotocol/sdk@1.31.0']` into `pnpm-workspace.yaml`. It also stopped with `ERR_PNPM_IGNORED_BUILDS` until `allowBuilds.esbuild: true` was set, which mirrors `server/pnpm-workspace.yaml`.
**Cause:** 1.31.0 was newer than the release-age cooldown, so pnpm exempted exactly that version.
**Rule:** when the SDK is next bumped, or 1.31.0 is old enough, drop the exclude line and reinstall. Don't carry it forward to a new version.
**Evidence:** `mcp-server/pnpm-workspace.yaml` · plan 06 Verification log, P1
