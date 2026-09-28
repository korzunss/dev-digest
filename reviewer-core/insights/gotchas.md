# reviewer-core — current gotchas

Last reconciled with ../INSIGHTS.md: 2026-09-26

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
