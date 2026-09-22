# specs/ — cross-package feature specifications

Specs for work that spans more than one package (a feature touching `client/`,
`server/`, and `reviewer-core/` at once). Work contained in a single package gets
its spec in that package's `specs/`.

**Read the spec before implementing the feature.** It is the statement of intent;
the code is only the current attempt at it.

## Naming

`NNN-slug.md` — a zero-padded ordinal plus a short slug, e.g. `001-run-cost-badge.md`.
Ordinals are assigned in creation order and never reused.

## Template

```md
---
status: draft | active | done
packages: server, client
---

# NNN — Title

## Problem
What's broken or missing, from the user's side.

## Scope
Bullets of what this delivers. And a short **Not in scope** list — the boundary
is the most useful line in the document.

## Design
The shape of the solution: contracts, data flow, the decisions worth recording.

## Acceptance
Observable checks. What must be true for this to be done.
```

## Index

| Spec | Status | Packages |
|------|--------|----------|
| [001 — Run cost badge](001-run-cost-badge.md) | done | reviewer-core, server, client |
| [002 — Severity findings counter](002-severity-findings-counter.md) | done | server, client |
| [003 — Skills](003-skills.md) | active | server, client |
