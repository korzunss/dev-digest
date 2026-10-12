# Repo research — plan 34 (SPEC-11 Eval Pipeline)

Researcher run, 2026-10-12, repo mode, questions Q1–Q8 set by the main session.
Facts carry file:line evidence; *inference* marks the researcher's reading.

## Q1. Invoking `reviewPullRequest` without a persisted PR

- There is **no** `server/src/modules/reviews/adhoc.ts`. The no-PR precedent is
  `server/src/modules/eval/replay.ts` (called by `replay-cli.ts`).
- `replay.ts:230-250` calls the injected `reviewPullRequest` with only: `systemPrompt`,
  `model`, `diff` (synthetic `UnifiedDiff`), `llm`, `strategy`, `skills` (rendered strings,
  only when non-empty), `prDescription`, `task`, `countTokens`, `estimateCost`; call options
  `callDeadlineMs`, `maxOutputTokens`, `routing`, `retryRouting`, `maxSkippedChunkFraction`;
  `requireParameters: true`.
- `replay.ts:204-207` builds the synthetic `subDiff` as `{files, raw}`, `raw` from
  reviewer-core's exported `sliceDiff`. No DB row needed.
- `run-executor.ts:296-345` is the production call; each slot added as
  `...(x ? { x } : {})`: `callers` (repo-intel, 266-268), `repoMap` (273), `specs` (project
  context via `buildContextDocs`, 289), `intent` (321), `repoRules`/`changedFiles`
  (324-325). `memory` is never passed by the executor; reviewer-core fills it only when
  `repoRules`/`changedFiles` is set (`run.ts:320-332`). Every slot is optional in
  `ReviewInput` (`reviewer-core/src/review/run.ts:58-156`).
- *Inference:* an eval run passes `systemPrompt`, `model`, `diff`, `llm`, `strategy`,
  `skills` and omits everything else. Conventions/blast are not wired into
  `reviewPullRequest` (unchecked in the executor).
- Skills at run time: `agentsRepo.linkedSkills(agentId)` filtered to `skill.enabled`,
  rendered with `renderSkillBlock(name, body)` (`run-executor.ts:481-510`;
  `replay-cli.ts:104-115`).
- Cost/tokens from `ReviewOutcome` (`run.ts:170-199`): `tokensIn`, `tokensOut`, `costUsd`
  (`number | null`, null if any chunk unpriced — `addUsage`, `run.ts:237-246`),
  `costSource`. No duration/model field: the executor times the call
  (`run-executor.ts:239, 369`) and uses `agent.model`.
- LLM from `container.llm(agent.provider)` (`run-executor.ts:250-254`), cached; throws
  `ConfigError` when the key is missing (`platform/container.ts:300-330`).
- `task` line from `taskLine(pull)` (`reviews/helpers.ts:82`) needs a `PullRow`; `task` is
  optional, so a hand-written case uses a custom or no task line.

## Q2. Grounding results

- `ReviewOutcome` exposes `review.findings` (kept), `dropped: {finding, reason}[]`,
  `grounding` (string `"k/n passed"`), `skipped`.
- `run.ts:484-502` runs `groundFindings`, then the scope filter only if `input.intent` is
  set; `run.ts:514-526` returns `findings: finalFindings`, `dropped: ground.dropped`.
- *Inference:* with no `intent` (eval run), `review.findings` is exactly the kept set, so
  citation accuracy = `findings.length / (findings.length + dropped.length)`.
- The executor persists only kept findings plus the `"x/y passed"` string in `agent_runs`;
  dropped findings are not persisted (`run-executor.ts:348-362, 376-391`).
- reviewer-core public exports (`index.ts`) include `groundFindings`, `groundingSummary`,
  `GroundingResult`, `sliceDiff`. `buildLineIndex` is **not** exported (`grounding.ts:24`).
- *Inference:* AC-25 can reuse `groundFindings` on synthetic findings built from the
  expectations against `parseUnifiedDiff(diff)`; `dropped[].reason` already says "file not
  present in diff" / "lines … do not intersect any diff hunk" (`grounding.ts:61-79`).
- `groundFindings` uses new-side lines incl. context lines; tolerates reversed ranges via
  min/max; findings with `kind` in `secret_leak`, `lethal_trifecta`, `phantom`, `hook`
  ground on file presence only. AC-38 matching can use the same min/max semantics.
- `server/src/platform/grounding.ts` is a re-export shim.

## Q3. Hunks of one file for a finding

- The reviewed diff is not persisted; `loadDiff` (`reviews/diff-loader.ts:29-104`)
  re-derives it: `git.diffCommits(repoRef, baseSha, headSha, signal)` when `pull.baseSha`
  is set (`GitClient` port, `vendor/shared/adapters.ts:330`, impl
  `adapters/git/simple-git.ts`), fallback `diffFromPrFiles(prFiles)`, legacy no-baseSha
  fallback `git.diff(base branch, head)`.
- `diffFromPrFiles` (`diff-loader.ts:103-114`) wraps each `pr_files.patch` with synthetic
  `diff --git` / `---` / `+++` lines: `pr_files.patch` is hunks-only (`octokit.ts:116`).
- `parseUnifiedDiff` (`adapters/git/diff-parser.ts:14-83`) creates a file only on
  `diff --git` or `+++ `; a hunks-only paste parses to zero files. Returns `{raw, files}`;
  each hunk has `newLineNumbers`; a file with no `@@` gets `hunks: []`, so the AC-24
  "≥1 hunk" check is the caller's.
- `sliceDiff(diff, path)` (`reviewer-core/src/review/reduce.ts:78-92`) matches loosely and
  falls back to header-only or whole `raw` — prefer slicing by parsed files/hunks.
- `pr_files.patch` is refreshed on PR detail GET with a working forge token
  (`pulls/routes.ts:225-250`); null for binary/huge files.
- Seed inserts `pr_files` with no `patch` (`db/seed.ts:125-132`); seed PR has
  `headSha 'a1b2c3d4e5f6'`, no `baseSha` → AC-14 refuses seeded demo findings. Only
  forge-imported/synced PRs give real patches (`octokit.ts:105` sets `base_sha`).
- `MockGitClient.diff` returns a canned `src/config.ts` diff (`adapters/mocks.ts:~341`).

## Q4. Agents, versions, skills

- `agents` (`db/schema/agents.ts:15-47`): `provider`, `model`, `systemPrompt`,
  `outputSchema`, `strategy`, `ciFailOn`, `repoIntel`, `enabled`, `version` (int, default 1).
- `agent_versions`: PK (`agent_id`, `version`), `config_json`, `created_at`, cascade.
  `snapshotVersion` (`agents/repository.ts:172-191`) stores provider, model,
  system_prompt, output_schema, strategy, ci_fail_on, repo_intel, `skills` (skill **ids**
  only, no versions). Contract `AgentVersionConfig` (server
  `vendor/shared/contracts/knowledge.ts:504-514`), missing from the client copy.
- Bump in `AgentsRepository.update` (`repository.ts:135-170`) when `isConfigChange`
  (`agents/helpers.ts:61-86`: name, description, provider, model, systemPrompt, strategy,
  ciFailOn, repoIntel changes, or `outputSchema !== undefined`) or `opts.bumpVersion`.
  Toggling `enabled` does not bump. `lockById` gives `FOR UPDATE` inside `transaction()`.
- Skills attach via `agent_skills` (`agentId`, `skillId`, `order`); `setSkills`/`linkSkill`
  do **not** bump the agent version (`agents/service.ts:204-214, 261-274`); only
  `syncBuiltin` forces a bump.
- Skills versioned in `skills.version` + `skill_versions` (`skillId`, `version`, `body`,
  `message`) (`db/schema/skills.ts`, `skills/repository.ts:100-150`). At run time a skill
  resolves to the **latest** body (`linkedSkills` reads `skills.body`,
  `agents/repository.ts:216-224`); no pinning; `enabled = false` excludes it.
- *Inference:* AC-75 records `{name, version}` from `linkedSkills(agentId)` (enabled) at
  run start.

## Q5. `PUT /agents/:id` and Promote

- `PUT /agents/:id` (`agents/routes.ts:111-120`) takes `UpdateAgentBody` (all optional) →
  `service.update` (`service.ts:96-114`) → `repo.update`.
- `GET /agents/:id/versions/:version` exists (`routes.ts:136-145`), returns
  `AgentVersion.config` via `AgentVersionConfig.parse`.
- *Inference:* Promote = a service call copying provider, model, system_prompt, strategy,
  ci_fail_on, repo_intel from the stored config. Caveats: equal config → no new version
  (AC-54 already excludes promoting the current version); passing `output_schema` (even
  null) always bumps — omit unless different; `config.skills` is not restored by
  `update` (would need `setSkills`, no bump) — a decision. Do it in `repo.transaction`
  with `lockById`, like `syncBuiltin` (`service.ts:223-257`). `agent_versions` insert uses
  `onConflictDoNothing`.

## Q6. `eval_cases` / `eval_runs` and the `Eval*` contracts

- Schema (`db/schema/eval.ts`): `eval_cases` (id, workspace_id FK, owner_kind
  'skill'|'agent', owner_id uuid **no FK**, name, input_diff, input_files, input_meta,
  expected_output, notes; unique `eval_cases_owner_name_idx` on workspace_id, owner_kind,
  owner_id, name). `eval_runs` (id, case_id FK cascade, ran_at, actual_output, pass,
  recall, precision, citation_accuracy, duration_ms, cost_usd; no version/model/grouping;
  no index on case_id). Latest migration `0023_normalise_context_paths.sql`.
- Only writers: `modules/eval/repository.ts` `upsertEvalCase` (`ownerKind: 'agent'`,
  conflict on the unique key) and `insertEvalRun`, called only from
  `EvalService.scoreReviewFixture` (one transaction).
- CLI shapes: case `name = fixture.id`, `input_diff` null, `input_meta {repo, pr,
  head_sha}`, `expected_output` an **object** `{lane, issues, acceptable_extras,
  line_tolerance}`; run row `pass: null` + metrics, one row per (round, agent).
- No HTTP routes for eval; `modules/index.ts` registers no eval module.
- Other consumers: `server/test/eval.it.test.ts` (CLI path), `eval-cases-dedupe.it.test.ts`
  (migration 0020), `contracts.test.ts:138-170` (parses `EvalRun`), eval-helpers /
  eval-fixture / eval-replay / eval-replay-cli tests.
- Contracts: server `knowledge.ts:28-63` (`EvalPerTrace`, `EvalRun`, `EvalOwnerKind`,
  `EvalCase`), `eval-ci.ts:16-89` (`EvalCaseInput`, `EvalRunRecord`, `EvalRunResult`,
  `EvalTrendPoint`, `EvalDashboard`). `EvalRun`/`EvalTrendPoint` metrics non-nullable;
  `EvalRunRecord` nullable; no version field.
- The two `vendor/shared` copies differ elsewhere (`knowledge.ts` 346-347, 461-466,
  498-522 — `AgentVersionConfig`/`AgentVersion` server-only; `eval-ci.ts` line-3 import,
  `AgentManifest` 144-172, a provider enum ~249; `productionize.ts:36`; `adapters.ts`,
  `platform.ts`, `trace.ts`) but the Eval regions are byte-identical today.
  *Inference:* AC-62 #7 byte-equality must compare extracted eval blocks or a new
  dedicated file (e.g. `contracts/eval.ts`); compare/promote UI needs `AgentVersionConfig`
  on the client too.
- The client consumes no `Eval*` contract outside `vendor/`.
- *Inference — schema options keeping the CLI working:* (a) new `eval_suite_runs` (agent,
  version, model, skills snapshot, status, progress, errored count, totals) +
  `eval_case_results`, CLI tables untouched; (b) widen `eval_cases` with nullable columns
  and a discriminator column (more robust than jsonb shape). `owner_id` has no FK, so
  "agent deletion removes cases" needs an FK-backed column/table or explicit deletes.
  Add-only nullable columns avoid the `db:generate` drop+add hang; FK columns need their
  own index.

## Q7. Client

- `messages/en/eval.json` has `dashboard`, `caseEditor` (title "Eval case · {name}", tabs
  Diff and PR meta only — no Files tab, `validJson`/`invalidJson`, `runCase`, `save`),
  `evalsTab` (`neverRun`, `passed`, `failed`, `run`, `edit`, `delete`), `page` (crumbs) —
  old-design leftovers to extend.
- `shell.json:26` `"eval": "Eval Dashboard"`; `app-shell/helpers.ts:35` maps `/eval`.
  `NAV` in `client/src/vendor/ui/nav.ts` has **no** eval item (SKILLS LAB = agents,
  skills, conventions). Adding it edits vendor code — done before for conventions as a
  signed-off exception (`nav.ts` comments); root CLAUDE.md forbids hand edits under
  `*/src/vendor/**`. No `src/app/eval` route.
- AgentEditor: `AgentEditor/constants.ts` `TABS` = config, skills, context;
  `agents/[id]/page.tsx:14` `VALID_TABS`; `AgentEditor.tsx` switches on `tab`. Key
  `editor.tabs.evals` exists (`agents.json:53`). Icon `FlaskConical` used by SkillEditor.
- FindingCard: `pulls/[number]/_components/FindingCard/FindingCard.tsx` (117 lines);
  action row `<div style={s.actions}>` with Accept/Dismiss (~86-110), shown when
  expanded; decided state `f.accepted_at`/`f.dismissed_at` (`review-api.ts:21-26`);
  `onAction(action)` prop; `FindingRecord` carries `review_id` only, agent is on
  `ReviewRecord.agent_id`.
- No `DiffView`; there is `components/diff-viewer/DiffViewer` (`files: PrFile[]`, `PrFile`
  has `patch`) with `FileCard` — synthetic `PrFile` untested.
- `vendor/ui/kit/Modal.tsx` (`width`, `title`, `subtitle`, `onClose`, `children`,
  `footer`); `client/src/components/confirm-modal/ConfirmModal.tsx`.
- Charts: `recharts ^2.15.0`; `vendor/ui/charts` has `LineChart` (series, yMin/yMax, **no
  tooltip**), `Sparkline`, `MetricCard` (`label`, `value`, `delta`, `trend`, `suffix`),
  `BarRow`. AC-49's tooltip needs a client wrapper or new code.
- Hooks: `lib/hooks/<domain>.ts` with TanStack `useQuery`/`useMutation` + `api.*`,
  re-exported from `lib/hooks/index.ts`; polling via
  `refetchInterval: (q) => q.state.data?.generating ? 2000 : false` (`brief.ts:23`).

## Q8. Server patterns

- Rate limit: `POST /pulls/:id/review` → `config: { rateLimit: { max: 10, timeWindow:
  '1 minute' } }`; SSE routes `rateLimit: false`.
- In-flight guard: `BriefService` in-memory `Set` added before the first await
  (`brief/service.ts:96, 124-125`), returns `failure 'in_progress'`; same in
  `OnboardingService`. Reviews use DB `agent_runs.status='running'` reaped on boot
  (`app.ts:70-85`). *Inference:* in-memory `Set<agentId>` + persisted status.
- Background + polling: reviews fire-and-forget `executor.executeRuns`
  (`reviews/service.ts:131-135`) + SSE/poll; brief/onboarding = POST + polled GET view.
  `JobRunner` (`platform/jobs.ts`, p-queue concurrency 3, `jobs` table); `replay.ts:158`
  has `pool(limit, tasks)`. *Inference:* POST returns a run id at once, client polls a
  progress view; no SSE.
- Missing key: `ConfigError('<KEY> is not configured')` (`container.ts:314-329`) =
  `AppError` code `config_error`, HTTP 500 (`errors.ts:37-41`). *Inference:* resolve the
  LLM before enqueueing; per-case failure → errored (AC-32).
- Hermetic `.it`: `isolatedTestConfig()` (`test/helpers/config.ts:28`) — stub
  `overrides.secrets` since `LocalSecretsProvider` falls back to `process.env`;
  `reviews.it.test.ts:1-78` uses `buildApp`, `seed`, `MockLLMProvider`, `MockEmbedder`,
  `MockGitClient`. `MockLLMProvider` (`adapters/mocks.ts:72-132`) returns one fixed
  fixture per instance, records `calls[]`, takes `cost`/`costPerCall`. `test/helpers/
  llm-stubs.ts` has `ThrowingLLMProvider`, `DeferredLLMProvider`. *Inference:* AC-62 #3
  needs two mock instances/app builds or a scripted mock; AC-62 #2 asserts `calls.length`
  unchanged during scoring.
- No `verify:*` script in any `package.json`. `verify:l06` is new.

## Could not establish

- Which PRs in the user's dev DB carry real diff text (needs a DB query).
- Required `Finding` fields for synthetic AC-25 findings (`findings.ts` not opened).
- How `Sidebar` resolves nav labels; whether `DiffViewer`/`FileCard` render a synthetic
  `PrFile` from a pasted diff.
- `actOnFinding` (`reviews/service.ts:151`) and the finding → review → agent mapping; how
  `reviews.agent_id` behaves on agent deletion.
- Whether `JobRunner` is used for LLM work; the global rate-limit default in `app.ts`.
- Whether conventions/blast reach the prompt.
- `server/docs/architecture.md` eval sections.
