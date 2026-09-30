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

- **The `openai` SDK `timeout` (90 s in `OpenRouterProvider`) only bounds the
  wait for response headers, not the body** — OpenRouter sends `200` at once and
  holds the body open while the model reasons, so a stalled call hangs until a
  socket timeout (1–2 h). For a real deadline pass an `AbortSignal` as
  `req.signal` to `completeStructured`; nothing passes one yet (fix deferred). —
  spot it: a run stuck on `Reviewing … in one pass` with one unchanged socket to
  OpenRouter, ending in `Invalid response body … Socket timeout` with 0 tokens.
  [INSIGHTS: 2026-09-30 — the `openai` SDK `timeout` stops at the response headers; a stalled OpenRouter body hangs for 1–2 hours](../INSIGHTS.md#2026-09-30--the-openai-sdk-timeout-stops-at-the-response-headers-a-stalled-openrouter-body-hangs-for-12-hours)
