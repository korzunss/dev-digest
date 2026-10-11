# Development Plan: harness evals in GitHub Actions on OpenRouter (DeepSeek V4 Flash)
Status: in-progress
Save as: docs/plans/31-harness-evals-ci.md
Spec: none (tooling: CI workflow for the evals/ package)
Execution: single-agent

## Goal & acceptance criteria
Run the harness evals (`evals/`) in GitHub Actions on pull requests, on the OpenRouter backend with DeepSeek V4 Flash as the task model, switchable per run through `workflow_dispatch` inputs or repo variables (no UI). Only the suites a PR actually touches run (all suites with evals when the CI engine itself changes, D5); anything without evals or an empty suite list ends green with a visible skip line, and a failed eval is a warning, not a red PR (D1 rev 2). A missing secret is silent only on fork PRs; on a same-repo PR or a dispatch it fails `detect` (D6).

- AC1: `.github/workflows/harness-evals.yml` triggers on `pull_request` (paths filter over the harness) and on `workflow_dispatch` with inputs `model`, `judge_model`, `scope`; `EVAL_MODEL` resolves `inputs.model` → `vars.EVAL_MODEL` → `deepseek/deepseek-v4-flash`, `EVAL_JUDGE_MODEL` resolves `inputs.judge_model` → `vars.EVAL_JUDGE_MODEL` → `deepseek/deepseek-v4-pro`.
- AC2: a `detect` job computes the changed files with plain `git diff --name-only <base>...<head>` (no third-party changed-files action) and feeds them to `evals/scripts/ci-detect.mjs`; on `workflow_dispatch` with `scope: all` it runs every suite that has evals.
- AC3: `ci-detect.mjs` triggers the workflow tier on the root `CLAUDE.md`/`AGENTS.md`, nested `*/AGENTS.md`, `*/CLAUDE.md`, `*/insights/gotchas.md` (outside `.claude/` and `server/clones/`), `.claude/settings.json`, any agent definition, `evals/workflow/**`, `evals/src/**`; a skill change triggers it only when the skill's name appears as a token in `evals/workflow/*.cases.ts` (D3). A CI-engine change (`.github/workflows/harness-evals.yml`, `evals/scripts/**`, `evals/proxy/**`, `evals/package.json`, `evals/pnpm-lock.yaml`) selects every suite with evals plus the workflow tier, same as `CI_DETECT_ALL`, and logs why (D5, S4).
- AC4: a changed skill or agent with no `evals/<tier>/<name>/*.eval.ts` is not run and does not fail: the log has `SKIP <tier> <name> (no evals)` and a `::notice` annotation (D4).
- AC5: model jobs are skipped cleanly when their suite list is empty; when `OPENROUTER_API_KEY` is unavailable, `detect` emits a `::notice` and model jobs skip on a fork PR, but `detect` fails with `::error` + exit 1 on a same-repo PR or a `workflow_dispatch` (D6, S5); no `pull_request_target`.
- AC6: a `static` job (no model) runs `pnpm typecheck`, `pnpm eval:quality`, `src/records/stats.test.ts`; skills matrix (content tier, direct OpenRouter), agents matrix (tool tier, LiteLLM proxy), both `max-parallel: 1`; the workflow job (proxy); eval failures are non-blocking (D1 rev 2, S6): the eval run step in `skills` / `agents` / `workflow` has step-level `continue-on-error: true` and a follow-up step emits `::warning` when its outcome is `failure`; no job sets job-level `continue-on-error`; `detect` and `static` stay blocking; every model job uploads `evals/results` with `if: always()`.
- AC7: `evals/README.md` → "Wiring it into GitHub Actions (per-PR)" describes the real workflow: triggers, jobs, model switch (dispatch inputs, repo variables), the secret, the skip behaviour; after S7 also the non-blocking eval steps, the engine-change rule and the missing-key behaviour.

## Decisions needed
None open — see *Decisions recorded*.

## Decisions recorded
- D1 — ~~the workflow-tier job is non-blocking at first~~ **revised by the user (correction round 1): every model job is blocking** — `workflow` and `agents` both fail the run on a failed eval; no `continue-on-error` anywhere. The risk of red PRs while DeepSeek V4 Flash is unmeasured on the tool tiers is accepted. (user)
- Approval — the user approved the plan on 2026-10-11 after correction round 1 (D1 all-blocking; D2 Flash task / Pro judge confirmed by approval). (user)
- D2 — task model default `deepseek/deepseek-v4-flash`; judge model default `deepseek/deepseek-v4-pro`. **Interpretation:** the main session read the user's "так" as agreement to the Flash-task / Pro-judge compromise; confirm at approval. (user, interpreted)
- D3 — a skill change triggers the workflow tier **only** when that skill's name is mentioned in `evals/workflow/*.cases.ts`. (user)
- D4 — a changed skill/agent with no written evals is not tested and does not fail: `SKIP <tier> <name> (no evals)` in the log plus a `::notice`; an empty matrix list skips its job cleanly; no job errors just because nothing applies. (user)
- D1 (revision 2, plan change after the first real run on PR #21) — **eval jobs are non-blocking again** until the process is shaken out: a failed eval in `skills` / `agents` / `workflow` must not turn the PR red; it is reported as a warning and the results artifact is still uploaded. Blocking returns later by the user's decision. (user)
- D5 (plan change) — a change to the CI engine (`.github/workflows/harness-evals.yml`, `evals/scripts/**`, `evals/proxy/**`, `evals/package.json`, `evals/pnpm-lock.yaml`) runs every suite that has evals (same as `CI_DETECT_ALL`). Cause: PR #21 (base `L06_lab`, 5 changed files) skipped all model jobs, so a CI change tested nothing. (user)
- D6 (plan change) — on a same-repo PR or a manual dispatch, a missing `OPENROUTER_API_KEY` fails `detect` with an explicit error; on a fork PR the skip stays silent (notice only). (user)
- Approval 2 — the user approved the plan change (S4–S7: D1 rev 2, D5, D6) on 2026-10-11. (user)
- D7 (plan change after the second real run on PR #21, commit 65e331c) — the LiteLLM proxy runs with a master key: `LITELLM_MASTER_KEY` = the `OPENROUTER_API_KEY` value (clients already send that key as Bearer, no code change); the image is pinned by digest `sha256:60947db020b57e204823d3fbc8bb295c85be890d7c9adcc77fb4f5fc2fe410b2`; the port binds `127.0.0.1:4000:4000`; "no-auth" wording leaves the proxy config comments and the README. Cause: the moving tag `main-stable` now refuses to start without a master key ("LiteLLM proxy refused to start: no master key is set"), so `agents` and `workflow` failed at `Start LiteLLM proxy`; reproduced and the fix probed locally in Docker (health ok; no key → proxy 401 `No api key passed in`; Bearer key → forwarded to OpenRouter). (user)
- Approval 3 — the user approved D7 as described ("так, роби") on 2026-10-11. (user)
- Execution mode: `single-agent` (caller: trivial tooling plan, 1 package + 1 workflow file, 3 files).

## Prerequisites
- For the real run only (not for implementation): repo Actions secret `OPENROUTER_API_KEY`; optional repo variables `EVAL_MODEL` / `EVAL_JUDGE_MODEL`. Set by the user in GitHub settings.
- No new dependency. Local Done-when needs `node` ≥22 and `python3` with PyYAML (present: 6.0.1); `actionlint` is not installed here.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| all | S1–S3 | `evals/scripts/ci-detect.mjs`, `.github/workflows/harness-evals.yml` (create), `evals/README.md` | — | done — commit `1df59be` (PR #21) |
| fix-1 | S4–S7 | `evals/scripts/ci-detect.mjs`, `.github/workflows/harness-evals.yml`, `evals/README.md` (all modify) | all | done — commit `65e331c` |
| fix-2 | S8 | `evals/proxy/docker-compose.yml`, `evals/proxy/litellm.config.yaml` (comments), `evals/README.md` | fix-1 | none (single fix-mode run) |

Order: S1 (detector, verified locally with the CHANGED_FILES matrix) → S2 (workflow consumes S1's outputs) → S3 (README describes S1+S2). Plan change (correction round 2, after the first real run on PR #21): S4 (D5 detector) → S5 (D6 key check) → S6 (D1 rev 2 non-blocking eval steps) → S7 (README). S1–S3 are kept as done history; where S4–S7 supersede them, the later step wins. "Type-checks" here means `node --check` on the `.mjs` and the YAML parse check; fix-1 also re-runs the S1 Done-when matrix as a regression check. Plan change (correction round 3, after the second real run on PR #21): S8 (D7 proxy master key, pinned image, loopback port); its "type-check" is the proxy starting locally.

## Steps
S1–S7 are done (S1–S3 commit `1df59be`, S4–S7 commit `65e331c`); their full text is under *Done steps (history, 1df59be)* below the marker. Fix mode runs S8 only.

### S8 — D7: LiteLLM proxy with a master key, pinned image, loopback port  (fix-2)
- **Files:** `evals/proxy/docker-compose.yml` (modify), `evals/proxy/litellm.config.yaml` (modify — comments only), `evals/README.md` (modify — proxy/CI wording only)
- **Change:** in `docker-compose.yml`: `image: ghcr.io/berriai/litellm:main-stable@sha256:60947db020b57e204823d3fbc8bb295c85be890d7c9adcc77fb4f5fc2fe410b2`; `ports: ["127.0.0.1:4000:4000"]`; env adds `LITELLM_MASTER_KEY: ${OPENROUTER_API_KEY:?set OPENROUTER_API_KEY in the environment}` beside the existing `OPENROUTER_API_KEY`; header comment says why (the moving tag now refuses to start without a master key; clients already send `OPENROUTER_API_KEY` as Bearer — `src/runtime/env.ts` `ANTHROPIC_AUTH_TOKEN`, `src/runtime/run-openrouter.ts:31` `apiKey` — so the master key equals it, no code change). In `litellm.config.yaml` rewrite only the `general_settings` comment (`:29-32`): master key from `LITELLM_MASTER_KEY`, loopback-only port; no YAML key changes. In `README.md`: the engine-pieces rows for `proxy/litellm.config.yaml` / `proxy/docker-compose.yml` (`:129-130`) and the paragraph at `:156-158` describe the master key (= `OPENROUTER_API_KEY`), the pinned digest and the `127.0.0.1` bind instead of "no-auth"; keep the verified-model table and every other section unchanged.
- **Layer / why here:** the proxy's runtime config lives in `evals/proxy/` (D5 makes this PR run all suites, which is the real-runner check).
- **Skills to apply:** `security`
- **Practices:** no key value in any file; the compose `:?` guard stays so a missing key fails fast; `pnpm proxy:down` keeps working (`scripts/litellm-proxy.sh` already sets a placeholder `OPENROUTER_API_KEY` on `down`, which also satisfies the new interpolation); `scripts/litellm-proxy.sh` is not edited.
- **Known gotchas:** root `INSIGHTS.md` 2026-09-28 Markdown line-wrap grep entry — README checks use single tokens; the health probes (`litellm-proxy.sh` `wait_healthy`, compose `healthcheck`) hit `/health/liveliness`, which D7's local probe showed answers without a key.
- **Done when:** (Docker running, repo root) `OPENROUTER_API_KEY=sk-or-v1-probe pnpm --dir evals proxy:up` exits 0; `curl -s localhost:4000/v1/messages` (no auth) prints a body containing `No api key passed in`; `curl -s -H 'authorization: Bearer sk-or-v1-probe' localhost:4000/v1/messages` prints a body without `No api key passed in` (an upstream OpenRouter error is expected); `docker port devdigest-eval-litellm` shows `127.0.0.1`; `pnpm --dir evals proxy:down` exits 0; `! grep -i 'no-auth' evals/proxy/litellm.config.yaml evals/README.md`; `grep -F 'LITELLM_MASTER_KEY' evals/proxy/docker-compose.yml` and `grep -F 'sha256:60947db0' evals/proxy/docker-compose.yml` match; `grep -F 'gemini-2.5-flash' evals/README.md` still matches. The run on a GitHub runner (`agents` / `workflow` get past `Start LiteLLM proxy`) is needs-sign-off.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| none (no test file added) | — | `ci-detect.mjs` is checked by the S1 CHANGED_FILES command matrix; `stats.test.ts` runs unchanged in `static` | S1, S2 |
| none (no test file added) | — | D5 via the S4 CHANGED_FILES commands (PR #21 file set, docs-only, each engine path); D6 via the S5 key-step script run under four env sets; D1 rev 2 via the S6 YAML asserts | S4, S5, S6 |

## Migrations & contracts
None.

## Out of scope
- No change to `evals/src/**` (runners, sandbox, config defaults stay `claude-haiku-4-5` / `claude-sonnet-5` for local runs), `evals/scripts/litellm-proxy.sh`, eval cases or the verified-model table; `evals/proxy/**` only as S8 states (D7).
- No new evals for skills/agents that have none; no branch-protection / required-check configuration (making any job a required check is a later repo-settings choice); no making eval failures blocking again (D1 rev 2: later user decision).
- No SHA-pinning of the GitHub actions (Verification-log hardening note) — separate follow-up if the user asks; the LiteLLM image digest and the `127.0.0.1` bind are now in scope (S8, D7).
- No `push`/`schedule` triggers, no `pull_request_target`, no third-party changed-files action, no edits to other workflows.

<!-- implementer-brief:end -->

## Done steps (history, 1df59be)
Implemented and committed in `1df59be` (PR #21); kept for the record and for the plan-verifier. Where S4–S7 conflict with these, S4–S7 win.

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
  - **`detect`** (timeout 5): `actions/checkout@v4` with `fetch-depth: 0`; step `key` writes `has_key=${{ secrets.OPENROUTER_API_KEY != '' }}` to `$GITHUB_OUTPUT` and, when false, prints `::notice::OPENROUTER_API_KEY not available (fork PR or unset) — model evals skipped` (superseded by S5, D6); step `changes` (`working-directory: .`): for `pull_request` builds `CHANGED_FILES` from `git diff --name-only "$BASE_SHA...$HEAD_SHA"` where `BASE_SHA`/`HEAD_SHA` come from `github.event.pull_request.base.sha` / `.head.sha` via `env:`; for `workflow_dispatch` with `scope: all` sets `CI_DETECT_ALL=1`; with `scope: changed` diffs `origin/${{ github.event.repository.default_branch }}...HEAD` (default branch name via `env:`). Then `node evals/scripts/ci-detect.mjs`. Job outputs: `skills`, `agents`, `run_workflow`, `has_key`. No pnpm install in this job (S1 has no deps).
  - **`static`** (timeout 10, no model, no secret, always runs): install, `pnpm typecheck`, `pnpm eval:quality`, `pnpm exec vitest run src/records/stats.test.ts`.
  - **`skills`** (timeout 20): `needs: detect`; `if: needs.detect.outputs.has_key == 'true' && needs.detect.outputs.skills != '[]'`; `strategy.matrix.suite: ${{ fromJSON(needs.detect.outputs.skills) }}`, `max-parallel: 1`, `fail-fast: false`; no proxy, no `OPENROUTER_BASE_URL` (content tier goes direct, `src/runtime/dispatch.ts`); runs `pnpm exec vitest run "skills/$SUITE/"` with `SUITE: ${{ matrix.suite }}` via `env:`.
  - **`agents`** (timeout 30): same gating on `agents`; env adds `OPENROUTER_BASE_URL: http://localhost:4000`; `pnpm proxy:up` → `pnpm exec vitest run "agents/$SUITE/"`; `if: failure()` → `docker compose -f proxy/docker-compose.yml logs --tail 100`; `if: always()` → `pnpm proxy:down`.
  - **`workflow`** (timeout 45): `if: needs.detect.outputs.has_key == 'true' && needs.detect.outputs.run_workflow == 'true'`; no job-level `continue-on-error`; the eval step is made non-blocking at step level by S6 (D1 rev 2); a git identity step (`git config --global user.email/user.name` with a bot identity, assumption) before the run; proxy as in `agents`; `pnpm eval:workflow`.
  - **Artifacts:** every model job ends with `actions/upload-artifact@v4`, `if: always()`, `path: evals/results`, `if-no-files-found: ignore`, a unique name per job and matrix entry (`harness-evals-skills-${{ matrix.suite }}`, `harness-evals-agents-${{ matrix.suite }}`, `harness-evals-workflow`).
- **Layer / why here:** CI wiring only; all routing decisions live in S1, all engine behaviour in `evals/src` and `evals/proxy` (reused unchanged).
- **Skills to apply:** `security`
- **Practices:** no `${{ … }}` expression interpolated inside a `run:` script for any PR- or input-controlled value (shas, branch names, `inputs.*`, `matrix.suite`) — pass via `env:` and quote the shell variable (A05 command injection); the secret is never echoed and reaches only model jobs; `permissions: contents: read` at workflow level; only first-party `actions/*` plus `pnpm/action-setup` (already used by `mcp-server.yml`); every model job is skipped (not failed) when its list is empty or the key is missing.
- **Known gotchas:** `secrets` cannot appear in a job-level `if:` — hence the `has_key` output from `detect`; `upload-artifact@v4` fails on duplicate names across matrix jobs; `vitest run agents/architecture-reviewer` would also match `architecture-reviewer-lite` — keep the trailing `/`; root `INSIGHTS.md` 2026-10-11 "`allowedTools` and a PreToolUse deny hook do not keep an SDK workflow eval read-only" → the workflow tier depends on `createSandbox()` (`evals/src/runtime/sandbox.ts:71-76`: `git stash create` or HEAD, then `git worktree add --detach`); on a clean CI checkout `stash create` returns empty and HEAD is used, and `evals/results/` + `node_modules/` are gitignored (`evals/.gitignore`), so the real-repo guard stays clean — the identity step only protects the dirty-tree path where `stash create` writes a commit object; root `INSIGHTS.md` 2026-10-11 "an eval record's outcome falls back to …" → workflow pass/fail in records is meaningful only because cases pass `passed`; do not add a CI step that reads `outcome` from `records.jsonl` as a gate.
- **Done when:** (as implemented in `1df59be`; the current YAML assertion, updated for D1 rev 2, lives in S6's Done-when) the PyYAML parse check printed `yaml ok`; `grep -F 'deepseek/deepseek-v4-flash' .github/workflows/harness-evals.yml` and `grep -F 'secrets.OPENROUTER_API_KEY' .github/workflows/harness-evals.yml` match; `actionlint .github/workflows/harness-evals.yml` exits 0 **if** actionlint is available (not installed here — record "not run" otherwise).

### S3 — rewrite README "Wiring it into GitHub Actions (per-PR)"
- **Files:** `evals/README.md` (modify — only the section starting `### Wiring it into GitHub Actions (per-PR)`, `README.md:189-244`, plus one row in *Environment variables*, `README.md:513-524`)
- **Change:** replace the generic sample YAML with a description of `.github/workflows/harness-evals.yml`: triggers (paths list, dispatch inputs `model` / `judge_model` / `scope`); the job table (`detect`, `static`, `skills`, `agents`, `workflow` — what each runs, proxy or not; blocking wording superseded by S7: eval failures are non-blocking warnings, D1 rev 2); the model switch (precedence `inputs` → repo variables `EVAL_MODEL`/`EVAL_JUDGE_MODEL` → defaults `deepseek/deepseek-v4-flash` / `deepseek/deepseek-v4-pro`, with "repo variables: Settings → Secrets and variables → Actions → Variables"); the secret `OPENROUTER_API_KEY` and that fork PRs skip model jobs; the change → suite rules (S1, incl. D3 token match in `evals/workflow/*.cases.ts`); the skip behaviour (`SKIP <tier> <name> (no evals)` + `::notice`, empty lists skip jobs); how to reproduce detection locally (`CHANGED_FILES=… node scripts/ci-detect.mjs`, `CI_DETECT_ALL=1`). Add `CI_DETECT_ALL` to the env-var table (scope: `scripts/ci-detect.mjs` only). Note that DeepSeek V4 Flash on the tool tiers is unmeasured (the verified-model table lists `deepseek/deepseek-chat` failing dispatch, `README.md:166-170`) — do not edit that table.
- **Layer / why here:** the package doc owns the how-to; the section already exists and is the place the brief names.
- **Skills to apply:** none (Markdown only)
- **Practices:** describe what the YAML does, no second full YAML copy (it would drift); keep the other README sections untouched.
- **Known gotchas:** root `INSIGHTS.md` 2026-09-28 "a Done-when `grep` for a phrase fails when Markdown wraps that phrase across two lines" — checks below use single tokens.
- **Done when:** `grep -F 'harness-evals.yml' evals/README.md`, `grep -F 'CI_DETECT_ALL' evals/README.md`, `grep -F 'deepseek-v4-flash' evals/README.md`, `grep -F 'workflow_dispatch' evals/README.md` each match; `grep -F 'gemini-2.5-flash' evals/README.md` still matches (verified-model table kept).

S4–S7 below were implemented in fix-1, commit `65e331c`; moved here in correction round 3 to keep the brief under the size limit.

### S4 — D5: a CI-engine change runs every suite with evals  (fix-1)
- **Files:** `evals/scripts/ci-detect.mjs` (modify)
- **Change:** in the `changed` branch (not `allMode`), add `engineFile(f)` true for `.github/workflows/harness-evals.yml`, any path under `evals/scripts/`, any path under `evals/proxy/`, `evals/package.json`, `evals/pnpm-lock.yaml`. When any changed file matches: `skills = allWithEvals("skills")`, `agents = allWithEvals("agents")`, `runWorkflow = true`; `skippedSkills` / `skippedAgents` are still computed from the touched names as today, so a no-evals skill in the same PR keeps its SKIP line. Print one stdout line per matched engine category, e.g. `engine-change: evals/scripts/** → running every suite with evals (D5)` — the category label is a fixed string from the code, never the raw path. Add a `mode` value `engine` to the stderr summary (`mode : engine`). Update the header comment with the D5 rule. `allMode` stays as is; `evals/src/**` keeps triggering only the workflow tier (D5 lists the five engine paths only).
- **Layer / why here:** the detector owns path → suite mapping (S1); the workflow does not change for D5.
- **Skills to apply:** `security`
- **Practices:** only fixed strings and `SAFE_NAME`-checked names reach stdout / `$GITHUB_OUTPUT`; still only `node:fs`/`node:path`/`node:url`; exit 0 for every input.
- **Known gotchas:** `CHANGED_FILES` from `git diff` lists the workflow file as `.github/workflows/harness-evals.yml` (repo-relative) — match it exactly; `evals/README.md` is not an engine file (docs-only stays empty).
- **Done when:** `node --check evals/scripts/ci-detect.mjs` passes, and (repo root, `2>&1` merged, each line checked with `grep -F`):
  - `CHANGED_FILES="$(git diff --name-only dc48d79...1df59be)" node evals/scripts/ci-detect.mjs` (the 5 files of PR #21) → `skills=["dependency-checker"]`, `agents=["architecture-reviewer","architecture-reviewer-lite"]`, `run_workflow=true`, an `engine-change:` line.
  - `CHANGED_FILES=$'docs/plans/README.md\nevals/README.md' node evals/scripts/ci-detect.mjs` → `skills=[]`, `agents=[]`, `run_workflow=false`, and no `engine-change:` line (`! grep -F 'engine-change:'`).
  - each of `evals/proxy/litellm.config.yaml`, `evals/package.json`, `evals/pnpm-lock.yaml`, `evals/scripts/litellm-proxy.sh` alone → `run_workflow=true` and `skills=["dependency-checker"]`.
  - `CHANGED_FILES=$'evals/package.json\n.claude/skills/zod/SKILL.md' node evals/scripts/ci-detect.mjs` → `SKIP skills zod (no evals)` and `skills=["dependency-checker"]`.
  - regression (S1 behaviour unchanged): `.claude/skills/dependency-checker/SKILL.md` alone → `skills=["dependency-checker"]`, `run_workflow=false`; `.claude/skills/engineering-insights/SKILL.md` → `SKIP skills engineering-insights (no evals)`, `run_workflow=true`; `server/AGENTS.md` → `run_workflow=true`, `skills=[]`; empty `CHANGED_FILES` → `skills=[]`, `agents=[]`, `run_workflow=false`; `CI_DETECT_ALL=1` → `agents=["architecture-reviewer","architecture-reviewer-lite"]`, `run_workflow=true`.

### S5 — D6: a missing key fails `detect` on a same-repo PR or a dispatch  (fix-1)
- **Files:** `.github/workflows/harness-evals.yml` (modify — the `Check OPENROUTER_API_KEY` step of `detect`, and the header comment's "skipped (green, with a notice)" sentence)
- **Change:** step env: `HAS_KEY: ${{ secrets.OPENROUTER_API_KEY != '' }}`, `EVENT_NAME: ${{ github.event_name }}`, `HEAD_REPO: ${{ github.event.pull_request.head.repo.full_name }}`, `BASE_REPO: ${{ github.repository }}`. Script: always write `has_key=$HAS_KEY` to `$GITHUB_OUTPUT`; if `HAS_KEY` is not `true`: when `EVENT_NAME` is `workflow_dispatch`, or `EVENT_NAME` is `pull_request` and `"$HEAD_REPO" = "$BASE_REPO"`, print `::error title=harness evals::OPENROUTER_API_KEY is not set — add it under Settings → Secrets and variables → Actions` and `exit 1`; otherwise (fork PR) print the existing `::notice` and exit 0. Header comment: fork PRs skip with a notice; a same-repo PR or dispatch without the key fails `detect`.
- **Layer / why here:** the key check already lives in `detect` (S2); model jobs `need` `detect`, so a failed `detect` skips them without further edits.
- **Skills to apply:** `security`
- **Practices:** no `${{ … }}` inside the `run:` script — every value via `env:` and quoted (`"$HEAD_REPO"`); the secret value is never printed, only the boolean; `static` does not depend on `detect` and keeps running.
- **Known gotchas:** `secrets` cannot be used in a job-level `if:` (hence the step output, S2); on a fork PR `secrets.*` is empty, so `HAS_KEY` is `false` there by design.
- **Done when:** a `python3 -c` command that loads the YAML with PyYAML, takes the `detect` step with `id: key`, asserts its `run` contains no `${{`, then runs that `run` text with `bash -c` four times (env `GITHUB_OUTPUT=<scratchpad file>`) and asserts: `HAS_KEY=false EVENT_NAME=pull_request HEAD_REPO=o/r BASE_REPO=o/r` → exit 1, stdout has `::error`; `HAS_KEY=false EVENT_NAME=pull_request HEAD_REPO=fork/r BASE_REPO=o/r` → exit 0, stdout has `::notice`; `HAS_KEY=false EVENT_NAME=workflow_dispatch HEAD_REPO= BASE_REPO=o/r` → exit 1; `HAS_KEY=true EVENT_NAME=pull_request HEAD_REPO=o/r BASE_REPO=o/r` → exit 0 and the output file has `has_key=true`. Prints `key-check ok`.

### S6 — D1 rev 2: eval failures are warnings, not a red PR  (fix-1)
- **Files:** `.github/workflows/harness-evals.yml` (modify — jobs `skills`, `agents`, `workflow`)
- **Change:** in each of the three jobs, the eval run step (`Run skill evals`, `Run agent evals`, `Run workflow evals`) gets `id: evals`, step-level `continue-on-error: true`, and a step-level `timeout-minutes` below the job's (skills 15 / job 20, agents 22 / job 30, workflow 35 / job 45 — assumption) so a hang ends as a step failure the job survives. Right after it add a step `Report eval failure` with `if: always() && steps.evals.outcome == 'failure'`, env `TIER: <skills|agents|workflow>` and (matrix jobs) `SUITE: ${{ matrix.suite }}`, running `echo "::warning title=harness evals::$TIER evals failed${SUITE:+ for $SUITE} — non-blocking for now (D1); see the results artifact"` and appending the same line to `"$GITHUB_STEP_SUMMARY"`. Change the `Proxy logs` condition from `if: failure()` to `if: always() && (failure() || steps.evals.outcome == 'failure')` — with step-level `continue-on-error` the job is no longer in `failure()` after a failed eval. `Stop LiteLLM proxy` and `upload-artifact` keep `if: always()`. No job-level `continue-on-error` anywhere (it still shows a red check on the PR). `detect`, `static`, install and `Start LiteLLM proxy` stay blocking.
- **Layer / why here:** CI wiring only; the outcome logic in `evals/` is untouched.
- **Skills to apply:** `security`
- **Practices:** `matrix.suite` reaches the script only via `env:`; no `${{ … }}` in any `run:`; the warning text has no secret or model output in it.
- **Known gotchas:** `steps.<id>.outcome` is the pre-`continue-on-error` result (`failure`), `conclusion` is `success` — test `outcome`; root `INSIGHTS.md` 2026-10-11 "an eval record's outcome falls back to …" — the vitest exit code is the signal here, not `records.jsonl`.
- **Done when:** `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/harness-evals.yml')); j=d['jobs']; assert set(j)=={'detect','static','skills','agents','workflow'}; assert all('continue-on-error' not in v for v in j.values()); assert all(any(s.get('continue-on-error') is True for s in j[k]['steps']) for k in ('skills','agents','workflow')); assert not any('continue-on-error' in s for k in ('detect','static') for s in j[k]['steps']); assert j['skills']['strategy']['max-parallel']==1 and j['agents']['strategy']['max-parallel']==1; assert 'pull_request_target' not in d[True]; print('yaml ok')"` prints `yaml ok`; and a `python3 -c` command over the parsed YAML asserts, for each of `skills`, `agents`, `workflow`: one step with `id == 'evals'`, `continue-on-error is True` and a `timeout-minutes` lower than the job's; one step whose `if` contains `steps.evals.outcome == 'failure'` and whose `run` contains `::warning`; the `upload-artifact` step's `if` is `always()`; and, over every job, no `run` contains `${{`. Prints `nonblocking ok`.

### S7 — README: non-blocking evals, engine-change rule, missing-key behaviour  (fix-1)
- **Files:** `evals/README.md` (modify — only the `### Wiring it into GitHub Actions (per-PR)` section)
- **Change:** replace the "Every model job is blocking (no `continue-on-error`) …" paragraph with: eval failures in `skills` / `agents` / `workflow` are non-blocking for now — the eval step has step-level `continue-on-error`, a failure shows as a `::warning` annotation and a job-summary line, the job stays green and the artifact is uploaded; `detect` and `static` stay blocking; blocking returns by a later decision. Keep the sentence that DeepSeek V4 Flash on the tool tiers is unmeasured. Rewrite the **Secret** paragraph: fork PRs skip model jobs with a `::notice`; a same-repo PR or a manual dispatch without the key fails `detect` with an `::error`. Add a bullet to **Change → suite rules**: a CI-engine change (the five D5 paths) runs every suite with evals plus the workflow tier, same as `CI_DETECT_ALL`, with an `engine-change:` log line.
- **Layer / why here:** package doc for the CI (S3 section).
- **Skills to apply:** none (Markdown only)
- **Practices:** describe, do not paste YAML; no other README section changes.
- **Known gotchas:** root `INSIGHTS.md` 2026-09-28 Markdown line-wrap grep entry — single-token checks below.
- **Done when:** `grep -F 'non-blocking' evals/README.md`, `grep -F '::warning' evals/README.md`, `grep -F '::error' evals/README.md`, `grep -F 'engine' evals/README.md` each match; `tr '\n' ' ' < evals/README.md | grep -F 'model job is blocking'` finds nothing (the old paragraph is gone).

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
- **Tool tiers on DeepSeek are unmeasured — now non-blocking (D1 rev 2).** README's verified table records `deepseek/deepseek-chat` failing subagent dispatch (`README.md:166-170`). A failure in `agents` / `workflow` (or `skills`) shows as a `::warning` and a green job, so a real regression can be missed unless someone reads the warnings/artifact; that trade-off is the user's decision until blocking returns.
- **Still red for infrastructure, by design (assumption, S6):** `pnpm install`, `Start LiteLLM proxy` (image pull, health wait) and a job-level timeout are not covered by the step-level `continue-on-error`; a flaky proxy start or a job timeout still turns the PR red. The step `timeout-minutes` below the job's (S6) keeps a hanging eval from reaching the job timeout. If the user wants the proxy start non-blocking too, that is a new decision.
- **D5 cost:** every PR that touches the CI engine (incl. `evals/pnpm-lock.yaml` bumps) runs all suites, including the workflow tier — the most expensive run.
- **D6 on `workflow_dispatch` from a fork:** not applicable (dispatch needs write access); Dependabot: not applicable today (the repo has no `.github/dependabot.yml`); becomes relevant if Dependabot is enabled — its PRs are same-repo but get no Actions secrets, so they would fail `detect` under D6 unless the key is also added as a Dependabot secret.
- **Claude Agent SDK on a bare runner** — the SDK package ships its own runtime (`node_modules/@anthropic-ai/claude-agent-sdk` has `manifest.json`, `bridge.mjs`), but whether it runs headless on ubuntu-latest without a `claude` CLI on PATH, and whether it issues side requests for a default small/fast Anthropic model that the LiteLLM wildcard would forward to OpenRouter under an Anthropic id, is unverified. Researcher question.
- **Cannot be verified locally (needs sign-off):** a real Actions run — `fetch-depth: 0` diff, `has_key` gating on a fork PR, empty-matrix skip, proxy start on the runner, artifact upload, total cost/time per PR; after fix-1 also: a real same-repo PR without the key failing `detect` (D6), a failed eval step yielding a green job with a `::warning` annotation and a PR check that is not red (D1 rev 2), and a CI-engine PR running all suites (D5); after fix-2: `agents` / `workflow` getting past `Start LiteLLM proxy` on a GitHub runner with the master key and pinned image (D7).
- Doc vs code: README "Wiring it into GitHub Actions" shows a sample with `google/gemini-2.5-flash` and no detector; S3 replaces it. `ci-detect.mjs` defines an unused `REPO_ROOT` (`:23`) — S1 may use it for the cases read.

## Handed off
- architecture-reviewer: nothing in onion scope.
- security review: `.github/workflows/harness-evals.yml` — secret exposure to fork PRs (must stay `pull_request`, key-gated), expression injection in `run:` (shas, `inputs.*`, `matrix.suite`), the LiteLLM proxy on the runner's `127.0.0.1:4000` (master key = `OPENROUTER_API_KEY`, pinned digest, S8); `ci-detect.mjs` workflow-command injection through PR-controlled filenames (name allow-list).

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
- [x] The brief above the marker is under ~20,000 characters (S1–S3 moved below the marker in correction round 2)
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

## Handoffs → fix-1
Implementer run 2 (2026-10-11): S4–S7 done; files `evals/scripts/ci-detect.mjs`, `.github/workflows/harness-evals.yml`, `evals/README.md`.
Deviations (trivial): one `engine-change:` line per matched category; fork notice text now "(fork PR)"; workflow-job warning has no SUITE suffix (no matrix).
Verified locally: node --check, S4 CHANGED_FILES matrix incl. PR #21 set and regressions, `yaml ok`, `nonblocking ok`, `key-check ok`, README greps. Not verified: real Actions run, actionlint.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `security` | on demand | S4, S5, S6 | — |
| `engineering-insights` | preload | none | no new insight |
| `onion-architecture` | preload | none | tooling/CI only |
- 2026-10-11 plan-verifier (fix-1 wave, S4–S7 + S1–S3 regression): **complete — needs sign-off** — 43/46 met, 0 gaps; not-verifiable: AC5 / D6 / D1 rev 2 / D5 on a real Actions run (next push to PR #21 is an engine change and should run every suite), R3 (no checkpoint at Approval 2), R4 (n/a).
- 2026-10-11 security-reviewer (fix-1): PASS, no findings. Note: the `workflow` job's report step references an unset `$SUITE` (expands to empty, harmless; left as is).

## Handoffs → fix-2
Implementer run 3 (2026-10-11): S8 done; files `evals/proxy/docker-compose.yml`, `evals/proxy/litellm.config.yaml` (comments), `evals/README.md`. Probed locally with a probe key: proxy:up exit 0; no auth → `No api key passed in`; Bearer → forwarded upstream; port 127.0.0.1; proxy:down clean. Deviation (trivial): probes sent as POST (GET gives 405). Not verified: runner run.
Note: the implementer did not read `.claude/skills/security/SKILL.md` although S8 lists it (applied the practices by hand).

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `security` | on demand (SK1 fix, read after the S8 run) | S8: `docker-compose.yml` (env-only key, `:?` guard, digest pin, loopback bind), `litellm.config.yaml` comment, `README.md` | nothing flagged, no edits |
| `onion-architecture` | preload | none | no server code |
- 2026-10-11 plan-verifier (fix-2, S8/D7): **incomplete** — 18/22 met; gap SK1 (`security` skill not loaded). Not-verifiable: D10 proxy start on a runner, R3, R4. Note: S8 Done-when says GET; the endpoint needs POST (GET → 405); a wrong Bearer key gets 400 `No connected db.`, not 401.
- 2026-10-11 security-reviewer (fix-2): PASS, no findings.
- 2026-10-11 implementer fix mode SK1: skill read, S8 re-checked against A02/A03/A04/A07/A10, no code change; Skills row updated.
- 2026-10-11 plan-verifier delta (fix-2, SK1): **complete — needs sign-off** — 19/22 met, no gaps; needs sign-off: D10 (proxy start on a runner), R3; R4 n/a.
