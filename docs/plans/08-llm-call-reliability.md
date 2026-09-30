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
