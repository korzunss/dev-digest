# docs/plans/ — Development Plans

A Development Plan says **how** a change will be built: which files, in which
layer, in which order, under which skills, and how each step is known to be done.
It is written by the `implementation-planner` agent, approved by the user, executed by the
`implementer`, and checked item by item by the `plan-verifier`.

Plans are committed on purpose. A plan in a session scratchpad disappears with
the session; here it stays readable for the implementer, the verifier, the PR
reviewer and the next session — and it records what was decided and why.

## Plan or spec?

| | `specs/` | `docs/plans/` |
|---|---|---|
| Answers | **what** and **why** — the problem, scope, acceptance | **how** — steps, files, layers, skills, checks |
| Written by | the `spec-creator` agent, approved by the user | the `implementation-planner` agent |
| Lifetime | describes the feature for as long as it exists | a record of one piece of work |

A plan that implements a spec names it in its `Spec:` line. After the spec is approved the main session asks whether to run research (default yes); when the plan becomes `done` (a `complete` verification, or `complete — needs sign-off` once the user has accepted the listed items) it sets the spec to `implemented` (see `AGENTS.md`). A plan never
replaces a spec, and a spec never lists implementation steps. A feature plan
names an approved spec.

## Naming

`NN-kebab-name.md` — `NN` is the next free two-digit number in this folder
(`01-…`, `02-…`). The number is the order plans were created in, nothing more.

## Lifecycle

Every plan starts with a status line:

```md
# Development Plan: <title>
Status: draft
Execution: <multi-agent | single-agent>
Spec: <specs/NNN-name.md or "none (<reason>)">
```

| Status | Meaning |
|---|---|
| `draft` | Written by the implementation-planner; may still carry open decisions. **Not executable.** |
| `approved` | The user explicitly approved it (a correction to a draft is not an approval) and every open decision is resolved. |
| `in-progress` | An implementer is working on it. |
| `done` | Verified by the `plan-verifier` with result `complete` — or `complete — needs sign-off` **and** the user has accepted every item on its *Needs sign-off* list. |
| `abandoned` | Stopped. Say why in one line under the status. |

A pass-1 draft (the implementation-planner's first pass for every non-trivial plan, see below) is still
`Status: draft` — its body ends with `Steps: pending decisions` and its index
cell reads `draft (decisions)`, not a new status value. Pass 2 fills in the
rest of the template and turns the index cell into plain `draft`.

**Who writes the file.** The `implementation-planner` writes pass 1 here — a decisions-only
draft, `Status: draft` — then, once the user's decisions are recorded, pass 2
fills in the full plan into the **same file**. It adds its row to the index
below on pass 1 and returns only a summary each time. It writes no other file.
The main session keeps the `Status:` line and the index current and writes
user decisions (*Decisions recorded*) and corrections into the plan itself,
not left in the conversation.

**Who reads it.** The `implementer` and the `plan-verifier` get this file's
**path**, never a pasted copy, and both refuse a `draft`. The implementer runs
once per step group (`G1`, `G2`, …) in `multi-agent` mode, or once with `all`
in `single-agent` mode; neither agent edits the file. Hand-offs live in the
plan under `## Handoffs → G<n>` (`## Handoffs → all` for a single-agent plan),
below `<!-- implementer-brief:end -->`, appended by the main session.

**Execution mode.** `Execution: multi-agent` is the full pipeline: one
implementer run per step group, `test-writer`, reviewers as their rules
require, `plan-verifier`. `Execution: single-agent` is one implementer run over
all groups, then `plan-verifier`; reviewers still run on their own triggers.
Rule: any migration, `@devdigest/shared` contract change or trust boundary →
`multi-agent`; else ≤1 package and ≤5 steps → `single-agent`; else
`multi-agent`; the user may override. The `implementation-planner` recommends
it in pass 1 (last *Decisions needed* row) and the main session records the
header line; a plan with no `Execution:` line is `multi-agent`.

**Changing an approved plan.** A change that adds files or steps, or changes a
recorded decision, sends the plan back to `draft`: the implementation-planner edits the
changed sections in the file and lists them, and the user approves again. A clarification that stays inside the approved steps' *Files*
and decisions does not. The same rule covers fix mode: a gap the implementer
can close only by touching a file outside every step's *Files* comes back as a
*Suggested plan change*, not as a fix.

**Full integration run.** Implementers run only the `.it.test.ts` files related
to their group (or their run). After the last group, and before the `plan-verifier`, the main
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
| [10-agent-precision](10-agent-precision.md) | in-progress | none (idea [06](../ideas/06-fewer-false-criticals.md)) | reviewer-core, server (eval, seed prompts + agents sync CLI, reviews), `docs/agent-prompts` |
| [11-diff-commits-cancellation](11-diff-commits-cancellation.md) | done | none | shared (port; client `fetchPullHead` mirror), server |
| [12-eval-write-integrity](12-eval-write-integrity.md) | done | none | server (eval module, schema + 2 migrations, `db/client.ts` type) |
| [13-count-failed-llm-attempt-usage](13-count-failed-llm-attempt-usage.md) | done | none | shared (port; client mirror), reviewer-core, server (run-executor wiring) |
| [14-e2e-flows-agent-browser](14-e2e-flows-agent-browser.md) | done | none | e2e (flows 02/04/05/08/09/10 + docs), server (CLI-only conventions seed + tests) |
| [15-e2e-ci-flow10-and-runner-stderr](15-e2e-ci-flow10-and-runner-stderr.md) | done | none | e2e (flow 10 guard, runner stderr, one `flows.md` citation) |
| [16-sync-atomicity-and-rules-abort](16-sync-atomicity-and-rules-abort.md) | done | none | shared (`GitClient.readFileAt`; client mirror), server (agents sync/repository, reviews repo-rules + executor, git adapter) |
| [17-map-reduce-summary](17-map-reduce-summary.md) | done | none | reviewer-core (`run.ts` summary + verdict from final findings, new `summary.ts`), docs (`pipeline.md`, `agent-prompts/README.md`) |
| [18-blast-radius](18-blast-radius.md) | done | none | shared (`brief.ts`, `ForgeClient`; client mirror), server (new `modules/blast`, repo-intel facade, forge adapters), client (OverviewTab, hooks, i18n), mcp-server (`get_blast_radius`) |
| [19-mentor-review-followups](19-mentor-review-followups.md) | done | none | mcp-server (`get_findings` PR picture), server (blast decl-file rule in the repo-intel facade only) |
| [20-spec-creator-agent](20-spec-creator-agent.md) | done | none | `.claude/agents`, spec folders (`specs/`, `<pkg>/specs/`, new `mcp-server/specs/`), repo docs |
| [21-implementation-planner](21-implementation-planner.md) | done | none | `.claude/agents` (rename to `implementation-planner`, implementer, plan-verifier), repo docs |
| [22-sdd-pipeline-skill](22-sdd-pipeline-skill.md) | done | none | `.claude/skills/sdd` (new: SKILL.md, references, scripts), root `AGENTS.md`, `.claude/skills/README.md` |
| [23-workflow-retro-skill](23-workflow-retro-skill.md) | done | none | `.claude/skills/sdd` (guards, `usage-scan`, `flags`, `metrics` stage), `.claude/agents` (implementer, implementation-planner), `.gitignore`, root `INSIGHTS.md` (`Guard:` lines) |
| [24-project-context](24-project-context.md) | done | [008](../../specs/008-project-context.md) | shared, reviewer-core, server (schema + migration, context, agents, skills, run-executor), client (new page, nav, agent/skill Context tabs, trace drawer) |
| [25-project-context-hardening](25-project-context-hardening.md) | done | none (plan 24 follow-ups) | shared (`SetContextRootsBody`), server (context listing cache/bounds, agent/skill path normalisation + data migration), client (context hooks, Context tabs, Project Context page, trace drawer, tests) |
