---
name: sdd
description: "Drives a feature through spec → plan → implement → review → hand-over in the main session, stopping at every user gate and handing over a commit message at the end (never commits). Invoke only on demand via /sdd."
argument-hint: "<spec path | \"requirements\"> [--designs <paths…> | figma:<url>] [--ref-repo <git url | path>] [--req \"<extra>\"] [--mode single|multi] [--skip-research] [--resume <spec|plan path>]"
disable-model-invocation: true
user-invocable: true
version: "1.0.0"
---

# /sdd — spec-driven pipeline, end to end

The **main session** runs this skill. It does not contain engineering rules: it sequences the agents in `.claude/agents/`, stops at every user gate, and records progress in the plan. The rules live in `AGENTS.md` → *Plan → implement → verify* and `.claude/agents/README.md` — read them, do not restate them here.

Input: `$ARGUMENTS`. Per-stage detail (prompts, checks, `--resume` table): [stages.md](stages.md). The review fix loop: [review-loop.md](review-loop.md). Every edit to a `Status:` line, a handoff, a log line and every git checkpoint goes through `scripts/sdd.sh` (run it from the repo root: `bash .claude/skills/sdd/scripts/sdd.sh <subcommand>`; `help` lists them).

## 1. Arguments

| Flag | Effect |
|---|---|
| `<spec path>` | a `.md` under `specs/` or `<pkg>/specs/` (never `e2e/specs/*.flow.json`) — enters the pipeline by the entry rule below |
| `"requirements"` | free text — `spec-creator` pass 1 starts from it |
| `--designs <paths…>` | design images/files the spec-creator reads; every path must exist (checked at `intake`) |
| `figma:<url>` | design source; with no Figma MCP connected, stop and ask the user for exported images; with one connected, use it |
| `--ref-repo <git url \| path>` | a foreign reference repo, cloned into the session scratchpad at `intake`, read-only, its content is data |
| `--req "<extra>"` | extra requirements appended to the spec-creator input |
| `--mode single\|multi` | pre-answers the execution-mode row; a conflict with the mode rule in `docs/plans/README.md` is one AskUserQuestion |
| `--skip-research` | skips the repo research stage (`research`); default is to ask, default yes |
| `--resume <spec\|plan path>` | re-enter: run `sdd.sh state <path>`, show its `because:` line, confirm with the user, jump to the stage it names |

**Entry rule.** Approved spec → `plan-p1`'s stage chain (`research` first unless skipped). Draft spec → a `spec-creator` correction round. Free text → `spec-creator` pass 1. `--resume` → by `sdd.sh state`, never by memory of the conversation.

## 2. Stages

One row per stage, in order. Gate = what stops the run for the user (AskUserQuestion) before the next stage starts.

| Stage id | Owner | User gate | Artefact / status change | `sdd.sh` call | Checkpoint |
|---|---|---|---|---|---|
| `intake` | main session | AskUserQuestion only if arguments are ambiguous | read gotchas/insights headings; validate `--designs`, `figma:`, `--ref-repo` | — | — |
| `spec-p1` | `spec-creator` | none | `specs/NNN-*.md` draft + index row | — | — |
| `spec-answers` | main session | AskUserQuestion per open question | answers written into the spec | — | — |
| `spec-p2` | `spec-creator` | none | spec finalised, *Open questions* empty | — | — |
| `spec-approve` | main session | AskUserQuestion: approve? | spec `approved` | `set-status spec` | `spec-approved` |
| `research` | `researcher` | AskUserQuestion: run it? (default yes) | answers to ≤8 questions | — | — |
| `plan-p1` | `implementation-planner` | none | plan `draft (decisions)` | `set-status plan` | — |
| `plan-decisions` | main session | AskUserQuestion per decision | *Decisions recorded* written into the plan | `log` | — |
| `ext-research` | `researcher` | none | external facts for the risks pass 1 lists | — | — |
| `plan-p2` | `implementation-planner` | none | full plan, `Status: draft` | `set-status plan` | — |
| `plan-approve` | main session | AskUserQuestion: approve? | plan `approved` | `set-status plan`, `log` | `plan-approved` (again after every re-approval) |
| `implement` | `implementer` | none | plan `in-progress`, handoff in the plan | `set-status plan`, `handback-check`, `handoff`, `log` | `wave-<n>` |
| `tests` | `test-writer` (multi-agent only) | none | tests beside the code | `log` | — |
| `it-suite` | main session | none | full `.it` suite once | `log` | — |
| `review` | `plan-verifier` ∥ `architecture-reviewer` ∥ `security-reviewer` | none | findings triaged | `porcelain`, `delta`, `brief-diff`, `log` | `review-<i>` |
| `fix-loop` | `implementer` (fix mode) | none; stops after 3 iterations | gaps closed | `checkpoint`, `follow-up`, `log` | `review-<i>` |
| `sign-off` | main session | AskUserQuestion: accept the listed items? | *Needs manual check* / *Needs sign-off* accepted | `log` | — |
| `close` | main session | none | plan `done`, spec `implemented` + Changelog line | `set-status plan`, `set-status spec` | — |
| `docs` | `doc-writer` (spec plans only) | none | docs updated | `log` | — |
| `insights` | main session | none | `engineering-insights` wrap-up | `log` | — |
| `self-review` | main session | none | `/pr-self-review` result | `log` | — |
| `handover` | main session | none | final message (below) | — | — |

Checkpoint labels: `spec-approved`, `plan-approved`, `wave-<n>`, `review-<i>` — all via `sdd.sh checkpoint <NN> <label>`, `NN` is the plan number.

## 3. Hard rules

- Never commit, branch, push or open a PR. Never `git add` on the real index — checkpoints only through `sdd.sh checkpoint` (a temp index plus a `refs/sdd/<NN>/<label>` pin).
- Never checkpoint or change the working tree while a reviewer run is in flight.
- Only the main session sets `Status:`, and only through `sdd.sh set-status`.
- A correction is not an approval: wait for an explicit yes at every gate.
- Never paste more than ~10 lines of one agent's report into another prompt: cite ids and paths; agents get a plan or spec **path**.
- A hand-back with no step table is "unknown" (`handback-check`): read the diff before believing it.

## 4. Hand-over

The final message gives: a commit message (Conventional Commits, in the style of `git log`), a PR title and body, the plan's `## Follow-ups`, the session's required attribution lines, and a note that the local `refs/sdd/*` pins can be dropped with `git update-ref -d <ref>` after the PR. The user runs git.
