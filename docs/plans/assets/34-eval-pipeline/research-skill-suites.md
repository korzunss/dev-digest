# Repo research — skill suites on top of the plan-34 eval pipeline (AC-81…AC-95)

Researcher report (repo mode, read-only), 2026-10-12, saved by the main session.
Spec: `specs/011-eval-pipeline.md` (amendment AC-81…AC-95). Prior research: `research.md` (cited as "research.md Qn").
Insights that bear on it: server "`db:generate` hangs when a table drops and adds a column" (2026-09-22),
"Drizzle `text(enum)` has no SQL constraint" (2026-09-21), "an FK column carries no index" (2026-09-18/27),
"id-less bodyless POST that spends money" (2026-10-12), the `--custom` data-migration entry (2026-09-30).

## Answer

- **Owner (Q1):** add a nullable `skill_id` FK (cascade) to `eval_suite_cases`, make `agent_id` nullable, an XOR CHECK, and a unique `(skill_id,name)`. Skill suites need no run table and no results table (AC-88), so `eval_suite_runs` and `eval_case_results` stay agent-only.
- **Runner (Q2):** a fixed-prompt, one-skill, picked-model run works through the existing `reviewPullRequest` via a synthetic `EvalAgentSnapshot` passed to `runCase`; `reviewer-core` does not change.
- **Guard (Q3):** today an in-memory `Set<agentId>` + DB `hasRunning` on `eval_suite_runs`. For skills only a second in-memory set works (no run row).
- **Contracts (Q8):** `EvalCaseResult`, `EvalSuiteCase` and the draft contracts are agent-shaped; a skill result without `agent_version` is silently dropped to `null` by `parseResult` (`pipeline-views.ts:81-84`) — the contract must change.

Confidence: high on structure and flow; medium on migration generation (`pnpm db:generate` not run).

## Q1 Data model
1. `eval_suite_cases.agent_id` NOT NULL, FK `agents` ON DELETE CASCADE — `server/src/db/schema/eval.ts:75-77`.
2. Case indexes — `schema/eval.ts:90-97`: unique `eval_suite_cases_agent_name_idx (agent_id,name)`, unique `…_source_finding_idx`, `…_source_pr_idx`.
3. `eval_suite_runs` keys on `agent_id` (NOT NULL, cascade) with `agent_version`, `provider`, `model`, `skills` jsonb — `schema/eval.ts:104-131`.
4. `eval_case_results`: `suite_run_id` FK cascade, `case_id` nullable FK cascade — no change needed (`schema/eval.ts:134-148`).
5. XOR precedent `eval_cases.owner_kind` + `owner_id` has no FK and no CHECK; only `'agent'` written (`modules/eval/repository.ts:180`).
6. No CHECK and no partial index anywhere in schema/migrations. `drizzle-orm ^0.38.3` ships `check()`; `drizzle-kit ^0.30.1`.
7. Repo queries filtering on `agent_id` — `pipeline.repo.ts`: `listCases:70-77`, `caseNames:100-105`, `countCases:107-113`, `listRuns:223-236`, `hasRunning:259-266`, `latestRunsByAgent:239-246`. `getCase`/`updateCase`/`deleteCase`/`setLastResult` filter by workspace+id only.
8. Service sites assuming non-null `agentId`: `pipeline-service.ts:289` (updateCase → caseNames), `:356` (runSavedCase → snapshot), `pipeline-views.ts:137` (toCaseDto). Test helper `test/helpers/eval-pipeline-env.ts:109-111`.
9. Dashboard/trend/compare read only `eval_suite_runs` — untouched if skill suites write no runs.
10. Migration: add-column + DROP NOT NULL is an alter, not drop+add → no expected hang (not run). `skill_id` needs an index (the unique `(skill_id,name)` serves). XOR needs `check()` or hand SQL in a `--custom` stub only.
11. Alternative separate `eval_skill_cases` table: cleaner constraints, but duplicates repo/DTO/validation/save path. Recommended: nullable column.

## Q2 Runner
1. Runner sends only prompt, model, diff, llm, strategy, skills — `pipeline-runner.ts:42-53`; repo context off by construction.
2. Snapshot built in service — `pipeline-service.ts:100-118` (`skillsFor`, enabled only); rendering `renderSkillBlock` (`platform/container.ts:268-274`, `skills/helpers.ts:82`).
3. `reviewer-core` accepts free-form `systemPrompt` and `skills?: string[]`, appends only `INJECTION_GUARD` — `reviewer-core/src/review/run.ts:60,70,335-336`, `prompt.ts:161`.
4. Synthetic snapshot: harness constant prompt, `rendered=[renderSkillBlock(name, body)]`, `skills=[{id,name,version}]`, strategy (open choice), provider/model from picker → `runCase` unchanged. Renders even a disabled skill (AC-93).
5. `EvalCaseResult.agent_version` hard-coded from `snapshot.version` (`pipeline-runner.ts:33-38`) → add `skill_version` and `model`.
6. Key check `providerFor` → `AppError('no_api_key', 422)` before anything is created (`pipeline-service.ts:121-130`), reusable.

## Q3 Guard and lifecycle
1. One run per agent: in-memory `inFlight` set + `repo.hasRunning` → `run_in_progress` 409 (`pipeline-service.ts:84, 390-423`).
2. Boot reaper marks `running` suite runs failed (`pipeline.repo.ts:268-277`, `app.ts:87-95`).
3. Skill suite: separate in-memory `Set<skillId>` (AC-89: skill and agent runs don't block each other); single-process assumption as today. Progress (AC-89) has no row → in-memory counter + poll endpoint, or derive from `last_result.ran_at`. Plan decision.
4. Single saved-case run writes `last_result` via `setLastResult` (no run row); draft run persists nothing, returns `{result, run_token}` (in-memory, TTL 1 h, hash of diff+expected+agentId+version+skills); save attaches `last_result` only on equal hash (`pipeline-service.ts:235-246, 324-364`).
5. `EvalCaseResult` (`vendor/shared/contracts/eval-pipeline.ts:84-100`) has no model and no skill version; `agent_version` required.
6. Editing a case clears `last_result` (`pipeline.repo.ts:131-139`); skill body saves touch no cases (`skills/repository.ts:112-137`) → AC-95 holds automatically.

## Q4 Skills module
1. `skills` (workspace cascade, `enabled` default true, `version`), `skill_versions` PK (skill_id, version) — `schema/skills.ts:14-58`. No unique (workspace_id, name).
2. Non-manual sources land `enabled=false` (`skills/service.ts:126-135`).
3. Only a body change bumps version (`skills/repository.ts:112-137`).
4. Delete is a bare FK cascade (`skills/service.ts:117-119`, `repository.ts:79-87`, `routes.ts:127-132`) → AC-94 via `skill_id … ON DELETE CASCADE`.
5. `agent_skills(agent_id, skill_id, order)`, both cascade, `agent_skills_skill_idx` (`schema/agents.ts:60-76`).
6. `agentsUsingSkill` returns only `{id,name}` (`skills/repository.ts:208-221`) → new port query with `enabled, provider, model` + case count; eval must not import the skills module (`types.ts:9-12`).
7. An agent's suite snapshot keeps only enabled skills (`agents/repository.ts:216-224`, `pipeline-service.ts:106`) → "Run on evals" for a disabled skill tests agents without it (spec edge case ~line 633).

## Q5 "Run all agents" with an agent filter
1. `runAllPreview`/`runAll` (`pipeline-service.ts:496-537`) loop `agents.listAll`, skip disabled / 0 cases; `run_in_progress` and `no_api_key` → skipped; other errors abort mid-way. Only `workspaceId` parameter.
2. Routes `GET|POST /eval/run-all`, body `{confirm:true}`, rate-limited 10/min (`eval/routes.ts:177-190`).
3. Client `RunAllButton.tsx`, `useRunAllPreview(open)`, `useRunAllAgents` (`lib/hooks/eval.ts:158-177`); `ConfirmBody`/`SkippedList` are file-private.
4. Reuse: optional `skill_id` filter on preview/run (or dedicated `/skills/:id/eval-run-agents` routes); reuse `EvalRunAllPreview`/`EvalRunAllResult`; extract the confirm components; keep the required JSON body.

## Q6 Model picker
1. Providers hard-coded twice in the client (`ConfigTab/constants.ts:4`, `CreateAgentModal/constants.ts:8`).
2. `GET /providers/:id/models` → `[]` on any error incl. missing key (`agents/routes.ts:194-197`, `service.ts:345-352`); hook `useProviderModels` (`lib/hooks/agents.ts:85-93`).
3. Key presence `GET /settings/secrets-status`, hook `useSecretsStatus()` (`settings/routes.ts:43-51`, `lib/hooks/core.ts:57-63`).
4. `feature-models.ts` is not a picker source.
5. No standalone ModelPicker; compose provider `SelectInput` + `SearchableSelect` over `toModelOptions(...)` as in `ConfigTab.tsx:41-46,93-108`, `lib/model-label.ts`.

## Q7 Client
1. Skill `EvalsTab.tsx:1-14` is an `EmptyState` placeholder taking `{skill}`.
2. Tab `evals` already routed (`SkillEditor/constants.ts`, `SkillEditor.tsx`, `skills/[id]/page.tsx:34-42`) — no routing change.
3. "Run on evals" is a disabled header `Button` in `skills/[id]/page.tsx:92-105`.
4. Agent `EvalsTab` is agent-specific at the top level (hooks by agent id, metric cards, dashboard link); toolbar/list/confirm flow structurally reusable.
5. `CaseRow` (owner-agnostic; needs "ran on vN"), `StatCard` generic, `RunConfirm` generic but a skill needs a model-picker confirm. EvalsTab dir currently has uncommitted UI5–UI9 work.
6. `EvalCaseModal` is bound to an agent (`agentId` prop, `useAgent`, agent-keyed hooks, `RunConfirmModal model=agent.model`, `evalsTabHref`); tabs, `ExpectedOutputEditor`, `CaseInputTabs`, helpers are owner-agnostic.
7. Hooks (`lib/hooks/eval.ts:44-199`): list/save/draft-run/start keyed by agent; update/delete/run-case use `/eval-cases/:id` but take `agentId` for invalidation. Skill versions needed.

## Q8 Contracts and routes
1. The two `contracts/eval-pipeline.ts` copies are byte-identical today; edit server first, sync client.
2. Needs: `EvalSuiteCase.agent_id` nullable + `skill_id`; `EvalCaseResult.agent_version` optional + `skill_version` + `model`; `EvalCaseSaveBody`/`EvalDraftRunBody` need provider+model for skills; `EvalDraft` seed is finding/agent-only; `EvalRunAllPreview`/`Result` reusable. `parseResult` returns `null` on parse failure → silent "never run".
3. Routes today: `GET/POST /agents/:id/eval-cases`; `PUT/DELETE /eval-cases/:id`; `POST /eval-cases/:id/runs`; `GET /findings/:id/eval-draft`; `POST /agents/:id/eval-draft-runs`; `POST /agents/:id/eval-runs`; `GET /agents/:id/eval`; `GET /eval-runs/compare`; `GET /eval-runs/:id`; `POST /eval-runs/:id/promote`; `GET /eval/dashboard`; `GET|POST /eval/run-all`. Paid/writing routes `RATE_LIMIT` 10/min; header comment lists routes.
4. Skill routes by the sibling pattern: `GET/POST /skills/:id/eval-cases`, `POST /skills/:id/eval-draft-runs`, `POST /skills/:id/eval-runs` (`{confirm:true, provider, model}`), a progress GET; `POST /eval-cases/:id/runs` needs a model in the body for skill cases.

## Consequences
- Files: `schema/eval.ts` + generated migration; both `contracts/eval-pipeline.ts`; `pipeline-service.ts` (owner branches), `pipeline.repo.ts`, `eval/routes.ts`, an agents-by-skill port wired in `platform/container.ts:254-300`; client hooks, `EvalCaseModal`, a new skill `EvalsTab`, the page header button.
- Never hand-edit migrations; if `check()` is not emitted, a `--custom` stub generated before the schema edit.
- Uniqueness trap: nullable `agent_id` makes `(agent_id,name)` NULL-distinct → add unique `(skill_id,name)`.
- `.it` tests that insert `evalSuiteCases` directly (`eval-pipeline-boundary.it.test.ts:72`) survive NOT NULL → nullable.
- Every new paid POST: `RATE_LIMIT` + required JSON body.

## Not established
- Whether `pnpm db:generate` (drizzle-kit 0.30.x) emits `CHECK` from `check()` and a clean NOT NULL → NULL alter.
- Fixed harness prompt text and `strategy` for skill runs (design decision).
- AC-89 progress storage (in-memory vs derived); multi-process deployment.
- Existing `runAll`/`EvalCaseModal` tests to extend (not opened beyond grep).
- Client i18n keys for the skill tab beyond `evals.run`, `evals.runDisabledTitle`, `evals.empty.*`.
