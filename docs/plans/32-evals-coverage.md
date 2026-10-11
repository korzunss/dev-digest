# Development Plan: evals coverage — onion-architecture port, a with/without-skill benchmark, security-reviewer + plan-verifier agent evals, engineering-insights content eval
Status: done
Save as: docs/plans/32-evals-coverage.md
Execution: multi-agent
Spec: none (tooling: new harness evals in the evals/ package; no product behaviour change)

## Goal & acceptance criteria
Extend `evals/` with four suites the user chose (items 1–4) and one measured with-vs-without-skill benchmark whose summary is committed.
- AC1: `evals/skills/onion-architecture/` holds a thin `*.eval.ts` + `*.cases.ts` porting the 8 skill-creator cases (content tier, `skillTask`); `.claude/skills/onion-architecture/evals/**` is not modified.
- AC2: one `pnpm eval:benchmark <skill> -n 5` run (candidate vs baseline) completed, its summary committed under `evals/`.
- AC3: `evals/agents/security-reviewer/` and `evals/agents/plan-verifier/` each hold one real-defect case (found, cited `path:line`) and one clean case (no fabricated finding/gap); each case finishes under the 240 s `testTimeout` locally (`evals/vitest.config.ts:9`, unchanged).
- AC4: `evals/skills/engineering-insights/` holds a no-new-insight case and a real-finding case (Symptom/Cause/Rule/Evidence, routed to the right file), both from raw input without the answer pre-written.
- AC5: `pnpm typecheck`, `pnpm eval:quality`, `pnpm vitest run src/records/stats.test.ts` pass; `CI_DETECT_ALL=1 node scripts/ci-detect.mjs` lists the new suites.

## Decisions needed
None open — see *Decisions recorded*. (The pass-1 options table and *Requirements review* are below the marker.)

## Decisions recorded
- 2026-10-11 the user approved the full plan ("так"). (user)
- 2026-10-11 the user answered "усе за рекомендаціями" (all as recommended):
  - D1 A — read the onion fixtures in place from `.claude/skills/onion-architecture/evals/fixtures/`; no copy.
  - D2 A — `agentTask` disallows Bash/Write/Edit/NotebookEdit (engine change; architecture-reviewer history no longer comparable; triggers the CI workflow tier).
  - D3 A — plan-verifier fixture: an `approved` `fixtures/*.plan.md` read by path, one step on a real repo path, patch given inline; clean case expects `complete — needs sign-off`.
  - D4 A — declared agent skills are not injected; measure as is (injection is a follow-up).
  - D5 A — benchmark `onion-architecture`, n=5, subscription backend (Haiku task / Sonnet judge); run by the main session in the background.
  - D6 A — summary at `evals/docs/benchmarks/<date>-onion-architecture.md` + fix the README "no example cases" line.
  - D7 — Execution: multi-agent.
  - TQ1–TQ4 — defaults accepted (no `load.ts` change; onion cases content-tier with numbered fixtures, expected lines ±3, threshold 0.8; agent cases ≤~180 s locally, CI/DeepSeek timeouts accepted; engineering-insights positive case → `server/INSIGHTS.md` + `server/insights/gotchas.md`).

## Prerequisites
- No new dependencies. `cd evals && pnpm install` already done (`evals/node_modules` present).
- Model steps M1/M2 need a logged-in Claude Code subscription (default `EVAL_BACKEND=subscription`; no API key, no OpenRouter cost).
- All commands below run from `evals/` (`cd evals && …`).

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S3 | evals engine + content-tier skill suites | — | `AGENT_DISALLOWED_TOOLS` exported from `src/config.ts`; new suites `skills/onion-architecture`, `skills/engineering-insights`; nothing else changes signature |
| G2 | S4–S5 | evals tool-tier agent suites | G1 (S1 must be in place: the agent cases are designed for no-Bash sessions) | case names of the 4 agent cases (M1 times them) |
| M1 | main session | local model runs of every new suite (timing + first scores) | G2 | per-case duration table → *Handoffs → M1*; a case > ~180 s goes back to G2 fix mode (smaller fixture) |
| M2 | main session | `eval:benchmark skills/onion-architecture -n 5` | M1 green for onion | path of `results/benchmarks/<ts>/benchmark.md` → *Handoffs → M2* |
| G3 | S6 | evals docs | M2 | — |

G3 is 2 files, under the merge floor on purpose: it needs the M2 output, so it cannot merge with G1/G2.

## Steps

### S1 — Make `agentTask` sessions unable to run Bash or write
- **Files:** `evals/src/config.ts` (modify), `evals/src/tasks.ts` (modify)
- **Change:** in `config.ts`, under *Tool allow-lists*, add `export const AGENT_DISALLOWED_TOOLS = ["Bash", "Write", "Edit", "MultiEdit", "NotebookEdit"];` with a one-line comment citing root `INSIGHTS.md` 2026-10-11 (`allowedTools` restricts nothing under `bypassPermissions`). In `tasks.ts` `agentTask` (line 38-42) pass `disallowedTools: AGENT_DISALLOWED_TOOLS` **after** `...opts` so a case cannot re-enable them: `runClaude(prompt, { allowedTools, ...opts, disallowedTools: AGENT_DISALLOWED_TOOLS, systemPrompt })`. Update the `agentTask` doc comment: the agent keeps its declared read tools; mutating tools and Bash are removed outright, not just left off `allowedTools`.
- **Layer / why here:** `config.ts` owns every tunable and imports nothing (`config.ts:1-5`); `tasks.ts` composes runtime + artifacts. `load.ts` `agentTools()` stays unchanged (it builds `allowedTools`).
- **Skills to apply:** `typescript-expert`, `security`
- **Practices:** constant is a plain `string[]` like `WORKFLOW_DISALLOWED_TOOLS` (`config.ts:33-35`); `config.ts` gains no import; `skillTask` and `workflowTask` untouched; no change to `vitest.config.ts`.
- **Known gotchas:** root `INSIGHTS.md` "2026-10-11 — `allowedTools` and a PreToolUse deny hook do not keep an SDK workflow eval read-only" (`disallowedTools` removes tools; allow-lists do not).
- **Done when:** `cd evals && pnpm typecheck` · `grep -n AGENT_DISALLOWED_TOOLS src/tasks.ts src/config.ts` shows the export and its use in `agentTask`. (Bash absence in traces is checked in M1.)

### S2 — Port the 8 onion-architecture skill-creator cases to the content tier
- **Files:** `evals/skills/onion-architecture/onion-architecture.eval.ts` (create), `evals/skills/onion-architecture/onion-architecture.cases.ts` (create). Create them with `pnpm eval:scaffold onion-architecture`, then delete the generated `fixtures/.gitkeep` and the empty `fixtures/` folder (D1: no local fixtures).
- **Change:** eval file = the scaffold template (`describeSkill` + `runSkillCases`, `src/scaffold.ts:75-83`). Cases file:
  - `const FX = join(SKILLS_DIR, "onion-architecture", "evals", "fixtures")` (`SKILLS_DIR` from the barrel). A helper `draft(caseDir)` reads every file under `FX/<caseDir>` recursively (sorted), and renders each as a header `=== <path relative to the case dir> ===` followed by its lines prefixed `<n>: ` (1-based), so cited lines match `expected-findings.json`. Read-only: `readFileSync`/`readdirSync` only.
  - One prompt builder: the eval.md *Task given to the agent under test* (`.claude/skills/onion-architecture/evals/eval.md:53-60`) **without** its first sentence ("Invoke the … skill") and without `{{repo}}` — say the draft is inlined below, laid out at its repo paths, `.diff` = edits to existing files, cite `file:line` as numbered below — plus the rule-id list (eval.md:62-72) verbatim, then `draft(caseDir)`. Same prompt for candidate and baseline.
  - 8 cases, one per `case-1…case-8` folder, `kind: "quality"`, `threshold: 0.8`, `maxTurns: 4`, no `grounding`. Name each after its case (e.g. `"case-1 review-digest: flags the three layering leaks, leaves repository.ts alone"`).
  - `practices` = that case's `expectations` from `evals.json`, reworded only to (a) refer to the `findings` block instead of `review.md`, and (b) append the expected line(s) from `expected-findings.json` with "±3" (e.g. "…flags routes.ts at a line within 3 of 4, 5 or 43…"). Must-not-flag expectations stay as practices. Keep the depcruise expectation where `evals.json` has it.
- **Layer / why here:** case data lives in `evals/skills/<name>/` (`evals/README.md` *Case layout*); the fixtures stay the skill's own (`CLAUDE.md` *Do not touch*).
- **Skills to apply:** `typescript-expert`, `security`
- **Practices:** imports only from `../../src/index.js` (barrel rule, README *Module layout*) plus `node:fs`/`node:path`; no write API anywhere; a practice names only rule ids from the eval.md list; never quote `expected-findings.json` text into the prompt (answer key stays out of the model's input).
- **Known gotchas:** `CLAUDE.md` *Do not touch* — `.claude/skills/*/evals/fixtures/**` are seeded inputs scored by line number: never edit, reformat or copy them. Root `INSIGHTS.md` 2026-10-09 rule: a practice may only name ids/phrases the artifact defines.
- **Done when:** `cd evals && pnpm typecheck` · `pnpm exec vitest list skills/onion-architecture` lists 8 tests · `git status --porcelain .claude/skills/onion-architecture` prints nothing · `pnpm eval:quality onion-architecture` no longer warns "no eval file".

### S3 — Add an engineering-insights content eval (no-insight + real-finding)
- **Files:** `evals/skills/engineering-insights/engineering-insights.eval.ts` (create), `evals/skills/engineering-insights/engineering-insights.cases.ts` (create), `evals/skills/engineering-insights/fixtures/session-rename-only.md` (create), `evals/skills/engineering-insights/fixtures/session-server-finding.md` (create). Scaffold with `pnpm eval:scaffold engineering-insights`; remove `.gitkeep` once fixtures exist.
- **Change:** both fixtures are **raw** session transcripts — commands run, their output, the edits, and a `git diff --name-only` block — with no conclusion, no "Rule:" and no "lesson" sentence.
  - `session-rename-only.md`: a client-only rename of a local variable, tests green, nothing surprising.
  - `session-server-finding.md`: a server-only session where a test fails with a concrete error string, the session reads code, and a small edit fixes it. The non-obvious cause must be visible in the quoted code/output, never stated. Base it on real code: name real `server/src/**` paths and lines you opened. Before choosing it, `grep -n '^### ' server/INSIGHTS.md` and `grep -n` the subject in `server/INSIGHTS.md` + `server/insights/gotchas.md`: it must **not** be recorded already (otherwise the right answer is "already recorded").
  - Each fixture ends with a block "Headings of the target files at session end" = the current `grep '^### '` output of `server/INSIGHTS.md` (and `client/INSIGHTS.md` for the rename fixture), since the content tier cannot read files (`run-claude.ts:74-78`).
  - Prompt (both cases): "The session below has ended. Run your wrap-up. You cannot write files: reply with exactly what you would append and where (file, section), and the gotchas change, or say why nothing is written." + `fx(<fixture>)` via `fixtureReader(import.meta.url)`.
  - Case 1 (`"writes nothing for a session with no non-obvious finding"`, threshold 1.0, maxTurns 4): practices — "states that no entry is written (e.g. 'no new insight') and proposes no INSIGHTS.md entry"; "does not propose a Session Note that only restates the rename".
  - Case 2 (`"records a real server finding with Symptom/Cause/Rule/Evidence in server/INSIGHTS.md"`, threshold 0.8, maxTurns 4): practices — routes to `server/INSIGHTS.md` (not root, not client); names one of the seven sections; entry has `**Symptom:**`, `**Cause:**`, `**Rule:**`, `**Evidence:**` lines; Evidence cites a `path:line` or the error string from the transcript; the Rule is actionable (says what to do, not "be careful"); proposes the matching item in `server/insights/gotchas.md` (Step 5b).
- **Layer / why here:** content tier (`skillTask`) — this measures the skill text; activation stays the workflow tier's job (`evals/workflow/review-workflow.cases.ts` already has it).
- **Skills to apply:** `typescript-expert`, `security`, `engineering-insights` (preloaded — its Steps 1–5b are what the practices restate)
- **Practices:** fixtures under `evals/skills/engineering-insights/fixtures/` only (README: fixtures never inside `.claude/skills/*`); practices quote only terms the skill defines ("no new insight", section names, the four bold labels, `insights/gotchas.md`); no answer text in the fixture (README "low lift is a task-design signal").
- **Known gotchas:** root `INSIGHTS.md` 2026-10-11 "a doc-routing eval question must be unanswerable from the always-loaded docs" — keep the cause out of prose; the 2026-10-08 zod entry — a practice must be satisfiable by its own data (re-read each practice against the fixture).
- **Done when:** `cd evals && pnpm typecheck` · `pnpm exec vitest list skills/engineering-insights` lists 2 tests · `grep -il 'rule:' skills/engineering-insights/fixtures/*.md` prints nothing.

### S4 — Add security-reviewer agent cases (one defect, one clean)
- **Files:** `evals/agents/security-reviewer/security-reviewer.eval.ts` (create), `evals/agents/security-reviewer/security-reviewer.cases.ts` (create), `evals/agents/security-reviewer/fixtures/repos-blame-route.diff` (create), `evals/agents/security-reviewer/fixtures/repos-routes-rename.diff` (create). Scaffold with `pnpm eval:scaffold --agent security-reviewer`; remove `.gitkeep`.
- **Change:**
  - `repos-blame-route.diff`: a unified diff against the **current** `server/src/modules/repos/routes.ts` (53 lines; hunk header with real line numbers) adding `GET /repos/:id/blame` that reads `path` from `req.query` with **no** Zod `schema` (cast, e.g. `req.query as { path: string }`) and passes it to the git adapter's `blame(ref, path)`. The sink is real: `server/src/adapters/git/simple-git.ts:248` builds `['blame', '--line-porcelain', path]` with no `--`, so a `path` like `--contents=/etc/passwd` is option injection. Reach the git client the way the code does (open `service.ts`/`platform/container.ts` to pick a call shape that type-reads plausibly). No comment hints at the flaw.
  - `repos-routes-rename.diff`: a behaviour-neutral rename of a local identifier in the same file.
  - Prompt builder like `reviewPrompt` in `agents/architecture-reviewer/architecture-reviewer.cases.ts:9-14`: "Mode: diff. Plan: none. The change is the patch below, given inline and NOT applied to the working tree; review the patch; read repo code only as context and to trace sinks. Bash is not available: say so in *Checks not run* instead of stopping."
  - Case 1 (`"finds the unvalidated blame path reaching git argv"`, threshold 0.8, maxTurns 25): practices — reports a finding (an `SF` id) on the new route in `server/src/modules/repos/routes.ts` with `path:line`; names the boundary `X4` (argv/`--`) and/or `X1` (no route Zod schema); quotes both the source (`req.query`) and the sink (`blame` / `--line-porcelain`); verdict line present (`PASS` or `BLOCK`).
  - Case 2 (`"does not fabricate a finding for a local rename"`, threshold 1.0, maxTurns 25): practices — *Findings* is "None." (no `SF` row); verdict `PASS`; no CRITICAL/HIGH anywhere.
- **Layer / why here:** tool tier (`agentTask`), the agent's declared read tools from REPO_ROOT; fixture targets a real path (INSIGHTS 2026-10-09 addendum).
- **Skills to apply:** `typescript-expert`, `security`
- **Practices:** every id/phrase in a practice appears in `.claude/agents/security-reviewer.md` (`SF1`, `X1`, `X4`, `PASS`, `BLOCK`, *Findings*, *Checks not run*) — grep before committing; the diff applies cleanly to HEAD (`git apply --check` from repo root, read-only); fixtures stay in `evals/agents/security-reviewer/fixtures/`.
- **Known gotchas:** root `INSIGHTS.md` 2026-10-09 (practices name only the agent's own ids; fixture path must exist; prompt says the patch is inline); 2026-10-11 green-run entry (a 240 s timeout is not a wrong answer).
- **Done when:** `cd evals && pnpm typecheck` · `pnpm exec vitest list agents/security-reviewer` lists 2 tests · `cd .. && git apply --check evals/agents/security-reviewer/fixtures/repos-blame-route.diff && git apply --check evals/agents/security-reviewer/fixtures/repos-routes-rename.diff`.

### S5 — Add plan-verifier agent cases (one defect, one clean)
- **Files:** `evals/agents/plan-verifier/plan-verifier.eval.ts` (create), `evals/agents/plan-verifier/plan-verifier.cases.ts` (create), `evals/agents/plan-verifier/fixtures/redact-clone-url.plan.md` (create), `evals/agents/plan-verifier/fixtures/redact-clone-url-defect.diff` (create), `evals/agents/plan-verifier/fixtures/redact-clone-url-clean.diff` (create). Scaffold with `pnpm eval:scaffold --agent plan-verifier`; remove `.gitkeep`.
- **Change:**
  - `redact-clone-url.plan.md`: a minimal plan in the implementation-planner format (`Status: approved`, `Execution: single-agent`, `Spec: none (eval fixture)`, AC1–AC2, *Decisions needed* "None.", one group G1, one step S1, *Tests*, *Migrations & contracts* "None.", *Out of scope*, `<!-- implementer-brief:end -->`). S1: add `export function redactCloneUrl(url: string): string` to `server/src/modules/repos/helpers.ts` (beside `withForgeToken`, line 166) that clears **both** username and password of an https URL and returns non-URL input unchanged; Tests row: `server/test/repo-url.test.ts` (modify, unit) asserts the token and the username are gone. AC1: "a redacted URL contains neither the token nor the username". Done-when: `cd server && pnpm typecheck` and the unit test.
  - `redact-clone-url-defect.diff`: adds the function but clears only `username` (password/token survives) and a test that asserts only the username — AC1 is not delivered.
  - `redact-clone-url-clean.diff`: correct function + a test asserting both.
  - Both diffs apply to HEAD (real hunk headers for `helpers.ts` and `server/test/repo-url.test.ts`).
  - Prompt builder: "Plan: `evals/agents/plan-verifier/fixtures/redact-clone-url.plan.md` (approved; read it from that path). Diff source: the patch below, given inline and NOT applied to the working tree — verify against the patch; read repo files only as context. Bash is not available, so no check can be re-run; no full integration run was provided." + the diff.
  - Case 1 (`"finds the unredacted token against AC1 and cites the line"`, threshold 0.8, maxTurns 25): practices — marks AC1 (or S1) `partial`, `missing` or `contradicted`, never `met`; cites the `helpers.ts` line of the patch that leaves the password in place as `path:line`; lists a gap for fix mode; Result is `incomplete` or `contradicted`.
  - Case 2 (`"does not fabricate a gap for a complete patch"`, threshold 1.0, maxTurns 25): practices — no item `partial`/`missing`/`contradicted`; Done-when/test runs reported `not-verifiable`, not `missing`; Result is `complete — needs sign-off` (D3).
- **Layer / why here:** tool tier; plan read by path because the agent refuses a pasted plan (`.claude/agents/plan-verifier.md:37-44`) and a `draft` one (`:51-53`).
- **Skills to apply:** `typescript-expert`, `security`
- **Practices:** every status/result string in a practice is copied from `plan-verifier.md` *Statuses*/*Result* (lines 186-201); fixture plan targets real paths only; `.plan.md` lives under `evals/agents/plan-verifier/fixtures/`, never `docs/plans/`; diffs pass `git apply --check`.
- **Known gotchas:** root `INSIGHTS.md` 2026-10-09 (as S4); "2026-09-30 — an untracked plan file makes R3 … unprovable" — the agent may flag the fixture plan as untracked; the prompt states it is a committed eval fixture.
- **Done when:** `cd evals && pnpm typecheck` · `pnpm exec vitest list agents/plan-verifier` lists 2 tests · `cd .. && git apply --check evals/agents/plan-verifier/fixtures/redact-clone-url-defect.diff && git apply --check evals/agents/plan-verifier/fixtures/redact-clone-url-clean.diff`.

### M1 — [main session, background] Local model runs and per-case timing
- **Run:** `cd evals && pnpm vitest run skills/onion-architecture skills/engineering-insights agents/security-reviewer agents/plan-verifier agents/architecture-reviewer` (background).
- **Cost:** subscription only, no API spend: 18 task sessions (8 onion + 2 insights + 4 new agent cases + 4 architecture-reviewer cases, the D2 re-baseline) + as many judge calls (Sonnet); est. 20–40 min wall-clock, sequential within each file.
- **Done when:** every new case has a record in `results/records.jsonl` (outcome may be fail: scores are data, not a gate); each agent case's `metrics.durationMs` < 180 000 — else that case goes back to G2 fix mode with a smaller fixture; no record of an `agents/*` case lists `Bash`, `Write` or `Edit` in `trace.tools` (`jq` over `records.jsonl`); `git status --porcelain` unchanged apart from the plan's files. Record the duration table under *Handoffs → M1*.

### M2 — [main session, background] With/without-skill benchmark
- **Run:** `cd evals && pnpm eval:benchmark skills/onion-architecture -n 5` (background).
- **Cost:** 8 cases × 5 runs × 2 configs = 80 Haiku sessions + up to 80 Sonnet judge calls on the subscription; est. 1.5–2 h; watch for subscription rate limits (benchmark is sequential by design, `benchmark.ts`).
- **Done when:** `results/benchmarks/<ts>/benchmark.md` and `benchmark.json` exist and both configs have 40 records; path noted under *Handoffs → M2*.

### S6 — Commit the benchmark summary and fix the README
- **Files:** `evals/docs/benchmarks/<YYYY-MM-DD>-onion-architecture.md` (create; date = M2 run date), `evals/README.md` (modify)
- **Change:** summary doc: header (date, git sha, model `claude-haiku-4-5`, judge `claude-sonnet-5`, n=5, command), the candidate/baseline/Δ table and the analyst flags copied from M2's `benchmark.md`, the per-practice lines that moved most, and a 3–5 line reading (where the skill adds lift, which practices are `non_discriminating`). README: replace lines 293-295 ("ships with no example cases…") with the real suites list (skills: dependency-checker, onion-architecture, engineering-insights; agents: architecture-reviewer(-lite), security-reviewer, plan-verifier; workflow); in *Safety* (line ~577) add that `agentTask` removes `Bash`/`Write`/`Edit`/`MultiEdit`/`NotebookEdit` via `disallowedTools`; add one line under `eval:benchmark` pointing to `evals/docs/benchmarks/`.
- **Layer / why here:** docs of the evals package.
- **Skills to apply:** none
- **Practices:** numbers copied from M2 output, not recomputed; no claim of lift the table does not show; English only.
- **Known gotchas:** root `INSIGHTS.md` 2026-09-28 — a Done-when grep on Markdown must use one token.
- **Done when:** `ls evals/docs/benchmarks/` shows the file · `tr '\n' ' ' < evals/README.md | grep -o 'ships with \*\*no example cases\*\*'` prints nothing · `grep -n disallowedTools evals/README.md` finds the Safety line.

### Final checks (main session, after G3)
`cd evals && pnpm typecheck && pnpm eval:quality && pnpm vitest run src/records/stats.test.ts` · `CI_DETECT_ALL=1 node scripts/ci-detect.mjs` lists `onion-architecture`, `engineering-insights`, `security-reviewer`, `plan-verifier` · `CHANGED_FILES=$'.claude/agents/plan-verifier.md' node scripts/ci-detect.mjs` selects `agents/plan-verifier`.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `evals/skills/onion-architecture/onion-architecture.eval.ts` | content (model, `skillTask`) | AC1, AC2 | S2, M1, M2 |
| `evals/skills/engineering-insights/engineering-insights.eval.ts` | content (model) | AC4 | S3, M1 |
| `evals/agents/security-reviewer/security-reviewer.eval.ts` | tool (model, `agentTask`) | AC3 | S4, M1 |
| `evals/agents/plan-verifier/plan-verifier.eval.ts` | tool (model, `agentTask`) | AC3 | S5, M1 |
| `evals/src/records/stats.test.ts` (existing, unchanged) | unit, no model | AC5 | final checks |

## Migrations & contracts
None.

## Out of scope
- `evals/vitest.config.ts` `testTimeout`/`hookTimeout` (user decision: stays 240 s); no per-test timeout argument either.
- `evals/src/artifacts/load.ts` (TQ1, D4: no extra skill files, no injected agent skills).
- Any file under `.claude/skills/onion-architecture/evals/**`, `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`.
- The dependency-checker zod practice (root INSIGHTS 2026-10-08), `.github/workflows/harness-evals.yml`, `evals/scripts/**`.
- Writing `INSIGHTS.md`/gotchas (main session wrap-up only).

<!-- implementer-brief:end -->

## Context applied
- root `INSIGHTS.md` 2026-10-11 allowedTools/sandbox → S1 (D2).
- root `INSIGHTS.md` 2026-10-09 upstream architecture-reviewer cases → S4, S5 practices and real fixture paths.
- root `INSIGHTS.md` 2026-10-11 green harness-evals run / 240 s timeout → M1 timing gate, TQ3.
- root `INSIGHTS.md` 2026-10-08 zod practice → S3 practice self-check; out of scope.
- root `INSIGHTS.md` 2026-10-11 eval record outcome fallback → not hit: all new cases are judge cases (`case.ts` `runQualityCases` records the verdict).
- root `INSIGHTS.md` 2026-10-11 doc-routing eval question → S3 fixture design.
- `evals/README.md` (case layout, benchmark semantics, "low lift is a task-design signal"), `.claude/skills/onion-architecture/evals/eval.md`, `evals.json`, `expected-findings.json`.
- No `evals/AGENTS.md` or `evals/insights/gotchas.md` exists.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | S3 | — |
| `onion-architecture` | preload | — | evals/ is not a layered package; the skill is the S2 subject, not a rule for its code |
| `typescript-expert` | on demand (S1) | S1–S5 | — |
| `security` | on demand (S1) | S1–S5 | — |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| evals | `src/config.ts`, `src/tasks.ts` | engine | changed |
| evals | `skills/onion-architecture/` | content-tier suite | new |
| evals | `skills/engineering-insights/` | content-tier suite | new |
| evals | `agents/security-reviewer/` | tool-tier suite | new |
| evals | `agents/plan-verifier/` | tool-tier suite | new |
| evals | `docs/benchmarks/`, `README.md` | docs | new / changed |

## Design notes
### Pass-1 requirements review (resolved)
- TQ1 `skillContent()` injects only `SKILL.md` + `references/*.md` (`load.ts:19-31`); onion's `layer-map.md`/`enforcement.md` and engineering-insights' `entry-quality.md` never reach the candidate — accepted.
- TQ2 the skill-creator onion task needs tools; content tier has none (`run-claude.ts:74-78`) → numbered inline fixtures, eval.md `findings` block, threshold 0.8.
- TQ3 agent budget `maxTurns` 25, local ≤ ~180 s.
- TQ4 engineering-insights positive case → `server/INSIGHTS.md` + gotchas.
- REC1 → D1, REC2 → D2 (12 of 15 `architecture-reviewer` records in `evals/results/records.jsonl` used `Bash`), REC3 → D3, REC4 → D5, REC5 → D6.

### Pass-1 options (resolved, see *Decisions recorded*)
| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Onion fixture source | A: read in place · B: copy into `evals/` | A |
| D2 | Agent-session isolation | A: `disallowedTools` in `agentTask` · B: sandbox worktree · C: none | A |
| D3 | plan-verifier fixture | A: approved `*.plan.md` by path + inline patch · B: sandbox with applied patch | A |
| D4 | Inject declared agent skills | A: no · B: yes | A |
| D5 | Benchmark | A: onion, subscription · B: dependency-checker | A |
| D6 | Summary location | A: `evals/docs/benchmarks/` + README · B: README · C: Verification log | A |
| D7 | Execution mode | multi-agent · single-agent | multi-agent |

### Why onion runs content-tier
skill-creator ran these cases with tools (`skill-evals/onion-architecture/iteration-5/benchmark.md`: 100% both old and new skill, ~53 s, ~60k tokens). The content tier measures the `SKILL.md` text alone, and the benchmark baseline (no skill) is the comparison skill-creator never ran. A lower pass rate than iteration-5 is expected and not a regression: no `layer-map.md`, no `check-module.sh`, Haiku instead of the skill-creator model.

## Risks & open questions
- D2 changes every `agents/*` run, including `architecture-reviewer`: its new records are not comparable with the pre-plan history (12/15 used Bash). Mitigation: M1 re-runs it once to set a new baseline.
- `disallowedTools` is trusted to remove Bash in the SDK (`workflowTask` relies on it, `config.ts:33`); 7 older workflow records still list Bash, likely pre-`0d1de7d`. M1's `jq` check proves it for agent runs; if Bash still appears, stop and report (do not continue to M2).
- plan-verifier/security-reviewer are `model: opus` with `maxTurns` 40–60 in production; here Haiku with 25 turns, without preloaded skills (D4) and reading root `INSIGHTS.md` (~500 lines). The 180 s gate may force smaller fixtures; on CI (DeepSeek) the 240 s timeout likely still hits — accepted, non-blocking (plan 31).
- plan-verifier may answer *Clarification needed* because the plan path is not under `docs/plans/`; if M1 shows that, fix the prompt wording (fix mode on S5), not the agent.
- `onion-architecture` is not a token in `evals/workflow/*.cases.ts`, so an onion `SKILL.md` change runs only its skill suite in CI, not the workflow tier (`ci-detect.mjs:137-139`) — by design.
- The S1 engine change (`evals/src/**`) triggers the CI workflow tier on this PR (`ci-detect.mjs` header line 13).
- Benchmark on the subscription can be throttled; a crashed run prints "no records — run crashed" (`benchmark.ts`); re-run that config rather than editing results.

## Handed off
- architecture-reviewer: none (no server/client/reviewer-core code changes).
- security review: S1 only (tool restriction of model sessions running with `bypassPermissions` against the live repo); the S4 fixture is a deliberately unsafe diff that is never applied.

## Insights to record
- root `INSIGHTS.md` · What Doesn't Work — `agentTask`'s `allowedTools` never kept agent evals off Bash; `evals/results/records.jsonl` (12/15 architecture-reviewer traces) · `evals/src/tasks.ts:38-42` — only if not already covered by the 2026-10-11 workflow entry (likely an extension of it).
- root `INSIGHTS.md` · Session Notes — the first with/without onion-architecture benchmark result (after M2).

## Red-flags check
- [x] Every AC maps to at least one step or test (no-spec plans)
- [x] Every spec AC-n has a row in *Spec traceability* with a step or test — n/a, no spec
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; technical choices are in *Decisions needed*, product gaps are GAPn
- [x] Groups end type-checking; parallel groups share no file (none run in parallel)
- [x] No group under 3 files / ~80 lines that could merge with a neighbour — G3 is the stated exception (needs M2)
- [x] The brief above the marker is under ~20,000 characters
- [ ] Pass 1: only the pass-1 sections — n/a (pass 2)
- [x] Execution mode recommended per the D4 rule (multi-agent: ~8 steps > 5)
- [x] Every step's *Skills to apply* is complete (the implementer reads only those)
- [ ] `bash .claude/skills/sdd/scripts/sdd.sh plan-lint <plan>` prints `plan-lint: ok` — not run by the planner (Bash scope); main session runs it

## Handoffs → G1
Implementer run G1 (2026-10-11): S1–S3 done. `AGENT_DISALLOWED_TOOLS` exported at `evals/src/config.ts:38`, applied in `agentTask` after `...opts` (`evals/src/tasks.ts:44`). New suites: `evals/skills/onion-architecture/` (8 cases, fixtures read in place via a path derived from `import.meta.url`; no `fixtures/` folder) and `evals/skills/engineering-insights/` (2 cases + 2 fixture transcripts).
For G2: scaffold with `pnpm eval:scaffold --agent <name>`, remove `.gitkeep`, import only from `../../src/index.js` (`fixtureReader` is exported; `SKILLS_DIR`/`REPO_ROOT` are not — derive paths from `import.meta.url`).
Verified (no model): typecheck, `vitest list` 8 + 2 tests, `.claude/skills/onion-architecture` unchanged, eval:quality 0 failures, stats test 7 passed. Not verified: model behaviour, Bash absence in agent traces (M1).

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | S3 | — |
| `typescript-expert` | on demand | S1–S3 | — |
| `security` | on demand | S1–S3 | — |
| `onion-architecture` | preload | none | evals/ is not layered (subject of S2 only) |

## Handoffs → G2
Implementer run G2 (2026-10-11): S4–S5 done. New suites `evals/agents/security-reviewer/` (2 cases, 2 diffs) and `evals/agents/plan-verifier/` (2 cases, plan fixture + 2 diffs); all 4 diffs pass `git apply --check` and are never applied. Deviations (trivial): blame route calls `app.container.git.blame({ owner, name }, path)` directly (one-file diff); practices accept X4 or X1 plus source/sink quotes (D4: appsec skill not injected); plan fixture's *Save as* points at a fictional `docs/plans/99-…`.
Case names for M1: security-reviewer — `finds the unvalidated blame path reaching git argv`, `does not fabricate a finding for a local rename`; plan-verifier — `finds the unredacted token against AC1 and cites the line`, `does not fabricate a gap for a complete patch`. If plan-verifier answers "Clarification needed", fix `verifyPrompt` wording in its cases file.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `typescript-expert` | on demand | S4, S5 | — |
| `security` | on demand | S4, S5 | — |
| `onion-architecture` | preload | none | evals/ not layered |
| `engineering-insights` | preload | none | wrap-up is the main session's |

## Handoffs → M1
Main-session run 2026-10-11 (subscription, Haiku task / Sonnet judge), 18 sessions, 684 s wall-clock; 11 passed / 7 failed (scores are data, not a gate). Gates: every agent case < 180 s (max 76.6 s) ✓ · no `Bash`/`Write`/`Edit`/`MultiEdit`/`NotebookEdit` in any new record's `trace.tools` ✓ · `git status --porcelain` unchanged ✓.

| Suite · case | Result | Score | Duration |
|---|---|---|---|
| engineering-insights · writes nothing (no finding) | PASS | 1 | 9.5 s |
| engineering-insights · records a real server finding | PASS | 1 | 20.3 s |
| onion · case-1 / 3 / 4 / 6 / 7 / 8 | PASS | 1 / 0.8 / 0.8 / 1 / 0.83 / 1 | 30–109 s |
| onion · case-2 / case-5 | FAIL | 0.6 / 0.6 | 56 / 57 s |
| security-reviewer · finds the blame path | FAIL | 0.75 | 76.6 s |
| security-reviewer · local rename (negative) | PASS | 1 | 29.8 s |
| plan-verifier · finds the unredacted token | FAIL | 0.75 | 34.9 s |
| plan-verifier · complete patch (negative) | FAIL | 0.33 | 21.2 s |
| architecture-reviewer · checkout / out-of-scope / reviewer-core / benign | FAIL / PASS / FAIL / PASS | 0.83 / 1 / 0.67 / 1 | 76 / 43 / 17 / 32 s |

Eval-design gaps found (fix mode, G2 files):
- **M1-GAP1** security-reviewer practice "ends with a verdict line that says PASS or BLOCK" contradicts the agent's own template (verdict sits in the header: `**Verdict:** BLOCK`); the agent did give BLOCK. Reword to "states a PASS or BLOCK verdict".
- **M1-GAP2** plan-verifier clean case: the fixture plan's AC2 ("non-URL / non-https input returned unchanged") has no test in the "complete" patch, so the agent marked AC2 `partial` — a fair call. The clean diff must also test AC2 (or the fixture plan's Tests row must cover it) so the patch is genuinely complete.
Agent-quality misses kept as data: plan-verifier found the defect but gave no `path:line`; onion case-2/5 below threshold.
- 2026-10-11 implementer fix mode M1-GAP1/M1-GAP2: closed. GAP1 — the security-reviewer defect case now expects "a verdict, PASS or BLOCK, in the report header" (BLOCK not required: the agent issues BLOCK only for an in-change CRITICAL). GAP2 — both plan-verifier diffs gained an AC2 test ("returns non-https input unchanged"); the fixture plan's Tests row names AC1 and AC2; the defect diff's only gap is still the unredacted password. `git apply --check` (4 diffs), typecheck, `vitest list` (4 tests) pass. Re-run of the affected cases deferred until M2 finishes (shared subscription rate limit). Pre-existing, out of scope: `evals/agents/architecture-reviewer/fixtures/checkout-service.diff` does not `git apply --check` (targets non-existent `server/src/modules/checkout/*`).

## Handoffs → M2
Main-session run 2026-10-11 (subscription: Haiku task, Sonnet judge), `pnpm eval:benchmark skills/onion-architecture -n 5` from 19:52. The process was killed at the 2 h background-command limit during baseline 5/5 (4 of 8 records written, run `20261011T184647`). The missing run was re-run with the exact per-run invocation the benchmark uses (`EVAL_CONFIG=baseline EVAL_QUIET=1 vitest run --reporter=dot skills/onion-architecture`), and the report was rebuilt by a scratchpad copy of `src/records/benchmark.ts` whose only change is the record source (records from line 243, the partial run dropped); repo code unchanged.
Report: `evals/results/benchmarks/2026-10-11T19-03-26-504Z/benchmark.md` + `benchmark.json` (gitignored), 40 records per config.
- pass_rate candidate **75%** vs baseline **35%** → **lift +40 pp**; per-run scores candidate 90/85/88/83/76 %, baseline 63/60/64/66 % + rerun.
- tokens_out 9050 ± 3945 vs 7271 ± 3693; duration 83.1 ± 36.5 s vs 66.3 ± 30.9 s (`cost_regression` flag: the skill costs ~25 % more output).
- Flags: `always_failing` core/threshold.ts process.env practice (0/5 both); several `non_discriminating` practices (negatives and easy positives pass without the skill); `flaky` on most skill-dependent positives.
- G3 (S6) writes the committed summary from this report.
- 2026-10-11 main-session re-run of the fixed cases (subscription, 4 sessions, no Bash/Write/Edit, all < 82 s): **M1-GAP1 closed** — the header-verdict practice now passes; the security-reviewer defect case still fails one practice (does not name X4/X1 — expected under D4, the appsec skill is not injected; kept as data). **M1-GAP2 closed** — the clean plan-verifier case no longer reports a `partial` AC2 (fixture now complete); it now fails because the agent reports `Result: complete · 0 not-verifiable` and treats the Done-when commands (typecheck, unit test) as met although Bash is unavailable — a real agent overclaim the case is meant to catch, kept as data. The defect case still finds the unredacted password without a `path:line` (data).

## Handoffs → G3
Implementer run G3 (2026-10-11): S6 done — `evals/docs/benchmarks/2026-10-11-onion-architecture.md` (new; header, rebuild note, summary + per-case tables, flags, reading; numbers copied from `benchmark.md`) and `evals/README.md` (real suites list replaces "no example cases"; `eval:benchmark` points to `evals/docs/benchmarks/`; Safety names the `agentTask` `disallowedTools`). Noted, not scanned: other README illustrations may still read as if the package had no cases.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| — | — | — | no skill listed for S6 |
- 2026-10-11 plan-verifier (full pass): **incomplete** — 64/71 met, gaps S2/P2 (onion cases derived the fixture path from `import.meta.url` because G1 wrongly claimed the barrel does not export `SKILLS_DIR`; `evals/src/index.ts:28` re-exports `artifacts/paths.js`) and S6/P6 (summary said "all" negatives are `non_discriminating`; the report flags 7 of 10, and the case-8 negative is 60% without the skill). Not-verifiable: D12/D15 (`git apply --check` outside the verifier's commands), R4 (no test-writer; eval suites are model cases).
- 2026-10-11 main-session fix: S2/P2 — `onion-architecture.cases.ts` now uses `join(SKILLS_DIR, "onion-architecture", "evals", "fixtures")` from the barrel; `node:url`/`dirname` import removed (same folder: `SKILLS_DIR = REPO_ROOT/.claude/skills`). Done-when: typecheck ok, `vitest list skills/onion-architecture` → 8 tests (collect loads the fixtures).
- 2026-10-11 main-session fix: S6/P6 — `evals/docs/benchmarks/2026-10-11-onion-architecture.md` now lists 7 of 10 negatives as `non_discriminating` with the three exceptions, and the reading says "most negative practices … (the case-8 negative drops to 60% without it)".
- 2026-10-11 main session ran `git apply --check` on the 4 security-reviewer / plan-verifier fixture diffs: all ok (D12, D15).
- 2026-10-11 architecture-reviewer: PASS; F1 (MEDIUM, path built by hand) = S2 gap above, now fixed. security-reviewer: PASS, no findings; manual-check suggestions recorded for the user (subagent `Task`/`Agent` and `WebFetch`/`WebSearch` still available in `agentTask`; `evals/agents/*/fixtures/**` not in CLAUDE.md *Do not touch*).
- 2026-10-11 plan-verifier delta (S2/P2, S6/P6, D12, D15, R4): **complete** — 71/71 met, no gaps, nothing needs sign-off.
- 2026-10-11 the user chose option A: plan 32 closed as **done** after the complete verification; the security-reviewer hardening (disallow `Task`/`Agent`/`WebFetch`/`WebSearch` in `agentTask`; list `evals/agents/*/fixtures/**` under *Do not touch*) is a separate follow-up fix.
