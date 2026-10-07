# Development Plan: `/workflow-retro` — per-plan process retro skill
Status: done
Save as: docs/plans/29-workflow-retro-skill.md
Spec: none (tooling: a Claude Code skill, no product behaviour change)
Execution: single-agent

## Goal & acceptance criteria
A manual skill `.claude/skills/workflow-retro/` writes a per-plan process retro shaped like the prototype `docs/plans/assets/28-pr-brief/workflow-retro.md` (what happened · cost · what worked · what did not · proposed corrections · open items), using `sdd.sh usage-scan`/`flags` as its only cost source. **Supersedes** plan 23 *Out of scope* "a model-written retro … a `/workflow-retro` skill" (`23-…md:152`) and idea 07's "Not chosen: Opt3" (`07-…md:88`), at the user's request (2026-10-07); the no-LLM metrics stay. The retro runs on demand only (manual, or offered at the `/sdd` hand-over) — never on every feature, which is what idea 07 rejected.
- AC1: `/workflow-retro <plan>` writes the six sections; every figure comes from `sdd.sh` output, every claim cites a log line or file.
- AC2: no duplicated metric logic; the skill never writes `INSIGHTS.md`.
- AC3: `sdd.sh state` on a `done` plan is unchanged by the retro's log line.
- AC4: catalog row in `.claude/skills/README.md`.
- AC5 (from GAP2, D2, D4): each proposal `P<n>` is filed with `sdd.sh follow-up`; `sdd.sh cost <plan>` prints the per-stage cost table without a model; `/sdd` §4 offers the retro and `stages.md` says how.

## Decisions needed
None open — see *Decisions recorded*. The options as offered in pass 1 are below the marker (*Design notes → Pass 1 review*).

## Decisions recorded
User, 2026-10-07 (AskUserQuestion):
- GAP1 → (b): manual `/workflow-retro <plan>`, and `/sdd` hand-over **offers** it (AskUserQuestion), never runs it on its own.
- GAP2 → retro file + each `P<n>` filed on the plan via `sdd.sh follow-up`.
- GAP3 → no cross-plan trend file; `flags` `repeat:` is the trend.
- GAP4 → read the plan by section (REC4); budget ~30k tokens per retro; the retro file ≤ ~10k characters.
- TQ1–TQ3 → defaults (re-run and quote `usage-scan`/`flags`; frontmatter as `/sdd`; conversation-only facts are logged with `sdd.sh log` first, then cited).
- D1 = A (main session inline) · D2 = A (`sdd.sh cost`) · D3 = A (assets path + `retro:` log line skipped by `state`) · D4 = B (follows GAP1 b) · D5 = single-agent.
- REC1–REC6 accepted. REC5: main session appends the reversal to idea 07 *Choice recorded*.
- Correction 1 (user, 2026-10-07, after comparing an external `workflow-retro` skill; AskUserQuestion): adopt (a) `sdd.sh cost` adds per-stage cache hit % (`cache_read ÷ (input + cache_read + cache_creation)`), wall-clock span from `first_ts`/`last_ts`, the critical-path stage and a parallelism factor (Σ spans ÷ plan wall-clock); (b) `cost` prints rows with `plan = null` from the plan's sessions (unlogged or nested agents) as a separate `unattributed` line, never drops them; (c) the template's "what did not work" carries a checklist — duplicated context, rework/clarifying round-trips, scope drift, failure taxonomy — and a rule: a metric that cannot be sourced is `n/a`, never estimated. Not adopted: a ledger/trend file (GAP3 stands), a Python journal parser (duplicates `usage-scan.mjs`), dollar prices (weighted tokens stay), in-context `subagent_tokens` (root INSIGHTS 2026-10-05).

## Prerequisites
None: no dependency, no Postgres. Node ≥22 (already used by `usage-scan.mjs`, `flags.mjs`).

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| all | S1–S5 | `.claude/skills/sdd` (scripts + text), `.claude/skills/workflow-retro` (new), `.claude/skills/README.md` | — | none (single run) |

Order inside the run: S2 → S3 (scripts, then their selftest) → S1 (the skill names `sdd.sh cost`) → S4 → S5. "Type-checks" here means `bash -n` / `node --check` pass and `selftest.sh` ends `selftest: ok`.

## Steps

### S1 — Write the `workflow-retro` skill
- **Files:** `.claude/skills/workflow-retro/SKILL.md` (create)
- **Change:** write the skill exactly per *Design notes → SKILL.md contract* (below the marker — part of this step): frontmatter (`disable-model-invocation: true`, `user-invocable: true`), §1 Scope and boundaries, §2 Inputs and budget, §3 Procedure, §4 Output template in a `~~~md` … `~~~` fence.
- **Layer / why here:** a main-session skill like `/sdd` (D1 = A: no subagent, no new agent).
- **Skills to apply:** none (Markdown skill text; no skill in `implementer.md` binds it).
- **Practices:** every cap, citation rule, the `n/a` rule and the "what did not work" checklist (Correction 1 c) sit **inside** the template fence as HTML comments `<!-- cap: … -->` / `<!-- cite: … -->` / `<!-- n/a: … -->` / `<!-- check: … -->`, plus the checklist table (REC1, root `INSIGHTS.md` 2026-09-27); limits are inclusive ("at most 9"); every `sdd.sh` subcommand and log prefix in backticks on one line, never split by a hard wrap; rules from `AGENTS.md` / `engineering-insights` are cited, not restated; written with the Write tool.
- **Known gotchas:** root `INSIGHTS.md` 2026-09-27 "in an agent prompt, the output template beats the prose rules" (incl. its 2026-09-28 extension: inside the fence); 2026-09-28 "a Done-when `grep` for a phrase fails when Markdown wraps".
- **Done when:** `awk '/^~~~md$/{f=1;next} /^~~~$/{f=0} f && /^## /' .claude/skills/workflow-retro/SKILL.md` prints exactly the six lines `## 1. What happened`, `## 2. Cost`, `## 3. What worked`, `## 4. What did not work`, `## 5. Proposed corrections`, `## 6. Open items` · `for t in 'cap:' 'cite:' 'n/a:' 'check:' 'duplicated' 'round-trips' 'drift' 'taxonomy' 'unattributed'; do awk '/^~~~md$/{f=1;next} /^~~~$/{f=0} f' .claude/skills/workflow-retro/SKILL.md | grep -q -- "$t" || echo "missing $t"; done` prints nothing · `for t in disable-model-invocation usage-scan flags cost follow-up retro: INSIGHTS; do grep -q -- "$t" .claude/skills/workflow-retro/SKILL.md || echo "missing $t"; done` prints nothing.

### S2 — Add `sdd.sh cost`, share the weights, skip `retro:` in `state`
- **Files:** `.claude/skills/sdd/scripts/usage-weights.mjs` (create), `.claude/skills/sdd/scripts/cost.mjs` (create), `.claude/skills/sdd/scripts/flags.mjs` (modify — `:47-62`), `.claude/skills/sdd/scripts/sdd.sh` (modify — `usage` `:15-38`, `cmd_flags` `:385-389`, `state` awk `:444`, dispatch `:504-523`)
- **Change:**
  - `usage-weights.mjs`: move `W`, `METRIC`, `num`, `weighted` out of `flags.mjs:47-62` unchanged and `export` them; `flags.mjs` imports them (`import { … } from './usage-weights.mjs'`) and keeps `F1_FACTOR`, `F1_MIN_OTHER_PLANS`, `median`. `flags` output must stay byte-identical.
  - `cost.mjs`: implement *Design notes → cost contract* (below the marker — part of this step): per-stage weighted tokens, share, cache hit % and busy time; plan window, busy, parallelism factor and critical-path stage; the `unattributed` line for `plan = null` rows of the plan's sessions (Correction 1 a, b). Every formula, its `n/a` case and the exact output lines are in the contract.
  - `sdd.sh`: `cmd_cost()` modelled on `cmd_flags` (`node` check, exactly one argument, `node "${here}/cost.mjs" --root "${root}" --plan "$1"`); dispatch row `cost) cmd_cost "$@" ;;`; `help` line `  cost <plan>                              per-stage tokens, cache hit, busy time, parallelism, unattributed rows (reads .sdd/usage.jsonl)`.
  - `state` (REC6, D3): add `retro` to the skip alternation at `sdd.sh:444` → `^(agent|handback|resume|plan-lint|status-check|retro):`. `STAGES` (`sdd.sh:11`) is **not** changed (D4 = B: no new stage id).
- **Layer / why here:** skill-local tooling behind the one `sdd.sh` entry point (plan 23 D14 pattern); the shared module keeps one weights definition (AC2).
- **Skills to apply:** none (shell and plain `.mjs` tooling).
- **Practices:** ESM, `node:` builtins only (`fs`, `path`), no `child_process`, no network; `cost.mjs` reads only `.sdd/usage.jsonl` numbers and fields `plan`, `stage`, `agent_id`, `session_id`, `first_ts`, `last_ts`; timestamps go through `Date.parse` and a non-finite result makes the row untimed (never `NaN` in the output); every division checks its denominator first (`n/a`); exit 0 on every data problem, 2 only on bad arguments; bash with `${VAR}` braces (no `$NAME:`), BSD-safe, no `sed -i`; edit files with the Edit/Write tools, never through a shell heredoc.
- **Known gotchas:** root `INSIGHTS.md` 2026-10-05 "writing a script through a heredoc…"; 2026-10-05 "in zsh, `$VAR:a`…"; 2026-10-05 "a subagent's real token usage lives in its transcript" (weights, dedupe — reuse, do not re-derive).
- **Done when:** before editing, `bash .claude/skills/sdd/scripts/sdd.sh flags docs/plans/28-pr-brief.md > "${TMPDIR:-/tmp}/flags-28-before.txt"`; after: `bash .claude/skills/sdd/scripts/sdd.sh flags docs/plans/28-pr-brief.md | diff "${TMPDIR:-/tmp}/flags-28-before.txt" -` prints nothing · `node --check .claude/skills/sdd/scripts/cost.mjs` and `node --check .claude/skills/sdd/scripts/usage-weights.mjs` and `node --check .claude/skills/sdd/scripts/flags.mjs` rc 0 · `bash -n .claude/skills/sdd/scripts/sdd.sh` rc 0 · `bash .claude/skills/sdd/scripts/sdd.sh cost docs/plans/28-pr-brief.md | tail -1 | grep -q '^cost:'` rc 0 · S3's selftest passes.

### S3 — Selftest cases for `cost` and the `retro:` skip
- **Files:** `.claude/skills/sdd/scripts/selftest.sh` (modify)
- **Change:** all before the final `echo "selftest: ok"` (`selftest.sh:489`):
  - **state** (in the `06-st` block, after `selftest.sh:371`): `sdd log docs/plans/06-st.md "retro: docs/plans/assets/06-st/workflow-retro.md"` → `eq "state done skips a retro line" "stage: handover" "$(state_of docs/plans/06-st.md)"`.
  - **cost** (new block after the flags block, `selftest.sh:487`): `write_plan docs/plans/08-co.md done`; `rm -f .sdd/usage.jsonl` → `sdd cost docs/plans/08-co.md` prints `cost: no usage data`, rc 0. Then write `.sdd/usage.jsonl` with `printf` rows (schema as `fx_row`, `selftest.sh:437`, but with explicit `session_id`, `agent_id`, `plan` (`null` unquoted where stated), `stage`, `first_ts`, `last_ts`; times on 2026-01-01, `Z`; tokens not named are 0):
    - `a1` s1 `08` `plan-p1` input 300000, 10:00:00–10:10:00 · `a2` s1 `08` `implement` input 50000 output 10000, 10:20:00–10:30:00 · `a3` s1 `08` `implement` cache_read 1000000, 10:25:00–10:35:00 · `a4` s1 `09` `implement` input 999999, 10:00:00–10:30:00 (other plan)
    - null rows (`plan`/`stage` null): `a5` s1 input 40000, 10:05:00–10:06:00 (counted) · `a6` s1 input 7, both ts null (untimed) · `a7` s2 input 5, 10:05:00–10:06:00 (other session) · `a8` s1 input 3, 12:00:00–12:01:00 (outside the window)
    - `eq` on the **whole** output of `sdd cost docs/plans/08-co.md`, these 11 lines: `cost: plan=08 weighted_tokens=input+1.25*cache_creation+0.1*cache_read+5*output` · `| Stage | Runs | Agents | Weighted tokens | Share | Cache hit | Busy |` · `|---|---:|---:|---:|---:|---:|---:|` · `| plan-p1 | 1 | 1 | 300000 | 60.0% | 0.0% | 10m00s |` · `| implement | 2 | 2 | 200000 | 40.0% | 95.2% | 15m00s |` · `cost: total 500000 weighted tokens, 3 runs, 3 agents` · `cost: window 35m00s` · `cost: busy 25m00s, parallelism 1.20` · `cost: critical path implement 15m00s` · `cost: unattributed 1 runs, 1 agents, 40000 weighted tokens (sessions 1, untimed 1 not counted)` · `cost: main-session tokens not included`. (Weights, cache-hit ratio, overlap merge 10:20–10:35, Σ spans 1800 s ÷ busy 1500 s, and the three unattributed bounds are all exercised.)
    - untimed plan: `write_plan docs/plans/11-nt.md done`; rows `a9` s3 `11` `docs` output 100, ts null · `a10` s3 null input 11, 09:00:00–09:01:00. Whole output: header, column and separator lines as above with `plan=11` · `| docs | 1 | 1 | 500 | 100.0% | n/a | n/a |` · `cost: total 500 weighted tokens, 1 runs, 1 agents` · `cost: window n/a` · `cost: busy n/a, parallelism n/a` · `cost: critical path n/a` · `cost: unattributed 1 runs, 1 agents, 11 weighted tokens (sessions 1, untimed 0 not counted)` · `cost: main-session tokens not included`.
    - zero span and zero tokens: `write_plan docs/plans/12-zs.md done`; row `a11` s4 `12` `review`, all tokens 0, 10:00:00–10:00:00. Whole output: header lines with `plan=12` · `| review | 1 | 1 | 0 | n/a | n/a | 0m00s |` · `cost: total 0 weighted tokens, 1 runs, 1 agents` · `cost: window 0m00s` · `cost: busy 0m00s, parallelism n/a` · `cost: critical path review 0m00s` · `cost: unattributed 0 runs, 0 agents, 0 weighted tokens (sessions 1, untimed 0 not counted)` · `cost: main-session tokens not included`.
    - no `NaN`/`Infinity` in any of the three outputs (`eq` against an empty `grep -o` result).
  - `write_plan docs/plans/10-nr.md done` → `cost: no rows for plan 10`, rc 0. Bad arguments → rc 2: no argument, `/abs/docs/plans/08-co.md`, `docs/plans/../plans/08-co.md`; `node "${here}/cost.mjs" --root "${work}/no-such-dir" --plan docs/plans/08-co.md` → 2.
- **Layer / why here:** the selftest is the acceptance test of `sdd.sh` (plan 22 AC5, plan 23 S2).
- **Skills to apply:** none.
- **Practices:** every case runs in the throwaway repo after the toplevel guard (`selftest.sh:24`); assertions use `eq`/`rc_of`, never a `grep -c` threshold; fixture JSONL with `printf`, no new heredoc; no fixture line equals an existing heredoc delimiter (`PLAN`, `FIX`).
- **Known gotchas:** root `INSIGHTS.md` 2026-10-05 "writing a script through a heredoc…" (toplevel-guard rule).
- **Done when:** before the run `bash .claude/skills/sdd/scripts/sdd.sh git-state save "${TMPDIR:-/tmp}/sdd-gs-29"`; `bash .claude/skills/sdd/scripts/selftest.sh` rc 0 with last line `selftest: ok` and no `FAIL` line; after it `bash .claude/skills/sdd/scripts/sdd.sh git-state check "${TMPDIR:-/tmp}/sdd-gs-29"` rc 0.

### S4 — Offer the retro in `/sdd` and document the `retro:` line
- **Files:** `.claude/skills/sdd/SKILL.md` (modify — §4 `:74-76`, §5 `:78-80`), `.claude/skills/sdd/stages.md` (modify — `## metrics` `:77-78`, `## handover` `:80-81`, last paragraph `:106`)
- **Change:**
  - `SKILL.md` §4: one sentence — the hand-over also asks (AskUserQuestion, default no) whether to run `/workflow-retro <plan>`; it is never run without a yes. §5: one sentence — a `repeat:` line is also named in that question, so the user can choose a retro, a `brainstormer` run, both or neither.
  - `stages.md` `## metrics`: also run `S cost <plan>` (its output goes to the hand-over). `## handover`: the retro offer, and on yes "run the `workflow-retro` skill with the plan path; it logs `retro: <path>` and files its `P<n>` with `S follow-up`". Last paragraph: add `retro:` to the prefixes `S state` skips.
  - `SKILL.md` §2 `metrics` row: add `cost` to its `sdd.sh` column. No new row, no stage id.
- **Layer / why here:** the skill text is what the main session follows (plan 22 D9); D4 = B.
- **Skills to apply:** none.
- **Practices:** lines added or extended only; stage ids unchanged (§2 table equals `sdd.sh stages`); every subcommand and prefix in backticks on one line.
- **Known gotchas:** root `INSIGHTS.md` 2026-09-28 (wraps).
- **Done when:** `for t in workflow-retro retro: cost; do grep -q -- "$t" .claude/skills/sdd/stages.md || echo "missing $t"; done` prints nothing · `for t in workflow-retro cost; do grep -q -- "$t" .claude/skills/sdd/SKILL.md || echo "missing $t"; done` prints nothing · `bash -c 'diff <(sed -n "/^## 2\. Stages/,/^## 3\./s/^| \`\([a-z0-9-]*\)\` |.*/\1/p" .claude/skills/sdd/SKILL.md) <(bash .claude/skills/sdd/scripts/sdd.sh stages)'` prints nothing, rc 0.

### S5 — Catalog row for the new skill
- **Files:** `.claude/skills/README.md` (modify — catalog table, after the `sdd` row `:23`)
- **Change:** one row: `| [workflow-retro](workflow-retro/SKILL.md) | Meta | Main-session, on-demand per-plan process retro — what happened, cost (from sdd.sh usage-scan/flags/cost), what worked, what did not, proposed corrections filed as plan follow-ups; process lessons only, never INSIGHTS.md |`.
- **Layer / why here:** the catalog lists every skill (AC4).
- **Skills to apply:** none.
- **Practices:** one table row, nothing else changed.
- **Known gotchas:** none.
- **Done when:** `grep -q 'workflow-retro/SKILL.md' .claude/skills/README.md` rc 0 · `git diff --numstat -- .claude/skills/README.md` prints `1	0	.claude/skills/README.md`.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `.claude/skills/sdd/scripts/selftest.sh` | shell selftest, throwaway repo | `cost`: table rows and order, weights, cache hit, busy/overlap merge, window, parallelism, critical path, unattributed bounds (session, window, untimed), `n/a` cases (untimed, zero tokens, zero span), plan filter, no data, no rows, bad args (AC5, AC2) | S3 |
| same | same | `state` skips `retro:` on a `done` plan (AC3) | S3 |
| same (existing flags cases, unchanged) | same | `flags` output unchanged after the weights move (AC2) | S2, S3 |

No vitest, no `.it` suite: no package code changes. AC1 (the retro's content) is checked by S1's template Done-when and by the first real run (*Risks*).

## Migrations & contracts
None.

## Out of scope
- A new agent, a subagent run, a new `/sdd` stage id or `STAGES` change, any hook or `.claude/settings*.json` change.
- A cross-plan trend file or `docs/retros/` (GAP3).
- Writing a retro for any plan, or rewriting `docs/plans/assets/28-pr-brief/workflow-retro.md`.
- Edits to plan 23, `docs/ideas/07-workflow-retro.md` (REC5 is the main session's), root `AGENTS.md`, any `INSIGHTS.md`, `usage-scan.mjs`.

<!-- implementer-brief:end -->

## Handoffs → all
Implementer (2026-10-07): S1–S5 done; `flags` output on plan 28 byte-identical before/after; `selftest: ok` with `git-state check` rc 0; §2 table vs `sdd.sh stages` diff empty; README numstat `1 0`. `flags.mjs` imports only `METRIC` and `weighted` from `usage-weights.mjs`. REC5 (idea 07 reversal) was done by the main session before implementation.

| Skill | Steps | Applied how |
|---|---|---|
| `engineering-insights` | preload | read-only; no `INSIGHTS.md` written; retro SKILL.md routes insight candidates to it |
| `onion-architecture` | preload | not applicable (no server / reviewer-core code) |
| none named | S1–S5 | plan practices: `node:` builtins only, `${VAR}` braces, no `sed -i`, Write tool for the skill file |

## Follow-ups
- 2026-10-07 busy time / critical path in sdd.sh cost are first_ts→last_ts spans and include idle time of resumed agents (plan 28 spec-p2 397m). Exact busy time needs usage-scan to store per-message active intervals (usage.jsonl format change) — new plan

## Verification log
- 2026-10-07 agent: plan-p1 ae52f04c85a5cce93 implementation-planner 2026-10-07T10:12:23Z
- 2026-10-07 agent: research af0f47ddac61303ed researcher 2026-10-07T10:17:33Z
- 2026-10-07 research (external): skills under an existing .claude/skills/ are file-watched and picked up mid-session without restart; fallback /reload-skills (code.claude.com/docs/en/skills, accessed 2026-10-07, not tested live). disable-model-invocation:true keeps the description out of model context.
- 2026-10-07 agent: plan-p2 ae52f04c85a5cce93 implementation-planner 2026-10-07T10:21:14Z
- 2026-10-07 agent: plan-p2 ae52f04c85a5cce93 implementation-planner 2026-10-07T10:27:24Z
- 2026-10-07 approved by user 2026-10-07 (AskUserQuestion), assumptions accepted
- 2026-10-07 agent: implement ad4e6962208b30be7 implementer 2026-10-07T10:29:53Z
- 2026-10-07 full .it suite: not applicable — no server/client/reviewer-core code changed; selftest: ok is the plan's only test tier
- 2026-10-07 agent: review a03259d4e4be243b0 plan-verifier 2026-10-07T10:31:57Z
- 2026-10-07 plan-verifier (full): complete — needs sign-off; 43 met, 0 gaps; not-verifiable AC1 (first real run), R4 (no test-writer in single-agent)
- 2026-10-07 main-session fix: busy-note — workflow-retro/SKILL.md template §2 gains a busy: comment (busy/critical path are spans, upper bound for resumed agents); S1 headings check re-run ok
- 2026-10-07 user sign-off 2026-10-07: AC1 (first real /workflow-retro run) and R4 accepted
- 2026-10-07 metrics: flags 0, repeats 0; cost total 1059104 weighted tokens, 5 runs, plan-p2 51.1%

## Context applied
- `docs/plans/23-workflow-retro-skill.md` → *Decisions recorded* "Direction changed" (`:22`) and *Out of scope* (`:152`) — superseded for the skill only; `usage-scan`/`flags`/`metrics` reused as the data source (S2, S4).
- `docs/ideas/07-workflow-retro.md` → Opt3 kill criterion and cost estimate — on-demand trigger, ~30k budget (S1 §2).
- `docs/plans/assets/28-pr-brief/workflow-retro.md` → section layout of the template (S1); its hand-built cost table → `sdd.sh cost` (S2).
- root `INSIGHTS.md` → 2026-09-27 template beats prose (S1), 2026-09-28 wraps (S1, S4 Done-when), 2026-10-05 heredoc + zsh (S2, S3), 2026-10-05 transcript usage (S2 weights), 2026-09-25 new agents (moot: D1 = A, no agent; skills are file-watched per research).
- `.claude/skills/engineering-insights/SKILL.md` → boundary: code/process lessons with evidence go to `INSIGHTS.md` via that skill; the retro only lists candidates (S1 §1).
- `.claude/skills/sdd/scripts/sdd.sh:444` (skip list), `:483-493` (`done` branch) — S2 `state` change.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | — | boundary read for S1 §1; no step writes `INSIGHTS.md` |
| `onion-architecture` | preload | — | no `server/`, `reviewer-core/` or `mcp-server/` code |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| `.claude/skills/workflow-retro` | `SKILL.md` | skill text | new |
| `.claude/skills/sdd` | `scripts/cost.mjs`, `scripts/usage-weights.mjs` | tooling | new |
| `.claude/skills/sdd` | `scripts/sdd.sh`, `scripts/flags.mjs`, `scripts/selftest.sh` | tooling | changed |
| `.claude/skills/sdd` | `SKILL.md`, `stages.md` | skill text | changed |
| `.claude/skills` | `README.md` | catalog | changed |

## Design notes

### cost contract (S2)
- Args: `--root <dir> --plan docs/plans/NN-*.md`, validated exactly as `flags.mjs:9-42` (relative, no `..`, `docs/plans/NN-…md`, root a directory); bad → usage line on stderr, exit 2.
- Rows: `.sdd/usage.jsonl`, bad lines dropped. **Plan rows**: `plan === NN` and `stage` a string (as `flags.mjs:80`). **Null rows**: `plan === null` and `session_id` a string. Missing file → `cost: no usage data`, exit 0. No plan row → `cost: no rows for plan NN`, exit 0.
- Fields available (fact, `usage-scan.mjs:149-163`, real rows checked 2026-10-07): every row carries `session_id`, `agent_id`, `stage`, `plan`, the four token counts, `first_ts`/`last_ts` (ISO UTC of the row's first/last message, `null` when no message had a timestamp). Nothing else is needed.
- **Timed row**: both `Date.parse(first_ts)` and `Date.parse(last_ts)` are finite and `last ≥ first`; otherwise untimed. Row span = `last − first`. Untimed rows count in tokens, never in time figures.
- **Duration format** `dur(ms)`: `s = Math.round(ms / 1000)` → `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` (90 s → `1m30s`, 3600 s → `60m00s`). `n/a` where stated.
- **Per stage** (plan rows): runs = rows (one per session × agent × stage, plan 23 contract) (assumption: "runs" = rows); agents = distinct `agent_id`; weighted = Σ `weighted(row)` (`usage-weights.mjs`); share = `(100 * w / total).toFixed(1) + '%'`, `n/a` when total = 0; cache hit = `100 * Σcache_read / Σ(input + cache_read + cache_creation)`, `.toFixed(1) + '%'`, `n/a` when the denominator is 0; busy = length of the union of the stage's timed row intervals (overlaps merged), `dur()`, `n/a` with no timed row. Sort by weighted desc, then stage name asc.
- **Plan time** (timed plan rows): window = `max(last) − min(first)`; busy = length of the union of all timed plan-row intervals; parallelism = `Σ row spans ÷ busy`, `.toFixed(2)`; critical path = the stage with the largest busy (tie → stage name asc). No timed plan row → window, busy, parallelism and critical path are `n/a`; busy = 0 → parallelism `n/a`.
- **Unattributed** (Correction 1 b): the plan's sessions = distinct `session_id` of plan rows. A null row counts when its session is one of them **and** it is timed and overlaps the plan window (`first ≤ windowEnd && last ≥ windowStart`) (assumption: a session can host several plans — this session ran plans 28 and 29 — so the window bounds it). Untimed null rows of those sessions are not counted, only reported as `untimed <k>`. With window `n/a`, every timed null row of those sessions counts (assumption). Nested agents under `subagents/workflows/` are never in `usage.jsonl` (plan 23 contract), so they cannot appear here.
- Output, in order:
  1. `cost: plan=NN <METRIC>`
  2. `| Stage | Runs | Agents | Weighted tokens | Share | Cache hit | Busy |`
  3. `|---|---:|---:|---:|---:|---:|---:|`
  4. one `| <stage> | <runs> | <agents> | <Math.round(w)> | <share> | <cache hit> | <busy> |` per stage
  5. `cost: total <Math.round(total)> weighted tokens, <rows> runs, <distinct agents> agents`
  6. `cost: window <dur|n/a>`
  7. `cost: busy <dur|n/a>, parallelism <x.xx|n/a>`
  8. `cost: critical path <stage> <dur>` or `cost: critical path n/a`
  9. `cost: unattributed <r> runs, <a> agents, <Math.round(w)> weighted tokens (sessions <s>, untimed <k> not counted)` — always printed, also with zeros
  10. `cost: main-session tokens not included`

### SKILL.md contract (S1)
- **Frontmatter:** `name: workflow-retro`; `description:` one sentence — main-session, on-demand process retro for one plan, invoked only via `/workflow-retro <plan path>`; `argument-hint: "<plan path>"`; `disable-model-invocation: true`; `user-invocable: true`; `version: "1.0.0"`.
- **§1 Scope and boundaries:** the main session writes the retro inline (no subagent); one plan, process only. It supersedes plan 23's "no `/workflow-retro` skill" for on-demand use only (plan 29). Never writes `INSIGHTS.md`, `gotchas.md`, specs, agents, code, the plan's `Status:` or other plans; never commits. A mechanical failure is proposed as a guard (`sdd.sh`, selftest, agent template), not a reminder (idea 07 Opt4). Lessons worth an `INSIGHTS.md` entry are listed as *insight candidates* for `engineering-insights`.
- **§2 Inputs and budget:** ~30k tokens; output ≤ ~10k characters. Read the plan only by section — `sed -n '/^## <heading>/,/^## /p' <plan>` for *Decisions recorded*, *Step groups*, *Follow-ups*, *Verification log*, plus its first 6 lines; `ls docs/plans/assets/<plan basename>/` and at most the first 40 lines of each report there. Never the whole plan, the spec body, code or transcripts.
- **§3 Procedure:** (1) `S usage-scan`; (2) `S flags <plan>`; (3) `S cost <plan>` — quote all three verbatim, no own arithmetic; (4) read the sections; (5) a fact known only from the conversation is first logged with `S log <plan> "<fact>"`, then cited; (6) path `docs/plans/assets/<plan basename>/workflow-retro.md` — if it exists, AskUserQuestion: overwrite or stop (assumption); (7) write the file from §4; (8) each `P<n>`: `S follow-up <plan> "retro P<n>: <change> — <where>"`; (9) `S log <plan> "retro: <path>"`; (10) reply with the path, the `P<n>` ids and the insight candidates. `S` = `bash .claude/skills/sdd/scripts/sdd.sh`.
- **§4 Output template** (in a `~~~md` fence; the comments are part of it):

```md
# Plan NN — workflow retro (<title>)

Date: <YYYY-MM-DD> · Execution: <mode> · Sources: <plan path>, `sdd.sh usage-scan` / `flags` / `cost` (run <date>), <asset reports read>
<!-- cite: every claim ends with its source — a Verification-log date and prefix, a `path:line`, or an `sdd.sh` output line; no source, no claim -->
<!-- n/a: a metric or count that cannot be sourced from the `sdd.sh` outputs or a cited line is written `n/a`, never estimated, rounded from memory or inferred -->

## 1. What happened
| Phase | Rounds | Outcome |
|---|---|---|
<!-- cap: at most 8 rows; counts come from `agent:`, `review iteration`, `plan approved` log lines -->

## 2. Cost
<`sdd.sh cost` output, verbatim> · <`flag:` / `repeat:` lines of `sdd.sh flags`, verbatim>
<!-- cap: no figure that is not in those outputs; main-session tokens are not included — say so -->

## 3. What worked
<!-- cap: at most 5 bullets -->

## 4. What did not work
<!-- cap: at most 6 numbered items, largest loss first; each names its cost (rounds or stage share) -->
<!-- check: walk all four before writing, each with evidence or "none found": duplicated context (the same plan, spec or files re-read by several agents or resumes; `cost` cache hit and a resumed agent's stage share) · rework and clarifying round-trips (re-approvals, `review iteration`, `fix-loop`, correction rounds, post-`done` reopenings) · scope drift (steps, groups or ACs added after approval) · failure taxonomy (tag every item mechanical / judgement / environment / spec gap) -->
<!-- check: the `unattributed` line of `sdd.sh cost` above 0 is itself an item (unlogged agents) -->
| Checklist | Finding | Source |
|---|---|---|
| duplicated context | <finding or "none found"> | <cite> |
| rework / round-trips | … | … |
| scope drift | … | … |
| failure taxonomy | <counts per tag> | … |

## 5. Proposed corrections
| # | Change | Where | Expected effect | Targets |
|---|---|---|---|---|
<!-- cap: at most 9 rows P1…; Where = an existing file or "new plan"; Targets = item numbers of section 4; a mechanical failure gets a guard; every row is also filed with `sdd.sh follow-up` -->

## 6. Open items
<!-- cap: at most 6 bullets — `repeat:` lines, unfiled follow-ups, insight candidates for engineering-insights (never written here) -->
```

### Shared weights (S2)
`flags.mjs` is a script with top-level side effects, so `cost.mjs` cannot import it; the weights move to `usage-weights.mjs` (assumption: a technical choice inside D2 = A). The existing flags F1 weighted case (`selftest.sh:460`) and the before/after diff on plan 28 guard against a behaviour change.

### Pass 1 review (resolved)
TQ1–TQ3, GAP1–GAP4, REC1–REC6 and D1–D5 were offered in pass 1 (D1 writer A/B/C · D2 cost source · D3 output + log line · D4 `/sdd` wiring A/B/C · D5 mode); the answers are in *Decisions recorded*. Mode re-check against the real steps: 5 steps, one area (`.claude/skills`), no migration, contract or trust boundary → `single-agent`, matching D5.

## Risks & open questions
- AC1 cannot be proven by a script: the template, caps and citation rule are checked by S1's Done-when; the first real `/workflow-retro` run is the acceptance (sign-off item for the verifier).
- The new skill is picked up mid-session by file watching (research, not tested live); fallback `/reload-skills`, then a new session.
- `cost` "runs" counts usage rows; an agent resumed in one stage across two sessions shows as 2 runs.
- `unattributed` is bounded by the plan's sessions **and** the plan's window (assumption, *Design notes → cost contract*): a session can host several plans (session `02848fd1` ran plans 28 and 29), so a null row of another plan inside the window is still counted, and an unlogged agent after the last logged one is missed. Nested agents (`subagents/workflows/`) are skipped by `usage-scan` and never counted.
- Busy and window come from subagent message timestamps only; main-session work and user think-time between agents are not in them, so `window` ≥ `busy` by design and parallelism reads per agent-active time.
- Main-session tokens (including the retro's own cost) are not in `usage-scan` (`cost-report.md:3`); `cost` prints that line.
- `docs/plans/assets/26/` breaks the `<plan basename>` folder rule; old plans keep their folders.
- `S follow-up` on a plan without `## Follow-ups` creates the section (`sdd.sh:108-116`).

## Handed off
- architecture-reviewer: `sdd.sh` keeps growing as the single entry point (now with `cost`); the shared `usage-weights.mjs` boundary between `flags` and `cost`.
- security review: not triggered — `cost.mjs` reads only the gitignored `.sdd/usage.jsonl` (numbers) and validates its plan argument as `flags.mjs` does.

## Insights to record
- None now. Candidate after the first real retro: whether a main-session retro stays within ~30k tokens (root `INSIGHTS.md` · What Works / What Doesn't Work).

## Red-flags check
- [x] Every AC maps to at least one step or test (AC1 S1 · AC2 S2, S3 · AC3 S2, S3 · AC4 S5 · AC5 S1–S4)
- [x] Every spec AC-n has a row in *Spec traceability* — n/a, no spec
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; no open technical choice; no product gap left
- [x] Groups end type-checking (`bash -n`, `node --check`, selftest); no parallel groups
- [x] No group under 3 files / ~80 lines that could merge with a neighbour (one group)
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1 item — n/a (pass 2)
- [x] Execution mode per the rule: `single-agent` (one area, 5 steps)
- [x] Every step's *Skills to apply* is complete (none: shell, `.mjs` and Markdown only)
- [x] `bash .claude/skills/sdd/scripts/sdd.sh plan-lint <plan>` prints `plan-lint: ok`
