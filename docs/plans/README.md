# docs/plans/ — Development Plans

A Development Plan says **how** a change will be built: which files, in which
layer, in which order, under which skills, and how each step is known to be done.
It is written by the `planner` agent, approved by the user, executed by the
`implementer`, and checked item by item by the `plan-verifier`.

Plans are committed on purpose. A plan in a session scratchpad disappears with
the session; here it stays readable for the implementer, the verifier, the PR
reviewer and the next session — and it records what was decided and why.

## Plan or spec?

| | `specs/` | `docs/plans/` |
|---|---|---|
| Answers | **what** and **why** — the problem, scope, acceptance | **how** — steps, files, layers, skills, checks |
| Written by | a person (or `doc-writer`) before design | the `planner` agent |
| Lifetime | describes the feature for as long as it exists | a record of one piece of work |

A plan that implements a spec names it in its `Spec:` line. A plan never
replaces a spec, and a spec never lists implementation steps.

## Naming

`NN-kebab-name.md` — `NN` is the next free two-digit number in this folder
(`01-…`, `02-…`). The number is the order plans were created in, nothing more.

## Lifecycle

Every plan starts with a status line:

```md
# Development Plan: <title>
Status: draft
Spec: <specs/NNN-name.md or "none">
```

| Status | Meaning |
|---|---|
| `draft` | Written by the planner; may still carry open decisions. **Not executable.** |
| `approved` | The user explicitly approved it (a correction to a draft is not an approval) and every open decision is resolved. |
| `in-progress` | An implementer is working on it. |
| `done` | Verified by the `plan-verifier` with result `complete` — or `complete — needs sign-off` **and** the user has accepted every item on its *Needs sign-off* list. |
| `abandoned` | Stopped. Say why in one line under the status. |

**Who writes the file.** The `planner` is read-only: it returns the plan and
proposes a `Save as:` name. The main session saves it here right away, as
`draft`, and keeps the `Status:` line and the index below current. User
decisions (the plan's *Decisions needed* table) and corrections are written
into the plan itself, not left in the conversation.

**Who reads it.** The `implementer` and the `plan-verifier` get this file's
**path**, never a pasted copy, and both refuse a `draft`. The implementer runs
once per step group (`G1`, `G2`, …); neither agent edits the file.

**Changing an approved plan.** A change that adds files or steps, or changes a
recorded decision, sends the plan back to `draft`: the planner returns the
changed sections, the main session applies them to the file, and the user
approves again. A clarification that stays inside the approved steps' *Files*
and decisions does not. The same rule covers fix mode: a gap the implementer
can close only by touching a file outside every step's *Files* comes back as a
*Suggested plan change*, not as a fix.

**Full integration run.** Implementers run only the `.it.test.ts` files related
to their group. After the last group, and before the `plan-verifier`, the main
session runs the full server integration suite once
(`cd server && pnpm exec vitest run .it.test`, Postgres up) and passes the
result to the verifier.

## Index

| Plan | Status | Spec | Packages |
|------|--------|------|----------|
| — | — | — | — |
