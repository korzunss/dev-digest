# Development Plan: Count failed LLM attempts in a run's tokens and cost
Status: done
Save as: docs/plans/13-count-failed-llm-attempt-usage.md
Spec: none (idea brief: docs/ideas/04-count-failed-llm-attempt-usage.md, Opt3; Q2 = no)

## Goal & acceptance criteria
A review run that succeeds after `callWithDeadline`'s retry reports the usage of the failed attempt too: real usage of rounds that completed before a throw, plus a price-book estimate for a deadline-aborted round, marked `costSource: 'estimate'`. Runs that finally fail keep today's behaviour.
- AC1: `OpenRouterProvider.completeStructured` calls `req.onUsage` once per completed round with **that round's** real usage, before any throw that follows the round (truncated, invalid-after-reprompts, or a later round's SDK error).
- AC2: when attempt 1 fails with a transient error after reporting rounds and attempt 2 succeeds, the result `callWithDeadline` returns has tokens = reported rounds + attempt 2, and `costUsd` = their sum; `costSource` stays `api` when every part was `api`.
- AC3: when attempt 1 hits the deadline and attempt 2 succeeds, the result adds an estimate for the aborted round: input = the last reported round's `tokensIn + tokensOut` of that attempt, else `countTokens(joined message contents)` (chars/4 when no counter); output = min(round(elapsed s × 16), `maxTokens`), elapsed measured from the last report (or attempt start). `costSource` becomes `estimate`.
- AC4 (D4-B): when `estimateCost` returns null (or is absent), or a reported round has `costUsd: null`, the estimated/unpriced tokens are still added, `costUsd` stays the sum of the priced parts (not null), `costSource` is `estimate`, and the run log gets a line containing `could not be priced`.
- AC5: a successful first attempt returns the provider's result unchanged (no merge, no extra line); a run whose retry also fails still throws (no change).
- AC6: `reviewPullRequest` forwards `estimateCost` and `countTokens` to `callWithDeadline`; `run-executor.ts` wires `estimateCost` to `container.priceBook.estimate`.

## Decisions needed
None open — see *Decisions recorded*. (Options as posed in pass 1: *Design notes → Options considered*.)

## Decisions recorded
User, 2026-09-30: "усе за рекомендаціями, D4-B". Full plan approved by the user on 2026-09-30 ("13 - так"). Status draft → approved → in-progress (G1).
- **D1 → A:** an optional `onUsage(u)` callback on `StructuredRequest`. `callWithDeadline` gives each attempt its own collector and returns one merged result, and `run.ts` keeps summing `res`.
- **D2 → A:** the deadline estimate is computed in `callWithDeadline`. A new optional `estimateCost` on `ReviewInput` is passed into `CallWithDeadlineOptions`, and `run-executor.ts` wires it to `container.priceBook.estimate`.
- **D3 → B:** input = the last completed round's `tokensIn + tokensOut`, falling back to `countTokens(original messages)`. Output = min(elapsed s × 16 tok/s, `maxTokens`) (assumption).
- **D4 → B** (against the planner's recommendation): when the price book has no price for the model, add the estimated tokens, leave `costUsd` as the sum of the known parts (not null), mark the run `estimate`, and write a run-log line saying one attempt could not be priced.
- **D5 → A:** only `OpenRouterProvider` and the reviewer-core test fakes feed the sink.
- **D6 → A:** non-review callers (`intent/classify.ts`, `conventions/service.ts`) are unchanged.
- **D7 → A:** a targeted mirror of the new field into `client/src/vendor/shared/adapters.ts`.
- **External research question** (billing on a non-streaming abort): skipped at the main session's recommendation, which the user accepted. It is already recorded in `reviewer-core/INSIGHTS.md` (2026-09-30 correction entry): a non-streaming abort does not stop upstream generation and the full response is billed (OpenRouter docs), with no generation id to fetch usage later. So D3's estimate is a deliberate lower bound.

## Prerequisites
None. No new dependencies; no Postgres needed except for the related `.it` run in the group's Done-when.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S5 | shared port (+ client mirror) → reviewer-core provider → `callWithDeadline` → `run.ts` → server `run-executor.ts` wiring | — | last group; hand the plan to the full `.it` run and `plan-verifier` |

One group on purpose: S5 is a one-line wiring and S1 is ~15 lines; split out they would each be under the 3-file / ~80-line floor. Order inside the group is fixed (S1 → S5); each step leaves its package type-checking.

## Steps

### S1 — Add `LlmUsageReport` and `StructuredRequest.onUsage` to the port  [Contract]
- **Files:** `server/src/vendor/shared/adapters.ts` (modify) · `client/src/vendor/shared/adapters.ts` (modify — targeted mirror)
- **Change:** in the server copy, above `StructuredRequest` (`adapters.ts:71`), add
  `export interface LlmUsageReport { tokensIn: number; tokensOut: number; costUsd: number | null; costSource?: CostSource }` with a doc comment ("usage of ONE completed round, reported as soon as the response arrives"). Add to `StructuredRequest<T>`, after `signal`: `onUsage?: (u: LlmUsageReport) => void;` with a doc comment: called once per completed round with that round's own usage (not cumulative), before any throw that follows; never serialised into the body; providers that don't support it ignore it. Mirror **exactly these two additions** into the client copy (its `StructuredRequest` ends with `signal` at line ~93; `CostSource` is already imported there). Do not touch the client copy's other drift (no `sessionId`).
- **Layer / why here:** `StructuredRequest` is the `LLMProvider` port (TS interface, not a Zod contract — it already carries `schema`/`signal`); ports live in `@devdigest/shared`, edited server-first then mirrored (`CLAUDE.md`, root `INSIGHTS.md`).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** the port names no vendor ("usage", not "OpenRouter usage"); the field is optional so every existing `LLMProvider` and fake still compiles; a targeted edit — never `cp` the shared folder; `CostSource` reused, not redefined.
- **Known gotchas:** root `INSIGHTS.md` → "2026-09-17 — the two vendored `shared` copies are not actually in sync" (mirror by hand); "TS2719 … after adding a contract field" (only if a fixture factory breaks — here the field is optional, so none should).
- **Done when:** `cd server && pnpm typecheck` · `cd client && pnpm typecheck` · `git diff client/src/vendor/shared` shows only the `LlmUsageReport` interface and the `onUsage` field.

### S2 — `OpenRouterProvider` reports each round's usage
- **Files:** `reviewer-core/src/llm/openrouter.ts` (modify) · `reviewer-core/test/openrouter.test.ts` (modify)
- **Change:** in `completeStructured`, right after a round's usage is read (today `openrouter.ts:129-134`, after `choice` is known and before the `finish_reason === 'length'` check), compute the round's own numbers — `roundIn = res.usage?.prompt_tokens ?? 0`, `roundOut = res.usage?.completion_tokens ?? 0`, `roundCost = apiCost` when a number, else `this.estimateCost?.(req.model, roundIn, roundOut) ?? null`, `costSource` `'api'` / `'estimate'` / omitted when null — and call `req.onUsage?.({...})`. Keep the existing cumulative locals and return value unchanged. The no-choices `Error` (`:125-128`) reports nothing (no usage exists).
- **Layer / why here:** the adapter is the only code that sees per-round usage; it must push it before any throw point (brief, Opt3).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** no new I/O and no `process.env` (purity); `onUsage` never goes into the request body (the body object stays as is); a throwing `onUsage` is the caller's bug — do not wrap it in try/catch (assumption); per-round, not cumulative, numbers.
- **Known gotchas:** `reviewer-core/insights/gotchas.md` → "The only I/O allowed under `reviewer-core/src` is the `fetch` in `listModels()`" ([INSIGHTS](../../reviewer-core/INSIGHTS.md#2026-09-26--fetch-in-srcllmopenrouterts-is-the-one-allowed-io-an-import-only-purity-check-misses-it)); "Classify `openai` SDK errors with `instanceof`" — leave the `.catch` block untouched ([INSIGHTS](../../reviewer-core/INSIGHTS.md#2026-09-30--openai-error-classes-keep-name--error-classifying-by-name-never-matches)).
- **Done when:** `cd reviewer-core && npm run typecheck` · `openrouter.test.ts` cases O1–O4 (see *Tests*) pass.

### S3 — `callWithDeadline` merges a failed attempt's usage into the retry's result
- **Files:** `reviewer-core/src/review/llm-call.ts` (modify) · `reviewer-core/test/llm-call.test.ts` (modify)
- **Change:**
  1. `CallWithDeadlineOptions<T>`: `request` becomes `Omit<StructuredRequest<T>, 'signal' | 'onUsage'>`; add `estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null` and `countTokens?: (s: string) => number`.
  2. Export `DEADLINE_ESTIMATE_TOKENS_PER_SEC = 16` (assumption, brief's slowest observed provider).
  3. In `attempt`, keep a per-attempt `reports: LlmUsageReport[]` and `lastReportAt` (init = `started`); pass `onUsage: (u) => { reports.push(u); lastReportAt = Date.now(); }` with the request. On failure, attach the usage to a local "failed attempt" record (e.g. a `FailedUsage` value captured in a closure variable — do **not** add fields to the error objects).
  4. When the deadline fired, add an estimated round: input per AC3 (last report's `tokensIn + tokensOut`, else `countTokens(request.messages.map(m => m.content).join('\n'))`, else `Math.ceil(chars / 4)`); output = `Math.min(Math.round((Date.now() - lastReportAt) / 1000 * DEADLINE_ESTIMATE_TOKENS_PER_SEC), request.maxTokens ?? Infinity)`; cost = `o.estimateCost?.(model, in, out) ?? null`.
  5. After the retry succeeds, return `mergeFailedUsage(res, failed)` — a pure, module-private helper: tokens added; `costUsd` = `res.costUsd == null ? null : res.costUsd + sum(priced failed parts)`; `costSource` = `'estimate'` if `res.costSource === 'estimate'` or any failed part is estimated or unpriced, else `res.costSource`; every other field from `res`. Emit one line: `` `${label}: counted failed attempt — ${in} in / ${out} out tokens${deadline ? ' (deadline estimate)' : ''}${unpriced ? ' · one attempt could not be priced, cost excludes it' : ''}` `` (`info`). A failed attempt with no reports and no deadline (e.g. 503 on round 1) merges nothing and emits nothing.
  6. First-attempt success returns `res` as is; a retry that throws still throws (Q2 = no).
- **Layer / why here:** D1-A/D2-A — only `callWithDeadline` knows a deadline fired and owns both attempts.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** pure (no I/O; `Date.now()` is already used here); run-log line carries only model-free counts and label — no prompt content; the retry's `onUsage` collector is not used for merging (its usage is in `res`), so nothing is double-counted; cancel path (`o.signal?.aborted`) unchanged.
- **Known gotchas:** `reviewer-core/insights/gotchas.md` → "Every review LLM call goes through `callWithDeadline` … A deadline abort of a non-streaming call is still billed in full" ([INSIGHTS](../../reviewer-core/INSIGHTS.md#2026-09-30--correction-the-stalled-body-hang-is-now-bounded-by-callwithdeadline-plan-08)) — the estimate is a lower bound, by decision.
- **Done when:** `cd reviewer-core && npm run typecheck` · `llm-call.test.ts` cases L1–L5 pass, and the existing "deadline then success" case is updated from `.resolves.toBe(ok)` to `toMatchObject({ data: 1 })` plus the new estimate fields.

### S4 — `reviewPullRequest` forwards `estimateCost` and `countTokens`
- **Files:** `reviewer-core/src/review/run.ts` (modify) · `reviewer-core/test/run-reliability.test.ts` (modify)
- **Change:** add `estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null` to `ReviewInput` (doc: "price book for estimating a deadline-aborted attempt; absent ⇒ that attempt's tokens are counted unpriced"). In the `callWithDeadline` call (`run.ts:~270`) spread `...(input.estimateCost ? { estimateCost: input.estimateCost } : {})` and `...(input.countTokens ? { countTokens: input.countTokens } : {})`. The per-chunk summation (`run.ts:~288-293`) stays as is.
- **Layer / why here:** `ReviewInput` is the engine's injection point; the price book stays a server concern (D2-A).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** no summation change (D1-A: `res` already carries the merge); optional field, so no caller breaks; no import of server code.
- **Known gotchas:** none beyond S3's.
- **Done when:** `cd reviewer-core && npm run typecheck && npm test` · `run-reliability.test.ts` cases R1–R2 pass.

### S5 — Wire the price book into the review run
- **Files:** `server/src/modules/reviews/run-executor.ts` (modify)
- **Change:** in the `reviewPullRequest({...})` argument (`run-executor.ts:266-300`), next to `countTokens` (`:292`), add `estimateCost: (model, tokensIn, tokensOut) => this.container.priceBook.estimate(model, tokensIn, tokensOut),`.
- **Layer / why here:** application layer reaches the price book through `container` (`platform/container.ts:184`), exactly as the OpenRouter provider is wired (`container.ts:271-274`).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** through `container`, no import of `platform/price-book.ts` or `adapters/llm/pricing.ts` into the module; synchronous call (`PriceBook.estimate` is sync, `price-book.ts:34`).
- **Known gotchas:** `server/insights/gotchas.md` → ".it tests must not reach a real API key" — relevant only when running the related `.it` file ([INSIGHTS](../../server/INSIGHTS.md#2026-09-26--it-tests-read-the-developers-real-secrets-and-make-live-llm-calls)).
- **Done when:** `cd server && pnpm typecheck && pnpm test` · `cd server && pnpm exec vitest run test/run-cancel.it.test.ts test/intent-review.it.test.ts` (Postgres up) passes · `rg -n 'priceBook.estimate' server/src/modules/reviews/run-executor.ts` finds the line.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `reviewer-core/test/openrouter.test.ts` | unit | O1 real-number reprompt then transient: round 1 returns invalid JSON with usage `{prompt 1000, completion 200, cost 0.002}`, round 2 `create` rejects with `Object.assign(new Error('boom'), { status: 503 })` → call rejects, `onUsage` called once with `{ tokensIn: 1000, tokensOut: 200, costUsd: 0.002, costSource: 'api' }` · O2 truncation reports the round (`tokensOut 32000`) before throwing · O3 no `usage.cost` + `estimateCost` option → report `costSource: 'estimate'`; neither → `costUsd: null`, no `costSource` · O4 three invalid rounds → 3 reports with per-round (not cumulative) numbers | S2 |
| `reviewer-core/test/llm-call.test.ts` | unit | L1 real-number reprompt then transient: fake attempt 1 calls `req.onUsage({1000, 200, 0.002, 'api'})` then rejects `{ status: 503 }`; attempt 2 resolves `{ tokensIn 1200, tokensOut 300, costUsd 0.003, costSource 'api' }` → result 2200 / 500, `costUsd ≈ 0.005` (`toBeCloseTo`), `costSource 'api'`, one "counted failed attempt" line · L2 deadline estimate, known price: fake timers, `deadlineMs 60_000`, `countTokens: () => 100`, `estimateCost: (m, i, o) => (i + o) / 1e6`, retry returns `{1, 1, 0.01, 'api'}` → 101 / 961, `costUsd ≈ 0.01106`, `costSource 'estimate'` · L3 deadline estimate, unknown price: same with `estimateCost: () => null` → 101 / 961, `costUsd 0.01`, `costSource 'estimate'`, a line containing `could not be priced` · L4 round-2 input and cap: attempt 1 reports `{500, 50, …}` then hangs, `maxTokens 100` → estimate adds 550 in / 100 out · L5 first-attempt success returns the provider's object unchanged (`toBe`) and emits no "counted" line | S3 |
| `reviewer-core/test/run-reliability.test.ts` | unit | R1 run level: fake reports + 503 on call 1, priced success on call 2 → `ReviewOutcome.tokensIn/tokensOut/costUsd` include both, `costSource 'api'` · R2 `estimateCost` and `countTokens` from `ReviewInput` reach the call: deadline case with fake timers → `outcome.costSource === 'estimate'` and the estimate priced by the passed `estimateCost` | S4 |
| `server/test/run-cancel.it.test.ts`, `server/test/intent-review.it.test.ts` | integration | regression only — the executor still runs and cancels with the new field (MockLLMProvider ignores `onUsage`, D5-A) | S5 |

## Migrations & contracts
- No migration.
- Port change: `LlmUsageReport` + `StructuredRequest.onUsage` in `server/src/vendor/shared/adapters.ts`, targeted mirror into `client/src/vendor/shared/adapters.ts` — step S1 only.

## Out of scope
- Runs that finally fail (both attempts fail, or a non-retryable error): still store 0 (Q2 = no); `run-executor.ts:386-394` failure path untouched.
- Server `openai.ts`, `anthropic.ts`, `MockLLMProvider`, server test fakes: no `onUsage` support (D5-A).
- `intent/classify.ts`, `conventions/service.ts` (D6-A).
- Any change to `errors.ts`, `isTransientLlmError`, the SDK error mapping, `StructuredResult`, the run summation in `run.ts`, persistence, or the UI.
- Fixing the client `shared` copy's other drift.

<!-- implementer-brief:end -->

## Context applied
- `docs/ideas/04-count-failed-llm-attempt-usage.md` → Opt3 chosen, Q2 = no — scope of S2–S4; Opt1 not re-opened.
- `reviewer-core/insights/gotchas.md` → purity (`fetch` only in `listModels`) — S2/S3 practices; `callWithDeadline` is the only review call path — S3; `instanceof` classification — S2 leaves the `.catch` alone.
- root `INSIGHTS.md` → "the two vendored `shared` copies are not actually in sync" — S1 targeted mirror; "TS2719 after adding a contract field" — S1 gotcha; "a skill listed on a step where it has nothing to do …" — `zod`/`security`/`fastify-best-practices` left off the steps.
- `server/insights/gotchas.md` → hermetic `.it` tests — S5 Done-when.
- `reviewer-core/INSIGHTS.md` 2026-09-30 correction entry → full billing on abort; the D3 estimate is a lower bound (Risks).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1–S5 | |
| `engineering-insights` | preload | — | read-phase only; wrap-up is the main session's |
| `typescript-expert` | on demand (S1) | S1–S5 | |
| `zod` | not loaded | — | no Zod schema written in any step |
| `security` | not loaded | — | no trust boundary; the new log line carries counts only |
| `fastify-best-practices` | not loaded | — | no route or plugin change |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `server/src/vendor/shared/adapters.ts` | Ports | changed (new interface + field) |
| client | `client/src/vendor/shared/adapters.ts` | Ports (mirror) | changed |
| reviewer-core | `src/llm/openrouter.ts` | Core (provider impl) | changed |
| reviewer-core | `src/review/llm-call.ts` | Core | changed |
| reviewer-core | `src/review/run.ts` | Core | changed (`ReviewInput.estimateCost`) |
| server | `src/modules/reviews/run-executor.ts` | Application | changed (one wiring line) |

## Design notes
**Why merge inside `callWithDeadline` (D1-A).** The provider's `res` is authoritative for the attempt that succeeded, so only the failed attempt's collector is ever merged; the retry's own collector is ignored. That avoids double counting and keeps any provider that ignores `onUsage` correct on the success path. `run.ts` keeps summing `res` unchanged.

**Estimate timing.** Elapsed time is measured from the last round report in the aborted attempt, not from the attempt start, so completed reprompt rounds are not counted twice (their real usage is already reported). `attempts` in the merged result stays the retry's value (assumption: it counts reprompt rounds of the returned attempt, not transport attempts).

**Unpriced parts (D4-B).** A failed part with `costUsd: null` adds tokens only; `costUsd` is the sum of priced parts, and `costSource` is forced to `estimate` so the badge never claims `api` for an incomplete figure. The exception is a retry result whose own `costUsd` is null: that stays null, matching today's per-chunk rule in `run.ts`.

**Options considered (pass 1).** D1: callback + merge in `callWithDeadline` (chosen) vs. accumulator summed in `run.ts`. D2: estimate in `callWithDeadline` with injected `estimateCost` (chosen) vs. in the provider on abort. D3: input from the last reported round (chosen) vs. from the original prompt. D4: null run cost vs. known-parts sum + `estimate` + log line (chosen, against the recommendation). D5: OpenRouter only (chosen) vs. server adapters too. D6: non-review callers unchanged (chosen). D7: targeted client mirror (chosen).

## Risks & open questions
- The 16 tok/s floor is an unvalidated assumption (experiment skipped). Since a non-streaming abort is billed for the full response (`reviewer-core/INSIGHTS.md`, 2026-09-30 correction), the estimate can undercount by up to `maxTokens − estimate`. Accepted as a lower bound; revisit if OpenRouter activity shows a consistent gap.
- The existing `llm-call.test.ts` "deadline then success" case asserts object identity (`toBe(ok)`); after S3 the deadline path returns a merged copy, so that assertion is updated in S3 (not a regression).
- With `openai`/`anthropic` review models (D5-A), a failed attempt that reported nothing still merges a deadline estimate if the deadline fired, but a transient failure after reprompt rounds counts nothing — same as today.
- `callWithDeadline`'s JSDoc says the result is the provider's; after S3 it is a merged copy on the retry path — update the JSDoc in S3.

## Handed off
- architecture-reviewer: the port field addition (S1) and that `run-executor.ts` reaches the price book only via `container` (S5).
- security review: none needed — no trust boundary, no input parsing, no secrets; the run-log line has counts only.

## Insights to record
- None yet — candidates only if implementation turns something up (e.g. whether vitest fake timers drive `Date.now()` in `llm-call.test.ts`).

## Red-flags check
- [x] Every AC maps to at least one step or test (AC1 → S2/O1–O4 · AC2 → S3/L1, R1 · AC3 → S3/L2, L4 · AC4 → S3/L3 · AC5 → S3/L5 · AC6 → S4/R2, S5)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; no new files
- [x] Every assumption is marked; product choices are in *Decisions recorded*
- [x] Groups end type-checking; one group, no parallel groups
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1 check n/a (pass 2)
- [x] Every step's *Skills to apply* is complete (the implementer reads only those)

## Handoffs → verification (after G1)
From the G1 implementer run (2026-09-30, status done; S1–S5 done). Trivial deviations:
- S1: each vendored copy got only `LlmUsageReport` and `onUsage` (+14 lines each).
- S3: the updated "deadline then success" case expects `tokensIn: 1, tokensOut: 17, costSource: 'estimate'`.
- Files: `server/src/vendor/shared/adapters.ts`, `client/src/vendor/shared/adapters.ts`, `reviewer-core/src/llm/openrouter.ts` + `test/openrouter.test.ts` (O1–O4), `reviewer-core/src/review/llm-call.ts` + `test/llm-call.test.ts` (L1–L5), `reviewer-core/src/review/run.ts` + `test/run-reliability.test.ts` (R1–R2), `server/src/modules/reviews/run-executor.ts`.
- Main-session review: `onUsage` fires before any throw point in the round. Reports are used only on the failure path, so there is no double count on success. Under D4-B, unpriced parts add tokens only, and `costUsd` stays the sum of known parts.

### Skills (G1)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1–S5 | |
| `typescript-expert` | on demand (head of SKILL.md) | S1–S5 | |

## Verification log
### Wave 1 (2026-09-30)
- Main session, once after the last group: reviewer-core typecheck ✅ and `npm test` 144 ✅; client typecheck ✅; server typecheck ✅ and `pnpm test` 54 files / 533 tests, exit 0, including all `.it` files (plan 12's changes also in the tree).
- plan-verifier (Wave 1): **complete — needs sign-off**: 58/60 met, no gaps, no unplanned changes. Needs sign-off: R3 (plan file untracked), R4 (no test-writer run).
- **Main-session fix: JSDoc** (verifier handoff; the plan's Risks asked for it, and S3's Change did not list it). The `callWithDeadline` JSDoc in `reviewer-core/src/review/llm-call.ts` (in S3's Files, +3 lines, comment only) now says a successful retry returns a merged copy. Re-run: reviewer-core typecheck ✅, `llm-call.test.ts` ✅.

### Sign-off (2026-09-30)
User: "R3 підтверджую, R4 приймаю для 12 і 13".
- R3 signed off: after approval, only the main session edited this plan file (Status, Decisions recorded, handoffs, Verification log).
- R4 accepted: no test-writer run for this plan.

### Final (2026-09-30)
Verification complete — needs sign-off. The user signed off R3 and accepted R4. Status → `done`.
