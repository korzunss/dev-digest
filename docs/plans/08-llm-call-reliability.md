# Development Plan: LLM call reliability — routing, deadline, output cap, stall visibility, large-diff split
Status: done
Save as: docs/plans/08-llm-call-reliability.md
Spec: none

## Goal & acceptance criteria
Bounded calls (the SDK `timeout` stops at the headers, `openrouter.ts:55`), routing to fast strict endpoints (the routed provider drives duration — *Experiment → D6*), an output safety cap (`run.ts:207-214` sends none), visible stalls/retries/truncation/served-by, no single call for a huge diff (`run.ts:138-144`), mid-call cancel.
- AC1: a call with no answer is aborted at `REVIEW_CALL_DEADLINE_MS` (10 min) with a run-log `error` line naming model and deadline, then retried once (AC7).
- AC2: every OpenRouter review call sends `max_tokens: 32000`, `provider.require_parameters: true` (today only `intent/classify.ts:185` sends it) and `provider.sort: "throughput"`.
- AC3: `finish_reason: "length"` fails the call at once with `LlmOutputTruncatedError`, with no reprompt. Its message names the cap and the output tokens. A schema failure after all reprompts is `LlmOutputInvalidError`.
- AC4: while a call is in flight, an `info` line appears every `LLM_WAIT_HEARTBEAT_MS`. Every abort and retry has its own line. The per-chunk result line shows output tokens and seconds.
- AC5: a diff above `REVIEW_SINGLE_PASS_MAX_DIFF_TOKENS` with more than one file runs map-reduce even for a `single-pass` agent, and logs why. A single oversized file stays single-pass with a warning line.
- AC6: `POST /runs/:id/cancel` aborts the in-flight call's `req.signal`, and the run ends `cancelled`.
- AC7: a deadline or transient error is retried once, without `sort` (`require_parameters` kept); cancel/truncated/invalid never are. SDK retries are off (`maxRetries: 0`).
- AC8: the run log shows routing, cap and deadline once per run, and `served by <provider>` on each chunk's result line (the response's top-level `provider`).

## Decisions needed
None open — see *Decisions recorded* (resolved options: below the marker, *Resolved decision options*).

## Decisions recorded
User, 2026-09-30: "08 — усі за рекомендацією" — every recommendation accepted.

| # | Choice |
|---|---|
| D1 | A — per-call deadline is a server constant in `server/src/modules/reviews/constants.ts` (value fixed in pass 2), passed as an `AbortSignal` in `req.signal` |
| D2 | A — global defaults: `maxTokens` + OpenRouter `reasoning: { max_tokens }` via a new optional provider-neutral request field (contract + client mirror, no migration) — **superseded 2026-09-30, see below** |
| D3 | A — one automatic retry with a fresh deadline, a run-log line per abort/retry; SDK `maxRetries: 0` so reviewer-core owns and logs retries — **superseded 2026-09-30, see below** |
| D4 | A — size guard in `selectMode`: above a token threshold any strategy switches to map-reduce, with its own run-log line (threshold fixed in pass 2) |
| D5 | A — per-run `AbortController` in `RunBus`, combined with the deadline via `AbortSignal.any` into one `req.signal` |

User, 2026-09-30 (after the probe + routing research): "усі пропозиції підтримую" — every recommendation of the revised table accepted. **Supersedes D2 and D3; D6c sets D1's value.**

| # | Choice |
|---|---|
| D6a | A — `provider.sort: "throughput"`, plus `require_parameters: true` on every review call |
| D6b | A — global routing constants (not per agent) |
| D6c | A — per-call deadline 10 min (value for D1) |
| D6d | B — `max_tokens` safety cap 32k |
| D7 | D — retry once on deadline and transient errors; the retry drops `sort` (keeps `require_parameters`) so OpenRouter's default load balancing likely picks another provider; streaming prototype is a follow-up, not this plan |
| D2 | superseded by D6a–D6d — no `reasoning` field (probe: `effort` has no effect on this model) |
| D3 | superseded by D7 |

## Prerequisites
- Postgres/Docker up for the G3 `.it` test.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S3 | shared contract (+ client mirror) · reviewer-core provider | — | `LlmRouting`, `StructuredRequest.routing`, `StructuredResult.servedBy`; the three `Llm*Error` classes + `isTransientLlmError` exported from `src/index.ts`; SDK `maxRetries` default 0 |
| G2 | S4–S6 | reviewer-core engine + pipeline doc | G1 | new `ReviewInput` fields `signal`, `callDeadlineMs`, `maxOutputTokens`, `requireParameters`, `routing`, `retryRouting`, `singlePassMaxDiffTokens`; exported `DEFAULT_SINGLE_PASS_MAX_DIFF_TOKENS`, `LLM_WAIT_HEARTBEAT_MS` |
| G3 | S7–S9 | server platform + reviews module + `.it` test | G2 | — |

## Steps
### S1 — Routing hint on `StructuredRequest`, served-by on `StructuredResult`  [Contract]
- **Files:** `server/src/vendor/shared/adapters.ts` (modify) · `client/src/vendor/shared/adapters.ts` (modify)
- **Change:**
  - Above `StructuredRequest` add `export interface LlmRouting { sort?: 'throughput' | 'latency' | 'price' }`. Doc comment: routing hint for gateway providers (OpenRouter maps it into its `provider` object); direct providers ignore it; `{}` = the gateway's default balancing.
  - `StructuredRequest` gains `routing?: LlmRouting` right after `requireParameters`.
  - `StructuredResult` gains `servedBy?: string` after `costSource` — the upstream provider that answered, when the gateway reports it; undefined otherwise.
  - Mirror the same edits into the client copy, anchored on its `requireParameters` block (`client/src/vendor/shared/adapters.ts:72-77`) and its `StructuredResult`.
- **Layer / why here:** port fields in `@devdigest/shared` change first; `reviewer-core` resolves shared through its tsconfig alias.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** no vendor name in the type names; optional fields only; targeted edits in the client, never a folder copy; nothing else in either file changes.
- **Known gotchas:** the vendored copies have drifted (root `INSIGHTS.md` 2026-09-17 "two vendored `shared` copies"); TS2719 on a fixture factory → root `INSIGHTS.md` 2026-09-17 TS2719.
- **Done when:** `cd reviewer-core && npm run typecheck` · `cd server && pnpm typecheck` · `cd client && pnpm typecheck` · `grep -c "routing?: LlmRouting" …/adapters.ts` and `grep -c "servedBy?: string" …/adapters.ts` print 1 for each of the two files.

### S2 — Typed LLM failure classes in reviewer-core
- **Files:** `reviewer-core/src/llm/errors.ts` (create) · `reviewer-core/src/index.ts` (modify) · `reviewer-core/test/llm-errors.test.ts` (create)
- **Change:** in `errors.ts`:
  - `LlmDeadlineError` (`model`, `deadlineMs`): `LLM call to <model> got no answer within <N> s and was aborted`.
  - `LlmOutputTruncatedError` (`model`, `maxTokens`, `tokensOut`): `<model> hit the output cap (max_tokens=<cap>) after <tokensOut> output tokens before finishing its answer`.
  - `LlmOutputInvalidError` (`model`, `schemaName`, `attempts`): keeps `OpenRouter structured output failed schema validation for <schemaName>`.
  - Each sets `this.name` to its class name.
  - `isTransientLlmError(err: unknown): boolean`: true when a numeric `status` or `statusCode` is 408, 429 or ≥ 500, or `name` is `APIConnectionError` / `APIConnectionTimeoutError`. False for the three classes above and for any `AbortError` / `APIUserAbortError`.
  - Export all four from `src/index.ts`, next to the `OpenRouterProvider` export (`index.ts:91`).
- **Layer / why here:** pure engine types; they are classified by duck-typing, so the module does not import `openai`.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** no `openai` import in `errors.ts`; messages carry model, numbers and schema name only — never prompt or response text.
- **Known gotchas:** purity: no `fetch`, `process.env` or node I/O in new files (`reviewer-core/insights/gotchas.md` → *Engine invariants*).
- **Done when:** `cd reviewer-core && npm run typecheck && npm test`. `llm-errors.test.ts` covers `isTransientLlmError` for 429, 503, 400, `APIConnectionTimeoutError`, `AbortError` and each typed class.

### S3 — `OpenRouterProvider`: routing body, served-by, truncation class, SDK retries off
- **Files:** `reviewer-core/src/llm/openrouter.ts` (modify) · `reviewer-core/test/openrouter.test.ts` (modify)
- **Change:**
  - (a) Default `maxRetries` becomes `opts.maxRetries ?? 0` (`:56`). Update the `timeoutMs` doc comment (`:33`): the SDK no longer retries, and the timeout bounds the headers only.
  - (b) Replace the `require_parameters` spread (`:87-89`) with one `provider` object, sent only when `this.id === 'openrouter'` and at least one key is set: `require_parameters` (from `req.requireParameters`) plus `sort` from `req.routing`.
  - (e) Set `servedBy` on the result from the response's top-level `provider` when it is a non-empty string (`(res as { provider?: unknown }).provider`; undocumented field — Routing research), else omit it.
  - (c) After the usage is accumulated (`:107-111`) and before `parseWithRepair`: if `choice.finish_reason === 'length'`, throw `LlmOutputTruncatedError` (with `maxTokens: req.maxTokens`, `tokensOut`). No reprompt.
  - (d) Replace the final `throw new Error(...)` (`:138`) with `LlmOutputInvalidError`.
- **Layer / why here:** the provider is the only code that sees `finish_reason` and the wire body.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** extra body fields go in via spread, like `session_id` (`:84`); `signal` stays in the request options, never in the body.
- **Known gotchas:** the SDK `timeout` stops at the response headers (`reviewer-core/insights/gotchas.md` → *LLM transport*). Do not rely on it for the deadline.
- **Done when:** `cd reviewer-core && npm run typecheck && npm test`. `openrouter.test.ts` asserts: `provider` = `{ require_parameters, sort }` for openrouter, absent for `id: 'openai'` or when unset (existing tests stay green); `servedBy` mirrors a mocked top-level `provider`; `finish_reason: 'length'` → `LlmOutputTruncatedError` after one call; three invalid answers → `LlmOutputInvalidError`.

### S4 — Per-call deadline, heartbeat and retry wrapper
- **Files:** `reviewer-core/src/review/llm-call.ts` (create) · `reviewer-core/test/llm-call.test.ts` (create)
- **Change:** `export async function callWithDeadline<T>(o: { llm: LLMProvider; request: Omit<StructuredRequest<T>, 'signal'>; retryRouting?: LlmRouting; deadlineMs?: number; signal?: AbortSignal; label: string; emit: (kind: RunEventKind, msg: string) => void; checkCancelled?: () => void }): Promise<StructuredResult<T>>`. Also `export const LLM_WAIT_HEARTBEAT_MS = 120_000` (assumption) and `export function describeRouting(r?: LlmRouting, requireParameters?: boolean): string` (e.g. `sort=throughput · require_parameters`, `default` when empty).
- Per attempt: a deadline `AbortController` + `setTimeout(abort, deadlineMs)` (when set); `signal = AbortSignal.any([o.signal?, ctl.signal])`; a `setInterval` heartbeat `info` `<label>: still waiting for <model> — <m> min elapsed (deadline <D> min)`; `llm.completeStructured({ ...request, signal })`; both timers cleared in `finally`.
- On error, decide by **signal state, not error class**: `o.signal?.aborted` → call `o.checkCancelled?.()`, then throw `o.signal.reason ?? err`. Deadline aborted → emit `error` `<label>: no answer from <model> within <D> min — aborted` and treat as `LlmDeadlineError`, whatever the raw error is (`AbortError`, `APIUserAbortError`, `DOMException`…). Otherwise rethrow.
- Retry (D7): at most once, on `LlmDeadlineError` or `isTransientLlmError`; never on cancel, truncated or invalid. The retry gets a fresh deadline, `routing` replaced by `o.retryRouting` when given (`requireParameters` kept), and emits `info` `<label>: retrying once (<error name>) · routing <describeRouting(...)>`. A second failure is thrown.
- **Layer / why here:** engine orchestration; purity allows timers (not I/O). The provider stays single-call.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:** `setTimeout` + `AbortController`, **not** `AbortSignal.timeout` (fake timers must drive it); timers cleared in `finally`; log lines hold label, model, minutes and error `name` only — no prompt/diff/response text or raw provider message (A09); without `deadlineMs` it equals a bare call with signal passthrough.
- **Known gotchas:** the SDK `timeout` stops at the headers, and the abort during the body read surfaces as a raw `AbortError` (Research Q2; `reviewer-core/insights/gotchas.md` → *LLM transport*).
- **Done when:** `cd reviewer-core && npm run typecheck && npm test`. `llm-call.test.ts` (fake timers; fake provider rejecting `{ name: 'AbortError' }` on abort): deadline → `error` line; external abort → `checkCancelled`'s error; heartbeats at 2 and 4 min; 503 then success → one retry line; deadline then success → 2nd request has `retryRouting`; two deadlines → `LlmDeadlineError` after exactly 2 calls; truncation → 1 call.

### S5 — Wire the wrapper, caps and size guard into `reviewPullRequest`
- **Files:** `reviewer-core/src/review/run.ts` (modify) · `reviewer-core/src/index.ts` (modify) · `reviewer-core/test/run-reliability.test.ts` (create)
- **Change:**
  - `ReviewInput` gains `signal?: AbortSignal`, `callDeadlineMs?: number`, `maxOutputTokens?: number`, `requireParameters?: boolean`, `routing?: LlmRouting`, `retryRouting?: LlmRouting` and `singlePassMaxDiffTokens?: number`, with doc comments. Also `export const DEFAULT_SINGLE_PASS_MAX_DIFF_TOKENS = 100_000` (assumption; see Design notes).
  - Once, before the chunk loop, emit `info` `LLM call: <model> · routing <describeRouting(routing, requireParameters)> · max_tokens=<n|none> · deadline <m> min|none`.
  - The loop at `run.ts:207-214` calls `callWithDeadline` with `request: { model, schema, schemaName, messages, maxRetries, sessionId?, maxTokens: input.maxOutputTokens, requireParameters: input.requireParameters, routing: input.routing }` and `retryRouting: input.retryRouting`.
  - `diffTokens` = `input.countTokens?.(diff.raw) ?? Math.ceil(diff.raw.length / 4)`.
  - `selectMode` returns `{ mode, reason: 'strategy' | 'size-guard' | 'oversize-single-file' }`: after the strategy rules, a `single-pass` result with `diffTokens > threshold` becomes `map-reduce` when >1 file, else stays single-pass. Emit `info` `Diff is ~<k>k tokens (> <T>k) → map-reduce over <n> files instead of one pass` / `Diff is ~<k>k tokens in one file — cannot split; reviewing in one pass`.
  - The per-chunk `result` line becomes `<label>: <n> candidate finding(s) · <tokensOut> output tokens · <s> s` + ` · served by <servedBy>` when `res.servedBy` is set.
  - Export `DEFAULT_SINGLE_PASS_MAX_DIFF_TOKENS` and `LLM_WAIT_HEARTBEAT_MS` from `index.ts` (next to the `reviewPullRequest` export).
- **Layer / why here:** mode selection and per-call options belong to the engine; the values come from the caller (D1).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** all new inputs are optional, and an input without them behaves as today apart from the size guard; `checkCancelled` stays as the pre-chunk checkpoint; `mapThresholdLines` semantics are unchanged.
- **Known gotchas:** only `msg` reaches the stored run log, so numbers go into the message string (`server/insights/gotchas.md` → *Run log*).
- **Done when:** `cd reviewer-core && npm run typecheck && npm test` (existing `run.test.ts` unchanged). `run-reliability.test.ts`: `single-pass` + 2 files + `singlePassMaxDiffTokens: 10` → 2 calls + size-guard line; 1 file over → 1 call + warning; request carries `maxTokens`, `requireParameters`, `routing`; settings line once; `servedBy: 'AtlasCloud'` → `served by AtlasCloud`; aborted `signal` → `checkCancelled`'s error.

### S6 — Update the pipeline deep-dive
- **Files:** `reviewer-core/docs/pipeline.md` (modify)
- **Change:** *Mode selection* gets the size guard and the correct `selectMode` lines. *The LLM call* gets deadline, heartbeat, retry + retry routing, routing/`require_parameters`/`max_tokens`, `servedBy`, the error classes, SDK `maxRetries: 0`. *How to test* lists `llm-call.test.ts`, `run-reliability.test.ts` and `llm-errors.test.ts`.
- **Layer / why here:** the doc describes the code (docs follow code).
- **Skills to apply:** none
- **Practices:** cite `path:line` from the edited code; no claims beyond the code.
- **Known gotchas:** a Done-when grep for a phrase fails when Markdown wraps it (root `INSIGHTS.md` 2026-09-28): grep single words.
- **Done when:** `grep -c "callWithDeadline" reviewer-core/docs/pipeline.md` ≥ 1 · `grep -c "DEFAULT_SINGLE_PASS_MAX_DIFF_TOKENS" reviewer-core/docs/pipeline.md` ≥ 1.

### S7 — `RunBus` owns a per-run `AbortController`
- **Files:** `server/src/platform/sse.ts` (modify) · `server/test/run-bus.test.ts` (create)
- **Change:**
  - Add `private controllers = new Map<string, AbortController>()`.
  - `signalFor(runId): AbortSignal` creates the controller lazily. If `cancelled.has(runId)`, it returns an already-aborted signal.
  - `cancel(runId)` also calls `controllers.get(runId)?.abort(new Error('Run cancelled'))`.
  - `complete(runId)` deletes the controller (after abort, if any).
  - Update the `cancel` doc comment (`:26-27`): the abort now reaches the in-flight call.
- **Layer / why here:** platform. `RunBus` already owns the cancel state; the platform must not import `RunCancelledError` from a module.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** `cancelRun` calls `cancel()` then `complete()` at once (`reviews/service.ts:87-89`) and `complete()` clears `cancelled` (`sse.ts:79`), so abort synchronously inside `cancel()`.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/run-bus.test.ts`. The test covers: `cancel` aborts a previously issued signal; `signalFor` after `cancel` is already aborted; `complete` then `signalFor` returns a fresh, un-aborted signal.

### S8 — Server constants and executor wiring
- **Files:** `server/src/modules/reviews/constants.ts` (modify) · `server/src/modules/reviews/run-executor.ts` (modify)
- **Change:**
  - `constants.ts` adds, each with a one-line doc comment:
    - `REVIEW_CALL_DEADLINE_MS = 600_000` (D6c) · `REVIEW_MAX_OUTPUT_TOKENS = 32_000` (D6d);
    - `REVIEW_ROUTING: LlmRouting = { sort: 'throughput' }` (D6a) · `REVIEW_RETRY_ROUTING: LlmRouting = {}` (D7: default load balancing);
    - `REVIEW_SINGLE_PASS_MAX_DIFF_TOKENS = 100_000` (assumption).
  - In `runOneAgent`, before `reviewPullRequest` (`run-executor.ts:251`): `const cancelSignal = this.container.runBus.signalFor(runId)`. Pass `signal: cancelSignal`, `callDeadlineMs`, `maxOutputTokens`, `requireParameters: true`, `routing`, `retryRouting`, `singlePassMaxDiffTokens`.
  - `checkCancelled` (`:281-283`) throws `RunCancelledError` when `cancelSignal.aborted || runBus.isCancelled(runId)`.
  - Update the `RunCancelledError` doc comment (`:18`) to "between chunks or mid-call".
  - The catch block (`:377-400`) stays: the typed errors' messages already name the cause.
- **Layer / why here:** D1: values are server constants; the executor is the application layer that owns I/O and passes them to the pure engine.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** `LlmRouting` is imported as a type from `@devdigest/shared`; routing is sent for every provider id and ignored by the direct OpenAI/Anthropic adapters (Design notes); there is no new container dependency; the executor imports nothing from `src/adapters/**`.
- **Known gotchas:** a `runLog.info(msg, data)` persists only `msg` (`server/insights/gotchas.md` → *Run log*).
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` green.

### S9 — Integration test: mid-call cancel and truncation surface
- **Files:** `server/test/run-cancel.it.test.ts` (create)
- **Change:** harness as in `server/test/reviews.it.test.ts:1-130` (`startPg`, `seed`, `buildApp` + `isolatedTestConfig`, skip without Docker). `overrides.llm.openai` = a custom `LLMProvider` that records `req.signal` and rejects with `{ name: 'AbortError' }` only when it aborts. Case 1: create an agent, `POST /pulls/:id/review`, poll until called, `POST /runs/:id/cancel` → signal `aborted` within 2 s, `agent_runs` row `cancelled`. Case 2: provider throws `LlmOutputTruncatedError` → run `failed`, `error` contains `output cap`.
- **Layer / why here:** only an `.it` run exercises executor + RunBus + route together.
- **Skills to apply:** `typescript-expert`
- **Practices:** poll with your own timeout and throw on it; stub `overrides.secrets` or use `isolatedTestConfig()` so no real key is reachable.
- **Known gotchas:** a hermetic `.it` test must not reach a real API key, and `waitForPrRuns` returns silently on timeout (`server/insights/gotchas.md` → *Tests*).
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/run-cancel.it.test.ts` (Postgres up) green.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `llm-errors.test.ts` | unit | transient classification | S2 |
| `openrouter.test.ts` | unit | `provider` body, served-by, truncated, invalid (AC2, AC3, AC8) | S3 |
| `llm-call.test.ts` | unit | AC1, AC4, AC7 | S4 |
| `run-reliability.test.ts` | unit | AC2, AC5, AC8 | S5 |
| `server/test/run-bus.test.ts` | unit | controller lifecycle | S7 |
| `server/test/run-cancel.it.test.ts` | integration | AC3, AC6 | S9 |

## Migrations & contracts
No migration. Contract: `LlmRouting`, `StructuredRequest.routing`, `StructuredResult.servedBy` in S1 (server shared + targeted client mirror). No `reasoning` field (D2 superseded).

## Out of scope
- Streaming; per-agent settings, agent fields, migrations; `reasoning.effort`.
- A live endpoints-API routing adapter; streaming prototype (follow-ups).
- `server/src/adapters/llm/openai.ts` / `anthropic.ts` (see Design notes).
- A deadline for `classifyIntent` (`reviewer-core/src/intent/classify.ts:180`).
- Persisting failed-run tokens/cost; batching map-reduce chunks.
- Prompts, skills, finding dedup, any eval files or fixtures (plans 09/10).

<!-- implementer-brief:end -->

## Context applied
- `reviewer-core/insights/gotchas.md` → *LLM transport* (SDK timeout stops at the headers): deadline by signal (S4). *Engine invariants* (purity): the new engine files do no I/O (S2, S4).
- `server/insights/gotchas.md` → *Run log* (only `msg` persisted): numbers go in message strings (S5, S8). *Tests* (hermetic `.it`, `waitForPrRuns` silent timeout): S9.
- Root `INSIGHTS.md` → "two vendored `shared` copies are not in sync": targeted mirror (S1). → "review run time is driven by hidden reasoning tokens": its ~24 tok/s and reasoning-cap plan are superseded by the probe (16–128 tok/s by provider, effort ineffective) → D6a–D6d. → "Done-when grep … wraps": S6.
- `## Research → pass 2` below: Q1 → D2 superseded; Q2 → map by signal state (S4); Q3 → D7; Q4 → streaming out of scope.
- `## Experiment → D6` and `## Routing research → D6` below: effort dropped; routing/deadline/cap → D6a–D6d, S1, S3, S8; retry re-roll → D7, S4; served-by → AC8, S3, S5.

## Experiment → D6 (main session, 2026-09-30)
Live probe, user-approved (~$0.14 billed on successful calls + 4 aborted calls). 26 calls to `deepseek/deepseek-v4-flash` via OpenRouter, request shape identical to `OpenRouterProvider` (strict `json_schema`, `temperature: 0`, `usage.include`, SDK `maxRetries: 0`), real stored prompts: General/Security × PR #12 (~5k tokens) / PR #8 (~113k) × `reasoning.effort` none/low/high × 2, plus 2 calls with `max_tokens: 2000`; `AbortSignal.timeout(10 min)` per call. Script + raw results: session scratchpad `probe/` (not in repo).
- **`reasoning.effort` does not reduce reasoning.** Reasoning tokens, big diff: low 13 177 · none 10 811 / 0 · high 10 483 / 11 847; small diff: low 1.5–3.2k · high 2.6–3.3k · none 0–2.4k. No consistent effect; rough keyword recall on PR #12 also shows no effort effect (4–8/12, noise-dominated).
- **Duration is driven by the provider OpenRouter routes to.** 10 different providers in 26 calls; throughput 16–128 tok/s. Same big General prompt: AtlasCloud 128 tok/s → 94 s; DeepInfra 28–29 tok/s → 428–530 s. Some providers skip reasoning entirely when no effort is sent (DigitalOcean, DeepInfra: 0 reasoning tokens).
- **Stalls are not size-driven:** 4/26 calls (15%) hit the 10-min deadline, one of them on the ~5k-token diff. Abort surfaced as `AbortError` (class `APIUserAbortError`), as the research predicted.
- **`max_tokens` is shared with reasoning:** at 2 000 the whole budget went to reasoning (1 947 / 1 983) → `finish_reason: "length"`, 54–159 chars of invalid JSON.
- **Invalid JSON without truncation:** one Baidu call returned `finish: stop` with unparseable content (3 457 chars) — strict schema not honored by every provider.
- Output tokens max 15 139 (General, big diff) — a 16k cap would sit right at the observed maximum.
⇒ D6 needs re-framing: the effective levers are **provider routing** (throughput / structured-output support) + the deadline + a generous `max_tokens` safety cap; `effort` is not a control for this model.

## Routing research → D6 (2026-09-30)
Researcher (OpenRouter provider-routing docs) + main-session check: one authenticated `GET /api/v1/models/deepseek/deepseek-v4-flash/endpoints` (no LLM call) and the probe's raw responses.
- **Request fields** (`provider` object): `order`, `only`, `ignore` (provider slugs; base slug matches all variants), `sort` (`"price"|"throughput"|"latency"`), `allow_fallbacks` (default true), `require_parameters` (hard), `data_collection`, `zdr`, `quantizations`, `max_price` (hard), `preferred_min_throughput` / `preferred_max_latency` (**soft** — slower endpoints move to the end, not excluded). Setting `sort` or `order` disables price load-balancing; providers are tried sequentially. `order` + `allow_fallbacks: false` → only listed providers. `response_format` is only a *soft* preference unless `require_parameters: true` — the probe did not send it, which explains Baidu's unparseable JSON. Suffix `:nitro` = sort by throughput (+ priority tier); combination with `provider` fields not documented → prefer explicit `provider.sort`.
- **Served-by provider:** the non-streaming response carries a top-level `provider` string in practice (probe recorded Alibaba, AtlasCloud, DeepInfra, …), though the documented schema lists only opt-in `openrouter_metadata` (header `X-OpenRouter-Metadata: enabled`). Record `res.provider` in the run log.
- **Live endpoint stats (verified key names):** `throughput_last_30m` / `latency_last_30m` {p50,p75,p90,p99}, `uptime_last_5m|30m|1d`, `status` (0 = ok), `supported_parameters` (incl. `structured_outputs`), `max_completion_tokens`. Snapshot 2026-09-30, throughput p50 tok/s + structured outputs: Alibaba 89 ✓ · Relace 78 ✗ · Baidu 69.5 ✓ · Novita 62 ✗ · GMICloud 56 ✗ · AtlasCloud 53 ✓ · StreamLake 44 ✓ · Azure 44 ✗ · Parasail 41 ✓ · SiliconFlow 30 ✗ · DeepInfra 27 ✓ · Venice 26 ✓ · Mancer 20 ✓ · DigitalOcean 15 ✓ · OpenInference 14 ✓ (status −5). Throughput is a 30-min window — a static list goes stale.
- **No stall handling on OpenRouter's side** is documented; its load balancer reacts to errors in the last 30 s, not slowness. The client deadline + a retry (which re-rolls the provider) is the only stall control.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | Method read | — |
| `onion-architecture` | preload | S1–S5, S7, S8 | — |
| `typescript-expert` | on demand (S1) | S1–S5, S7–S9 | — |
| `security` | on demand (S4) | S4 (log-line content, A09) | — |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `server/src/vendor/shared/adapters.ts` (+ client mirror) | ports | changed |
| reviewer-core | `src/llm/errors.ts` | core | new |
| reviewer-core | `src/llm/openrouter.ts` | core adapter | changed |
| reviewer-core | `src/review/llm-call.ts`, `src/review/run.ts`, `src/index.ts` | core | new / changed |
| server | `src/platform/sse.ts` | platform | changed |
| server | `src/modules/reviews/constants.ts`, `run-executor.ts` | application | changed |

## Design notes
- **Why the engine builds the deadline signal.** D1 fixes the *value* on the server. The deadline is per call and refreshed per retry, so a single signal from the executor could not re-arm it. The executor passes `callDeadlineMs` plus its long-lived cancel signal, and the engine composes them per attempt (`AbortSignal.any`, D5).
- **Cancel error type.** `RunBus` (platform) can't import `RunCancelledError` (module), so it aborts with a plain reason. The engine calls `checkCancelled()` first on a caller abort, so the caller's error type wins.
- **Three layers (D6).** Routing decides the speed (16–128 tok/s by provider); the deadline bounds a stall whatever the provider; `max_tokens` only stops a runaway, so it sits well above the observed max (15 139) and may exceed what a slow provider can emit before the deadline — that is fine, the deadline covers it. `reasoning.effort` showed no consistent effect, so no `reasoning` field is added (D2 superseded).
- **Why D7 = D needs a retry routing.** With `sort` or `order`, OpenRouter tries providers in a fixed sequence, so the same routing on retry most likely lands on the same stalled provider; the aborted call gives us no `provider` to `ignore` (no body). Dropping `sort` for the retry restores price load-balancing — a real re-roll — while `require_parameters` keeps the endpoints strict.
- **`require_parameters` on the review path.** It is only sent by `classifyIntent` today (`reviewer-core/src/intent/classify.ts:185`); the probe's Baidu answer (`finish: stop`, unparseable) is what a non-strict endpoint does. S8 sets it for every review call regardless of D6a.
- **Values (assumptions).** Heartbeat 2 min. Size guard at 100k diff tokens (the 606k call is far above it, an ordinary PR far below). The other values are D6c/D6d.
- **Server adapters on the review path.** `container.llm(agent.provider)` (`server/src/platform/container.ts:249-279`) returns the server's `OpenAIProvider` / `AnthropicProvider` for agents whose provider is `openai` / `anthropic`. The seeded default is `openrouter` (`server/src/db/seed.ts:15`). The server adapters already forward `req.signal`, and `withRetry` does not retry an abort (`server/test/llm-signal.test.ts`), so the deadline and cancel work for them unchanged. They ignore `routing`, never set `servedBy`, and their `withRetry` / `withTimeout(60 s)` retries stay hidden in pino. That is out of scope here.
- **Pass-1 options for D1–D5**: see the pass-1 table, recorded above; not repeated.

## Resolved decision options
Moved out of *Decisions needed* after the user's choice (chosen option in bold; rationale in the design notes above and the evidence sections below).
- D6a routing (all with `require_parameters: true`): **A `sort: "throughput"`** · B A + static `ignore` list · C `order` refreshed from the endpoints API (new port/adapter) · D `preferred_min_throughput` (soft).
- D6b scope: **A global constants** · B per agent (column + migration + UI).
- D6c deadline: **A 10 min** · B 12 min · C 15 min (slowest successful probe call 530 s).
- D6d `max_tokens` cap: A 24k · **B 32k** · C 48k (observed max 15 139).
- D7 retry: A retry deadline + transient, same routing · B never · C transient only · **D retry deadline + transient, retry drops `sort`** (a same-routing retry most likely hits the same provider; 15% probe stall rate).

## Risks & open questions
- `sort: "throughput"` ranks on a 30-min window and does not see stalls (OpenRouter reacts to errors, not slowness), so the stall rate may stay near the probe's 15%. Mitigation: D7 = D bounds each stall to one extra call; the served-by + duration lines (AC8) give the data to decide on D6a = C later.
- `sort` disables price load-balancing: the fastest endpoint may cost more per token. Not measured; per-run cost is already logged.
- `res.provider` is undocumented; if it disappears, `servedBy` is just omitted (the opt-in `X-OpenRouter-Metadata` header is the documented fallback — follow-up).
- `require_parameters: true` shrinks the pool to ✓ endpoints (9 of 15 in the snapshot); if all are down the call fails instead of degrading to a non-strict endpoint. Accepted: a non-strict answer failed to parse anyway.
- D7 worst case per chunk: two billed calls and 2 × deadline (20 min) before the run fails.
- Truncated strict-schema output shape is inferred (empty content). S3 keys on `finish_reason`, not on content, so the shape doesn't matter.
- Map-reduce over hundreds of files means hundreds of sequential calls (343-file case), each with its own deadline. Correct but slow and costly; batching is a follow-up.
- A single file above the size guard still goes in one call; only the deadline and cap bound it.
- A deadline-aborted or truncated call is billed but the failed run stores 0 tokens (`run-executor.ts:386-394`); the cost stays invisible until a follow-up.
- `maxRetries: 0` also removes silent SDK retries from `classifyIntent` calls made through the same provider.
- Doc vs code: `pipeline.md` cites `selectMode` at `run.ts:122-128`, but it is at `138-144`. S6 fixes this.
- Doc vs code: the `RunBus.cancel` comment claims the runner stops at its next checkpoint, but `complete()` clears the cancel flag right after `cancelRun` (`sse.ts:79`, `service.ts:86-89`), so the checkpoint rarely fires. S7/S8 fix this.

## Handed off
- architecture-reviewer: engine timers vs purity (S4); `RunBus` holding `AbortController`s (S7); the size guard overriding an explicit `single-pass` strategy (S5).
- security review: log-line content in S4/S5 (no prompt or response text); no new trust boundary, route or secret.

## Insights to record
- `server/INSIGHTS.md` · Recurring Errors & Fixes — `cancelRun` calls `runBus.complete()` right after `cancel()`, and `complete()` clears the cancel flag, so the between-chunk `isCancelled` checkpoint never sees a live cancel (`server/src/platform/sse.ts:79`, `server/src/modules/reviews/service.ts:86-89`).
- `reviewer-core/INSIGHTS.md` · Tool & Library Notes — `AbortSignal.timeout` is not driven by vitest fake timers; use `setTimeout` + `AbortController` for testable deadlines (to confirm while implementing S4).

## Red-flags check
- [x] Every AC maps to at least one step or test
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; product choices are decided (D1, D4–D7 recorded; no open rows)
- [x] Groups end type-checking; no parallel groups
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [ ] The brief above the marker is ~22,200 characters: ~20,500 of plan text plus the 1,725-character *Decisions recorded* — about 10% over ~20,000; trimming further would cut Practices/Done-when detail
- [x] Every step's *Skills to apply* is complete

## Research → pass 2 (external, 2026-09-30)
Researcher report (OpenRouter docs + endpoint listing for `deepseek/deepseek-v4-flash`, DeepSeek docs, openai-node 4.104 source read locally).
- **Q1 reasoning cap.** OpenRouter documents `reasoning.max_tokens` only for Gemini/Anthropic/some Qwen; every deepseek-v4-flash endpoint advertises `reasoning_effort` (+ `max_tokens`), none a separate reasoning budget. For effort-only models a supplied `reasoning.max_tokens` is used to *pick an effort tier* — not a hard budget (inference, low confidence). DeepSeek effort values: `low`/`high`/`max`. On most providers `max_tokens` covers reasoning + visible output; when hit → `finish_reason: "length"`, empty `content`, reasoning tokens billed. Truncated strict `json_schema` → empty or invalid JSON (not documented, inferred). `structured_outputs` is advertised only on some endpoints (`require_parameters: true` routes to those). ⇒ **affects D2** (`reasoning.max_tokens` may not cap anything on this model).
- **Q2 abort after headers (source-read, high).** SDK `timeout` is cleared when headers arrive (`core.js:382-400`); `response.json()` runs outside `makeRequest`'s try/catch and retry. A caller `signal` aborting during the body read surfaces as a raw node-fetch `AbortError` (not `APIUserAbortError`), never retried by the SDK. ⇒ map `AbortError`, `APIUserAbortError` and `signal.aborted` to one "deadline exceeded" error.
- **Q3 billing (high).** OpenRouter cancellation stops upstream generation **only for streaming** requests on supported providers (DeepSeek is supported). A non-streaming abort is a client-side give-up: the model keeps generating and the full response is billed. ⇒ **affects D3** (a retry after a non-streaming deadline abort can double the bill). Keep-alive bytes on non-streaming requests: not established (the observed `Invalid response body … Socket timeout` does show headers had arrived).
- **Q4 streaming.** Streaming + structured outputs is documented; usage arrives once in the final chunk (so an aborted stream loses its usage/cost record). Idle-gap detection is plausible but the SDK may hide `: OPENROUTER PROCESSING` comments and reasoning chunks — unverified. Needs a prototype before the plan commits to it.
- **Not established (need a live probe):** whether `reasoning.max_tokens`/`effort` changes `reasoning_tokens` on deepseek-v4-flash; response shape under `length` with strict schema; `cost` in the final stream chunk.

## Handoffs → G2
From the G1 implementer run (2026-09-30, status done; S1–S3 done). Trivial deviations (S3): `LlmOutputInvalidError` gets `attempts = maxRetries + 1`; `LlmOutputTruncatedError` prints `max_tokens=unset` when no cap was passed.
- Contract: `LlmRouting { sort?: 'throughput' | 'latency' | 'price' }`, `StructuredRequest.routing?`, `StructuredResult.servedBy?` in `server/src/vendor/shared/adapters.ts` + client mirror.
- `reviewer-core/src/llm/errors.ts`: `LlmDeadlineError(model, deadlineMs)`, `LlmOutputTruncatedError(model, maxTokens, tokensOut)`, `LlmOutputInvalidError(model, schemaName, attempts)`, `isTransientLlmError(err)` (false for the typed classes and `AbortError`/`APIUserAbortError`); all re-exported from `reviewer-core/src/index.ts`.
- `OpenRouterProvider`: `maxRetries` defaults to 0; sends `provider: { require_parameters?, sort? }` only for id `openrouter` when a key is set; throws `LlmOutputTruncatedError` on `finish_reason === 'length'`; `servedBy` from the top-level `provider` string.
- Checks: reviewer-core typecheck + 119 tests; server/client typecheck; server unit 372.

### Skills (G1)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1–S3 | |
| `typescript-expert` | on demand (first 60 lines) | S1–S3 | |

## Handoffs → G3
From the G2 implementer run (2026-09-30, status done; S4–S6 done). Trivial deviations (S5): `RunEventKind` has no `warn`, so the oversize-single-file line is `info` with "Warning: diff is ~Nk tokens in one file — cannot split; reviewing in one pass"; `index.ts` also exports `callWithDeadline`, `describeRouting`, `CallWithDeadlineOptions`.
- `ReviewInput` (`reviewer-core/src/review/run.ts`) gains optional `signal`, `callDeadlineMs`, `maxOutputTokens`, `requireParameters`, `routing`, `retryRouting`, `singlePassMaxDiffTokens`.
- `reviewer-core/src/index.ts` exports `DEFAULT_SINGLE_PASS_MAX_DIFF_TOKENS`, `LLM_WAIT_HEARTBEAT_MS`, `callWithDeadline`, `describeRouting`.
- `callWithDeadline` checks `o.signal.aborted` first → calls `checkCancelled`, then throws `signal.reason`. G3: the executor's `checkCancelled` must throw `RunCancelledError` when the signal is aborted; `RunBus.cancel` should abort with `new Error('Run cancelled')`.
- `MockLLMProvider` (`server/src/adapters/mocks.ts`) ignores `signal` and routing fields — fine for unit tests.
- For review: timers in the pure engine (`llm-call.ts`); the size guard overrides an explicit `single-pass` in `selectMode` (`run.ts:161`). Log lines carry label, model, minutes and error `name` only.
- Checks: reviewer-core typecheck + 129 tests; server typecheck; server unit 385.

### Skills (G2)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S4, S5 | |
| `typescript-expert` | on demand (first 60 lines) | S4, S5 | |
| `security` | on demand (first 40 lines) | S4 | |

## Handoffs → verification (after G3)
From the G3 implementer run (2026-09-30, status done; S7–S9 done). Trivial deviations: S8 `RunCancelledError` doc comment now says "between chunks or mid-call"; S9 uses a small inline `LLMProvider` (answers only `schemaName === 'Review'`) instead of `MockLLMProvider`, so intent classification can't reach a real provider.
- Files: `server/src/platform/sse.ts`, `server/test/run-bus.test.ts` (new), `server/src/modules/reviews/constants.ts`, `server/src/modules/reviews/run-executor.ts`, `server/test/run-cancel.it.test.ts` (new).
- For review: `RunBus` (`platform/sse.ts`) owns the per-run `AbortController`; `cancel()` aborts synchronously before `cancelRun` calls `complete()`, which deletes the controller. Routing/deadline values are server constants — no new trust-boundary input.
- Checks: server typecheck; server unit 34 files / 388; `run-bus` + `run-cancel.it` 5; related `reviews.it` + `run-cost.it` 12.

### Skills (G3)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S7, S8 | |
| `typescript-expert` | on demand (first 60 lines) | S7–S9 | |

## Verification log
### Wave 1 (2026-09-30)
- Full `.it` suite (main session, once after the last group of plans 08+09): 18 files / 121 tests, exit 0 (incl. `run-cancel.it` 2). reviewer-core `npm test` 129.
- security-reviewer (plans 08+09): PASS — no findings.
- architecture-reviewer (plans 08+09): PASS — no finding for plan 08; engine timers, size guard over `single-pass`, `RunBus` controller all cleared against the plan.
- plan-verifier: **complete — needs sign-off** — 80/82 met, no gaps. Needs sign-off: R3 (plan file untracked), R4 (no test-writer run). Handoff: stale `run.ts:<line>` citations in `reviewer-core/docs/pipeline.md` (lines 115–120, 187, 330, 336; the LLM call is now at `:268`), outside the sections S6 updated.

### Sign-off (2026-09-30)
User: "R3 підтверджую, R4 приймаю, F1 виправ, F2 відкласти".
- R3 signed off: after approval only the main session and the planner edited this plan file.
- R4 accepted: no test-writer run for this plan.

### Final (2026-09-30)
Verification complete — needs sign-off; the user signed off R3 and accepted R4. Status → `done`. Open follow-up (not decided): stale `run.ts:<line>` citations in `reviewer-core/docs/pipeline.md`.

### Post-done gap (2026-09-30, pr-self-review)
Found by `/pr-self-review` on branch L04 and reproduced against the real SDK; the user approved the fix ("Давай виправимо це"). Status `done` → `in-progress`.

- **PR1 — connection-level failures are never retried** (S2, S3, S4). openai@4.104.0 error classes do not set their own `name` (it stays `"Error"`; only `constructor.name` differs) and carry no `status`. So `isTransientLlmError` (`reviewer-core/src/llm/errors.ts:48-49`) returns `false` for `APIConnectionError` / `APIConnectionTimeoutError`. With the SDK's `maxRetries: 0` (S3a), a header timeout or socket drop fails the call with no retry, contrary to D7. `llm-errors.test.ts` passes only because it feeds `{ name: 'APIConnectionTimeoutError' }` plain objects. Repro: `new OpenAI({ baseURL: 'http://127.0.0.1:9/v1', maxRetries: 0 })` → caught error `name="Error"`, `status=undefined`, `isTransientLlmError` → `false`.
  - **Fix (supersedes the `name`-based bullet of S2):** keep `errors.ts` free of `openai` imports. Add `LlmConnectionError(model, timedOut)` there (sets `this.name`; message carries model and whether it timed out, never prompt/response text), export it from `src/index.ts`, and make `isTransientLlmError` return `true` for `instanceof LlmConnectionError`. Drop the dead `name` checks for `APIConnectionError` / `APIConnectionTimeoutError` / `APIUserAbortError`. Keep the `AbortError` check, 408/429/5xx and the typed-class `false` cases. In `openrouter.ts`, normalise at the adapter boundary: an `OpenAI.APIUserAbortError` is rethrown unchanged (cancel and deadline stay decided by signal state in `callWithDeadline`, S4). An `OpenAI.APIConnectionError`, which includes its subclass `APIConnectionTimeoutError`, becomes `LlmConnectionError(req.model, err instanceof OpenAI.APIConnectionTimeoutError)`. Everything else is rethrown as is.
  - **Done when:** `cd reviewer-core && npm run typecheck && npm test`. `openrouter.test.ts`: a mocked transport that fails at connection level (and one that times out) → `LlmConnectionError` (`timedOut` false/true), and an abort still surfaces as the SDK abort error. `llm-errors.test.ts`: `LlmConnectionError` → `true`; the plain-object `name` cases for the connection classes are removed. `llm-call.test.ts`: `LlmConnectionError` then success → exactly one retry line and 2 calls.
- **PR1 implementer (fix mode, 2026-09-30):** done. Files: `reviewer-core/src/llm/errors.ts`, `src/llm/openrouter.ts`, `src/index.ts`, `test/llm-errors.test.ts`, `test/openrouter.test.ts`, `test/llm-call.test.ts`. The first run applied default prettier to `openrouter.ts` and `openrouter.test.ts` (double quotes, 80 cols). This was sent back as an unplanned deviation. Both files were restored from HEAD and PR1 was reapplied by hand (openrouter.ts +15/−3, openrouter.test.ts +36/−1, no formatter). Checks: reviewer-core typecheck ✅, `npm test` 133 ✅; server typecheck ✅, server unit 389 ✅.
- **Main-session real-SDK check (PR1):** a temporary test, not committed, ran with no `openai` mock. `OpenRouterProvider` on `http://127.0.0.1:9/v1` wrapped in `callWithDeadline` gave `LlmConnectionError`, `isTransientLlmError` → `true`, 2 calls, and one `retrying once (LlmConnectionError)` line. Before the fix the same repro gave `name="Error"`, `transient=false`.
- **plan-verifier (delta, PR1):** complete — 14/14 delta items met, no gaps, no unplanned changes, nothing to sign off. Handoff: `reviewer-core/docs/pipeline.md:71` doesn't mention `LlmConnectionError` normalisation (not decided); the stale `run.ts:<line>` citations follow-up is still open.
- Status `in-progress` → `done`.

## Reopened (2026-09-30): one truncated chunk fails a whole map-reduce run
The user asked to reopen this plan and work out a fix ("Поверни в роботу його і давай розбератися як це пофіксити"). Status `done` → `draft`. This is a plan change: it revisits D7 ("truncated never retried") and the map-reduce loop.
- **Evidence:** a review of PR #13 (dev-digest, 142 files, map-reduce), General Reviewer on `openrouter/deepseek/deepseek-v4-flash`. Dozens of files passed (1–6k output tokens, 13–46 s each). `mcp-server/test/conventions.test.ts` then ran >2.5 min and failed with `Run failed: deepseek/deepseek-v4-flash hit the output cap (max_tokens=32000) after 32000 output tokens before finishing its answer`. The whole run failed, and every other file's findings were lost.
- **Cause:** D6d's cap (`REVIEW_MAX_OUTPUT_TOKENS = 32_000`) holds as designed, and it is the guard against the 105k-token / 71-min reasoning runaway (root `INSIGHTS.md`). But `LlmOutputTruncatedError` is never retried (AC7/D7, S3c). The map-reduce loop in `reviewer-core/src/review/run.ts` has no per-chunk catch, which predates this plan, so any chunk's final failure aborts `reviewPullRequest`.
- **Options discussed with the user (not decided):**
  - A: skip a truncated chunk with a run-log line and finish with the rest.
  - B: retry a truncated chunk once with `REVIEW_RETRY_ROUTING` (a re-roll; runaway reasoning is stochastic).
  - C: A+B.
  - D: no change.
  - Open sub-question: show a "partial" run only in the run log, or as a UI badge (a contract change: shared + client).
- The main session's recommendation so far: C, with "partial" shown in the run log only.

## Amendment A1 — truncated chunk handling
Pass 1 (decisions only). S1–S9 above stay as they are; A1's steps are written in pass 2. Packages: reviewer-core (engine) + server (constants/wiring); client and shared only if D-A1d = P4 or D-A1b = R3.

### Facts from the code (2026-09-30)
- **Chunk loop.** `run.ts:228-231` builds one chunk per file in map-reduce, else one `all files` chunk. The loop `run.ts:260-307` awaits `callWithDeadline` per chunk with no try/catch, so a chunk's final throw leaves `reviewPullRequest`. Tokens and cost are summed per chunk (`:295-300`); `partials.push(res.data)` (`:302`).
- **Reduce and score.** `reduceReviews` (`reduce.ts:43-55`) concatenates the findings, takes the worst verdict, averages the model scores and joins the summaries. The final score is recomputed from the grounded findings (`run.ts:340`, `scoreFromFindings`, `reduce.ts:27-30`). A missing chunk adds no findings and has no say in the verdict, so the run looks cleaner than it is. `reduceReviews([])` gives `approve` with no findings, and the final score becomes **100**. A run where every chunk was skipped would therefore persist as a green "approved" review.
- **Single-pass.** There is one chunk (`run.ts:231`), and skipping it leaves `partials` empty, which is the same false "approve, 100". The studio default is `single-pass` (`server/src/modules/reviews/constants.ts:13`). PR #13 went map-reduce through the size guard (`run.ts:182-185`).
- **Retry today.** `callWithDeadline` (`llm-call.ts:167-188`) retries once, only on `LlmDeadlineError` or `isTransientLlmError`. `isTransientLlmError` returns false for truncated and invalid output (`errors.ts:54`). The retry takes `retryRouting` (`:171-174`) and a fresh deadline and heartbeat, because each `attempt` builds its own (`:83-133`). Before throwing `LlmOutputTruncatedError`, `openrouter.ts:139-152` reports the truncated round through `onUsage`. `collectFailed` records it (`llm-call.ts:120`), and `mergeFailedUsage` (plan 13) adds it to a successful retry. So a truncation retry reuses all of this unchanged, and there is no deadline estimate because `deadline=false`. When the **final** attempt throws, the `failed` usage is discarded (`:180`), so nothing today reports a skipped chunk's spend. Review calls send `temperature: 0` by default (`openrouter.ts:83`).
- **Server storage.** On success, `completeAgentRun` gets `status: 'done'`, `error: null` (`run-executor.ts:340-355`). On any throw, it gets `failed`, tokens 0, and the message (`:404-419`). `agent_runs.status` and `error` are plain `text` columns (`server/src/db/schema/runs.ts:38-40`), so no migration is needed. `RunSummary.status` is `z.string()` (`contracts/trace.ts:143`), but `AgentColumn.status` is `z.enum(['done','failed','running'])` (`contracts/observability.ts:41`), so a new `partial` status is a contract change. `RunHistory.tsx:202` shows `error` only for `failed`. `review.summary` is persisted (`run-executor.ts:322`) and rendered by `VerdictBanner.tsx:48`. A partial run can be expressed without a contract change as a `done` run plus a summary note or a non-null `error`.
- **Other call sites.** `classifyIntent` (`intent/classify.ts:180`) and conventions extraction (`server/src/modules/conventions/service.ts:150`) call `completeStructured` directly, not through `callWithDeadline` or the chunk loop. They are out of scope.

### Decisions needed
None open. See *A1 decisions recorded* below. The pass-1 options are kept for reference; the chosen option is in bold.
| # | Decision | Options | Recommendation | Steps affected |
|---|---|---|---|---|
| A1a | Overall approach | A: skip a truncated chunk and finish · B: retry a truncated chunk once, then fail · **C: A+B** · D: no change | **C**: a re-roll often fixes a stochastic runaway, and a skip keeps the other files' findings | S10, S11 |
| A1b | Routing of the truncation retry | **R1: `retryRouting` (`REVIEW_RETRY_ROUTING = {}`: price load-balancing, `require_parameters` kept)** · R2: the same routing (`sort: throughput`) · R3: `provider.ignore: [servedBy]` (contract: `LlmRouting.ignore` + mirror; `servedBy` on the error) · R4: a larger `max_tokens` on the retry | **R1**: it is the existing D7 path. At `temperature: 0`, R2 most likely replays on the same provider. R3 is a contract change. R4 weakens the runaway guard | S10 |
| A1c | Which final errors make a chunk skippable | T1: truncated only · **T2: truncated + `LlmOutputInvalidError`** · T3: any non-cancel error | **T2**: both are chunk-specific model output. Deadline/transient errors are provider-wide: skipping them lets an outage burn up to 20 min per chunk | S11 |
| A1d | Skip policy (when the run fails anyway) | **S1: never in single-pass; map-reduce fails once more than 10% of chunks are skipped (at least 1 allowed), failing as soon as that is exceeded** · S2: a fixed maximum of 3 skipped chunks · S3: fail only when every chunk is skipped | **S1**: 10% (14 of PR #13's 142) is an assumption. Failing early caps the spend. Single-pass always fails, because nothing would be left | S11, S13 |
| A1e | How "partial" is shown | P1: run log only (a line per skip plus a final `Reviewed N/M files — K skipped: …`) · **P2: P1 + an engine-added note in `review.summary` (visible in `VerdictBanner`, no contract or client change)** · P3: P1 + `error` set on a `done` run, and `RunHistory` shows it (client-only) · P4: a `partial` status or field (contract + client mirror + badge) | **P2**: with P1 a skipped file leaves a green "approved" row whose only trace is the log. P2 stays inside the engine | S11 |
| A1f | Cost of a skipped chunk | **K1: count it with D4-B semantics (tokens added, `costUsd` = sum of the priced parts, `estimate` when any part is unpriced or estimated, a log line). This needs `callWithDeadline` to report the final attempt's failed usage (an optional callback, no error fields)** · K2: don't count it | **K1**: each truncated attempt bills ~32k output tokens, which is up to 64k per skipped chunk with the retry. Runs that fail anyway keep 0 tokens (plan 13 AC5) | S10, S11 |
| A1g | Tests | **U1: reviewer-core unit only (`llm-call.test.ts`: truncation is retried once with `retryRouting` and the usage is merged; `run-reliability.test.ts`: skip, cap exceeded, single-pass fails, all skipped fails, skipped usage counted, partial note) + the existing `run-cancel.it` truncation case as a regression** · U2: U1 + a new multi-file `.it` case | **U1**: the executor only passes constants. `run-cancel.it` Case 2 is single-file (`filesCount: 1`, `run-cancel.it.test.ts:95`), so it still expects `failed` + `output cap`, now after 2 calls. U2 needs a hand-seeded multi-file PR (`MockGitHubClient` has one PR) | S10, S11, S13 |

A1a = B, C or A1c ≠ T1 revises D7/AC7 ("truncated/invalid never retried"). This supersedes that clause only; the rest of D7 stands.

### Risks
Pass-1 risks. The pass-2 risks are in *A1 risks (pass 2)* below, which supersedes this list.
- **False clean result.** Without a visible marker (A1e = P1), a partial run reads as `done`/approved with a score from the reviewed files only. P2–P4 mitigate this.
- **Double bill.** A truncation retry doubles the spend on a runaway chunk (2 × ~32k output tokens). The fraction cap bounds the run, but a 142-file run could still skip 14 chunks, each billed twice, before it fails.
- **Retry lands on the same provider.** R1 restores load balancing but can still pick the same provider. With `temperature: 0` a same-provider retry may repeat the runaway. There is no evidence yet either way; the served-by line on each chunk gives the data.
- **One retry across error kinds.** The retry budget is shared: a truncation followed by a deadline ends on `LlmDeadlineError`, which T2 does not skip, so the run fails. Pass 2 keys the skip on the final error.
- **Engine default.** The skip policy needs an engine default for callers that don't pass it. Assumption: skipping is off unless the caller passes a policy, so the behaviour of other callers doesn't change.
- **Run that fails anyway.** When the cap is exceeded the run still stores 0 tokens (`run-executor.ts:415`), even though the skipped chunks were billed. This is out of scope, as in plan 13.
- **Stale docs.** `reviewer-core/docs/pipeline.md:71-73` ("truncation … never retried") and its stale `run.ts:<line>` citations must be updated in pass 2's doc step.

### Research questions
None needed for the recommended options. Optional, only if A1b = R2 is preferred: does a `finish_reason: "length"` runaway on `deepseek-v4-flash` at `temperature: 0` repeat on the same provider? That needs a live probe, not docs.

### A1 research (external, 2026-10-01) and idea brief
Idea brief: `docs/ideas/05-truncated-chunk-runaways.md`. Brainstormer: Opt1 (re-roll, then skip) on top of a containment floor, with the retry gated on a replay experiment; Opt4 (streaming early abort) as a follow-up. External researcher (medium confidence; sources: OpenRouter docs and endpoints API, DeepSeek API docs, GitHub issues Aug–Sep 2026):
- **`temperature` and the penalties are no-ops in DeepSeek thinking mode** (DeepSeek thinking-mode docs). This removes A1b's argument that a same-routing retry at `temperature: 0` replays deterministically: a re-roll is stochastic either way.
- **Reasoning can possibly be switched off:** OpenRouter's unified `reasoning: { enabled: false }` or `effort: "none"`; DeepSeek native `thinking: { type: "disabled" }`. Whether the V4 Flash upstreams honour it via OpenRouter is **unverified** (conflicting reports). One issue shows explicit low effort cutting 11.3k → 3.7k tokens, which conflicts with root INSIGHTS 2026-09-30 ("no consistent effect"). Only a live probe settles it.
- `reasoning.exclude` only hides reasoning (still billed). `reasoning.max_tokens` is documented for Anthropic, Gemini and Qwen, not DeepSeek. `usage.completion_tokens_details.reasoning_tokens` reports reasoning separately.
- **`finish_reason: "length"` does not trigger OpenRouter `models` fallback**, so the retry must be client-side. The `native_finish_reason` and `model` fields help correlate.
- Streaming abort stops billing only on supported providers (the list doesn't show V4 Flash hosts). Stream chunks carry `provider`.
- PR-Agent drops overflow files by token budget and lists them as "other modified files". No tool was found that documents a per-file truncation retry or split-by-hunk, which supports a skip-and-report UX.
- `deepseek/deepseek-v4-flash` resolves to the "0423" generation. The 0731 and V4.1 slugs exist separately; the loop reports concern self-hosted 0731/V4.1.

### A1 live probe (main session, 2026-10-01, user-approved, ~$0.003)
The probe replayed the PR #13 chunk `mcp-server/test/conventions.test.ts`: the stored system prompt from trace `30c09d11-…`, plus `assemblePrompt` with that file's 57-line diff (task line approximated). Settings: `deepseek/deepseek-v4-flash`, `max_tokens: 32000`, strict `json_schema`, `provider: { require_parameters: true }` (the retry routing), 10-min abort. 10 parallel calls; script in the session scratchpad, not committed.
- **A (as today, 5×):** 0/5 `length`. 4/5 `stop` with valid JSON and 1–2 findings. Times 14 s / 32 s / 120 s / 31 s; reasoning tokens 0 (DigitalOcean ×2), 3956 (Venice), 2358 (StreamLake). 1/5 **stalled** (no response in 600 s, i.e. a deadline case, not truncation).
- **B (`reasoning: { enabled: false }`, 5×):** 5/5 `stop`, valid JSON, **0 reasoning tokens, 2–3 s, ~100–140 output tokens, and 0 findings in all 5** (StreamLake ×1, Baidu ×4).
- **Conclusions:**
  - The runaway is stochastic, not prompt-determined (the brief's success signal, ≤2/5 `length`), so a re-roll retry (A1a = C, A1b = R1) is justified.
  - Reasoning-off really disables thinking via OpenRouter, but it lost every finding on this file. As a retry it would mark the file reviewed-clean, which is worse than an honest skip, so it is rejected.
  - Providers differ sharply under one model id: DigitalOcean does no reasoning even without the flag.
  - The stall supports A1c = T2: don't skip on deadline or transient errors by default.

### A1 decisions recorded (2026-10-01)
User: "давай спробуємо усе за рекомендаціями".
- **A1a → C:** retry a truncated chunk once, then skip it.
- **A1b → R1:** the retry uses the existing `retryRouting` (`{}`, `require_parameters` kept), with reasoning on. Reasoning-off is rejected (probe: 0 findings).
- **A1c → T2:** only a final truncated or invalid output makes a chunk skippable. Deadline, transient and cancel errors keep today's behaviour.
- **A1d → S1:** single-pass never skips. Map-reduce fails once more than 10% of chunks are skipped, with at least 1 allowed (10% is an assumption).
- **A1e → P2:** a run-log line plus a note in `review.summary`. No contract or client change.
- **A1f → K1:** a skipped chunk's usage is counted with plan 13 D4-B semantics, via a new optional callback in `callWithDeadline`.
- **A1g → U1:** reviewer-core unit tests in `llm-call.test.ts` and `run-reliability.test.ts`, plus the `run-cancel.it` truncation case as a regression (it now expects 2 calls).
This replaces only the "truncated/invalid never retried" clause of D7/AC7; the rest of D7 stands.

### A1 acceptance criteria (pass 2)
This section is self-contained: an implementer for G4 reads *Amendment A1* in full (it sits below the brief marker). S1–S9 and AC1–AC8 above are unchanged, except for **AC7 (amended)**.
- **AC7 (amended):** a deadline, a transient error **or a truncated output** (`LlmOutputTruncatedError`) is retried once, without `sort` (`require_parameters` kept). Cancel and invalid output (`LlmOutputInvalidError`, already reprompted `maxRetries` times) are never retried. SDK retries stay off.
- **AC9:** in map-reduce, a chunk whose final error is `LlmOutputTruncatedError` or `LlmOutputInvalidError` is skipped when the caller passes a skip policy. It gets an `error` run-log line, and the run goes on with the other chunks.
- **AC10:** the run fails with `ReviewChunksSkippedError` as soon as the skipped count exceeds `max(1, floor(chunks × maxSkippedChunkFraction))`. Single-pass never skips: its final error is rethrown as today.
- **AC11 (false-clean guard):** `reviewPullRequest` never returns a review built from zero partials. If no chunk produced a partial, it throws `ReviewChunksSkippedError` instead of returning `approve` with score 100.
- **AC12 (P2):** when at least one chunk was skipped, `review.summary` starts with `Partial review: K of M files not reviewed (…): <paths>`, and the run log has one `result` line `Reviewed N/M files — K skipped: <paths>`. `ReviewOutcome.skipped` lists `{ label, reason }`. There is no contract or client change.
- **AC13 (K1, plan 13 D4-B):** a skipped chunk's usage (every reported round of both attempts, plus a deadline estimate if any) is added to the outcome's tokens. `costUsd` gains the priced sum. `costSource` becomes `estimate` when any part was estimated or unpriced. A `counted skipped chunk` line follows, with `could not be priced` when that applies.
- **AC14:** the server passes `maxSkippedChunkFraction: REVIEW_MAX_SKIPPED_CHUNK_FRACTION` (0.1). Without it, the engine skips nothing (today's behaviour).

### A1 step group
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G4 | S10–S13 | reviewer-core engine (`llm-call.ts`, `run.ts`, `index.ts`) + pipeline doc → server constants/wiring + `.it` regression | G3 (done) | Last group: the main session runs the full `.it` suite once, then `plan-verifier` in delta mode for A1 |

This is one group on purpose. S13 is a one-constant wiring plus a 2-line test edit, which is under the ~80-line floor on its own. It depends on S11's new `ReviewInput` field. The order inside the group is fixed (S10 → S13), and each step leaves its package type-checking.

### S10 — `callWithDeadline`: retry truncation once; report a final failure's usage
- **Files:** `reviewer-core/src/review/llm-call.ts` (modify) · `reviewer-core/src/index.ts` (modify) · `reviewer-core/test/llm-call.test.ts` (modify)
- **Change:**
  - Rename the module-private `FailedUsage` (`llm-call.ts:45-55`) to an exported `FailedCallUsage`, with the same fields (`tokensIn`, `tokensOut`, `costUsd` = sum of the priced parts, `deadline`, `estimated`, `unpriced`). Add a module-private `sumFailed(a?: FailedCallUsage, b?: FailedCallUsage): FailedCallUsage | undefined`: it adds the numbers, ORs the flags, and returns undefined when both are undefined.
  - Add `onFinalFailure?: (u: FailedCallUsage) => void` to `CallWithDeadlineOptions<T>`. Doc comment: "called once, just before a non-cancel final throw, with the usage of every failed attempt of this call; not called when nothing was reported and no deadline fired, nor on cancel".
  - Retry condition (`:170`): also retry when `err instanceof LlmOutputTruncatedError`. Import it from `../llm/errors.js`. `LlmOutputInvalidError` is still not retried. The retry keeps everything as today: `retryRouting`, `requireParameters` kept, a fresh deadline and heartbeat, the `retrying once (<name>)` line.
  - Keep the first attempt's failed usage before the retry: `const first = failed; failed = undefined;`. On retry success, merge `first` exactly as today (`mergeFailedUsage`). On retry failure, call `o.onFinalFailure?.(total)` with `total = sumFailed(first, failed)` when defined, then rethrow. On a first-attempt failure that is not retried (invalid, or any non-retryable error), call `o.onFinalFailure?.(failed)` when defined, then rethrow. The cancel branch (`:116-119`) throws before `collectFailed` and never calls it.
  - Update the JSDoc (`:71-77`): "Cancel and invalid output never retry"; describe `onFinalFailure`.
  - In `index.ts:82`, add `type FailedCallUsage` to the `llm-call.js` export.
- **Layer / why here:** only `callWithDeadline` owns both attempts and their collectors (plan 13, D1-A). The engine decides what to do with the usage (S11).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:**
  - No I/O, no `process.env`, no new import other than `LlmOutputTruncatedError`.
  - Never add fields to error objects; usage travels only through the callback.
  - `onFinalFailure` emits no run-log line: the caller decides whether the usage is counted.
  - A first-attempt success still returns the provider's object unchanged (L5).
  - `mergeFailedUsage` semantics are untouched.
- **Known gotchas:** a deadline abort of a non-streaming call is billed in full, so the estimate is a lower bound (`reviewer-core/insights/gotchas.md` → *LLM transport*, [INSIGHTS](../../reviewer-core/INSIGHTS.md#2026-09-30--correction-the-stalled-body-hang-is-now-bounded-by-callwithdeadline-plan-08)). Classify errors with `instanceof`, never with `name` ([INSIGHTS](../../reviewer-core/INSIGHTS.md#2026-09-30--openai-error-classes-keep-name--error-classifying-by-name-never-matches)).
- **Done when:** `cd reviewer-core && npm run typecheck && npm test`, with `llm-call.test.ts` passing:
  - the existing "truncation is not retried" case (`:99-103`) replaced by **T1**: truncation then success → 2 calls, the 2nd request has `routing` = `retryRouting` and `requireParameters: true`, one `retrying once (LlmOutputTruncatedError)` line, and the truncated round's reported usage merged into the result;
  - **T2**: truncation twice → rejects `LlmOutputTruncatedError` after exactly 2 calls, and `onFinalFailure` is called once with the sum of both attempts' reports;
  - **T3**: `LlmOutputInvalidError` → 1 call, rejects, and `onFinalFailure` gets that attempt's reports;
  - **T4**: external cancel → `onFinalFailure` is not called;
  - **T5**: transient (no reports) twice → `onFinalFailure` is not called.

### S11 — `reviewPullRequest`: skip policy, false-clean guard, partial note, skipped usage
- **Files:** `reviewer-core/src/review/run.ts` (modify) · `reviewer-core/src/index.ts` (modify) · `reviewer-core/test/run-reliability.test.ts` (modify)
- **Change:**
  - `ReviewInput` gains `maxSkippedChunkFraction?: number`. Doc comment: "map-reduce only: a chunk whose final error is truncated/invalid output is skipped while skipped ≤ max(1, floor(chunks × fraction)); unset = never skip (any final error fails the run)".
  - `ReviewOutcome` gains `skipped: { label: string; reason: string }[]` (empty when nothing was skipped).
  - In `run.ts`, add `export class ReviewChunksSkippedError extends Error` with `readonly skipped: number`, `readonly total: number` and `this.name = 'ReviewChunksSkippedError'`. Its message is `<K> of <M> files could not be reviewed (limit <N>); last: <reason>`, or `no file could be reviewed` when the guard of AC11 fires. Export it from `index.ts`, next to `reviewPullRequest`.
  - Chunk loop (`run.ts:260-307`):
    - Before the loop: `const allowed = mode === 'map-reduce' && input.maxSkippedChunkFraction != null ? Math.max(1, Math.floor(chunks.length * input.maxSkippedChunkFraction)) : 0`.
    - Per chunk: declare `let failedUsage: FailedCallUsage | undefined`, pass `onFinalFailure: (u) => { failedUsage = u; }`, and wrap the `callWithDeadline` call in `try/catch`.
    - In the catch: if `allowed === 0`, or the error is not `instanceof LlmOutputTruncatedError || LlmOutputInvalidError`, rethrow it unchanged. Cancel and deadline errors stay as today.
    - Otherwise push `{ label, reason: err.name }` to `skipped`. When `failedUsage` is set, add it to the totals: `tokensIn += u.tokensIn`, `tokensOut += u.tokensOut`, `costUsd = costUsd == null ? null : costUsd + u.costUsd`, and `costSource = 'estimate'` when `u.estimated || u.unpriced`. Then emit `info` `<label>: counted skipped chunk — <in> in / <out> out tokens` + ` · could not be priced, cost excludes it` when `u.unpriced`.
    - Emit `error` `<label>: skipped — <reason> after retry (<skipped>/<allowed> allowed)`.
    - If `skipped.length > allowed`, emit `error` `Too many files skipped (<K> of <M>, limit <N>) — failing the run` and throw `ReviewChunksSkippedError`. Then `continue`.
  - False-clean guard, after the loop and before `reduceReviews`: `if (partials.length === 0) throw new ReviewChunksSkippedError(...)`.
  - Partial note (P2): when `skipped.length > 0`, emit `result` `Reviewed <M−K>/<M> files — <K> skipped: <paths>`. Build the returned review's `summary` as `Partial review: <K> of <M> files not reviewed (model output cap / invalid output): <paths>.` + (merged summary ? `' ' + merged.summary` : ''). List at most 10 paths, then `+<n> more`.
  - Return `skipped`.
- **Layer / why here:** mode, partials, reduce and score all live in the engine. The policy value comes from the caller (D1 pattern). The marker is inside `review.summary`, so no contract changes (A1e = P2).
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:**
  - The catch rethrows anything not in the two skippable classes, by `instanceof`. `checkCancelled` stays the pre-chunk checkpoint, and a cancel error is never skipped.
  - Single-pass never skips, because `allowed` is 0 when `mode !== 'map-reduce'`. That includes `oversize-single-file`; a size-guard map-reduce can skip.
  - The score stays `scoreFromFindings(finalFindings)`. Neither the score nor the verdict is adjusted for skipped files.
  - Log lines and the summary note carry file paths (chunk labels, already logged per chunk), error class names and counts only, never error messages from the provider or model text (A09).
  - An input without `maxSkippedChunkFraction` behaves exactly as today.
- **Known gotchas:** only `msg` reaches the stored run log, so numbers go into the message (`server/insights/gotchas.md` → *Run log*). Missing findings are the grounding gate's doing, so do not loosen grounding for skipped files (`reviewer-core/insights/gotchas.md` → *Engine invariants*).
- **Done when:** `cd reviewer-core && npm run typecheck && npm test` (`run.test.ts` unchanged and green). `run-reliability.test.ts` adds these cases, using a fake whose behaviour depends on the chunk's file (match on the last message content):
  - **K1:** map-reduce with 3 files and `maxSkippedChunkFraction: 0.1`, where `b.ts` truncates twice (reporting `{1000, 32000, 0.01, 'api'}` per attempt) → resolves. `skipped` = `[{ label: 'b.ts', reason: 'LlmOutputTruncatedError' }]`. Calls: a, b, b, c (4). Tokens include 2000 / 64000 from `b.ts`, and `costSource` stays `api`. The summary starts with `Partial review: 1 of 3`. The log has `Reviewed 2/3 files`.
  - **K2:** the same with an unpriced report (`costUsd: null`) → `costSource: 'estimate'`, and a line contains `could not be priced`.
  - **K3:** 3 files, 2 truncate → rejects `ReviewChunksSkippedError` (limit 1), and the third file is never called.
  - **K4:** single-pass, 1 file, truncation → rejects `LlmOutputTruncatedError` after 2 calls, even with `maxSkippedChunkFraction` set.
  - **K5:** map-reduce, 2 files, both truncate, `maxSkippedChunkFraction: 1` → rejects `ReviewChunksSkippedError` (false-clean guard), never `approve`/100.
  - **K6:** a 503 twice on one file → the run rejects (not skipped).
  - **K7:** without `maxSkippedChunkFraction`, a truncation in map-reduce rejects as today.

### S12 — Update the pipeline deep-dive for A1
- **Files:** `reviewer-core/docs/pipeline.md` (modify)
- **Change:**
  - *The LLM call* (`:67-82`): the retry bullet says "one retry on a deadline, a transient error or a truncated output"; "cancel and invalid output are never retried"; add `onFinalFailure`.
  - *Per-chunk loop and reduce* (`:112-129`): add the skip policy (`maxSkippedChunkFraction`, the skippable classes, the limit, fail-fast), the false-clean guard, the `Partial review:` summary note, and the counting of skipped usage. Correct this section's `run.ts:<line>` citations to the current code.
  - *Public API* (`:234-250`): add `ReviewChunksSkippedError`, `FailedCallUsage`, `ReviewOutcome.skipped`.
  - *How to test* (`:298`): name the new `llm-call.test.ts` T-cases and `run-reliability.test.ts` K-cases.
- **Layer / why here:** docs follow code. The stale truncation sentence (`:71-73`) is now wrong.
- **Skills to apply:** none
- **Practices:** cite `path:line` from the edited code; make no claims beyond the code; edit only the four sections named.
- **Known gotchas:** a Done-when grep for a phrase fails when Markdown wraps it (root `INSIGHTS.md` 2026-09-28), so grep single words.
- **Done when:** `grep -c "maxSkippedChunkFraction" reviewer-core/docs/pipeline.md` ≥ 1 · `grep -c "ReviewChunksSkippedError" reviewer-core/docs/pipeline.md` ≥ 1 · `grep -c "onFinalFailure" reviewer-core/docs/pipeline.md` ≥ 1.

### S13 — Server: skip-fraction constant, executor wiring, `.it` regression
- **Files:** `server/src/modules/reviews/constants.ts` (modify) · `server/src/modules/reviews/run-executor.ts` (modify) · `server/test/run-cancel.it.test.ts` (modify)
- **Change:**
  - `constants.ts`, after `REVIEW_SINGLE_PASS_MAX_DIFF_TOKENS` (`:31`): `/** Map-reduce: share of chunks that may be skipped on truncated/invalid output before the run fails (assumption: 10%). */ export const REVIEW_MAX_SKIPPED_CHUNK_FRACTION = 0.1;`
  - `run-executor.ts`: import it and pass `maxSkippedChunkFraction: REVIEW_MAX_SKIPPED_CHUNK_FRACTION` next to `singlePassMaxDiffTokens` (`:301`). Nothing else changes. The catch block (`:404-419`) already stores a `ReviewChunksSkippedError`'s message as `error`, and a partial run persists as `done` with the noted summary (`:316-324`).
  - `run-cancel.it.test.ts`, case "an output-truncated call fails the run with the cap in the error" (`:144-155`): count the calls in the `onReview` closure and assert `calls === 2` (single-pass: retried once, never skipped). The existing `failed` / `output cap` assertions stay.
- **Layer / why here:** D1 pattern. Policy values are server constants; the executor passes them to the pure engine.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** the executor imports nothing from `src/adapters/**`; no new container dependency, route, schema or migration; the `.it` test stays hermetic (`isolatedTestConfig()`, a custom provider under `overrides.llm.openai`).
- **Known gotchas:** a hermetic `.it` test must not reach a real API key, and `waitForPrRuns` returns silently on timeout (`server/insights/gotchas.md` → *Tests*).
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` green · `cd server && pnpm exec vitest run test/run-cancel.it.test.ts` (Postgres up) green.

### A1 tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `reviewer-core/test/llm-call.test.ts` | unit | T1–T5: truncation retry + merge, `onFinalFailure` (AC7 amended, AC13) | S10 |
| `reviewer-core/test/run-reliability.test.ts` | unit | K1–K7: skip, limit, single-pass, false-clean guard, partial note, skipped usage, opt-in (AC9–AC14) | S11 |
| `server/test/run-cancel.it.test.ts` | integration | single-pass truncation → `failed` after 2 calls (regression, AC7 amended / AC10) | S13 |

### A1 migrations & contracts
None. No shared or client edit, no migration, and no `RunSummary`/`AgentColumn` change (A1e = P2). `LlmUsageReport` (shared) is untouched; `FailedCallUsage` is an engine type.

### A1 out of scope
- Retrying `LlmOutputInvalidError` (it is skippable but not retried, because it has already been reprompted `maxRetries` times; see *Open*).
- Skipping on deadline/transient errors; reasoning-off retries (rejected by the probe); a lower per-file cap; streaming early abort (brief 05, Opt4).
- Storing tokens or cost for runs that fail anyway (`run-executor.ts:415`, plan 13 AC5).
- Any UI badge, `partial` status, `RunHistory`/`VerdictBanner` change; `classifyIntent`; conventions extraction.

### A1 risks (pass 2)
- **Double bill.** A truncation retry doubles the spend on a runaway chunk, up to 2 × 32k output tokens. The probe gave 0/5 `length` on re-roll, so most retries should succeed. A 142-file run can still skip 14 chunks before it fails.
- **Score and verdict cover reviewed files only.** The summary note is the only marker, and the row in `RunHistory` stays green when the reviewed files are clean. This is accepted with P2. A badge (P3/P4) is a follow-up.
- **Summary note is model-adjacent.** It is prepended to the model's summary in `reviews.summary`, so anything that parses the summary sees it. Nothing parses it today (`to-review.ts:95` builds its own counts).
- **Fail-fast wastes completed chunks.** When the limit is exceeded, the findings of the chunks already reviewed are lost, and the run stores 0 tokens. This is by decision (A1d = S1).
- **Shared retry budget.** A truncation followed by a deadline ends on `LlmDeadlineError`, which is not skippable, so the run fails. This is consistent with A1c = T2.
- **Invalid output is skipped without a retry** (assumption, see *Open*).
- **10% is an assumption.** It is a server constant, so changing it is a one-line edit.

### Open (for the main session)
- `LlmOutputInvalidError`: S10 skips it without a retry (assumption). The "A1 decisions recorded" text replaces the "truncated/invalid never retried" clause, but A1a only decides the truncation retry. If invalid output should also get one re-roll, add it to S10's retry condition and to T3.

### A1 approved (2026-10-01)
User: "затверджую". Amendment A1 (S10–S13, group G4) is approved as written, with invalid output not retried (it is skipped after the in-provider reprompts). Status draft → approved → in-progress (G4).

## Handoffs → verification (A1, after G4)
From the G4 implementer run (2026-10-01, status done; S10–S13 done). Trivial deviations:
- S10: a `takeFailed()` helper (TS narrows a closure-assigned `let` to `never`); `onFinalFailure` is also guarded by `!o.signal?.aborted`.
- S11: an `as FailedCallUsage | undefined` cast at its read (same narrowing).
- S12: `run.ts:<line>` citations were fixed only in the sections S12 names; the `llm-call.ts:190-205` cite is approximate.
- Files: `reviewer-core/src/review/llm-call.ts`, `src/review/run.ts`, `src/index.ts`, `test/llm-call.test.ts` (T1–T5), `test/run-reliability.test.ts` (K1–K7), `docs/pipeline.md`; `server/src/modules/reviews/constants.ts`, `run-executor.ts`, `test/run-cancel.it.test.ts`.
- Skills deviation: `typescript-expert` and `security` were not read (the implementer flagged it).
- Main-session review: zero partials throws `ReviewChunksSkippedError` (no false clean); the skip limit applies in map-reduce only and only to truncated/invalid output; the partial note goes in the summary; skipped usage is added to the run.

### Skills (G4)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S10, S11, S13 | |
| `typescript-expert` | not read | — | implementer skipped it (deviation) |
| `security` | not read | — | implementer skipped it (deviation) |

### Verification log — A1 wave (2026-10-01)
- Main session, once after G4: reviewer-core typecheck ✅ and `npm test` 155 ✅; server typecheck ✅ and `pnpm test` 56 files / 543 tests, exit 0, including all `.it` files; client typecheck ✅.
- plan-verifier (delta, A1): **incomplete**: 56/61 met; all A1 code and Done-when checks are met. Gaps SK10, SK11, SK13: `typescript-expert` (S10, S11, S13) and `security` (S11) were not read, so they go to fix mode. Needs sign-off: R3, R4.
- **Main-session fix: A1-log** (`reviewer-core/src/review/run.ts`, S11 file, +1 line): the skip line says "after retry" only for `LlmOutputTruncatedError`, because invalid output is not retried (verifier handoff). Re-run: reviewer-core typecheck ✅, `run-reliability.test.ts` 13 ✅.
- **Main-session fix: A1-doc** (`reviewer-core/docs/pipeline.md`, S12 file): the stale `src/index.ts:39-48` cite is replaced by a content reference ("the `./review/run.js` export block") so it can't drift.
- **Fix mode SK10/SK11/SK13 (2026-10-01):** implementer done. It read `typescript-expert` and `security` in full and re-checked S10/S11/S13. One change: `run.ts` replaced the `as FailedCallUsage | undefined` cast with a `const failed: { usage?: FailedCallUsage } = {}` box (no assertion). `takeFailed()` was kept: it has no cast and prevents a first-attempt usage leak. Security: logs carry only labels, error names and counts; the limit is a server constant; cancel never becomes a skip; zero partials throws. reviewer-core typecheck ✅, `npm test` 155 ✅; main session: server typecheck ✅, `run-cancel.it` ✅. Corrected Skills (G4), which supersedes the table above:

| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S10, S11, S13 | |
| `typescript-expert` | on demand (fix run, full) | S10, S11, S13 | |
| `security` | on demand (fix run, full) | S11, S13 | not applicable to S10 (pure helper, no trust boundary) |
- plan-verifier (delta, SK fixes): 58/61. SK10/SK11/SK13, A1-log, A1-doc and the cast removal are met. New gap **S12-P**: five `run.ts:<line>` cites in `pipeline.md` were shifted 1–2 lines by the later cast-removal edit.
- **Main-session fix: S12-P** (`reviewer-core/docs/pipeline.md`, S12 file, 5 cites): `:301`→`:302`, `295-325`→`295-326`, `326-358`→`327-357`, `370-372`→`372-374`, `374-390,413-425`→`377-386,421-425`, matched against the current `run.ts` (the `callWithDeadline` call, the `catch`, the zero-partials guard, the paths and the summary note).
- **A1 live confirmation (2026-10-01, run `GR` on PR #13, 142 files, map-reduce, under `caffeinate`, no sleep events in `pmset -g log`):** at 13:33:13, `reviewer-core/src/review/run.ts` hit the 32k cap → `retrying once (LlmOutputTruncatedError) · routing require_parameters`. The retry succeeded in ~38 s, with `counted failed attempt — 7266 in / 32000 out tokens` (plan 13). The run completed (`done`, 45 findings reduced → 15 critical / 23 warnings / 7 suggestions after grounding, $0.162). Before A1 the same runaway failed the whole run (2026-09-30 20:55).
- **Side finding, not an A1 gap:** the 11:41 run failed with `Invalid response body … Socket timeout`. `pmset -g log` shows the Mac in idle sleep from 3 s after that chunk's request until the failure (DarkWake at 12:30:55 and 12:35:39, matching the log). The openai SDK's keep-alive agent socket timeout (5 min, `node_modules/openai/_shims/node-runtime.js:53-54`) fired on wake. Follow-up idea **PR2** (not decided): normalise a body-read `FetchError` (`type: 'system'`) to `LlmConnectionError` so it is retried once. That won't help a sleeping machine; the remedy there is `caffeinate -is ./scripts/dev.sh`.

### A1 sign-off (2026-10-01)
User: "R3 - приймаю. R4 - запустити test-writer".
- R3 signed off: after the A1 approval, only the main session (Status, decisions, handoffs, Verification log, main-session fixes) and the planner (A1 steps, before approval) edited this plan file.
- R4: test-writer is being run for A1 (S10/S11) to prove the new tests can fail.
- **test-writer (A1, 2026-10-01, closes R4):** a Test Report with a *Proof* table. Results:
  - 15 temporary mutations of `llm-call.ts`/`run.ts`, each failing its named tests (T1–T6, K1–K9), then reverted.
  - Checksums restored: `llm-call.ts` `b9cb074d…`, `run.ts` `00aa3f7f…`. One revert first failed on an ambiguous anchor and was fixed. The main session re-checked: the checksums match, no mutation markers remain, and reviewer-core typecheck ✅ and `npm test` 159 ✅.
  - +4 tests: T4b (cancel after a reported round), T6 (no double count when the retry fails), K8 (invalid output skipped), K9 (`floor` in the limit).
  - Production defects: none. Not testable: `takeFailed()`'s clear and the lone `!aborted` guards in `onFinalFailure` (defensive; another path covers them).

### A1 Final (2026-10-01)
Amendment A1 is complete. Every A1 item is met (delta verifications plus S12-P fixed); SK10/SK11/SK13 are closed; R3 is signed off by the user; R4 is proven by test-writer; and a live run confirms the truncation retry. Status → `done`. Open follow-ups (not decided):
- PR2: normalise a body-read `FetchError` to `LlmConnectionError`;
- a run over the skip limit still loses its reviewed chunks (by decision);
- an OpenRouter streaming early-abort prototype (idea 05 Opt4).
