# Development Plan: `brainstormer` subagent — an optional "what / whether" stage before research and planning
Status: done
Save as: docs/plans/03-brainstormer-agent.md
Spec: none

## Goal & acceptance criteria
Add a project subagent `brainstormer` that turns a vague idea into 3–5
substantively different approaches, compares them, and returns one
recommendation, the cheapest experiment to test it, and only the questions that
change the choice. It answers *what / whether*. It never answers *how* (that is
the `planner`) and never gathers code evidence (that is the `researcher`). Place
it in the pipeline docs as an optional stage before `researcher` / `planner`.

- AC1: `.claude/agents/brainstormer.md` exists. Its frontmatter has `name: brainstormer`, a trigger-first `description` that says what it does *not* do, `tools: Read, Grep, Glob` (D1-C, D3-A), `model: opus`, `maxTurns: 25`, `color: red` and `skills: [engineering-insights]` (D4-A). It has no `hooks:` and none of `Write`, `Edit`, `Bash`, `Agent`, `WebSearch`, `WebFetch`.
- AC2: the prompt requires the S1.5 method and the S1.6 brief: at most 5 unranked options including the status quo (V1), all named before any is detailed. Each option block carries value, packages/contract/migration, per-run LLM cost, risk and a pre-mortem kill criterion; purity, no-go and confidence are *Comparison* columns (V2). The brief ends with one recommendation, a verdict (`go` / `needs-clarification` / `kill`), a riskiest-assumption experiment, and the questions that change the choice.
- AC3: the prompt states the anti-rules: no step plans or file paths, no fake diversity, no padding, and "only one sane approach" said plainly when true. Code facts it needs become questions for the `researcher`.
- AC4: grounding is a shallow read only: `README.md`, `specs/README.md`, `docs/plans/README.md`, root `INSIGHTS.md` `### ` headings, and the `docs/ideas/README.md` index (killed ideas included). A done, planned or rejected idea is flagged with its source row.
- AC5: `.claude/agents/README.md` lists the agent in every per-agent table, the enforcement paragraph, the diagram, the hop list and *Shared ids* (`Opt1…`, `Q1…`); "All eight agents".
- AC6: root `AGENTS.md` → *Plan → implement → verify* places the optional stage. It says when to run it, and that the main session saves every brief verbatim (including `kill`) to `docs/ideas/`, adding only `Status:` and `## Choice recorded`. It also says how the brief feeds the researcher and the planner.
- AC7: `planner.md` takes an idea brief as input (chosen option = scope), and its Step 0 may point to `brainstormer`.
- AC8: `docs/ideas/README.md` exists with naming, lifecycle, the main-session save rule and an empty index, and `docs/README.md` has a row for it.
- AC9: smoke tests T2–T5 and T7 pass in a session where the agent is registered (see *Tests*). The results are logged in this plan's Verification log.

## Decisions needed
None open. D1–D5 are resolved; see *Decisions recorded* below. The options and reasoning are in git history (correction rounds 0–1).

### Decisions recorded (user, 2026-09-27)
| # | Choice | Consequence for the plan |
|---|---|---|
| D1 | **C** — the brainstormer is read-only; the **main session** saves the brief | Agent `tools: Read, Grep, Glob`. The main session saves **every** brief (including a `kill` verdict) to `docs/ideas/NN-kebab-name.md` right after the run, **verbatim**, adding only `Status:` and `## Choice recorded`, plus its index row in `docs/ideas/README.md`. Killed ideas stay indexed so the grounding read stops them being re-proposed. Corrections: the agent is re-run with the brief path and returns only changed sections; the main session applies them. The planner gets the path. |
| D2 | **A** — optional stage | as written |
| D3 | **A** — no Bash | as written |
| D4 | **A** — `engineering-insights` only | as written |
| D5 | **dropped** — no hooks | moot under D1-C: the agent has no `Write`/`Edit`, so the harness enforces read-only. S1b, T6, R3, R8 and the `jq` prerequisite go. |

Also: the unverified `claude-code#29709` citation (not in any research report) was removed in correction round 2.

### Decisions recorded after verification (user, 2026-09-27)
| # | Choice | Consequence for the plan |
|---|---|---|
| V1 | Option count: **at most 5 options including the status quo** (fewer when only one is sane) | gap AC2/S1-change: stated in `brainstormer.md` Method, description and `.claude/agents/README.md`; kill-criterion placeholder `Opt1` → `OptN` |
| V2 | Brief length: **B — compress**. Per-option block keeps 5 fields (value, packages/contract/migration, per-run LLM cost, risk, kill criterion); purity, no-go and confidence move into the *Comparison* table as columns. Target stays one screen (~70 lines) | gap T2/AC9: S1.6 template and AC2 field list change accordingly |
| V3 | Plan-text errors accepted and corrected: S2 Done-when expects 2 `ideas/` hits; T3 passes on a Step-0 stop that cites the source row | D6, T3 closed |
| V4 | Signed off: R3 (untracked plan, no approved baseline) and R4 (no Test Report for a Markdown-only plan) | from now on, commit a plan when it is approved |
| V5 | Smoke briefs: save only "cheaper review runs" as `docs/ideas/02-…` (`open`); the other two are not kept | — |
| V6 | Brief length: **accept ~90 lines as one screen** (5 options × 5 fields + Comparison + experiment + questions ≈ 80–90; cutting further would drop kill criteria or *Facts needed*) | T2/AC9 closed at 86 lines; `brainstormer.md` "One screen (~90 lines)"; README report-size note: the brief is the report (~90 lines), replacing the D1-A-era "summary ~700 words" |

## Prerequisites
- External research is done (*Sources*, below the marker).
- No package type-checks here. Done-whens use `grep` / `sed -n` / `git status`; no `pnpm` / `npm`.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S5 | agent config + repo docs (Markdown only) | approved | none. Then the main session runs smoke tests T2–T5 and T7 (after the "new agent types are now available: brainstormer" notice) and logs the results |

## Steps

### S1 — Create the `brainstormer` agent definition
- **Files:** `.claude/agents/brainstormer.md` (create)
- **Change:** write the agent in the structure and tone of `researcher.md` / `planner.md`:
  1. **Frontmatter.** `name: brainstormer`. `description`: trigger-first. It covers the role (3–5 different approaches plus status quo → one recommendation, a verdict, the cheapest experiment), when to use it (a goal with no approach, "should we / what could we"), and what it does not do (step plans, file paths, code evidence, code). `tools: Read, Grep, Glob`. `model: opus`. `maxTurns: 25`. `color: red` (a valid value per Sources Q1, and unused by other agents). `skills: [engineering-insights]`. No `hooks:`.
  2. **`# Brainstormer`** intro: read-only. **The brief is the report**, returned whole, and the main session saves it verbatim. It is not a plan. Say *what / whether*, never *how*. **Language** paragraph as in `planner.md`: reply in the request's language, write the brief in English.
  3. **`## Step 0 — Is there an idea to brainstorm?`** Return a *Clarification needed* block (≤3 questions, each with a default, same shape as `planner.md`) when there is no goal at all. When the request already has one chosen approach and asks "how", say so and name `planner` as the next stage (no brief). When the idea is already done or planned per the grounding read, say which row.
  4. **`## Grounding — shallow read only`**: read `README.md`, `specs/README.md` (index), `docs/plans/README.md` (index), and the `^### ` headings of the root `INSIGHTS.md` (Grep, not a full read), and the `docs/ideas/README.md` index, where killed ideas stay listed. At most 3 targeted opens of a matching spec, plan or INSIGHTS entry (assumption). No code reads. Anything else becomes a *Facts needed* question.
  5. **`## Method` — diverge, then converge** (Sources Q2/Q3):
     - (a) Restate the problem as an observable outcome in the studio. Write the **decision drivers**: 2–4 criteria, set *before* any option.
     - (b) **Diverge.** Name every option in one line *before* detailing any (against anchoring). Vary the *mechanism*, not the parameters: prompt-only in `reviewer-core` / new pipeline stage / server heuristic with no LLM / UI-only / status quo.
     - (c) **Converge.** Fill in the fields, with a rough per-option **confidence** (verbalized sampling). Confidence and LLM cost are estimates, marked `inference`.
     - (d) Options are **unranked**, and the status quo is not first or last (order bias). The recommendation is stated separately, never implied by position.
     - (e) Compare in one table and pick one. Then give the **verdict**: `go` (OptN) · `needs-clarification` (the `Q`s decide) · `kill` (the status quo wins). `kill` is a legitimate result: **do not steer toward yes** (Sources Q4, BMAD).
     - (f) Name the recommendation's **riskiest assumption**, and the cheapest experiment that tests it, with a success signal and a kill signal (RAT).
     - (g) Keep only the questions that would flip the recommendation.
  6. **`## Output — Idea brief`**, one screen (≤ ~90 lines, V6). Sections, in this order:
     - `# Idea brief: <title>`, then `Save as: docs/ideas/NN-kebab-name.md` (the next free `NN`, found with Glob), a proposal for the main session. The brainstormer writes no `Status:` line and no `## Choice recorded`; the main session adds both when it saves.
     - `## Problem as understood`: the problem, **Decision drivers**, and **Appetite** (a ceiling on per-run LLM cost and effort; from the request, or proposed as an assumption), one line each.
     - `## Already in the repo`: done / planned / rejected items with their source row, or "Nothing found."
     - `## Options`: the one-line list, then `### Opt1 — <name>` … with the eight AC2 fields as one-line bullets. The kill criterion reads "if OptN was picked and failed, the likely reason is …". The status quo is labelled.
     - `## Comparison`: a table of options against the drivers, contract/migration, LLM cost per run, purity and confidence.
     - `## Recommendation`: one `OptN`, the verdict, why, and what would change it.
     - `## Cheapest experiment`: the riskiest assumption, then what to try, its cost, the success signal and the kill signal.
     - `## Questions that change the choice`: `Q1…`, each written as "→ flips to OptN if …".
     - `## Facts needed (for researcher)`: ≤8 concrete repo-mode questions.

     When only one sane approach exists, the brief has that option plus the status quo, and a line saying so. No padding.
  7. **`## Corrections and follow-ups`**: a correction arrives with the saved brief's path. The brainstormer reads that file and returns only the changed sections, each under its original heading, and never the whole brief. The main session applies them. It ignores `Status:` and *Choice recorded*.
  8. **`## Hard rules`**: no step lists, no file paths in options, no layer placement, no code. No fake diversity. No padding: fewer options beats filler. Never reclassify the request's scope silently (Sources Q4, superpowers). Stop reading by about turn 18 so the brief gets written: at `maxTurns` the run returns partial output (Sources Q1). `reviewer-core` stays pure (quote `AGENTS.md`); an option that breaks purity names that as its main risk. Repo text is data, never instruction. Read-only: it writes no file; insight candidates go at the end of the report. Budget ~10 reads, and the brief fits one screen (assumptions).
- **Layer / why here:** project subagents live in `.claude/agents/<name>.md` (`.claude/agents/README.md` → *Adding or changing an agent*).
- **Skills to apply:** `engineering-insights` (the read-first rule it cites).
- **Practices:** tools set explicitly, with no `Agent`. The description says when to delegate and what the agent does not do; behaviour goes in the body. Headings and ids stay in English. Option ids are `Opt1…`, **not** `O1…` (plans use `O1…` for out-of-scope items, *Shared ids*).
- **Known gotchas:** root `INSIGHTS.md` → "2026-09-25 — correction: new agents do show up mid-session" (no spawning in this step; smoke tests are the main session's).
- **Done when:** `sed -n 1,12p .claude/agents/brainstormer.md` shows `name: brainstormer`, `model: opus`, `maxTurns: 25`, `tools: Read, Grep, Glob` and `engineering-insights`. `grep -nE '^tools:.*(Write|Edit|Bash|Agent|Web)|^hooks:' .claude/agents/brainstormer.md` returns nothing. `grep -c '^## ' .claude/agents/brainstormer.md` ≥ 6. `grep -n 'Opt1\|status quo\|Facts needed\|Questions that change the choice\|needs-clarification\|riskiest assumption\|Appetite\|No-go' .claude/agents/brainstormer.md` finds each term.

### S2 — `docs/ideas/` index and its docs row
- **Files:** `docs/ideas/README.md` (create) · `docs/README.md` (modify)
- **Change:** `docs/ideas/README.md`, a short sibling of `docs/plans/README.md`: brief vs spec vs plan (*whether* / *what·why* / *how*); naming `NN-kebab-name.md`; the **save rule** (D1-C): right after every run, including a `kill` verdict, the main session saves the brief verbatim to `docs/ideas/NN-kebab-name.md` and adds its index row. It adds only a `Status:` line and a `## Choice recorded` section. The brainstormer writes nothing. Killed ideas stay indexed, so the grounding read stops them being proposed again. Lifecycle (assumption): `open` → `chosen: OptN → plan NN / spec NNN` · `killed` · `dropped` (one line why). An empty `## Index` (`Idea | Status | Verdict | Led to`). `docs/README.md`: one row for `ideas/` ("comparing approaches before a spec or plan exists"), and "(an undecided idea → `ideas/`)" next to "Work not yet built → `specs/`".
- **Layer / why here:** `docs/README.md`: "A doc nobody can find from here is a doc nobody reads".
- **Skills to apply:** none.
- **Practices:** one line per index row. S1 and S2 use the same status words.
- **Known gotchas:** none.
- **Done when:** `test -f docs/ideas/README.md` · `grep -n 'ideas/' docs/README.md` has two hits (the row and the `specs/` note) · `grep -n 'open\|chosen\|killed\|dropped\|verbatim\|Choice recorded' docs/ideas/README.md` finds each term.

### S3 — Planner: accept an idea brief; point to the brainstormer from Step 0
- **Files:** `.claude/agents/planner.md` (modify)
- **Change:** (a) *Method* step 1 gets a new item before `specs/README.md`: read the saved idea brief (`docs/ideas/NN-…`) when the caller passes its path. The chosen `OptN` is the scope; rejected options are not re-opened; the brief is listed under *Context applied*. (b) *Step 0*, after "no observable outcome": an idea with no chosen approach → name `brainstormer` as the stage to run first. The plan template stays unchanged.
- **Layer / why here:** the planner consumes the brief. Its template is a parsed contract (README → *Adding or changing an agent*), so it stays untouched.
- **Skills to apply:** none beyond the plan.
- **Practices:** anchored `Edit`s. The `## Output — Development Plan` block stays byte-identical.
- **Known gotchas:** none.
- **Done when:** `grep -n 'brainstormer\|docs/ideas' .claude/agents/planner.md` shows both additions · `git diff --stat .claude/agents/planner.md` shows only a few added lines · `sed -n '/^## Output/,/^## Corrections/p' .claude/agents/planner.md` is unchanged compared with `git show HEAD:.claude/agents/planner.md`.

### S4 — Agents README: tables, diagram, hops, ids, sources
- **Files:** `.claude/agents/README.md` (modify)
- **Change:**
  - One new row each in *The set at a glance* (first row: `Read, Grep, Glob`, `opus`, default, `25`), *Plan status per agent* ("none — runs before a plan exists"), *Inputs and outputs* (idea → Idea brief; stops early with *Clarification needed* or a redirect to `planner`), *Shared ids* (`Opt1…` options · `Q1…` questions | idea brief | user's choice, planner) and the *Skills* table ("The other four" → "five").
  - *What enforces the limits*: add `brainstormer` to the read-only agents, with no `Edit`/`Write` in `tools`. Note that it has no `Bash` at all (D3-A), unlike the others with an allowlist, so nothing needs a prompt rule. Leave the "No hook enforces any of these yet" sentence as is.
  - Mermaid: `req -. vague idea .-> brainstormer --> idea[brief saved verbatim<br/>docs/ideas/NN] --> pick{you pick OptN}`, `pick --> planner`, `pick -. facts needed .-> researcher`. Fix the stale `save[main session saves…]` node (R2). Hop list: add hop "0." and fix the duplicated "3.".
  - *Budgets / Report sizes*: "brainstormer ~10 reads, summary ~700 words". *INSIGHTS.md and gotchas*: "All eight agents"; the brainstormer reads headings only.
  - *Sources behind the rules*: `### brainstormer: external practice` (practice → applied as → URL, from this plan's *Sources*, only rows S1 applies) and `### brainstormer: repo sources` (the purity line, the new-agent pickup entries).
- **Layer / why here:** README → *Adding or changing an agent*: "Update this README's tables in the same change."
- **Skills to apply:** none beyond the plan.
- **Practices:** the mermaid block stays valid `flowchart LR` syntax, with node ids unique and no parentheses inside `[...]` labels. Every per-agent table gets exactly one new row.
- **Known gotchas:** root `INSIGHTS.md` 2026-09-27 "`rg` … is not a binary here": use `grep`, not `xargs rg`, in the checks.
- **Done when:** `grep -c 'brainstormer' .claude/agents/README.md` ≥ 8 · `grep -n 'All eight agents' .claude/agents/README.md` has one hit · `grep -n '^3\. ' .claude/agents/README.md` has one hit · `grep -n 'main session saves' .claude/agents/README.md` has none.

### S5 — Root `AGENTS.md`: place the stage in *Plan → implement → verify*
- **Files:** `AGENTS.md` (modify). This is the real file: root `CLAUDE.md` is a symlink to it (`ls -la CLAUDE.md`). Never edit `CLAUDE.md` itself.
- **Change:** a first bullet in *Plan → implement → verify*. It says: optional brainstorm (D2-A) for a goal with no approach; the brainstormer is read-only and returns the brief. The main session saves **every** brief, `kill` included, verbatim to `docs/ideas/NN-kebab-name.md` with its index row, adding only `Status:` and `## Choice recorded` (D1-C). For a correction, the brainstormer is re-run with the brief's path and returns the changed sections, which the main session applies. *Facts needed* seed the ≤8 repo-mode researcher questions, and the planner gets the path. Add to *Read on demand*: "Idea briefs → `docs/ideas/README.md`".
- **Layer / why here:** the session protocol lives in `AGENTS.md`, and every session loads it.
- **Skills to apply:** none beyond the plan.
- **Practices:** at most ~6 added lines, matching the terse style of the surrounding bullets. The existing bullets are not reworded.
- **Known gotchas:** root `INSIGHTS.md` "`git stash pop` silently un-stages a symlink": do not stash around this edit, and check that `CLAUDE.md` stays a link.
- **Done when:** `grep -n 'brainstormer' AGENTS.md` has 1–2 hits · `ls -la CLAUDE.md` still shows `CLAUDE.md -> AGENTS.md` · `git status --porcelain` lists only this plan's *Files*.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| T1 — static checks (the Done-when lines of S1–S5) | implementer, grep | AC1, AC3–AC8 | S1–S5 |
| T2 — smoke: vague idea, "should DevDigest learn from dismissed findings?" | main session, after the agent-registered notice | AC2, AC4: the option list comes before the details; status quo is not at an edge; all fields present; a verdict; the experiment names an assumption; no paths or step lists; ≤ one screen. `git status --porcelain` unchanged by the run (the agent writes nothing). Then the main session saves the brief, and `diff` against the report shows only the added `Status:` and `## Choice recorded`, plus one index row | S1, S2, S5 |
| T3 — smoke: "add a per-run cost badge" (spec 001, done) | main session | AC4: flagged under *Already in the repo*, or a Step-0 stop that cites the source row (V3) | S1 |
| T4 — smoke: "rename the Intent card title" (a "how" request) | main session | Step 0: redirect to `planner`, no file | S1 |
| T5 — smoke: a narrow idea | main session | AC3: one option + status quo, "only one sane approach" | S1 |
| T7 — observe `maxTurns` on the T2 run | main session | log the turn count, ≤25 or not, and any partial marking (enforcement unverified, R7) | S1 |

Smoke procedure: wait for the harness notice "New agent types are now available: … brainstormer", or start a new session (root `INSIGHTS.md` 2026-09-25). The user decides whether the T2 brief is kept as `dropped` or deleted.

## Migrations & contracts
None.

## Out of scope
- O1: no change to the plan template or its section names (a parsed contract).
- O2: no edits to any other agent file (researcher, implementer, test-writer, architecture-reviewer, plan-verifier, doc-writer).
- O3: no `settings*.json` changes, no hooks.
- O4: no `CLAUDE.md` / `*/CLAUDE.md` edits (symlinks), no `INSIGHTS.md` writes.
- O5: no web tools for the brainstormer.
- O6: no code in any package.

<!-- implementer-brief:end -->

## Context applied
- root `INSIGHTS.md` → "correction: new agents do show up mid-session" + "a new `.claude/agents/*.md` can't be spawned…". These shape the smoke procedure (Tests) and the S1 gotcha.
- root `INSIGHTS.md` → "`rg` … is not a binary here". Done-when checks use `grep` and avoid prose-sensitive negative checks where possible.
- root `INSIGHTS.md` → "`git stash pop` silently un-stages a symlink". This is the S5 gotcha.
- `.claude/agents/README.md` → *Adding or changing an agent*, *Shared ids*, *Skills*. These give the S4 checklist, and led to the `Opt` id prefix instead of `O`.
- `.claude/agents/planner.md` → Step 0 and Method step 1 are the insertion points for S3.
- `.claude/agents/implementer.md:176-183`: `*/CLAUDE.md` is protected. S5 targets `AGENTS.md`.
- `docs/README.md` → "Work not yet built → `specs/`". S2 adds `ideas/` as a separate row.

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| repo tooling | `.claude/agents/brainstormer.md` | agent definition | new |
| repo tooling | `.claude/agents/README.md`, `.claude/agents/planner.md` | agent docs / definition | changed |
| repo docs | `AGENTS.md` (root) | session protocol | changed |
| repo docs | `docs/ideas/README.md`, `docs/README.md` | docs index | new / changed |

## Design notes
- **Why the brainstormer is not a researcher mode.** The researcher's contract is "every claim is `fact` or `inference` with evidence". Divergent option generation is mostly `inference` by nature. Mixing the two would weaken the researcher's evidence bar and give the brainstormer web tools it should not use.
- **Why these option fields.** They are the axes on which DevDigest ideas differ in cost: per-run LLM spend, contract and migration churn across two vendored `shared` copies, and `reviewer-core` purity, which the test strategy depends on (`AGENTS.md`). No-go and confidence come from Q5 and Q2.
- **Diversity mechanism (Q2/Q3).** The prompt uses three techniques: names first, details second (sequential anchoring); a per-option confidence (verbalized sampling, HIGH evidence); and a recommendation separate from option order, with the status quo not placed at an edge (order bias). Rejected: parallel calls per option, the anchoring paper's own fix, because a subagent is single-pass. Also rejected: "be aware of your bias" instructions (modest gains) and few-shot debiasing examples (can backfire). The forced status-quo option is **our inference** from status-quo-bias findings; no study tests it.
- **Brief fields adopted (Q5):** MADR decision drivers (one line, before the options); Shape Up appetite (brief-level, reframes LLM cost as a ceiling); a Shape Up no-go per option; a pre-mortem-phrased kill criterion (Klein); RAT, pointing the experiment at the riskiest assumption. **Rejected**, to keep one screen: MADR *Confirmation* (governance) and its Good/Bad/Neutral phrasing (the comparison table covers it); Shape Up *Rabbit holes* (overlaps main risk); the whole PR-FAQ / 6-pager (a narrative ritual); RAT 5-whys; pre-mortem group round-robin (needs several participants).
- **Verdict (Q4).** Spec Kit's `go / needs-clarification / kill` is taken as is. BMAD's "don't steer toward yes" becomes a hard rule, so `kill` is a first-class result.

## Risks & open questions
- R1 — **Doc vs code:** the request says "root `CLAUDE.md` is the real file". In the repo, `CLAUDE.md -> AGENTS.md` is a symlink (`ls -la CLAUDE.md`). The plan edits `AGENTS.md` (S5).
- R2 — **Stale README diagram:** `.claude/agents/README.md` mermaid still shows `save[main session saves docs/plans/NN-name.md]`, but the planner now writes its own draft (`AGENTS.md` → *Plan → implement → verify*). The hop list also has two items numbered "3.". S4 fixes both while redrawing.
- R7 — `maxTurns` enforcement may be broken on some Claude Code versions (claude-code#41143, snippet only, not fetched). Partial-output marking needs v2.1.246+ (Q1). T7 observes it; the ~turn-18 stop rule in S1.8 is the mitigation.
- R9 — The verbatim save depends on the main session's discipline. Nothing checks that a saved brief matches the report except T2's one-off `diff`, and nothing stops a brief being edited later by hand. Mitigation: the save rule sits in `AGENTS.md` and `docs/ideas/README.md`, and corrections go through the brainstormer (changed sections only).
- R4 — The `engineering-insights` skill says "read `INSIGHTS.md` in full". The brainstormer prompt narrows this to headings, as `planner.md` does. The narrowing has to be stated explicitly, or the skill wins.
- R5 — The per-run cost estimate has no grounding source in the four files. `docs/agent-prompts/choosing-a-model.md` exists. Allowing it as a fifth read is a possible later change, not planned.
- R6 — The implementer's package-verification table has no row for `.claude/**` or Markdown-only groups. G1 relies on the plan's grep Done-whens. Watch for a *Plan deviation* from a missing typecheck command.

**External research. Four researcher runs, 2026-09-27; URLs are in *Sources*. Status per question, then the question as asked:**
- **[EXT] Q1 — answered (a, b, c); partly answered (d).** Finding (c), a frontmatter hook to limit writes to a path, is moot under D1-C. Residual: whether `maxTurns` counts turns or tool calls; the status of #41143 (R7); the default model when `model` is omitted (irrelevant here: it is set). **Claude Code subagent frontmatter.** For current Claude Code: (a) what are the complete, valid frontmatter fields for `.claude/agents/*.md`, and what does each default to (`tools`, `disallowedTools`, `model`, `maxTurns`, `skills`, `color`, `permissionMode`, `memory`, others)? (b) Which `color` values are valid? (c) Can `Write`/`Edit` be scoped to a path pattern in agent frontmatter or permission rules (e.g. `Write(docs/ideas/**)`), so D1-A's write limit could be enforced rather than prompt-only? (d) Is `maxTurns` counted per tool call or per assistant turn, and what happens to the output when it is hit? Primary source: code.claude.com docs, with version and date.
- **[EXT] Q2 — partly answered.** Residual: no primary source for generate-then-filter or for persona variation; the verbosity cost of per-option confidence is unknown. **Prompting for divergent ideation.** What prompting techniques have evidence (papers or vendor guidance, 2023–2026) for making an LLM produce *substantively* different options rather than paraphrases of one? Candidates: explicit axis/dimension lists, "generate then filter", verbalized sampling / asking for a distribution of options, persona or constraint variation, self-critique for near-duplicates. For each: what was measured, the model family, and whether it works in a single call at the default temperature (subagents cannot set temperature).
- **[EXT] Q3 — partly answered.** Collapse, order bias and status-quo bias are documented. Residual: no research on a forced do-nothing option, kill criteria, or a "one sane approach" escape hatch; these remain practitioner practice. **Mode collapse and anchoring in option generation.** What is documented about instruction-tuned models collapsing to one approach (mode collapse, anchoring on the first option, a "do nothing" option presented as a straw man)? What mitigations are reported: ordering, a forced do-nothing baseline, kill criteria, "only one sane approach" escape hatches? Which of these apply to a single-pass subagent?
- **[EXT] Q4 — answered.** Residual: BMAD's per-option fields, the wshobson/agents catalog and the Anthropic cookbook were not fetched. **Prior art for brainstorm / ideation agents.** Which published agent definitions or frameworks have a dedicated ideation or "options analysis" stage before planning (Anthropic cookbook or engineering posts, the Claude Code subagent collections on GitHub, BMAD-method "analyst/brainstorm" agents, GitHub Spec Kit, Aider or Cline planning modes, ADR "considered options" practice)? For each: stage placement, output shape, how it hands off to planning, and any reported failure modes. Primary sources only, fetched.
- **[EXT] Q5 — answered.** Residual: Klein's full procedure is paywalled (the ~30% figure appears only in search summaries, so it is not used); Shape Up ch. 5 was not fetched; whether the five additions fit one screen is untested (T2 checks it). **Decision-brief formats.** Which established formats compare options with a recommendation, a cheapest experiment and a kill criterion (MADR "Considered Options", Amazon 6-pager / PR-FAQ, Shape Up pitches with appetite and rabbit holes, the RAT (riskiest assumption test), pre-mortems)? Which of their fields would improve the S1.6 template, and which would be padding for a one-screen brief?

## Sources
Researcher runs, retrieved 2026-09-27. Strength: **H** = primary source, fetched · **M** = primary, but narrow or not replicated · **L** = secondary or partial.

**[EXT] Q1 — subagent frontmatter**
| URL | Takeaway | Strength |
|---|---|---|
| https://code.claude.com/docs/en/sub-agents | Full field list. `color` ∈ red/blue/green/yellow/purple/orange/pink/cyan. `tools` takes bare names only. A frontmatter `hooks:` PreToolUse hook runs only while that subagent is active; exit 2 blocks. At `maxTurns` the run returns output marked partial (v2.1.246+) | H |
| https://code.claude.com/docs/en/permissions | A `Write(path)` rule is "accepted but never consulted"; path rules are session-global, never per-subagent | H |
| https://github.com/anthropics/claude-code/issues/41143 | Reports `maxTurns` not enforced on some version. Snippet only, not fetched | L |

**[EXT] Q2 — divergent ideation**
| URL | Takeaway | Strength |
|---|---|---|
| https://arxiv.org/abs/2510.01171 | Verbalized Sampling: k options, each with a probability, in one call → 1.6–2.1× diversity, incl. Claude Sonnet, independent of temperature | H |
| https://arxiv.org/abs/2402.01727 | Reasoning before listing options gave the highest idea diversity (GPT-4, product ideation) | M |
| https://arxiv.org/pdf/2512.23601 | A divergent-then-convergent scaffold beats "be creative", single pass | M |
| https://arxiv.org/pdf/2605.30150 | Sequential anchoring: later items in one call anchor on earlier ones. The paper's fix is parallel calls | H |

**[EXT] Q3 — mode collapse and bias**
| URL | Takeaway | Strength |
|---|---|---|
| https://arxiv.org/abs/2310.06452 | RLHF mode collapse, within one input and across inputs (ICLR 2024) | H |
| https://arxiv.org/abs/2308.11483 | Option-order bias swings results by 13–75%; keep key candidates off the edges | H |
| https://arxiv.org/html/2403.00811v3 | Primacy and status-quo bias; "be aware" instructions help modestly, few-shot debiasing can backfire | M |

**[EXT] Q4 — prior art**
| URL | Takeaway | Strength |
|---|---|---|
| https://docs.bmad-method.org/plan/explore-and-validate-an-idea/ | Analysis phase before PRD, written to a file, with outcomes Hardened / Killed / Clearer; "don't steer the session toward a yes" | H |
| https://github.github.io/spec-kit/reference/overview.html | Opt-in Idea Assessment before specify; files under `.specify/assessments/`; verdict go / needs-clarification / kill | H |
| https://github.github.io/spec-kit/reference/agentic-sdd.html | `/speckit.clarify`: ≤5 targeted questions, with the answers written back into the file | H |
| https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md | A brainstorm gate before writing plans: 2–3 approaches with trade-offs written to a design file. Red flag: relabelling scope to skip approval | H |
| https://www.anthropic.com/engineering/building-effective-agents | No options stage before planning in Anthropic's patterns | H |
| https://www.anthropic.com/engineering/multi-agent-research-system | Vague lead-agent instructions lead to duplicated or misread subagent work | H |
| https://aider.chat/2024/09/26/architect.html | Architect mode produces one solution, with no options, handed off in the conversation | H |
| https://docs.cline.bot/core-workflows/plan-and-act | Plan mode is read-only, produces a single plan and writes no file | H |
| https://github.com/VoltAgent/awesome-claude-code-subagents | No multi-option ideation agent in the list; the closest is a go/no-go idea validator | M |

**[EXT] Q5 — brief formats**
| URL | Takeaway | Strength |
|---|---|---|
| https://adr.github.io/madr/decisions/adr-template.html | Decision Drivers, stated before the options (adopted); Confirmation (rejected) | H |
| https://basecamp.com/shapeup/1.5-chapter-06 | Appetite and No-gos (adopted); Rabbit holes (rejected, overlaps risk) | H |
| https://workingbackwards.com/resources/working-backwards-pr-faq/ | PR-FAQ / 6-pager: nothing adopted | H |
| https://hackernoon.com/the-mvp-is-dead-long-live-the-rat-233d5d16ab02 | Riskiest Assumption Test: aim the cheapest experiment at the riskiest assumption (Higham, 2016) | L |
| https://hbr.org/2007/09/performing-a-project-premortem | Pre-mortem: "assume it failed — why?" phrasing for the kill criterion (Klein; paywalled preview only) | L |

## Handed off
- architecture-reviewer: not applicable (no code). Its scope is code boundaries.
- security review: none needed. The agent is read-only through its `tools:` allowlist (no `Write`, `Edit` or `Bash`), and no code changes.

## Insights to record
- root `INSIGHTS.md` · What Doesn't Work: the request described root `CLAUDE.md` as "the real file", but it is a symlink to `AGENTS.md` (`ls -la CLAUDE.md`), so root-protocol edits go to `AGENTS.md`. This is only a candidate. `CLAUDE.md` → *Do not touch* already says `*/CLAUDE.md` are symlinks. What is new is that the root one is too. Record it only if the implementer or verifier trips on it.

## Red-flags check
- [x] Every AC maps to at least one step or test
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; product choices are in *Decisions needed*
- [x] Groups end type-checking (n/a: Markdown only; grep Done-whens instead); parallel groups share no file
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [x] The brief above the marker is under ~20,000 characters (~19,800 after correction round 2)


## Handoffs → G1
None — single group. Implementer report: S1–S5 done; deviations: S2 Done-when expects 1 `ideas/` hit in `docs/README.md` but the step's *Change* requires 2 (plan inconsistency); S4 hop wording changed to avoid the stale-phrase grep "main session saves".

## Verification log
- 2026-09-27 · agent registered mid-session (harness notice "New agent types are now available: brainstormer") — no new session needed.
- T4 ("rename the Intent card title… how?") — **pass**: Step 0 redirect to `planner`, no brief, no file (1 tool use).
- T3 ("per-run cost badge") — **pass (shape differs from T3 wording)**: stopped at Step 0 citing `specs/README.md` row 001 `done` (S1.3 path), rather than a full brief with *Already in the repo*.
- T2 ("learn from dismissed findings") — **pass**: names-first list, status quo Opt3 (not at an edge), all fields, verdict `needs-clarification` (Opt4), riskiest assumption + experiment, no step lists; `git status` unchanged by the run. Main session saved it verbatim → `docs/ideas/01-learn-from-dismissed-findings.md` + index row (only `Status:` and `## Choice recorded` added). Length ~95 lines vs ≤ ~70 target.
- T7 — T2 run: 10 tool uses, no partial marking; `maxTurns: 25` not reached, so enforcement still unobserved (R7 stays open).
- T5 run 1 ("remember last PR tab") — **inconclusive**: test input had several sane approaches; brief gave 5 options, status quo Opt3.
- T5 run 2 ("PR number in PR list") — **fail**: 3 options, one self-described as answering "a question nobody asked" (padding); status quo labelled Opt1 (breaks S1.5(d)); no "only one sane approach" line.
- main-session fix: T5 — `.claude/agents/brainstormer.md`: description "3-5" → "up to 5 … fewer when only one is sane"; template heading `### Opt1 — <name> (status quo, if applicable)` → `### OptN — … (label the status quo; never Opt1 or the last one)`; added a *Padding check* paragraph before (e) with the two-option exception to (d). S1 Done-when re-run: all checks pass.
- T5 run 3 (same input, after fix) — **pass**: status quo + one option, "Only one real approach exists" stated, variants correctly folded as presentation.
- T2 regression (after fix, "cheaper review runs") — **pass with note**: diversity kept (mechanisms: caching, trimming, triage, batching, incremental), status quo Opt2; but **6 options**, exceeding "up to 5". Length ~100 lines.
- Full `.it` suite: not run — plan changes no package code (Prerequisites).
- Briefs from T5 runs and the T2 regression were not saved to `docs/ideas/` (smoke outputs); the user decides.
- fix mode (implementer, V1/V2): `brainstormer.md` — "at most 5 … including the status quo" in description, Method (b) and `## Options`; option block cut to 5 fields; `No-go` and `Confidence` added as *Comparison* columns. `.claude/agents/README.md` — three "3–5 … plus the status quo" phrasings aligned. S1/S4 Done-whens pass.
- main-session fix: AC2/S1-change — kill-criterion placeholder `if Opt1 was picked` → `if OptN was picked` (`brainstormer.md:150`), missed by the fix-mode run.
- T2 re-run after V1/V2 ("catch more real bugs") — **pass**: 5 options incl. status quo (Opt3, mid-list), 5 fields per option block, No-go/Confidence in *Comparison*, verdict `needs-clarification` (Opt1), riskiest assumption + experiment. Length 86 lines vs ~70 target (down from ~95–104). Saved verbatim → `docs/ideas/03-catch-more-real-bugs.md` + index row.
- main-session fix: V6 — `brainstormer.md:181` "~70 lines" → "~90 lines"; `.claude/agents/README.md:175` "brainstormer ~700" → "brainstormer: the brief itself, ~90 lines" (D1-A-era summary size, stale under D1-C).
- T4 re-run after V1/V2/V6 — **pass**: Step-0 redirect to `planner`, no brief, 1 tool use.
- T5 re-run after V1/V2/V6 — **pass**: status quo + one option, "Only one sane approach: Opt1." stated, dropped variants named as layout or unasked scope. Smoke output, not saved (as V5).
- 2026-09-27 · plan-verifier delta: **complete — needs sign-off**, 60/62 met; R3/R4 not-verifiable, signed off in V4 → `Status: done`. Brief 03 kept under the D1-C save-every-brief rule (not covered by V5).
