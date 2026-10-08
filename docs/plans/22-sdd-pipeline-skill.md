# Development Plan: `/sdd` — a user-invocable skill that runs the spec-driven pipeline end to end
Status: done
Execution: single-agent
Save as: docs/plans/22-sdd-pipeline-skill.md
Spec: none (process/agent tooling)

## Goal & acceptance criteria
A skill `.claude/skills/sdd/` (SKILL.md + reference files + scripts) that the main session follows to drive a feature from intake to a handed-over commit message, stopping at every user gate. Fixed by the user (2026-10-04): **D1** name and invocation shape, entry and `--resume` rules; **D2** never commits, `write-tree` checkpoints logged in the Verification log; **D3** review fix loop, ≤3 iterations; **D4** non-blocking items → `## Follow-ups`; **D5** no branch, no PR, hands over commit/PR text.
- AC1: SKILL.md lists every stage from intake to commit message with its owner and its user gate.
- AC2: `--resume` derives the stage from `Status:` lines and the Verification log only.
- AC3: scripts cover status + index row, handoff append, `git status` snapshot/compare, hand-back check, checkpoint; BSD/macOS safe.
- AC4: one line in root `AGENTS.md` points feature work to `/sdd`.
- AC5: `selftest.sh` exercises every `sdd.sh` subcommand in a throwaway repo and exits 0; the real repo's index, `git status --porcelain` and `refs/sdd/*` are untouched by it.
- AC6: `review-loop.md` applies the GAP1 triage (CRITICAL/HIGH + verifier gaps → fix, MEDIUM/informational → `## Follow-ups`, *Needs manual check* → sign-off) and the 3-iteration cap.
- AC7: intake handles `figma:<url>` (GAP2) and `--ref-repo` (GAP3) as recorded.

## Decisions needed
None open — see *Decisions recorded*. (Pass-1 review and options: below the marker, *Design notes → Pass 1*.)

### Decisions recorded (user, 2026-10-04: "GAP як радиш, D6–D10 як радиш, TQ так, research так")
- **TQ1–TQ6:** defaults accepted as written.
- **GAP1:** CRITICAL and HIGH findings, plus plan-verifier gaps, go to the fix loop; MEDIUM and informational go to `## Follow-ups`; *Needs manual check* is shown to the user at sign-off. The loop stops after 3 iterations if any CRITICAL or HIGH remains.
- **GAP2:** `figma:<url>` with no Figma MCP connected → stop and ask the user for exported images; with a Figma MCP connected, use it.
- **GAP3:** a new flag `--ref-repo <git url | path>` names a foreign reference repo, cloned into the scratchpad at intake.
- **D6 = A** temp index (`GIT_INDEX_FILE`) + `git update-ref` pin · **D7 = A** working-tree reviews with a tree→tree path list; R3 by a brief-diff script · **D8 = A** `sdd.sh` with subcommands (incl. `state`) + `selftest.sh` · **D9 = A** SKILL.md + `stages.md` + `review-loop.md`, citing AGENTS.md for rules · **D10 = single-agent**.
- **Research:** yes — EXT1–EXT3 go to the researcher before pass 2.

TQ defaults in force (from pass 1): TQ1 `single-agent` runs no `test-writer`; TQ2 spec-approval tree is logged as the plan's first Verification log line; TQ3 legacy specs map approved→`active`, implemented→`done`; TQ4 R3 compares with the newest approval tree; TQ5 `--mode` pre-answers the mode row, a conflict with the mode rule is one AskUserQuestion; TQ6 also a row in `.claude/skills/README.md`, no edit to `.claude/agents/**` or `.claude/settings.json`.

Research facts (EXT1–EXT3, 2026-10-04): skills honour `argument-hint`, `disable-model-invocation`; `user-invocable` defaults to true; the body substitutes `$ARGUMENTS`; a new skill is picked up mid-session (fallback `/reload-skills`). A temp `GIT_INDEX_FILE` outside the work tree + `git write-tree` leaves the real index and `git status --porcelain` untouched; `git update-ref refs/sdd/<NN>/<label> <tree>` works and survives `git gc --prune=now`. In zsh `$T:a` is a path modifier → bash only, `${VAR}` braces.

- **Approved** (user, 2026-10-05: "так, затверджую"): plan 22 approved as written, `Execution: single-agent`.

## Prerequisites
None. No package code, no Postgres, no dependency.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| all | S1–S5 | `.claude/skills/sdd` (scripts → skill text) + 2 doc lines | — | none (single group); for review: the subcommand list and stage ids as finally written |

`Execution: single-agent` — one implementer run with `all`.

## Steps

### S1 — Write `scripts/sdd.sh`, the one entry point for every main-session edit and git checkpoint
- **Files:** `.claude/skills/sdd/scripts/sdd.sh` (create, executable)
- **Change:** a bash dispatcher `sdd.sh <subcommand> [args]`, run from the repo root (it `cd`s to `git rev-parse --show-toplevel`). Subcommands, each with a usage line in `sdd.sh help`:
  - `set-status <plan|spec> <path> <status>` — rewrites the file's `Status:` line and the Status cell (column 2) of its index row, matched by the link target `(<basename>)`: `docs/plans/README.md` for a plan, `<dirname>/README.md` for a spec. Plan values: `draft`, `draft (decisions)` (file keeps `Status: draft`), `approved`, `in-progress`, `done`, `abandoned`. Spec values: `draft`, `approved`, `implemented`; a legacy spec (front-matter `status:`) gets `active` for approved and `done` for implemented (TQ3). Unknown value, missing file or no matching index row → exit 2, file unchanged.
  - `handoff <plan> <label> [file|-]` — appends `## Handoffs → <label>` plus the body (file or stdin) after the brief-marker line (the HTML comment `implementer-brief:end`, matched as a whole line), before `## Verification log` when it exists, else at the end. No marker → exit 2.
  - `log <plan> <text>` — appends `- <YYYY-MM-DD> <text>` as the last line of `## Verification log`, creating the section at the end of the file if missing.
  - `follow-up <plan> <text>` — the same under `## Follow-ups` (below the marker, before `## Verification log`).
  - `handback-check [file|-]` — exit 0 when the report contains the implementer step-table header `| Step / gap |`, else prints `hand-back without a step table: treat as unknown` and exits 1.
  - `porcelain save <file>` / `porcelain check <file>` — saves `git status --porcelain` / exits 1 with a `diff` when it changed.
  - `checkpoint <NN> <label>` — temp index from `mktemp` under `${TMPDIR:-/tmp}` (never inside the work tree), `GIT_INDEX_FILE="${idx}" git add -A`, `git write-tree`, `git update-ref "refs/sdd/${NN}/${label}" "${tree}"`, removes the temp index (trap), prints the tree sha. Never touches `.git/index`.
  - `delta <treeA> [treeB]` — `git diff --name-status <treeA> <treeB>`; without `treeB` it takes a fresh unpinned temp-index tree first, so new untracked files show.
  - `brief-diff <plan> <tree>` — `diff` of the plan text above the brief-marker line in `git show <tree>:<plan>` vs the working file, ignoring the `Status:` and `Execution:` lines (assumption: these are R3's allowed changes after approval); exit 0 identical, 1 different (diff printed).
  - `state <spec|plan path>` — prints `stage: <id>` and one `because:` line, from the spec's `Status:` (or legacy `status:`), the plan found by its `Spec:` line (`grep -l` in `docs/plans/*.md`), its `Status:`, `Steps: pending decisions`, `Execution:`, the `## Handoffs →` headings and the last Verification log line (`review iteration <n>`, `plan-verifier`). Stage ids are the ones in SKILL.md (S3).
- **Layer / why here:** skill-local tooling, like `.claude/skills/pr-self-review/scripts/` (D8).
- **Skills to apply:** none (no `.ts`; no skill in `implementer.md` → *Skills are the rules* binds a shell script).
- **Practices:** `#!/usr/bin/env bash` + `set -euo pipefail`; every variable `"${VAR}"` with braces (zsh `$T:a` trap); BSD/macOS-safe only — no `sed -i`, no `grep -P`, no `readlink -f`, no GNU-only flags; in-place edits are `awk … > "${tmp}" && mv "${tmp}" "${file}"` with `tmp` from `mktemp` in the same directory; `date +%F`; arguments passed as argv, never `eval`; every edit is anchored on an exact line and fails loudly (exit 2) instead of appending blind; no `git add`/`commit`/`stash`/`reset`/`checkout` on the real index.
- **Known gotchas:** the temp index must live outside the work tree or it shows as untracked (research EXT3); a hand-back can be the word "placeholder" although edits landed → `handback-check` only flags, the skill then reads the diff (root `INSIGHTS.md` 2026-10-04 "an implementer hand-back can be the single word"); `rg` is not a binary here → use `grep`/`git grep` (root `INSIGHTS.md` 2026-09-27 "`rg` edge checks…").
- **Done when:** `bash -n .claude/skills/sdd/scripts/sdd.sh` exits 0 · `for c in set-status handoff log follow-up handback-check porcelain checkpoint delta brief-diff state; do bash .claude/skills/sdd/scripts/sdd.sh help | grep -q -- "$c" || echo "MISSING $c"; done` prints nothing · `grep -nE 'sed -i|grep -P|readlink -f' .claude/skills/sdd/scripts/sdd.sh` prints nothing.

### S2 — Write `scripts/selftest.sh` and prove every subcommand in a throwaway repo
- **Files:** `.claude/skills/sdd/scripts/selftest.sh` (create, executable)
- **Change:** creates `mktemp -d` repo under `${TMPDIR:-/tmp}`, `git init`, commits fixtures written by the script itself: a plan `docs/plans/01-x.md` (header, brief, marker), `docs/plans/README.md` with its index row, a new-format spec `specs/001-x.md` + `specs/README.md` row, a legacy spec with front-matter `status: draft`. Then asserts, one `ok <name>` line per check: `set-status` updates file + index row for plan, spec and legacy spec (approved → `active`) and exits 2 on an unknown value; `handoff`, `log`, `follow-up` land below the marker in the right order and create missing sections; `handback-check` passes a report with `| Step / gap |` and fails `placeholder`; `porcelain check` fails after a new file; `checkpoint` leaves the fixture repo's `.git/index` checksum (`shasum`) and `git status --porcelain` unchanged, `git cat-file -t refs/sdd/01/<label>` is `tree`, the tree survives `git gc --prune=now`; `delta` lists a new untracked file; `brief-diff` exits 0 after a `Status:` change only and 1 after a brief edit; `state` prints the expected stage for: spec draft, spec approved with no plan, plan with `Steps: pending decisions`, plan `approved`, plan `in-progress` with one handoff. Removes the temp repo (trap). Last line `selftest: ok` and exit 0; any failure prints `FAIL <name>` and exits 1.
- **Layer / why here:** test of S1, next to it (D8). No vitest: no package code.
- **Skills to apply:** none.
- **Practices:** same shell rules as S1; runs `sdd.sh` with `git -C`-free `cd` into the temp repo, never against the real repo; no network; every assertion compares exact content, not a line count.
- **Known gotchas:** no `grep -c ≥ N` style checks — assert the content itself (root `INSIGHTS.md` 2026-09-28 "a Done-when `grep` for a phrase fails…", *Extended* 2026-10-04).
- **Done when:** in the real repo, `git status --porcelain` saved before and compared after `bash .claude/skills/sdd/scripts/selftest.sh` is identical (new S1/S2 files aside, they exist before the run); the run's last line is `selftest: ok`, exit 0 · `git for-each-ref refs/sdd` in the real repo prints nothing.

### S3 — Write `SKILL.md`: invocation, entry rules, stage table, hard rules, hand-over
- **Files:** `.claude/skills/sdd/SKILL.md` (create)
- **Change:** front-matter `name: sdd`, one-line `description` (drives a feature through spec → plan → implement → review → hand-over, main session only, stops at user gates), `argument-hint: "<spec path | \"requirements\"> [--designs <paths…> | figma:<url>] [--ref-repo <git url | path>] [--req \"<extra>\"] [--mode single|multi] [--skip-research] [--resume <spec|plan path>]"`, `disable-model-invocation: true`, `user-invocable: true`. Body:
  1. **Arguments** — `$ARGUMENTS` parsed in the skill text; one row per flag with its effect; entry rule (approved spec → plan stage; draft spec → spec-creator correction round; text → spec-creator pass 1; `--resume` → `sdd.sh state`). A spec path is a `.md` under `specs/` or `<pkg>/specs/`, never `e2e/specs/*.flow.json`.
  2. **Stage table** — columns: stage id · owner (agent or main session) · user gate (AskUserQuestion or none) · artefact / status change · `sdd.sh` call · checkpoint label. Stage ids, in order: `intake`, `spec-p1`, `spec-answers`, `spec-p2`, `spec-approve`, `research`, `plan-p1`, `plan-decisions`, `ext-research`, `plan-p2`, `plan-approve`, `implement`, `tests` (multi-agent only, TQ1), `it-suite`, `review`, `fix-loop`, `sign-off`, `close` (plan `done`, spec `implemented` + Changelog), `docs` (doc-writer, spec plans only), `insights` (`engineering-insights` wrap-up), `self-review` (`/pr-self-review`), `handover`. Checkpoints: `spec-approved` (TQ2), `plan-approved` (again after every re-approval, TQ4), `wave-<n>`, `review-<i>`.
  3. **Hard rules** — never commit, branch, push or open a PR (D2, D5); never `git add` the real index — checkpoints only via `sdd.sh checkpoint`; never checkpoint or change the tree while a reviewer run is in flight; only the main session sets `Status:` and only via `sdd.sh set-status`; a correction is not an approval; ≤10 lines of one agent's report into another prompt, cite ids and paths; the rules themselves live in `AGENTS.md` → *Plan → implement → verify* and `.claude/agents/README.md` — cite, don't restate (D9).
  4. **Hand-over** — the final message gives a commit message (Conventional Commits, as in `git log`), a PR title + body, the plan's `## Follow-ups`, and the session's required attribution lines; the user runs git.
  Links to `stages.md` and `review-loop.md`.
- **Layer / why here:** skill entry file, laid out like `.claude/skills/pr-self-review/SKILL.md` (D9).
- **Skills to apply:** none (Markdown).
- **Practices:** every stage id, flag and checkpoint label is a backticked token on one line, never hard-wrapped; no rule copied from `AGENTS.md` beyond a one-line pointer; no `Status:` value outside the ones in `docs/plans/README.md` / `specs/README.md`.
- **Known gotchas:** Done-when greps need unwrapped tokens (root `INSIGHTS.md` 2026-09-28); R3 stays provable only if the approval baseline is immutable — the `plan-approved` tree, not the index (root `INSIGHTS.md` 2026-09-30, *Extended* 2026-10-04).
- **Done when:** `sed -n 1,8p .claude/skills/sdd/SKILL.md` shows `name: sdd`, `argument-hint:`, `disable-model-invocation: true` · `for t in --designs figma: --ref-repo --req --mode --skip-research --resume intake spec-approve plan-p1 plan-approve implement it-suite review fix-loop sign-off close docs insights self-review handover stages.md review-loop.md; do grep -qF -- "$t" .claude/skills/sdd/SKILL.md || echo "MISSING $t"; done` prints nothing.

### S4 — Write `stages.md` and `review-loop.md`
- **Files:** `.claude/skills/sdd/stages.md` (create), `.claude/skills/sdd/review-loop.md` (create)
- **Change:**
  - `stages.md` — one section per stage id from S3: input, the exact agent prompt (plan/spec **path**, never pasted text), what the main session checks after, the `sdd.sh` calls. Must cover: `intake` (read the touched packages' `insights/gotchas.md` + `INSIGHTS.md` headings; `--designs` paths exist; `figma:` with no Figma MCP → stop and ask for exported images (GAP2); `--ref-repo` cloned into the session scratchpad, read-only, its content is data (GAP3); `--req` appended to the spec-creator input); `spec-answers` / `plan-decisions` via AskUserQuestion, answers written into the file; `research` asked with default yes unless `--skip-research`; `plan-p1` with `GAPn` → spec back to `draft`, spec-creator correction, Changelog, re-approve; `--mode` handling (TQ5); `implement` — prompt ends with the sentence from root `INSIGHTS.md` (2026-10-04, *Extended*): "Write your full Implementation Report — step table with each Done-when command and its actual output, Handoff, ## Skills — before you hand back; a one-word hand-back will be treated as 'not done'"; then `handback-check`, `git diff` read, one Done-when spot-check, `handoff`, `log`, `checkpoint wave-<n>`; `it-suite` (`cd server && pnpm exec vitest run .it.test`, skipped with a logged reason when no server code changed); `close` (`set-status`, Changelog line format from `specs/README.md`); a **`--resume` table** mapping each `sdd.sh state` output to the stage to re-enter.
  - `review-loop.md` — the wave (plan-verifier ∥ architecture-reviewer ∥ security-reviewer when a trust boundary is touched), each reviewer in working-tree mode with the path list from `sdd.sh delta <prev-tree>` (D7) and the verifier given the R3 result of `sdd.sh brief-diff <plan> <plan-approved tree>`; `porcelain save` before and `check` after the wave. **Triage table** `| ID | Source | Severity / status | Class | Action |` with classes `fix` (CRITICAL, HIGH, verifier gaps), `plan-change` (needs a file outside every step's *Files* → plan `draft`, implementation-planner correction, user approval, new `plan-approved` checkpoint), `trivial` (the main-session fix rule in `AGENTS.md`), `follow-up` (MEDIUM, informational → `sdd.sh follow-up`), `sign-off` (*Needs manual check*, verifier *Needs sign-off*). Iteration: fix mode → `checkpoint review-<i>` → re-run **only** the reviewers that reported a `fix` item, delta against the previous iteration's tree; plan-verifier in its delta mode (previous log date + open ids). Cap: after iteration 3 with any CRITICAL or HIGH left, stop and show the user the items that did not converge (GAP1). Log line per iteration: `review iteration <i>: <counts per class>, tree <sha>`.
- **Layer / why here:** reference files beside SKILL.md (D9).
- **Skills to apply:** none (Markdown).
- **Practices:** same token rule as S3; prompts name agents by their file names in `.claude/agents/`; no rule restated beyond a pointer to `AGENTS.md` / the agent file; the `log` text formats match what `sdd.sh state` parses (S1).
- **Known gotchas:** seeding or reverting the tree while reviewers run breaks their read-only proof (root `INSIGHTS.md` 2026-09-27 "seeding the working tree…"); a skill listed on a step where it does nothing can only be closed by a plan change → the plan-change path in triage (root `INSIGHTS.md` 2026-09-29).
- **Done when:** `for t in intake figma: --ref-repo AskUserQuestion --skip-research handback-check checkpoint it-suite '--resume'; do grep -qF -- "$t" .claude/skills/sdd/stages.md || echo "MISSING stages $t"; done; for t in CRITICAL HIGH MEDIUM 'Needs manual check' '## Follow-ups' plan-change brief-diff 'review iteration' delta; do grep -qF -- "$t" .claude/skills/sdd/review-loop.md || echo "MISSING loop $t"; done` prints nothing.

### S5 — Point to `/sdd` from root `AGENTS.md` and the skills catalog
- **Files:** `AGENTS.md` (modify), `.claude/skills/README.md` (modify)
- **Change:** `AGENTS.md` → *Plan → implement → verify*: a new first bullet, one sentence — feature work runs through `/sdd` (`.claude/skills/sdd/SKILL.md`), which follows the rules below. `.claude/skills/README.md` → *Catalog*: one row `[sdd](sdd/SKILL.md) | Meta | …` after the `pr-self-review` row.
- **Layer / why here:** repo docs (TQ6). `CLAUDE.md` is a symlink to `AGENTS.md` — edit the target only.
- **Skills to apply:** none.
- **Practices:** one bullet, one row, nothing else changed in either file; `/sdd` written unbroken.
- **Known gotchas:** never replace `CLAUDE.md` with a copy (root `CLAUDE.md` → *Do not touch*).
- **Done when:** `grep -n '/sdd' AGENTS.md` shows the new bullet · `grep -n 'sdd/SKILL.md' .claude/skills/README.md` shows the row · `ls -l CLAUDE.md` still shows `-> AGENTS.md` · `git diff --numstat -- AGENTS.md .claude/skills/README.md` shows 0 deletions.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `.claude/skills/sdd/scripts/selftest.sh` | shell self-test (no Postgres, no network) | every `sdd.sh` subcommand, index/`git status` untouched | S2 |

No `.it` suite: no package code is touched (log it as such).

## Migrations & contracts
None.

## Out of scope
- Any edit to `.claude/agents/**` (reviewer base-ref modes, R3 wording stay as they are), `.claude/settings.json`, `skills-lock.json` (local skills are not in it).
- The "Lean agent context" optimisation (deferred by the user).
- Committing, branching, PR creation, hooks.
- Rewriting earlier plans' handoff headings to fit `sdd.sh state`.

<!-- implementer-brief:end -->

## Context applied
- root `INSIGHTS.md` → "an untracked plan file makes R3 … unprovable" (+ Extended) — immutable `plan-approved` tree + `brief-diff` (S1, S3).
- root `INSIGHTS.md` → "an implementer hand-back can be the single word placeholder" (+ Extended) — `handback-check`, prompt sentence (S1, S4).
- root `INSIGHTS.md` → "seeding the working tree while other reviewer runs are in flight" — no checkpoint during a wave, `porcelain` save/check (S3, S4).
- root `INSIGHTS.md` → "a Done-when `grep` for a phrase fails when Markdown wraps" (+ Extended) — token loops, no counts (all Done-whens).
- root `INSIGHTS.md` → "`rg` … is not a binary here" — `grep` in Done-whens and scripts.
- root `INSIGHTS.md` → "new agents do show up mid-session" — research EXT2 confirmed the same for skills.
- `.claude/agents/architecture-reviewer.md:44`, `security-reviewer.md:40`, `plan-verifier.md:125` — base ref only as `<base>...HEAD` → D7.
- `.claude/agents/implementer.md:245` — step-table header `| Step / gap |` used by `handback-check`.
- `specs/README.md` → *Legacy format*, *Changelog rule* — TQ3, `close` stage.
- `.claude/skills/pr-self-review/` — layout model (SKILL.md + reference files + `scripts/`).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | Method read; *Insights to record* | — |
| `onion-architecture` | preload | — | no `server/`, `reviewer-core/`, `mcp-server/` code |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| repo tooling | `.claude/skills/sdd/SKILL.md`, `stages.md`, `review-loop.md` | skill text | new |
| repo tooling | `.claude/skills/sdd/scripts/sdd.sh`, `selftest.sh` | skill scripts | new |
| repo docs | `AGENTS.md`, `.claude/skills/README.md` | docs | changed (1 line each) |

## Design notes

### Pass 1 — requirements review (2026-10-04, all closed in *Decisions recorded*)
- TQ1 `single-agent` runs no `test-writer` (`AGENTS.md:113-117`) · TQ2 spec-approval checkpoint precedes the plan · TQ3 legacy spec status values · TQ4 R3 baseline after re-approval · TQ5 `--mode` vs the mode rule · TQ6 docs beyond the `AGENTS.md` line.
- GAP1 reviewers have no "suggestion" level (`architecture-reviewer.md:145-217`, `security-reviewer.md:104-118`) · GAP2 no Figma MCP (`spec-creator.md:47`) · GAP3 no argument for a foreign repo.
- REC1 temp index + pin → D6 · REC2 working-tree delta reviews + brief-diff R3 → D7 · REC3 dispatcher + `state` + selftest → D8 · REC4 orchestration only → D9.

| # | Decision | Options | Chosen |
|---|---|---|---|
| D6 | Checkpoint mechanism | A: temp index + `update-ref` pin · B: temp index, sha only · C: `git add -A` on the real index | A |
| D7 | Delta review and R3 source | A: working-tree mode + tree→tree path list; R3 by brief-diff · B: full working-tree review each iteration | A |
| D8 | Script layout | A: `sdd.sh` dispatcher + `selftest.sh` · B: one script per action | A |
| D9 | Skill file split | A: SKILL.md + `stages.md` + `review-loop.md` · B: SKILL.md only | A |
| D10 | Execution mode | multi-agent · single-agent | single-agent |

### Why a tree, not a commit
D2 forbids commits. A tree pinned under `refs/sdd/<NN>/<label>` is immutable (unlike an index blob that every `git add` replaces), survives `gc`, and never appears in `git log` or on a branch. The refs stay local; the user may delete them with `git update-ref -d` after the PR (mentioned in the hand-over).

## Risks & open questions
- `sdd.sh state` reads handoff headings and log lines in the format `/sdd` writes; plans 01–21 use mixed headings (`Handoffs → after G2 (last group)`, `→ verification`), so `--resume` on an old plan may misread the stage — the skill shows the `because:` line and asks before acting. Mitigation: out of scope to rewrite history.
- R3 in `plan-verifier.md:178` is defined as `git diff <src> -- docs/plans/`; with working-tree mode and an untracked plan the verifier cannot compute it, so it relies on the `brief-diff` result in the prompt. If it still reports R3 `not-verifiable`, that is a sign-off item, not a gap (agents are out of scope).
- `brief-diff` ignores only `Status:`/`Execution:` lines (assumption); *Decisions recorded* edits after approval would show up — correct, since such an edit is a plan change.
- Mode re-check against the real steps: no migration, contract or trust boundary; one area; 5 steps → `single-agent`, matches D10.
- `refs/sdd/*` accumulate locally across features; harmless, listed in the hand-over for cleanup.

## Handed off
- architecture-reviewer: nothing in its A1–A12 scope (no package code); optional.
- security review: none required — no trust boundary of the app. Worth a glance: `sdd.sh` argv handling (no `eval`, quoted paths) and `--ref-repo` clone target staying inside the scratchpad.

## Insights to record
- root `INSIGHTS.md` · Tool & Library Notes — in zsh, `$T:a` is a path modifier, so an unbraced variable followed by `:` breaks a script run under zsh; scripts here are bash with `${VAR}` (main-session test, 2026-10-04) — candidate, if not already recorded.
- root `INSIGHTS.md` · What Works — pin non-commit baselines as trees under `refs/sdd/*` via a temp `GIT_INDEX_FILE`; the real index and `git status --porcelain` stay untouched (research EXT3).

## Red-flags check
- [x] Every AC maps to at least one step or test (AC1 S3 · AC2 S1 `state`, S4 resume table · AC3 S1 · AC4 S5 · AC5 S2 · AC6 S4 · AC7 S4)
- [x] Every spec AC-n has a row in *Spec traceability* — n/a, `Spec: none`
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; technical choices are in *Decisions needed*, product gaps are GAPn
- [x] Groups end type-checking — n/a (no TS); single group
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1: only the pass-1 sections — n/a (pass 2)
- [x] Execution mode recommended per the D4 rule: single-agent
- [x] Every step's *Skills to apply* is complete (none — no file type a skill binds)

## Handoffs → all

From the implementer (2026-10-05, group `all`). Trivial deviations: in-place edits via `awk > tmp; cat tmp > file` (keeps file modes); `state` stage rules defined by the implementer and documented at the end of `stages.md`; `handoff`/`follow-up` insert above `## Verification log`.

### Skills (all)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | Insight candidates only | no INSIGHTS write (rule) |
| `onion-architecture` | preload | — | no server, reviewer-core or mcp-server code |

## Verification log
- 2026-10-05 main session: plan approved; checkpoint `refs/sdd/22/plan-approved` = tree `7c9c64d17b77c063fb83a5537e5bdaa27c6596a3` (temp index, real index untouched).
- 2026-10-05 INCIDENT during S2: the implementer wrote `selftest.sh` through a heredoc containing inner `EOF`s; the outer heredoc closed early and the rest ran in the real repo (zsh), creating two local commits on L05 (`a1a6e6e fixtures`, `f892291 more`) and overwriting `specs/README.md` + adding fixture files. Not pushed (no `origin/L05`), no secrets, local config unchanged. The implementer restored the working tree; the user ran `git reset --mixed 12d454d` (2026-10-05) — HEAD and index back to 12d454d, working tree kept. Final `selftest.sh` has a throwaway-repo guard (`pwd -P` vs `rev-parse --show-toplevel`).
- 2026-10-05 main session after the reset: `selftest.sh` → 41 `ok`, last line `selftest: ok`, rc 0; HEAD, `git status --porcelain`, all refs and stash identical before/after. Every Done-when of S1–S5 re-run: pass (S2's "`refs/sdd` prints nothing" sees only the main session's own approval checkpoint, which D6 requires). R3: `sdd.sh brief-diff` against `refs/sdd/22/plan-approved` → empty, rc 0 (plan above the marker unchanged since approval). No `.it` suite: no package code.
- 2026-10-05 checkpoint `refs/sdd/22/impl-all` = tree `e217ed6fcc7f24dd64961d623ac19783b78dff6a`.
- 2026-10-05 plan-verifier (full): incomplete — 61/63 met; gap P1 (S1 Practices: `replace_file` uses `cat >` instead of `mv`; `make_tree` has no `trap` for the temp index); R4 not-verifiable (single-agent, no test-writer). Incident leftovers: none (fixture paths absent, `specs/README.md` = HEAD, no branch contains the stray commits, only `refs/sdd/22/{plan-approved,impl-all}`).
- 2026-10-05 main-session fix: P1 (trap part) — `.claude/skills/sdd/scripts/sdd.sh` `make_tree` sets `trap "rm -rf '${dir}'" EXIT INT TERM` after `mktemp -d` (1 line, S1's Files; the path is expanded when the trap is set — a first attempt with a single-quoted `${dir}` failed under `set -u` because the trap ran after the function's local was gone). The `cat >` part awaits the user's acceptance as a declared deviation.
- 2026-10-05 main session after the corrected P1 fix: `bash -n` ok; forbidden-pattern grep empty; `selftest.sh` rc 0, 41 `ok`, last line `selftest: ok`, no FAIL/unbound; real repo HEAD/status/refs/stash identical before/after; no leftover `sdd-idx.*` dirs.
- 2026-10-05 plan-verifier delta: incomplete only on P1 (`cat >` part, declared deviation) and R4 (not-verifiable); trap fix confirmed (one added line vs `refs/sdd/22/impl-all`). User accepted both ("приймаю"): `replace_file` keeps `cat tmp > file` to preserve file modes; R4 not applicable in single-agent mode. Plan → done.
