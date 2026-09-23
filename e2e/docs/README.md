# e2e/docs — deep documentation for the browser suite

Index of e2e-local documentation. `e2e/AGENTS.md` links here rather than inlining
it. One line per document, enough to decide whether to open it.

**Prose lives here, not in `specs/`** — in this package `specs/` holds executable
flows (`*.flow.json`), unlike every other package. See
[`../specs/README.md`](../specs/README.md).

_No e2e docs yet — the flow format, env knobs, and coverage table live in
[`../README.md`](../README.md). Add a row below when you add a document._

| Document | Read it when |
|----------|--------------|
| — | — |

## What belongs here

Runner internals, the hermetic stack, CI wiring, debugging a flaky flow, and the
reasoning behind which journeys are covered at all. Cross-package testing strategy
lives in [`../../TESTING.md`](../../TESTING.md).

## What does not

Anything an agent needs every session (→ `e2e/AGENTS.md`, as one line), or a
single incident (→ `e2e/INSIGHTS.md`).
