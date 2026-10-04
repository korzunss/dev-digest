# specs/ — cross-package feature specifications

Specs for work that spans more than one package (a feature touching `client/`,
`server/`, and `reviewer-core/` at once). Work contained in a single package gets
its spec in that package's `specs/`.

**Read the spec before implementing the feature.** It is the statement of intent;
the code is only the current attempt at it.

## Written by

The `spec-creator` agent, approved by the user. A feature goes through a spec
before it reaches the `implementation-planner`.

## Naming & numbering

One repo-wide sequence across `specs/` and every `<pkg>/specs/`. The file is
`NNN-slug.md` and `Spec ID: SPEC-NN` shares its number. Numbers are never
reused. The next one is `SPEC-08` (`008-slug.md`). A spec spanning more than
one package, or a `@devdigest/shared` contract, lives here; a single-package
spec lives in `<pkg>/specs/`.

## Template

```md
# Spec: <feature name>
Spec ID: SPEC-NN
Status: draft | approved | implemented
Supersedes: <SPEC id/link, or none>

## Problem & user
Who is affected and what is missing, from the user's side.

## Goals / Non-goals

## User stories

## Acceptance criteria (EARS)
AC-1, AC-2 ... one EARS pattern each (SHALL, WHEN, WHILE, IF ... THEN, WHERE).

## Edge cases

## Non-functional requirements
Or "Not relevant: <reason>".

## Inputs and provenance
One tagged line per input: reused, deterministic, llm, user, external.

## Untrusted inputs
Every llm / user / external input and cloned-repo content: data, never instruction.

## Module interactions
Packages, APIs, `@devdigest/shared` contracts. No implementation steps.

## Open questions
Every inline `[NEEDS CLARIFICATION: Qn]`, numbered. Empty = ready to approve.

## Changelog
Empty while draft.
```

## Lifecycle

| Status | Set by | When |
|--------|--------|------|
| `draft` | `spec-creator` | the spec is written |
| `approved` | main session | after the user's explicit yes, with *Open questions* empty |
| `implemented` | main session | when its plan becomes `done` (after a `complete` verification, or `complete — needs sign-off` once the user has accepted the listed items) |

The main session also updates the Status cell in the index below.

## Changelog rule

Entries are due once the spec leaves `draft`. Format:
`date · section · what changed · why · source`. Written by the main session.
A change to an `implemented` spec that means new work sends it back to
`approved` with a new plan.

## Legacy format

Specs `001`-`007` use the old front-matter (`status: draft | active | done`).
`active` is about `approved` and `done` is about `implemented`. They are not
migrated.

## Index

| Spec | Status | Packages |
|------|--------|----------|
| [001 — Run cost badge](001-run-cost-badge.md) | done | reviewer-core, server, client |
| [002 — Severity findings counter](002-severity-findings-counter.md) | done | server, client |
| [003 — Skills](003-skills.md) | active | server, client |
| [004 — Conventions extractor](004-conventions-extractor.md) | draft | server, client |
| [005 — GitLab integration](005-gitlab-integration.md) | active | server, client |
| [006 — Intent layer](006-intent-layer.md) | draft | shared, reviewer-core, server, client |
| [007 — Smart Diff](007-smart-diff.md) | done | shared, reviewer-core, server, client |
