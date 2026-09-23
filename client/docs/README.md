# client/docs — deep documentation for `@devdigest/web`

Index of client-local documentation. `client/AGENTS.md` links here rather than
inlining it. One line per document, enough to decide whether to open it.

| Document | Read it when |
|----------|--------------|
| [`../src/vendor/ui/README.md`](../src/vendor/ui/README.md) | Using or extending the vendored `@devdigest/ui` primitives |

_No other client docs yet — add a row above when you add one._

## What belongs here

Client-specific deep-dives: data-fetching and cache strategy, i18n practice,
design-system rules, rendering and RSC boundary decisions. Cross-package material
goes in the repo-root `docs/`.

## What does not

Anything an agent needs every session (→ `client/AGENTS.md`, as one line), a
single incident (→ `client/INSIGHTS.md`), or work not yet built (→ `client/specs/`).
