# reviewer-core/docs — deep documentation for the review engine

Index of engine-local documentation. `reviewer-core/AGENTS.md` links here rather
than inlining it. One line per document, enough to decide whether to open it.

| Document | Read it when |
|----------|--------------|
| [`pipeline.md`](pipeline.md) | Changing prompt assembly, the grounding gate, map-reduce, scoring, or `toReviewPayload` — or tracing what `reviewPullRequest` does step by step |

## What belongs here

Engine-specific deep-dives: prompt design and slot semantics, structured-output
repair, the grounding algorithm, scoring, map-reduce. Cross-package material goes
in the repo-root `docs/`; how to *write* an agent's system prompt lives in
[`../../docs/agent-prompts/README.md`](../../docs/agent-prompts/README.md).

## What does not

Anything an agent needs every session (→ `reviewer-core/AGENTS.md`, as one line),
a single incident (→ `reviewer-core/INSIGHTS.md`), or work not yet built
(→ `reviewer-core/specs/`).
