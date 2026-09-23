# reviewer-core/docs — deep documentation for the review engine

Index of engine-local documentation. `reviewer-core/AGENTS.md` links here rather
than inlining it. One line per document, enough to decide whether to open it.

_No engine docs yet — the pipeline diagram and the exported API live in
[`../README.md`](../README.md). Add a row below when you add a document._

| Document | Read it when |
|----------|--------------|
| — | — |

## What belongs here

Engine-specific deep-dives: prompt design and slot semantics, structured-output
repair, the grounding algorithm, scoring, map-reduce. Cross-package material goes
in the repo-root `docs/`; how to *write* an agent's system prompt lives in
[`../../docs/agent-prompts/README.md`](../../docs/agent-prompts/README.md).

## What does not

Anything an agent needs every session (→ `reviewer-core/AGENTS.md`, as one line),
a single incident (→ `reviewer-core/INSIGHTS.md`), or work not yet built
(→ `reviewer-core/specs/`).
