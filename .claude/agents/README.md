# Agents

Project subagents for DevDigest. Each `<name>.md` is the full definition:
frontmatter (tools, model, skills) plus the prompt. This README is a map of the
set. For exact rules and output templates, open the agent file.

## The set at a glance

| Agent | Responsibility | Tools | Model | Permission mode |
|---|---|---|---|---|
| [`researcher`](researcher.md) | Answers questions with sourced evidence, about this repo or external libraries and APIs | `Read, Grep, Glob, Bash, WebSearch, WebFetch` | `sonnet` | default |
| [`planner`](planner.md) | Turns a request into a Development Plan before any code is written | `Read, Grep, Glob, Bash` | `opus` | default |
| [`implementer`](implementer.md) | Executes an approved plan across `server/`, `reviewer-core/`, `client/` and verifies its own changes | `Read, Grep, Glob, Edit, Write, Bash` | `sonnet` | `acceptEdits` |

None of them has the `Agent` tool. Only the main session delegates, so there is
no nested spawning. `researcher` and `planner` are read-only: their `Bash` is
limited to reading, by prompt rule, since no hook enforces it. The architecture
and security reviews of implemented code are **not** part of this set; separate
agents will do them.

## How they fit together

```
request ─► planner ─► Development Plan (S1…Sn) ─► [you approve] ─► implementer ─► Implementation Report ─► review agents
              ▲                                                         │
              └──── researcher (on demand, for facts the plan needs) ───┘
```

The main session drives every hop. Plan steps and report rows share the ids
`S1…Sn`, which makes the handoff checkable.

## Inputs and outputs

| Agent | Input | Output | Stops early with |
|---|---|---|---|
| `researcher` | A concrete question, about the repo, external facts, or both | *Repo research* and/or *External research* report: answer, confidence, evidence table (`path:line` or URL), mandatory **Not established** | *Clarification needed*: up to 3 blocking questions |
| `planner` | A feature or change request, optionally a spec from `specs/` | **Development Plan**: goal and acceptance criteria, *Context applied* (INSIGHTS entries), affected modules, steps `S1…Sn` (files, layer, skills, **Done when**), tests by tier, migrations and contracts, out of scope, risks | *Clarification needed*: up to 3 blocking questions |
| `implementer` | An approved Development Plan | **Implementation Report**: status, per-step table, deviations, verification commands with results, not verified, handoff to reviewers, insight candidates | `Status: blocked`: no plan, a step without Files or Done when, or a step it is not allowed to do |

## Skills

`planner` and `implementer` preload the **same 12 project skills** through the
`skills:` frontmatter. The full `SKILL.md` of each is injected when the agent
starts, so every rule a plan relies on also binds the implementation:

`engineering-insights` · `onion-architecture` · `fastify-best-practices` ·
`drizzle-orm-patterns` · `postgresql-table-design` · `frontend-architecture` ·
`next-best-practices` · `react-best-practices` · `react-testing-library` · `zod` ·
`typescript-expert` · `security`

This costs about 28k tokens of context per spawn. Two skills are not preloaded:
`mermaid-diagram`, which has nothing to do with implementation, and
`pr-self-review`, the pre-PR gate, which the implementer does not run.
`researcher` preloads no skills.

## INSIGHTS.md

All three agents **read** the root and package `INSIGHTS.md` before working.
None of them **writes** it. The implementer returns *Insight candidates*, and
the main session records them during wrap-up with `engineering-insights`, as
`CLAUDE.md` requires.

## Sources behind the rules

### planner and implementer: external practice

All are primary Anthropic sources, retrieved 2026-09-25 by `researcher`.

| Practice | Applied as | Source |
|---|---|---|
| `description` says **when** to delegate. Behaviour belongs in the body | Trigger-first descriptions that also say what the agent does not do | [Create custom subagents](https://code.claude.com/docs/en/sub-agents) |
| Omitting `tools` inherits everything, including MCP and `Agent` | Explicit allowlists. No `Agent` tool | same |
| `skills:` injects the full `SKILL.md`. Parent skills are not inherited | Same 12 skills preloaded in both agents | same · [Skills](https://code.claude.com/docs/en/skills) |
| Per-agent `permissionMode`. `bypassPermissions` only in a sandbox | `acceptEdits` for implementer | [Permission modes](https://code.claude.com/docs/en/permission-modes) |
| Orchestrator and workers with an explicit handoff | Plan steps `S1…Sn` that the report mirrors | [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) |
| Workers return a condensed summary, about 1–2k tokens | Size caps: plan about 1,500 words, report about 800. Commands and outcomes, not logs | [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) |
| Give the agent a pass/fail check. Review happens in a fresh context, without over-flagging | A runnable *Done when* per step. The implementer verifies but does not review | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) |

**Deliberate deviation:** the [skill authoring guide](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
favours progressive disclosure. Here all skills are preloaded on purpose, so
the implementer cannot skip one. Reference files inside skills are still read
only on demand.

### planner and implementer: repo sources

| Rule | Source |
|---|---|
| Contract-first: `server/src/vendor/shared`, then a targeted hand mirror into `client/`, in one `[Contract]` step | `CLAUDE.md` · root `INSIGHTS.md`, 2026-09-17 entry on the vendored `shared` copies |
| Follow `CLAUDE.md`, not `pr-self-review/routing.md` §4. Do not plan skills that are not installed | root `INSIGHTS.md`, 2026-09-25 entry on `pr-self-review`'s skill map |
| `client/src/vendor/ui/nav.ts` is the only vendor-file exception | `client/INSIGHTS.md`, 2026-09-22 entry on `vendor/ui/nav.ts` |
| `TS2719` in a fixture after a contract change means a missing default key | root `INSIGHTS.md`, *Recurring Errors & Fixes* |
| Migrations via `pnpm db:generate` only. Never `db:migrate`, never hand-written | `CLAUDE.md` · `server/AGENTS.md` |
| Test tier in the filename. `.it` only with Postgres already up | `CLAUDE.md` · `TESTING.md` · `server/AGENTS.md` |
| A `reviewer-core` change also needs `server/` typecheck and tests | `reviewer-core/AGENTS.md`, *Gotchas* |
| Per-package manager and commands | `CLAUDE.md` · each package's `AGENTS.md` |
| Protected paths and excluding `server/clones/**` from searches | `CLAUDE.md` *Do not touch* · root `INSIGHTS.md` |
| *Step 0* clarification and a mandatory *not established* section | modelled on `researcher.md` |
| At most 3 fix attempts per failing check. A skill rule outranks the plan | project decision, with no external source |

## Adding or changing an agent

- Keep the `description` short and trigger-focused. Put behaviour in the body.
- Always set `tools` explicitly. Leave out `Agent` unless nesting is intended.
- A new or edited agent is picked up within the session, after a short delay:
  wait for the *new agent types are now available* notice before spawning it.
  See root `INSIGHTS.md`.
- Update this README's tables in the same change.
