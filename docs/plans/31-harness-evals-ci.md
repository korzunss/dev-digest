# Development Plan: harness evals in GitHub Actions on OpenRouter (DeepSeek V4 Flash)
Status: in-progress
Save as: docs/plans/31-harness-evals-ci.md
Spec: none (tooling: CI workflow for the evals/ package)
Execution: single-agent

## Goal & acceptance criteria
Run the harness evals (`evals/`) in GitHub Actions on pull requests, on the OpenRouter backend with DeepSeek V4 Flash as the task model, switchable per run through `workflow_dispatch` inputs or repo variables (no UI). Only the suites a PR actually touches run; anything without evals, an empty suite list, or a missing secret ends green with a visible skip line — never a red job.

- AC1: `.github/workflows/harness-evals.yml` triggers on `pull_request` (paths filter over the harness) and on `workflow_dispatch` with inputs `model`, `judge_model`, `scope`; `EVAL_MODEL` resolves `inputs.model` → `vars.EVAL_MODEL` → `deepseek/deepseek-v4-flash`, `EVAL_JUDGE_MODEL` resolves `inputs.judge_model` → `vars.EVAL_JUDGE_MODEL` → `deepseek/deepseek-v4-pro`.
- AC2: a `detect` job computes the changed files with plain `git diff --name-only <base>...<head>` (no third-party changed-files action) and feeds them to `evals/scripts/ci-detect.mjs`; on `workflow_dispatch` with `scope: all` it runs every suite that has evals.
- AC3: `ci-detect.mjs` triggers the workflow tier on the root `CLAUDE.md`/`AGENTS.md`, nested `*/AGENTS.md`, `*/CLAUDE.md`, `*/insights/gotchas.md` (outside `.claude/` and `server/clones/`), `.claude/settings.json`, any agent definition, `evals/workflow/**`, `evals/src/**`; a skill change triggers it only when the skill's name appears as a token in `evals/workflow/*.cases.ts` (D3).
- AC4: a changed skill or agent with no `evals/<tier>/<name>/*.eval.ts` is not run and does not fail: the log has `SKIP <tier> <name> (no evals)` and a `::notice` annotation (D4).
- AC5: model jobs are skipped cleanly when their suite list is empty or `OPENROUTER_API_KEY` is unavailable (fork PRs); no `pull_request_target`.
- AC6: a `static` job (no model) runs `pnpm typecheck`, `pnpm eval:quality`, `src/records/stats.test.ts`; skills matrix (content tier, direct OpenRouter), agents matrix (tool tier, LiteLLM proxy), both `max-parallel: 1`; the workflow job (proxy); every model job is blocking — no job sets `continue-on-error` (D1); every model job uploads `evals/results` with `if: always()`.
- AC7: `evals/README.md` → "Wiring it into GitHub Actions (per-PR)" describes the real workflow: triggers, jobs, model switch (dispatch inputs, repo variables), the secret, the skip behaviour.

## Decisions needed
None open — see *Decisions recorded*.

## Decisions recorded
- D1 — ~~the workflow-tier job is non-blocking at first~~ **revised by the user (correction round 1): every model job is blocking** — `workflow` and `agents` both fail the run on a failed eval; no `continue-on-error` anywhere. The risk of red PRs while DeepSeek V4 Flash is unmeasured on the tool tiers is accepted. (user)
- Approval — the user approved the plan on 2026-10-11 after correction round 1 (D1 all-blocking; D2 Flash task / Pro judge confirmed by approval). (user)
- D2 — task model default `deepseek/deepseek-v4-flash`; judge model default `deepseek/deepseek-v4-pro`. **Interpretation:** the main session read the user's "так" as agreement to the Flash-task / Pro-judge compromise; confirm at approval. (user, interpreted)
- D3 — a skill change triggers the workflow tier **only** when that skill's name is mentioned in `evals/workflow/*.cases.ts`. (user)
- D4 — a changed skill/agent with no written evals is not tested and does not fail: `SKIP <tier> <name> (no evals)` in the log plus a `::notice`; an empty matrix list skips its job cleanly; no job errors just because nothing applies. (user)
- Execution mode: `single-agent` (caller: trivial tooling plan, 1 package + 1 workflow file, 3 files).

## Prerequisites
- For the real run only (not for implementation): repo Actions secret `OPENROUTER_API_KEY`; optional repo variables `EVAL_MODEL` / `EVAL_JUDGE_MODEL`. Set by the user in GitHub settings.
- No new dependency. Local Done-when needs `node` ≥22 and `python3` with PyYAML (present: 6.0.1); `actionlint` is not installed here.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| all | S1–S3 | `evals/scripts/ci-detect.mjs`, `.github/workflows/harness-evals.yml` (create), `evals/README.md` | — | none (single run) |

Order: S1 (detector, verified locally with the CHANGED_FILES matrix) → S2 (workflow consumes S1's outputs) → S3 (README describes S1+S2). "Type-checks" here means `node --check` on the `.mjs` and the YAML parse check.

## Steps
### S1 — extend `ci-detect.mjs`: nested harness files, D3 skill gating, SKIP notices, `all` mode
- **Files:** `evals/scripts/ci-detect.mjs` (modify)
- **Change:**
  1. **Inputs.** Keep `CHANGED_FILES` (newline list). Add `CI_DETECT_ALL` (assumption: env name): when `"1"`/`"true"`, ignore `CHANGED_FILES`; `skills` = every `evals/skills/<n>/` with a `*.eval.ts`, `agents` = every `evals/agents/<n>/` with a `*.eval.ts`, `run_workflow=true`, no SKIP lines. Drop every changed path under `server/clones/` or containing `/node_modules/` before any matching.
  2. **Agent names.** The `.claude/agents/<name>.md` regex excludes `README` (today `.claude/agents/README.md` would produce `SKIP agents README`). A change to `.claude/agents/README.md` still triggers the workflow tier (current behaviour of the `.claude/agents/.+\.md` rule, kept).
  3. **Workflow-tier triggers** (`runWorkflow`), replacing the current list at `ci-detect.mjs:63-70`: `CLAUDE.md`, `AGENTS.md`, `.claude/CLAUDE.md`, `.claude/settings.json`; nested `<dir>/AGENTS.md`, `<dir>/CLAUDE.md`, `<dir>/insights/gotchas.md` **only when the path does not start with `.claude/`** (so `.claude/skills/zod/AGENTS.md` is a skill file, governed by D3); `.claude/agents/*.md`; `evals/workflow/**`; `evals/src/**`; and any touched skill name (from `.claude/skills/<n>/` or `evals/skills/<n>/`) that is mentioned in `evals/workflow/*.cases.ts`.
  4. **D3 mention test.** Read every `evals/workflow/*.cases.ts` once (readdirSync + readFileSync, `node:fs` only). A skill `<n>` is mentioned when the text matches `(^|[^A-Za-z0-9_-])<n>($|[^A-Za-z0-9_-])` with `<n>` regex-escaped — a token match, so `security` does not match `security-reviewer` and `/sdd` does match `sdd`. Comments count (today `engineering-insights` and `sdd` are mentioned, `review-workflow.cases.ts:109,172`).
  5. **Outputs** (unchanged names, plus one): `skills`, `agents` (JSON arrays), `run_workflow`, `skipped_skills`, `skipped_agents` (space-separated), new `has_suites` = `true` when skills, agents or run_workflow is non-empty/true (assumption: used for a summary line only).
  6. **SKIP lines (D4).** For each skipped name print to stdout `SKIP skills <n> (no evals)` / `SKIP agents <n> (no evals)` **and** `::notice title=harness evals::SKIP <tier> <n> (no evals)`. For a touched skill with evals whose name is not mentioned in the workflow cases, print an info line `workflow tier: skill <n> not referenced in evals/workflow/*.cases.ts — not triggered`. Keep the existing `── eval change detection ──` summary on stderr. With no `GITHUB_OUTPUT`, `k=v` lines keep going to stdout (current `write` fallback, `ci-detect.mjs:72-73`).
  7. Update the header comment to the new rules. Exit code is always 0 for any input set, including empty.
- **Layer / why here:** the detector is the single place that maps changed paths to suites (`ci-detect.mjs` header); the workflow only consumes its outputs, so all routing logic stays testable locally without Actions.
- **Skills to apply:** `security`
- **Practices:** names written into outputs and `::notice` lines must match `^[A-Za-z0-9._-]+$` (they come from PR-controlled paths; a name with `:`, `%`, newline or space is dropped with a plain stderr warning, never echoed as a workflow command — A05 injection); no dependency beyond `node:fs`/`node:path`/`node:url`; no network; pure function of `CHANGED_FILES` + the filesystem.
- **Known gotchas:** `vitest run <filter>` is a substring match on the file path, so the suite path emitted for S2 must end in `/` (`agents/architecture-reviewer/` vs `agents/architecture-reviewer-lite/`) — S2 appends it, S1 emits bare names. `.claude/skills/README.md` has no trailing `/` segment and must stay unmatched by the skill regex.
- **Done when:** `node --check evals/scripts/ci-detect.mjs` passes, and each command below (run from the repo root, `2>&1` merged) prints the listed lines (check each with `grep -F`):
  - `CHANGED_FILES=$'.claude/skills/dependency-checker/SKILL.md' node evals/scripts/ci-detect.mjs` → `skills=["dependency-checker"]`, `run_workflow=false`, the `not referenced` info line.
  - `CHANGED_FILES=$'.claude/skills/engineering-insights/SKILL.md' node evals/scripts/ci-detect.mjs` → `skills=[]`, `SKIP skills engineering-insights (no evals)`, `::notice`, `run_workflow=true`.
  - `CHANGED_FILES=$'.claude/skills/zod/AGENTS.md' node evals/scripts/ci-detect.mjs` → `SKIP skills zod (no evals)`, `run_workflow=false`.
  - `CHANGED_FILES=$'server/AGENTS.md' node evals/scripts/ci-detect.mjs` → `run_workflow=true`, `skills=[]`, `agents=[]`; same `run_workflow=true` for `server/insights/gotchas.md`, `client/CLAUDE.md`, `.claude/settings.json`.
  - `CHANGED_FILES=$'server/clones/x/AGENTS.md' node evals/scripts/ci-detect.mjs` → `run_workflow=false`.
  - `CHANGED_FILES=$'.claude/agents/brainstormer.md' node evals/scripts/ci-detect.mjs` → `SKIP agents brainstormer (no evals)`, `run_workflow=true`; `.claude/agents/architecture-reviewer.md` → `agents=["architecture-reviewer"]`; `.claude/agents/README.md` → `agents=[]` and no `SKIP agents README` line (`! grep -F 'SKIP agents README'`).
  - `CHANGED_FILES= node evals/scripts/ci-detect.mjs` → `skills=[]`, `agents=[]`, `run_workflow=false`, exit 0.
  - `CI_DETECT_ALL=1 node evals/scripts/ci-detect.mjs` → `skills=["dependency-checker"]`, `agents=["architecture-reviewer","architecture-reviewer-lite"]`, `run_workflow=true`.
  - `GITHUB_OUTPUT=<scratch file> CHANGED_FILES=$'server/AGENTS.md' node evals/scripts/ci-detect.mjs` writes the six keys to that file (scratchpad path, not the repo).

### S2 — create `.github/workflows/harness-evals.yml`
- **Files:** `.github/workflows/harness-evals.yml` (create)
- **Change:** house style of `.github/workflows/mcp-server.yml` (header comment, `permissions: contents: read`, `concurrency: group: harness-evals-${{ github.ref }}`, `cancel-in-progress: true`, `pnpm/action-setup@v4` `version: 10`, `actions/setup-node@v4` node 22 with `cache: pnpm`, `cache-dependency-path: evals/pnpm-lock.yaml`, `defaults.run.working-directory: evals`, `pnpm install --frozen-lockfile`).
  - **Triggers:** `pull_request.paths`: `.claude/**`, `CLAUDE.md`, `**/AGENTS.md`, `**/CLAUDE.md`, `**/insights/gotchas.md`, `evals/**`, `.github/workflows/harness-evals.yml` (the last three beyond the brief so every S1 trigger can fire). `workflow_dispatch.inputs`: `model` (string, default `''`), `judge_model` (string, default `''`), `scope` (choice `all` | `changed`, default `all`). No `push` trigger, never `pull_request_target`.
  - **Workflow env:** `EVAL_BACKEND: openrouter`; `EVAL_MODEL: ${{ inputs.model || vars.EVAL_MODEL || 'deepseek/deepseek-v4-flash' }}`; `EVAL_JUDGE_MODEL: ${{ inputs.judge_model || vars.EVAL_JUDGE_MODEL || 'deepseek/deepseek-v4-pro' }}`. `OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}` only in the env of the model jobs.
  - **`detect`** (timeout 5): `actions/checkout@v4` with `fetch-depth: 0`; step `key` writes `has_key=${{ secrets.OPENROUTER_API_KEY != '' }}` to `$GITHUB_OUTPUT` and, when false, prints `::notice::OPENROUTER_API_KEY not available (fork PR or unset) — model evals skipped`; step `changes` (`working-directory: .`): for `pull_request` builds `CHANGED_FILES` from `git diff --name-only "$BASE_SHA...$HEAD_SHA"` where `BASE_SHA`/`HEAD_SHA` come from `github.event.pull_request.base.sha` / `.head.sha` via `env:`; for `workflow_dispatch` with `scope: all` sets `CI_DETECT_ALL=1`; with `scope: changed` diffs `origin/${{ github.event.repository.default_branch }}...HEAD` (default branch name via `env:`). Then `node evals/scripts/ci-detect.mjs`. Job outputs: `skills`, `agents`, `run_workflow`, `has_key`. No pnpm install in this job (S1 has no deps).
  - **`static`** (timeout 10, no model, no secret, always runs): install, `pnpm typecheck`, `pnpm eval:quality`, `pnpm exec vitest run src/records/stats.test.ts`.
  - **`skills`** (timeout 20): `needs: detect`; `if: needs.detect.outputs.has_key == 'true' && needs.detect.outputs.skills != '[]'`; `strategy.matrix.suite: ${{ fromJSON(needs.detect.outputs.skills) }}`, `max-parallel: 1`, `fail-fast: false`; no proxy, no `OPENROUTER_BASE_URL` (content tier goes direct, `src/runtime/dispatch.ts`); runs `pnpm exec vitest run "skills/$SUITE/"` with `SUITE: ${{ matrix.suite }}` via `env:`.
  - **`agents`** (timeout 30): same gating on `agents`; env adds `OPENROUTER_BASE_URL: http://localhost:4000`; `pnpm proxy:up` → `pnpm exec vitest run "agents/$SUITE/"`; `if: failure()` → `docker compose -f proxy/docker-compose.yml logs --tail 100`; `if: always()` → `pnpm proxy:down`.
  - **`workflow`** (timeout 45): `if: needs.detect.outputs.has_key == 'true' && needs.detect.outputs.run_workflow == 'true'`; blocking like the other model jobs, no `continue-on-error` (D1); a git identity step (`git config --global user.email/user.name` with a bot identity, assumption) before the run; proxy as in `agents`; `pnpm eval:workflow`.
  - **Artifacts:** every model job ends with `actions/upload-artifact@v4`, `if: always()`, `path: evals/results`, `if-no-files-found: ignore`, a unique name per job and matrix entry (`harness-evals-skills-${{ matrix.suite }}`, `harness-evals-agents-${{ matrix.suite }}`, `harness-evals-workflow`).
- **Layer / why here:** CI wiring only; all routing decisions live in S1, all engine behaviour in `evals/src` and `evals/proxy` (reused unchanged).
- **Skills to apply:** `security`
- **Practices:** no `${{ … }}` expression interpolated inside a `run:` script for any PR- or input-controlled value (shas, branch names, `inputs.*`, `matrix.suite`) — pass via `env:` and quote the shell variable (A05 command injection); the secret is never echoed and reaches only model jobs; `permissions: contents: read` at workflow level; only first-party `actions/*` plus `pnpm/action-setup` (already used by `mcp-server.yml`); every model job is skipped (not failed) when its list is empty or the key is missing.
- **Known gotchas:** `secrets` cannot appear in a job-level `if:` — hence the `has_key` output from `detect`; `upload-artifact@v4` fails on duplicate names across matrix jobs; `vitest run agents/architecture-reviewer` would also match `architecture-reviewer-lite` — keep the trailing `/`; root `INSIGHTS.md` 2026-10-11 "`allowedTools` and a PreToolUse deny hook do not keep an SDK workflow eval read-only" → the workflow tier depends on `createSandbox()` (`evals/src/runtime/sandbox.ts:71-76`: `git stash create` or HEAD, then `git worktree add --detach`); on a clean CI checkout `stash create` returns empty and HEAD is used, and `evals/results/` + `node_modules/` are gitignored (`evals/.gitignore`), so the real-repo guard stays clean — the identity step only protects the dirty-tree path where `stash create` writes a commit object; root `INSIGHTS.md` 2026-10-11 "an eval record's outcome falls back to …" → workflow pass/fail in records is meaningful only because cases pass `passed`; do not add a CI step that reads `outcome` from `records.jsonl` as a gate.
- **Done when:** `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/harness-evals.yml')); j=d['jobs']; assert set(j)=={'detect','static','skills','agents','workflow'}; assert all('continue-on-error' not in v for v in j.values()); assert j['skills']['strategy']['max-parallel']==1 and j['agents']['strategy']['max-parallel']==1; assert 'pull_request_target' not in d[True]; print('yaml ok')"` prints `yaml ok`; `grep -F 'deepseek/deepseek-v4-flash' .github/workflows/harness-evals.yml` and `grep -F 'secrets.OPENROUTER_API_KEY' .github/workflows/harness-evals.yml` match; `actionlint .github/workflows/harness-evals.yml` exits 0 **if** actionlint is available (not installed here — record "not run" otherwise).

### S3 — rewrite README "Wiring it into GitHub Actions (per-PR)"
- **Files:** `evals/README.md` (modify — only the section starting `### Wiring it into GitHub Actions (per-PR)`, `README.md:189-244`, plus one row in *Environment variables*, `README.md:513-524`)
- **Change:** replace the generic sample YAML with a description of `.github/workflows/harness-evals.yml`: triggers (paths list, dispatch inputs `model` / `judge_model` / `scope`); the job table (`detect`, `static`, `skills`, `agents`, `workflow` — what each runs, proxy or not; every model job, `workflow` included, is blocking, D1); the model switch (precedence `inputs` → repo variables `EVAL_MODEL`/`EVAL_JUDGE_MODEL` → defaults `deepseek/deepseek-v4-flash` / `deepseek/deepseek-v4-pro`, with "repo variables: Settings → Secrets and variables → Actions → Variables"); the secret `OPENROUTER_API_KEY` and that fork PRs skip model jobs; the change → suite rules (S1, incl. D3 token match in `evals/workflow/*.cases.ts`); the skip behaviour (`SKIP <tier> <name> (no evals)` + `::notice`, empty lists skip jobs); how to reproduce detection locally (`CHANGED_FILES=… node scripts/ci-detect.mjs`, `CI_DETECT_ALL=1`). Add `CI_DETECT_ALL` to the env-var table (scope: `scripts/ci-detect.mjs` only). Note that DeepSeek V4 Flash on the tool tiers is unmeasured (the verified-model table lists `deepseek/deepseek-chat` failing dispatch, `README.md:166-170`) — do not edit that table.
- **Layer / why here:** the package doc owns the how-to; the section already exists and is the place the brief names.
- **Skills to apply:** none (Markdown only)
- **Practices:** describe what the YAML does, no second full YAML copy (it would drift); keep the other README sections untouched.
- **Known gotchas:** root `INSIGHTS.md` 2026-09-28 "a Done-when `grep` for a phrase fails when Markdown wraps that phrase across two lines" — checks below use single tokens.
- **Done when:** `grep -F 'harness-evals.yml' evals/README.md`, `grep -F 'CI_DETECT_ALL' evals/README.md`, `grep -F 'deepseek-v4-flash' evals/README.md`, `grep -F 'workflow_dispatch' evals/README.md` each match; `grep -F 'gemini-2.5-flash' evals/README.md` still matches (verified-model table kept).

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| none (no test file added) | — | `ci-detect.mjs` is checked by the S1 CHANGED_FILES command matrix; `stats.test.ts` runs unchanged in `static` | S1, S2 |

## Migrations & contracts
None.

## Out of scope
- No change to `evals/src/**` (runners, sandbox, config defaults stay `claude-haiku-4-5` / `claude-sonnet-5` for local runs), `evals/proxy/**`, `evals/scripts/litellm-proxy.sh`, eval cases or the verified-model table.
- No new evals for skills/agents that have none; no branch-protection / required-check configuration (making any job a required check is a later repo-settings choice).
- No `push`/`schedule` triggers, no `pull_request_target`, no third-party changed-files action, no edits to other workflows.

<!-- implementer-brief:end -->

## Context applied
- `INSIGHTS.md` → "2026-10-11 — `allowedTools` and a PreToolUse deny hook do not keep an SDK workflow eval read-only" — the CI workflow job relies on worktree isolation; S2 gotcha + git identity step.
- `INSIGHTS.md` → "2026-10-11 — an eval record's outcome falls back to …" — no CI gate on `records.jsonl` outcome (S2).
- `INSIGHTS.md` → "2026-09-28 — a Done-when `grep` for a phrase fails when Markdown wraps …" — S3 Done-when tokens.
- `INSIGHTS.md` → "2026-09-17 — searches return duplicate hits from `server/clones/`" — S1 drops `server/clones/` paths.
- `evals/` has no `AGENTS.md` / `insights/gotchas.md`; `evals/README.md` sections Runners, OpenRouter engine, GitHub Actions read in full.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| engineering-insights | preload | — | read-before-work only; no INSIGHTS write in a plan |
| onion-architecture | preload | — | no `server/`, `reviewer-core/`, `mcp-server/` code touched |
| security | on demand (S1, S2) | S1, S2 | — |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| evals | `scripts/ci-detect.mjs` | CI tooling | changed |
| repo CI | `.github/workflows/harness-evals.yml` | CI | new |
| evals | `README.md` | docs | changed |

## Design notes
- Facts: `ci-detect.mjs` already exists with outputs `skills`/`agents`/`run_workflow`/`skipped_*` and stdout fallback (`ci-detect.mjs:72-80`); eval suites with `*.eval.ts` today: `skills/dependency-checker`, `agents/architecture-reviewer`, `agents/architecture-reviewer-lite`; workflow cases mention `engineering-insights` (`review-workflow.cases.ts:172`) and `sdd` (comments, `:109`, `:126`); `vitest.config.ts` includes `**/*.eval.ts` and `src/**/*.test.ts`; content tier is direct OpenRouter (`src/runtime/dispatch.ts`), tool tiers go through the SDK with `ANTHROPIC_BASE_URL = OPENROUTER_BASE_URL` (`src/runtime/env.ts`); `pnpm proxy:up` starts and waits for LiteLLM on :4000 (`scripts/litellm-proxy.sh`); `eval:quality` exits 1 only on a FAIL verdict (`src/skill-quality.ts`, a missing eval file is a warning).
- `scope: changed` on dispatch diffs against the default branch; `all` is the default because a manual run usually means "measure this model everywhere".
- The `detect` job needs no pnpm install: S1 uses only Node built-ins.

## Risks & open questions
- **Model slugs unverified** — `deepseek/deepseek-v4-flash` and `deepseek/deepseek-v4-pro` are the user's choice; whether OpenRouter serves those exact slugs cannot be confirmed from the repo. Researcher or first real run (needs sign-off).
- **D2 is an interpretation** of the user's "так" (Flash task / Pro judge) — confirm at approval.
- **Tool tiers on DeepSeek are unmeasured and blocking — accepted by the user (D1, correction round 1).** README's verified table records `deepseek/deepseek-chat` failing subagent dispatch (`README.md:166-170`). If V4 Flash fails there too, PRs touching `architecture-reviewer*` (agents job) or any workflow-tier trigger (workflow job) go red. Not an open option; the remedy, if it happens, is a model switch via `vars.EVAL_MODEL` or a later decision.
- **Claude Agent SDK on a bare runner** — the SDK package ships its own runtime (`node_modules/@anthropic-ai/claude-agent-sdk` has `manifest.json`, `bridge.mjs`), but whether it runs headless on ubuntu-latest without a `claude` CLI on PATH, and whether it issues side requests for a default small/fast Anthropic model that the LiteLLM wildcard would forward to OpenRouter under an Anthropic id, is unverified. Researcher question.
- **Cannot be verified locally (needs sign-off):** a real Actions run — `fetch-depth: 0` diff, `has_key` gating on a fork PR, empty-matrix skip, proxy start on the runner, artifact upload, total cost/time per PR.
- Doc vs code: README "Wiring it into GitHub Actions" shows a sample with `google/gemini-2.5-flash` and no detector; S3 replaces it. `ci-detect.mjs` defines an unused `REPO_ROOT` (`:23`) — S1 may use it for the cases read.

## Handed off
- architecture-reviewer: nothing in onion scope.
- security review: `.github/workflows/harness-evals.yml` — secret exposure to fork PRs (must stay `pull_request`, key-gated), expression injection in `run:` (shas, `inputs.*`, `matrix.suite`), the no-auth LiteLLM proxy bound to the runner's `localhost:4000`; `ci-detect.mjs` workflow-command injection through PR-controlled filenames (name allow-list).

## Insights to record
- None yet; candidate after the first real run: whether DeepSeek V4 Flash passes the tool/workflow tiers (root `INSIGHTS.md`, evals).

## Red-flags check
- [x] Every AC maps to at least one step or test (AC1–AC2, AC5–AC6 → S2; AC3–AC4 → S1, S2; AC7 → S3)
- [x] Every spec AC-n has a row in *Spec traceability* — n/a (no spec)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; technical choices are in *Decisions needed*, product gaps are GAPn
- [x] Groups end type-checking; parallel groups share no file
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1 — n/a (single pass)
- [x] Execution mode: single-agent (single pass)
- [x] Every step's *Skills to apply* is complete
- [x] `bash .claude/skills/sdd/scripts/sdd.sh plan-lint <plan>` prints `plan-lint: ok`

## Handoffs → all
Implementer run 1 (2026-10-11): S1–S3 done; files `evals/scripts/ci-detect.mjs`, `.github/workflows/harness-evals.yml` (new), `evals/README.md`.
Deviations (trivial): SKIP / "not referenced" lines and the `k=v` fallback go to stdout, summary stays on stderr; unused `REPO_ROOT` removed, `mode` line added to the summary; `has_key` reaches `run:` via `env: HAS_KEY`.
Not verified: actionlint (not installed); a real Actions run (diff, fork-PR key gating, empty-matrix skip, proxy on runner, artifact upload, DeepSeek V4 slugs, Agent SDK headless on a bare runner).
Main-session note: full `.it` suite not run — the plan touches no server/ code (no Postgres-backed test is affected).

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | none | no server code touched |
| `engineering-insights` | preload | none | insight candidates returned, not written |
| `security` | on demand | S1, S2 | — |

## Verification log
- 2026-10-11 plan-verifier (full pass): **complete — needs sign-off** — 46/50 met, 0 gaps; not-verifiable: AC5 (empty-matrix / fork-PR skip — needs a real Actions run), D14 (actionlint not installed), R3 (plan never checkpointed at approval), R4 (n/a, no test-writer). Awaiting the user's acceptance of these items.
- 2026-10-11 architecture-reviewer: PASS, no findings.
- 2026-10-11 security-reviewer: PASS, no findings. Non-blocking hardening noted: SHA-pin actions + LiteLLM image digest in key-bearing jobs; pre-existing `evals/proxy/docker-compose.yml` binds `4000:4000` on all interfaces (suggest `127.0.0.1:4000:4000` for local use); `evals/results` artifacts hold full model traces (visible to anyone if the repo is public).
