# client/docs — deep documentation for `@devdigest/web`

Index of client-local documentation. `client/AGENTS.md` links here rather than
inlining it. One line per document, enough to decide whether to open it.

| Document | Read it when |
|----------|--------------|
| [`ui-architecture.md`](./ui-architecture.md) | Adding a route, a data hook, or a UI test — RSC/client split, code placement, TanStack Query + SSE, i18n, styling, and how tests here are written |
| [`../src/vendor/ui/README.md`](../src/vendor/ui/README.md) | Using or extending the vendored `@devdigest/ui` primitives |

## What belongs here

Client-specific deep-dives: data-fetching and cache strategy, i18n practice,
design-system rules, rendering and RSC boundary decisions. Cross-package material
goes in the repo-root `docs/`.

## What does not

Anything an agent needs every session (→ `client/AGENTS.md`, as one line), a
single incident (→ `client/INSIGHTS.md`), or work not yet built (→ `client/specs/`).
