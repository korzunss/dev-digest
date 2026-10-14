# Development Plan: Split harness-evals CI into per-tier workflows
Status: done
Execution: multi-agent
Save as: docs/plans/39-split-harness-evals-ci.md
Spec: none (tooling/CI change — mentor follow-up to plan 31)

## Decisions recorded
- User, 2026-10-14 ("так", to "take everything per the recommendations and run the research?"): D1 = A (own `harness-evals-static.yml`) · D2 = A (one `ci-detect.mjs` + `CI_DETECT_TIER`) · D3 = A (composite actions) · D4 as recommended · D5 = A (`evals/src/ci-detect.test.ts`) · D6 as stated · D7 = A, with one real PR run as a sign-off item · D8 = multi-agent. TQ1–TQ3 → defaults (TQ3: the PR's CI workflow-tier run stands in for a local `pnpm eval:workflow`). REC1–REC4 accepted. External research on the two listed questions approved.
- Approved (user, 2026-10-14: "так"), as written — incl. the Design-notes assumptions: empty dispatch `scope` = `all`; `evals/proxy/**` re-runs agents and workflow only; exit 2 on a bad tier.
- Plan change after review (user, 2026-10-14: "так, давай за твоїми рекомендаціями", choosing option A over reverting): keep fix-loop 1's F1 (workflow-tier skill-mention rule counts only `.claude/skills/<n>/`) and F2 (`evals/src/**/*.test.ts` is not a harness change; `'!evals/src/**/*.test.ts'` in `harness-evals-workflow.yml` paths) as plan amendments — AC4, S1 Practices, *Shared definitions* and Design notes to be amended; README S3c fix follows in fix mode. D9/T3 accepted with actionlint scoped to `harness-evals-*.yml` (main session run 2026-10-14: rc 0; whole repo has only pre-existing `e2e-web.yml` SC2034). Main-session process note: F1/F2 were sent to fix mode without asking first; the verifier caught it.
- Branch: the plan lives on `L06_hw` (the user switched to it; already merged into `L06` via PR #26, so this needs a new PR).

## Goal & acceptance criteria
Replace `.github/workflows/harness-evals.yml` with one workflow per tier, so a failed tier is visible by file name and each tier triggers only on its own paths (mentor, 2026-10-14).
- AC1: three workflows `skills`, `agents`, `workflow` exist; `harness-evals.yml` is deleted.
- AC2: each workflow's `on.pull_request.paths` covers only its tier's rows of the root `AGENTS.md` *Harness evals* table, plus the shared engine paths.
- AC3: plan 31 behaviour is kept per tier: suite matrix from `ci-detect.mjs`, D3, D4, D5, D6 key handling, D1 rev 2 non-blocking, D7 proxy, model inputs, artifacts.
- AC4: no live doc names `harness-evals.yml`; `ci-detect.mjs` with no tier argument still prints today's output (root `INSIGHTS.md` 2026-10-11 reproduce command) for every change set except: (a) engine paths (the new engine table, TQ2); (b) any `evals/skills/<n>/**` change — the workflow tier no longer considers it: no `run_workflow=true` for a skill named in `evals/workflow/*.cases.ts`, and no "not referenced" info line for one that is not (F1, plan change); (c) `evals/src/**/*.test.ts` — no longer a harness change (F2, plan change).
- AC5: the tier selector is covered by a no-model unit test that the `static` workflow runs.

AC → steps: AC1 S5–S8 · AC2 S5–S7 · AC3 S1, S4–S7 · AC4 S1, S3 · AC5 S2, S8.

## Requirements review
### Clarifying questions
- TQ1 | No `ci-detect` tests exist (`git grep ci-detect` → script, docs only; `vitest.config.ts:7` includes `src/**/*.test.ts`). Add one? | default: yes, `evals/src/ci-detect.test.ts` spawns the script with `CHANGED_FILES` and asserts outputs (D5).
- TQ2 | Do the shared engine paths (`evals/scripts/**`, `package.json`, lock, `.github/actions/**`) re-run every suite in every tier, and `evals/proxy/**` only agents + workflow? | default: yes.
- TQ3 | Root `AGENTS.md:30` names `harness-evals.yml`; its table then requires `pnpm eval:workflow`. Run it locally, or accept the CI workflow-tier run on the PR? | default: CI run on the PR, logged in the Verification log.

### Spec gaps
None. Plan 31 decisions D1 rev 2, D3–D7 are kept unchanged (AC3).

### Recommendations
- REC1 | Keep one `ci-detect.mjs`, add a tier selector (`CI_DETECT_TIER=skills|agents|workflow`; unset = all, as today). Its rules (D3 mention, D5 engine) cannot be written as `paths:` globs; one script keeps one truth. → D2
- REC2 | A tier's own workflow file is engine for that tier only. → D2
- REC3 | Composite actions for setup and detect, not a reusable workflow: job names stay flat (`skills / detect`), no `secrets: inherit`. → D3
- REC4 | Validate with `docker run rhysd/actionlint` (Docker is installed; `actionlint` is not), plus `ci-detect` cases; YAML parse is covered by actionlint. → D7

## Decisions needed
None open — see *Decisions recorded* (options considered: Design notes → Pass-1 options).

## Prerequisites
- Docker running locally (for `rhysd/actionlint`, D7). The image is pulled on first use, which needs network. If the implementer cannot pull it, the main session runs the G2 actionlint Done-when.
- No new dependencies.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S3 | `evals/` script + test, docs (evals + root `AGENTS.md`) | — | `CI_DETECT_TIER` semantics (values, engine table, outputs per tier); the exact paths lists S5–S8 must use (copied from *Paths* below, unchanged) |
| G2 | S4–S8 | `.github/` composite actions + workflows | G1 | — |

## Shared definitions (used by S1, S3, S5–S8)
**Shared engine paths** (`ENGINE`): `evals/scripts/**`, `evals/package.json`, `evals/pnpm-lock.yaml`, `.github/actions/harness-evals-setup/**`, `.github/actions/harness-evals-detect/**`.

**Paths per workflow** (`on.pull_request.paths`, no `paths-ignore`; positive patterns, plus one `!` negation in the workflow file only, placed after the positive patterns — research: a later `!` pattern excludes):
| File | Paths |
|---|---|
| `harness-evals-skills.yml` | `.claude/skills/**`, `evals/skills/**`, ENGINE, the file itself |
| `harness-evals-agents.yml` | `.claude/agents/**`, `evals/agents/**`, `evals/proxy/**`, ENGINE, the file itself |
| `harness-evals-workflow.yml` | `CLAUDE.md`, `**/AGENTS.md`, `**/CLAUDE.md`, `**/insights/gotchas.md`, `.claude/settings.json`, `.claude/agents/**`, `.claude/skills/**` (the D3 mention rule; ci-detect decides), `evals/workflow/**`, `evals/src/**`, `'!evals/src/**/*.test.ts'` (F2; directly after `evals/src/**`), `evals/proxy/**`, ENGINE, the file itself. No `evals/skills/**`: the mention rule counts only `.claude/skills/<n>/` (F1) |
| `harness-evals-static.yml` | `evals/**`, `.claude/skills/**`, `.github/actions/harness-evals-setup/**`, the file itself |

**Engine table in ci-detect** (D5 per tier, TQ2): own workflow file → that tier only · ENGINE → all three tiers · `evals/proxy/**` → agents and workflow. Engine for `skills`/`agents` = every suite of that tier with evals; for `workflow` = `run_workflow=true`.

**Workflow-tier rules in ci-detect** (plan change F1/F2): the D3 skill-mention rule counts only `.claude/skills/<n>/` paths (an `evals/skills/<n>/` change is eval code and never sets `run_workflow`); `harnessFile` matches `evals/src/**` except `evals/src/**/*.test.ts`.

## Steps
### S1 — Add a tier selector to `ci-detect.mjs`
- **Files:** `evals/scripts/ci-detect.mjs` (modify)
- **Change:** read `CI_DETECT_TIER` (trimmed). Values `skills` | `agents` | `workflow`; unset or empty = all tiers. Any other value: print `error: CI_DETECT_TIER must be skills, agents or workflow` to stderr and exit 2 (assumption). Replace the `engineCategories` list (`ci-detect.mjs:121-127`, which names the deleted `harness-evals.yml`) with the *Engine table* above; each category carries its tiers, and `engineMode` becomes per tier. With a tier set: the other tiers' outputs are empty (`[]`, `false`, `""`); the "not referenced" info lines print only for tier `workflow` or unset; `SKIP` lines and notices only for the selected tier; `has_suites` counts only the selected tier. Add one stderr summary line `tier : <name|all>`. Update the header comment (tier selector, engine table, exit 2). All six output keys are always written.
- **Layer / why here:** all routing rules stay in one script (D2 = A).
- **Skills to apply:** `security`
- **Practices:** names from PR paths still pass `SAFE_NAME` before being emitted; the tier value is checked against a fixed list before use, never put into a regex or a path; labels in `engine-change:` lines are fixed strings; the workflow-tier rules follow *Shared definitions → Workflow-tier rules* (F1, F2), so the "not referenced" info lines are computed from `.claude/skills/<n>/` names only; with the tier unset, stdout is unchanged byte for byte for every change set outside the AC4 exceptions (engine paths, F1, F2).
- **Known gotchas:** root `INSIGHTS.md` 2026-10-07 "prove a refactored `.mjs` script prints the same output by running the old version straight from a git ref" (cwd must be `evals/scripts` so the old script's `import.meta.url` resolves `evals/`); 2026-10-11 "a green `harness-evals` run can mean nothing ran" (its reproduce command must keep working).
- **Done when:** in `evals/scripts`, for `CHANGED_FILES` = `.claude/skills/engineering-insights/SKILL.md` and = `.claude/agents/plan-verifier.md`: `diff <(CHANGED_FILES=… node --input-type=module -e "$(git show HEAD:evals/scripts/ci-detect.mjs)" -- dummy 2>/dev/null) <(CHANGED_FILES=… node ci-detect.mjs 2>/dev/null)` is empty · `CHANGED_FILES=.claude/agents/plan-verifier.md CI_DETECT_TIER=skills node ci-detect.mjs` prints `agents=[]` and `run_workflow=false` · `CI_DETECT_TIER=bogus node ci-detect.mjs; echo $?` prints `2`.

### S2 — Unit test for ci-detect
- **Files:** `evals/src/ci-detect.test.ts` (create)
- **Change:** vitest file that runs `scripts/ci-detect.mjs` with `spawnSync(process.execPath, …)` and parses stdout `key=value` lines. Cases (facts from the current tree): (1) unset tier, `.claude/skills/dependency-checker/SKILL.md` → `skills=["dependency-checker"]`, `run_workflow=false`; (2) unset tier, `.claude/skills/engineering-insights/SKILL.md` → `run_workflow=true` (D3); (3) tier `skills`, `.claude/agents/plan-verifier.md` → `agents=[]`, `run_workflow=false`; (4) tier `agents`, same file → `agents=["plan-verifier"]`, `run_workflow=false`; (5) tier `workflow`, same file → `run_workflow=true`, `agents=[]`; (6) tier `skills`, `.github/workflows/harness-evals-agents.yml` → `skills=[]`; (7) tier `skills`, `evals/scripts/ci-detect.mjs` → `skills` contains `dependency-checker`; (8) tier `skills`, `evals/proxy/docker-compose.yml` → `skills=[]`; tier `agents`, same → `agents` non-empty; (9) tier `skills`, `.claude/skills/zod/SKILL.md` → `skipped_skills=zod`, `has_suites=false`; (10) `CI_DETECT_TIER=bogus` → exit status 2; (11) a name with an unsafe character is not emitted; (12, F1) tier `workflow`, `evals/skills/engineering-insights/cases.ts` → `run_workflow=false`; (13, F2) tier `workflow`, `evals/src/ci-detect.test.ts` → `run_workflow=false`, and `evals/src/judge.ts` → `run_workflow=true`; (14, F3) each `harness-evals-<tier>.yml` `on.pull_request.paths` contains every ENGINE path, its own file and its tier paths (workflow: incl. the `!` path). With the test-writer's cases: 32 tests.
- **Layer / why here:** `vitest.config.ts:7` includes only `src/**/*.test.ts`; the file name must not contain `skills`, `agents` or `workflow` (vitest filters match by substring, `pnpm eval:skills` = `vitest run skills`).
- **Skills to apply:** `typescript-expert`
- **Practices:** the child env is a copy of `process.env` with `GITHUB_OUTPUT`, `CI_DETECT_ALL` and `CI_DETECT_TIER` deleted, then the case's values set; otherwise in CI the script writes to the real `$GITHUB_OUTPUT` and stdout is empty. No model, no network, no file writes. Style like `src/records/stats.test.ts` (header comment with the run command).
- **Known gotchas:** none in a gotchas file (evals has none); evals `AGENTS.md` → vitest substring filters.
- **Done when:** `cd evals && pnpm exec vitest run src/ci-detect.test.ts` reports 32 passed · `cd evals && pnpm typecheck`.

### S3 — Docs: name the new workflows
- **Files:** `AGENTS.md` (modify, line 30; root `CLAUDE.md` is a symlink to it, do not touch the link), `evals/README.md` (modify: *Wiring it into GitHub Actions* lines 190–247 and *Which change → which run*), `evals/AGENTS.md` (modify: *Commands* no-model line), `evals/docs/backlog.md` (modify: §2 heading)
- **Change:** `AGENTS.md:30` names the four files (`harness-evals-skills.yml`, `-agents.yml`, `-workflow.yml`, plus `harness-evals-static.yml` for the no-model checks). README CI section: one table row per workflow (file, jobs, paths, proxy), the engine table, `CI_DETECT_TIER`, dispatch inputs per file (D4), concurrency groups, and the Pending note (Risks); keep the D1 rev 2, Secret and Model-switch paragraphs. README must match *Shared definitions*: *Triggers* (`:195`) drops "positive patterns only" and names the one `!evals/src/**/*.test.ts` negation; the workflow row (`:206`) shows `evals/src/**` "(not `*.test.ts`)", no `evals/skills/**`; the mention rule (`:240-241`) stays `.claude/skills/<n>/**` only. *Which change → which run* gets a row: `scripts/ci-detect.mjs` → `pnpm vitest run src/ci-detect.test.ts`. `evals/AGENTS.md` no-model commands add `pnpm vitest run src/ci-detect.test.ts`. Backlog §2 heading names `.github/workflows/harness-evals-*.yml`.
- **Layer / why here:** docs only.
- **Skills to apply:** none
- **Practices:** do not edit plans 31–33, the plans index row of 31, or `INSIGHTS.md`; keep each new file name on one line (no hard wrap inside a backticked name).
- **Known gotchas:** root `INSIGHTS.md` 2026-09-28 "a Done-when `grep` for a phrase fails when Markdown wraps that phrase across two lines"; 2026-09-21 "`git stash pop` silently un-stages a symlink" (do not stash around `CLAUDE.md`).
- **Done when:** `git grep -n 'harness-evals\.yml' -- AGENTS.md evals/README.md evals/AGENTS.md evals/docs/backlog.md evals/scripts` prints nothing · `grep -n 'harness-evals-workflow' AGENTS.md evals/README.md` finds both files · `tr '\n' ' ' < evals/README.md | grep -o 'positive patterns only'` prints nothing · `grep -n 'harness-evals-workflow.yml. |' evals/README.md` shows a row containing `*.test.ts` · `git ls-files -s CLAUDE.md` still shows mode `120000`.

### S4 — Composite actions for setup and detect
- **Files:** `.github/actions/harness-evals-setup/action.yml` (create), `.github/actions/harness-evals-detect/action.yml` (create)
- **Change:** *setup*: `runs: using: composite`, steps `pnpm/action-setup@v4` (version 10), `actions/setup-node@v4` (node 22, cache pnpm, `cache-dependency-path: evals/pnpm-lock.yaml`), `pnpm install --frozen-lockfile` (`shell: bash`, `working-directory: evals`). *detect*: inputs `tier` (required), `has-key`, `event-name`, `scope`, `base-sha`, `head-sha`, `default-branch`, `head-repo`, `base-repo`; step `key` = today's key check (`harness-evals.yml:61-76`) reading `has-key`; step `changes` = today's detect (`:78-96`) plus `CI_DETECT_TIER=<tier>`, with this scope rule: `pull_request` → `git diff base...head`; `scope == changed` → diff against `origin/<default-branch>`; anything else (incl. empty) → `CI_DETECT_ALL=1`. Outputs `skills`, `agents`, `run_workflow` (from `changes`), `has_key` (from `key`).
- **Layer / why here:** D3 = A; the setup block is repeated 4× in `harness-evals.yml` today.
- **Skills to apply:** `security`
- **Practices:** the API key never enters a composite; only the boolean `has-key` does (research: `secrets.*` in composites is not established). Every input reaches a script through `env:`, never as `${{ inputs.* }}` inside a `run:` body (`head-repo` is fork-controlled). Every `run` step has `shell: bash`. Neither action checks out; the caller checks out first (detect needs `fetch-depth: 0`).
- **Known gotchas:** composite steps do not inherit the job's `defaults.run.working-directory` (assumption: set it on each step).
- **Done when:** G2 actionlint (S8) reports no error in a workflow that uses them.

### S5 — `harness-evals-skills.yml`
- **Files:** `.github/workflows/harness-evals-skills.yml` (create)
- **Change:** `name: harness-evals-skills`; paths per table; `workflow_dispatch` inputs `model`, `judge_model`, `scope` (as today); `permissions: contents: read`; concurrency `harness-evals-skills-${{ github.ref }}`, cancel-in-progress; env block as today (`:42-45`). Jobs: `detect` (checkout `fetch-depth: 0`, `uses: ./.github/actions/harness-evals-detect` with `tier: skills`, `has-key: ${{ secrets.OPENROUTER_API_KEY != '' }}` and the event fields; job outputs mapped from the step) and `skills` (today's `:125-178` with checkout + `uses: ./.github/actions/harness-evals-setup` in place of the three setup steps). Header comment adapted from `:1-6`.
- **Layer / why here:** one file per tier (D1 = A).
- **Skills to apply:** `security`
- **Practices:** never `pull_request_target`; the secret reaches only the model job's `env`; eval step keeps `continue-on-error: true` and the warning report (D1 rev 2); `detect` stays blocking; artifact name `harness-evals-skills-${{ matrix.suite }}`.
- **Known gotchas:** root `INSIGHTS.md` 2026-10-11 "a green `harness-evals` run can mean nothing ran".
- **Done when:** S8 actionlint run.

### S6 — `harness-evals-agents.yml`
- **Files:** `.github/workflows/harness-evals-agents.yml` (create)
- **Change:** as S5 with `tier: agents`, dispatch `model`, `judge_model`, `scope`, concurrency `harness-evals-agents-${{ github.ref }}`, and the `agents` job (`:180-245`: proxy up/logs/down, `OPENROUTER_BASE_URL`, artifact `harness-evals-agents-${{ matrix.suite }}`).
- **Layer / why here:** D1 = A.
- **Skills to apply:** `security`
- **Practices:** same as S5; the proxy steps stay outside `continue-on-error` (plan 31 risk, unchanged).
- **Known gotchas:** root `INSIGHTS.md` 2026-10-11 "the LiteLLM `main-stable` image refuses to start without a master key" (proxy config reused unchanged).
- **Done when:** S8 actionlint run.

### S7 — `harness-evals-workflow.yml`
- **Files:** `.github/workflows/harness-evals-workflow.yml` (create)
- **Change:** as S5 with `tier: workflow`, dispatch `model`, `judge_model` only (no `scope`: a manual run always runs the tier), concurrency `harness-evals-workflow-${{ github.ref }}`, and the `workflow` job (`:247-310`: git identity, proxy, artifact `harness-evals-workflow`). Its `paths` follow *Shared definitions*, including `'!evals/src/**/*.test.ts'` directly after `'evals/src/**'` (F2). In the copied report step drop `${SUITE:+ for $SUITE}`: this job never sets `SUITE`, so it always expands to nothing.
- **Layer / why here:** D1 = A.
- **Skills to apply:** `security`
- **Practices:** same as S5.
- **Known gotchas:** root `INSIGHTS.md` 2026-10-11 "`allowedTools` and a PreToolUse deny hook do not keep an SDK workflow eval read-only" (CI checkout is disposable; no change needed).
- **Done when:** S8 actionlint run.

### S8 — `harness-evals-static.yml`, delete the old workflow, validate
- **Files:** `.github/workflows/harness-evals-static.yml` (create), `.github/workflows/harness-evals.yml` (delete)
- **Change:** `name: harness-evals-static`; paths per table; bare `workflow_dispatch`; `permissions: contents: read`; concurrency `harness-evals-static-${{ github.ref }}`; job `static`: checkout, setup composite, `pnpm typecheck`, `pnpm eval:quality`, `pnpm exec vitest run src/records/stats.test.ts src/ci-detect.test.ts` (working dir `evals`). No secret, no `continue-on-error` (blocking). Then `git rm .github/workflows/harness-evals.yml`.
- **Layer / why here:** D1 = A, D6.
- **Skills to apply:** `security`
- **Practices:** no secret in this workflow at all.
- **Known gotchas:** none.
- **Done when:** `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint .github/workflows/harness-evals-*.yml` (repo root) exits 0 (scoped: the whole repo has a pre-existing `e2e-web.yml` SC2034) · `test ! -e .github/workflows/harness-evals.yml` · `git grep -n 'harness-evals\.yml' -- .github evals/scripts` prints nothing · `ls .github/workflows/harness-evals-*.yml` lists four files.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `evals/src/ci-detect.test.ts` | unit (no model) | AC2–AC5: tier selector, engine table, D3, D4 SKIP, exit 2, F1, F2, F3 paths agreement (32 tests) | S2 |
| S1 `diff` against `HEAD` | manual | AC4 (outside its exceptions) | S1 |
| actionlint on `.github/workflows/harness-evals-*.yml` | static | AC1, AC2 syntax | S8 |
| one real PR run (D7 B) | sign-off | AC1–AC3 in GitHub | after G2 |

## Migrations & contracts
None.

## Out of scope
- Making eval failures blocking again; raising the test timeout (backlog §2); pinning actions by SHA; branch-protection or required-check settings.
- Editing `docs/plans/31-*`, `32-*`, `33-*`, the plan-31 index row, `INSIGHTS.md`, `evals/vitest.config.ts`, `evals/proxy/**`, `evals/src/**` other than the new test.
- A reusable `workflow_call` workflow (D3 = A).

<!-- implementer-brief:end -->

## Context applied
- root `INSIGHTS.md` → "a green `harness-evals` run can mean nothing ran, or every eval failed" — AC4 (tier unset keeps the reproduce command), S5 gotcha.
- root `INSIGHTS.md` → "plan 31: harness evals on GitHub Actions with DeepSeek V4 Flash" — D1 rev 2 kept, timeouts out of scope.
- root `INSIGHTS.md` → "prove a refactored `.mjs` script prints the same output…" — S1 Done-when.
- root `INSIGHTS.md` → "a skill listed on a step where it has nothing to do…" — `security` only on steps that handle the secret or PR-controlled names; `none` on S3.
- root `INSIGHTS.md` → "a Done-when `grep` for a phrase fails when Markdown wraps…" — S3 Done-when greps single tokens.
- `docs/plans/31-harness-evals-ci.md` *Decisions recorded* D1–D7 — AC3.
- `docs/plans/assets/39-split-harness-evals-ci/research.md` — `**/AGENTS.md` matches the root file; `paths`/`paths-ignore` not combinable; composite outputs and `shell:`; secrets passed as booleans/inputs only; Pending note.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| engineering-insights | preload | — | planning read only (Step 0); no step writes `INSIGHTS.md` |
| onion-architecture | preload | — | no `server/`, `reviewer-core/` or `mcp-server/` code |
| security | on demand (S1, S4–S8) | S1, S4, S5, S6, S7, S8 | — |
| typescript-expert | on demand (S2) | S2 | — |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| evals | `scripts/ci-detect.mjs` | CI routing | changed |
| evals | `src/ci-detect.test.ts` | unit test | new |
| evals | `README.md`, `AGENTS.md`, `docs/backlog.md` | docs | changed |
| root | `AGENTS.md` (+ `CLAUDE.md` link) | docs | changed |
| .github | `actions/harness-evals-setup`, `actions/harness-evals-detect` | CI | new |
| .github | `workflows/harness-evals-{skills,agents,workflow,static}.yml` | CI | new |
| .github | `workflows/harness-evals.yml` | CI | deleted |

## Design notes
- **Pass-1 options** (all resolved as recommended): D1 A own static file / B static in skills / C static in every tier · D2 A one ci-detect + `CI_DETECT_TIER` / B three scripts / C paths only · D3 A composites / B `workflow_call` / C duplication · D4 dispatch + concurrency per file · D5 A unit test / B manual cases · D6 delete + reference updates · D7 A actionlint + ci-detect cases, B one real PR run as sign-off · D8 multi-agent.
- Behaviour kept from today: `evals/src/**` still triggers only the workflow tier (ci-detect `harnessFile`), not skills/agents, although the runtime lives there. Widening that would change plan 31 behaviour; not in scope. Narrowed by the plan change after review (F2): `evals/src/**/*.test.ts` (no-model unit tests, run by `static`) is not a harness change, in ci-detect and via the `!` path in the workflow file, so editing `ci-detect.test.ts` no longer starts a paid workflow-tier run.
- Plan change after review (F1): plan 31's D3 matched a skill name from both `.claude/skills/<n>/` and `evals/skills/<n>/`; now only `.claude/skills/<n>/` counts, matching the workflow file's paths, which never listed `evals/skills/**`. An `evals/skills/<n>/` change still runs that skill's suite in the skills tier.
- F3: the engine and tier paths now live in the script, four workflow files and the README; the S2 case 14 asserts the workflow files agree with the script's tables, the README is checked only by S3's Done-when.
- Scope rule change (assumption): today `scope=''` diffs; in the composite, empty scope means `all`, so the workflow file (no `scope` input) runs its tier on dispatch.
- With the tier unset, the engine table makes `evals/proxy/**` select agents + workflow only (today: every suite). This is TQ2's answer; AC4's byte-identical check is therefore for non-engine change sets.
- Mode re-check: 8 steps, 2 groups, trust boundary (CI secret) → `multi-agent` holds.

## Risks & open questions
- **Required checks stay Pending (research).** A path-filtered workflow that does not run leaves its checks Pending, and a PR that requires them is blocked. Today none of these jobs is a required check (plan 31 out of scope); if one is ever made required, use a job that always runs. Renaming also orphans any old `harness-evals / *` required check (inferred, not established) — main session: check branch protection in the GitHub UI before merge (`gh` is not installed).
- **This PR's first run is expensive.** It touches `evals/scripts/**` and `.github/actions/harness-evals-*/**` (ENGINE), so every suite in every tier runs on OpenRouter.
- **Not established by research:** local composite actions on fork PRs (inferred to work from the merge-ref checkout); covered by the D7 B real PR run (same-repo only; fork behaviour stays unverified).
- **The old workflow on the base branch.** A PR's workflows come from the merge ref, so the deleted `harness-evals.yml` no longer runs on this PR (inference).
- Docker image pull needs network; if blocked, the main session runs the actionlint command.
- Doc vs code: none found.

## Handed off
- architecture-reviewer: the ci-detect engine table and the per-file paths lists as one source of truth (S1 vs S5–S8 drift).
- security review: `OPENROUTER_API_KEY` only in model-job `env`, only the boolean reaches composites (S4); `head-repo` and other inputs reach `run:` via `env:` only; no `pull_request_target`; `permissions: contents: read` in all four files.

## Insights to record
- root `INSIGHTS.md` · Codebase Patterns — CI for evals is four path-filtered workflows plus `CI_DETECT_TIER`; a path-skipped workflow leaves required checks Pending (research `[1]`) — after the D7 B run confirms it.

## Red-flags check
- [x] Every AC maps to at least one step or test (no-spec plans)
- [x] Every spec AC-n has a row in *Spec traceability* with a step or test (n/a: no spec)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; technical choices are in *Decisions needed*, product gaps are GAPn
- [x] Groups end type-checking; parallel groups share no file (G1 ends `pnpm typecheck`, G2 ends actionlint; sequential)
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1: n/a (pass 2)
- [x] Execution mode recommended per the D4 rule
- [x] Every step's *Skills to apply* is complete (the implementer reads only those)
- [x] `bash .claude/skills/sdd/scripts/sdd.sh plan-lint <plan>` prints `plan-lint: ok`

## Handoffs → G2

- `CI_DETECT_TIER` ∈ `skills | agents | workflow`; unset/empty = all tiers; any other value → stderr error, exit 2.
- The script always writes `skills`, `agents`, `run_workflow`, `skipped_skills`, `skipped_agents`, `has_suites`; other tiers' outputs are `[]` / `false` / empty.
- Engine table (in the script): own workflow file → that tier only; `evals/scripts/**`, `evals/package.json`, `evals/pnpm-lock.yaml`, `.github/actions/harness-evals-setup/**`, `.github/actions/harness-evals-detect/**` → all three tiers; `evals/proxy/**` → agents + workflow. The static workflow is not in the engine table.
- `evals/src/ci-detect.test.ts` exists → S8 static job runs `pnpm exec vitest run src/records/stats.test.ts src/ci-detect.test.ts`.
- Docs (S3) already describe the four workflows, the composite actions, dispatch inputs (`scope` only on skills and agents), concurrency `harness-evals-<tier>-<ref>` and the Pending note for all four files — G2 must match; a deviation needs a README follow-up.
- Deviations (trivial): S1 stderr gains one `tier          : all` line (stdout identical); engine table also lists the two composite-action paths and the three own-workflow files.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `security` | on demand (S1) | S1: tier checked against a fixed list; `SAFE_NAME` kept; fixed labels | |
| `typescript-expert` | on demand (S2) | S2 | |
| `engineering-insights`, `onion-architecture` | preload | | not relevant to these files |

## Handoffs → G2 report

Handoff to the next group: none (last group). Deviations (trivial): old workflow removed with `rm` (unstaged ` D`); S4 scope rule `changed` → diff, anything else → `CI_DETECT_ALL=1`; S7 report message drops `${SUITE:+ for $SUITE}`. actionlint (Docker) on `harness-evals-*.yml`: exit 0; whole repo only pre-existing `e2e-web.yml` SC2034. Review pointers: engine/paths lists duplicated between `ci-detect.mjs` and the four `on.pull_request.paths` blocks; `head-repo` input (fork-controlled) reaches `run:` only via `env:`; `OPENROUTER_API_KEY` only in model jobs' `env`.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `security` | on demand (S4–S8) | S4–S8: secret only in model-job env; composites get boolean `has-key`; inputs via `env:`; no `pull_request_target`; `permissions: contents: read` | |
| `engineering-insights`, `onion-architecture` | preload | | not relevant to these files |

## Follow-ups
- 2026-10-14 T4: confirm on the first same-repo PR that each harness-evals-<tier>.yml triggers only on its paths, the four checks appear separately, and model jobs report non-blocking (OpenRouter credits needed — 402 today)
- 2026-10-14 Before merge: check branch protection / rulesets for an old required 'harness-evals / *' check (would stay Expected after the rename) — gh is not installed locally

## Verification log
- 2026-10-14 agent: plan-p1 a0be50968da88dbd3 implementation-planner 2026-10-14T07:18:27Z
- 2026-10-14 agent: plan-p2 a0be50968da88dbd3 implementation-planner 2026-10-14T07:30:01Z
- 2026-10-14 agent: implement ae62b06e776b42132 implementer 2026-10-14T07:51:56Z
- 2026-10-14 implement G1: S1–S3 done; ci-detect test 11 passed; evals typecheck ok
- 2026-10-14 agent: implement af0b4eacead0578e7 implementer 2026-10-14T07:53:30Z
- 2026-10-14 implement G2: S4–S8 done; actionlint harness-evals-*.yml exit 0
- 2026-10-14 agent: tests ae63584e4ba2089b4 test-writer 2026-10-14T07:55:02Z
- 2026-10-14 tests: ci-detect.test.ts +16 (27 total, 3/3 stable), break checks reverted (shasum f65a852…)
- 2026-10-14 it-suite: n/a — no server/client/reviewer-core change
- 2026-10-14 agent: review acc17085ecc81962b security-reviewer 2026-10-14T07:56:09Z
- 2026-10-14 security-reviewer: PASS, 0 findings; pre-existing: actions pinned to tags not SHAs, artifact/proxy-log key exposure unchecked
- 2026-10-14 agent: review a28a7bf216b2e1f7f architecture-reviewer 2026-10-14T07:56:55Z
- 2026-10-14 architecture-reviewer: PASS; F1 MEDIUM (workflow-tier mention rule reacts to evals/skills/<n>/ but harness-evals-workflow.yml paths lack it), F2 MEDIUM (editing evals/src/ci-detect.test.ts starts a paid workflow-tier run); handoff: engine list in 5 unchecked copies
- 2026-10-14 review iteration 1: fix 3, F1 → ci-detect mention rule counts only .claude/skills/<n>/ (matches the plan's paths table) + test; F2 → evals/src/**/*.test.ts is not a harness change (ci-detect harnessFile + '!evals/src/**/*.test.ts' in the workflow file paths) + test; F3 (handoff) → a ci-detect.test.ts case asserting the four workflow files' on.pull_request.paths agree with the engine table
- 2026-10-14 agent: fix-loop a19f675d60075190e implementer 2026-10-14T07:57:44Z
- 2026-10-14 fix-loop 1: F1–F3 done; ci-detect tests 32 passed; evals typecheck ok; actionlint harness-evals-*.yml rc 0
- 2026-10-14 agent: review a74e5c82aa222601a plan-verifier 2026-10-14T08:00:42Z
- 2026-10-14 plan-verifier (full): contradicted — 51/59 met; P1/S7c contradicted, AC4/S3c partial (all from fix-loop 1 F1/F2 changing plan-specified behaviour without a recorded decision); not-verifiable D9/T3 actionlint, T4 PR run, R4
- 2026-10-14 agent: plan-p2 a0be50968da88dbd3 implementation-planner 2026-10-14T08:15:43Z
- 2026-10-14 plan re-approved (user, 2026-10-14: "так") after the F1/F2 amendment
- 2026-10-14 main-session fix: S3c — evals/README.md:195 paths note names the workflow '!' exclusion, :206 workflow row lists '!evals/src/**/*.test.ts'; S3 Done-when all pass
- 2026-10-14 agent: review a7800262fd6aef48a plan-verifier 2026-10-14T08:19:00Z
- 2026-10-14 plan-verifier (delta): incomplete — 57/59; P1, S7c, S3c, D9/T3 met; AC4 partial (AC4(b) wording narrower than F1: the dropped 'not referenced' info line for an evals/skills/<n>/ change of an unmentioned skill); T4, R4 not-verifiable
- 2026-10-14 plan change (user, 2026-10-14: "так"): AC4(b) widened to the whole F1 rule (any evals/skills/<n>/** change: no run_workflow, no 'not referenced' line); code unchanged — closes the delta AC4 partial
- 2026-10-14 sign-off: user accepted R4 (break checks reverted per test-writer, shasum f65a852 before fix-loop 1) and T4 deferred to the first real PR run (open follow-up)
- 2026-10-14 insights: root INSIGHTS.md 2026-10-14 per-tier paths filter vs router script (F1)
