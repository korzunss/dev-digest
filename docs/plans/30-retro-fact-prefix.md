# Development Plan: `retro-fact:` log prefix — a retro run keeps a `done` plan at `handover`
Status: done
Save as: docs/plans/30-retro-fact-prefix.md
Spec: none (tooling follow-up to plan 29, no product behaviour change)
Execution: single-agent

## Goal & acceptance criteria
`/workflow-retro` logs conversation-only facts with a plain `sdd.sh log <plan> "<fact>"` (`.claude/skills/workflow-retro/SKILL.md:34`). `sdd.sh state` takes the last non-skipped log line (`.claude/skills/sdd/scripts/sdd.sh:463`, skip set `agent|handback|resume|plan-lint|status-check|retro`), and on a `done` plan any line it does not recognise falls into `*)` → `stage: docs` (`sdd.sh:490-500`). So a retro run after `metrics` — exactly when `/sdd` offers it — rewinds the plan from `handover` to `docs`. Found on the first real `/workflow-retro docs/plans/28-pr-brief.md` run; fix chosen by the user 2026-10-07.
- AC1: the skill logs conversation-only facts as `retro-fact: <fact>`, and its template's cite rule allows citing such a line.
- AC2: `sdd.sh state` skips `retro-fact:` lines; on a `done` plan with `metrics:` → `retro-fact:` → `retro:` it prints `stage: handover`.
- AC3: a selftest case pins AC2 and is shown to fail without the `sdd.sh` change.
- AC4: `stages.md`'s skip-prefix paragraph names `retro-fact:`.

## Decisions needed
None.

## Prerequisites
None: no dependency, no Postgres.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| all | S1–S4 | `.claude/skills/sdd` (script, selftest, `stages.md`), `.claude/skills/workflow-retro/SKILL.md` | — | none (single run) |

Order inside the run: S1 (test first, run it and see it fail) → S2 (fix, selftest green) → S3 → S4. "Type-checks" here means `bash -n` passes and `selftest.sh` ends `selftest: ok`.

General practices for every step (plan 29, root `INSIGHTS.md` 2026-10-05 "writing a script through a heredoc …"): edit with the Edit tool only — no `sed -i`, no shell heredoc, no inline script writing a file; bash keeps `${VAR}` braces (no `$NAME:` form, root `INSIGHTS.md` 2026-10-05 zsh path-modifier entry; the selftest's script-lint enforces it); wrap the whole run in `sdd.sh git-state save` / `check`.

## Steps
### S1 — selftest case: `retro-fact:` after `metrics:` keeps a `done` plan at `handover`
- **Files:** `.claude/skills/sdd/scripts/selftest.sh` (modify)
- **Change:** directly after the existing case `eq "state done skips a retro line" …` (`selftest.sh:373`), inside the `# --- state skips bookkeeping lines; metrics stage` block, add:
  1. `write_plan docs/plans/06-st.md done` (fresh log: `write_plan`, `selftest.sh:30-47`, rewrites the file);
  2. `sdd log docs/plans/06-st.md "metrics: flags: 0 flag(s), 0 repeat(s)" >/dev/null`;
  3. `sdd log docs/plans/06-st.md "retro-fact: G2 implementer resumed twice" >/dev/null`;
  4. `eq "state done skips a retro-fact line" "stage: handover" "$(state_of docs/plans/06-st.md)"`;
  5. `sdd log docs/plans/06-st.md "retro: docs/plans/assets/06-st/workflow-retro.md" >/dev/null`;
  6. `eq "state done skips retro-fact then retro" "stage: handover" "$(state_of docs/plans/06-st.md)"`.
- **Layer / why here:** the selftest is the acceptance test of `sdd.sh` (plan 22 AC5, plan 29 S3); the new case sits next to the `retro:` case it extends.
- **Skills to apply:** none (shell test; no package skill binds `.claude/skills/sdd/scripts`)
- **Practices:** the case runs in the throwaway repo after the toplevel guard (`selftest.sh:24-25`); assertions use `eq` only, never a `grep -c` threshold; no new heredoc and no fixture line equal to the `PLAN` delimiter; nothing added after `echo "selftest: ok"` (`selftest.sh:556`).
- **Known gotchas:** root `INSIGHTS.md` 2026-10-05 "writing a script through a heredoc that itself contains `EOF` heredocs ran its body in the real repo" — edit with the Edit tool, guard with `git-state`.
- **Done when:** first `bash .claude/skills/sdd/scripts/sdd.sh git-state save "${TMPDIR:-/tmp}/sdd-gs-30"` · **before S2**, `bash .claude/skills/sdd/scripts/selftest.sh | tail -1` prints exactly `FAIL state done skips a retro-fact line` (the actual value shown above it is `stage: docs`) — record this line in the hand-back as the proof the case fails without the fix · after S2 the run passes (S2's Done when).

### S2 — `sdd.sh state` skips `retro-fact:` lines
- **Files:** `.claude/skills/sdd/scripts/sdd.sh` (modify)
- **Change:** in the `log_last` awk at `sdd.sh:463`, change the skip regex `^(agent|handback|resume|plan-lint|status-check|retro):` to `^(agent|handback|resume|plan-lint|status-check|retro|retro-fact):`. Nothing else in the file changes (the `done)` case at `:490-500` stays as is).
- **Layer / why here:** `state` is the only consumer of the skip set; `retro:` does not match `retro-fact:` (the alternative needs `:` right after `retro`), so a separate alternative is required.
- **Skills to apply:** none (shell script; no package skill binds `.claude/skills/sdd/scripts`)
- **Practices:** one-line edit with the Edit tool, anchored on the regex; no `sed -i`; BSD awk-safe (plain alternation, as today).
- **Known gotchas:** none
- **Done when:** `bash -n .claude/skills/sdd/scripts/sdd.sh` rc 0 · `grep -qF 'status-check|retro|retro-fact):' .claude/skills/sdd/scripts/sdd.sh` rc 0 · `bash .claude/skills/sdd/scripts/selftest.sh` rc 0, last line `selftest: ok`, no `FAIL` line · `bash .claude/skills/sdd/scripts/sdd.sh git-state check "${TMPDIR:-/tmp}/sdd-gs-30"` rc 0.

### S3 — `workflow-retro` logs conversation facts as `retro-fact:`
- **Files:** `.claude/skills/workflow-retro/SKILL.md` (modify)
- **Change:** (a) §3 step 5 (`SKILL.md:34`) becomes: ``5. A fact known only from the conversation is first logged with `S log <plan> "retro-fact: <fact>"` (`S state` skips `retro-fact:` lines), then cited as that log line.`` (b) the `<!-- cite: … -->` comment in the §4 template (`SKILL.md:49`): after "a Verification-log date and prefix" add "(a `retro-fact:` line included)". Nothing else changes — step 9 and the rest of the template stay as they are.
- **Layer / why here:** the skill text is the only producer of these log lines.
- **Skills to apply:** none (Markdown only)
- **Practices:** every `sdd.sh` subcommand and log prefix in backticks on one line, never split by a hard wrap (root `INSIGHTS.md` 2026-09-28); the cite rule stays inside the template fence as an HTML comment (plan 29 S1 practice); edit with the Edit tool.
- **Known gotchas:** root `INSIGHTS.md` 2026-09-28 "a Done-when `grep` for a phrase fails when Markdown wraps that phrase across two lines".
- **Done when:** before editing `cat .claude/skills/workflow-retro/SKILL.md > "${TMPDIR:-/tmp}/retro-skill-30-before.md"` (the file is untracked, so `git diff` cannot show the change) · after: `tr '\n' ' ' < .claude/skills/workflow-retro/SKILL.md | grep -qF 'S log <plan> "retro-fact: <fact>"'` rc 0 · `grep 'cite:' .claude/skills/workflow-retro/SKILL.md | grep -q 'retro-fact:'` rc 0 · `diff "${TMPDIR:-/tmp}/retro-skill-30-before.md" .claude/skills/workflow-retro/SKILL.md` shows exactly two changed lines (step 5 and the cite comment).

### S4 — `stages.md` names the `retro-fact:` skip prefix
- **Files:** `.claude/skills/sdd/stages.md` (modify)
- **Change:** in the log-format paragraph (`stages.md:106`), "`status-check:` or `retro:` are skipped" becomes "`status-check:`, `retro:` or `retro-fact:` are skipped". Nothing else changes.
- **Layer / why here:** `stages.md` documents the log prefixes `S state` parses; it must match S2.
- **Skills to apply:** none (Markdown only)
- **Practices:** prefixes in backticks on one line, no hard wrap inside the list; edit with the Edit tool.
- **Known gotchas:** root `INSIGHTS.md` 2026-09-28 (wrapped phrase vs grep) — the check below uses the `tr` form.
- **Done when:** before editing `cat .claude/skills/sdd/stages.md > "${TMPDIR:-/tmp}/stages-30-before.md"` (the file already carries uncommitted plan 29 edits, so `git diff` is not a clean baseline) · after: `tr '\n' ' ' < .claude/skills/sdd/stages.md | grep -qF '`retro:` or `retro-fact:` are skipped'` rc 0 · `diff "${TMPDIR:-/tmp}/stages-30-before.md" .claude/skills/sdd/stages.md` shows exactly one changed line · final `bash .claude/skills/sdd/scripts/sdd.sh git-state check "${TMPDIR:-/tmp}/sdd-gs-30"` rc 0.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `.claude/skills/sdd/scripts/selftest.sh` | shell selftest, throwaway repo | `state` on a `done` plan: `metrics:` → `retro-fact:` → `stage: handover`; then `retro:` → still `handover`; fails before S2 (AC2, AC3) | S1 |

## Migrations & contracts
None.

## Out of scope
- Editing plan 28's Verification log (the main session re-prefixes its two conversation-fact lines itself).
- `sdd.sh usage-scan`, `sdd.sh cost`, `flags.mjs`, `cost.mjs`.
- Any other wording in `workflow-retro/SKILL.md` (step 9, the rest of the template) or `stages.md`.
- Adding `retro-fact:` to any other parser (none reads the skip set besides `state`).

<!-- implementer-brief:end -->

## Handoffs → all
Implementer (2026-10-07): S1–S4 done. Fail-first proof: before S2 `selftest.sh | tail -1` = `FAIL state done skips a retro-fact line` (actual `stage: docs`); after S2 `selftest: ok`, 0 FAIL. SKILL.md diff 2 lines, stages.md diff 1 line; `git-state check` rc 0.

| Skill | Steps | Applied how |
|---|---|---|
| `engineering-insights` | preload | no new insight |
| `onion-architecture` | preload | not applicable (shell/Markdown only) |

## Context applied
- root `INSIGHTS.md` → "writing a script through a heredoc that itself contains `EOF` heredocs ran its body in the real repo" — Edit tool only, `git-state save/check` around the run (S1, S2, S4).
- root `INSIGHTS.md` → "in zsh, `$VAR:a` … is a path modifier" — `${VAR}` braces (general practice; the selftest's script-lint enforces it, `selftest.sh` `# --- scripts lint`).
- root `INSIGHTS.md` → "a Done-when `grep` for a phrase fails when Markdown wraps that phrase across two lines" — `tr` form in S3/S4.
- `docs/plans/29-workflow-retro-skill.md` S1/S3 practices — selftest case style (`eq`, `printf`, no heredoc) and Markdown rules reused.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | — | read-only use for Step 0 (root `INSIGHTS.md` headings); no package touched |
| `onion-architecture` | preload | — | no `server/`, `reviewer-core/` or `mcp-server/` code touched |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| `.claude/skills/sdd` | `scripts/sdd.sh` (`state`) | tooling | changed |
| `.claude/skills/sdd` | `scripts/selftest.sh` | tooling test | changed |
| `.claude/skills/sdd` | `stages.md` | tooling docs | changed |
| `.claude/skills/workflow-retro` | `SKILL.md` | tooling docs | changed |

## Design notes
A distinct `retro-fact:` prefix (instead of reusing `retro:`) keeps `retro: <path>` meaning "the retro file", which the retro's own step 9 and `stages.md:81` rely on, while still letting `state` skip both. The skip set is a regex alternation, so `retro` does not cover `retro-fact`.

## Risks & open questions
- The `workflow-retro/` folder and `stages.md` carry uncommitted plan 29 edits; S3/S4 use before/after file copies instead of `git diff` as their baseline.
- Plan 28's existing two plain fact lines keep rewinding `state` until the main session re-prefixes them (out of scope here).

## Handed off
- architecture-reviewer: none (tooling only).
- security review: none — no trust boundary.

## Insights to record
- None.

## Red-flags check
- [x] Every AC maps to at least one step or test (no-spec plans)
- [x] Every spec AC-n has a row in *Spec traceability* with a step or test (n/a: no spec)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; technical choices are in *Decisions needed*, product gaps are GAPn
- [x] Groups end type-checking; parallel groups share no file
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1: n/a (single pass)
- [x] Execution mode: single-agent (single pass)
- [x] Every step's *Skills to apply* is complete (the implementer reads only those)
- [x] `bash .claude/skills/sdd/scripts/sdd.sh plan-lint <plan>` prints `plan-lint: ok`

## Verification log
- 2026-10-07 agent: plan-p2 acd473ff3fd0f4c50 implementation-planner 2026-10-07T10:45:51Z
- 2026-10-07 plan approved by user 2026-10-07 (AskUserQuestion)
- 2026-10-07 agent: implement aea0ade78cb3e78ee implementer 2026-10-07T10:48:49Z
- 2026-10-07 full .it suite: not applicable — tooling only; selftest is the test tier
- 2026-10-07 agent: review af65d73f8f904eb91 plan-verifier 2026-10-07T10:50:27Z
- 2026-10-07 plan-verifier (full): complete — needs sign-off; 39/40 met, 0 gaps; R4 not-verifiable (no test-writer in single-agent; sdd.sh diff is the single planned line)
- 2026-10-07 user sign-off 2026-10-07 ("давай фіналізувати"): R4 accepted
- 2026-10-07 metrics: flags 0, repeats 0; cost total 247359 weighted tokens, 3 runs
