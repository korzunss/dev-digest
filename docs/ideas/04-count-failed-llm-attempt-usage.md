# Idea brief: Count failed LLM attempts in a run's tokens and cost
Status: chosen (Opt3)
Save as: docs/ideas/04-count-failed-llm-attempt-usage.md

## Problem as understood
When a review call is retried, the run's reported tokens and cost show only the attempt that succeeded. Two costs are lost. The first is a deadline-aborted attempt: it is billed in full but returns no usage. The second is the reprompt rounds that ran before a transient error; their real usage is dropped when the error is thrown. For the user this means the run cost badge under-reports what OpenRouter actually charged.
**Decision drivers:** (D1) real usage from case 2 is never lost, on any throw path · (D2) a case-1 attempt is counted as a marked `estimate` · (D3) small surface: no contract or UI change, `errors.ts` stays free of `openai`, and `reviewer-core` stays pure.
**Appetite:** zero extra LLM calls per run; a change of about one plan group inside reviewer-core (assumption).

## Already in the repo
- Plan 08 (llm-call-reliability, done) added `callWithDeadline`, the single retry and the error classes. It explicitly left out "Persisting failed-run tokens/cost" (`docs/plans/08-llm-call-reliability.md` out-of-scope list). It also recorded as a risk: "A deadline-aborted or truncated call is billed but the failed run stores 0 tokens (`run-executor.ts:386-394`)".
- Idea 02 (cheaper-review-runs, open) depends on accurate per-run cost. This fix makes its baseline trustworthy.

## Options (at most 5 total, status quo included)
- Opt1: failed-attempt usage rides on the thrown error · Opt2: status quo · Opt3: a usage sink on the request (callback or accumulator), which the provider feeds every round

### Opt1 — Usage carried on the thrown error
- **Value:** Errors already travel to `callWithDeadline`, so attaching the partial usage to them keeps the success path unchanged. `callWithDeadline` then adds the failed attempt's usage into the retry's result, or into the retry's error if that fails too.
- **Packages / contract / migration:** reviewer-core only: the error classes, the provider adapter and `callWithDeadline`. No migration.
- **Per-run LLM cost:** +0 calls (inference)
- **Risk:** 5xx and 429 errors are `openai` SDK classes, so usage cannot be added to them without mutating a third-party error. The alternative is to wrap every rethrow in our own class, which touches the `instanceof` transient classification (a known gotcha) and risks a silent no-retry regression. Merging usage across two failed attempts is also error-prone.
- **Kill criterion:** if Opt1 was picked and failed, the likely reason is that one throw path kept a raw SDK error, so its usage vanished again, or the re-wrap broke `isTransientLlmError`.

### Opt2 — Status quo (report only the successful attempt)
- **Value:** Nothing to build.
- **Packages / contract / migration:** none.
- **Per-run LLM cost:** +0 (inference)
- **Risk:** Case 2 is an accepted bug, so this option leaves it open. Case 1 under-reports by a full billed call, up to about 10 minutes of output.
- **Kill criterion:** not applicable. The user has already called case 2 a bug, so this option cannot be the answer.

### Opt3 — Usage sink on the request
The sink is either an `onUsage` callback or a mutable accumulator. These are two forms of the same mechanism, not two options.
- **Value:** The provider reports each round's real usage to the sink as soon as that round's response arrives, so it survives any later throw. `callWithDeadline` adds the deadline-attempt estimate, flagged `estimate`, to the same sink. `run.ts` sums the sink instead of `res`. Error classes stay unchanged and `errors.ts` needs no edit.
- **Packages / contract / migration:** reviewer-core: one optional field on the provider request, plus the provider, `callWithDeadline` and the run summation. No contract change if the request type is internal to reviewer-core (see Facts needed). No migration.
- **Per-run LLM cost:** +0 calls (inference)
- **Risk:** Double counting, if `run.ts` still adds `res.*` on top of the sink. A test fake or a future provider that ignores the hook quietly undercounts.
- **Kill criterion:** if Opt3 was picked and failed, the likely reason is that the request type turned out to be a Zod contract in `shared`, where a function field is not allowed, or that summing both sink and result double-counted.

## Comparison
| Option | D1 real usage never lost | D2 case-1 estimate | Contract/migration | LLM cost/run | Purity | No-go | Confidence |
|---|---|---|---|---|---|---|---|
| Opt1 | partial: SDK errors need wrapping | yes, in `callWithDeadline` | none (if errors are internal) | +0 | kept (no `openai` in `errors.ts`, but the adapter re-wraps) | none | medium (~0.6, inference) |
| Opt2 | no | no | none | +0 | kept | case 2 is an accepted bug | n/a |
| Opt3 | yes: pushed before any throw point | yes, same sink | none (if the request type is internal) | +0 | kept, no I/O | none | high (~0.8, inference) |

## Recommendation
**Opt3: go.** Usage is recorded when it arrives rather than recovered from whichever error ends up thrown. That closes case 2 on every throw path, SDK-owned errors included, and leaves error classification as it is. Case 1 then comes down to one estimate added to the same sink by the only code that knows a deadline fired. What would change it: the request type is a shared Zod contract, which makes Opt1 the lower-surface choice.

**Estimating the deadline attempt** (the same choice under either option):
- Input: take the prompt's token count from the injected counter.
- Output, option 0: always an under-count. A 10-minute run of reasoning tokens, billed as output, can cost more than the input.
- Output, option `maxTokens` (32k): an impossible over-count. A provider that fast would have ended with `length` before the deadline.
- **Proposed:** elapsed time × a conservative floor throughput (the slowest provider observed, about 16 tok/s, from the plan 08 probe), capped at `maxTokens`. This gives a lower bound that is not trivially zero. Price it with `estimateCost` and mark the run `estimate` whenever any part of it is estimated.

## Cheapest experiment
**Riskiest assumption:** a deadline-aborted call is billed with an output close to elapsed × floor throughput. The alternative is that a stalled body bills about 0 output, or close to the cap.
**Try:** find 3–5 past deadline-aborted generations in the OpenRouter activity log (the run logs give their timestamps) and compare the billed tokens and cost with input + 600 s × 16 tok/s. **Cost:** about 30 minutes, no code.
**Success signal:** billed output is at or above the estimate and below about 2× it. · **Kill signal:** billed output is usually near 0, which means using input-only, or near 32k, which means using `maxTokens`.

## Questions that change the choice
- Q1: Is the provider request type (the one `completeStructured` takes) a Zod contract in `@devdigest/shared`? If yes, the answer flips to Opt1, because a function or accumulator field does not belong in a serializable contract.
- Q2: Is "a review run's reported tokens" meant to cover runs that finally **fail**? The server currently stores 0 for those, and plan 08 deferred it. If yes, the scope widens into the server. Opt3 still fits, but with a sink owned at the `reviewPullRequest` level. I have not widened the scope; this needs a decision.

## Facts needed (for researcher)
- Where are the provider request type and `StructuredResult` defined: reviewer-core or `server/src/vendor/shared`? Does an optional non-serializable field on the request count as a contract change?
- In `OpenRouterProvider.completeStructured`, which throw points come after usage has been accumulated? Are 5xx and 429 rethrown as raw `openai` errors or wrapped?
- Does `callWithDeadline` have access to `estimateCost` and `countTokens`, the elapsed time and `maxTokens`, or does only `run.ts` hold the price book?
- How does `run.ts` derive the run-level `costSource` across chunks? Does one `estimate` part already make the whole run `estimate`?
- Which errors does `isTransientLlmError` retry? Are `LlmOutputTruncatedError` and `LlmOutputInvalidError` retried, or do they fail the run straight away?
- In map-reduce, does a chunk's final failure fail the whole run, and so lose the usage of chunks that already succeeded?
- Which `LLMProvider` implementations exist (test fakes, server, mcp-server) that would have to honour a usage hook?
- Do reprompt rounds grow the message list? If so, an estimate taken from the original prompt under-counts an abort during round 2 or later. How much larger does a reprompt round's input get?

## Choice recorded
User, 2026-09-30: "Opt3, Q2 — ні, експеримент пропускаємо".
- **Opt3** (usage sink on the request) is chosen. Before the brief, the user had already chosen to estimate the deadline attempt with the price book, marked `estimate`, with no contract or UI change.
- **Q2 → no:** only runs that end successfully after a retry are in scope. Runs that finally fail keep today's behaviour (0 stored), and the server is not widened.
- **Cheapest experiment:** skipped. The deadline estimate formula ships as an assumption.
- **Q1**, answered by the main session: `StructuredRequest<T>` is a TypeScript interface in `server/src/vendor/shared/adapters.ts:71`, not a Zod contract, and it already carries non-serializable fields (`schema`, `signal`). So an optional sink field is a port change, mirrored in the client copy as plan 08 did for `routing`, and not a serializable-contract change.
- Led to: [plan 13](../plans/13-count-failed-llm-attempt-usage.md) (done 2026-09-30).
