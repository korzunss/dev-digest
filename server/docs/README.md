# server/docs — deep documentation for `@devdigest/api`

Index of server-local documentation. `server/AGENTS.md` links here rather than
inlining it, so an agent reads only what the task needs. One line per document,
enough to decide whether to open it.

| Document | Read it when |
|----------|--------------|
| [`architecture.md`](./architecture.md) | Placing new code in the right layer, adding an adapter/module, or tracing a request (or a background review run) from route to database |
| [`../src/modules/repo-intel/README.md`](../src/modules/repo-intel/README.md) | Working on repo indexing, the symbol/import graph, or the repo map fed into review prompts |

_No other server docs yet — add a row above when you add one._

## What belongs here

Subsystem deep-dives, runbooks, and decisions specific to the server: DI wiring,
migration practice, the polling loop, performance work. Cross-package material
goes in the repo-root `docs/`.

## What does not

Anything an agent needs every session (→ `server/AGENTS.md`, as one line), a
single incident (→ `server/INSIGHTS.md`), or work not yet built (→ `server/specs/`).
