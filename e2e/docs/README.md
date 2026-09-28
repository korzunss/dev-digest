# e2e/docs — deep documentation for the browser suite

Index of e2e-local documentation. `e2e/AGENTS.md` links here rather than inlining
it. One line per document, enough to decide whether to open it.

**Prose lives here, not in `specs/`** — in this package `specs/` holds executable
flows (`*.flow.json`), unlike every other package. See
[`../specs/README.md`](../specs/README.md).

| Document | Read it when |
|----------|--------------|
| [`flows.md`](flows.md) | You need the `*.flow.json` format in full, why the `NN-` prefix is run order (not decoration), a catalogue of the 11 current flows and their seed-data assumptions, or a checklist for a flaky flow. The env knobs, run instructions and short coverage table stay in [`../README.md`](../README.md); this document doesn't repeat them. |

## What belongs here

Runner internals, the hermetic stack, CI wiring, debugging a flaky flow, and the
reasoning behind which journeys are covered at all. Cross-package testing strategy
lives in [`../../TESTING.md`](../../TESTING.md).

## What does not

Anything an agent needs every session (→ `e2e/AGENTS.md`, as one line), or a
single incident (→ `e2e/INSIGHTS.md`).
