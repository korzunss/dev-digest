# Development Plan: run `/workflow-retro` automatically at the `/sdd` close
Status: done
Execution: single-agent
Save as: docs/plans/38-auto-workflow-retro.md
Spec: none (tooling/process change to the /sdd harness)

## Decisions recorded
- User, 2026-10-13 ("Давай усе за рекомендаціями. Гілки залишаємо як є, цей функціонал не повʼязаний з L06"): every recommendation accepted — D1 = C (auto only when `flags` reports ≥1 flag or `repeat:`, else `retro: skipped (0 flags)`; `--no-retro` opt-out) · D2 = B (first action of `handover`, no new stage id) · D3 = A (follow the SKILL.md text, flag stays `true`; no research) · D4 = A (auto path skips an existing file, logs `retro: skipped (exists)`; manual run keeps asking) · D5 = A · D6 = A · D7 = single-agent. TQ1–TQ4 → defaults. REC1–REC5 accepted.
- Approved (user, 2026-10-13: "так"), as written — the `--no-retro`-not-persisted-across-`--resume` assumption (S3) stands; the optional intake-time `retro: skipped (--no-retro)` log line was not taken. Idea 07 *Choice recorded* gained the reversal note (REC5).
- Branch: the plan stays on `L07_retro_agent` (based on `dee57b3`, without L06); the feature does not depend on L06. TQ1 default stands: Done-when is `bash -n` + `selftest.sh`; `pnpm eval:quality` / `pnpm eval:workflow` run after the merge with a branch that has `evals/`.
- Branch re-created (user, 2026-10-13: "Ми ще можемо перестворити гілку від L06?" → "так давай зробимо"): `L07_retro_agent` had no commits, so it was deleted and re-created from `L06` (`14ed16e`); the uncommitted plan-38 changes were carried over by `git stash`; the two index conflicts (`docs/plans/README.md` row 38 after 31–37, `.claude/skills/README.md` row `workflow-retro` beside L06's `dependency-checker`) were resolved by hand. `evals/` is now present, so TQ1's post-merge `eval:quality` ran here; `eval:workflow` (model calls) was not run. `refs/sdd/38/plan-approved` still pins the pre-rebase tree.

## Goal & acceptance criteria
User, 2026-10-13: the retro runs automatically at the end of `/sdd` instead of only when the user says yes at hand-over. Today it is on-demand only: `.claude/skills/workflow-retro/SKILL.md:16` ("never on every feature"), `.claude/skills/sdd/SKILL.md:76` (AskUserQuestion, default no), `stages.md:81`.
- AC1: at the `/sdd` close the main session runs the retro without a question when the D1 condition holds, and logs `retro: <path>` or `retro: skipped (<reason>)`.
- AC2: `sdd.sh state` on a `done` plan still prints `stage: handover` after either line (pinned by a selftest case).
- AC3: an auto run never stops for a question (existing file per D4).
- AC4: the retro skill, `/sdd` SKILL.md §4/§5, `stages.md` and the `.claude/skills/README.md` row no longer say "on-demand only".

## Requirements review
### Clarifying questions
- TQ1 | On this branch the evals harness is absent: `evals/` holds only `node_modules/` and `results/` (no `package.json`), `AGENTS.md` has no harness-eval table; it lives on `L06_lab_finish` (plans 31–37), with no `evals/skills/sdd` or `evals/skills/workflow-retro` suite. Which Done-when? | default: `bash -n` + `selftest.sh` ends `selftest: ok`; `pnpm eval:quality` and `pnpm eval:workflow` are listed as post-merge checks under *Risks*.
- TQ2 | Order inside the close: retro before the final message, so its `P<n>` follow-ups appear in the hand-over's `## Follow-ups`? | default: yes.
- TQ3 | Under D1=C, `flags` may print `flags: no usage data` (`flags.mjs:69`) and still go on to the Verification-log flags and the final `flags: N flag(s), M repeat(s)` line (`flags.mjs:160`). Decide on that final line only? | default: yes — N+M > 0 runs the retro (its cost section is then `n/a`), 0 logs `retro: skipped (0 flags)`.
- TQ4 | The retro file `docs/plans/assets/<plan>/workflow-retro.md` is new and untracked at hand-over. Name it in the hand-over's commit file list? | default: yes.

### Spec gaps
None. (No spec; the trigger semantics reverse a recorded user choice — idea 07 *Choice recorded*, plan 29 GAP1(b) — so they are D1, decided by the user.)

### Recommendations
- REC1 | Trigger on signal, not on every feature (D1=C): idea 07 rejected a per-feature retro for 20–40k tokens on a sample of one; the skill budgets ~30k main-session tokens (`workflow-retro/SKILL.md:21`), which `sdd.sh cost` does not count. A zero-flag run has little for §4 to report. → D1
- REC2 | No new stage id (D2=B): reuse the `retro:` prefix that `state` already skips (`sdd.sh:463`), so `STAGES` (`sdd.sh:11`), the `--resume` table and the `stages lists metrics before handover` case (`selftest.sh:353`) stay; add one selftest case for `retro: skipped (…)`. → D2
- REC3 | Keep `disable-model-invocation: true`; `/sdd` reads and follows the SKILL.md (already how `stages.md:81` "run the skill" works inside `/sdd`). Flipping it lets the model start a retro anywhere. → D3
- REC4 | §5: the retro question goes away (the retro runs, its §6 lists the `repeat:` lines); the `brainstormer` question stays. → D5
- REC5 | Plans finished outside `/sdd` stay manual `/workflow-retro <plan>`; out of scope. The main session appends the reversal to idea 07 *Choice recorded* (as plan 29 REC5 did). → D6

## Decisions needed
None open — see *Decisions recorded*. Chosen options and the steps they bind:

| # | Decision | Chosen | Steps affected |
|---|---|---|---|
| D1 | What "automatically" means | C: auto when the `metrics:` line reports ≥1 flag or repeat, else `retro: skipped (0 flags)`; `--no-retro` opt-out | S3, S4 |
| D2 | Where it runs | B: first action of `handover`, no new stage id | S1, S3, S4 |
| D3 | How `/sdd` runs the skill | A: Read the SKILL.md and follow it; flag stays `true` | S2, S4 |
| D4 | Existing retro in an auto run | A: skip, log `retro: skipped (exists)`; manual run keeps asking | S2 |
| D5 | §5 repeated flags | A: only the `brainstormer` question | S3 |
| D6 | Plans closed outside `/sdd` | A: out of scope | — |
| D7 | Execution mode | single-agent | all |

## Prerequisites
None. No dependency, no Postgres. Bash and node only (selftest).

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| all | S1–S5 | `.claude/skills` (`sdd` selftest + docs, `workflow-retro`, skills index) | — | none (single run) |

Order: S1 (selftest case, run it: it passes from the start because the change is text-only and pins existing `state` behaviour) → S2 → S3 → S4 → S5. "Type-checks" here means `bash -n` on the selftest passes and `selftest.sh` ends `selftest: ok`.

General practices for every step (plan 30, root `INSIGHTS.md` 2026-10-05 "writing a script through a heredoc …"): edit with the Edit tool only. Do not use `sed -i`, shell heredocs, or inline scripts that write files. Bash keeps the `${VAR}` braces, with no `$NAME:` form (root `INSIGHTS.md` 2026-10-05 zsh path-modifier entry; the selftest's script lint enforces it). Wrap the run in `sdd.sh git-state save` / `check`. The new log-line wordings are fixed and must be used exactly: `retro: skipped (0 flags)`, `retro: skipped (exists)`, `retro: skipped (--no-retro)`.

## Steps
### S1 — selftest case: `retro: skipped (…)` after `metrics:` keeps a `done` plan at `handover`
- **Files:** `.claude/skills/sdd/scripts/selftest.sh` (modify), inserted directly after the case `state done skips retro-fact then retro` (currently l.378–379), before `# --- scripts lint`
- **Change:** `write_plan docs/plans/06-st.md done`; `sdd log … "metrics: flags: 0 flag(s), 0 repeat(s)"`; `sdd log … "retro: skipped (0 flags)"`; `eq "state done skips a retro skipped line" "stage: handover" "$(state_of docs/plans/06-st.md)"`. Then log `retro: skipped (--no-retro)` and add a second `eq` named `state done skips a retro opt-out line`.
- **Layer / why here:** D2=B adds no stage. The `retro:` prefix is already skipped by `state` (`sdd.sh:463`), so the new skip wordings only need to be pinned.
- **Skills to apply:** none
- **Practices:** use only the existing helpers `write_plan`, `sdd`, `eq`, `state_of` (`selftest.sh:14-30`). Redirect each `sdd log` to `>/dev/null` as the neighbouring cases do. No change to `sdd.sh`.
- **Known gotchas:** root `INSIGHTS.md` 2026-10-05 "in zsh, `$VAR:a` … is a path modifier": keep the braces.
- **Done when:** `bash -n .claude/skills/sdd/scripts/selftest.sh` · `bash .claude/skills/sdd/scripts/selftest.sh` prints `ok state done skips a retro skipped line` and ends `selftest: ok` · `git diff --quiet -- .claude/skills/sdd/scripts/sdd.sh`

### S2 — `workflow-retro` skill: allow the auto run from `/sdd`
- **Files:** `.claude/skills/workflow-retro/SKILL.md` (modify)
- **Change:**
  1. Frontmatter `description`: "on-demand" becomes "on demand via /workflow-retro <plan path>, or automatically at the `/sdd` hand-over". Keep `disable-model-invocation: true` (D3=A). Set `version` to `"1.1.0"` (assumption).
  2. §1 second bullet (l.15): replace "for **on-demand** use only … never on every feature" with: it runs on demand, or automatically at the `/sdd` hand-over when the plan's `metrics:` line reports ≥1 flag (plan 38, reversing plan 29 GAP1(b)). An **auto run** is that `/sdd` case: the main session Reads this file and follows §2–§3 (no Skill-tool call), and it never asks a question.
  3. §3 step 6: keep the manual behaviour (ask: overwrite or stop). Add: in an auto run, if the file exists, run `S log <plan> "retro: skipped (exists)"` and stop, with no question and no write (D4=A).
  4. §3 step 10: in an auto run, the reply goes into the `/sdd` hand-over instead of a separate message.
- **Layer / why here:** this skill owns the retro procedure. `/sdd` only decides when to run it.
- **Skills to apply:** none
- **Practices:** keep the frontmatter keys and order. Leave §2 budget, §4 template and the step numbering unchanged (steps 1–10 stay). Use no other AskUserQuestion in the auto path.
- **Known gotchas:** root `INSIGHTS.md` 2026-09-28 "a Done-when `grep` for a phrase fails when Markdown wraps…": greps below use one token or the `tr` form.
- **Done when:** `grep -q 'automatically' .claude/skills/workflow-retro/SKILL.md` · `tr '\n' ' ' < .claude/skills/workflow-retro/SKILL.md | grep -q 'retro: skipped (exists)'` · `! tr '\n' ' ' < .claude/skills/workflow-retro/SKILL.md | grep -q 'never on every feature'` · `grep -q '^disable-model-invocation: true' .claude/skills/workflow-retro/SKILL.md`

### S3 — `/sdd` SKILL.md: `--no-retro`, stage row, §4 and §5
- **Files:** `.claude/skills/sdd/SKILL.md` (modify)
- **Change:**
  1. `argument-hint` (l.4): append `[--no-retro]`.
  2. §1 table: new row after `--skip-research`: `--no-retro`, "the hand-over skips the automatic retro and logs `retro: skipped (--no-retro)`; it applies to this invocation only, so a `--resume` run must pass it again".
  3. §2 `handover` row (l.60): Artefact becomes "auto retro (when flagged), then the final message (below)". The `sdd.sh` call becomes `log`.
  4. §4 (l.76): replace the last sentence (the AskUserQuestion offer) with: before the final message, the hand-over runs the retro as `stages.md` → `handover` says (no question). The final message then also names the retro file for the commit (TQ4) and lists its `retro P<n>` follow-ups.
  5. §5 (l.80): delete the sentence "A `repeat:` line is also named in the retro question of §4 …". Keep the `brainstormer` question. Add: the retro (which runs because a repeat implies a flag) lists the `repeat:` lines in its §6.
  6. `version` to `"1.1.0"` (assumption).
- **Layer / why here:** SKILL.md is the stage table and the hand-over contract. The procedure detail goes in `stages.md` (S4), not here.
- **Skills to apply:** none
- **Practices:** keep the stage ids and row order unchanged (they mirror `STAGES`, `sdd.sh:11`). Do not restate the retro procedure; point to `stages.md`.
- **Known gotchas:** none beyond S2's grep rule.
- **Done when:** `grep -q 'no-retro' .claude/skills/sdd/SKILL.md` · `! tr '\n' ' ' < .claude/skills/sdd/SKILL.md | grep -q 'default no) whether to run'` · `! tr '\n' ' ' < .claude/skills/sdd/SKILL.md | grep -q 'named in the retro question'` · `bash .claude/skills/sdd/scripts/selftest.sh` ends `selftest: ok`

### S4 — `stages.md`: the `handover` procedure, intake note, resume row, log formats
- **Files:** `.claude/skills/sdd/stages.md` (modify)
- **Change:**
  1. `## intake`: add a bullet saying `--no-retro` is kept for `handover`. It is not logged.
  2. `## handover` (l.81): replace the offer with this ordered procedure:
     (a) if the plan's Verification log already has a `retro:` line, skip to (e);
     (b) with `--no-retro`, `S log <plan> "retro: skipped (--no-retro)"`, then go to (e);
     (c) read the `metrics:` log line (`metrics: flags: N flag(s), M repeat(s)`); if N is 0, `S log <plan> "retro: skipped (0 flags)"`, then go to (e). A repeat implies a flag, so N ≥ 1 covers both;
     (d) Read `.claude/skills/workflow-retro/SKILL.md` and follow §2–§3 as an auto run. It logs `retro: <path>` or `retro: skipped (exists)` and files its `P<n>`;
     (e) the final message as in SKILL.md → *Hand-over*.
  3. `--resume` table row `handover`: add "(step (a) prevents a second retro)".
  4. Log-formats paragraph (l.106): after `retro:`, add that `retro: skipped (<reason>)` lines are skipped too.
- **Layer / why here:** `stages.md` holds the per-stage detail that SKILL.md points to.
- **Skills to apply:** none
- **Practices:** the step letters are a fixed order. Use only `S log`; add no new `sdd.sh` subcommand. The procedure never uses AskUserQuestion.
- **Known gotchas:** plan 30 / `sdd.sh:463`: any new log prefix outside `agent|handback|resume|plan-lint|status-check|retro|retro-fact` would rewind a `done` plan to `docs`. Use only `retro:` lines.
- **Done when:** `tr '\n' ' ' < .claude/skills/sdd/stages.md | grep -q 'retro: skipped (0 flags)'` · `grep -q 'no-retro' .claude/skills/sdd/stages.md` · `! tr '\n' ' ' < .claude/skills/sdd/stages.md | grep -q 'retro offer (AskUserQuestion, default no)'` · `bash .claude/skills/sdd/scripts/selftest.sh` ends `selftest: ok`

### S5 — skills index row
- **Files:** `.claude/skills/README.md` (modify, l.24 only)
- **Change:** "Main-session, on-demand per-plan process retro" becomes "Main-session per-plan process retro, on demand or automatically at the `/sdd` hand-over when flags fired". The rest of the cell is unchanged.
- **Layer / why here:** the index describes each skill. Line 29's generic "loaded on-demand" sentence is not about this skill and stays.
- **Skills to apply:** none
- **Practices:** edit only the one row. Keep the table columns unchanged.
- **Known gotchas:** none
- **Done when:** `grep 'workflow-retro/SKILL.md' .claude/skills/README.md | grep -q 'automatically'`

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `.claude/skills/sdd/scripts/selftest.sh` (cases `state done skips a retro skipped line`, `… opt-out line`) | bash selftest | AC2 | S1 |

## Migrations & contracts
None.

## Out of scope
- `sdd.sh`, `flags.mjs`, `cost.mjs` and every other script: no logic change (D2=B).
- A new stage id, `STAGES`, `cmd_agent`, the `stages lists metrics before handover` case.
- Flipping `disable-model-invocation` on either skill.
- Plans closed outside `/sdd` (D6=A).
- `docs/ideas/07-workflow-retro.md`: the reversal note belongs to the main session (REC5).
- Any `evals/` file. `AGENTS.md` / `CLAUDE.md`.

<!-- implementer-brief:end -->

## Context applied
- `docs/ideas/07-workflow-retro.md` *Choice recorded*: a per-feature retro was rejected for cost, then reversed to manual only. That is why D1=C runs only on signal.
- `docs/plans/29-workflow-retro-skill.md` *Decisions recorded*: D1=A inline main session and D4=B no stage id are kept. GAP1(b), offer only, is superseded (S2 text).
- `docs/plans/30-retro-fact-prefix.md`: an unknown log prefix rewinds a `done` plan to `docs`. Hence `retro: skipped (…)` (S1, S4).
- Root `INSIGHTS.md` 2026-10-05 (heredoc, zsh `$VAR:`) and 2026-09-28 (wrapped-phrase grep) shape the general practices and the Done-when forms.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| engineering-insights | preload | — | no `INSIGHTS.md` edit in this plan; candidates listed below |
| onion-architecture | preload | — | no backend code touched |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| `.claude/skills/sdd` | `scripts/selftest.sh` | harness test | changed |
| `.claude/skills/sdd` | `SKILL.md`, `stages.md` | harness docs | changed |
| `.claude/skills/workflow-retro` | `SKILL.md` | harness skill | changed |
| `.claude/skills` | `README.md` | index | changed |

## Design notes
- Trigger arithmetic: `flags.mjs:149-160` prints `repeat:` only for ids in this plan's own flags, so repeats > 0 implies flags > 0. The test is "N ≥ 1" on the logged `metrics:` line, which also survives a `--resume` (no need to re-run `flags`). `flags: no usage data` (`flags.mjs:69`) is followed by the same final line (TQ3).
- Idempotency comes from the log, not the file: step (a) checks for any `retro:` line, so a resumed hand-over neither re-runs nor re-asks. Step 6's file check (D4=A) covers a retro written by hand before `/sdd` closed.
- D2=A was not chosen: it would have rewritten `state` (`sdd.sh:463`, 492), the `--resume` table and selftest l.353/372–379.

## Risks & open questions
- An auto retro adds ~30k main-session tokens (`workflow-retro/SKILL.md:21`) at the hand-over. `sdd.sh cost` does not count them. Only flagged runs pay.
- `--no-retro` is not persisted. A `--resume` into `handover` without it will run the retro (assumption: acceptable, as documented in S3).
- Harness evals cannot run on this branch (TQ1). After merging with a branch that has `evals/`, run `pnpm eval:quality` (two `SKILL.md` edits) and `pnpm eval:workflow`. Neither `evals/skills/sdd` nor `evals/skills/workflow-retro` exists, so there is no skill suite to run.
- Plans 31–37 exist on other branches, and this branch's index has no rows for them. Expect a merge conflict in `docs/plans/README.md`.

## Handed off
- architecture-reviewer: nothing structural; S4 step order vs. SKILL.md §4 wording.
- security review: none — no trust boundary, no input parsing, no outbound calls.

## Insights to record
None.

## Red-flags check
- [x] Every AC maps to at least one step or test (AC1 → S3, S4; AC2 → S1; AC3 → S2, S4; AC4 → S2–S5)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; no new paths
- [x] Assumptions marked (version bumps, unpersisted `--no-retro`); no open product gaps
- [x] The single group ends with the selftest green
- [x] One group, 5 files, so no merge question
- [x] Brief above the marker is under ~20,000 characters
- [x] Execution mode single-agent per D7
- [x] *Skills to apply* is `none` for every step (bash/Markdown harness files; no skill row in `implementer.md` binds them)
- [x] Done-when greps: no `grep -c`; Markdown greps use one token or the `tr` form (`plan-lint` rules, `sdd.sh:287-312`). The main session runs `sdd.sh plan-lint` (not in this agent's allowed commands).

## Handoffs → all

Handoff to the next group: none (single-agent, S1–S5 done). Deviation: S1 adds its own `write_plan … done` + `metrics:` line before the new cases (state isolation).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | | Not applicable (docs and bash selftest only) |
| `engineering-insights` | preload | | No new insight |

## Verification log
- 2026-10-13 agent: plan-p1 a281f5cc2bfdd34d8 implementation-planner 2026-10-13T17:20:14Z
- 2026-10-13 agent: plan-p2 a281f5cc2bfdd34d8 implementation-planner 2026-10-13T17:20:14Z
- 2026-10-13 agent: implement acdad4adf39ac9c0c implementer 2026-10-13T17:24:05Z
- 2026-10-13 implement all: S1–S5 done; selftest: ok; main-session check: S5 Done-when grep ok
- 2026-10-13 it-suite: n/a — no server/client/reviewer-core change (only .claude/skills)
- 2026-10-13 agent: review a97c21d2a612318fc plan-verifier 2026-10-13T17:25:17Z
- 2026-10-13 plan-verifier: complete — needs sign-off; 52/53 met, 0 gaps; not-verifiable R4 (no test-writer in single-agent)
- 2026-10-13 main-session: branch re-created from L06 (14ed16e); selftest: ok, status-check: ok, plan-lint: ok after the move
- 2026-10-13 eval:quality sdd workflow-retro: 0 failures, 2 WARN (no eval file — pre-existing, neither skill has an evals/skills suite)
- 2026-10-13 sign-off: user accepted R4 (2026-10-13, "так, підтверджую")
- 2026-10-13 eval:workflow (subscription, run 20261013T173703): 7/9 passed — both /sdd traces pass; 2 fails unrelated to this plan: server-task case (gotchas.md not read; failed 9 of 11 runs on 2026-10-12, pre-existing flake) and client UI-string case (gotchas.md not read; passed 2026-10-11/12, one sample)
- 2026-10-13 main-session fix: self-review LOW — workflow-retro/SKILL.md §3: an auto run checks the existing-file path before step 1 (no scan, reads or retro-fact lines on skip); step 6 points to it. S2 Done-when ok, selftest: ok, eval:quality 0 failures
