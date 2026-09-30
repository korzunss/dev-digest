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

A pass-1 draft (the planner's default first pass, see below) is still
`Status: draft` — its body ends with `Steps: pending decisions` and its index
cell reads `draft (decisions)`, not a new status value. Pass 2 fills in the
rest of the template and turns the index cell into plain `draft`.

**Who writes the file.** The `planner` writes pass 1 here — a decisions-only
draft, `Status: draft` — then, once the user's decisions are recorded, pass 2
fills in the full plan into the **same file**. It adds its row to the index
below on pass 1 and returns only a summary each time. It writes no other file.
The main session keeps the `Status:` line and the index current and writes
user decisions (*Decisions recorded*) and corrections into the plan itself,
not left in the conversation.

**Who reads it.** The `implementer` and the `plan-verifier` get this file's
**path**, never a pasted copy, and both refuse a `draft`. The implementer runs
once per step group (`G1`, `G2`, …); neither agent edits the file. Hand-offs
between groups live in the plan under `## Handoffs → G<n>` (below
`<!-- implementer-brief:end -->`), appended by the main session.

**Changing an approved plan.** A change that adds files or steps, or changes a
recorded decision, sends the plan back to `draft`: the planner edits the
changed sections in the file and lists them, and the user approves again. A clarification that stays inside the approved steps' *Files*
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
| [01-intent-layer](01-intent-layer.md) | done | [006](../../specs/006-intent-layer.md) | shared, reviewer-core, server, client |
| [02-smart-diff](02-smart-diff.md) | done | [007](../../specs/007-smart-diff.md) | shared, reviewer-core, server, client |
| [03-brainstormer-agent](03-brainstormer-agent.md) | done | none | `.claude/agents`, repo docs |
| [04-security-reviewer-agent](04-security-reviewer-agent.md) | done | none | `.claude/agents`, `.claude/skills`, repo docs |
| [05-decisions-first-planning](05-decisions-first-planning.md) | done | none | `.claude/agents`, repo docs |
| [06-mcp-server](06-mcp-server.md) | done | none | mcp-server (new), repo config (`.mcp.json`, `.claude/settings.json`, CI) |
| [07-review-diff-base-sha](07-review-diff-base-sha.md) | done | none | shared, server, client (contract mirror) |
| [08-llm-call-reliability](08-llm-call-reliability.md) | done | none | shared, reviewer-core, server, client (contract mirror) |
| [09-review-eval-fixture](09-review-eval-fixture.md) | done | none | server (new `modules/eval`, `eval:review` script) |
