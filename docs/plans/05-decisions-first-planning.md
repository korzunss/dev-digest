# Development Plan: decisions-first planning and lean skill preloads
Status: done
Save as: docs/plans/05-decisions-first-planning.md
Spec: none

## Goal & acceptance criteria
(1) Plan in two passes: pass 1 = decisions-only draft (+ EXT research
questions); user answers go into *Decisions recorded*; pass 2 = the full plan,
written once. (2) Cut the per-spawn cost of `skills:` preloads (~28k tokens
for planner/implementer today) by loading skills on demand per step.
- AC1: `AGENTS.md` → *Plan → implement → verify* describes pass 1, the
  decision/research gate, pass 2 and when pass 1 is skipped (D1).
- AC2: `planner.md` defines the pass-1 shape (sections, cap) and a pass-2 mode
  that consumes *Decisions recorded*.
- AC3: `.claude/agents/README.md` and `docs/plans/README.md` show the flow and
  how "decisions pending" is visible (D2).
- AC4: planner `tools:` and its rationale match D4, under *What enforces the
  limits*.
- AC5: agent `skills:` lists, the on-demand read rule, the `## Skills` table
  in planner and implementer templates and the verifier's `SK` coverage check
  match D7/V1/V3.

## Decisions needed
None open — see *Decisions recorded*. Options considered: *Design notes → Options behind D1–D7*.

### Decisions recorded (user, 2026-09-28)
| # | Choice | Consequence for the plan |
|---|---|---|
| D1 | **B** — pass 1 by default; skipped when the request/brief fixes every choice or the plan is trivial (≤1 package, ≤3 files), skip reason stated | as recommended |
| D2 | **A** — same `NN-` file grows into the plan; `Steps: pending decisions` line; index row `draft (decisions)` | as recommended |
| D3 | **A** — EXT questions listed in pass 1, researched after answers, before pass 2; repo research stays a separate run | as recommended |
| D4 | **A** — planner keeps `Write, Edit`; README documents the limit as a prompt rule | as recommended |
| D5 | **A** — resume the pass-1 planner via SendMessage; fallback = fresh run with the plan path; no research run | as recommended |
| D6 | **A** — pass 1 ≤ ~4,000 chars, fixed sections | as recommended |
| D7 | **A** — planner + implementer preload only `engineering-insights` + `onion-architecture`; on-demand reads per *Skills to apply*; verifier checks *Skills applied* ⊇ *Skills to apply* | as recommended; measure on the next plan before considering B |
| V1 | Verifier finds *Skills applied* under `## Handoffs → G<n>` (main session appends it from the implementer report); else `not-verifiable` | S3, S5 as planned |
| V2 | Smoke timing: T2/T3 evidenced by plan 05's own creation (pass 1 = 3.4k chars; resume worked), T5 on plan 05's own verification, only T4 (preload token measurement) waits for the next real plan → *Needs sign-off* | Tests |
| V3 | **Skills report table** in planner and implementer reports (template, not prose): `Skill · Loaded (preload / on demand (<step>)) · Applied in · Not used — reason` — one row per loaded skill, one-line reason only for loaded-but-unused. Verifier checks coverage only (every *Skills to apply* skill has `Applied in` for that step); the reason column is informational, never a gap. Scope: planner + implementer; other agents after measuring (with D7-B) | S1, S2, S3 |

## Prerequisites
None. Markdown-only; no package commands, no Postgres.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S6 | `.claude/agents` prompts + repo docs (Markdown) | — | none (last group). Main-session smoke checks T2–T5 follow |

One group: six Markdown files, ~200–300 changed lines (assumption); splitting
would cost a second implementer run for no isolation gain. Order inside G1 is
S1 → S6 so the agent prompts exist before the docs describe them.

## Steps

### S1 — Planner: two passes, pass-1 template, on-demand skills, D4 note
- **Files:** `.claude/agents/planner.md` (modify)
- **Change:**
  1. Frontmatter `description`: add that by default it first writes a
     decisions-only draft (pass 1) and, when resumed after the user decides,
     writes the full plan once (pass 2). `skills:` → only
     `engineering-insights`, `onion-architecture` (D7).
  2. New section `## Two passes` between *Step 0* and *Method*:
     - **Pass 1 (default, D1):** runs unless the prompt says
       `single pass: <reason>` (the main session uses it only when the request
       or idea brief fixes every product choice, or the plan is trivial: ≤1
       package, ≤3 files). Read only enough to make each option concrete.
     - A fenced **pass-1 template** (D2, D6): title · `Status: draft` ·
       `Save as:` · `Spec:` · *Goal & acceptance criteria* (short) ·
       *Decisions needed* table · *Risks & open questions* holding **only**
       external-research questions ("None." if none) · the literal line
       `Steps: pending decisions` · the `implementer-brief:end` marker. Cap
       written inside the template: `<!-- pass 1: ≤ ~4,000 characters -->`.
     - Index row in `docs/plans/README.md`: status cell `draft (decisions)`.
     - Pass-1 return: path, the Decisions table, the research questions (D3).
     - **Pass 2 (D5):** started by the main session resuming this planner
       (SendMessage) once *Decisions recorded* is filled (and the external
       research, if any, is done — its result arrives as a path or ≤10 lines).
       Read *Decisions recorded*; replace `Steps: pending decisions` with the
       full template sections; set *Decisions needed* to
       `None open — see *Decisions recorded*`; move options prose below the
       marker; change the index cell to `draft`. **Fallback:** a fresh run with
       the plan path does the same, re-running the Method reads first.
     - Pass-2 return: path, step list, anything that needs a user decision.
  3. Method step 3 → "Read the skills for the packages the plan touches": only
     `engineering-insights` and `onion-architecture` are preloaded; for each
     package touched, `Read` `.claude/skills/<name>/SKILL.md` of the skills the
     implementer's *Skills are the rules* table maps to it. The implementer
     reads **exactly** the skills in each step's *Skills to apply*, so that
     list must name every skill whose rules bind the step (`none` for
     Markdown-only steps).
  4. Budget line: "reading `SKILL.md` files does not count" (replaces
     "loading preloaded skills"). *Repo constraints* intro: "come from the
     skills" (drop "preloaded").
  5. *Output*: first sentence says this is the pass-2 (or single-pass) shape.
  6. *Corrections*: answers to a pass-1 draft start pass 2; later
     corrections stay anchored edits returning changed sections.
  7. *Hard rules*, first bullet: add one sentence — `Write`/`Edit` scope is a
     prompt rule; `Edit` stays for anchored correction edits and the index
     row (D4; see README *What enforces the limits*).
  8. Red-flags check: add `- [ ] Pass 1: only the pass-1 sections, ≤ ~4,000
     characters, ends with "Steps: pending decisions"` and
     `- [ ] Every step's *Skills to apply* is complete (the implementer reads
     only those)`.
  9. Plan template (V3): add, right after `## Context applied` (below the
     marker), this section — the one place the planner reports skills:
     `## Skills` / `| Skill | Loaded | Applied in | Not used — reason |`
     with inline guidance in the template: Loaded = `preload` or
     `on demand (<step>)`; one row per loaded skill; *Applied in* = step ids;
     the reason, one line, only for a loaded-but-unused skill.
- **Layer / why here:** the planner prompt owns plan shape and its own passes.
- **Skills to apply:** none (Markdown only)
- **Practices:** every count/placement rule for pass 1 lives **inside the
  template block**, not only in prose; keep the existing section order;
  no rule duplicated between *Two passes* and *Corrections*.
- **Known gotchas:** root `INSIGHTS.md` → "in an agent prompt, the output
  template beats the prose rules" (2026-09-27).
- **Done when:**
  `sed -n '/^skills:/,/^---/p' .claude/agents/planner.md` lists exactly the two
  skills · `grep -c 'Steps: pending decisions' .claude/agents/planner.md` ≥ 2 ·
  `grep -n 'draft (decisions)\|single pass:\|4,000\|SendMessage' .claude/agents/planner.md`
  hits each term · `grep -c 'preloaded skills' .claude/agents/planner.md` = 0 ·
  `grep -c '^| Skill | Loaded | Applied in | Not used — reason |' .claude/agents/planner.md` = 1.

### S2 — Implementer: two preloads, hard rule to read *Skills to apply*
- **Files:** `.claude/agents/implementer.md` (modify)
- **Change:**
  1. `description`: "applying every preloaded project skill" → "reading and
     applying the skills each step names". `skills:` → `engineering-insights`,
     `onion-architecture`.
  2. Method 2.2: before making a step's change, `Read`
     `.claude/skills/<name>/SKILL.md` for every skill in the step's *Skills to
     apply* not yet read in this run (**hard rule**: a step whose skills were
     not read is not done); open a skill's reference file only when the
     change needs it; then apply them.
  3. *Skills are the rules*: intro says only two skills are preloaded, the rest
     are read on demand; the file→skill table stays as the planner's source
     and as a cross-check — if a file's row names a skill the step omitted,
     read it too and log a trivial *Deviation*.
  4. Output (V3): replace the free-form `## Skills applied` section of the
     Implementation Report template with
     `## Skills` / `| Skill | Loaded | Applied in | Not used — reason |` —
     Loaded = `preload` or `on demand (<step>)`; one row per loaded skill;
     *Applied in* = step or gap ids; a one-line reason only for a
     loaded-but-unused skill. Make it **always present** (add it to the
     "always present" sentence next to Status, Steps, Verification; delete
     the "*Skills applied* — only when a skill changed what you wrote" rule).
  5. Hard rules: add the on-demand read rule in one line.
- **Layer / why here:** the implementer prompt owns execution and its report.
- **Skills to apply:** none (Markdown only)
- **Practices:** the "always present" rule and the table live in the output
  template itself; do not change fix-mode or status-refusal rules.
- **Known gotchas:** root `INSIGHTS.md` → "output template beats the prose
  rules"; → "correction: new agents do show up mid-session" (edits apply on
  the next spawn — nothing to restart).
- **Done when:** `sed -n '/^skills:/,/^---/p' .claude/agents/implementer.md`
  lists exactly the two skills ·
  `grep -c '^| Skill | Loaded | Applied in | Not used — reason |' .claude/agents/implementer.md` = 1 ·
  `grep -c '^## Skills applied\|every preloaded\|only when a skill changed' .claude/agents/implementer.md` = 0 ·
  `grep -n '\.claude/skills/<name>/SKILL.md' .claude/agents/implementer.md` hits.

### S3 — Plan-verifier: `SK` coverage items
- **Files:** `.claude/agents/plan-verifier.md` (modify)
- **Change:**
  1. Method step 1 enumeration: add `SK1…n` — one per step with a non-empty
     *Skills to apply*: `met` when every listed skill has a row in the
     implementer's `## Skills` table whose *Applied in* contains that step;
     otherwise `missing` → a fix-mode gap (re-read the skill, re-check the
     step). The *Not used — reason* column is informational, **never** a gap.
     Source (V1): the `## Skills` table the main session copied under
     `## Handoffs → G<n>` (or a passed Implementation Report); neither →
     `not-verifiable — Skills table not provided`.
  2. Method step 5: replace "A step's *Skills to apply* list alone is **not**
     a criterion" with: the list is not a criterion **for the code** (rule
     compliance stays `architecture-reviewer`'s job); it is only the `SK`
     coverage check.
  3. Step 0 optional inputs: note that the `## Skills` table comes from the
     plan's Handoffs (or the reports).
- **Layer / why here:** D7's enforcement point is the verifier.
- **Skills to apply:** none (Markdown only)
- **Practices:** `SK` is a presence check only — no new review of skill rules;
  keep the output template unchanged except the `met` summary example may
  mention `SK`.
- **Known gotchas:** none beyond S1's.
- **Done when:** `grep -c 'SK1' .claude/agents/plan-verifier.md` ≥ 1 ·
  `grep -n 'Skills table not provided' .claude/agents/plan-verifier.md` hits ·
  `grep -n 'Applied in' .claude/agents/plan-verifier.md` hits ·
  `grep -n 'never.* a gap' .claude/agents/plan-verifier.md` hits ·
  `grep -c 'alone is \*\*not\*\* a' .claude/agents/plan-verifier.md` = 0.

### S4 — Agents README: flow, status table, Skills, enforcement, sources
- **Files:** `.claude/agents/README.md` (modify)
- **Change:**
  1. Mermaid (`## How they fit together`): `planner` → `pass 1: decisions-only
     draft` → `you decide, main session records` → optional `researcher (EXT)`
     → `planner pass 2 (resumed)` → `Development Plan S1…Sn, Status: draft`
     → existing approval node. Keep all other edges.
  2. Hops 1–2: rewrite for pass 1 → decisions → EXT research → pass 2 (resume,
     fallback fresh run); name the `single pass: <reason>` skip (D1).
  3. *Plan status per agent*, `planner` row: pass 1 writes `draft` with
     `Steps: pending decisions` (index `draft (decisions)`); pass 2 fills it.
     *Inputs and outputs* `planner` row: add the pass-1 output. `plan-verifier`
     row id list: add `SK`.
  4. *What enforces the limits* (D4): after the planner sentence add why `Edit`
     stays — removing it enforces nothing (`Write` can overwrite any file it
     has read) and forces whole-file rewrites; a planner-scoped hook on
     `docs/plans/**` is the only real limit and was declined (plans 03/04).
  5. `## Skills`: planner and implementer preload only `engineering-insights`
     and `onion-architecture` (~18.5 KB); the others are read on demand per
     step's *Skills to apply*, enforced by the verifier's `SK` items. Replace
     "~28k tokens per spawn" with the new figure; keep the "other six" table,
     adding to the `plan-verifier` row that it checks `SK` coverage.
  6. Sources table row "Same 12 skills preloaded in both agents" and the
     *Deliberate deviation* paragraph: now follows progressive disclosure; the
     skip risk is covered by the `SK` check.
- **Layer / why here:** the README is the agents' map; it must match S1–S3.
- **Skills to apply:** none (Markdown only)
- **Practices:** keep hop numbering; mermaid must still parse (no `"`
  inside labels, `<br/>` for line breaks as elsewhere in the block).
- **Known gotchas:** none.
- **Done when:** `grep -c 'same 12\|Same 12' .claude/agents/README.md` = 0 ·
  `grep -n 'draft (decisions)' .claude/agents/README.md` hits ·
  `grep -n 'pass 1' .claude/agents/README.md` hits inside the mermaid block ·
  `grep -n 'SK' .claude/agents/README.md` hits the verifier rows.

### S5 — Root AGENTS.md: the pipeline bullets
- **Files:** `AGENTS.md` (modify; `CLAUDE.md` is a symlink to it — do not touch)
- **Change:** in *Plan → implement → verify*:
  1. Research bullet: external research runs for the questions pass 1 lists,
     after the user's answers and before pass 2; repo research unchanged.
  2. Planner bullet: pass 1 (decisions-only draft, `Steps: pending
     decisions`, index `draft (decisions)`) by default; `single pass:
     <reason>` when every choice is fixed or the plan is trivial (≤1 package,
     ≤3 files); pass 2 = resume the same planner (fallback: fresh run with
     the path); correction rounds only for real corrections.
  3. Hand-off bullet: the main session also copies each implementer run's
     `## Skills` table under `## Handoffs → G<n>` (V1; source for the
     verifier's `SK` items).
- **Layer / why here:** loaded every session; states the protocol.
- **Skills to apply:** none (Markdown only)
- **Practices:** net growth ≤ ~1,000 characters; one bullet per stage.
- **Known gotchas:** root `INSIGHTS.md` → "`git stash pop` silently un-stages
  a symlink" — no stash; edit `AGENTS.md` only.
- **Done when:** `grep -n 'pass 1\|Steps: pending decisions' AGENTS.md` hits ·
  `grep -n 'Skills. table' AGENTS.md` hits · `ls -l CLAUDE.md` still
  `-> AGENTS.md` · `wc -c < AGENTS.md` ≤ 9,700.

### S6 — docs/plans/README.md: lifecycle wording
- **Files:** `docs/plans/README.md` (modify — prose only; the index rows are
  the main session's and the planner's)
- **Change:** *Lifecycle*: under the status table, one paragraph: a pass-1
  draft is still `Status: draft`; its body ends with `Steps: pending
  decisions` and its index cell reads `draft (decisions)`; pass 2 turns the
  cell into `draft`. *Who writes the file*: planner writes pass 1, then the
  full plan in pass 2 into the same file.
- **Layer / why here:** the lifecycle's home.
- **Skills to apply:** none (Markdown only)
- **Practices:** no new status value in the table (D2).
- **Known gotchas:** none.
- **Done when:** `grep -c 'draft (decisions)' docs/plans/README.md` ≥ 1 outside
  the index · `grep -n 'Steps: pending decisions' docs/plans/README.md` hits ·
  `git diff --name-only` ⊆ the six S1–S6 files + this plan.

## Tests
| Test | Tier | Covers | Step |
|---|---|---|---|
| T1 — all S1–S6 Done-when greps | implementer | AC1–AC5 (static) | S1–S6 |
| T2 — pass-1 evidence: plan 05's own pass 1 (3.4k chars, only pass-1 sections, `Steps: pending decisions`) | main session, logged | AC2, AC3 | S1, S6 |
| T3 — pass-2 evidence: plan 05's pass 2 by SendMessage resume (context kept; line replaced, *Decisions needed* = "None open") | main session, logged | AC1, AC2 | S1 |
| T4 — preload diet: planner/implementer spawn token counts on the next real plan vs. plan 05's pass 1 (66.8k) and plans 03/04; the implementer report carries the `## Skills` table | main session | AC5 | S1, S2 |
| T5 — `SK` check on plan 05's own verification: the verifier emits `SK` handling per S3 (see Risks for what it can show here) | main session | AC5 | S3 |

T2/T3 are logged in the Verification log as evidenced by this plan's creation
(V2). T5 runs with plan 05's verification. T4 waits for the next real plan and
is a *Needs sign-off* item until then.

## Migrations & contracts
None.

## Out of scope
- `test-writer` and `architecture-reviewer` preloads (D7-B) — measure first.
- Hooks of any kind (D4-C declined).
- New `Status:` values; changes to implementer/verifier status refusals.
- Editing `INSIGHTS.md`, `insights/gotchas.md`, `.claude/skills/**`, `CLAUDE.md`.
- Rewriting plans 01–04 into the new shape.

<!-- implementer-brief:end -->

## Context applied
- root `INSIGHTS.md` → "in an agent prompt, the output template beats the prose
  rules" — pass-1 cap/sections and *Skills applied* go into templates (S1–S3).
- root `INSIGHTS.md` → "correction: new agents do show up mid-session" (+ 09-27
  extension) — edited agents apply on next spawn; T2–T5 can run in-session.
  Its note that a probe asked for "preloaded skills" lists all session skills
  → T4 measures tokens instead of asking the agent.
- root `INSIGHTS.md` → "`git stash pop` silently un-stages a symlink" — S5.
- root `INSIGHTS.md` → "`rg` edge checks catch comments and prose" — Done-whens
  use `grep` (rg is a shell function here) and target prose deliberately.
- `.claude/agents/README.md:207–216` (12 skills, ~28k tokens), `:24–41`
  (enforcement), `:264–268` (deliberate deviation) — S4.
- `.claude/agents/plan-verifier.md:128–135` — current "not a criterion" rule, S3.
- `.claude/agents/implementer.md:96–97, 145, 226` — preload wording and the
  conditional *Skills applied*, S2.

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| repo tooling | `.claude/agents/planner.md` | agent prompt | changed |
| repo tooling | `.claude/agents/implementer.md` | agent prompt | changed |
| repo tooling | `.claude/agents/plan-verifier.md` | agent prompt | changed |
| repo docs | `.claude/agents/README.md` | agents map | changed |
| repo docs | `AGENTS.md` (via `CLAUDE.md` symlink) | session protocol | changed |
| repo docs | `docs/plans/README.md` | plan lifecycle | changed |

## Design notes

### Options behind D1–D7
D1 A always / B default + `single pass` skip / C opt-in. D2 A same file +
marker line / B new `decisions` status / C separate file. D3 A EXT before
pass 2 / B pass 1 replaces repo research / C EXT after full plan. D4 A keep
Write+Edit / B drop Edit / C hook. D5 A resume + fresh fallback / B always
fresh. D6 A ~4,000-char cap / B none. D7 A two preloads + on-demand + `SK`
check / B A + test-writer, architecture-reviewer / C as is. Chosen: all A
except D1 = B.

### Why `SK` reads from Handoffs (V1)
The verifier gets the plan path, not pasted reports (`AGENTS.md`: ≤10 lines
per report). The main session already appends each group's handoff under
`## Handoffs → G<n>`; copying the `## Skills` table there keeps the
verifier's source in the file.

### Skills table (V3)
One shape for planner and implementer: `| Skill | Loaded | Applied in | Not
used — reason |`. It shows both what was loaded (preload vs on demand) and
where it bound, so T4 can relate token cost to use. Coverage is the only
checked property; reasons are informational. Other agents adopt it only
with D7-B, after measuring.

### Smoke-check timing (V2)
Plan 05 was itself produced by the new flow (pass 1 → recorded decisions →
resumed pass 2), with the old prompts: that is the T2/T3 evidence. T4 needs
a plan that loads package skills, so it waits for the next real plan.

## Risks & open questions
- T5 on plan 05 is weak: every S1–S6 lists *Skills to apply: none*, so there
  are no `SK` items to check, and the G1 implementer runs with the **old**
  prompt (S2's edit applies from its next spawn), so its report has no
  `## Skills` table. T5 here can only confirm the verifier handles "no `SK`
  items" correctly; a real `SK` check comes with the next code plan
  (alongside T4). Main session decides whether to log T5 as partial.
- Planner reading package skills on demand may make pass 2 costlier than the
  preload saved when a plan touches server + client (5–8 SKILL.md reads). T4
  measures; D7-B stays deferred.
- An implementer may list a skill in its `## Skills` table without having read it;
  `SK` checks presence, not reading. Accepted — same trust level as today.
- Resume depends on the harness keeping finished subagents resumable; fallback
  (fresh run with path) is specified.

## Handed off
- architecture-reviewer: none (no code).
- security review: none — no trust boundary touched.

## Insights to record
- root `INSIGHTS.md` · What Works — after T4: measured token cost of a planner
  spawn with 2 vs 12 preloaded skills (`.claude/agents/planner.md` frontmatter).

## Red-flags check
- [x] Every AC maps to at least one step or test
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; product choices are in *Decisions needed*
- [x] Groups end type-checking (n/a: Markdown; greps instead); parallel groups share no file
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [x] The brief above the marker is under ~20,000 characters

## Handoffs → G1
None — single group. Implementer report: S1–S6 done, no deviations. Its `## Skills` table (copied per V1):

| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | — | Markdown-only steps; no INSIGHTS.md write triggered |
| `onion-architecture` | preload | — | no `server/`/`reviewer-core/` code touched |

## Verification log
- T2 — **evidenced by plan 05's own creation**: pass 1 draft was 3,437–3,900 chars with only Goal, Decisions, research line and `Steps: pending decisions`; pass-1 planner cost 66.8k tokens (5 tool uses), of which ~28k was the old 12-skill preload.
- T3 — **evidenced**: pass 2 and three corrections resumed the same planner via SendMessage (D7 addition +4k tokens; full plan +43k; V1–V3 correction +15k). Planner total for plan 05: 129k vs 210k (plan 03) and 291k (plan 04).
- T5 — **partial**: the G1 implementer (spawned with the pre-S2 prompt) nevertheless produced the `## Skills` table from the plan text; every step's *Skills to apply* is `none`, so no `SK` coverage items exist here. Real check on the next code plan.
- T4 — **pending**: preload token measurement needs the next planner/implementer spawn on a real plan → *Needs sign-off*.
- Full `.it` suite: not run — plan changes no package code.
- 2026-09-28 · plan-verifier full pass: **incomplete** — 65/73 met; gap S1/P1 (pass-1 cap comment outside the template fence); 6 not-verifiable (T2–T5, R3, R4).
- main-session fix: S1/P1 — `planner.md`: `<!-- pass 1: ≤ ~4,000 characters -->` moved inside the fenced pass-1 template (above `<!-- implementer-brief:end -->`).
- main-session fix: S5 (verifier handoff) — `AGENTS.md` planner bullet reworded so "writes no other file" covers both passes.
- 2026-09-28 · plan-verifier delta (run on `sonnet`, 51k tokens): **complete — needs sign-off**, 67 met, no gaps. User signed off T2–T5, R3, R4 → `Status: done`.

## Carry-over checks (for the next plan that touches package code)
- T2/T3: the new `planner.md` writes a pass-1 draft within the cap and pass 2 resumes it.
- T4: record planner and implementer `subagent_tokens` with the 2-skill preload (baseline: pass 1 of this plan 66.8k with 12 skills; implementer G1 here 193k).
- T5: plan-verifier emits `SK` items and flags a step whose *Skills to apply* skill is missing from *Applied in*.

### Carry-over results — checked on plan 07 (2026-09-29)
Evidence: `docs/plans/07-review-diff-base-sha.md` → *Verification log*.
- **T2/T3 — pass.** Pass 1 wrote a decisions-only draft (~3,350 B above the marker, `Steps: pending decisions`, index `draft (decisions)`); pass 2 resumed the same planner after the decisions and research were recorded in the plan. Pass 2 raised two new decisions (D7, D8) instead of deciding them itself.
- **T4 — pass.** Planner pass 1: 53.7k `subagent_tokens` (baseline 66.8k, −20%). Implementer G1: 70.1k, G2: 76.6k (baseline 193k for G1 here; the groups are not the same size, so this is indicative, not a like-for-like). Pass 2 of the resumed planner reported 126.9k, not separable from pass 1.
- **T5 — pass, with a finding.** plan-verifier emitted SK1–SK7 and flagged missing *Applied in* entries. Two lessons: (1) implementers record a cross-cutting skill against one step only, which fails step-level SK items; (2) a skill listed on a step where it has nothing to do can only be closed by a plan change — *Not used — reason* does not satisfy the check. Planners should list a per-step skill only where the step writes the artifact the skill covers.
