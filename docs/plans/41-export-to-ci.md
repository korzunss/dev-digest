# Development Plan: Export to CI
Status: done
Execution: multi-agent
Save as: docs/plans/41-export-to-ci.md
Spec: specs/014-export-to-ci.md

## Spec traceability
| Spec AC | Covered by |
|---|---|
| AC-1 | S19, T12 |
| AC-2 | S23 |
| AC-3 | S13, S19, T9, T12 |
| AC-4 | S19, S20, T12 |
| AC-5 | S19, T12 |
| AC-6 | S20, T13 |
| AC-7 | S20, T13 |
| AC-8 | S12, S20, T13 |
| AC-9 | S20, T13 |
| AC-10 | S12, S20, T8, T13 |
| AC-11 | S8, S20, T4, T13 |
| AC-12 | S1, S8, T1, T4 |
| AC-13 | S8, S20, T4, T13 |
| AC-14 | S7, S8, T4, T8 |
| AC-15 | S8, S20, T4 |
| AC-16 | S9, T5 |
| AC-17 | S9, S20, T5, T13 |
| AC-18 | S9, S20, T5, T13 |
| AC-19 | S9, S20, T5, T13 |
| AC-20 | S11, S15, T7, T10 |
| AC-21 | S9, S21, T5, T13 |
| AC-22 | S21, T13 |
| AC-23 | S21, T13 |
| AC-24 | S18, S21, T13 |
| AC-25 | S21, T13 |
| AC-26 | S3, S12, T3, T8 |
| AC-27 | S8, T4 |
| AC-28 | S12, S21, T8 |
| AC-29 | S3, S12, S21, T3, T8, L1 |
| AC-30 | S12, S21, T8, T13 |
| AC-31 | S12, T8 |
| AC-32 | S3, S12, T3, T8 |
| AC-33 | S19, S20, T12 |
| AC-34 | S13, S19, T9, T12 |
| AC-35 | S19, T12 |
| AC-36 | S13, S19, T12 |
| AC-37 | S9, S16, S17, T5, T10, T11 |
| AC-38 | S16, T10 |
| AC-39 | S16, S17, T10, T11 |
| AC-40 | S16, T10 |
| AC-41 | S16, T10 |
| AC-42 | S16, S17, T10 |
| AC-43 | S1, S16, T1, T10 |
| AC-44 | S17, T11 |
| AC-45 | S13, S18, T9 |
| AC-46 | S13, T9 |
| AC-47 | S10, S13, T6, T9 |
| AC-48 | S7, S13, T9 |
| AC-49 | S5, S7, T9 |
| AC-50 | S10, S13, T6, T9 |
| AC-51 | S13, S22, T9, T14 |
| AC-52 | S13, S22, T14 |
| AC-53 | S13, S22, T9, T14 |
| AC-54 | S22, T14 |
| AC-55 | S5, S22, T9, T14 |
| AC-56 | S9, S20, T5, T13 |
| AC-57 | S18, T12 |
| AC-58 | S13, T9 |
| AC-59 | S3, S12, T3, T8 |
| AC-60 | S13, S19, T9, T12 |
| AC-61 | S13, S19, T9 |
| AC-62 | S13, S19, T9, T12 |
| AC-63 | S13, S19, T9, T12 |
| AC-64 | S19, T12 |
| AC-65 | S13, S19, T9 |
| AC-66 | S13, S22, T14 |
| AC-67 | S12, T8 |
| AC-68 | S12, S20, T8, T13 |
| AC-69 | S6, S7, T9 |
| AC-70 | S1, S10, T1, T6 |
| AC-71 | S9, T5 |
| AC-72 | S9, S17, T5, T11 |

## Decisions needed
None open — see *Decisions recorded*.

## Decisions recorded
- 2026-10-14 · GAP2 → A: the export is blocked for an agent whose provider is not `openrouter`, with the reason and a hint to switch the provider in Config. Follow-up (not in this plan, record in the spec as a future option): option C, the runner gains OpenAI/Anthropic adapters and asks for `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` per the agent's provider · user "Залишаємо А але десь треба помітити варіант С (можливо імплементуємо це пізніше)"
- 2026-10-14 · all remaining items by recommendation · user "усі інщі по твоїм рекомендаціям":
  - GAP1 → DevDigest may delete and recreate `devdigest/ci` only when every commit past the merge-base carries its own `DevDigest-Export` trailer; otherwise refuse and offer the zip; never force-push.
  - GAP3 → the PR link lives on `ci_runs` only; the `agent_runs` row with source `ci` gets no `pr_id` and no `run_skills` rows, so CI runs stay out of the PR list cost rollup, the in-flight check, eval `latestDoneRuns` and skill stats.
  - GAP4 → CI run status ∈ `passed` · `gate_failed` · `error`; `running` is never stored.
  - GAP5 → REC1 accepted: the workflow checks out `.devdigest/` (runner + manifest + skills + memory) at the base SHA and takes only the diff from the head; the export PR's own run is skipped with a notice; manifest edits apply after merge. Plus: the PR body checklist and the Configure info box recommend protecting `.github/` and `.devdigest/` with CODEOWNERS + a ruleset, because for `pull_request` GitHub runs the workflow file from the PR itself.
  - REC2 (→ D1), REC3 (→ D4) accepted.
  - D1–D10 → option A each; D11 → multi-agent.
  - TQ1–TQ4 → defaults (`DEVDIGEST_POST_AS` env; PR base = default branch read from GitHub at install; artifact zip ≤ 1 MiB / JSON ≤ 256 KiB; Node 22).
- 2026-10-15 · pass 2 reviewed: brief size → (a) accepted as is, no 40a/40b split; result artifact carries per-severity counts only, no finding bodies (findings live in the GitHub review); plan approved · user "так" (to "a, лічильники, схвалюю")
- 2026-10-15 · SF3 → A: the server compares the whole submitted workflow with the generated one; only workflow `name`, job `timeout-minutes` and `runs-on` ∈ {ubuntu-latest, ubuntu-24.04, ubuntu-22.04} may differ (triggers and post-as come from Configure); anything else is refused with a clear error. Narrows AC-15/17/56 → spec correction + re-approval needed · user "SF3 - А (по твоїй рекомендації)"
- 2026-10-15 · memory export → (a): `.devdigest/memory.jsonl` carries only memory rows of the target repo; global-scope rows are no longer exported (they could leak knowledge from other repos into a possibly public repo). Changes B5/the memory AC → spec correction together with SF3 · user "добре, давай по твоїм рекомендаціям"
- 2026-10-15 · plan change D(S14) accepted: `check-module.sh ci` flags `server/src/adapters/github/octokit.ts` `fetch(url, { redirect: 'error' })` under one-adapter-per-system — an accepted exception: it follows GitHub's signed artifact redirect without the PAT (Octokit would forward `Authorization` to the blob host), https only, byte-capped, inside the GitHub adapter · same reply
- 2026-10-15 · P5 baseline: run `eval:repeat` on the workflow suite at HEAD vs this change to show whether the "server task reads server/insights/gotchas.md" flake predates it · same reply
- 2026-10-15 · absent `timeout-minutes` → (a): a submission that removed the key ships with the generated `timeout-minutes: 20`, never GitHub's 360-minute default · user "давай виправимо timeout-minutes зараз"
- 2026-10-15 · plan change accepted (fix mode 5, UX-2): `client/src/lib/providers.tsx` added to S18's Files — the global `MutationCache.onError` skips the toast for error codes a mutation renders inline (`meta.inlineErrorCodes`) · user "так"

## Prerequisites
Done by the main session (implementers never install anything):
- **P1, before G1:** `cd server && pnpm add yaml@^2`. The lock already holds `yaml@2.9.0` transitively.
- **P2, before G5:** create `agent-runner/package.json` with S15's content. Then `cd agent-runner && npm install openai@^4.77.0 zod@^3.24.1 yaml@^2` and `npm install -D esbuild typescript@^5.7.2 vitest@^2.1.8 @types/node@^22.10.0`. The versions match `reviewer-core/package.json`.
- **P3, between G2 and G3:** `cd server && pnpm db:generate`. Check that the new migration only adds columns and indexes, with no drops. A hand write under `migrations/**` is blocked in auto mode (root INSIGHTS 2026-09-30). Then `pnpm db:migrate` on the dev DB.
- **P4, after G5:** `ln -s AGENTS.md agent-runner/CLAUDE.md`, matching the other packages' symlinks.
- **P5, after G5:** `cd evals && pnpm eval:workflow`, because G5 edits the root `AGENTS.md`.
- **P6, after the last group:** a live acceptance check, L1 in *Tests*.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S4 | shared contract (+ client mirror), reviewer-core diff parser, server forge adapters | — | new `ForgeClient` methods, `CommitFilesPayload.expectedHeadSha`, `parseUnifiedDiff` exported from reviewer-core, `MockForgeClient` CI options |
| G2 | S5–S7 | server DB: schema, skills stats filter, `ci` repository | G1 | new schema columns, `CiRepository` method names; **P3** runs next |
| G3 | S8–S11 | server `ci` pure helpers + runner-bundle adapter | G2 + P3 | helper exports (`buildExportFiles`, `generateWorkflow`, `validateWorkflow`, `parseResultArtifact`, `nextCursor`), `RunnerBundleSource` |
| G4 | S12–S14 | server `ci` service, routes, DI | G3 | the route list (DN1) and response shapes for the client |
| G5 | S15–S17, S24–S25 | agent-runner package, its CI workflow, docs | G1 (may run in parallel with G2–G4; no shared files) | committed `agent-runner/dist/index.js`, runner version |
| G6 | S18–S19 | client data layer + CI tab | G4 | hooks `useCiInstallations`, `useCiRefresh`, `useCiPreview`, `useCiInstall`, `useCiRuns`, `useRemoveCiInstallation` |
| G7 | S20–S21 | client Export Wizard | G6 | — |
| G8 | S22–S23 | client CI Runs page + nav | G6 | — |

## Steps

### S1 — Extend the CI contracts and the forge port  [Contract]
- **Files:**
  - `server/src/vendor/shared/contracts/eval-ci.ts` (modify);
  - `server/src/vendor/shared/adapters.ts` (modify);
  - `client/src/vendor/shared/contracts/eval-ci.ts` (modify);
  - `client/src/vendor/shared/adapters.ts` (modify).
- **Change:** every contract and port field listed in **DN7** (Design notes): the manifest version fields, the closed enums (`CiTrigger`, `CiPostAs`, `CiRunStatus`), the preview/install/validate inputs and outputs, `CiInstallErrorCode`, the installation and run views, refresh, `CiResultArtifact` (DN5), and the `ForgeClient` port additions (DN3/DN4).
- **Layer / why here:** contracts and ports change in `shared` first (`CLAUDE.md`). The client copy gets the same edit by hand.
- **Skills to apply:** `onion-architecture`, `zod`, `typescript-expert`
- **Practices:**
  - closed sets are `z.enum`;
  - user strings carry a `.max()`;
  - every schema exports its `z.infer` type;
  - ports name no vendor (no `Octokit` types);
  - no value import from `adapters/` or `modules/`.
  - The client mirror copies only the touched blocks and also adds the missing `AgentManifest` block. It fixes no other drift.
- **Known gotchas:**
  - the two shared copies are not in sync (root INSIGHTS 2026-09-17), so don't copy the folder;
  - TS2719 after adding a contract field (root INSIGHTS 2026-09-17): fix the fixture defaults.
- **Done when:**
  - `cd server && pnpm typecheck` passes apart from the `ForgeClient` implementers, which S3–S4 fix in the same group;
  - `cd client && pnpm typecheck` passes;
  - `diff <(sed -n '/Export-to-CI/,$p' server/src/vendor/shared/contracts/eval-ci.ts) <(sed -n '/Export-to-CI/,$p' client/src/vendor/shared/contracts/eval-ci.ts)` prints nothing;
  - T1 passes.

### S2 — Move `parseUnifiedDiff` into reviewer-core
- **Files:**
  - `reviewer-core/src/diff/parse.ts` (create);
  - `reviewer-core/src/index.ts` (modify);
  - `reviewer-core/test/diff-parse.test.ts` (create);
  - `server/src/adapters/git/diff-parser.ts` (modify).
- **Change:** move the 79-line parser verbatim. The server file becomes `export { parseUnifiedDiff } from '@devdigest/reviewer-core';`, so its importers (`container.ts:60`, `adapters/index.ts:10`, `mocks.ts:39`) stay unchanged.
- **Layer / why here:** pure domain code belongs to the core (D4). An adapter may import the core.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:**
  - reviewer-core imports only a type from `@devdigest/shared`, and no `node:` module;
  - the behaviour stays byte-identical.
- **Known gotchas:** a reviewer-core change breaks server tests that `pnpm typecheck` never sees (root INSIGHTS 2026-10-05), so run the server unit suite.
- **Done when:**
  - `cd reviewer-core && npm run typecheck && npm test` pass;
  - `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` pass.

### S3 — GitHub adapter: safe `commitFiles` and the CI read/write methods
- **Files:** `server/src/adapters/github/octokit.ts` (modify); `server/test/github-ci-adapter.test.ts` (create)
- **Change:**
  - `commitFiles` (DN3):
    - only a `RequestError` with `status === 404` means the branch is absent; any other error rethrows;
    - `updateRef` is called with `force: false`;
    - when `expectedHeadSha` is set and the ref's sha differs, throw `AppError('branch_moved', …, 409)`;
    - a 403/404 on `createTree`/`createRef`/`updateRef` becomes `AppError('missing_workflow_permission', …, 403)`, whose details include the `x-accepted-github-permissions` header when present.
  - Implement the new port methods with `octokit.rest.*`, `octokit.request` for `/user` headers, and the `actions.*` endpoints:
    - `tokenScopes()` returns the split `x-oauth-scopes` header, or `null` when it is absent;
    - `listWorkflowRuns(repo, 'devdigest-review.yml', {perPage: 100})` makes a single page request with no `created` filter;
    - `downloadArtifact(repo, id, maxBytes)` uses `request: { redirect: 'manual' }` to read `Location`, then a plain `fetch` with no auth header. It rejects when `content-length` exceeds `maxBytes` and stops reading past `maxBytes`. On a non-2xx it throws `Object.assign(new Error(..), {status})`.
  - Every call is wrapped in `withRetry(withTimeout(…, TIMEOUT))`.
- **Layer / why here:** this is the one GitHub adapter (`one-adapter-per-system`).
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:**
  - no second `new Octokit`;
  - never log the token;
  - `branch` and `repo` are passed as params, never string-built into a shell;
  - a 410 or expired artifact is returned as a typed "gone" (`status: 410`) so the caller treats it as "no artifact".
- **Known gotchas:** an HTTP adapter without an SDK must throw a numeric `status` ([server gotchas → Tooling](../../server/insights/gotchas.md)).
- **Done when:** `cd server && pnpm exec vitest run test/github-ci-adapter.test.ts` (with `vi.mock('octokit')`) asserts:
  - `force: false`;
  - a 500 on `getRef` is not treated as absent;
  - the `branch_moved` and `missing_workflow_permission` mappings;
  - the `downloadArtifact` byte cap;
  - the `tokenScopes` null case.

### S4 — GitLab stubs and the forge mock
- **Files:** `server/src/adapters/gitlab/rest.ts` (modify), `server/src/adapters/mocks.ts` (modify)
- **Change:**
  - GitLab: each new method throws `AppError('repo_not_github', 'CI export supports GitHub repositories only', 422)`. `openPullRequest`/`findOpenPr` also return `number`.
  - `MockForgeClient` gains a constructor option `ci?: {...}` with:
    - branches `Map<string, BranchState>`, `commitsAhead`, `scopes`, `defaultBranch`;
    - `runs`, `artifacts`, `artifactBytes`, `jobUrl`, `pullStates`;
    - injectable errors per method.
  - `commitFiles` records `expectedHeadSha`.
- **Layer / why here:** every port implementer and its mock change together (onion skill → *Adding a new external dependency*, step 3).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** the defaults keep every existing test green (with no `ci` option the mock behaves as today).
- **Known gotchas:** `MockGitHubClient` lists exactly one hard-coded PR ([server gotchas → Tests](../../server/insights/gotchas.md)), so the new option must not change `listPullRequests`.
- **Done when:** `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` pass.

### S5 — Schema: CI installation and run columns
- **Files:** `server/src/db/schema/ci.ts` (modify)
- **Change:** the columns and indexes listed in **DN8** (Design notes) on `ci_installations` and `ci_runs`.
- **Layer / why here:** schema (D7, D9). It adds columns only, with no drop or rename.
- **Skills to apply:** `drizzle-orm-patterns`, `postgresql-table-design`
- **Practices:**
  - camelCase TS, snake_case SQL;
  - `<table>_<scope>_idx` index names;
  - every column inside a unique index is notNull;
  - every FK that is read or filtered gets an index;
  - the notNull columns are safe because nothing writes these tables today (`grep ciRuns` finds only `schema.ts`).
- **Known gotchas** ([server gotchas → DB & migrations](../../server/insights/gotchas.md)):
  - a nullable column in a unique index stops deduplicating;
  - an FK carries no index;
  - a text enum has no SQL constraint;
  - `db:generate` hangs on a drop plus add.
- **Done when:** `cd server && pnpm typecheck`; then the main session runs **P3**.

### S6 — Keep CI runs out of skill stats (AC-69)
- **Files:** `server/src/modules/skills/repository.ts` (modify)
- **Change:** `windowedRuns` (`:318`) adds `eq(t.agentRuns.source, 'local')`.
- **Layer / why here:** this is the only `agent_runs` reader not keyed by `pr_id` that AC-69 names. The PR-list cost (`pulls/routes.ts:126-133`), the in-flight check (`run.repo.ts:20-30`) and eval `latestDoneRuns` (`eval/repository.ts:115-123`) all filter on `pr_id`, which CI rows leave null. Those files are **not touched** (scope fence).
- **Skills to apply:** `drizzle-orm-patterns`
- **Practices:** a one-predicate change; no other skill-stat query changes shape.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck`; T9 asserts that a CI run is not counted in skill stats.

### S7 — `ci` repository
- **Files:** `server/src/modules/ci/repository.ts` (create)
- **Change:** `CiRepository`:
  - `findInstallation(agentId, repo)`, `listInstallations(agentId)`, `listActiveInstallations(workspaceId, agentId?)` (joins `agents` for the workspace; `repoId` not null), `upsertInstallation(values)` (ON CONFLICT (agent_id, repo) DO UPDATE), `deleteInstallation(workspaceId, id)` and `setScanCursor(id, at)`;
  - `githubReposForWorkspace(workspaceId)`, `memoryForExport(workspaceId, repoId)` (scope `repo` for that repo plus `global`, returning `{kind, content}` ordered by `createdAt`), `localPrId(repoId, number)` and `recordedAttempts(repo, runIds)`;
  - `recordCiRun(tx)` runs in one transaction. It inserts `ci_runs` ON CONFLICT DO NOTHING RETURNING. Only when a row was inserted does it insert `agent_runs` (`source: 'ci'`, `prId: null`, status `done` for passed/gate_failed and `failed` for error, `error` = the error class) and set `ci_runs.agent_run_id`. It never writes `run_skills`.
  - `latestRunByInstallation(ids)` and `listRuns(workspaceId, query)` use keyset paging on (ranAt, id), left-joining `agents` for the deleted state.
- **Layer / why here:** the only DB access for the module (onion decision 2).
- **Skills to apply:** `onion-architecture`, `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`
- **Practices:**
  - it returns awaited rows, never a builder;
  - row types live in `repository.ts`;
  - no `sql.raw`;
  - `limit` and the cursor are parameters.
- **Known gotchas:** a row type stays in `repository.ts` ([server gotchas → DB & migrations](../../server/insights/gotchas.md)); never insert `running` (boot reaps it, `app.ts:81`).
- **Done when:** `cd server && pnpm typecheck`; T9 covers it after P3.

### S8 — Export file builder (pure)
- **Files:** `server/src/modules/ci/export-files.ts` (create), `server/src/modules/ci/constants.ts` (create), `server/test/ci-export-files.test.ts` (create)
- **Change:** `buildExportFiles({agent, version, skills, memory, workflow, runnerJs})` returns `CiFile[]` in AC-11 order:
  - `uniqueSlugs(names)` handles collisions with `-2`, `-3` suffixes;
  - the manifest is serialized with `yaml` `stringify`, then `AgentManifest.safeParse`. A failure returns `blocked {code:'manifest_invalid', field}`;
  - each skill `.md` is the skill body only (enabled skills, in link order, as in `run-executor.ts:491`);
  - `memory.jsonl` is one `JSON.stringify({kind, content})` per line, or an empty string;
  - only the workflow is `editable: true`.
- `prBody(files, repo)` builds the AC-27 checklist, including the CODEOWNERS and ruleset advice and the AC-71 note.
- `zipFiles(files)` uses `fflate` `zipSync`.
- `constants.ts` holds `CI_BRANCH = 'devdigest/ci'`, `PR_TITLE`, `WORKFLOW_PATH`, `WORKFLOW_VERSION = 1`, `ARTIFACT_NAME = 'devdigest-result'`, `MAX_ZIP_BYTES = 1_048_576`, `MAX_JSON_BYTES = 262_144`, `LOOKBACK_DAYS = 30`, `MAX_RUNS = 100`, `EXPORT_TRAILER = 'DevDigest-Export'`, and the action pins (DN2).
- **Layer / why here:** a pure module helper (onion decision 3).
- **Skills to apply:** `onion-architecture`, `zod`, `typescript-expert`, `security`
- **Practices:**
  - no I/O;
  - the manifest is validated with the shared schema before it is returned;
  - no secret or key name appears in any file except as the literal env reference in the workflow.
- **Known gotchas:** none.
- **Done when:** T4 asserts:
  - 6 files for 2 skills and 4 for none;
  - colliding slugs come out unique;
  - an empty memory file;
  - the manifest round-trips through `yaml.parse` + `AgentManifest`;
  - the PR body lists the real file count.

### S9 — Workflow generator and validator (pure)
- **Files:** `server/src/modules/ci/workflow.ts` (create), `server/test/ci-workflow.test.ts` (create)
- **Change:**
  - `generateWorkflow({triggers, postAs})` emits the DN2 template.
  - `validateWorkflow(text, {triggers, postAs})` returns `CiWorkflowCheck`. It uses `yaml.parseDocument`; a parse error gives `{invariant:'yaml', line}` (AC-18). Errors (AC-19) are:
    - an `on` key other than `pull_request`, or any `pull_request_target`;
    - a `permissions` map that is not exactly `contents: read` + `pull-requests: write`, at workflow or job level;
    - a `uses:` not pinned to a 40-hex SHA;
    - any `run:` containing `${{` with `github.event`, `github.head_ref` or `inputs`;
    - a missing base-SHA checkout of `.devdigest` or a missing `persist-credentials: false`.
  - Warnings (AC-56): any other difference from `generateWorkflow` output, by top-level key.
- **Layer / why here:** a pure helper.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:**
  - parse with the `yaml` lib, never with regex over raw text, except for the `${{` scan inside a parsed `run` string;
  - the input is capped at 64 KiB by the route schema.
- **Known gotchas:** none.
- **Done when:** T5 covers:
  - the generated workflow validates clean;
  - one failing case for each AC-19 invariant;
  - a YAML error reports its line;
  - a renamed step is a warning only;
  - the triggers chips map to `types`;
  - the AC-71 skip guard is present.

### S10 — Artifact ingest helpers (pure)
- **Files:** `server/src/modules/ci/artifact.ts` (create), `server/test/ci-artifact.test.ts` (create)
- **Change:**
  - `parseResultArtifact(zipBytes, run)`:
    - rejects `zip_too_large`;
    - unzips with `fflate.unzipSync` and a `filter` that admits only `devdigest-result.json` with `originalSize ≤ MAX_JSON_BYTES`;
    - then `JSON.parse` → `CiResultArtifact.safeParse`, rejecting `schema_invalid` with the issue path;
    - rejects `sha_mismatch` when `commit_sha !== run.head_sha`, and `attempt_mismatch` when the artifact's `run_id`/`run_attempt` differ from the run.
  - It returns `{ok, value}` or `{ok:false, reason}`.
  - `toStatus(artifact)` maps to `passed`, `gate_failed` or `error`.
  - `nextCursor(runs, oldCursor)` returns the `created_at` of the oldest run that is not `completed`, or else the newest scanned run (DN4).
- **Layer / why here:** a pure helper.
- **Skills to apply:** `onion-architecture`, `zod`, `typescript-expert`, `security`
- **Practices:**
  - the size cap is checked before parsing;
  - `safeParse`, not `parse`;
  - identity fields come from `run`, never from the artifact (AC-46).
- **Known gotchas:** none.
- **Done when:** T6 covers each rejection reason, a zip bomb (large `originalSize`) refused without inflating, the status mapping and the cursor.

### S11 — Runner bundle source adapter
- **Files:**
  - `server/src/adapters/runner-bundle/fs.ts` (create);
  - `server/src/platform/config.ts` (modify);
  - `server/test/ci-runner-bundle.test.ts` (create).
- **Change:**
  - `FsRunnerBundleSource(path)` implements `RunnerBundleSource.read()`. It reads the file and checks that line 1 matches `^// devdigest-agent-runner v(\S+) sha256:([0-9a-f]{64})$` and that the sha256 of the bytes after line 1 equals the header. It returns `{js, version, sha256}`, or throws `ConfigError('runner bundle missing or corrupt')`.
  - Config adds `AGENT_RUNNER_BUNDLE` (default `resolve(process.cwd(), '../agent-runner/dist/index.js')`, an assumption).
- **Layer / why here:** fs I/O behind a port (onion decision 1). The env var is read only in `config.ts` (decision 7).
- **Skills to apply:** `onion-architecture`, `zod`, `typescript-expert`, `security`
- **Practices:**
  - no `process.env` outside `config.ts`;
  - a fixed path from config, never from a request.
- **Known gotchas:** none.
- **Done when:** T7 covers a valid header, a tampered body and a missing file.

### S12 — `CiService`: preview, validate, install
- **Files:** `server/src/modules/ci/service.ts` (create), `server/src/modules/ci/types.ts` (create), `server/test/ci-export.it.test.ts` (create)
- **Change:** `CiService(deps: CiServiceDeps)` with deps `{repo: CiRepository, agents: CiAgentsPort, forge, bundle: RunnerBundleSource, now}`.
  - `preview(ws, agentId, input)`:
    - provider ≠ `openrouter` → `blocked provider_not_openrouter` (AC-68);
    - the repo must be a connected GitHub repo, else 422 `repo_not_github`;
    - the response carries `existing_installation_id` (AC-10).
  - `validateWorkflow`.
  - `install(ws, agentId, input)`:
    - re-checks the provider, the manifest and `validateWorkflow` on the submitted workflow; errors give 422 `workflow_invalid`;
    - `mode: 'zip'` returns `zip_base64` and upserts `mode: 'manual'` (AC-30);
    - `mode: 'open_pr'` runs the DN3 branch flow, with the commit message trailer `DevDigest-Export: agent=<id> version=<n>` (AC-67);
    - it upserts the installation only after the PR exists (AC-28/29).
  - `CiAgentsPort` is declared in its own `types.ts` and satisfied by `container.agentsRepo` (`getById`, `linkedSkills`).
- **Layer / why here:** application layer, depending on ports only.
- **Skills to apply:** `onion-architecture`, `zod`, `typescript-expert`, `security`
- **Practices:**
  - no import of `adapters/**` or `db/schema`;
  - no foreign consumer ports;
  - refusals are `AppError` with a `CiInstallErrorCode` (409 for branch state, 403 for permission, 422 for input);
  - a missing token (`ConfigError` from `container.forge`) maps to `token_missing`.
- **Known gotchas:** use the house-style narrow deps (onion decision 3).
- **Done when:** T8 (`.it`, `MockForgeClient` `ci` options) covers:
  - zip vs PR;
  - reuse of an open PR (AC-31);
  - delete + recreate (AC-32);
  - `foreign_commits` and `branch_protected` refusals that delete nothing (AC-59);
  - a missing-scope refusal that records no installation (AC-29);
  - a non-OpenRouter agent blocked (AC-68);
  - the upsert keeping one row per (agent, repo).

### S13 — `CiService`: installations view, remove, refresh, runs
- **Files:** `server/src/modules/ci/service.ts` (modify), `server/test/ci-ingest.it.test.ts` (create)
- **Change:**
  - `listInstallations(ws, agentId)`:
    - computes `state`, `out_of_date` (exported agent version < current, or workflow version < `WORKFLOW_VERSION`) and `gate_drift` (AC-36);
    - reads `pr_state` with `getPullState` per installation in parallel; on an error it becomes `unknown` (AC-62/65).
  - `remove(ws, id)` deletes only the installation (AC-60).
  - `refresh(ws, agentId|null)` runs the DN4 algorithm over the active installations only (AC-61). A per-repo error goes into `errors` and does not abort the other repos (AC-51). An in-flight guard per workspace returns the current promise.
  - `listRuns(ws, query)` uses `since` defaulting to now − 7 days (AC-53).
- **Layer / why here:** application layer.
- **Skills to apply:** `onion-architecture`, `zod`, `typescript-expert`, `security`
- **Practices:**
  - no artifact download for a run already recorded or older than the cursor (NFR performance);
  - the repo, PR number, SHA and job URL come from GitHub metadata (AC-46);
  - the local PR is linked only through `ci_runs.local_pr_id`.
- **Known gotchas:** none beyond S7.
- **Done when:** T9 covers:
  - one record per (run, attempt) across two refreshes (AC-49);
  - the AC-47 rejections listed;
  - a no-artifact run recorded nothing and is not re-listed on the next refresh (AC-50);
  - an inactive installation not polled;
  - a token error keeps the old runs (AC-51);
  - 100-run and 30-day caps (AC-58);
  - a deleted agent's run listed as deleted (AC-55);
  - a CI `agent_runs` row with `pr_id` null and no `run_skills`, excluded from skill stats (AC-69).

### S14 — Routes, registration, DI
- **Files:**
  - `server/src/modules/ci/routes.ts` (create);
  - `server/src/modules/index.ts` (modify);
  - `server/src/platform/container.ts` (modify).
- **Change:**
  - Add the DN1 routes, using `getContext`, `IdParams` and a Zod body/query/response for each.
  - Register `ci` in `modules`.
  - Add a `get ci()` getter that builds `CiService` with `repo`, `agents: this.agentsRepo`, `forge: (ref) => this.forge(ref)` and `bundle`.
  - `ContainerOverrides.runnerBundle?: RunnerBundleSource`.
- **Layer / why here:** transport + composition root.
- **Skills to apply:** `onion-architecture`, `fastify-best-practices`, `zod`, `security`
- **Practices:**
  - handlers only call the service;
  - `POST /ci/refresh` requires the object body `CiRefreshInput`;
  - `rateLimit` on install and refresh, as `brief/routes.ts:31`;
  - `workflow` is capped at `.max(65_536)`.
- **Known gotchas** ([server gotchas → Security, Tooling](../../server/insights/gotchas.md)):
  - an id-less mutating route needs a JSON object body;
  - the API is reachable from the LAN;
  - an optional body is `.nullish()`.
- **Done when:**
  - `cd server && pnpm typecheck`;
  - `bash .claude/skills/onion-architecture/scripts/check-module.sh ci` reports no new edge;
  - `cd server && pnpm exec vitest run test/ci-export.it.test.ts test/ci-ingest.it.test.ts` passes.

### S15 — agent-runner package scaffold + build
- **Files:**
  - `agent-runner/package.json` (create; written by P2 first, then the implementer adds `scripts` only);
  - `agent-runner/tsconfig.json`, `agent-runner/vitest.config.ts` and `agent-runner/scripts/build.mjs` (create).
- **Change:**
  - `package.json`: `"type":"module"`, `version: "0.1.0"`, and scripts `typecheck` (`tsc --noEmit`), `test` (`vitest run`) and `build` (`node scripts/build.mjs`).
  - `tsconfig.json` is modelled on `reviewer-core/tsconfig.json`, with paths `@devdigest/shared` → `../server/src/vendor/shared/index.ts`, `@devdigest/reviewer-core` → `../reviewer-core/src/index.ts`, and `zod`, `openai` and `yaml` → `./node_modules/*`.
  - `build.mjs` runs esbuild with:
    - `bundle`, `platform: node`, `target: node22`, `format: esm`, `minify: false`;
    - an `alias` of `zod`/`openai` to this package's `node_modules`;
    - `define` for `__RUNNER_VERSION__` and `__DEPS__` (the versions from `package.json`).
  - It then writes `dist/index.js` = `// devdigest-agent-runner v<version> sha256:<sha256 of body>\n` + body.
- **Layer / why here:** a new package (D3, D10).
- **Skills to apply:** `typescript-expert`
- **Practices:**
  - one output file;
  - deterministic output (no timestamps);
  - no secrets at build time.
- **Known gotchas:** two zod copies when shared resolves `zod` from `server/node_modules`, hence the alias (`reviewer-core/tsconfig.json` pins the same).
- **Done when:** `cd agent-runner && npm run typecheck` passes.

### S16 — Runner core (pure)
- **Files:** `agent-runner/src/core.ts` (create), `agent-runner/test/core.test.ts` (create)
- **Change:**
  - `parseEvent(json)` uses a local Zod schema for `pull_request.{number, base.sha, head.sha, head.repo.full_name, base.repo.full_name}`, requiring 40-hex SHAs.
  - `shouldSkip({event, apiKey})` returns a fork or no-key notice (AC-41).
  - `loadManifest(text)` runs `yaml.parse` then `AgentManifest.safeParse`. A failure gives an error naming the issue path (AC-38).
  - `buildResult(...)` builds a `CiResultArtifact` (DN5).
  - `exitCode(result)` is 1 for `gate_failed` or `error`, else 0 (AC-40/42); the gate is `gateTriggered(findings, ci_fail_on)`.
  - `postPlan(postAs, review)` picks the review payload (`toReviewPayload`), a comment body, or none (AC-39).
- **Layer / why here:** the pure part of the runner, testable without I/O.
- **Skills to apply:** `zod`, `typescript-expert`, `security`
- **Practices:**
  - the gate comes from severities, not from the model verdict;
  - no secret is accepted into `buildResult` (its input type has no key field).
- **Known gotchas:** none.
- **Done when:** T10 covers a fork skip, a no-key skip, an invalid manifest naming its field, gate exit codes for each `ci_fail_on`, the error result and the three post modes.

### S17 — Runner main (I/O) and committed bundle
- **Files:**
  - `agent-runner/src/main.ts` (create);
  - `agent-runner/src/io.ts` (create);
  - `agent-runner/test/main.test.ts` (create);
  - `agent-runner/dist/index.js` (create, generated).
- **Change:** `main()` does the following (DN6):
  1. reads `GITHUB_EVENT_PATH` itself;
  2. resolves `DEVDIGEST_CONFIG_DIR` (base checkout) and `DEVDIGEST_WORKDIR` (head checkout);
  3. validates the manifest;
  4. gets the diff with `execFile('git', ['-C', workdir, 'diff', '--no-color', `${base}...${head}`])`, after `git cat-file -e` and a `git fetch --no-tags origin <base> <head>` fallback;
  5. `parseUnifiedDiff`;
  6. `reviewPullRequest` with `OpenRouterProvider`, skill bodies and memory lines;
  7. posts through `fetch` to `${GITHUB_API_URL}/repos/{repo}/pulls/{n}/reviews` or `/issues/{n}/comments`;
  8. writes `devdigest-result.json` (with `run_id`/`run_attempt` from `GITHUB_RUN_ID`/`GITHUB_RUN_ATTEMPT`);
  9. sets `process.exitCode`.
  - Then run `npm run build` and commit `dist/index.js`.
- **Layer / why here:** the runner's I/O edge. reviewer-core stays pure.
- **Skills to apply:** `typescript-expert`, `security`
- **Practices:**
  - argv arrays, no shell, and SHAs validated before git;
  - an error message passes through a redactor that removes the values of `OPENROUTER_API_KEY` and `GITHUB_TOKEN`;
  - the result file is built only from `buildResult`;
  - the config files are read only from `DEVDIGEST_CONFIG_DIR` (AC-72).
- **Known gotchas:** diff by SHAs, never by branch name ([server gotchas → Git & diffs](../../server/insights/gotchas.md), which applies equally here).
- **Done when:**
  - `cd agent-runner && npm run typecheck && npm test && npm run build`;
  - T11 (stubbed `fetch`, temp git repo) asserts that no secret value appears in stdout, stderr or the result file;
  - `head -1 dist/index.js` shows the header.

### S24 — agent-runner CI workflow
- **Files:** `.github/workflows/agent-runner.yml` (create)
- **Change:**
  - Model it on `reviewer-core.yml`, with paths `agent-runner/**`, `reviewer-core/**`, `server/src/vendor/shared/**` and the workflow itself.
  - Steps: `npm ci` → `typecheck` → `test` → `build` → `git diff --exit-code dist/index.js` (the freshness check).
- **Layer / why here:** repo CI (D10).
- **Skills to apply:** `none`
- **Practices:** `permissions: contents: read`; uses the same action tags as `reviewer-core.yml`.
- **Known gotchas:** none.
- **Done when:** `grep -n "exit-code" .github/workflows/agent-runner.yml` matches.

### S25 — Docs for the new package
- **Files:** `agent-runner/AGENTS.md` (create), `TESTING.md` (modify), `AGENTS.md` (modify)
- **Change:**
  - `agent-runner/AGENTS.md` covers its purpose, npm, its commands, "commit `dist/` after every build", and "reviewer-core stays pure".
  - Add an agent-runner row to the `TESTING.md` suite map.
  - In the root `AGENTS.md`: "Six" becomes "Seven" standalone packages, an `agent-runner/` row goes in *Where things live*, and npm is added to the package-manager list.
- **Layer / why here:** docs (D10).
- **Skills to apply:** `none`
- **Practices:** edit `AGENTS.md`, never `CLAUDE.md` (a symlink).
- **Known gotchas:** a Done-when grep on Markdown uses one token (root INSIGHTS 2026-09-28).
- **Done when:** `grep -n "agent-runner" TESTING.md AGENTS.md` matches both; then the main session runs P4 and P5.

### S18 — Client data layer + copy
- **Files:**
  - `client/src/lib/hooks/ci.ts` (create);
  - `client/src/lib/hooks/index.ts` (modify);
  - `client/messages/en/ci.json` (modify).
- **Change:**
  - Hooks:
    - `useCiInstallations(agentId)`;
    - `useCiRefresh(scope, enabled)` = `useQuery` POSTing `/ci/refresh` with `refetchInterval: 60_000`, active only while mounted (AC-57); on success it invalidates the installations and runs;
    - `useCiRuns(query)`, `useCiPreview`, `useValidateCiWorkflow`, `useCiInstall` and `useRemoveCiInstallation`.
  - `ci.json`:
    - replace `blockMergeDesc` (`:71`) with the AC-24 copy, including the CODEOWNERS and ruleset advice;
    - add keys for states, error codes, statuses and the empty state.
- **Layer / why here:** client data layer.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`
- **Practices:**
  - type-only imports from `@devdigest/shared`;
  - query keys are `['ci', …]`;
  - no fetch inside components.
- **Known gotchas:** import only types from shared ([client gotchas → Tests](../../client/insights/gotchas.md)).
- **Done when:** `cd client && pnpm typecheck && pnpm exec vitest run shared-type-only-imports`.

### S19 — CI tab
- **Files:**
  - `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` and `.../AgentEditor/AgentEditor.tsx` (modify);
  - `.../AgentEditor/_components/CiTab/{CiTab.tsx, InstallationRow.tsx, FailOnControl.tsx, RemoveConfirm.tsx, UpdatePicker.tsx, helpers.ts, styles.ts, index.ts, CiTab.test.tsx}` (create).
- **Change:**
  - `TABS` gains `{key:'ci', labelKey:'editor.tabs.ci'}` after versions (the label exists, `agents.json:55`).
  - The tab shows:
    - a header with the "Active in N repos" badge (counting only `state === 'active'`) and the "Update CI config" and "+ Add to CI" buttons;
    - rows with repo, "GitHub Actions", status and relative time ("no runs yet" when there is none), plus pending merge, inactive, out of date, gate drift, PR state and "View export PR";
    - a dashed "+ Add repository" row and the empty state;
    - `FailOnControl` saving via `useUpdateAgent` `{patch:{ci_fail_on}}`;
    - a remove confirm with the AC-60 copy;
    - `UpdatePicker` when there is more than one installation (AC-33).
  - It mounts `useCiRefresh({agent_id})`.
- **Layer / why here:** colocated route component.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:**
  - ≤200 lines per component;
  - derived states are computed, not stored;
  - `styles.ts` entries each `satisfies CSSProperties`.
- **Known gotchas** ([client gotchas → UI, Tests](../../client/insights/gotchas.md)):
  - the vendored `Modal` does not portal, so use `createPortal`;
  - no `user-event`, so use `fireEvent`;
  - border longhands.
- **Done when:** `cd client && pnpm typecheck && pnpm exec vitest run CiTab` (T12).

### S20 — Export Wizard: shell, Target, Preview
- **Files:** `.../AgentEditor/_components/ExportWizard/{ExportWizard.tsx, TargetStep.tsx, PreviewStep.tsx, helpers.ts, constants.ts, styles.ts, index.ts, ExportWizard.test.tsx}` (create)
- **Change:**
  - A portaled modal with `ExportWizardSteps` (`vendor/ui/ExportWizardSteps.tsx:6`) and the title "Export to CI".
  - Target step:
    - four cards, with only GitHub Actions enabled and carrying "recommended";
    - a repo picker of connected GitHub repos, defaulting to the active repo;
    - Continue disabled with a hint when no repo exists;
    - an AC-10 note when `existing_installation_id` is set;
    - an AC-68 block when the agent is not OpenRouter.
  - Preview step:
    - the file list plus the selected file's contents;
    - only the workflow is editable, in a `Textarea` (assumption: no code editor);
    - Continue calls `useValidateCiWorkflow`, blocks on errors with the invariant and line, and shows warnings;
    - an "Update CI config" note that earlier edits are not carried over.
  - It can open at Preview with prefilled choices (AC-33).
- **Layer / why here:** colocated component, whose only consumer is CiTab.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:**
  - wizard state goes in one `useReducer`;
  - file contents are rendered as text, never as HTML.
- **Known gotchas:** the vendored `Modal` does not portal; when `getByText` finds multiple matches, check the copy first.
- **Done when:** `cd client && pnpm exec vitest run ExportWizard` (T13 part 1).

### S21 — Export Wizard: Configure, Install
- **Files:** `.../ExportWizard/{ConfigureStep.tsx, InstallStep.tsx}` (create), `.../ExportWizard/ExportWizard.tsx` and `.../ExportWizard/ExportWizard.test.tsx` (modify)
- **Change:**
  - Configure step:
    - three trigger chips (opened and synchronize on), at least one required, and the workflow regenerated through the preview;
    - the secrets table with the AC-22 statuses;
    - post-as radios;
    - the AC-24 info box.
  - Install step:
    - two options plus the docs link, using the real `file_count`;
    - Install calls `useCiInstall`. On a PR it shows the link; on a zip it downloads the `zip_base64` Blob as `devdigest-ci.zip`;
    - error codes are mapped to messages, and the zip is offered on permission and branch errors (AC-29/59).
- **Layer / why here:** colocated component.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** the download object URL is revoked after the click; no state is derived via `useEffect`.
- **Known gotchas:** none beyond S20.
- **Done when:** `cd client && pnpm typecheck && pnpm exec vitest run ExportWizard` (T13).

### S22 — CI Runs page
- **Files:** `client/src/app/ci-runs/page.tsx` (create), `client/src/app/ci-runs/_components/CiRunsView/{CiRunsView.tsx, CiRunsFilters.tsx, CiRunRow.tsx, helpers.ts, styles.ts, index.ts, CiRunsView.test.tsx}` (create)
- **Change:**
  - Filters in URL params: time range (default 7 days), agent, repo and status (`passed`/`gate_failed`/`error`).
  - Rows (AC-52) are newest-first. The PR number links to `/repos/:repoId/pulls/:number` when `local_pr` is set (AC-66), else plain text. A deleted agent shows as deleted.
  - Paging uses "Load more" on `next_cursor`.
  - A Refresh button; ingest errors and rejections go in a banner that keeps the rows (AC-51); the empty state reads "No CI runs yet".
  - Mounts `useCiRefresh({agent_id:null})`.
- **Layer / why here:** a new route; the page stays thin, as in `app/eval/page.tsx`.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** `<Suspense>` around the `useSearchParams` user; filters live in the URL, not in state.
- **Known gotchas:** wrap `useSearchParams` pages in Suspense; a vitest filter with `[` fails ([client gotchas → Tooling](../../client/insights/gotchas.md)).
- **Done when:** `cd client && pnpm typecheck && pnpm exec vitest run CiRunsView` (T14).

### S23 — Sidebar "CI Runs" under GLOBAL
- **Files:** `client/src/vendor/ui/nav.ts` (modify — the signed-off exception, spec 014 AC-2)
- **Change:** append a `{section:'GLOBAL', items:[{key:'ci-runs', label:'CI Runs', icon:'Workflow', href:'/ci-runs'}]}` group. `app-shell/helpers.ts:38` already maps the route.
- **Layer / why here:** the vendored nav is the only seam.
- **Skills to apply:** `frontend-architecture`
- **Practices:** add a comment line in the existing format (`// Signed-off exception (spec 014) …`). Pick an icon name already used in `nav.ts`.
- **Known gotchas:** a nav item is the one sanctioned vendored edit ([client gotchas → UI](../../client/insights/gotchas.md)).
- **Done when:** `cd client && pnpm typecheck && pnpm test` pass.

## Tests
| Id | Test file | Tier | Covers | Step |
|---|---|---|---|---|
| T1 | `server/test/ci-contracts.test.ts` (create) | unit | manifest v1 fields, status enum, refresh body object-only | S1 |
| T2 | `reviewer-core/test/diff-parse.test.ts` | unit | parser parity | S2 |
| T3 | `server/test/github-ci-adapter.test.ts` | unit | no force, 404-only absent, permission/branch errors, download cap | S3 |
| T4 | `server/test/ci-export-files.test.ts` | unit | files, slugs, manifest, memory, PR body | S8 |
| T5 | `server/test/ci-workflow.test.ts` | unit | AC-16–19/56/71/72 invariants | S9 |
| T6 | `server/test/ci-artifact.test.ts` | unit | caps, rejections, status, cursor | S10 |
| T7 | `server/test/ci-runner-bundle.test.ts` | unit | header + sha256 | S11 |
| T8 | `server/test/ci-export.it.test.ts` | integration | preview/install flows, refusals | S12, S14 |
| T9 | `server/test/ci-ingest.it.test.ts` | integration | refresh, dedupe, rejections, views, AC-69 | S6, S7, S13 |
| T10 | `agent-runner/test/core.test.ts` | unit | skips, manifest, gate, post plan | S16 |
| T11 | `agent-runner/test/main.test.ts` | unit | end-to-end with stubs, secret redaction | S17 |
| T12 | `.../CiTab/CiTab.test.tsx` | client RTL | tab, rows, states, fail-on, remove | S19 |
| T13 | `.../ExportWizard/ExportWizard.test.tsx` | client RTL | four steps, blocks, errors, zip | S20, S21 |
| T14 | `client/src/app/ci-runs/_components/CiRunsView/CiRunsView.test.tsx` | client RTL | rows, filters, links, empty, error banner | S22 |
| L1 | manual live check (P6) | live | real repo, classic and fine-grained tokens: PR install, a refusal, the export PR's own run skips, a merged run ingests once, pins resolve | all |

## Migrations & contracts
- One generated migration after S5 (P3), adding columns and indexes on `ci_installations` and `ci_runs` only. No `--custom` stub is needed, because the tables are empty.
- Contracts: S1 only (`eval-ci.ts`, `adapters.ts`, server and then client).

## Out of scope
- `server/src/modules/pulls/**`, the multi-run code, `reviews/repository/run.repo.ts` and `eval/repository.ts`: no edits (scope fence; AC-69 is met by `pr_id` null plus S6).
- Runner support for OpenAI/Anthropic (spec Non-goal, option C).
- CircleCI, Jenkins and CLI generators; GitLab; branch-protection automation; a code editor dependency.
- Any other drift between the shared copies beyond S1's blocks.
- The design's Stats, Memory, Multi-Agent Review and Agent Performance items.

<!-- implementer-brief:end -->

## Context applied
- `server/insights/gotchas.md`:
  - "id-less mutating route needs an object body" → S14;
  - "nullable column in a unique index" and "FK carries no index" → S5;
  - "HTTP adapter must throw a numeric `status`" → S3;
  - "never insert running" (boot reaper) → S7.
- `client/insights/gotchas.md`: nav exception → S23; type-only shared imports → S18; Modal portal → S19/S20; Suspense → S22.
- Root `INSIGHTS.md`:
  - 2026-09-17, shared copies drift + TS2719 → S1;
  - 2026-10-05, reviewer-core change breaks server tests → S2;
  - 2026-09-30, auto-mode blocks migration writes → P3.
- `specs/014-export-to-ci.md` (approved, AC-1–AC-72) and the research notes (repo + R1–R5).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| engineering-insights | preload | Context applied | |
| onion-architecture | preload | S1–S4, S7–S14 | |
| zod | on demand (S1) | S1, S8–S14, S16 | |
| typescript-expert | on demand (S1) | most steps | |
| security | on demand (S3) | S3, S8–S14, S16, S17 | |
| fastify-best-practices | on demand (S14) | S14 | |
| drizzle-orm-patterns | on demand (S5) | S5–S7 | |
| postgresql-table-design | on demand (S5) | S5, S7 | |
| frontend-architecture | on demand (S18) | S18–S23 | |
| react-best-practices | on demand (S18) | S18–S22 | |
| next-best-practices | on demand (S18) | S18–S22 | |
| react-testing-library | on demand (S19) | S19–S22 | |
| devdigest-appsec | on demand (planning) | — | reviewer-side skill; it informed the risks |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `contracts/eval-ci.ts`, `adapters.ts` (server + client copies) | ports | changed |
| reviewer-core | `src/diff/parse.ts` | core | new |
| server | `adapters/github/octokit.ts`, `adapters/gitlab/rest.ts`, `adapters/mocks.ts`, `adapters/git/diff-parser.ts`, `adapters/runner-bundle/fs.ts` | infra | changed / new |
| server | `db/schema/ci.ts`, `modules/skills/repository.ts` | infra | changed |
| server | `modules/ci/*` | app + transport | new |
| server | `platform/config.ts`, `platform/container.ts`, `modules/index.ts` | root | changed |
| agent-runner | whole package | runner | new |
| client | `lib/hooks/ci.ts`, AgentEditor CiTab + ExportWizard, `app/ci-runs`, `vendor/ui/nav.ts`, `messages/en/ci.json` | UI | new / changed |
| repo | `.github/workflows/agent-runner.yml`, `TESTING.md`, `AGENTS.md` | docs/CI | new / changed |

## Design notes

### DN1 — Routes (all under the workspace from `getContext`)
- `POST /agents/:id/ci/preview` takes `CiPreviewInput` and returns `CiPreview`.
- `POST /agents/:id/ci/validate-workflow` takes `CiValidateWorkflowInput` and returns `CiWorkflowCheck`.
- `POST /agents/:id/ci/install` takes `CiInstallInput` and returns `CiInstallResult`, or `AppError` with a `CiInstallErrorCode`.
- `GET /agents/:id/ci/installations` returns `CiInstallationView[]`.
- `DELETE /ci/installations/:id` returns 204.
- `POST /ci/refresh` takes `CiRefreshInput` (an object body) and returns `CiRefreshResult`.
- `GET /ci/runs` takes `CiRunsQuery` and returns `CiRunsPage`.
- The repo picker reuses the existing repos list on the client, filtered to `provider === 'github'`.

### DN2 — Workflow template (`generateWorkflow`)
The workflow is `name: DevDigest review`, with `on.pull_request.types` taken from the chips and `permissions: {contents: read, pull-requests: write}`. One job, `review`, runs on `ubuntu-latest` with `timeout-minutes: 20` (an assumption). Its steps:
1. checkout at `ref: ${{ github.event.pull_request.base.sha }}`, `path: base`, `persist-credentials: false`;
2. checkout at `ref: ${{ github.event.pull_request.head.sha }}`, `path: head`, `fetch-depth: 0`, `persist-credentials: false`;
3. setup-node with `node-version: '22'`;
4. a `run:` step with no `${{ }}`:
   - `if [ ! -f base/.devdigest/runner/index.js ]; then echo "::notice::DevDigest runner not on the base branch yet; skipping"; exit 0; fi; node base/.devdigest/runner/index.js`;
   - env: `OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}`, `GITHUB_TOKEN: ${{ github.token }}`, `DEVDIGEST_POST_AS: <literal>`, `DEVDIGEST_CONFIG_DIR: base/.devdigest`, `DEVDIGEST_WORKDIR: head`;
5. upload-artifact with `if: always()`, `name: devdigest-result`, `path: devdigest-result.json`, `if-no-files-found: ignore`, `retention-days: 30` (an assumption).

The `${{ }}` uses sit in `with:`/`env:`, never in `run:` (AC-16), and the SHAs are not free text.

Pins (R1; re-check in L1 before release):
- `actions/checkout` v7.0.1 `3d3c42e5aac5ba805825da76410c181273ba90b1`;
- `actions/setup-node` v7.1.0 `949feb2413d6458794dcd2491c4babbbce0c15c1`;
- `actions/upload-artifact` v7.0.2 `cf430e030ddbb5b0abf93d22962f4752f3646cd9`.

Each is pinned with a `# vX.Y.Z` comment.

### DN3 — Install branch flow (S12) and port signatures
New port methods:
- `getDefaultBranch(repo): Promise<string>`;
- `getBranch(repo, name): Promise<{sha, protected} | null>`;
- `listCommitsAhead(repo, base, head): Promise<{sha, message}[]>`, from the compare API (≤250 commits; more → refuse as `foreign_commits`, an assumption);
- `deleteBranch(repo, name)`;
- `tokenScopes(): Promise<string[] | null>`;
- `getPullState(repo, n): Promise<'open'|'merged'|'closed'>`.

Flow:
1. Get the forge token. When it is missing, refuse with `token_missing`.
2. Read `tokenScopes()`. When the list is non-null and lacks `workflow`, refuse with `missing_workflow_permission` (classic). When it is null, rely on detect-by-attempt (fine-grained).
3. Read the default branch and `getBranch(CI_BRANCH)`.
4. When the branch exists:
   - when it is `protected`, refuse with `branch_protected`;
   - when any ahead commit lacks a `DevDigest-Export:` trailer line, refuse with `foreign_commits`;
   - when `findOpenPr` returns a PR, call `commitFiles({expectedHeadSha: branch.sha})` and reuse that PR (AC-31);
   - otherwise `deleteBranch` → `commitFiles({expectedHeadSha: null})` from the default branch → `openPullRequest` (AC-32).
5. When the branch is absent: `commitFiles` → `openPullRequest`.

Classic tokens without `workflow` fail on `POST /git/trees` with 404 (R3), so no branch is created. Fine-grained behaviour is unverified, so the create/update-ref failure is mapped the same way and checked in L1.

### DN4 — Ingest (S13)
For each active installation:
1. `listWorkflowRuns(perPage 100)`, newest first.
2. Drop runs older than `max(scanCursor, now − 30 d)`, cap at 100 (AC-58), and keep `status === 'completed'`.
3. Remove the attempts already recorded (`recordedAttempts`).
4. For each remaining run:
   - `listRunArtifacts(run.id)` → `devdigest-result`, not expired;
   - none, or 410 → nothing is recorded;
   - otherwise `downloadArtifact(cap 1 MiB)` → `parseResultArtifact` → reject (into `rejected`) or record;
   - the PR number is `run.pull_requests[0]?.number ?? null`;
   - the job URL is `firstJobUrl(run.id, attempt) ?? run.html_url`.
5. Then `setScanCursor(nextCursor)`. Runs before the cursor are never listed again, which covers AC-50.

Per-attempt artifacts are unverified (R2), so the `run_id`/`run_attempt` cross-check rejects a mismatch rather than mis-recording it.

Port signatures:
- `WorkflowRunMeta {id, run_attempt, head_sha, status, conclusion, created_at, html_url, pr_numbers}`;
- `RunArtifactMeta {id, name, size_in_bytes, expired}`;
- `listWorkflowRuns(repo, file, {perPage})`;
- `listRunArtifacts(repo, runId)`;
- `firstJobUrl(repo, runId, attempt)`;
- `downloadArtifact(repo, id, maxBytes): Promise<Uint8Array>`.

### DN5 — `CiResultArtifact` v1
The fields are:
- `schema_version: 1`, `status` (`CiRunStatus`), `verdict` (`approve|comment|request_changes` | null), `gate_tripped`;
- `findings_count`, `critical`, `warning`, `suggestion`;
- `cost_usd` (nullable), `duration_ms`, `tokens_in`, `tokens_out`;
- `manifest_schema_version`, `agent_name`, `agent_version`, `model`, `runner_version`;
- `deps` (record of string → string), `node_version`;
- `commit_sha` (40-hex), `run_id`, `run_attempt`, `error_class` (nullable, ≤100 chars).

The object is `.strict()`. It carries no findings bodies (an assumption): the CI Runs page shows counts only, and findings live in the PR review.

### DN6 — Runner flow
`main.ts` runs: event → skip checks (fork, no key) → manifest → diff → review → post → result → exit code.

On an `Llm*Error` or `ReviewChunksSkippedError` it writes an `error` result, posts nothing and exits 1 (AC-42). On a skip it writes no result and exits 0.

### DN7 — Contract and port fields (S1)
- In `eval-ci.ts`:
  - add `AGENT_MANIFEST_SCHEMA_VERSION = 1`;
  - `AgentManifest` gains `schema_version` (literal 1) and `agent_version` (int ≥1);
  - add `CiTrigger` (`opened`/`synchronize`/`reopened`), `CiPostAs` (`github_review`/`pr_comment`/`none`) and `CiRunStatus` (`passed`/`gate_failed`/`error`; replaces the old enum, AC-70).
- Replace `CiExportInput` with `CiPreviewInput` `{repo_id: uuid, triggers: CiTrigger[] min 1, post_as}` and `CiInstallInput` (= preview + `mode: 'open_pr'|'zip'` + optional `workflow` ≤ 64 KiB). Add `CiValidateWorkflowInput` `{workflow, triggers, post_as}`.
- Add `CiFile` `{path, contents, editable}` (keep), `CiPreview` `{files, file_count, existing_installation_id, blocked: null | {code, message, field?}}` and `CiWorkflowCheck` `{errors: {invariant, message, line?}[], warnings: same}`.
- Add `CiInstallErrorCode`: `provider_not_openrouter`, `manifest_invalid`, `workflow_invalid`, `token_missing`, `missing_workflow_permission`, `branch_protected`, `foreign_commits`, `branch_moved`, `repo_not_github`.
- Add `CiInstallation` with the fields:
  - `id`, `agent_id`, `repo` (full name), `repo_id` (nullable), `target_type`;
  - `mode` (`pr`|`manual`), `exported_agent_version`, `exported_ci_fail_on`, `workflow_version`, `runner_version`;
  - `triggers`, `post_as`, `pr_number`/`pr_url` (nullable), `installed_at`, `updated_at`.
- Add `CiInstallationView` = `CiInstallation` plus:
  - `pr_state` (`open`/`merged`/`closed`/`unknown`/`none`);
  - `state` (`active`/`pending_merge`/`inactive`);
  - `out_of_date`, `gate_drift`, `latest_run`: `{status, ran_at}` | null.
- Add `CiInstallResult` `{installation, pr_url, zip_base64}`.
- Replace `CiRun` with `CiRunView`:
  - `id`, `repo`, `pr_number`, `local_pr` `{repo_id, number}` | null;
  - `agent_id` (nullable), `agent_name`, `agent_deleted`, `verdict`, `status`;
  - `findings_count`, `cost_usd`, `duration_ms`, `ran_at`, `job_url`.
- Add `CiRunsPage` `{items, next_cursor}`, `CiRunsQuery` (`since`, `agent_id`, `repo`, `status`, `cursor`, `limit` ≤100) and `CiRefreshInput` `{agent_id: uuid | null}`.
- Add `CiRefreshResult` `{recorded, rejected: {repo, run_id, reason}[], errors: {repo, message}[]}`.
- Replace `CiResultArtifact` per DN5.
- In `adapters.ts`:
  - add the port types `WorkflowRunMeta`, `RunArtifactMeta`, `BranchState` and `RunnerBundleSource` (`read(): Promise<string>`);
  - add the `ForgeClient` methods `getDefaultBranch`, `getBranch`, `listCommitsAhead`, `deleteBranch`, `tokenScopes`, `getPullState`, `listWorkflowRuns`, `listRunArtifacts`, `firstJobUrl` and `downloadArtifact` (signatures in DN3/DN4);
  - `CommitFilesPayload` gains `expectedHeadSha: string | null`;
  - `openPullRequest` and `findOpenPr` return `{url, number}`.

### DN8 — Schema columns and indexes (S5)
- `ci_installations` adds:
  - `repoId` (FK `repos`, on delete set null);
  - `mode` text enum `pr|manual`, notNull, default `'pr'`;
  - `exportedAgentVersion` int, `exportedCiFailOn` text enum, `workflowVersion` int, `runnerVersion` text;
  - `triggers` text[] notNull, default `'{opened,synchronize}'`;
  - `postAs` text enum, notNull, default `'github_review'`;
  - `prNumber` int, `prUrl` text, `scanCursor` timestamptz, `updatedAt` timestamptz notNull defaultNow.
- `ci_installations` indexes: `ci_installations_agent_repo_idx` UNIQUE (agentId, repo), `ci_installations_repo_idx` (repoId).
- `ci_runs` adds:
  - `workspaceId` (FK `workspaces`, cascade, notNull);
  - `agentId` (FK `agents`, set null), `agentName` text notNull;
  - `agentRunId` (FK `agent_runs`, set null), `localPrId` (FK `pull_requests`, set null);
  - `repoFullName` text notNull, `githubRunId` bigint (mode number) notNull, `runAttempt` int notNull, `headSha` text notNull;
  - `verdict` text, `durationMs` int, `model` text, `agentVersion` int, `runnerVersion` text, `errorClass` text.
- `ci_runs.status` narrows to `{enum: ['passed','gate_failed','error']}`, and `githubUrl` keeps the job URL.
- `ci_runs` indexes: `ci_runs_run_attempt_idx` UNIQUE (repoFullName, githubRunId, runAttempt), `ci_runs_ws_ran_idx` (workspaceId, ranAt), `ci_runs_installation_idx`, `ci_runs_agent_idx`, `ci_runs_local_pr_idx`.

### Requirements review (pass 1, resolved — see *Decisions recorded*)
- TQ1–TQ4 were answered by their defaults.
- GAP1–GAP5 closed through the spec correction (AC-32, AC-59, AC-67–AC-72).
- REC1 became GAP5, REC2 became D1, REC3 became D4.

## Risks & open questions
- The brief is about 44k characters, more than twice the ~20k target. Each implementer run reads all of it but executes only its own group.
  - Option (a): accept the size.
  - Option (b): split the plan in two — 40a for server + runner (G1–G5), 40b for the client (G6–G8, after 40a is done).
  - This is the main session's or the user's call.
- The fine-grained token failure shape, whether `X-OAuth-Scopes` is absent, the `protected` flag for both token kinds, the redirect auth behaviour, per-attempt artifacts and the minimal fetch flags are all **unverified** (R2–R5). The designs tolerate them: detect-by-attempt, a manual redirect, the attempt cross-check and the `git fetch` fallback. L1 must exercise each one.
- The pin SHAs come from research on 2026-10-14. L1 re-checks them, and a wrong SHA fails the workflow loudly.
- esbuild `alias` for `zod`/`openai` across alias-imported source is unverified. If the build pulls two zod copies, S15 needs `nodePaths` instead (a deviation to report).
- Bundle size: unminified, the `openai` SDK is probably a few hundred KB (unmeasured). The inline `createTree` content and the base64 zip response should be fine, but are unmeasured.
- The tables are assumed empty for the notNull columns. If a dev DB holds hand-inserted rows, P3's migration fails, and the fix is to clear them.
- `CiService` holds an in-flight refresh guard per process. With two API instances, refreshes can run twice; the unique index still prevents duplicates.
- The S1 port change touches GitLab and the mock in the same group, so G1 is wider than one layer.
- The spec Module interactions mention `CiExportInput` "already carries base". The plan replaces it with `CiPreviewInput`/`CiInstallInput` and the base is read from GitHub (TQ2). Only the contract names change.

## Handed off
- architecture-reviewer: `modules/ci/service.ts` deps and ports (no foreign consumer ports); the `adapters/git/diff-parser.ts` re-export of the core; the `RunnerBundleSource` port; container overrides.
- security review:
  - the S9 validator against the AC-16 invariants;
  - the generated workflow;
  - artifact ingest (size caps, zip bomb, schema, SHA cross-check);
  - the `downloadArtifact` redirect without auth;
  - git argv in the runner;
  - secret redaction (AC-44);
  - id-less `POST /ci/refresh`;
  - branch delete only after the ownership check;
  - `memory.jsonl` exports global memory into a third-party repo (spec B5).

## Insights to record
None.

## Red-flags check
- [x] Every spec AC-n has a row in *Spec traceability* with a step or test
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened or grep-confirmed; every new one is marked `create`
- [x] Every assumption is marked; no product gap is decided here
- [x] Groups end type-checking; G5 runs in parallel only with groups that share no file
- [x] No group under 3 files / ~80 lines that could merge with a neighbour (S24/S25 folded into G5)
- [x] Execution mode multi-agent, per the D11 rule
- [x] Every step's *Skills to apply* is complete
- [ ] The brief above the marker is under ~20,000 characters. **It is ~44k** for 25 steps across 8 groups, even with the contract and schema field lists moved to DN7/DN8. See *Risks*.
- [x] `bash .claude/skills/sdd/scripts/sdd.sh plan-lint docs/plans/41-export-to-ci.md` prints `plan-lint: ok`

## Handoffs → G1
Status: done (S1–S4) after fix G1-F1. Verified by the main session + implementer: reviewer-core `npm run typecheck` ✅, `npm test` ✅ 13 files / 225 tests; server `pnpm typecheck` ✅, unit `vitest run --exclude '**/*.it.test.ts'` ✅ 71 files / 949 tests; client `pnpm typecheck` ✅; scoped Export-to-CI section diff server vs client shared ✅ empty. Main session ran `npm ci` in reviewer-core (its node_modules was absent).

Deviations: S1 client `adapters.ts` gained `CommitFile`, `CommitFilesPayload`, `commitFiles` (were missing); S3 404 checked structurally (`status === 404`) so `vi.mock('octokit')` works; S3 `listCommitsAhead` > 100 commits appends a trailer-less sentinel → service refuses as `foreign_commits`; S4 `server/test/gitlab-adapter.test.ts` one expectation (`findOpenPr` returns `number: 0`) — not in any step's Files; G1-F1 `reviewer-core/vitest.config.ts` self-alias `@devdigest/reviewer-core` → `src/index.ts` — not in any step's Files (reviewer-core suites import server mocks → diff-parser re-export).

Handoff to the next group:
- Contracts in `eval-ci.ts`: `CiTrigger`, `CiPostAs`, `CiRunStatus`, `AGENT_MANIFEST_SCHEMA_VERSION`, `AgentManifest` (`schema_version`, `agent_version` required), `CiInstallErrorCode`, `CiPreviewInput`, `CiInstallInput`, `CiValidateWorkflowInput`, `CiPreview`, `CiWorkflowCheck`, `CiInstallation`, `CiInstallationView`, `CiInstallResult`, `CiRunView`, `CiRunsQuery`, `CiRunsPage`, `CiRefreshInput`, `CiRefreshResult`, `CiResultArtifact` (strict). `CiExportInput`, `CiExport`, `CiRun` removed (no users).
- `CiInstallation.triggers` and `post_as` are required → S5/S7 must supply them.
- Ports in `adapters.ts`: `BranchState`, `WorkflowRunMeta`, `RunArtifactMeta`, `RunnerBundleSource { read(): Promise<string> }`. **G3/S11 must reconcile**: the plan's `FsRunnerBundleSource` returns `{js, version, sha256}` but the port says `read(): Promise<string>`.
- `CommitFilesPayload.expectedHeadSha: string | null`; `openPullRequest` / `findOpenPr` return `{url, number}`.
- `MockForgeClient` takes `ci?: MockForgeCiOptions` (`branches` Map, `commitsAhead` by head branch, `scopes`, `defaultBranch`, `runs`, `artifacts` by run id, `artifactBytes` by artifact id, `jobUrl`, `pullStates`, `openPr`, `errors` keyed by method) and exposes `deletedBranches`; `commitFiles` creates the branch, `deleteBranch` removes it.
- `OctokitGitHubClient.downloadArtifact` throws `AppError('artifact_too_large', 413)` over the cap and an error with `status: 410` when expired. GitLab CI methods throw `repo_not_github` (422).

Review notes: architecture — `parseUnifiedDiff` moved into reviewer-core, server file re-exports it. Security — `downloadArtifact` follows the signed redirect with plain `fetch`, no auth header, https only, `redirect: 'error'`, byte cap; `mapWritePermission` puts `x-accepted-github-permissions` into `AppError.details`.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1–S4 | |
| `zod` | on demand | S1 | |
| `typescript-expert` | on demand | S1–S4 | |
| `security` | on demand | S3 | |

## Handoffs → G2
Status: done (S5–S7). Implementer: server `pnpm typecheck` ✅, unit 71 files / 949 tests ✅, `trace-imports.mjs server/src/modules/ci/repository.ts` ✅.
P3 (main session): `pnpm db:generate` → `server/src/db/migrations/0028_romantic_vargas.sql` — only ADD COLUMN / FK / CREATE INDEX, no drop or rename; `ci_runs`/`ci_installations` had 0 rows; `DATABASE_URL=postgres://devdigest:devdigest@localhost:5432/devdigest pnpm db:migrate` ✅ (30 rows in `__drizzle_migrations`). **Merge risk:** the shared dev DB already holds `0028_tearful_lyja` from the parallel `l07-multi-agents-review` worktree (agent_runs.multi_agent_run_id, finished_at; reviews_run_idx). No table overlap, but both branches carry a `0028_*` — whichever merges second must regenerate/renumber its migration against main.

Deviations: S7 `CiRepository(db: Db)`; `recordCiRun(input)` opens its own transaction (single argument); added `findInstallationById(workspaceId, id)` for S13 remove/ownership.

Handoff to the next group (G3):
- `ci_installations` new: `repoId`, `mode` (`pr|manual`, default `pr`), `exportedAgentVersion`, `exportedCiFailOn`, `workflowVersion`, `runnerVersion`, `triggers` text[] (default `{opened,synchronize}`), `postAs` (default `github_review`), `prNumber`, `prUrl`, `scanCursor`, `updatedAt`; unique `ci_installations_agent_repo_idx` (agentId, repo), `ci_installations_repo_idx`.
- `ci_runs` new: `workspaceId`*, `agentId`, `agentName`*, `agentRunId`, `localPrId`, `repoFullName`*, `githubRunId`* (bigint number mode), `runAttempt`*, `headSha`*, `verdict`, `durationMs`, `model`, `agentVersion`, `runnerVersion`, `errorClass` (* = notNull); `status` enum `passed|gate_failed|error`; unique `ci_runs_run_attempt_idx` (repoFullName, githubRunId, runAttempt), plus `ws_ran`, `installation`, `agent`, `local_pr` indexes.
- `CiRepository`: installations `findInstallation(agentId, repo)`, `findInstallationById(ws, id)`, `listInstallations(agentId)`, `listActiveInstallations(ws, agentId?)`, `upsertInstallation(...)` (sets `targetType: 'gha'`), `deleteInstallation(ws, id): boolean`, `setScanCursor(id, at)`; export inputs `githubReposForWorkspace(ws)` → `{id, fullName, defaultBranch}[]`, `memoryForExport(ws, repoId)` → `{kind, content}[]`, `localPrId(repoId, number)`; runs `recordedAttempts(repo, runIds)`, `recordCiRun(...)`: boolean (true = newly recorded), `latestRunByInstallation(ids)` → Map `{status, ranAt}`, `listRuns(ws, {since, agentId?, repo?, status?, cursor?: {ranAt, id}, limit})` → `{rows: {run, agentDeleted, localPr}[], hasMore}` (fetches limit+1). The service encodes/decodes the opaque `next_cursor` ↔ `{ranAt, id}`.
- S6: `skills/repository.ts` `windowedRuns` filters `source = 'local'`.

Review notes: architecture — `recordCiRun` writes `agent_runs` from the `ci` module's repository (not reviews/runs).

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S7 | |
| `drizzle-orm-patterns` | on demand | S5, S6, S7 | |
| `postgresql-table-design` | on demand | S5, S7 | |
| `typescript-expert` | on demand | S7 | |

## Handoffs → G5
Status: done (S15, S16, S17, S24, S25). Ran in parallel with G2/G3 (no shared files). Implementer: agent-runner `npm run typecheck` ✅, `npm test` ✅ 2 files / 23 tests (T10, T11), `npm run build` ✅ — `dist/index.js` 977 KB, header `// devdigest-agent-runner v0.1.0 sha256:fa2669f4…` matches the body hash, two builds byte-identical; `node dist/index.js` with a missing event path exits 1 with `::error::`. `agent-runner.yml` not yet run on GitHub.
Main session: P2 (package.json + installs; esbuild postinstall not run, binary works), P4 symlink `agent-runner/CLAUDE.md → AGENTS.md` ✅, `agent-runner/dist/index.js` not git-ignored ✅ (`.gitignore:6` negation), P5 `pnpm eval:workflow` — see below.

Deviations: S15 added `src/globals.d.ts` (declares `__RUNNER_VERSION__`, `__DEPS__`); tsconfig + vitest also alias `openai`. S17 `main.ts` exports `run(env, deps)` (auto-runs only as process entry); empty diff → synthetic approve, no model call, nothing posted (unplanned case); exactly one `agents/*.yaml` expected in `DEVDIGEST_CONFIG_DIR`. S24 uses `checkout@v4`/`setup-node@v4` like `reviewer-core.yml` (this repo's own CI, not the generated workflow).

Handoff (for G3/S8–S11): runner layout in `.devdigest/`: one `agents/*.yaml`, `skills/<slug>.md` per manifest slug (regex-validated), optional `memory.jsonl` `{kind, content}`; runner `.devdigest/runner/index.js`. Env: `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `DEVDIGEST_POST_AS`, `DEVDIGEST_CONFIG_DIR`, `DEVDIGEST_WORKDIR` (+ `GITHUB_EVENT_PATH`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT` from Actions). Writes `devdigest-result.json` to cwd. (Relayed to the running G3 implementer.)

Review notes: security — posts to `${GITHUB_API_URL}` (https enforced) with the `GITHUB_TOKEN` bearer, repo name regex-validated; `gitDiff` argv only, SHAs 40-hex validated, fetches `origin` when a commit is missing; redactor strips the key/token values from all output; `buildResult` has no key/token input; skill slugs regex-validated (no traversal). Architecture — agent-runner imports reviewer-core + shared via path aliases.

Insight candidates: zod/openai must be aliased to the runner's own node_modules in three places (tsconfig paths, vitest alias, esbuild alias) or the manifest schema and the engine run on different zod copies; esbuild ESM bundling CJS `openai` needs a `createRequire` banner.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S17 | |
| `typescript-expert` | on demand | S15–S17 | |
| `zod` | on demand | S16 | |
| `security` | on demand | S16, S17 | |

## Handoffs → G3
Status: done (S8–S11). Implementer: server `pnpm typecheck` ✅; new unit files 4 / 30 tests ✅; unit suite 75 files / 979 tests ✅; `trace-imports.mjs server/src/modules/ci server/src/adapters/runner-bundle` ✅.

Deviations:
- S11 (resolved inside G3, plan wording superseded): the port stays `RunnerBundleSource.read(): Promise<string>` (fixed in G1). `FsRunnerBundleSource.read()` returns the whole verified file including the header; throws `ConfigError('runner bundle missing or corrupt')` on a missing file, bad header or hash mismatch. The version comes from the pure helper `runnerVersionOf(js)` in `export-files.ts`. **S11/S12 text saying `{js, version, sha256}` is superseded by this.**
- S9: generated workflow env = `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `DEVDIGEST_POST_AS`, `DEVDIGEST_CONFIG_DIR=base/.devdigest`, `DEVDIGEST_WORKDIR=head`; runner run from `base/.devdigest/runner/index.js`; artifact `devdigest-result.json` (matches G5).
- S11: config field `agentRunnerBundle` (absolute path, env `AGENT_RUNNER_BUNDLE`).

Handoff to the next group (G4):
- `ci/constants.ts`: `CI_BRANCH`, `PR_TITLE`, `WORKFLOW_PATH`, `WORKFLOW_FILE` (`devdigest-review.yml`), `RUNNER_PATH`, `MEMORY_PATH`, `WORKFLOW_VERSION`, `ARTIFACT_NAME`, `ARTIFACT_FILE`, `MAX_ZIP_BYTES`, `MAX_JSON_BYTES`, `LOOKBACK_DAYS`, `MAX_RUNS`, `EXPORT_TRAILER`, `ACTION_PINS`.
- `export-files.ts`: `buildExportFiles({agent: {name, provider, model, systemPrompt, strategy, ciFailOn}, version, skills: {name, body}[], memory: {kind, content}[], workflow, runnerJs})` → `{ok: true, files} | {ok: false, blocked: {code, message, field?}}`; `prBody(files, repo)`, `zipFiles(files): Uint8Array` (base64 in the service), `uniqueSlugs`, `slugify`, `runnerVersionOf(js)`.
- `workflow.ts`: `generateWorkflow({triggers, postAs})`, `validateWorkflow(text, {triggers, postAs})` → `CiWorkflowCheck`; error codes `yaml`, `trigger`, `permissions`, `jobs`, `unpinned_action`, `run_expression`, `persist_credentials`, `base_checkout`; warning `differs_from_generated`.
- `artifact.ts`: `parseResultArtifact(zipBytes, {id, run_attempt, head_sha})` → `{ok, value} | {ok: false, reason, detail?}` (reasons `zip_too_large`, `zip_invalid`, `json_missing`, `json_too_large`, `json_invalid`, `schema_invalid`, `sha_mismatch`, `attempt_mismatch`); `toStatus(artifact)`, `nextCursor(runs, oldCursor)`.
- `adapters/runner-bundle/fs.ts`: `FsRunnerBundleSource(path)` — G4 wires it in `container.ts` as `new FsRunnerBundleSource(config.agentRunnerBundle)` with a `ContainerOverrides.runnerBundle` override. The service takes `runnerVersion = runnerVersionOf(await bundle.read())` and passes the full string as `runnerJs`.

Review notes: security — `validateWorkflow` parses with `yaml`; the `${{` scan runs on parsed `run` strings only; `artifact.ts` checks the declared size via the unzip filter and the inflated size after. Architecture — bundle path only from `config.ts`.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S8–S11 | |
| `zod` | on demand | S8, S10, S11 | |
| `typescript-expert` | on demand | S8–S11 | |
| `security` | on demand | S8–S11 | |

## Handoffs → G4
Status: done (S12–S14). Implementer: server `pnpm typecheck` ✅; unit 75 files / 979 tests ✅; `TESTCONTAINERS_RYUK_DISABLED=true pnpm exec vitest run test/ci-export.it.test.ts test/ci-ingest.it.test.ts` ✅ 2 files / 23 tests (T8 12, T9 11); `check-module.sh ci` ✅; `trace-imports.mjs src/modules/ci src/platform/container.ts` printed "0 files traced" — coverage unconfirmed (reviewer: re-run with the right path form).

Deviations: S12/S13 `Verdict` is a value import from `@devdigest/shared` (server side — allowed); `CiServiceDeps.forge` takes the container's `forge(ref)` signature. S14 `overrides.runnerBundle ?? new FsRunnerBundleSource(config.agentRunnerBundle)`. S7 fix in `ci/repository.ts` `listRuns` keyset cursor: postgres-js cannot bind a JS `Date` in raw `sql` (page-2 → 500); now binds `toISOString()::timestamptz` and `id::uuid` (found by the `.it` test). Plan-silent choices: `state` = `inactive` (repo_id null) · `pending_merge` (pr_state open) · `active`; refresh in-flight guard keyed by workspace + agent; `token_missing` 422, `missing_workflow_permission` 403, `branch_protected`/`foreign_commits`/`branch_moved` 409, `workflow_invalid` 422 with the `CiWorkflowCheck` in `details`; ingested `agent_name` = live agent name, fallback to the artifact's.

Not verified: AC-58 100-run cap has no test (30-day cap covered); S6 skill-stats exclusion not re-tested (T9 asserts source `ci`, `pr_id` null, no `run_skills`). `check-module.sh` flags `octokit.ts:600 fetch` = the G1 signed-redirect download (known).

Handoff to the next group (G6) — routes, all workspace-scoped:
- `POST /agents/:id/ci/preview` (`CiPreviewInput` → `CiPreview`; blocked export = 200 with `blocked` set and `files: []`).
- `POST /agents/:id/ci/validate-workflow` → `CiWorkflowCheck`.
- `POST /agents/:id/ci/install` → `CiInstallResult`; refusals `{error: {code: CiInstallErrorCode, message, details}}`: `provider_not_openrouter`, `manifest_invalid`, `workflow_invalid`, `token_missing`, `repo_not_github` 422; `missing_workflow_permission` 403; `branch_protected`, `foreign_commits`, `branch_moved` 409.
- `GET /agents/:id/ci/installations` → `CiInstallationView[]` (`pr_state`, `state`, `out_of_date`, `gate_drift`, `latest_run`; a PR-state read failure → `unknown`).
- `DELETE /ci/installations/:id` → 204 / 404.
- `POST /ci/refresh` body `{agent_id: uuid | null}` (bodyless → 4xx) → `{recorded, rejected[], errors[]}`.
- `GET /ci/runs?since&agent_id&repo&status&cursor&limit` → `{items, next_cursor}`; `since` default 7 days, invalid since/cursor → 422; `limit` default 50, max 100; `ran_at` ISO string.
- `.it` runs need `TESTCONTAINERS_RYUK_DISABLED=true`; runner bundle injected via `overrides.runnerBundle`.

Review notes: architecture — `CiService` takes a narrow `CiAgentsPort` satisfied structurally by `container.agentsRepo`; the container getter `ci` is the only place knowing service + fs adapter. Security — never force-pushes; deletes `devdigest/ci` only when every commit past the base carries `DevDigest-Export:`; `/ci/runs` cursor is opaque base64url JSON, strictly validated (forged → 422); run identity from GitHub metadata, not the artifact; `install` 10/min and `refresh` 20/min rate limits.

Insight candidates: postgres-js + drizzle raw `sql` cannot bind a JS `Date` without a cast — bind `toISOString()` with `::timestamptz` (the builder's `gte`/`lt` handle `Date`).

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S12–S14 | |
| `zod` | on demand | S14 | |
| `typescript-expert` | on demand | S12–S14 | |
| `security` | on demand | S12–S14 | |
| `fastify-best-practices` | on demand | S14 | |

## Handoffs → G6
Status: done (S18–S19). Implementer: client `pnpm typecheck` ✅; `pnpm exec vitest run CiTab` ✅ 1 file / 6 tests (T12); `pnpm test` ✅ 89 files / 659 tests (incl. `shared-type-only-imports`). Not run in a browser; layout matched to screenshot 2 by reading it.
Main session: P5 `pnpm eval:workflow` first run (during G3/G4) — 5 passed, 4 failed, all 4 with "workflow session changed the REAL repo despite the sandbox", listing G4's files being written concurrently (`ci/routes.ts`, `ci/service.ts`, `container.ts`, `modules/index.ts`, the two `.it` tests). Artefact of running implementers in parallel; **re-run P5 after the last group with no writer active.**

Deviations: `ci.json` — old unused `ciTab` block replaced, `publishDialog` untouched, `exportWizard.blockMergeDesc` carries the AC-24 copy (CODEOWNERS + ruleset). `CiTab({agent, onExport?})` opens the wizard via an optional prop (wizard arrives in G7); `CiExportRequest = {installation: CiInstallationView | null}` exported from the CiTab barrel. `useCiPreview(agentId, input | null)` is an idle-while-null `useQuery`. Row status text uses "succeeded" / "gate failed" / "error".

Handoff to the next group (G7):
- Hooks (`client/src/lib/hooks/ci.ts`, via the barrel; keys `['ci', …]`): `useCiInstallations(agentId)`; `useCiRefresh({agent_id}, enabled = true)` — POSTs `/ci/refresh` every 60 s and invalidates `['ci','installations']` + `['ci','runs']`; `useCiRuns(query)` — single page, caller keeps the cursor; `useCiPreview(agentId, input | null)` (staleTime/gcTime 0); `useValidateCiWorkflow(agentId)`; `useCiInstall(agentId)` (invalidates `['ci']`); `useRemoveCiInstallation()`.
- **Wizard wiring is G7's job:** `CiTab` (in S19's Files) owns `useState<CiExportRequest | null>` and renders `<ExportWizard>` through `createPortal` (vendored `Modal` does not portal — client gotcha). `installation === null` = Add to CI / Add repository; non-null = Update CI config (AC-33: open at Preview with the saved choices). The several-installations picker already lives in `CiTab`. Main-session ruling: G7 may edit `CiTab.tsx` for this wiring (file already in the plan, S19); not a plan change.
- For G8: `runs.status` keys in `ci.json` (succeeded, noFindings, failed, running) don't match the API enum `passed | gate_failed | error` — map or replace them; `ciTab.runStatus` already covers the enum.
- Shared hook mocks need an `importActual` spread (see `CiTab.test.tsx`).

Review notes: architecture — `useCiRefresh` invalidates inside its `queryFn` (TanStack v5 has no query `onSuccess`); wizard seam `onExport`. Security — `pr_url` rendered as a link only when it starts with `https://`, `rel="noopener noreferrer"`; repo names / URLs as text nodes.

Insight candidates: a bracket-free vitest filter (`CiTab`) does find tests under `agents/[id]/…` (the gotcha covers bracketed filters only); BSD `sed -i` inside an `&&` chain aborted silently — use the Edit tool or `perl -pi`.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | — | client-only group |
| `frontend-architecture` | on demand | S18, S19 | |
| `react-best-practices` | on demand | S18, S19 | |
| `next-best-practices` | on demand | S18, S19 | |
| `react-testing-library` | on demand | S19 | |
| `typescript-expert` | on demand | S18, S19 | |
| `zod`, `security` | not read | — | no schemas; only trust-boundary code is the https-only link guard |

## Handoffs → G7
Status: done (S20, S21 + the G6-ruled wiring in `CiTab.tsx`). Implementer: client `pnpm typecheck` ✅; `pnpm exec vitest run ExportWizard` ✅ 1 file / 10 tests (T13); `pnpm test` ✅ 90 files / 669 tests. Not opened in a browser; layout matched to screenshots 1/3/4/5 by reading them.

Deviations: `client/messages/en/ci.json` gained keys under `exportWizard` only (not listed in S20/S21 Files; same file as S18). `CiTab` owns `useState<CiExportRequest | null>` and portals `<ExportWizard>` into `document.body`; `onExport` stays as an optional override (keeps the 6 CiTab tests unchanged). `WizardFooter.tsx` not created — footer lives in `ExportWizard.tsx`. Design: Target 4 cards (GitHub Actions selected + "recommended", the other three disabled) + a repo picker; Preview file list + viewer (workflow editable); Configure trigger chips, secrets table (`OPENROUTER_API_KEY` "expected · not verified", `GITHUB_TOKEN` "ready"), post-as radios, info box; Install PR / zip + docs link. Spec additions over the mockups: repo picker, AC-10 / AC-68 notes, zip fallback on permission/branch errors, warnings on Preview and Configure. Docs link → GitHub's "using secrets in GitHub Actions" page (implementer's choice; no URL in the spec).

Review notes: security — PR link anchor only for `https://`, `rel="noopener noreferrer"`; file contents rendered as text (`<pre>`/`<textarea>`); zip built from base64 via Blob, object URL revoked after the click. Architecture — wizard imports `ApiError` (value) from `@/lib/api` and `useActiveRepo` from `@/lib/repo-context` (client-internal); `CiTab` ↔ `ExportWizard` depend on each other (type-only in one direction).

For G8 (repeat): `runs.status` keys in `ci.json` don't match `passed | gate_failed | error`; `ciTab.runStatus` covers the enum.

Insight candidates: spreading a `CSSProperties` object inside `export const s = {…} as const` → TS2742 (already in client gotchas); a mocked mutation hook must be stateful when the component renders from `mutation.data`/`error`; jsdom `a.click()` on a download anchor logs "Not implemented: navigation" — spy on `HTMLAnchorElement.prototype.click`.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | — | client-only group |
| `frontend-architecture` | on demand | S20, S21 | |
| `react-best-practices` | on demand | S20, S21 | |
| `next-best-practices` | on demand | S20, S21 | |
| `react-testing-library` | on demand | S20, S21 | |
| `typescript-expert` | on demand | S20, S21 | |
| `zod`, `security` | not read | — | no schemas; trust-boundary code limited to the https-only link and text rendering |

## Handoffs → G8
Status: done (S22, S23). Implementer: client `pnpm typecheck` ✅; `pnpm exec vitest run CiRunsView` ✅ 1 file / 5 tests (T14); `pnpm test` ✅ 91 files / 674 tests. Not opened in a browser.

Deviations: `client/messages/en/ci.json` (not in S22's Files; same file as S18) — `runs.status` replaced by `passed`/`gate_failed`/`error` (old keys were unused) plus filter, banner, paging and `deletedAgent` strings. `sinceFor`/`parseFilters` and sidebar assertions live in `CiRunsView.test.tsx`. `nav.ts` — GLOBAL section with "CI Runs", signed-off exception (spec B7).

Review notes: architecture — `RunsPage` mounts recursively per "Load more", one `useCiRuns` per cursor; the view also calls `useCiRuns` for the empty check (deduped); status-tone map duplicated in `helpers.ts` to avoid a cross-feature import. Security — `job_url` link only for `https://`, `rel="noopener noreferrer"`; `local_pr` href from API ids; URL-param filters validated against closed sets in `parseFilters`.

Insight candidates: a status label also present as a `<select>` option collides in `getByText` — scope with `within(getByRole("table"))`; `since` computed from `Date.now()` in render changes the query key every render — memoize on the range key.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | — | client-only |
| `frontend-architecture` | on demand | S22, S23 | |
| `react-best-practices` | on demand | S22 | |
| `next-best-practices` | on demand | S22 | |
| `react-testing-library` | on demand | S22 | |
| `typescript-expert` | on demand | S22 | |
| `zod`, `security` | not read | — | no schemas; only the https-only `job_url` link |

## Test-writer report (after G8)
Added: `server/test/ci-ingest.it.test.ts` (+8: AC-58 cap, AC-46 identity from GitHub metadata, AC-47 rejections, 410 skip, malformed `/ci/refresh` + forged `/ci/runs` cursors → 422, cross-workspace isolation); `server/test/ci-export.it.test.ts` (+5: AC-59 with an open PR, mid-line trailer = foreign, `missing_workflow_permission` 403, `branch_moved` 409, cross-workspace agent/repo refused); `server/test/ci-run-isolation.it.test.ts` (new, AC-69 skill stats + PR list cost); `server/test/ci-workflow.test.ts` (+21 bypass cases); `agent-runner/test/main.test.ts` (+17: redaction in stdout/stderr/result, no key → exit 0, slug traversal, malformed events, non-https API URL). Break checks done per file, shasums restored.
Coverage gaps left (open for the user/review): the review body posted to GitHub is not redacted — a secret echoed by the model would reach the PR comment (AC-44 covers log/trace/artifact only); `listCommitsAhead` > 100 sentinel untested at service level; concurrent refresh dedupe untested; `/ci/refresh` extra keys are stripped, not rejected.

## Verification log
- main-session fix: TW-1 (test-writer defect) — `server/src/modules/ci/workflow.ts` (S9 Files): the `run:` expression guard was a case-sensitive, dot-only denylist (`github.event|github.head_ref|inputs`), bypassed by `GitHub.Event…`, `github['event']`, `github['head_ref']`. Replaced with an allowlist: each `${{ … }}` in a run step must be `runner.*` or a plain `github.(run_id|run_number|run_attempt|repository|repository_id|workflow|job|sha|server_url|api_url)`; an unterminated `${{` is also refused. S9 Done-when: `pnpm exec vitest run test/ci-workflow.test.ts` ✅ 31/31; server `pnpm typecheck` ✅; unit suite ✅ 1000 tests.
- main session, after the last group + TW-1: full server integration suite `TESTCONTAINERS_RYUK_DISABLED=true pnpm exec vitest run .it.test` ✅ 39 files / 360 tests (2026-10-15 10:05).

## Review → architecture-reviewer (diff HEAD..refs/checkpoints/plan40-impl)
Verdict: PASS. F1 MEDIUM (non-blocking): the new `RunnerBundleSource` port has an override but no mock in `server/src/adapters/mocks.ts` (`ci-export.it.test.ts:51` passes an inline one). Pre-existing: client `ConformanceInput.provider` drift; `reviewer-core/test/run.test.ts` imports server mocks (why the self-alias is needed). Plan drift noted: S11 port shape (see G3 handoff); `ci-run-isolation.it.test.ts` not in the Tests table. Doc gap: onion skill `layer-map` has no `agent-runner/` entry.
Main session ran the tools the reviewer could not: `trace-imports.mjs server/src/modules/ci server/src/adapters/runner-bundle server/src/adapters/git/diff-parser.ts server/src/platform/container.ts` → "No transitive edge leaves its layer (11 files traced)"; `check-module.sh ci` → all ok except `one-adapter-per-system` flagging `octokit.ts:600 fetch(url, { redirect: 'error' })` — the signed artifact-redirect download inside the GitHub adapter that owns the system (known since G1; the URL is GitHub's signed blob, the Octokit client cannot fetch it without leaking the token).

## Review → security-reviewer (diff HEAD..refs/checkpoints/plan40-impl)
Verdict: PASS (no in-change CRITICAL); two HIGH for fix mode, both in `server/src/modules/ci/workflow.ts` `validateWorkflow` / `checkJobs`:
- **SF1 HIGH** — a submitted workflow (`/agents/:id/ci/install`, LAN/DNS-rebinding reachable) can add `env: K: ${{ secrets.ANY }}` + a `run:` that sends `$K` out; the validator passes it and the PAT opens a same-repo PR that runs it → every repo secret exfiltrated. Fix: in a submitted workflow refuse `secrets.` anywhere except `OPENROUTER_API_KEY` in the runner step's `env`; allow `uses:` only for the three `ACTION_PINS`; refuse `./` local actions; require the run step to equal the generated run step. Consider a Host/Origin check on PAT-writing routes.
- **SF2 HIGH** — `checkJobs` inspects only `steps[*].uses` / `run`: job-level `uses:` (unpinned reusable workflow, `secrets: inherit`), `with:` (e.g. `actions/github-script` `script: ${{ github.event… }}`), `shell:` templates and `uses: ./head/…` all pass. Fix: reject job-level `uses`; apply the expression guard to every string under `steps[*].with/env/shell` and job `env`; drop the `./` exemption.
Needs manual check: `artifact.ts:31` trusts the declared `originalSize` before inflating (DoS only) — confirm fflate's output cap.
Filtered out: review body redaction (refuted — the key/token are never in the model's input); signed artifact host allowlist; LAN-callable refresh/delete; trailer forgery (needs push access anyway).
Handoff: server vs client `vendor/shared/adapters.ts` differ (`sessionId`, provider `id` union); `memoryForExport` exports **global** memory into the target repo (possibly public) — product decision for the user; `prompt.ts` skill-anchor drift.
Dependency audit (X10) not run — needs network (main session).

## Eval → P5 `pnpm eval:workflow` (re-run with no writers)
8/9 passed; failing case "server task follows the protocol and the routing in server/AGENTS.md" (`server/insights/gotchas.md not read`). Repeated that case 3× → 1 pass, 2 fail (≈ 1/4 over 4 runs). The `AGENTS.md` diff only adds `agent-runner/` to the package table and npm list — unrelated to the server gotchas rule. Baseline at HEAD not yet measured (needs `eval:repeat` before/after).

## Verification → plan-verifier, full pass (2026-10-15)
Result: **incomplete**. AC met: 1–9, 11–18, 20–49, 51, 54–72; partial: AC-10, 19, 50, 52, 53. Checks re-run all green (server unit 1000, reviewer-core 225, agent-runner 37, client 674, server `.it` from the main session's run).
Gaps for fix mode:
- **V-AC10** — the AC-10 note at Target never shows on "+ Add to CI" (`existing_installation_id` comes from the preview query, which is disabled before Preview). Derive from `useCiInstallations(agent.id)` matched on `repo_id`; add a T13 assertion.
- **V-T8** — `ci-export.it.test.ts:84-94` asserts only the null case; assert a non-null `existing_installation_id` after an install.
- **V-T13** — no assertions for AC-9 (no GitHub repo) and AC-56 (warnings shown) in `ExportWizard.test.tsx`.
- **V-AC52** — CI Runs row has no verdict column; duration only as a tooltip (`CiRunRow.tsx:41`).
- **V-AC53** — "All time" sends no `since` → the server defaults to 7 days.
- **V-AC50** — the scan cursor is the newest `created_at` with `>=`, so the newest no-artifact run is re-listed every refresh; add a second-refresh assertion.
- **V-AC19** — same root as SF2 (job-level `uses`, `./` exemption).
- **V-P1** — `CiRunsQuery.since` lacks `.max()` (both shared copies).
- **V-SK12/13** — `zod` skill not recorded for S12/S13; re-read and re-check.
Plan change proposed: record in S14 the accepted `octokit.ts:600` signed-redirect `fetch` exception (`check-module.sh` flag).
Needs sign-off: bundle freshness (`npm run build && git diff --exit-code dist/index.js`, or the `agent-runner.yml` CI run); R3/R4 not provable (untracked plan, no `plan-approved` checkpoint, no Proof table); L1/P6 live GitHub check; P5 baseline.
Handoff notes: manifest failure (AC-38) writes no result → never stored as an `error` run; a re-run attempt older than the cursor is never ingested (GitHub keeps the run's `created_at`); `ci_runs.agent_run_id` FK has no index (no reader today).

## Fix mode 1 (SF1, SF2, V-AC19, F1, V-AC10, V-T13, V-T8, V-AC52, V-AC53, V-AC50, V-P1, V-SK12/13)
Implementer: all done. Server `pnpm typecheck` ✅, unit 75 files / 1016 ✅, ci `.it` 3 files / 39 ✅; client `pnpm typecheck` ✅, `pnpm test` 91 files / 680 ✅. Checkpoint `refs/checkpoints/plan40-fix1` (parent `plan40-impl`).
- SF1/SF2/V-AC19: a submitted workflow must contain a step equal to the generated runner step (ignoring `name`, key order) — the only place `secrets` / `github.token` may appear (`runner_step`, new `secrets` invariant); `uses:` only the three `ACTION_PINS` (`./` and unpinned → `unpinned_action`, other pinned → `disallowed_action`); job-level `uses`/`secrets` → `job_uses`; the expression allowlist covers step `run/with/env/shell/if/working-directory`, job `env/defaults/container/services/runs-on/if`, workflow `env/defaults` (only the generated checkout `ref` expressions exempt); extra: a run step writing `GITHUB_ENV`/`GITHUB_PATH` is refused. +16 bypass tests; the "harmless expression" test now uses a separate extra step.
- F1: `MockRunnerBundleSource` in `mocks.ts`, used by the ci `.it` tests.
- V-AC10: wizard matches `useCiInstallations(agent.id)` on `repo_id` → note shows on "+ Add to CI". V-T13: AC-9, AC-56 assertions. V-T8: non-null `existing_installation_id` after an install.
- V-AC52: visible Verdict and Duration columns. V-AC53: "All time" sends `since=1970-01-01T00:00:00.000Z`.
- V-AC50: `nextCursor` = newest completed run `created_at` + 1 ms (exclusive), in-progress runs still re-scanned; second-refresh assertion added. Edge: a second run in the same ms as the cursor is treated as seen.
- V-P1: `CiRunsQuery.since` `.max(40)` in both copies. V-SK12/13: `decodeCursor` uses a `CursorPayload` zod schema; `triggers` parsed with `z.array(CiTrigger).catch([])`.
- main session, after fix mode 1: full server `.it` suite ✅ Tests  361 passed (2026-10-15).

## Verification → plan-verifier, delta 1 (after fix mode 1)
Result: **complete — needs sign-off**. All 72 AC met; 0 partial / missing / contradicted. Gaps: none. The pending `.it` item is closed by the main session's re-run above (361 passed).
Needs sign-off: bundle freshness (D(S17)/D(S24)); R3 (no `plan-approved` checkpoint) and R4 (no Proof table); L1/P6 live GitHub check; P5 eval baseline; D(S14) plan change (record the `octokit.ts:600` signed-redirect `fetch` exception).
Handoff: a second run in the same ms as the cursor is treated as seen; the exact runner-step match means a user edit to the runner step fails `runner_step` (narrows AC-17/AC-56 editability to the other parts of the workflow).
- main session: bundle freshness (D(S17)/D(S24)) — `npm run build` showed `dist/index.js` was **stale** after fix mode 1: the bundle inlines `@devdigest/shared`, and V-P1 changed `CiRunsQuery.since` to `.max(40)` (the only diff besides the header). Rebuilt → `sha256:fdb52c7ef79242b56450cbd396f63ec96e301f2f382d61ba2543f58f8a7d8be7`; a second build is byte-identical. Any shared-contract edit needs `cd agent-runner && npm run build` (the `agent-runner.yml` freshness check would fail otherwise).

## Review → security-reviewer, delta 1
Verdict: PASS (no §3 item) but **SF3 HIGH** reopens SF1: pinning only the runner step's own keys is not enough — what the step inherits still controls the code that runs with `OPENROUTER_API_KEY` + `github.token`: (a) job/workflow `env: NODE_OPTIONS: --import=data:…` (no `${{`); (b) a plain `run:` step before the runner that overwrites `base/.devdigest/runner/index.js`; (c) a second pinned checkout with `path: base` and the head ref (or `repository: attacker/x`); (d) job `container: attacker/img`. The `GITHUB_(ENV|PATH)` text check is evadable. Fix direction: compare the whole job against the generated one (only a fixed set of fields editable), refuse other jobs and workflow-level `env`/`defaults`.
Settled: `artifact.ts` zip bomb — fflate `unzipSync` sizes the output from the declared `originalSize` and never grows it; the filter caps it; a lying header yields `json_invalid`. `decodeCursor` closed.
→ Needs a user decision (it narrows AC-15/AC-17/AC-56 "editable workflow"), see the session.
- main session, P5 baseline: `pnpm eval:repeat workflow -n 5 -t "server task follows the protocol" --label baseline-head` in a temporary worktree at HEAD (6c9c63c, removed after) → **1/5 (20%)**. This change's runs of the same case: 1/4 (25%). The "server/insights/gotchas.md not read" failure predates this change; the `AGENTS.md` package-table edit does not affect it. `results/repeat-baseline-head.json` copied into `evals/results/` (gitignored) for an `eval:delta` once a candidate series is run.

## Fix mode 2 (SF3, MEM-A) — spec re-approved 2026-10-15 (AC-14, 15, 17, 19, 30, 56)
Implementer: `validateWorkflow` now parses the submission, regenerates the expected workflow for the same triggers/post_as, checks and normalises the three editable fields (`name`; `jobs.review.runs-on` ∈ {ubuntu-latest, ubuntu-24.04, ubuntu-22.04} → `runs_on`; `jobs.review.timeout-minutes` integer 1–360 or absent → `timeout_minutes`) and requires deep equality of everything else (`differs_from_generated`, first differing path + line). Old piecewise rules removed; `warnings` always `[]` (contract unchanged → no agent-runner rebuild). `service.ts` `workflow_invalid` message = first error (names the field); install validates both `open_pr` and `zip`. `ci-workflow.test.ts` rewritten (62 tests: positives per editable field, AC-56 negatives, the four SF3 vectors, SF1/SF2 cases as extra steps). `ci-export.it.test.ts` +2 (tampered `container` refused for PR and zip, nothing committed; AC-14 memory scope). Client: Preview warning UI removed, badge "editable: name, timeout, runner" + hint (AC-15), server refusal shown on Preview and Install. MEM-A: `memoryForExport` filters `scope = 'repo' AND repo_id = target`.
Checks: server typecheck ✅, unit 75 files / 1031 ✅, ci `.it` 3 files / 41 ✅; client typecheck ✅, `pnpm test` 91 files / 681 ✅.
- main-session fix: SF3-name — `server/src/modules/ci/workflow.ts` (S9 Files): the editable workflow `name` now must be plain text of 1–100 characters without `${{` (defence in depth; GitHub does not evaluate expressions in `name`); two assertions added to `ci-workflow.test.ts`. S9 Done-when: `vitest run test/ci-workflow.test.ts` ✅ 62/62; server typecheck ✅; unit ✅ 1031.
Checkpoint `refs/checkpoints/plan40-fix2` (parent `plan40-fix1`).
- main session, after fix mode 2: full server `.it` suite ✅ Tests  363 passed (2026-10-15).

## Review → security-reviewer, delta 2 (fix1..fix2)
Verdict: **PASS**, no new SF. SF3 closed by the whole-document comparison; multi-doc, merge keys, `__proto__`, duplicate scalar keys, tags, `on`/`true`, number/string, null/absent, BOM keys all fail closed; install (PR and zip) cannot skip validation. MEM-A correct.
Needs manual check (0.7–0.8): an **alias used as a mapping key** (`*a: …`) is not caught by the yaml lib's duplicate-key check (scalars only) and `toJS` is last-wins — the validator could see the generated `env` while the raw text committed to GitHub carries an earlier evil key, depending on how GitHub's parser treats alias keys. Recommended hardening (removes the whole parser-difference class): **commit the regenerated workflow with the three validated fields patched in, never the user's raw text**; optionally also reject Alias / non-plain-scalar keys.

## Verification → plan-verifier, delta 2 (fix1..fix2)
Result: **complete — needs sign-off**; all 72 AC met incl. corrected AC-14/15/17/19/30/56; gaps none. The pending `.it` item is closed by the main session's run (363 passed).
Bundle hash: main session recomputed `sha256(dist/index.js after line 1)` = header `fdb52c7e…` ✅.
Follow-ups raised: (V2-BUNDLE) `ci-runner-bundle.test.ts` "accepts the committed bundle" swallows a bad hash via `.catch(() => null)` — should `skipIf(!exists)` and assert the read succeeds; (V2-FLAKY) one intermittent server unit failure in 3 runs while the client suite ran in parallel (output not captured) — likely the ~1.9 s retry-path test in `github-ci-adapter`.

## Fix mode 3 (H1, V2-BUNDLE, V2-FLAKY)
- H1: new `shipWorkflow(submitted, opts)` in `ci/workflow.ts` — regenerates with `generateWorkflow` and patches only `name` (JSON-quoted scalar, U+2028/2029 escaped), `jobs.review.runs-on`, `jobs.review.timeout-minutes` (absent → omitted, GitHub default 360; absent name/runs-on → generated value). `validateWorkflow` refuses any Alias node and any non-plain-string-scalar key (`yaml` invariant, with line). `ci/service.ts` `build()` validates a submitted workflow first (`workflow_invalid` 422) then ships `shipWorkflow(...)` — covers install PR and zip (preview takes no workflow). Tests: unit `ci-workflow.test.ts` 68 (+6: alias key/value, quoted key, noisy edit ships regenerated text, absent timeout omitted, unedited ships generated with quoted name); `.it` `ci-export` — a commented/whitespace-noisy submission is committed via open_pr as exactly the regenerated text (zip path shares `build()`, no separate assertion).
- V2-BUNDLE: `ci-runner-bundle.test.ts` uses `it.skipIf(!existsSync(committed))` and awaits `read()` without `.catch`.
- V2-FLAKY: server unit suite ×5 → 1037/1037 each, not reproduced; nothing changed (suspect: `github-ci-adapter` retry-path test under parallel load — unconfirmed).
Checks: server typecheck ✅; unit ×5 ✅ 1037; ci `.it` 3 files / 42 ✅. No client or shared change. Checkpoint `refs/checkpoints/plan40-fix3`.

## Review → security-reviewer, delta 3 (fix2..fix3)
Verdict: **PASS**, no findings, nothing for fix mode; the delta-2 alias manual check is closed (Alias nodes and non-plain-string keys refused; the shipped text is always regenerated, so validator-vs-GitHub parse differences can no longer reach the repo). Only sink `export-files.ts:95` is fed by `generateWorkflow` or `shipWorkflow`. `name` JSON-quoting is a safe YAML double-quoted scalar. Usability note: a patch-point miss in `shipWorkflow` would silently drop an edit — covered if the unit test asserts each of the three patches lands on the current generator output.
- main session, after fix mode 3: full server `.it` suite ✅ Tests  364 passed (2026-10-15).

## Verification → plan-verifier, delta 3 (fix2..fix3)
Result: **complete — needs sign-off**; all 72 AC met; gaps none. `.it` item closed by the main session's run (364 passed). V2-BUNDLE: the bundle test ran (not skipped) → committed header hash verified. V2-FLAKY identified: `server/test/context-helpers.test.ts` "every accepted glob matches a 2,046-segment path in < 50 ms" (71 ms / 50.6 ms under parallel load) — outside plan 41, pre-existing; follow-up, not fixed here.
Open wording decision for the user: an absent `timeout-minutes` is shipped without the key (GitHub default 360), while AC-56/AC-17 don't say "absent" is allowed. Note: an edited submission ships with `name` JSON-quoted and comments dropped, so the committed file can differ textually from Preview (within AC-30).
- main-session fix: TM-1 — `server/src/modules/ci/workflow.ts` (S9 Files) `shipWorkflow`: a removed `timeout-minutes` now ships as the generated `20` (was omitted → GitHub 360-min default); test in `ci-workflow.test.ts` renamed and flipped ("restores the generated timeout-minutes when the submission removed it"). S9 Done-when: `vitest run test/ci-workflow.test.ts` ✅ 68/68; server typecheck ✅; `ci-export.it.test.ts` ✅ 21/21.

## /pr-self-review (2026-10-15)
Verdict **PASS** (0 critical, 2 high, 15 medium) — `.pr-self-review.json` diffHash `7253a3c7c78064ce…`. Gates: typecheck ✅ ×4; tests ✅ reviewer-core 225, agent-runner 37 (bundle fresh), client 681; server 1401/1401 on re-run (first run: `context-helpers.test.ts` < 50 ms timing flake — untouched by the diff, also fails on base 8d8c6a1). Contract drift: none new. Main-session fix during review: stale `timeout-minutes` comments in `ci/workflow.ts` (TM-1 follow-up). Open HIGH: H-UI1 `useCiRefresh` invalidates on every 60 s tick even when nothing was recorded; H-BE1 a renamed agent / second agent on the same repo leaves two `agents/*.yaml` → runner fails every run.

## Fix mode 4 — /pr-self-review HIGH + MEDIUM (user: "Так, давай виправимо HIGH разом із MEDIUM зауваження", 2026-10-15)
Gap ids: H-UI1, H-BE1, M-UI1…M-UI10, M-BE1…M-BE5 (details in `.pr-self-review.json` and the brief to the implementer). Main-session rulings for H-BE1 / M-BE1 / M-BE4: one DevDigest agent per repo (the workflow file and branch are per repo) — installing a different agent on a repo that already has an installation is refused with a clear error offering Update/Remove; every export commit deletes stale `.devdigest/agents/*.yaml` and `.devdigest/skills/*.md` not in the new file set; run dedupe scoped by workspace (schema change → main session generates migration 0029); ingest cursor moves to the run's `updated_at` (re-runs advance it) while AC-50's "no artifact → not re-fetched" still holds. The one-agent-per-repo rule is user-visible → recorded in the spec's Edge cases afterwards.
Implementer report (fix mode 4): all 17 gaps done. H-UI1 refresh invalidates only when `recorded > 0`, not awaited, no window-focus refetch. H-BE1 contract `CommitFilesPayload.prune?: CommitPruneRule[]` + `CiInstallErrorCode 'repo_has_other_agent'` (server shared → client mirror → agent-runner rebuilt, dist diff = the enum entry + header `a8b5fa9d…`); `octokit.ts` `staleBlobs` adds `sha: null` for stale direct children of `.devdigest/agents/` and `.devdigest/skills/` (fixed `PRUNE_RULES`); `CiRepository.findOtherAgentInstallation`; 409 refusal shown in the Install step without the zip fallback. M-BE1 dedupe index adds `workspace_id`; M-BE2 `selectDistinctOn` + `(ci_installation_id, ran_at)` index; M-BE3 `AbortSignal.timeout` on the artifact fetch; M-BE4 contract `WorkflowRunMeta.updated_at`, `listWorkflowRuns({perPage, page?, createdSince?})`, a run is handled iff `completed` and `updated_at` > cursor (or no cursor) — **deviation**: the brief's "or unrecorded" clause dropped (it would re-fetch no-artifact runs forever, against AC-50); ingest paginates up to `MAX_RUN_PAGES = 3` (300 runs, an `errors` entry when hit) → **AC-58 wording ("at most 100") needs amending**; M-BE5 bundle default via `import.meta.url`. Client M-UI1…10 as briefed (`useInfiniteQuery`, range key in query key, next-intl `useFormatter`, `onExport` removed, `CiExportRequest` moved to ExportWizard, deferred revoke, styles without spread, `radiogroup`/`radio` cards, unused style removed). Checks: server typecheck ✅, unit 1040 ✅, ci `.it` 44 ✅; client typecheck ✅, 681 ✅; agent-runner 37 ✅ + build.
Main session: `pnpm db:generate` → `0029_kind_phalanx.sql` (DROP + CREATE of `ci_runs_run_attempt_idx` with `workspace_id` and `ci_runs_installation_idx` on `(ci_installation_id, ran_at)` — indexes only); `db:migrate` ✅ (indexdefs confirmed); full server `.it` ✅ 39 files / 366. Checkpoint `refs/checkpoints/plan40-fix4`.
Spec follow-ups: one-agent-per-repo edge case; AC-58 cap (100 → paginated, 300 per refresh).

## Review → security-reviewer, delta 4 (fix3..fix4)
Verdict: **PASS**, no findings. Prune deletes only direct-child blobs of `.devdigest/agents/` and `.devdigest/skills/` (fixed `PRUNE_RULES`, non-recursive `getTree`, entry names cannot contain `/`, subtrees/submodules skipped, a symlink entry is removed itself, never followed); no request field reaches `prune`. Artifact fetch now has a real cancel. Ingest paging bounded (3 × 100, 30 days, route 20/min). `findOtherAgentInstallation` and `recordedAttempts` workspace-scoped. Bundle path never from a request; header + sha256 still verified.

## Review → architecture-reviewer, delta (impl..fix4)
Verdict: **PASS**, no findings; F1 resolved (`MockRunnerBundleSource`). New port surface contract-first and identical in both shared copies for the touched blocks; `drizzle-orm`/`db/schema` still only in `ci/repository.ts`; env still read only in `config.ts`; migration 0029 generated (indexes only); CiTab ↔ ExportWizard cycle gone; scope fence intact. Stale-exception notes (onion skill line numbers, layer-map has no `agent-runner/` row) remain doc follow-ups.

## /pr-self-review re-run (after fix mode 4, spec re-approved)
Gates: typecheck ✅ ×4; tests ✅ reviewer-core 225, agent-runner 37 (bundle fresh), client 681; server 1406/1406 on re-run (first run: the known `context-helpers.test.ts` < 50 ms flake). Contract drift: none new. Analyzer (delta fix3..fix4): 0 critical, 0 high, 4 medium; all 17 earlier findings confirmed fixed except artifact cursor (partly).
- main-session fix: SR2-1 — `server/src/adapters/github/octokit.ts` (S3 Files) `listWorkflowRuns`: the `created>=` qualifier now has second precision (milliseconds stripped; GitHub documents seconds only). New test in `github-ci-adapter.test.ts` (+ `actions` mock); break check: changing the replacement fails it, restored → 16/16 ✅; server typecheck ✅.
Open MEDIUM (follow-ups, not blocking): SR2-2 when the 300-run cap is hit the cursor still advances past the unread older runs (`ci/service.ts:378`); SR2-3 one-agent-per-repo is workspace-scoped and not DB-enforced (a second workspace exporting to the same repo prunes the first's manifest; two concurrent installs can both pass); SR2-4 `CiRunRow` reads the time zone at module scope (latent SSR hydration mismatch; rows are client-fetched today).

## Fix mode 5 — install error UX (user: "так, давай покращимо повідомлення", 2026-10-15)
From the user's manual test (L1): (UX-1) `foreign_commits` refusal doesn't say which commit blocks or what to do — seen on `korzunss/dev-digest`, a stale `devdigest/ci` from 2026-07-08 (`be3b4eb`, author burnjohn, no trailer, 207 behind main); (UX-2) `missing_workflow_permission` is shown twice (Install-step block + toast), and the inline text is vaguer than the toast.
Implementer report (fix mode 5): UX-1 — port data `CommitAhead { sha, message, author?, date? }` (server shared → client mirror; agent-runner doesn't bundle adapters.ts), `listCommitsAhead` returns it; `foreign_commits` `details` = `{truncated, sha(7), author, date, subject(≤72), ahead_count, branch_url}` with the URL built from the repo row; Install step renders it as text nodes (https-only link), falls back to the generic text on malformed details; sentinel → "more than 100 commits". UX-2 — inline copy with links to github.com/settings/tokens and `/settings/api-keys`; `useCiInstall` sets `meta.inlineErrorCodes`, the global `MutationCache.onError` calls new `shouldToastMutationError(err, meta)`. Tests: `ci-export.it` (+ sentinel), `ExportWizard.test.tsx` +4. Checks: server typecheck ✅, unit 1041 ✅, `ci-export.it` 23 ✅; client typecheck ✅, 685 ✅.
**Plan change pending user approval:** `client/src/lib/providers.tsx` (global mutation-error toast, ~8 lines) is in no step's Files — needed to suppress the duplicate toast for inline install errors.

## Review → security-reviewer, delta 5 (fix4..fix5)
Verdict: **PASS**, no findings. `t.rich` placeholders are inserted as values, never re-parsed (ICU/tags come only from `ci.json`); `branch_url` from the repo row, https-only render; no secret in `details`; `shouldToastMutationError` only suppresses the two inline codes of `useCiInstall`.
- main-session fix: SEC5-H — `server/src/modules/ci/service.ts` (S12 Files) `foreignDetails`: strip bidi controls (U+202A–202E, U+2066–2069) from commit subject/author, cap author at 64 and date at 40 chars (optional hardening from the review). `ci-export.it.test.ts` foreign-commit case now feeds bidi characters and an 88-char author and asserts the cleaned values. Server typecheck ✅; `ci-export.it` 23/23 ✅.

## /pr-self-review re-run 2 (after fix mode 5)
Gates: typecheck ✅ ×4; tests ✅ reviewer-core 225, agent-runner 37 (bundle fresh), client 685, server 1408 (second run; first hit the known `context-helpers` timing flake). Analyzer (delta fix4..now): 0 critical, 0 high, 2 medium, 4 low — all fixed by the main session:
- main-session fix: SR3 — `server/src/modules/ci/service.ts` (S12): the bidi regex had been written with **raw invisible bidi code points** (Trojan-Source pattern) — now ASCII `\uXXXX` escapes in a named `BIDI_CONTROLS` (adds U+061C, U+200E, U+200F); `truncated` = any sentinel in the list, `ahead_count` excludes the sentinel; `date` sent only when ISO-8601 UTC; the `refOf` JSDoc moved back onto `refOf`. Scan of every changed file: no raw bidi characters. `ci-export.it.test.ts` +1 (real foreign commit before the sentinel, non-ISO date) and RLM in the author case.
- main-session fix: SR3-client — `ExportWizard/helpers.ts` `aheadCount` accepts only non-negative integers; `InstallStep.tsx` internal `/settings/api-keys` link via `next/link`.
Checks after the fixes: client typecheck ✅, full 685 ✅; server typecheck ✅, `pnpm test` 1409/1409 ✅; agent-runner bundle fresh.

## Live acceptance (L1/P6) and sign-off — 2026-10-15
Manual check by the user on `korzunss/dev-digest` (DevDigest on :3200/:3201 of this worktree):
- Seen working: wizard Target → Preview → Configure → Install; `foreign_commits` refusal on a stale pre-existing `devdigest/ci` (be3b4eb, 2026-07-08, no trailer) → user deleted the branch; `missing_workflow_permission` on a token without the workflow permission → user fixed the token; export PR **#30 "Add DevDigest CI review" opened and merged**; `.github/workflows/devdigest-review.yml` present on `main` (GitHub API).
- **Not verified live** (accepted by the user's sign-off): no `devdigest-review` workflow run yet (GitHub API: `total_count 0`) — so B6–B10 (review posted on a test PR, no secret in logs/artifact, CI Runs ingest with repo/PR/SHA/job link), C (Fail CI on CRITICAL + required check), D1/D2/D6 (fork PR skip, base-SHA `.devdigest`, model-failure exit 1) are covered only by unit/`.it` tests; fine-grained-token behaviour and per-attempt artifacts (research "not established") unverified live; R3 (no `plan-approved` checkpoint) and R4 (no Proof table) not provable; P5 workflow-eval flake is pre-existing (HEAD baseline 1/5).
- Open follow-ups (not in this plan): SR2-2 cursor on the 300-run cap; SR2-3 one-agent-per-repo not cross-workspace / not DB-enforced; SR2-4 module-scope time zone in `CiRunRow`; flaky `server/test/context-helpers.test.ts` (< 50 ms budget under `pnpm test` load, fails on base too); runner support for OpenAI/Anthropic (spec Non-goal); migration-number clash with the parallel `l07-multi-agents-review` worktree (both carry `0028_*`) to resolve at merge.
Result: plan-verifier **complete — needs sign-off**; the user accepted the listed items · user "так, я запушив ci у гіт. Можна закривати фічу". Status → done.
- main session, wrap-up: `engineering-insights` — server/INSIGHTS.md +4, root INSIGHTS.md +3 (raw bidi chars that slipped into the new root entry replaced with escapes), server/insights/gotchas.md +4 items (reconciled 2026-10-15). `pnpm eval:workflow` after the gotchas edit: 8/9 — the one failure is the same pre-existing "server task … gotchas.md not read" case (HEAD baseline 1/5).
- main session, merge of `origin/L07` (6ffbddb, multi-agent review PR #31), user "коміт, agent-runner — варіант A": renumbered plan 40 → 41 and SPEC-13 → SPEC-14 (cross-links updated); migrations `0028_romantic_vargas` + `0029_kind_phalanx` dropped and regenerated as one `0031_dry_vision.sql` on top of L07's 0028–0030 (`prevId` = 0030's `id`; snapshot diff touches only `ci_installations`, `ci_runs`); `agent-runner/` kept as this plan's npm/esbuild package — the lab ncc/pnpm runner files that came with L07 removed (option A), `.gitignore` no longer ignores `dist/`; `nav.ts` GLOBAL group holds both "Multi-Agent Review" and "CI Runs"; bundle rebuilt (reviewer-core changed in L07) → `sha256:257484b3…`. Conflicts: 15 files / 49 hunks.
- main session fix: MERGE-1 (plan change, user "так"): after the merge, Multi-Agent Review's `lastDoneRunsPerAgent` (`server/src/modules/reviews/repository/multi-agent.repo.ts`) sampled CI runs (`source='ci'`, `status='done'`) into its duration/cost estimates — against AC-69. Added `eq(t.agentRuns.source, 'local')` + `server/test/ci-run-isolation.it.test.ts` "multi-agent estimates sample local done runs only…" (fails without the filter: 1 failed / 2 passed; file restored by checksum). `ci-run-isolation` + `multi-agent*` 57/57 ✅, server typecheck ✅.
- main session, post-merge checks (13:10Z, before MERGE-1): typecheck ✅ reviewer-core, agent-runner, e2e, server, client; tests ✅ reviewer-core 225, agent-runner 37, client 754, server unit 1068, server `.it` 398 (clean testcontainers DB → the whole 0000–0031 chain applies); `bash scripts/verify-l06.sh` ✅. `pnpm eval:workflow` 7/9: "server task … gotchas.md not read" (known base flake) and "API-route task" (a sandbox-leak false failure from the MERGE-1 edits made during the run; re-run alone ✅). /pr-self-review delta (merge resolution + MERGE-1, 14 code files, comments/nav/barrel/one filter + test): 0 findings → PASS re-stamped.
