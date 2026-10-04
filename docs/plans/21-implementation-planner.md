# Development Plan: rework `planner` into `implementation-planner` — requirements review, no spec-side decisions, chosen execution mode
Status: done
Execution: multi-agent
Save as: docs/plans/21-implementation-planner.md
Spec: none (process/agent tooling)

## Goal & acceptance criteria
Rename the `planner` subagent to `implementation-planner` and change its contract: it plans *how* only, never decides product questions (they go back to `spec-creator` as spec gaps), turns pass 1 into a requirements review with clarifying questions, spec gaps and recommendations, and always has the user pick `multi-agent` or `single-agent` execution (trivial single-pass plans default to `single-agent`). Markdown only.

- AC1: `.claude/agents/implementation-planner.md` exists with `name: implementation-planner`; `.claude/agents/planner.md` no longer exists; git records a rename (D1).
- AC2: with a spec, the plan template has a *Spec traceability* table (one row per spec `AC-n` → steps/tests) and no Goal/AC of its own; `AC1…` only when `Spec: none (<reason>)`. *Decisions needed* is technical only; a missing product decision is returned as a spec gap `GAPn` naming the spec section; the old "plan around it" rule is gone (D2).
- AC3: pass 1 writes a `## Requirements review` with `TQ1…` clarifying questions, `GAP1…` spec gaps, `REC1…` recommendations (each with why), still ends `Steps: pending decisions`; pass 2 refuses to run while a `TQ`/`GAP` is unresolved (D3).
- AC4: every pass-1 draft has an execution-mode row with a rule-based recommendation; the plan header carries `Execution: multi-agent | single-agent`; the implementer accepts `all` (whole plan in one run) only on a `single-agent` plan; `AGENTS.md` makes the one-group-per-run rule mode-dependent (D4).
- AC5: `single pass: <reason>` is allowed only for trivial plans (≤1 package, ≤3 files), writes `Execution: single-agent`; the "every product choice already fixed" trigger is gone everywhere (D5).
- AC6: every live reference names `implementation-planner`; the final `git grep` (S6 Done-when) returns no bare `planner` outside the allowed set (history, the Postgres query planner, this plan).
- AC7: in a fresh session, `implementation-planner` is spawnable and its pass 1 on a sample spec returns a Requirements review and an execution-mode row (T1).

## Decisions needed
None open — see *Decisions recorded*.

### Decisions recorded (user, 2026-10-04: "1 так, 2 так, 3 так, 4а, 5б")
Transcribed from the main session's prompt; the main session owns this section. D1 rename · D2 nothing spec-side · D3 pass 1 = requirements review · D4 execution mode (a) · D5 single pass only when trivial — full text in *Design notes → Decisions D1–D5*; the implementer of S1 and S4–S5 reads that section. Mode rule (D4): any migration, `@devdigest/shared` contract change or trust boundary → `multi-agent`; else ≤1 package and ≤5 steps → `single-agent`; else `multi-agent`; the user may override.

- **Approved** (user, 2026-10-04: "добре", in reply to "Затверджуєш план 21 разом з A1–A8?"): plan and assumptions A1–A8 approved as written.

### Assumptions (stand unless the user objects at approval)
- A1 ids: `TQ1…` technical questions, `GAP1…` spec gaps, `REC1…` recommendations — chosen to avoid `Q1` (brief), `Qn`/`B1`/`SG1` (spec), `R1…R4` (verifier rules), `SP-…`.
- A2 pass-1 size cap raised from ~4,000 to ~6,000 characters (three new lists).
- A3 a `GAP` against an **approved** spec: the main session sets the spec back to `draft`, runs a `spec-creator` correction round on its path (spec-creator only edits drafts — `spec-creator.md:36`), writes the Changelog entry, re-approves; pass 2 then re-reads the spec.
- A4 a plan with no `Execution:` line (plans 01–21) is treated as `multi-agent`.
- A5 in single-agent mode the main session appends the implementer's handoff + `## Skills` table under `## Handoffs → all`.
- A6 without a spec, a missing product decision is still a `GAPn`, naming "request" instead of a spec section; the main session asks the user (or, if it is really a feature, starts `spec-creator`).
- A7 a named group (`G2`) on a `single-agent` plan is allowed (resuming a partial run).
- A8 the mode rule is evaluated in pass 1 from the module set (steps are not known yet) and re-checked in pass 2; a mismatch is listed under *Risks*.

## Prerequisites
- P1 (main session, after approval, before G1): `git mv .claude/agents/planner.md .claude/agents/implementation-planner.md`. The implementer must not do it (`implementer.md:298` forbids rewriting git state).
- P2: stage this plan file after approval (root `INSIGHTS.md` 2026-09-30, R3 provability).

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S3 | agent definitions: `implementation-planner`, `implementer`, `plan-verifier` (Markdown) | P1 | the exact ids/headings (`## Requirements review`, `## Spec traceability`, `TQ1…`, `GAP1…`, `REC1…`, `Execution:`, `## Handoffs → all`, mode-rule wording) — G2 quotes them verbatim |
| G2 | S4–S6 | pipeline docs + rename-only references (Markdown) | G1 | none; then the main session runs T1 after the agent is listed (fresh session if needed) |

Nothing type-checks; each group ends with its Done-when greps passing. Sequential (G2 quotes G1).

## Steps

### S1 — Rewrite the agent definition as `implementation-planner`
- **Files:** `.claude/agents/implementation-planner.md` (modify — renamed by P1)
- **Change:**
  1. Frontmatter: `name: implementation-planner`; `description` trigger-first: plans *how* for an approved spec (or a `no spec: <reason>` request); pass 1 is a requirements review (clarifying questions, spec gaps, recommendations, execution-mode question) in a decisions-only draft; pass 2 the full plan; never decides product questions — returns them as spec gaps; writes only its plan file and index row. Keep the existing "Use proactively …" trigger sentence. Other keys unchanged.
  2. Title `# Implementation planner`; intro: "You decide *how*; the spec decides *what* and *why*. You never fill a product gap yourself."
  3. *Step 0* (`:36-78`): replace the paragraph at `:56-59` ("A missing product decision … plan around it …") with: a missing product decision is never planned around and never a *Decisions needed* row — it is a `GAPn` in pass 1 naming the spec section (A6 without a spec). Keep the other stop bullets and *Clarification needed* (used only when nothing is plannable).
  4. *Two passes* (`:80-132`): pass 1 runs for every non-trivial plan; `single pass: <reason>` only when trivial (≤1 package, ≤3 files) → full template, header `Execution: single-agent`, no mode row. New pass-1 template (rules as HTML comments **inside** the fence): header lines; `## Spec traceability` (spec plans: one row per `AC-n`, *Covered by* `pending` in pass 1) **or** `## Goal & acceptance criteria` (only `Spec: none`); `## Requirements review` with `### Clarifying questions` (`TQn`, technical, each with a default), `### Spec gaps` (`GAPn`: missing product decision, contradiction with a repo constraint, infeasible or ambiguous requirement — names the spec section, goes to `spec-creator`, never decided here), `### Recommendations` (`RECn`: better approach / smaller scope / lower risk / reuse of existing code, each with why and `→ decision Dn` (technical) or `→ GAPn` (user-visible)); `## Decisions needed` (technical only; last row always `Execution mode | multi-agent · single-agent | <rule result> — <why>`); `## Risks & open questions`; `Steps: pending decisions`; size comment `≤ ~6,000 characters` (A2). Mode rule text = D4 verbatim order (multi-agent triggers first). Pass-1 return: path, Requirements review ids, Decisions table, research questions.
  5. Pass 2: before writing, every `TQn` answered and every `GAPn` closed in *Decisions recorded* (A3: spec re-approved), else stop with *Clarification needed* listing the open ids; re-read the spec if a `GAP` changed it; fill *Spec traceability* *Covered by* with step/test ids; re-check the mode rule against the real steps (A8). Return unchanged otherwise.
  6. *Method* item 7 (`:192-197`): product choice → `GAPn`, technical choice → *Decisions needed*. Method 1.5: plan maps spec `AC-n` (no own ACs).
  7. Full template (`:250-339`): header adds `Execution: <multi-agent | single-agent>` with comment "written by the main session from the execution-mode decision; single pass writes `single-agent`"; `## Goal & acceptance criteria` → the same either/or as pass 1; *Decisions needed* comment "technical only". Red-flags: replace `:331` with `Every assumption is marked; technical choices are in *Decisions needed*, product gaps are GAPn`; change the spec line to `Every spec AC-n has a row in *Spec traceability* with a step or test`; add `Execution mode recommended per the D4 rule (or single pass: single-agent)`; pass-1 line → `~6,000 characters`.
  8. *Corrections* and *Hard rules*: wording "this planner" → "you"; add hard rule "Never decide a product question — return it as a `GAPn`."
- **Layer / why here:** project subagents live in `.claude/agents/<name>.md`.
- **Skills to apply:** none
- **Practices:** rules inside the fenced templates; every grep-target literal unbroken on one line, in backticks; limits inclusive; ids/headings in English; no other behaviour change (Method reads, budget, repo constraints, Bash allowlist stay).
- **Known gotchas:** root `INSIGHTS.md` "2026-09-27 — in an agent prompt, the output template beats the prose rules" · "2026-09-28 — a Done-when `grep` for a phrase fails when Markdown wraps…" (+ 2026-10-04 extension: no count thresholds).
- **Done when:** `test ! -e .claude/agents/planner.md && echo ok` prints `ok` · `sed -n 1,12p .claude/agents/implementation-planner.md` shows `name: implementation-planner` · `for t in '## Requirements review' '### Spec gaps' '### Recommendations' '### Clarifying questions' '## Spec traceability' 'TQ1' 'GAP1' 'REC1' 'Execution:' 'multi-agent' 'single-agent' 'Steps: pending decisions' '~6,000'; do grep -qF -- "$t" .claude/agents/implementation-planner.md || echo "MISSING $t"; done` prints nothing · `grep -nE 'plan around it|every product choice' .claude/agents/implementation-planner.md` empty · `grep -nE '(^|[^-[:alnum:]_])[Pp]lanner' .claude/agents/implementation-planner.md` empty.

### S2 — Implementer: whole-plan run in single-agent mode
- **Files:** `.claude/agents/implementer.md` (modify)
- **Change:** (1) `description` (`:3`): "one step group per run, or the whole plan in one run when the plan says `Execution: single-agent`"; "pass the plan path and the group (G1, G2, …) or `all`". (2) *Plan mode* (`:35-40`): `all` executes every group in table order, running each group's end checks before the next, one report (`Mode: plan (group all)`), *Handoff to the next group* "None."; missing `Execution:` line = `multi-agent` (A4); a named group on a single-agent plan is fine (A7). (3) Stop list (`:53-71`): new bullet — `all` requested but the plan header is not `Execution: single-agent`. (4) Method 6 (`:116-117`) and hard rule (`:310`): "One group per run in `multi-agent` mode; in `single-agent` mode the whole plan, group by group." (5) `planner` → `implementation-planner` at `:16`, `:48`, `:56`, `:141`.
- **Layer / why here:** D4 — the implementer must accept a whole-plan run.
- **Skills to apply:** none
- **Practices:** anchored edits only; Verification table, fix mode and *Keep the run small* unchanged; literals in backticks.
- **Known gotchas:** root `INSIGHTS.md` 2026-09-28 (grep-safe literals).
- **Done when:** `for t in 'Execution: single-agent' 'group all' 'multi-agent' 'implementation-planner'; do grep -qF -- "$t" .claude/agents/implementer.md || echo "MISSING $t"; done` prints nothing · `grep -nE '(^|[^-[:alnum:]_])planner' .claude/agents/implementer.md` empty.

### S3 — Plan-verifier: new name, `Execution:` line
- **Files:** `.claude/agents/plan-verifier.md` (modify)
- **Change:** (1) `:38-39`: "(`implementation-planner` format: `AC1…n` for no-spec plans or a *Spec traceability* table for spec plans, an `Execution:` line, *Decisions needed*, …)". (2) V1 Skills source (`:52-55` and the `SK` item `:108-111`): `## Handoffs → G<n>` or, for a `single-agent` plan, `## Handoffs → all` (A5). (3) R3 (`:178`): "changed only in its `Status:` line, its `Execution:` line and its *Decisions needed* answers". (4) template `**Plan:**` line (`:230`): append ` · **Execution:** <multi-agent | single-agent | not stated>`. No other logic change.
- **Layer / why here:** D1 rename + D4 header line; the rest of the verifier is out of scope.
- **Skills to apply:** none
- **Practices:** `SP-AC-n` wording untouched; anchored edits.
- **Known gotchas:** root `INSIGHTS.md` 2026-09-28.
- **Done when:** `for t in 'implementation-planner' 'Handoffs → all' '**Execution:**' 'Spec traceability'; do grep -qF -- "$t" .claude/agents/plan-verifier.md || echo "MISSING $t"; done` prints nothing · `grep -n 'R3' .claude/agents/plan-verifier.md` shows `Execution:` on the R3 row · `grep -nE '(^|[^-[:alnum:]_])planner' .claude/agents/plan-verifier.md` empty.

### S4 — Agents README: rename, pass 1, execution mode
- **Files:** `.claude/agents/README.md` (modify)
- **Change:** rows `:14-15` (name/link `implementation-planner.md`; implementer "one group per run, or the whole plan when `single-agent`"); *What enforces the limits* `:29-38`; mermaid `:55-92` — node ids `ip`/`ip2` with labels `implementation-planner` / `implementation-planner pass 2` (no hyphen in ids), `pass1` label "pass 1: requirements review + decisions-only draft", new edge `pass1 -. GAPn .-> sc`, `implementer -- multi-agent: next step group --> implementer`, `implementer -. single-agent .-> PV`; hops 0–3 (`:101`, `:108`, `:111-131`): pass 1 = requirements review, `single pass` trivial only (D5), `GAPn` → `spec-creator` (A3), mode recorded as `Execution:`, implementer per mode; status table `:162`; inputs/outputs `:177-178` (pass 1 content; implementer input `all`); budgets `:215`; shared ids `:233-235` + new row `` `TQ1…` questions · `GAP1…` spec gaps · `REC1…` recommendations | implementation-planner pass 1 | user, main session (`GAP` → spec-creator) ``, `AC1…` row "plan (no-spec plans only)", `G1…` row "one group per run (multi-agent) or `all` (single-agent)"; skills `:246`, `:254`; headings `:295`, `:319` → `implementation-planner and implementer: …`; repo-sources table: new row "Requirements review, spec gaps, execution mode | `docs/plans/21-implementation-planner.md` D1–D5".
- **Layer / why here:** the README is the map of the set; it changes with the agents.
- **Skills to apply:** none
- **Practices:** mermaid ≤ ~20 changed nodes, ids without hyphens; no other agent's row reworded beyond rename/mode.
- **Known gotchas:** root `INSIGHTS.md` 2026-09-25 + correction (no spawning in this step) · 2026-09-28.
- **Done when:** `for t in 'implementation-planner.md' 'TQ1' 'GAP1' 'REC1' 'Execution:' 'single-agent' 'multi-agent' 'Handoffs → all'; do grep -qF -- "$t" .claude/agents/README.md || echo "MISSING $t"; done` prints nothing · `grep -nE '(^|[^-[:alnum:]_])[Pp]lanner|fixes every choice' .claude/agents/README.md` empty.

### S5 — Root `AGENTS.md` and `docs/plans/README.md`
- **Files:** `AGENTS.md`, `docs/plans/README.md` (modify)
- **Change:** `AGENTS.md` *Plan → implement → verify*: `:75`, `:80` rename; bullet `:90-101` rewritten — pass 1 is a requirements review (`TQn`, `GAPn`, `RECn`, execution-mode row) in the decisions-only draft; `single pass: <reason>` only when trivial (≤1 package, ≤3 files) → `Execution: single-agent`; `GAPn` and user-visible `RECn` go to `spec-creator` before pass 2 (A3, Changelog by the main session); the main session records `Execution:` in the header. Bullet `:107-113`: mode-dependent — `multi-agent`: one group per run (`G1`, `G2`, …), test-writer, reviewers per their rules; `single-agent`: one run with `all`, then plan-verifier, reviewers on their own triggers; full `.it` run once in both. Handoffs bullet: `## Handoffs → all` for single-agent. Edit `AGENTS.md`, never `CLAUDE.md`. `docs/plans/README.md`: `:5`, `:17`, `:41`, `:47`, `:52`, `:67` rename; lifecycle block `:33-37` adds `Execution: <multi-agent | single-agent>`; `:60-64` mode-dependent; new short paragraph **Execution mode** (D4 meaning + rule + who records it, missing line = multi-agent, A4).
- **Layer / why here:** `AGENTS.md` loads every session; the plans README holds the lifecycle.
- **Skills to apply:** none
- **Practices:** edit bullets in place, no rewrite of other bullets; literals unbroken.
- **Known gotchas:** `CLAUDE.md` *Do not touch* → `*/CLAUDE.md` is a symlink · root `INSIGHTS.md` 2026-09-28.
- **Done when:** `for f in AGENTS.md docs/plans/README.md; do for t in 'implementation-planner' 'single-agent' 'multi-agent' 'Execution:'; do grep -qF -- "$t" "$f" || echo "MISSING $t in $f"; done; done` prints nothing · `for t in 'GAPn' 'Handoffs → all'; do grep -qF -- "$t" AGENTS.md || echo "MISSING $t"; done` prints nothing · `grep -n 'every product choice' AGENTS.md` empty · `test -L CLAUDE.md && echo ok` prints `ok`.

### S6 — Rename-only references, then the repo-wide check
- **Files:** `docs/ideas/README.md` (`:11`, `:15`), `specs/README.md` (`:13`), `docs/precision/README.md` (`:9`), `.claude/agents/architecture-reviewer.md` (`:57`), `.claude/agents/brainstormer.md` (`:3` if present, `:21`, `:53`, `:200`), `.claude/agents/spec-creator.md` (`:3`, `:16`), `.claude/skills/engineering-insights/entry-quality.md` (`:60`) (modify)
- **Change:** `planner` → `implementation-planner` (backticked where the original was); no other wording.
- **Layer / why here:** D1 — live references only.
- **Skills to apply:** none
- **Practices:** rename only; spec-creator's behaviour untouched (out of scope).
- **Known gotchas:** root `INSIGHTS.md` 2026-09-27 (`rg` is a shell function — use `git grep`).
- **Done when:** `git grep -nIiE '(^|[^-[:alnum:]_])planner' -- ':!server/clones/**' ':!docs/plans/0*' ':!docs/plans/1*' ':!docs/plans/20-*' ':!docs/plans/21-*' ':!INSIGHTS.md' ':!*/INSIGHTS.md' ':!docs/ideas/0*' ':!.claude/skills/postgresql-table-design/SKILL.md' ':!server/src/modules/conventions/repository.ts'` prints nothing · `git diff --stat -- docs/plans/0* docs/plans/1* docs/plans/20-* INSIGHTS.md '*/INSIGHTS.md'` empty.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| T1 — manual smoke: in a session where `implementation-planner` is listed (wait for the "new agent types" notice; else a fresh session), run pass 1 on `specs/003-skills.md` (legacy `status: active`) | manual | AC7: spawnable under the new name; the draft has `## Requirements review` and an execution-mode row; `git status --porcelain` shows only the new `docs/plans/22-…` file + one index row — the main session then removes both | S1 |
| T2 — manual: spawn with `specs/004-conventions-extractor.md` (`draft`) — expect a stop naming the status, no file written | manual | Step 0 kept | S1 |
| T3 — the main session re-runs every Done-when once after G2 | manual | AC1–AC6 | S1–S6 |

## Migrations & contracts
None.

## Out of scope
- O1: `spec-creator` behaviour (only its two references are renamed).
- O2: plan-verifier logic beyond the rename, the `Execution:` line, `## Handoffs → all` and R3.
- O3: any code package; `CLAUDE.md`; `INSIGHTS.md` / `insights/gotchas.md`; `docs/plans/01–20`; `docs/ideas/0*`.
- O4: the Postgres "query planner" wording (`postgresql-table-design/SKILL.md:91`, `conventions/repository.ts:209`).
- O5: adding an `Execution:` line to old plans (A4 covers them).

<!-- implementer-brief:end -->

## Context applied
- root `INSIGHTS.md` → "2026-09-27 — in an agent prompt, the output template beats the prose rules" — S1 puts every new rule inside the fence.
- root `INSIGHTS.md` → "2026-09-28 — a Done-when `grep` for a phrase fails when Markdown wraps…" + 2026-10-04 extension — token loops, no `grep -c` thresholds.
- root `INSIGHTS.md` → "2026-09-25 — a new `.claude/agents/*.md` can't be spawned…" + "correction: new agents do show up mid-session" — T1 waits for the notice or uses a fresh session.
- root `INSIGHTS.md` → "2026-09-27 — `rg` edge checks catch comments and prose…" — S6 uses `git grep`, and the allowed set excludes prose history.
- root `INSIGHTS.md` → "2026-09-29 — a skill listed on a step where it has nothing to do…" — no step lists a skill.
- root `INSIGHTS.md` → "2026-09-30 — an untracked plan file makes R3… unprovable" — P2.
- root `INSIGHTS.md` → "2026-10-04 — an implementer hand-back can be the single word "placeholder"…" — see Risks.
- `docs/plans/20-spec-creator-agent.md` — precedent shape (agent step, README step, AGENTS step, smoke test in a fresh session).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | — | S6 renames one word in its `entry-quality.md`; no skill rule governs that |
| `onion-architecture` | preload | — | no package code touched |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| repo config | `.claude/agents/implementation-planner.md` (from `planner.md`) | agent | renamed + changed |
| repo config | `.claude/agents/{implementer,plan-verifier,README,architecture-reviewer,brainstormer,spec-creator}.md` | agent | changed |
| repo config | `.claude/skills/engineering-insights/entry-quality.md` | skill doc | changed (one word) |
| repo docs | `AGENTS.md`, `docs/plans/README.md`, `docs/ideas/README.md`, `specs/README.md`, `docs/precision/README.md` | docs | changed |

## Design notes

### Decisions D1–D5 (user, 2026-10-04)
- **D1 Rename:** file `.claude/agents/implementation-planner.md`, `name: implementation-planner`, via `git mv`. Every live reference updated; history (`docs/plans/01–20`, `INSIGHTS.md` entries, `docs/ideas/0*`) untouched; the Postgres "query planner" in `.claude/skills/postgresql-table-design/SKILL.md:91` (and the same sense in `server/src/modules/conventions/repository.ts:209`) stays.
- **D2 Nothing spec-side:** with a spec, no own Goal/AC — map each spec `AC-n` to steps (plan-verifier's `SP-AC-n` stay). Without a spec, own `AC1…` as today. *Decisions needed* = technical only (layer, library, migration strategy, step grouping, execution mode). A missing product decision (default, error behaviour, which model, UX) is never decided by the implementation-planner: returned as a *Spec gap* naming the spec section; the main session takes it to `spec-creator` (Changelog entry once the spec has left draft).
- **D3 Pass 1 = Requirements review:** checks the spec (or no-spec request) against code and repo constraints; returns (a) technical clarifying questions, (b) spec gaps (contradictions with repo constraints, infeasible or ambiguous requirements), (c) recommendations (better approach, smaller scope, lower risk, reuse), each with why. A recommendation that changes user-visible behaviour goes via `spec-creator`; a technical one becomes a decision row. Pass 1 still writes the decisions-only draft + index row; pass 2 mechanics unchanged.
- **D4 Execution mode (a):** `multi-agent` = current pipeline (one implementer run per group, test-writer, reviewers as their rules require, plan-verifier); `single-agent` = one implementer run over all groups, then plan-verifier (reviewers still run on their own triggers, e.g. security-reviewer on a trust boundary). Step groups stay in both. Recommendation rule as in *Decisions recorded*; user may override. Asked as a pass-1 *Decisions needed* row; the main session records `Execution: …` as a header line.
- **D5:** `single pass: <reason>` only for trivial plans (≤1 package, ≤3 files): no pass 1, no mode question, `Execution: single-agent`. The old trigger "every product choice already fixed" goes; a non-trivial plan always gets pass 1.

- Why `-E '(^|[^-[:alnum:]_])planner'` and not `-w`: `-w planner` also matches `implementation-planner` (a hyphen is a non-word character), so it cannot tell the new name from a leftover. The pattern also catches `planner2`, `planner's`, `Planner`.
- Mode rule order: the multi-agent triggers win over size because a migration, contract mirror or trust boundary is exactly where the per-group fresh context, test-writer and reviewers earn their cost.

## Risks & open questions
- Rename hazard: after P1, the old name may stay listed and the new one may not be spawnable until the harness re-reads agents (root INSIGHTS 2026-09-25 + correction). A plan-change round on *this* plan after P1 must use `implementation-planner` once listed, or a fresh session.
- Single-agent runs of up to 5 steps over 1–2 groups should fit the implementer's `maxTurns: 100`; a 100-tool-use run happened on six Markdown edits in plan 05 (root INSIGHTS 2026-09-28). If a single-agent run hits the cap, the main session resumes with the next group name (A7).
- The "≤1 package" count is unclear for tooling plans (`.claude/agents` + repo docs); the implementation-planner states what it counted in the mode row.
- An implementer hand-back may arrive without a step table (root INSIGHTS 2026-10-04): the main session checks `git diff` and re-runs Done-when before logging G1/G2.
- T1 writes a real draft (`docs/plans/22-…`) and index row; the main session must delete them afterwards so `22` stays free.
- Doc vs code: none found.

## Handed off
- architecture-reviewer: not needed (no code).
- security review: not needed (no trust boundary).

## Insights to record
- root `INSIGHTS.md` · Tool & Library Notes — `grep -w name` matches `prefix-name` too, so a rename check for an agent whose new name ends in the old one needs `(^|[^-[:alnum:]_])name` (S6 Done-when) — only if T3 confirms it.

## Red-flags check
- [x] Every AC maps to at least one step or test (AC1 S1/P1 · AC2 S1 · AC3 S1 · AC4 S1–S5 · AC5 S1/S4/S5 · AC6 S6 · AC7 T1)
- [x] Every spec AC-n maps to a plan AC or step — Spec: none (process/agent tooling)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; the renamed file comes from P1
- [x] Every assumption is marked (A1–A8); no product choice left open
- [x] Groups end with their greps passing; G1 and G2 are sequential
- [x] No group under 3 files / ~80 lines
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1: n/a (single pass by the main session's instruction)
- [x] Every step's *Skills to apply* is complete (`none` — Markdown only)

## Handoffs → G2

From the G1 implementer (2026-10-04); main session spot-checked S1–S3 Done-when (old file gone, literals present, no bare `planner`, `group all` gated on `Execution: single-agent`). The renamed agent is listed in this session as `implementation-planner`.

- **Names:** agent `implementation-planner`; file title `# Implementation-planner` (hyphenated, so the bare-`planner` grep stays empty — write "implementation-planner" with the hyphen everywhere, never "Implementation planner").
- **Pass-1 headings:** `## Spec traceability` (columns `Spec AC | Covered by`, `pending` in pass 1) or `## Goal & acceptance criteria` (only for `Spec: none`); then `## Requirements review` with `### Clarifying questions` (`TQ1…`, each with a default), `### Spec gaps` (`GAP1…`, naming the spec section or "request"), `### Recommendations` (`REC1…`, each ending `→ decision Dn` or `→ GAPn`); then `## Decisions needed` (technical only), `## Risks & open questions`, `Steps: pending decisions`, `<!-- pass 1: ≤ ~6,000 characters -->`.
- **Execution-mode row:** last *Decisions needed* row `Execution mode | multi-agent · single-agent | <rule result> — <why>`; the planner states what it counted.
- **Mode rule (order):** any migration, `@devdigest/shared` contract change or trust boundary → `multi-agent`; else ≤1 package and ≤5 steps → `single-agent`; else `multi-agent`; user may override.
- **Header line:** `Execution: <multi-agent | single-agent>`, written by the main session. `single pass: <reason>` only for a trivial plan (≤1 package, ≤3 files), writes `Execution: single-agent`.
- **Pass 2:** stops with *Clarification needed* while a `TQn` is unanswered or a `GAPn` unclosed (a gap against an approved spec closes only after `spec-creator` edits it and the spec is re-approved); fills *Spec traceability*; re-checks the mode against the real steps.
- **Implementer:** accepts `all` only on `Execution: single-agent`, reported as `Mode: plan (group all)`; no `Execution:` line = `multi-agent`; a named group on a single-agent plan is fine; single-agent handoffs go under `## Handoffs → all`.
- **Plan-verifier:** reads skills from `## Handoffs → all` on single-agent plans; R3 allows changes to the `Execution:` line; report `**Plan:**` line gained `· **Execution:** <multi-agent | single-agent | not stated>`.

### Skills (G1)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | none | No insight written |
| `onion-architecture` | preload | none | Markdown-only steps; the plan says `none` for all three |

## Handoffs → after G2 (last group)

From the G2 implementer (2026-10-04). Trivial deviations: S4 also renamed `README.md:185` (brainstormer row, not in the line list); the mermaid `ip[implementation-planner]` label sits on its edge line; S6 renamed every bare `planner` in each listed file by regex (main session read the diff: all are agent references).

### Skills (G2)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | none | One-word rename in its `entry-quality.md` only |
| `onion-architecture` | preload | none | Markdown-only steps |

## Verification log
- 2026-10-04 main session, T3: every Done-when of S1–S6 re-run — all pass; S6 repo-wide `git grep` empty (rc=1); history (plans 01–20, INSIGHTS) unchanged in index and tree; `CLAUDE.md` still a symlink. No `.it` suite: no package code touched.
- 2026-10-04 T2 (this session; agent listed under the new name): pass 1 on draft `specs/004-conventions-extractor.md` stopped at Step 0 with *Clarification needed* — spec not approved, legacy format without `AC-n` — and wrote no file and no index row.
- 2026-10-04 T1 (this session): pass 1 on `specs/003-skills.md` (legacy `status: active`) wrote `docs/plans/22-skills-remaining-work.md` (`Status: draft`, ~4,200 chars, ends `Steps: pending decisions`) + index row `draft (decisions)`; summary had `TQ1–2`, `GAP1–2` (naming spec sections), `REC1–2` (each → Dn/GAPn), technical-only *Decisions needed* with the execution-mode row last (single-agent, counts stated). Only those two paths changed. Both removed afterwards as the plan says (a copy kept in the session scratchpad); `git status` back to the pre-T1 snapshot.
- 2026-10-04 plan-verifier (full): incomplete — 56/62 met; gap S4-change (`.claude/agents/README.md:189` implementer input row lacks `all`); needs sign-off T1/T2/AC7, R3, R4. Handoff: the mermaid `single-agent` edge skipped the full `.it` node although `AGENTS.md` runs it in both modes.
- 2026-10-04 main-session fix: S4-change — `.claude/agents/README.md:189` now reads "the step group to run, or `all` on an `Execution: single-agent` plan"; same file, mermaid edge `implementer -. single-agent .-> it` (was `-> PV`) so both modes pass the full `.it` node. 2 lines, S4's Files; S4 Done-when re-run: pass.
- 2026-10-04 plan-verifier delta: complete — needs sign-off (57/62; T1/T2/AC7, R3, R4 not-verifiable). User accepted all ("приймаю"). Plan → done; `Execution: multi-agent` added to the header (G1 and G2 ran as separate implementer runs). The T1 draft 22 stays deleted (copy in the session scratchpad).
