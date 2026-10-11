# Development Plan: evals follow-ups — agent-session hardening, results evidence, evals/AGENTS.md
Status: done
Save as: docs/plans/33-evals-follow-ups.md
Execution: single-agent
Spec: none (tooling + docs follow-up of plan 32)

## Goal & acceptance criteria
Close the plan 32 security-reviewer hardening notes, commit the eval evidence the lab checklist needs (`evals/results/` is gitignored, `.gitignore:30`), and give `evals/` a package rules file like the other packages.
- AC1: `AGENT_DISALLOWED_TOOLS` (`evals/src/config.ts:38`) also holds `Task`, `Agent`, `WebFetch`, `WebSearch`; a local re-run of the 4 agent suites leaves the repo's `git status --porcelain` identical before vs after.
- AC2: root `AGENTS.md` *Do not touch* covers `evals/agents/*/fixtures/**` and `evals/skills/*/fixtures/**` as deliberately defective eval inputs.
- AC3: `evals/docs/results-2026-10.md` holds (a) strict-v2 vs lite-v2, (b) the workflow trace + CI DeepSeek facts, (c) the onion benchmark pointer, (d) reproduce commands — every number equal to its source file.
- AC4: `evals/AGENTS.md` exists in the shape of `mcp-server/AGENTS.md`; `evals/CLAUDE.md` follows the repo symlink convention.

## Decisions needed
None open — see *Decisions recorded*. (Requirements review and the option table: below the marker, *Design notes*.)

## Decisions recorded
- 2026-10-11 the user approved the full plan ("так давай робити"). (user)
- 2026-10-11 the user answered "давай за рекомендаціями" (all as recommended):
  - D1 A — workflow evidence: `repeat-wf-sandbox.json` (47fd5e8, n=2, worktree-isolated) first; `repeat-wf-baseline.json` (248a17a) as an earlier row with the caveat that it predates isolation and one of its sessions wrote to the repo.
  - D2 A — one provenance line per series (sha, `dirty`, n, before/after the plan-32 Bash removal).
  - D3 A — update `evals/README.md` *Safety* in the hardening step.
  - D4 — Execution: single-agent (user override of the multi-agent default; ~5 steps, no logic change).
  - TQ1–TQ4 — defaults accepted (no `evals/insights/`, `evals/AGENTS.md` points to root `INSIGHTS.md`; `evals/CLAUDE.md` symlink to `AGENTS.md`; main-session `pnpm eval:workflow` + the 4 agent suites with `git status --porcelain` before/after; pass rate as `passed/total`, durations in s to 1 decimal as mean ± stddev).

## Prerequisites
- Logged-in Claude Code subscription for M1 (default `EVAL_BACKEND`; no API key, no OpenRouter cost). No new dependencies.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| all | S1–S4 | evals (config, docs) + root `AGENTS.md` | — | list of changed files; the final `AGENT_DISALLOWED_TOOLS` literal |
| M1 | main session | local model runs (agents + workflow) | all | result table + `git status` proof → *Handoffs → M1* |

Single-agent: one implementer run with `all`. S1–S4 touch disjoint files.

## Steps

### S1 — Remove spawn and web tools from agent eval sessions
- **Files:** `evals/src/config.ts` (modify), `evals/README.md` (modify, *Safety* section only, lines 578-583)
- **Change:** in `config.ts:36-38` set the literal to exactly `["Bash", "Write", "Edit", "MultiEdit", "NotebookEdit", "Task", "Agent", "WebFetch", "WebSearch"]`. Reword the comment above it (≤3 lines): remove Bash, every mutating tool, subagent spawning (`Task`/`Agent`: subagent tool calls never reach `trace.tools`, root `INSIGHTS.md` 2026-10-11) and web access. In README *Safety*, change the `agentTask` sentence to list all nine tools and add one sentence: prove an agent eval left the repo alone with `git status --porcelain` before vs after, not with `trace.tools`.
- **Layer / why here:** `config.ts` holds every tunable and imports nothing (`config.ts:1-5`). `tasks.ts:44` already passes the constant after `...opts`, so it needs no change.
- **Skills to apply:** `typescript-expert`, `security`
- **Practices:** a plain `string[]` like `WORKFLOW_DISALLOWED_TOOLS` (`config.ts:33`); `config.ts` gains no import; `SPAWN_TOOLS`, `WORKFLOW_*`, `tasks.ts`, `load.ts` are not changed; README edits stay inside *Safety*.
- **Known gotchas:** root `INSIGHTS.md` 2026-10-11 "no Bash/Write/Edit in `trace.tools` does not prove…" and "`allowedTools` and a PreToolUse deny hook do not keep an SDK workflow eval read-only" (only `disallowedTools` removes tools under `bypassPermissions`).
- **Done when:** `cd evals && pnpm typecheck` · `cd evals && pnpm exec tsx -e "import('./src/config.ts').then(m=>console.log(m.AGENT_DISALLOWED_TOOLS.join()))"` prints `Bash,Write,Edit,MultiEdit,NotebookEdit,Task,Agent,WebFetch,WebSearch` · `grep -F WebSearch evals/README.md` and `grep -F porcelain evals/README.md` match · `git diff --quiet -- evals/src/tasks.ts evals/src/artifacts/load.ts` exits 0.

### S2 — Extend the root fixtures do-not-touch rule to harness-eval fixtures
- **Files:** `AGENTS.md` (modify; repo root, *Do not touch*, the bullet at lines 175-178). Do **not** touch `CLAUDE.md` (a symlink to it).
- **Change:** extend the existing `.claude/skills/*/evals/fixtures/**` bullet (do not add a second bullet) so it also names `evals/agents/*/fixtures/**` and `evals/skills/*/fixtures/**`. Those are harness-eval inputs inlined into prompts. Many are deliberately defective (seeded violations, incomplete patches) and are scored by the case's `practices` in `evals/<tier>/<name>/*.cases.ts`. Keep the existing rules for all three paths: exclude from searches, never fix or reformat, never report as findings, edit only together with the case or answer key that scores them.
- **Layer / why here:** root `AGENTS.md` *Do not touch* is the one list every session loads.
- **Skills to apply:** none (Markdown)
- **Practices:** an in-place edit of one bullet; the rest of the file is byte-identical; English.
- **Known gotchas:** root `CLAUDE.md` *Do not touch*: `*/CLAUDE.md` is a symlink. Edit the target, never replace the link.
- **Done when:** `grep -F 'evals/agents/*/fixtures/**' AGENTS.md` and `grep -F 'evals/skills/*/fixtures/**' AGENTS.md` match · `readlink CLAUDE.md` prints `AGENTS.md` · `git diff --stat -- AGENTS.md` shows only `AGENTS.md`.

### S3 — Add `evals/AGENTS.md` and its `CLAUDE.md` symlink
- **Files:** `evals/AGENTS.md` (create), `evals/CLAUDE.md` (create: `cd evals && ln -s AGENTS.md CLAUDE.md`)
- **Change:** a package rules file in the shape of `mcp-server/AGENTS.md` (≤ ~70 lines), with sections in this order:
  1. title `# evals/ — \`@devdigest/evals\``; one line: harness evals (skills, agents, `CLAUDE.md` workflow), vitest + Claude Agent SDK; package manager **pnpm**.
  2. first-step line: `evals/` has no `insights/`; its lessons are in the root `INSIGHTS.md` (`grep '^### '`, then open the evals entries). Create no `evals/insights/` (TQ1).
  3. **Commands**, taken only from `evals/package.json`: `pnpm typecheck` · `pnpm eval:quality` (no model) · `pnpm vitest run src/records/stats.test.ts` (no model) · `pnpm eval:skills` / `eval:agents` / `eval:workflow` / `eval` (model, subscription by default; `EVAL_BACKEND=openrouter` → README) · `eval:repeat` / `eval:delta` / `eval:compare` / `eval:benchmark` / `eval:scaffold` · `proxy:up` / `proxy:down` / `proxy:wait`.
  4. **Which eval after which change**: one line pointing to the root `AGENTS.md` *Harness evals* table and README *Which change → which run*. No copy of the table.
  5. **Layout**: pointers to README *Module layout* and *Case layout*. `results/` is gitignored: committed evidence goes in `docs/` (`docs/results-2026-10.md`, `docs/benchmarks/`).
  6. **Safety**: model sessions run under `bypassPermissions`. `agentTask` removes the nine tools via `disallowedTools`. `workflowTask` runs in a throwaway worktree and fails on a change to the real repo. Prove isolation with `git status --porcelain` before vs after, never with `trace.tools`. Revert anything an eval session wrote. `agents/*/fixtures/**` and `skills/*/fixtures/**` are do-not-touch (root `AGENTS.md`).
  7. **Gotchas**: pointers (titles + dates) to these root `INSIGHTS.md` entries, with no new one-liners: the two 2026-10-11 isolation entries; "a Claude Code background command dies at 2 h…"; "an eval record's outcome falls back to…"; "a doc-routing eval question must be unanswerable…"; plus the vitest substring trap that `eval:repeat` works around (`src/repeat.ts` `resolveEvalPatterns`).
  8. **Read on demand**: `README.md`, `docs/results-2026-10.md`, `docs/benchmarks/`, `docs/eval-stats-upgrade.md`, `../docs/plans/31-harness-evals-ci.md`, `32-evals-coverage.md`, `33-evals-follow-ups.md`.
- **Layer / why here:** every package keeps `AGENTS.md` + `CLAUDE.md -> AGENTS.md` (`ls -l */CLAUDE.md`).
- **Skills to apply:** none (Markdown)
- **Practices:** every command exists in `evals/package.json`; every path cited exists; it points to the README and the root table instead of copying them; English; a relative symlink (target `AGENTS.md`), not a copy.
- **Known gotchas:** root `INSIGHTS.md` 2026-10-11 "a doc-routing eval question must be unanswerable from the always-loaded docs". Don't put facts that `evals/workflow/*.cases.ts` asks about into this file (check that the routing questions stay unanswerable from it).
- **Done when:** `readlink evals/CLAUDE.md` prints `AGENTS.md` · `ls -l evals/CLAUDE.md` shows `CLAUDE.md -> AGENTS.md` · `grep -F eval:quality evals/AGENTS.md`, `grep -F disallowedTools evals/AGENTS.md`, `grep -F porcelain evals/AGENTS.md`, `grep -F 'fixtures/**' evals/AGENTS.md`, `grep -F results-2026-10.md evals/AGENTS.md` each match · `test ! -e evals/insights`.

### S4 — Commit the eval evidence as `evals/docs/results-2026-10.md`
- **Files:** `evals/docs/results-2026-10.md` (create)
- **Change:** sections:
  1. **(a) Two agent versions, same cases, n=5** — `architecture-reviewer` (strict-v2) vs `architecture-reviewer-lite` (lite-v2). Two provenance lines, each printed by `jq -r '"\(.label) · sha \(.git_sha) · dirty \(.dirty) · n=\(.times)"' evals/results/repeat-<label>.json`, plus the note: recorded before plan 32 removed Bash from agent sessions (`6d8a5b1`), so not comparable with later records. Header `| Test | strict-v2 pass | strict-v2 duration | lite-v2 pass | lite-v2 duration |`. Rows = the **verbatim** output of command A (below). Then 2–4 reading lines, claims only from the table (spread = stddev + per-test pass rate).
  2. **(b) Workflow trace: dispatch, positive activation, negative control** — the wf-sandbox provenance line (same jq), then header `| Test | pass | duration |` and rows = verbatim command B on `repeat-wf-sandbox.json`. A role list: dispatch = "a new feature request starts at brainstormer or spec-creator…" and "API-route task … pulls the architecture-reviewer"; positive activation = "engineering-insights activates on a genuine discovery"; negative controls = the two "near-miss negative" cases. Then wf-baseline as the earlier series: its provenance line, a caveat (before the worktree sandbox, `265bda3`; one of its feature-case sessions wrote to the repo, root `INSIGHTS.md` 2026-10-11), and verbatim command B rows on `repeat-wf-baseline.json`. Then **CI (DeepSeek via OpenRouter)**: the plan 31 *Verification log* facts for PR #21 run 2 (`6ca27f4`), copied as written: workflow 7/9 (TESTING.md routing miss; engineering-insights activation hit max turns 8; the subagent-dispatch case passed); architecture-reviewer 1/4 (3 × vitest `testTimeout` 240000 ms, not wrong answers); failures reported as `::warning`. Run 1 failed on an invalid secret (401).
  3. **(c) With/without-skill benchmark** — a link to `benchmarks/2026-10-11-onion-architecture.md`, plus one line. No numbers re-copied.
  4. **(d) Reproduce** — `cd evals && pnpm eval:repeat agents/architecture-reviewer -n 5 --label strict-v2`, the same for `agents/architecture-reviewer-lite --label lite-v2`, then `pnpm eval:delta strict-v2 lite-v2`; `pnpm eval:repeat workflow -n 2 --label wf-sandbox`; the benchmark command from that doc; commands A/B to rebuild the tables; note that `results/` is gitignored, so these JSON files are local.
- **Command A:** `cd evals && jq -rn --slurpfile s results/repeat-strict-v2.json --slurpfile l results/repeat-lite-v2.json 'def r: (./100|round)/10; def d: "\(.metrics.durationMs.mean|r) ± \(.metrics.durationMs.stddev|r) s"; $s[0].tests[] as $a | ($l[0].tests[] | select(.label==$a.label)) as $b | "| \($a.label) | \($a.pass.passed)/\($a.pass.total) | \($a|d) | \($b.pass.passed)/\($b.pass.total) | \($b|d) |"'`
- **Command B:** `cd evals && jq -r 'def r: (./100|round)/10; .tests[] | "| \(.label) | \(.pass.passed)/\(.pass.total) | \(.metrics.durationMs.mean|r) ± \(.metrics.durationMs.stddev|r) s |"' results/repeat-<label>.json`
- **Layer / why here:** committed docs of the evals package, next to `docs/benchmarks/`.
- **Skills to apply:** none (Markdown)
- **Practices:** numbers pasted from commands A/B and the jq provenance line, never retyped or reformatted (keep jq's `18 s`, no `18.0`); no claim the tables don't show; no absolute paths from the JSON `nodeid`s; English.
- **Known gotchas:** root `INSIGHTS.md` 2026-09-28 — a Done-when grep on Markdown uses one token, or `grep -F` on a whole generated line.
- **Done when:** each loop below prints nothing (`cd evals` first):
  `<command A> | while IFS= read -r l; do tr '\n' ' ' < docs/results-2026-10.md | grep -qF -- "$l" || echo "MISSING: $l"; done`
  and the same with command B for `wf-sandbox` and for `wf-baseline`, and with the provenance jq for `strict-v2`, `lite-v2`, `wf-sandbox` and `wf-baseline` · `grep -F 2026-10-11-onion-architecture.md docs/results-2026-10.md`, `grep -F 240000 docs/results-2026-10.md`, `grep -F 7/9 docs/results-2026-10.md`, `grep -F eval:delta docs/results-2026-10.md` each match.

### M1 — [main session, background] Re-run the 4 agent suites + workflow, prove isolation
- **Run** (after S1–S4, subscription): `cd /Users/sergey/_projects/www/ai/dev-digest && SCRATCH=$(mktemp -d) && git status --porcelain > "$SCRATCH/before.txt"; wc -l < evals/results/records.jsonl` (note N; one shell, so `$SCRATCH` stays set) · `cd evals && pnpm eval:agents` (architecture-reviewer, architecture-reviewer-lite, security-reviewer, plan-verifier: 12 cases) · `pnpm eval:workflow` (9 cases, TQ3) · `git status --porcelain > "$SCRATCH/after.txt"; diff "$SCRATCH/before.txt" "$SCRATCH/after.txt"`.
- **Cost:** about 21 Haiku sessions + Sonnet judge calls on the subscription, no API spend. Est. 15–25 min wall-clock (plan 32 M1: 18 sessions in 684 s; agent cases ≤ ~80 s).
- **Done when:** the `diff` is empty · `tail -n +$((N+1)) evals/results/records.jsonl | jq -r 'select(.nodeid|contains("/agents/")) | .trace.tools[]' | sort -u` lists none of `Bash Write Edit MultiEdit NotebookEdit Task Agent WebFetch WebSearch` · the per-case result table (outcome, score, duration) is recorded under *Handoffs → M1*, next to plan 32 *Handoffs → M1* (architecture-reviewer 2/4, security-reviewer 1/2, plan-verifier 0/2 before the fix-mode re-run; lite had no M1 row), and next to the 4 cases in wf-sandbox. Scores are data, not a gate. A non-empty diff is a stop: report the paths and revert them.

### Final checks (main session)
`cd evals && pnpm typecheck && pnpm eval:quality && pnpm vitest run src/records/stats.test.ts` · `bash .claude/skills/sdd/scripts/sdd.sh plan-lint docs/plans/33-evals-follow-ups.md`.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `evals/src/records/stats.test.ts` | unit (no model, unchanged) | regression guard for the package | S1, final |
| `evals/agents/*/*.eval.ts` (4 suites) | model, tool tier | AC1 isolation + no spawn/web tools in traces | M1 |
| `evals/workflow/review-workflow.eval.ts` | model, workflow tier | TQ3: AGENTS.md changes do not break routing | M1 |
| jq loops (S4 Done when) | doc check | AC3 numbers | S4 |

No new test file: the change is a constant and docs.

## Migrations & contracts
None.

## Out of scope
- `evals/src/tasks.ts`, `load.ts`, `runtime/**`, `vitest.config.ts` (incl. the CI-only timeout follow-up from plan 31).
- Any `fixtures/**`, `*.cases.ts`, `.claude/agents/*.md` frontmatter.
- `evals/results/**` (gitignored; read only); creating `evals/INSIGHTS.md` or `evals/insights/`.
- Root `CLAUDE.md`, `INSIGHTS.md`; other packages' `AGENTS.md`.

<!-- implementer-brief:end -->

## Context applied
- root `INSIGHTS.md` 2026-10-11 "no Bash/Write/Edit in `trace.tools`…" → S1 tool list, M1 `git status` proof.
- root `INSIGHTS.md` 2026-10-11 "`allowedTools` and a PreToolUse deny hook…" → S1 (`disallowedTools` only); D1 caveat on wf-baseline.
- root `INSIGHTS.md` 2026-10-11 "a doc-routing eval question must be unanswerable…" → S3 gotcha.
- root `INSIGHTS.md` 2026-10-11 "a Claude Code background command dies at 2 h" → M1 run in the background, well under 2 h.
- `docs/plans/31-harness-evals-ci.md` Verification log (PR #21 run 2) → S4 (b) CI facts.
- `docs/plans/32-evals-coverage.md` *Handoffs → M1* → M1 comparison baseline.
- `evals/scripts/ci-detect.mjs:144-148` → the PR runs the workflow tier for the AGENTS.md changes; `evals/src/**` is a harness file (line 13).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | Context applied | — |
| `onion-architecture` | preload | none | no server / reviewer-core / mcp-server code |
| `typescript-expert` | on demand (S1) | S1 | — |
| `security` | on demand (S1) | S1 | — |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| evals | `src/config.ts` | config (tool lists) | changed |
| evals | `README.md` *Safety* | docs | changed |
| evals | `AGENTS.md`, `CLAUDE.md` (symlink) | package rules | new |
| evals | `docs/results-2026-10.md` | docs | new |
| root | `AGENTS.md` *Do not touch* | repo rules | changed |

## Design notes

### Requirements review (pass 1)
- TQ1 — `evals/` has no `INSIGHTS.md`/`insights/`; the first-step line points to root `INSIGHTS.md`. TQ2 — add the `evals/CLAUDE.md` symlink (all 5 packages have one). TQ3 — `AGENTS.md` changes → `pnpm eval:workflow` (`AGENTS.md:36`), CI selects the workflow tier (`ci-detect.mjs:144-148`). TQ4 — `passed/total`, seconds to 1 decimal, mean ± stddev, via jq.
- Spec gaps: none.
- REC1 → D1: wf-sandbox (47fd5e8, after the `265bda3` worktree sandbox) first, wf-baseline (248a17a) with a caveat. REC2 → D2: provenance line per series (all `dirty: true`; strict/lite at 925251c, before `6d8a5b1`). REC3 → D3: README *Safety*.
- No conflict with the tool list: all four reviewer agents declare `tools: Read, Grep, Glob, Bash` (frontmatter line 4). None declares `Task`/`Agent`/`WebFetch`/`WebSearch`, and no case passes its own `allowedTools`.

### Options (pass 1)
| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Workflow evidence source | A: wf-sandbox primary + wf-baseline with caveat · B: wf-baseline only | A |
| D2 | Provenance caveats | A: per-series line · B: none | A |
| D3 | README *Safety* update | A: yes · B: no | A |
| D4 | Execution mode | multi-agent (rule: trust boundary) · single-agent | single-agent override accepted |

The caller asked for `single pass`. It was refused per the ≤3-file rule because the scope is 6 files.

### Why a jq-generated row format
The verifier must compare numbers exactly. Generating each table row with one jq line, and checking with `grep -qF` on the whole row, makes the check binary. No repo script is added.

## Risks & open questions
- Mode rule mismatch: the `agentTask` tool set is a trust boundary, so the rule says multi-agent; the user overrode to single-agent (D4). Mitigation: `security-reviewer` on its own trigger, with the plan path + diff.
- Whether the SDK's `disallowedTools` binds a spawned subagent stays unverified. That is moot once `Task`/`Agent` are removed. M1's trace check confirms that the main session no longer lists them.
- Removing `WebFetch`/`WebSearch` changes every agent run's tool set, so the records after M1 are a new baseline. Cases never needed web access, so a score shift would itself be a finding.
- `results/*.json` exist only on this machine (gitignored). The S4 jq checks cannot run on CI or another clone; the doc says so.
- jq prints integers without `.0` (e.g. `18 s`). The doc keeps jq's output verbatim, so the format check stays exact.
- `evals/CLAUDE.md` adds one more file that CI matches (`ci-detect.mjs:148`), so the PR runs the workflow tier, as intended.

## Handed off
- architecture-reviewer: none needed (no layered code); optional on `config.ts`.
- security review: `evals/src/config.ts` `AGENT_DISALLOWED_TOOLS` (tool surface of `bypassPermissions` sessions), README *Safety* wording, M1 isolation proof.

## Insights to record
- None expected. Candidate only if M1 shows a spawn/web tool in an agent trace despite `disallowedTools`: root `INSIGHTS.md` · Recurring Errors & Fixes.

## Red-flags check
- [x] Every AC maps to at least one step or test (AC1 S1+M1, AC2 S2, AC3 S4, AC4 S3)
- [x] Every spec AC-n has a row in *Spec traceability* — n/a, no spec
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; technical choices recorded (D1–D4), no product gaps
- [x] Groups end type-checking (S1 `pnpm typecheck`); single group, no parallelism
- [x] No group under 3 files / ~80 lines that could merge with a neighbour (one group)
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1: n/a (pass 2)
- [x] Execution mode per the D4 rule (multi-agent), user override to single-agent recorded
- [x] Every step's *Skills to apply* is complete
- [ ] `bash .claude/skills/sdd/scripts/sdd.sh plan-lint <plan>` prints `plan-lint: ok` — not run by the planner (outside its Bash allow-list); in *Final checks*

## Handoffs → all
Implementer run (2026-10-11): S1–S4 done. `AGENT_DISALLOWED_TOOLS` = Bash, Write, Edit, MultiEdit, NotebookEdit, Task, Agent, WebFetch, WebSearch (`evals/src/config.ts`); README *Safety* updated; root `AGENTS.md` *Do not touch* covers `evals/{agents,skills}/*/fixtures/**`; new `evals/AGENTS.md` + `evals/CLAUDE.md` → `AGENTS.md`; new `evals/docs/results-2026-10.md` (strict-v2 19/20 vs lite-v2 17/20; jq loops print no MISSING). Verified: typecheck, tsx probe, greps, readlink, jq loops, eval:quality 0 failures, stats 7 passed. Not verified: M1 (main session).

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `typescript-expert` | on demand | S1 | — |
| `security` | on demand | S1 | — |
| `onion-architecture` | preload | none | no server code |
| `engineering-insights` | preload | none | no new insight |

## Handoffs → M1
Main-session run 2026-10-11 22:31–22:50 (subscription, Haiku task / Sonnet judge, under `caffeinate`): `pnpm eval:agents` then `pnpm eval:workflow`, 21 records, `records.jsonl` lines 332–352 (runs `20261011T193948` agents, `20261011T194412` workflow). Isolation: `git status --porcelain` identical before and after ✓; none of the 9 disallowed tools in any new agent record's `trace.tools` ✓; every agent case ≤ 89 s.

| Suite | Passed | Change vs plan 32 M1 (n=1 each, new baseline after the tool-set change) |
|---|---|---|
| security-reviewer | 2/2 | defect case now passes (was 0.75) |
| plan-verifier | 0/2 | clean case 0.67 (was 0.33); defect case 0.75 (unchanged, still no `path:line`) |
| architecture-reviewer | 2/4 | checkout 0.83 (same); out-of-scope security now 0.5 (was PASS) |
| architecture-reviewer-lite | 2/4 | checkout 0.33; out-of-scope 0 |
| workflow | 7/9 | server-routing case: `server/insights/gotchas.md` not read; engineering-insights positive activation: not activated. Dispatch (`architecture-reviewer`), feature → `brainstormer`, both near-miss negatives pass. Workflow tools unchanged by this plan (`agentTask` only). |

The architecture-reviewer out-of-scope drop may come from the narrower tool set (no Bash/subagents) or from noise (n=1); measure with `eval:repeat agents/architecture-reviewer -n 5` if it matters.
- 2026-10-11 plan-verifier (full pass): **complete — needs sign-off** — 45/46 met, no gaps; not-verifiable R4 (single-agent plan, no test-writer). Noted: M1 handoff cited line 331 (off by one) — corrected to lines 332–352 with run ids.
- 2026-10-11 security-reviewer: PASS, no findings. Manual check: the denylist misses other SDK built-ins (`Monitor` with `command`/`ws`, `REPL`, `Workflow`, `EnterWorktree`, `CronCreate`, `RemoteTrigger`) and MCP is not pinned (`strictMcpConfig` unset); fix direction = allowlist via SDK `Options.tools` + `strictMcpConfig: true` in `runClaude`/`agentTask` (outside this plan's files → separate plan). Also: `researcher` declares WebSearch/WebFetch, so a future researcher eval would run without them.
- 2026-10-11 main-session fix (S1, S3 wording): `evals/README.md` *Safety* and `evals/AGENTS.md` *Safety* now say the nine tools are removed **by name** and that other SDK built-ins and MCP are not denied. Done-when re-run: `grep -F WebSearch` / `porcelain` on README match.
- 2026-10-11 **user sign-off**: R4 accepted (no test-writer stage in this single-agent plan). Plan closed as done. Follow-up, not in this plan: allowlist via SDK `Options.tools` + `strictMcpConfig: true` for `agentTask`.
