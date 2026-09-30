# reviewer-core — current gotchas

Last reconciled with ../INSIGHTS.md: 2026-09-30

This is a curated index of rules still in force. Full write-ups live in
[`../INSIGHTS.md`](../INSIGHTS.md) (append-only log). A rule that stops holding
is edited or removed here. Items are added or updated by the
`engineering-insights` skill.

## Engine invariants

- **Missing findings mean the grounding gate did its job, not that the model or
  transport dropped them** — spot it: the persisted review has fewer findings
  than the model returned, or the score doesn't match the finding count you
  expected. [INSIGHTS: 2026-09-17 — findings vanish between the model response and the stored review](../INSIGHTS.md#2026-09-17--findings-vanish-between-the-model-response-and-the-stored-review)
- **The only I/O allowed under `reviewer-core/src` is the `fetch` in
  `OpenRouterProvider.listModels()`; any new `fetch`, HTTP client or node I/O
  breaks purity** — spot it: a purity check that greps only imports reports the
  package clean; search `\bfetch\(` and `process\.env` too. [INSIGHTS: 2026-09-26 — `fetch` in `src/llm/openrouter.ts` is the one allowed I/O; an import-only purity check misses it](../INSIGHTS.md#2026-09-26--fetch-in-srcllmopenrouterts-is-the-one-allowed-io-an-import-only-purity-check-misses-it)

## LLM transport

- **Every review LLM call goes through `callWithDeadline`; the SDK `timeout`
  only bounds the wait for response headers** — the deadline (10 min) and the
  run's cancel signal reach the call only via `req.signal`. A deadline abort of a
  non-streaming call is still billed in full. — spot it: a new call site that
  awaits `llm.completeStructured` directly can hang for 1–2 h and ends in
  `Invalid response body … Socket timeout` with 0 tokens.
  [INSIGHTS: 2026-09-30 — correction: the stalled-body hang is now bounded by `callWithDeadline` (plan 08)](../INSIGHTS.md#2026-09-30--correction-the-stalled-body-hang-is-now-bounded-by-callwithdeadline-plan-08)
- **Speed comes from the routed OpenRouter provider, not from
  `reasoning.effort`** — keep `provider: { require_parameters: true, sort:
  'throughput' }` (without `require_parameters` strict JSON is only a soft
  preference) and log `res.provider`; `max_tokens` counts reasoning too. — spot
  it: the same prompt takes 94 s on one call and 530 s on the next; the run log's
  "served by" names the slow provider.
  [INSIGHTS: 2026-09-30 — on OpenRouter, duration is set by the routed provider; `reasoning.effort` does nothing for `deepseek-v4-flash`](../INSIGHTS.md#2026-09-30--on-openrouter-duration-is-set-by-the-routed-provider-reasoningeffort-does-nothing-for-deepseek-v4-flash)

- **Classify `openai` SDK errors with `instanceof` in `openrouter.ts`, never by
  `err.name`.** The SDK's classes keep `name === "Error"`, and connection errors
  carry no `status`. The adapter rethrows them as `LlmConnectionError`, which is
  what `isTransientLlmError` retries. — spot it: a connection failure ends a
  call with no "retrying once" line, while a test built from plain
  `{ name: ... }` objects stays green.
  [INSIGHTS: 2026-09-30 — `openai` error classes keep `name === "Error"`: classifying by `name` never matches](../INSIGHTS.md#2026-09-30--openai-error-classes-keep-name--error-classifying-by-name-never-matches)

## Findings

- **On a newly added file, finding line numbers drift 2–8 lines and grounding
  still passes them** (one hunk covers the whole file). Anything matching
  findings to known locations there needs ~8 lines of tolerance; don't tighten
  grounding for it. — spot it: an eval or dedup misses a finding whose title
  clearly names the planted issue but whose lines sit a few rows away.
  [INSIGHTS: 2026-09-30 — on a newly added file, a finding's line numbers drift 2–8 lines and grounding can't tell](../INSIGHTS.md#2026-09-30--on-a-newly-added-file-a-findings-line-numbers-drift-28-lines-and-grounding-cant-tell)
