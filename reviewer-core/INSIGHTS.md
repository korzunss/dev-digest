# Insights — `@devdigest/reviewer-core`

Append-only. Things that cost someone time in the engine. Repo-wide findings go
in [`../INSIGHTS.md`](../INSIGHTS.md), which carries the entry format, the section
guide and the promotion rule (a standing rule becomes one line under `Gotchas` in
`reviewer-core/AGENTS.md`). The `engineering-insights` skill writes here.

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

### 2026-09-30 — on a newly added file, a finding's line numbers drift 2–8 lines and grounding can't tell
**Symptom:** PR #12 findings cited the SQL injection at lines 17, 20 and 22 (real: 24) and the empty `catch` at 42–44 (real: 50); all passed citation grounding. The eval fixture's ±3 tolerance rejected real hits (7/12 instead of 9/12).
**Cause:** `groundFindings` keeps a finding when its range intersects a diff hunk; a new file is one hunk covering every line, so any line inside the file passes. The model counts lines imprecisely in a long `+`-only block.
**Rule:** treat line numbers on new files as approximate — anything that matches findings to known locations (evals, dedup, UI anchors) needs a tolerance of ~8 lines there; don't "fix" it by tightening grounding. Engine timers (`setTimeout`/`AbortController` in `llm-call.ts`) are not I/O and don't break purity.
**Evidence:** `reviewer-core/src/grounding.ts` (`rangeIntersects`) · `server/src/modules/eval/fixtures/pr-export-planted.json` (`line_tolerance: 8`) · `docs/plans/09-review-eval-fixture.md` → *Handoffs → verification (after G2)*

### 2026-09-26 — `fetch` in `src/llm/openrouter.ts` is the one allowed I/O; an import-only purity check misses it
**Symptom:** the purity rule says "no db, no GitHub, no filesystem, no
`process.env`", and the architecture check that greps `^import … from 'fs'|…`
reported `reviewer-core/src` as clean — yet `OpenRouterProvider.listModels()`
calls `fetch` directly. It surfaced only while writing `docs/pipeline.md`.
**Cause:** the package ships the one concrete `LLMProvider` next to the pure
engine (`AGENTS.md` → Map: "the one LLMProvider implementation"). Its
`listModels()` fetches `/models` raw because the OpenAI SDK's `models.list`
strips the `pricing` field. `fetch` is a global, so no import line names it.
The engine itself (`reviewPullRequest` and everything it calls) does no I/O.
**Rule:** leave that one call alone; it is the provider's own side effect, not
the engine's. Any other `fetch`, HTTP client or node I/O added under
`reviewer-core/src` breaks purity (`architecture-reviewer` A2 → CRITICAL). When
checking purity, search for `\bfetch\(` and `process\.env` as well as imports.
**Evidence:** `reviewer-core/src/llm/openrouter.ts:135` ·
`rg -n "\bfetch\(" reviewer-core/src` → that line only ·
`.claude/agents/architecture-reviewer.md` → A2 and *Known exceptions* ·
`reviewer-core/docs/pipeline.md`

## Tool & Library Notes

### 2026-09-30 — correction: the stalled-body hang is now bounded by `callWithDeadline` (plan 08)
**Symptom:** the entry below says nothing passes an `AbortSignal` yet and that OpenRouter "holds the body open while the model reasons".
**Cause:** plan 08 landed. Every review LLM call goes through `callWithDeadline` (`src/review/llm-call.ts`), which combines a per-attempt deadline (`REVIEW_CALL_DEADLINE_MS` = 10 min in `server/src/modules/reviews/constants.ts`) with the run's cancel signal (`RunBus.signalFor`) into `req.signal`; SDK `maxRetries` is 0 and the engine retries once itself. A live probe (26 calls) confirmed the abort surfaces as `AbortError` (class `APIUserAbortError`). Two parts of the original entry stay unproven or change: OpenRouter keep-alive bytes on non-streaming requests are not established (only that headers had arrived), and a non-streaming abort does **not** stop upstream generation — the full response is billed (OpenRouter docs: cancellation works for streaming only).
**Rule:** never call `llm.completeStructured` for a review outside `callWithDeadline`; the SDK `timeout` is still header-only. Count on a deadline abort costing a full call; only streaming could make it cheaper.
**Evidence:** `reviewer-core/src/review/llm-call.ts` · `reviewer-core/test/llm-call.test.ts` · `server/test/run-cancel.it.test.ts` · `docs/plans/08-llm-call-reliability.md` → *Experiment → D6*, *Research → pass 2* (Q2, Q3)

### 2026-09-30 — on OpenRouter, duration is set by the routed provider; `reasoning.effort` does nothing for `deepseek-v4-flash`
**Symptom:** the same review prompt took 94 s on one call and 530 s on the next; setting `reasoning: { effort: 'low' }` did not shorten anything, and one provider returned unparseable JSON under a strict schema.
**Cause:** OpenRouter load-balances each call across ~15 upstream endpoints of the model with throughput 14–128 tok/s (live `throughput_last_30m`); a probe saw 10 providers in 26 calls. `effort` changed reasoning tokens inconsistently (big diff: low 13.2k · none 0–10.8k · high 10.5–11.8k), and some providers skip reasoning entirely when no effort is sent. `response_format` is only a *soft* routing preference unless `provider.require_parameters: true` is sent.
**Rule:** control speed with routing, not effort: `provider: { require_parameters: true, sort: 'throughput' }` (plan 08 defaults); read the served-by provider from the top-level `res.provider` (undocumented but present) and log it. Judge a slow run by provider + throughput first, reasoning tokens second. `max_tokens` covers reasoning + answer — a small cap yields `finish_reason: "length"` with empty or broken JSON.
**Evidence:** `docs/plans/08-llm-call-reliability.md` → *Experiment → D6*, *Routing research → D6* · `GET /api/v1/models/deepseek/deepseek-v4-flash/endpoints` · `reviewer-core/src/llm/openrouter.ts` (`provider` object, `servedBy`)

### 2026-09-30 — the `openai` SDK `timeout` stops at the response headers; a stalled OpenRouter body hangs for 1–2 hours
**Symptom:** a General Reviewer run sat on `Reviewing all files in one pass` for 1 h 42 min with one unchanged HTTPS socket to OpenRouter, then failed with `Invalid response body while trying to fetch https://openrouter.ai/api/v1/chat/completions: Socket timeout`, 0 tokens. `OpenRouterProvider` sets `timeout: 90_000`, so a 90 s bound was expected. Same failure: Security Reviewer 2026-09-24 (34 min).
**Cause:** `openai` 4.104 `fetchWithTimeout` clears its timer in `.finally()` of `fetch()`, which resolves on the headers (`node_modules/openai/core.js:382-400`). OpenRouter answers a non-streaming request with `200` at once and holds the body open while the model reasons, so reading the body is unbounded. The SDK's `maxRetries` never fires either. Only a lower-level socket timeout ends it.
**Rule:** don't rely on the client `timeout` for a total deadline. Pass an `AbortSignal` with a deadline (e.g. `AbortSignal.timeout(ms)`) as `req.signal` to `completeStructured`; `openrouter.ts` already forwards it to the SDK request options. The server's run executor doesn't pass one today — deferred fix, not planned yet (see root `INSIGHTS.md` → *Open Questions*, 2026-09-30).
**Evidence:** `reviewer-core/src/llm/openrouter.ts:55,96` · run `db109306-bd97-49f1-b617-c927cceaa34c` (`agent_runs.duration_ms` 6 095 036)

## Recurring Errors & Fixes

### 2026-09-17 — findings vanish between the model response and the stored review

**Symptom:** the model returns several findings; the persisted review shows fewer,
or none, and the score doesn't match what the model reported.
**Cause:** working as designed. `groundFindings()` drops any finding that doesn't
cite a line present in the diff, and the score is recomputed from the survivors.
**Rule:** when findings disappear, inspect `groundingSummary()` before suspecting
the model or the transport. Don't loosen the gate to make findings reappear —
that's the one mechanism preventing hallucinated locations.
**Evidence:** `src/grounding.ts`

## Session Notes

_Nothing yet._

## Open Questions

_Nothing yet._
