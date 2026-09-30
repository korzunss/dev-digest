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
