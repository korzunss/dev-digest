# Development Plan: Skill eval suites (Skill Editor Evals tab)
Status: done
Execution: multi-agent
Save as: docs/plans/35-skill-eval-suites.md
Spec: specs/011-eval-pipeline.md (AC-81–AC-95 amendment)

## Spec traceability
| Spec AC | Covered by |
|---|---|
| AC-1 | S2, S3, T4 |
| AC-7 | S2, S3, T4 |
| AC-22 | S15, T10 |
| AC-26 | S3, S4, T4, T6 |
| AC-28 | S13, S16, T9, T11 |
| AC-29 | S5, T2 |
| AC-31 | S6, T5 |
| AC-33 | S7, S15, T4, T10 |
| AC-36 | S6, S16, T5, T11 |
| AC-62 #8–10 | S10, T3, T4, T5, T15 |
| AC-79 | S6, S7, T4, T5 |
| AC-81 | S2, S6, S16, T4, T11 |
| AC-82 | S16, T11 |
| AC-83 | S14, T8 |
| AC-84 | S16, T11 |
| AC-85 | S6, S15, T4, T10 |
| AC-86 | S5, S6, T3 |
| AC-87 | S6, S13, S15, S16, T5, T9–T11 |
| AC-88 | S5, S6, T4, T5 |
| AC-89 | S6, S9, S16, T5, T11 |
| AC-90 | S6, T5, T7 |
| AC-91 | S7, S17, T5, T12 |
| AC-92 | S7, S17, T5, T12 |
| AC-93 | S6, S7, S16, S17, T4, T5, T11, T12 |
| AC-94 | S2, T4 |
| AC-95 | S6, T4 |
| Edge cases (skill), NFR, Module interactions | S6, S7, S9, T4, T5, T12 |

## Decisions needed
None open — see *Decisions recorded*. (Pass-1 review and options: *Design notes → Pass-1 review*, below the marker.)

## Decisions recorded
2026-10-12, user "так" to the pass-1 recommendations:
- TQ1–TQ4: defaults as written (provider checked against the enum, model a bounded string; default model from the first attached agent by name even if disabled; a single skill-case run may start during that skill's "Run all evals"; new result fields optional/nullable).
- GAP1 → (a): "Run on evals" is disabled for a disabled skill, with the reason "enable the skill to test it in agents"; the skill's own suite still runs (AC-93). Closed: spec 011 AC-91–AC-93 amended and re-approved 2026-10-12.
- REC1–REC4 accepted; D1–D6 option A; D7 Execution: multi-agent.
- R1 (drizzle-kit `check()` / DROP NOT NULL): no external research; verified in the first migration step, with the `--custom` stub fallback written into that step.
- REC3: client groups start only after plan 34's UI5–UI10 work is signed off and committed by the user.

## Prerequisites
- Docker for `.it` tests.
- **Before G4:** plan 34 UI5–UI10 (agent `EvalsTab/`, `eval-case-modal/`, `CompareRunsModal/`, `messages/en/eval.json`) signed off and committed by the user (REC3). G1–G3 touch none of those files.
- No new dependency.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S4 | shared contract; server schema + migration, repository, agent-path owner fixes | — | contract names, migration file + R1 outcome, `SuiteOwner` API |
| G2 | S5–S8 | server eval: helpers/ports/runner, `EvalSkillSuiteService`, Run on evals, container | G1 | service methods, `container.evalSkillSuite` |
| G3 | S9–S10 | server routes + `.it` tests; `verify-l06.sh` label | G2 | routes as built |
| G4 | S11–S13 | client i18n, hooks, `ModelPicker` — **precondition: plan 34 UI5–UI10 committed** | G3 | hook names, `ModelPicker` props |
| G5 | S14–S15 | client `eval-suite/` move, EvalCaseModal owner — **precondition: plan 34 UI5–UI10 committed** | G4 | `owner` prop, `eval-suite` exports |
| G6 | S16–S17 | client skill Evals tab, header Run on evals — **precondition: plan 34 UI5–UI10 committed** | G5 | — |

Groups run in order, never in parallel.

## Steps
Key: **E/** = `server/src/modules/eval/` · **AE/** = `client/src/app/agents/[id]/_components/AgentEditor/_components/` · **SK/** = `client/src/app/skills/[id]/` · **DN** = *Design notes* (shapes) · gotcha refs `[srv-…]`/`[cli-…]`/`[root-…]` resolve under *Gotcha links* below the marker (items of `server|client/insights/gotchas.md`, root `INSIGHTS.md`). **C-skills** = `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `security`, `react-testing-library`.

### S1 — Extend the eval-pipeline contract for skill owners  [Contract]
- **Files:** `server/src/vendor/shared/contracts/eval-pipeline.ts`, `client/src/vendor/shared/contracts/eval-pipeline.ts` (same edit), `client/src/app/repos/[repoId]/pulls/[number]/_components/TurnIntoEvalCase/TurnIntoEvalCase.tsx` (line 43 only), `server/test/eval-pipeline-contracts.test.ts` (all modify)
- **Change:** DN → Contract. In `TurnIntoEvalCase.tsx:43` open the existing case only when `res.case.agent_id` is non-null (a seed returns agent cases only).
- **Layer / why here:** contracts change in shared first, then a targeted mirror (CLAUDE.md).
- **Skills to apply:** `zod`, `typescript-expert`, `frontend-architecture` (plan change 2026-10-12, SK1: `onion-architecture` removed — S1 places nothing in server layers)
- **Practices:** Zod schemas + inferred types only, `Provider` imported from `./knowledge.js`; new result fields optional so a stored plan-34 result still parses (TQ4); copies byte-equal.
- **Known gotchas:** [root-ts2719].
- **Done when:** `cmp server/src/vendor/shared/contracts/eval-pipeline.ts client/src/vendor/shared/contracts/eval-pipeline.ts` exits 0 · `cd client && pnpm typecheck` passes · T1 green · `cd server && pnpm typecheck` errors only in `E/pipeline-service.ts`, `E/pipeline-views.ts`, `E/pipeline-runner.ts` (fixed by S4/S5).

### S2 — Add the skill owner to `eval_suite_cases`; generate and verify the migration
- **Files:** `server/src/db/schema/eval.ts` (modify); migration `server/src/db/migrations/0025_*.sql` + `meta/` (create, by command only)
- **Change:** `agentId` loses `.notNull()`; add `skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'cascade' })`; `uniqueIndex('eval_suite_cases_skill_name_idx').on(t.skillId, t.name)`; `check('eval_suite_cases_owner_check', sql\`(agent_id IS NULL) <> (skill_id IS NULL)\`)` (name: assumption). Run `cd server && pnpm db:generate`. **Verify R1:** the new SQL has `DROP NOT NULL` on `agent_id`, `ADD COLUMN "skill_id"`, the FK, the unique index and the `CHECK`, and drops nothing. **Fallback if no `CHECK`:** delete the `check()` call (leave a comment naming the stub), run `cd server && pnpm db:generate --custom`, and put only `ALTER TABLE "eval_suite_cases" ADD CONSTRAINT "eval_suite_cases_owner_check" CHECK (("agent_id" IS NULL) <> ("skill_id" IS NULL));` in that empty stub. State in the handoff which path ran.
- **Layer / why here:** DB schema; migrations are generated.
- **Skills to apply:** `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`
- **Practices:** the `(skill_id, name)` unique index leads with the FK column, so it is the FK index; a separate skill index because NULL `agent_id` rows never collide in the agent one; existing rows pass the CHECK; never `db:migrate`.
- **Known gotchas:** [srv-null-unique], [srv-fk-index], [srv-generate-hang] (add + alter here; if it hangs, stop and report), [srv-custom-stub].
- **Done when:** one new migration holds the five items (or the stub holds the CHECK) · `git status --short server/src/db/migrations` shows only added files · typecheck errors limited as in S1.

### S3 — Make the pipeline repository owner-aware
- **Files:** `E/repository/pipeline.repo.ts` (modify)
- **Change:** export `SuiteOwner = { agentId: string } | { skillId: string }`; `SuiteCaseInsert` has `agentId: string|null`, `skillId: string|null`; `listCases`, `caseNames`, `countCases` take `(workspaceId, owner)`; add `ownerOf(row): SuiteOwner`.
- **Layer / why here:** queries live in the repository.
- **Skills to apply:** `drizzle-orm-patterns`, `onion-architecture`, `typescript-expert`
- **Practices:** workspace-scoped reads; await inside, never return a builder; row types stay here.
- **Known gotchas:** [srv-row-type].
- **Done when:** `.claude/skills/onion-architecture/scripts/check-module.sh eval` adds no hit · typecheck errors only at S4 call sites.

### S4 — Keep the agent path correct with nullable owners
- **Files:** `E/pipeline-service.ts`, `E/pipeline-views.ts`, `server/test/eval-pipeline-cases.it.test.ts` (modify)
- **Change:** agent call sites pass `{ agentId }`; `updateCase` checks names in `repo.ownerOf(current)`'s suite (AC-26 for skill cases edited via `PUT /eval-cases/:id`); `toCaseDto` emits `agent_id` + `skill_id`; `runSavedCase` on a row with no `agentId` throws `NotFoundError` until S7.
- **Layer / why here:** existing agent application path + read model.
- **Skills to apply:** `onion-architecture`, `typescript-expert` (plan change 2026-10-12, SK4: `zod` removed — S4 writes no schema)
- **Practices:** narrow nullable ids with checks, no `!`; no Drizzle in service/views.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` passes · `pnpm exec vitest run --exclude '**/*.it.test.ts' eval-pipeline` green · `pnpm exec vitest run eval-pipeline-cases.it` green incl. T6.

### S5 — Add skill run helpers, ports and the owner tag on results
- **Files:** `E/constants.ts`, `E/pipeline-helpers.ts`, `E/types.ts`, `E/pipeline-runner.ts`, `server/test/eval-pipeline-helpers.test.ts`, `server/test/eval-pipeline-runner.test.ts` (modify); `server/test/eval-pipeline-skill-runner.test.ts` (create)
- **Change:** DN → Helpers and ports. `providerFor`'s logic moves to `resolveProvider` in helpers and the agent service calls it. `runCase` writes `model` always, `agent_version` for `owner: 'agent'`, `skill_version` for `'skill'`.
- **Layer / why here:** pure helpers + eval's own ports; reviewer-core unchanged.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `zod`, `security`
- **Practices:** ports in `E/types.ts`, no import of the skills module (`no-foreign-consumer-ports`); the harness prompt is a constant, never built from skill text; the agent call still sends only prompt/model/diff/strategy/skills (AC-29).
- **Known gotchas:** none.
- **Done when:** typecheck passes · T2 and T3 green.

### S6 — Write `EvalSkillSuiteService`
- **Files:** `E/skill-suite-service.ts` (create), `server/test/eval-pipeline-skill-service.test.ts` (create)
- **Change:** DN → Skill service.
- **Layer / why here:** new application service with narrow `EvalSkillSuiteServiceDeps` (onion step 3 house style).
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `zod`, `security`
- **Practices:** `resolveProvider` before any write or spend (AC-79); `validateCase` + 200-case cap per skill; disabled skill still runs (AC-93); refusals are `AppError` codes from DN → Routes; no `process.env`, no adapter import.
- **Known gotchas:** none.
- **Done when:** typecheck passes · T7 green.

### S7 — Add "Run on evals" and route single runs of skill cases
- **Files:** `E/pipeline-service.ts`, `E/types.ts`, `server/test/eval-pipeline-views.test.ts` (modify)
- **Change:** deps gain `skills: EvalSkillsPort`, `skillCases: EvalSkillCaseRunPort`. `runOnEvalsPreview(ws, skillId)` / `runOnEvals(ws, skillId)` reuse the `runAllPreview`/`runAll` loop with an agent-id filter (agents using the skill, enabled, ≥1 case). Disabled skill → preview `blocked: 'skill_disabled'`, POST 409 `skill_disabled` ("enable the skill to test it in agents"); no eligible agent → `blocked: 'no_agents'`, POST 422 `no_agents`. `runSavedCase(ws, caseId, pick?)`: a skill row delegates to `skillCases.runSavedCase`; no pick → `validation_error` field `model`; an agent row ignores `pick`.
- **Layer / why here:** agent suite runs stay in the agent service; skills are reached through ports.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `zod`
- **Practices:** POST re-checks the skill state (edge "disabled while the confirm is open"); skip reasons as AC-35/AC-79.
- **Known gotchas:** none.
- **Done when:** typecheck passes · T13 green.

### S8 — Wire the skill service in the container
- **Files:** `server/src/platform/container.ts` (modify)
- **Change:** lazy `get evalSkillSuite()` sharing `EvalPipelineRepository`, `llm`, `review`, `parseDiff`, call options, tokenizer and price book with `evalPipeline`; `EvalSkillsPort` over `skillsRepo.getById` (+ `renderSkillBlock`), `skillsRepo.agentsUsingSkill`, `agentsRepo.getById` (default pick); pass `skills` and `skillCases: this.evalSkillSuite` to `evalPipeline`.
- **Layer / why here:** composition root.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** default pick = first `agentsUsingSkill` row (by name, disabled agents included, TQ2) → its provider/model, else null; no new adapter, so no new override field.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` passes · `node .claude/skills/onion-architecture/scripts/trace-imports.mjs server/src/modules/eval` prints no new chain.

### S9 — Add the skill eval routes and their integration tests
- **Files:** `E/routes.ts`, `server/test/helpers/eval-pipeline-env.ts` (+ `insertSkill`, `attachSkill`) (modify); `server/test/eval-pipeline-skill-cases.it.test.ts`, `server/test/eval-pipeline-skill-runs.it.test.ts` (create)
- **Change:** DN → Routes; header comment lists them.
- **Layer / why here:** transport: schema → service → reply.
- **Skills to apply:** `fastify-best-practices`, `zod`, `onion-architecture`, `security`
- **Practices:** `IdParams`, Zod bodies/responses, no parse in handlers; every paid POST has `RATE_LIMIT` and a required JSON body except the agent single run (unguessable case id, kept bodyless); workspace from `getContext`.
- **Known gotchas:** [srv-bodyless-post], [srv-lan], [srv-hermetic-it], [srv-ryuk].
- **Done when:** `cd server && pnpm exec vitest run eval-pipeline-skill` green (T4, T5) · `pnpm exec vitest run eval-pipeline-cases.it eval-pipeline-runs.it eval-pipeline-boundary.it` green.

### S10 — Label the skill checks in `verify:l06`
- **Files:** `scripts/verify-l06.sh` (modify)
- **Change:** step 1 label and header comment name AC-62 #8–#10; the `test/eval-pipeline` filter already picks up `eval-pipeline-skill-*`.
- **Layer / why here:** repo script from plan 34.
- **Skills to apply:** none
- **Practices:** no new step; hermetic env lines unchanged.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm exec vitest run test/eval-pipeline` green; the full `cd server && pnpm verify:l06` (T15) after G6.

### S11 — Write the skill eval copy
- **Files:** `client/messages/en/eval.json`, `client/messages/en/skills.json` (modify)
- **Change:** `eval.skillTab.*` (heading, passing, runAll, empty + disabled reason, progress, `ranOn` "ran on v{version}", confirm title/body with `{count}`, disabled-skill note); `eval.modelPicker.*`; `skills.evals.*` replaces the placeholder copy: `run`, `disabledSkillOff` "Enable the skill to test it in agents", `disabledNoAgents`, confirm title/body, skipped lines.
- **Layer / why here:** i18n per feature namespace.
- **Skills to apply:** `next-best-practices`, `frontend-architecture`
- **Practices:** ICU plurals; no copy in JSX.
- **Known gotchas:** [cli-copy-dup] — distinct strings for "no cases" and "no agents".
- **Done when:** `jq . client/messages/en/eval.json client/messages/en/skills.json` exits 0.

### S12 — Add skill eval hooks; make case hooks owner-aware
- **Files:** `client/src/lib/hooks/eval.ts` (modify)
- **Change:** DN → Hooks.
- **Layer / why here:** data layer; components never `fetch`.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `typescript-expert`, `security` (plan change 2026-10-12, SK11: `next-best-practices` and `react-testing-library` removed — hooks only, no RSC/route surface, no test in S12)
- **Practices:** `as const` key tuples; one hook per endpoint.
- **Known gotchas:** [cli-vimock].
- **Done when:** `cd client && pnpm typecheck` errors only at callers fixed in S14–S15.

### S13 — Build the shared `ModelPicker`
- **Files:** `client/src/components/model-picker/ModelPicker.tsx`, `index.ts`, `styles.ts`, `constants.ts`, `ModelPicker.test.tsx` (create)
- **Change:** controlled `{ value: EvalModelPick|null, onChange }`: provider `SelectInput` (own `PROVIDER_OPTIONS`), model `SearchableSelect` over `toModelOptions(useProviderModels(provider).data)`, hint when the list is empty.
- **Layer / why here:** second consumer of the provider/model pair (after `ConfigTab`, which is not refactored) → `src/components/`.
- **Skills to apply:** C-skills
- **Practices:** `fireEvent` only; `satisfies CSSProperties` per style entry.
- **Known gotchas:** [cli-user-event], [cli-ts2742].
- **Done when:** `cd client && pnpm exec vitest run model-picker` green (T9).

### S14 — Move the case row and run confirm to `components/eval-suite`
- **Files:** `client/src/components/eval-suite/CaseRow.tsx`, `RunConfirm.tsx`, `helpers.ts`, `styles.ts`, `index.ts`, `CaseRow.test.tsx` (create, moved from AE/`EvalsTab/`); AE/`EvalsTab/CaseRow.tsx`, `RunConfirm.tsx` (delete); AE/`EvalsTab/helpers.ts`, `styles.ts`, `EvalsTab.tsx` (modify)
- **Change:** `CaseRow` adds "ran on v{skill_version}" when set (AC-83); `RunConfirm` gets optional `children` (picker slot) and `confirmDisabled`.
- **Layer / why here:** the skill tab is the second consumer.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `react-testing-library` (plan change 2026-10-12, SK13: `security` removed — a file move with no trust-boundary code)
- **Practices:** move, don't copy; agent tab behaviour unchanged.
- **Known gotchas:** [cli-ts2742], [cli-bracket-filter].
- **Done when:** `cd client && pnpm exec vitest run eval-suite EvalsTab` green (T8, T14).

### S15 — Give `EvalCaseModal` an owner
- **Files:** `client/src/components/eval-case-modal/EvalCaseModal.tsx`, `RunConfirmModal.tsx`, `constants.ts`, `EvalCaseModal.test.tsx`; `TurnIntoEvalCase.tsx`, AE/`EvalsTab/EvalsTab.tsx` (modify)
- **Change:** `owner: EvalOwner` replaces `agentId`. Skill owner: `RunConfirmModal` shows a `ModelPicker` defaulted from `useSkillEvalRunState().default_pick`, confirm disabled until picked; draft run, save and single run use the skill hooks; saved link → the skill's Evals tab.
- **Layer / why here:** one modal for all cases (AC-22, AC-85).
- **Skills to apply:** C-skills
- **Practices:** `JSON.parse` only in `helpers.ts`; the stale check also compares the ran pick; discard rules unchanged.
- **Known gotchas:** [cli-portal].
- **Done when:** `cd client && pnpm typecheck` passes · `pnpm exec vitest run eval-case-modal TurnIntoEvalCase` green (T10).

### S16 — Replace the skill Evals placeholder with the suite tab
- **Files:** SK`_components/SkillEditor/_components/EvalsTab/EvalsTab.tsx` (modify), `styles.ts`, `helpers.ts`, `EvalsTab.test.tsx` (create); SK`_components/SkillEditor/SkillEditor.test.tsx` (modify placeholder assertion)
- **Change:** heading, "N / M passing", "Run all evals" + "New eval case", rows newest first via `CaseRow`, empty state with disabled run + reason, confirm with count + `ModelPicker` + disabled-skill note, progress while `progress` is set, refusals by code.
- **Layer / why here:** route-private tab.
- **Skills to apply:** C-skills
- **Practices:** `Skeleton`/`ErrorState` early returns; invalidate cases when progress ends.
- **Known gotchas:** [cli-load-first].
- **Done when:** `cd client && pnpm exec vitest run SkillEditor` green (T11).

### S17 — Wire the header "Run on evals" button
- **Files:** SK`_components/RunOnEvalsButton/RunOnEvalsButton.tsx`, `index.ts`, `styles.ts`, `RunOnEvalsButton.test.tsx`, `client/src/components/eval-suite/RunAgentsList.tsx` (create); SK`page.tsx`, `client/src/app/eval/_components/EvalDashboardView/RunAllButton.tsx` (modify: use `RunAgentsList` instead of its private `ConfirmBody`/`SkippedList`)
- **Change:** disabled with `disabledSkillOff` (disabled skill) or `disabledNoAgents` (`blocked === 'no_agents'`); confirm lists agents (cases, model) and skipped; a 409 `skill_disabled` shows a toast.
- **Layer / why here:** header control is route-private; the agent list gets a second consumer → shared.
- **Skills to apply:** C-skills
- **Practices:** reason via `title` (plan 34 style); preview fetched on mount.
- **Known gotchas:** [cli-bracket-filter].
- **Done when:** `cd client && pnpm typecheck` · `pnpm exec vitest run RunOnEvalsButton EvalDashboardView` green (T12) · `cd client && pnpm test` green.

## Tests
| Id | Test file | Tier | Covers | Step |
|---|---|---|---|---|
| T1 | `server/test/eval-pipeline-contracts.test.ts` | unit | plan-34 result parses; unknown provider / empty model rejected | S1 |
| T2 | `server/test/eval-pipeline-runner.test.ts` | unit | `model` + `agent_version` / `skill_version` tags (AC-29, 88) | S5 |
| T3 | `server/test/eval-pipeline-skill-runner.test.ts` | unit | real `reviewPullRequest` + `MockLLMProvider`: one call, prompt = harness + this skill only (AC-62 #9, AC-86); 0 calls in scoring (#8) | S5 |
| T4 | `server/test/eval-pipeline-skill-cases.it.test.ts` | it | AC-1, 7, 26, 33, 79, 81, 85, 88, 93, 94, 95; AC-62 #8 create→run→score; CHECK rejects a two-owner row; foreign workspace → 404 | S9 |
| T5 | `server/test/eval-pipeline-skill-runs.it.test.ts` | it | AC-31/89 (agent run not blocked), 36, 79, 87 default pick (+ null), 88 (no `eval_suite_runs` row), 90; AC-62 #10, AC-91–93, edge "disabled while confirm open"; bodyless POSTs refused | S9 |
| T6 | `server/test/eval-pipeline-cases.it.test.ts` | it | owner-scoped name check on PUT; bodyless agent single run still 200 | S4 |
| T7 | `server/test/eval-pipeline-skill-service.test.ts` | unit | per-skill guard, progress, errored continues, token match on version+pick, `no_api_key` before writes | S6 |
| T8 | `client/src/components/eval-suite/CaseRow.test.tsx` | unit | "ran on vN" (AC-83) | S14 |
| T9 | `client/src/components/model-picker/ModelPicker.test.tsx` | unit | value, provider change clears model, empty start (AC-87) | S13 |
| T10 | `client/src/components/eval-case-modal/EvalCaseModal.test.tsx` | unit | skill owner: PR meta "none", picker confirm, skill endpoints (AC-22, 85, 87) | S15 |
| T11 | SK`_components/SkillEditor/_components/EvalsTab/EvalsTab.test.tsx` | unit | AC-81, 82, 84, 87, 89, 93 | S16 |
| T12 | SK`_components/RunOnEvalsButton/RunOnEvalsButton.test.tsx` | unit | AC-91, 92, 93 | S17 |
| T13 | `server/test/eval-pipeline-views.test.ts` | unit | Run-on-evals filter, `blocked` reasons | S7 |
| T14 | AE`EvalsTab/EvalsTab.test.tsx` | unit | agent tab unchanged after the move | S14 |
| T15 | `scripts/verify-l06.sh` via `cd server && pnpm verify:l06` | script | AC-62 #1–#10 | S10 |

## Migrations & contracts
- `cd server && pnpm db:generate` in S2 (R1 verified there; `--custom` fallback for the CHECK only). The user applies it with `pnpm db:migrate`.
- `contracts/eval-pipeline.ts` in S1, mirrored byte-equal (`verify:l06` step 4).

## Out of scope
- Run/result tables, dashboard, trend, compare or alert for skills (AC-88).
- Moving `ConfigTab`/`CreateAgentModal` onto `ModelPicker`; the review-eval CLI and `eval_cases`; reviewer-core; mcp-server; `db:seed`.
- Server-side `/models` lookup of the picked model (TQ1); a multi-process run guard.

<!-- implementer-brief:end -->

## Gotcha links
[root-ts2719]: ../../INSIGHTS.md#2026-09-17--ts2719-two-different-types-with-this-name-exist-after-adding-a-contract-field
[srv-null-unique]: ../../server/INSIGHTS.md#2026-09-23--adding-a-nullable-column-to-a-unique-index-silently-stops-deduplicating
[srv-fk-index]: ../../server/INSIGHTS.md#2026-09-18--a-foreign-key-column-carries-no-index-every-child-rows-query-scans
[srv-generate-hang]: ../../server/INSIGHTS.md#2026-09-22--pnpm-dbgenerate-hangs-forever-when-one-table-both-drops-and-adds-a-column
[srv-custom-stub]: ../../server/INSIGHTS.md#2026-09-30--a-data-migration-goes-into-a-pnpm-dbgenerate---custom-stub-generated-before-the-schema-edit
[srv-row-type]: ../../server/INSIGHTS.md#2026-10-06--a-type-only-import-type--from-dbschema-in-a-modules-typests-is-still-a-db-outside-repository-edge
[srv-bodyless-post]: ../../server/INSIGHTS.md#2026-10-12--an-id-less-bodyless-post-that-spends-money-is-reachable-from-any-web-page-despite-cors
[srv-lan]: ../../server/INSIGHTS.md#2026-09-27--no-auth-by-design-is-really-no-auth-for-the-whole-lan
[srv-hermetic-it]: ../../server/INSIGHTS.md#2026-09-26--it-tests-read-the-developers-real-secrets-and-make-live-llm-calls
[srv-ryuk]: ../../server/INSIGHTS.md#2026-10-05--it-tests-all-skip-with-expected-reaper-to-map-exposed-port-8080
[cli-copy-dup]: ../../client/INSIGHTS.md#2026-09-22--getbytext-finding-multiple-elements-is-usually-a-copy-bug-not-a-query-bug
[cli-vimock]: ../../client/INSIGHTS.md#2026-09-23--vimock-of-a-hooks-barrel-breaks-children-and-the-error-names-the-child
[cli-user-event]: ../../client/INSIGHTS.md#2026-09-18--there-is-no-testing-libraryuser-event-here-use-fireevent
[cli-ts2742]: ../../client/INSIGHTS.md#2026-09-27--ts2742-from-a-stylests-that-spreads-a-separately-typed-base-object
[cli-bracket-filter]: ../../client/INSIGHTS.md#2026-10-05--a-vitest-path-filter-containing-repoid-matches-no-files-even-escaped
[cli-portal]: ../../client/INSIGHTS.md#2026-09-18--a-popover-inside-the-pr-list-must-portal-the-table-clips-it
[cli-load-first]: ../../client/INSIGHTS.md#2026-10-05--a-list-editor-backed-by-a-replace-all-put-rendered-before-its-data-loads-wipes-the-stored-list-on-the-first-click

## Design notes

### Contract (`contracts/eval-pipeline.ts`, S1)
- `EvalSuiteCase`: `agent_id: string|null`, new `skill_id: string|null`.
- `EvalCaseResult`: `agent_version` optional; new `skill_version` and `model`, both `.nullish()`.
- `EvalModelPick` `{ provider: Provider, model: string trim 1..200 (assumption) }`. `EvalCaseRunBody` = `EvalModelPick` (the route uses `.optional()`).
- `EvalSkillDraftRunBody` = `EvalDraftRunBody` + pick fields. `EvalSkillRunBody` = pick + `confirm: literal(true)`.
- `EvalSkillRunState` `{ skill: { id, name, version, enabled }, progress: { done, total }|null, default_pick: EvalModelPick|null }`.
- `EvalSkillRunAgentsPreview` = `EvalRunAllPreview` + `blocked: 'skill_disabled'|'no_agents'|null`; POST returns `EvalRunAllResult`.

### Helpers and ports (S5)
- `EVAL_SKILL_HARNESS_PROMPT` (assumption): "You are a code reviewer. Review the diff using only the skill below. Report only issues that skill asks for, each at a file and line range present in the diff." `EVAL_SKILL_STRATEGY = 'single-pass'` (assumption).
- `EvalAgentSnapshot` gains `owner: 'agent'|'skill'`. `skillSnapshot(skill, pick)` → `{ owner: 'skill', id, provider, model, systemPrompt: HARNESS, strategy, version: skill.version, skills: [{id,name,version}], rendered: [skill.rendered] }`.
- `skillRunTokenHash({ diff, expected, skillId, version, provider, model })`; `resolveProvider(llm, provider)` → `LLMProvider` or `AppError('no_api_key', 'no API key for <provider>', 422)`.
- `EvalSkill { id, name, version, enabled, rendered }`; `EvalSkillsPort { getById(ws,id), agentsUsing(ws,id) → {id,name}[], defaultPick(ws,id) → EvalModelPick|null }`; `EvalSkillCaseRunPort { runSavedCase(ws, row, pick) }`.

### Skill service (S6)
- `listCases(ws, skillId)` — unknown skill → 404.
- `createCase(ws, skillId, body)` — `validateCase` against the skill's names; cap 200; a token attaches only when `skillRunTokenHash` over the saved input, the skill's **current** version and the token's pick equals the stored hash; tokens are consumed.
- `draftRun(ws, skillId, body)` — skill → `resolveProvider` → validate → `runCase(skillSnapshot)` → token (agent TTL). Persists nothing.
- `runSavedCase(ws, row, pick)` — same guards, then `setLastResult`. Allowed during a suite run (TQ3).
- `startSuiteRun(ws, skillId, pick)` — `suite_empty`, `suite_too_large`, `run_in_progress` (Map), `no_api_key`; one snapshot; fire-and-forget `pool(EVAL_CASE_CONCURRENCY)`; each result → `setLastResult`, `done++`; `finally` removes the entry. Returns `runState`.
- `runState(ws, skillId)` — skill, progress, `defaultPick`.

### Routes (S9; RL = `RATE_LIMIT`)
- `GET /skills/:id/eval-cases` → `EvalSuiteCase[]`; `POST /skills/:id/eval-cases` → 201 `EvalSuiteCase`.
- `POST /skills/:id/eval-draft-runs` (RL, `EvalSkillDraftRunBody`) → `EvalDraftRunResult`.
- `POST /skills/:id/eval-runs` (RL, `EvalSkillRunBody`) → 202 `EvalSkillRunState`; `GET /skills/:id/eval-run` → `EvalSkillRunState`.
- `GET /skills/:id/eval-run-agents` → `EvalSkillRunAgentsPreview`; `POST /skills/:id/eval-run-agents` (RL, `EvalRunAllBody`) → `EvalRunAllResult`.
- `POST /eval-cases/:id/runs` (RL) body `EvalCaseRunBody.nullish()`, handler passes `req.body ?? undefined` (corrected in G3: fastify-type-provider-zod hands an absent body to the schema as `null`, so `.optional()` gave 422; T5 proves the bodyless agent run).
- Errors: 409 `run_in_progress`, `skill_disabled`; 422 `suite_empty`, `suite_too_large`, `no_api_key`, `validation_error`, `no_agents`; 404 `not_found`.

### Hooks (S12)
- New: `useSkillEvalCases`, `useSaveSkillEvalCase`, `useRunSkillEvalDraft`, `useStartSkillEvalRun`, `useSkillEvalRunState` (polls `RUN_POLL_MS` while `progress` is set), `useRunOnEvalsPreview`, `useRunOnEvals`.
- `useUpdateEvalCase`, `useDeleteEvalCase`, `useRunEvalCase` take `owner: EvalOwner` (`{kind:'agent',agentId}|{kind:'skill',skillId}`, client type) and an optional `pick`; they invalidate that owner's key.
- Keys: `["skill-eval-cases", id]`, `["skill-eval-run", id]`, `["skill-run-on-evals", id]`.

### Pass-1 review (resolved — see *Decisions recorded*)
- TQ1 enum provider + bounded model; TQ2 default pick includes disabled agents; TQ3 single run allowed during a suite run; TQ4 new result fields optional.
- GAP1 closed in the spec (AC-91–93 + edge case).
- REC1–REC4 → D1–D6 option A (nullable `skill_id` + CHECK; in-memory progress; `EvalSkillSuiteService` over `runCase`; `/skills/:id/…` routes; `owner` prop; shared `eval-suite` + `model-picker`); D7 multi-agent.

## Context applied
- `server/insights/gotchas.md` → nullable unique index, FK index, `db:generate` hang, `--custom` stub, id-less POST, LAN, hermetic `.it`, Ryuk → S2, S9.
- `client/insights/gotchas.md` → `fireEvent`, `vi.mock` barrel, TS2742, load-before-render, portal, bracket filter, copy duplicates → S11–S17.
- Root `INSIGHTS.md` → TS2719 after a contract field → S1.
- `docs/plans/34-eval-pipeline.md` (Design notes, Handoffs) and `docs/plans/assets/34-eval-pipeline/research-skill-suites.md` Q1–Q8 → shapes and D1–D6.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1, S3–S9 | |
| `engineering-insights` | preload | Context applied | |
| `drizzle-orm-patterns` | on demand (S2) | S2, S3 | |
| `postgresql-table-design` | on demand (S2) | S2 | |
| `frontend-architecture` | on demand (S13) | S1, S11–S17 | |
| `fastify-best-practices` | on demand (S9) | S9 | |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `contracts/eval-pipeline.ts` (both copies) | ports | changed |
| server | `db/schema/eval.ts` + migration | infra | changed / new |
| server | `modules/eval/*` (`skill-suite-service.ts` new) | application / transport | changed / new |
| server | `platform/container.ts` | composition root | changed |
| client | `lib/hooks/eval.ts`; `components/{eval-suite,model-picker,eval-case-modal}`; `app/skills/[id]/…`; agent `EvalsTab`; `RunAllButton.tsx`; `messages/en/{eval,skills}.json` | UI / data | changed / new |
| repo | `scripts/verify-l06.sh` | tooling | changed |

- 2026-10-12, user "так" to the full plan: approved with the assumptions as written (harness prompt text + single-pass, `eval_suite_cases_owner_check`, 200-char model cap, bodyless agent single run kept, `--custom` CHECK fallback, S1's one-line TurnIntoEvalCase.tsx edit, ~22.5 KB brief).

- 2026-10-12, user "давай закривати цю фічу" (closing the feature, in reply to the pending plan change + R3): plan change SK1/SK4/SK11/SK13 — skills removed from S1, S4, S12, S14 *Skills to apply*; R3 signed off: the brief above the marker is the approved one, plus the logged G3 note `.optional()` -> `.nullish()` and this plan change. Accepted as not verified: browser check of the skill Evals tab and Run on evals (no e2e flow), T5 reverse direction not mutation-proven.

## Risks & open questions
- R1 is verified in S2. The fallback puts a CHECK (DDL) into a `--custom` stub, which CLAUDE.md otherwise reserves for data migrations; approved in *Decisions recorded*.
- Skill progress and draft tokens live in memory (single process, as plan 34). A restart loses the progress line and the guard; finished cases keep their results, and there is no row to reap.
- S1 edits one client line outside the contract (`TurnIntoEvalCase.tsx:43`) to keep the client compiling; S15 rewrites that call to `owner`.
- Mode re-check: 3 packages, a migration and a contract change, 17 steps → multi-agent, consistent with D7.
- Brief above the marker is ~22.5 KB, over the ~20 KB target (plan 34 was accepted at ~26 KB); cutting steps would not reduce implementer runs.

## Handed off
- architecture-reviewer: the `E/types.ts` ports vs `no-foreign-consumer-ports`; two services sharing one repository in the container; `pipeline-service.ts` growth.
- security review: new paid POSTs under `/skills/:id/…` (RL + JSON body), picked provider/model input, an unvetted skill body in the prompt (AC-93), the optional body on `POST /eval-cases/:id/runs`.

## Insights to record
- After S2: whether drizzle-kit 0.30 emits `check()` as a CHECK (server `INSIGHTS.md`, Tool & Library Notes) — or "None." if it behaves as documented.

## Red-flags check
- [x] Every spec AC-n has a row in *Spec traceability* with a step or test
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; no product gap left open
- [x] Groups end type-checking; no parallel groups
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [ ] Brief under ~20,000 characters — ~22.5 KB, see *Risks*
- [x] Execution mode per the rule
- [x] Every step's *Skills to apply* is complete
- [x] `sdd.sh plan-lint` prints `plan-lint: ok`

## Verification log
- 2026-10-12 approved by the user ("так"); status -> in-progress; G1 started
- 2026-10-12 implement G1: done S1–S4; server typecheck ok, server unit 900 passed, eval-pipeline-cases.it 12 (incl. T6), runs.it+boundary.it 19; R1 passed natively (migration 0025 has DROP NOT NULL, skill_id FK cascade, unique (skill_id,name), CHECK eval_suite_cases_owner_check; no --custom fallback); contract copies byte-equal
- 2026-10-12 main-session fix: G1-TC1 client typecheck TS2719 in AE EvalsTab.test.tsx (T14 file) — mkCase gets `skill_id: null` (1 token); client typecheck ok, EvalsTab+TurnIntoEvalCase+EvalCaseModal 27 passed
- 2026-10-12 implement G2: done S5–S8; server typecheck ok, unit 916 passed, cases/runs/boundary .it 31; onion trace/check-module no new hits. Main session re-ran: server typecheck ok, `vitest run eval-pipeline` 11 files / 119 passed. Trivial deviations: optional `EvalAgentSnapshot.owner` (absent = agent); `isUniqueViolation`/`refusalError` moved to pipeline-helpers.ts; `erroredResult` writes `model`; private container getters
- 2026-10-12 implement G3: done S9–S10; routes `/skills/:id/eval-cases|eval-draft-runs|eval-runs|eval-run|eval-run-agents` (paid POSTs RATE_LIMIT + required JSON body), T4 skill-cases.it 9, T5 skill-runs.it 10; verify-l06.sh labels AC-62 #1–5, #8–10 (T15 deferred to after G6). Plan correction (design note *Routes*): `.optional()` -> `.nullish()` for `POST /eval-cases/:id/runs` (absent body reaches the schema as null). Main session re-ran: server typecheck ok, `vitest run eval-pipeline` 13 files / 138 passed
- 2026-10-12 REC3 precondition met: plan 34 UI5–UI10 committed as 3504068 (user "Давай закомітимо 34"; plan-35 client bits held aside during the commit and restored, checksums identical); G4 started
- 2026-10-12 implement G4: done S11–S13; ModelPicker T9 2 passed; client typecheck red by design with exactly 4 TS2353 (`agentId` -> `owner`) at AE EvalsTab.tsx:91,93 and EvalCaseModal.tsx:101,131, fixed by S14/S15 (main session confirmed the 4). Old `skills.evals.run|runDisabledTitle|empty.*` kept until S16/S17 remove them
- 2026-10-12 implement G5: done S14–S15; client typecheck ok, full client 80 files / 604 passed. Main session re-ran: typecheck ok, eval-suite+EvalsTab+eval-case-modal+TurnIntoEvalCase+model-picker 6 files / 44 passed. Trivial deviations: +2 copy keys (`modal.subtitleSkill`, `modal.runConfirmBodySkill`); touched `eval-case-modal/helpers.ts` (stale check compares the ran pick), `styles.ts` (`pickerSlot`), `TurnIntoEvalCase.test.tsx` (mock takes `owner`); only the case-row helpers moved; moved with `mv` (git shows D + untracked)
- 2026-10-12 implement G6: done S16–S17; client typecheck ok, full client 82 files / 613 passed (T11 5, T12 4), `pnpm verify:l06` all checks passed (T15). Main session re-ran: typecheck ok, RunOnEvalsButton+EvalDashboardView+SkillEditor+eval-suite 9 files / 75 passed; the skill placeholder copy is gone. Trivial deviations: +`eval.skillTab.deleteBody`; removed unused `skills.evals.{empty.*, runDisabledTitle, confirmBody, agentLine, skippedHeading, skippedLine}` (RunAgentsList reuses `eval.dashboard` copy, no "costs money" line, as the dashboard); single-case Run confirm uses `eval.modal.runConfirmTitle`/`runConfirmBodySkill` + ModelPicker; RunAllButton dropped unused styles
- 2026-10-12 test-writer: T1–T15 audited, all present; added `server/test/eval-pipeline-skill-boundary.it.test.ts` (7: cross-workspace skill/case 404 on all skill routes, 10 bad run bodies 422, bad pick on single/draft 422, incomplete draft/save 4xx, non-uuid id 422, Run on evals skill_disabled/no_agents with no model call) and +3 T7 unit tests (suite_too_large cap, guard release, agent row 404, no_api_key); break checks: run-body schema swap, skills getById workspace filter removed, start-run cap mutated — each failed its test, shasums restored. Gaps left: RATE_LIMIT untested; createCase `>=` cap not mutated; CHECK test skips the two-owner case without a seeded agent
- 2026-10-12 main session: full server `.it` suite 35 files / 304 passed; `pnpm verify:l06` all checks passed (4/4)
- 2026-10-12 security-reviewer (diff HEAD 3504068..working tree): PASS, 0 findings; filtered with reasons: unvetted skill body in eval runs (by design, constant harness prompt, no tools/context), no RATE_LIMIT on POST /skills/:id/eval-cases (writes, no spend, capped), model string forwarded (JSON field only), in-memory maps (TTL), inFlight keyed by skillId. Handoffs: devdigest-appsec anchors drifted (prompt.ts wrapUntrusted :40-44, INJECTION_GUARD :161, call sites :184-206); check that update/delete/promote handle a null agentId. Dependency audit: no package.json/lock change in the diff
- 2026-10-12 architecture-reviewer (diff HEAD 3504068..working tree): PASS, 0 findings; eval→skills only via ports in eval/types.ts, no service-to-service value import (EvalSkillCaseRunPort), thin routes, contract copies byte-equal, migration 0025 generated (snapshot prevId chain ok), client placement ok. Handoffs: server/AGENTS.md:21 + server/docs/architecture.md don't describe multi-service modules (doc-writer); pipeline-service.ts 669 lines (size only)
- 2026-10-12 plan-verifier full pass: incomplete — 151 met, 3 partial, 4 missing, 1 not-verifiable of 159. Gaps: SK1 (onion-architecture not recorded for S1), SK4 (zod for S4), SK11 (next-best-practices, react-testing-library for S12), SK13 (security for S14), T4 (AC-95 not asserted), T5 (AC-89 skill vs agent suite run non-blocking not asserted), SP-AC-93 (single-case run confirm of a disabled skill lacks the disabled note: skill EvalsTab.tsx:145-156, RunConfirmModal/EvalCaseModal). Sign-off: R3 (plan untracked, no plan-approved checkpoint). Fix mode 1 started

- 2026-10-12 fix mode 1 (SK1, SK4, SK11, SK13, T4, T5, SP-AC-93): T4 AC-95 (PUT /skills/:id v2 keeps cases + last_result.skill_version 1); T5 AC-89 both directions with DeferredLLMProvider (reverse direction not mutation-proven); SP-AC-93 single-case confirm shows `eval.skillTab.disabledNote` for a disabled skill (skill EvalsTab, RunConfirmModal `skill.disabled`, EvalCaseModal) + SkillEditor/EvalCaseModal tests; break checks reverted. Skills: SK11 next-best-practices + react-testing-library applied; SK4 zod and SK13 security "not applicable"; SK1 onion-architecture no new placement. Main session re-ran: server typecheck ok, skill-cases+skill-runs .it 21 passed; client typecheck ok, SkillEditor+eval-case-modal 93 passed

## Handoffs → fix-1
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` (SK1) | preload | — | fix mode placed nothing in a new layer; S1 server placement unchanged |
| `zod` (SK4) | on demand | — | not applicable: no schema/contract edited |
| `next-best-practices` (SK11) | on demand | EvalsTab, RunConfirmModal, EvalCaseModal edits | client components only |
| `react-testing-library` (SK11) | on demand | both new client tests | |
| `security` (SK13) | on demand | — | not applicable: UI copy and tests only |

- 2026-10-12 closed: SK1/SK4/SK11/SK13 by plan change, R3 signed off (see Decisions recorded); last verification delta had every AC met and only these items open -> complete — needs sign-off, accepted by the user; status -> done

## Handoffs → G1
- Contract (`contracts/eval-pipeline.ts`): `EvalModelPick`, `EvalCaseRunBody`, `EvalSkillDraftRunBody`, `EvalSkillRunBody`, `EvalSkillRunState`, `EvalSkillRunAgentsBlocked`, `EvalSkillRunAgentsPreview`. `EvalSuiteCase.agent_id`/`skill_id` both nullable; `EvalCaseResult.agent_version` optional, `skill_version`/`model` nullish.
- Migration `server/src/db/migrations/0025_volatile_lady_bullseye.sql` (generated natively; user runs `cd server && pnpm db:migrate`).
- `pipeline.repo.ts`: `SuiteOwner = { agentId } | { skillId }`; `ownerOf(row)` (export + repo method; service uses the method); `listCases`/`caseNames`/`countCases(workspaceId, owner)`; `SuiteCaseInsert.agentId|skillId: string | null`.
- `pipeline-views.ts`: `CaseRowLike.skillId`, `toCaseDto` emits `skill_id`.
- `pipeline-service.ts` `runSavedCase`: a case without `agentId` throws `NotFoundError` — S7 replaces it with the skill delegation.
- `TurnIntoEvalCase.tsx`: the "existing" branch opens the modal only when `res.case.agent_id` is non-null (S15 rewrites the call).
- `pnpm db:generate` < 40 s, run with stdin closed in the background.

| Skill | Loaded | Applied in |
|---|---|---|
| `onion-architecture` | preload | S3, S4 |
| `zod` | on demand | S1 |
| `typescript-expert` | on demand | S1–S4 |
| `frontend-architecture` | on demand | S1 |
| `drizzle-orm-patterns` | on demand | S2, S3 |
| `postgresql-table-design` | on demand | S2 |

## Handoffs → G2
- `EvalSkillSuiteService` (`server/src/modules/eval/skill-suite-service.ts`, `container.evalSkillSuite`): `listCases(ws, skillId)`, `createCase(ws, skillId, body: EvalCaseSaveBody)` (the draft token carries its pick), `draftRun(ws, skillId, body: EvalSkillDraftRunBody)` → `{result, run_token}`, `runSavedCase(ws, row, pick)`, `startSuiteRun(ws, skillId, pick)` → `EvalSkillRunState`, `runState(ws, skillId)` → `EvalSkillRunState` with `default_pick`.
- `EvalPipelineService`: `runOnEvalsPreview(ws, skillId)` → `EvalSkillRunAgentsPreview`; `runOnEvals(ws, skillId)` → `EvalRunAllResult`; `runSavedCase(ws, caseId, pick?)` (route passes the body as `pick`); `runAllPreview`/`runAll` take an optional `only` set of agent ids. `skillCases` and `skills` are required deps.
- Errors: 409 `run_in_progress`, 409 `skill_disabled`; 422 `suite_empty`, `suite_too_large`, `no_api_key`, `no_agents`; `ValidationError` field `model` for a skill case run without a pick; 404 unknown skill/case.
- Default pick: first row of `skillsRepo.agentsUsingSkill` by name (disabled agents included) via `agentsRepo.getById`.
- S9 to do: routes (`POST /eval-cases/:id/runs` with `EvalCaseRunBody.optional()`), `RATE_LIMIT` on paid POSTs, `insertSkill`/`attachSkill` helpers in `eval-pipeline-env.ts`.
- Unit-test note: `parseUnifiedDiff` returns an empty diff on garbage (case `failed`, not `errored`); to force `errored`, make `parseDiff` throw.

| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S5–S8 | |
| `zod` | on demand | S5, S6, S7 | no new schema in G2 |
| `typescript-expert` | on demand | S5–S8 | |
| `security` | on demand | S5, S6 | |

## Handoffs → G3
- Routes (eval routes plugin): `GET /skills/:id/eval-cases` → `EvalSuiteCase[]`; `POST /skills/:id/eval-cases` (`EvalCaseSaveBody`) → 201; `POST /skills/:id/eval-draft-runs` (`EvalSkillDraftRunBody` = draft + provider + model) → `EvalDraftRunResult`; `POST /skills/:id/eval-runs` (`EvalSkillRunBody` = provider, model, `confirm: true`) → 202 `EvalSkillRunState`; `GET /skills/:id/eval-run` → `EvalSkillRunState` (`progress {done,total}|null`, `default_pick|null`); `GET /skills/:id/eval-run-agents` → `EvalSkillRunAgentsPreview` (`blocked: 'skill_disabled'|'no_agents'|null`); `POST /skills/:id/eval-run-agents` (`{confirm:true}`) → `EvalRunAllResult`; `POST /eval-cases/:id/runs` optional `EvalCaseRunBody` (required for a skill case → else 422 `validation_error`; ignored for an agent case); a skill single run returns the case with `last_result.skill_version` + `model`.
- Refusals to map: 409 `run_in_progress`, `skill_disabled`; 422 `suite_empty`, `suite_too_large`, `no_api_key`, `no_agents`, `validation_error`; 404 unknown skill/case. Invalid pick fields → 422.
- No `eval_suite_runs` rows for skill suites; progress in memory → poll `GET /skills/:id/eval-run`, refetch cases when `progress` becomes null.
- Test note: `ScriptedLLMProvider` matches on the system prompt; skill tests match the harness phrase `using only the skill`.

| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S9 | |
| `fastify-best-practices` | on demand | S9 | |
| `zod` | on demand | S9 | |
| `security` | on demand | S9 | |
| `typescript-expert` | on demand | S9 | |

## Handoffs → G4
- `lib/hooks/eval.ts`: `type EvalOwner = { kind: "agent"; agentId } | { kind: "skill"; skillId }`. Owner-aware: `useUpdateEvalCase({ id, owner, body })`, `useDeleteEvalCase({ id, owner })`, `useRunEvalCase({ id, owner, pick? })` (skill owner + pick sends the pick as body; otherwise bodyless). Callers to fix in G5: AE `EvalsTab.tsx:91,93`, `EvalCaseModal.tsx:101,131`. Unchanged: `useSaveEvalCase({ agentId, body })`, `useRunEvalDraft`.
- Skill hooks: `useSkillEvalCases(skillId)`, `useSaveSkillEvalCase({ skillId, body })`, `useRunSkillEvalDraft({ skillId, body: EvalSkillDraftRunBody })`, `useStartSkillEvalRun({ skillId, pick })`, `useSkillEvalRunState(skillId)` (polls 2 s while `progress` set), `useRunOnEvalsPreview(skillId, enabled?)`, `useRunOnEvals()` (takes `skillId`).
- `ModelPicker` (`@/components/model-picker`): `{ value: EvalModelPick | null; onChange }`; reports `null` on provider change / no model → gate confirm on `value !== null`; follows an external `value` (a late default works). Own `PROVIDER_OPTIONS`.
- i18n: `eval.skillTab.*` (incl. `confirmTitle`, `confirmBody {count}`, `ranOn {version}`, `disabledNote`, `progress`), `eval.modelPicker.*`; `skills.evals.*` (`disabledSkillOff`, `disabledNoAgents`, `confirmTitle`, `confirmBody {cases, agents}`, `confirmRun`, `agentLine`, `skippedHeading`, `skippedLine`, `started`, `runFailed`, `skillDisabledToast`). S16/S17 delete the old `run`, `runDisabledTitle`, `empty.*`.

| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `frontend-architecture` | on demand | S11–S13 | |
| `react-best-practices` | on demand | S12, S13 | |
| `next-best-practices` | on demand | S11, S13 | no RSC/route/metadata surface |
| `typescript-expert` | on demand | S12, S13 | |
| `security` | on demand | S12, S13 | |
| `react-testing-library` | on demand | S13 | |

## Handoffs → G5
- `@/components/eval-suite`: `{ CaseRow, RunConfirm, passingCount, caseRecall, expectationBadge }`. `CaseRow` props unchanged, shows `· ran on v{skill_version}` when set. `RunConfirm` gains optional `children` (slot under the body) and `confirmDisabled`. Shared row/footer/confirmBody styles not exported; S16 needs its own `styles.ts` (copy layout entries from the agent tab's `styles.ts`).
- `EvalCaseModal` takes `owner: EvalOwner` (skill: `{ kind: "skill", skillId }`); the skill-owner modal reads `useSkillEvalRunState` for the default pick; the saved link goes to `/skills/:id?tab=evals`. Agent `EvalsTab` memoizes `owner`; the modal does not use `owner` in effect/hook deps.
- `RunConfirm`/`CaseRow` read `eval.evalsTab` and `eval.skillTab`; test providers need the `eval` and `common` messages.
- S17 creates `components/eval-suite/RunAgentsList.tsx` and adds it to `index.ts`.

| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `frontend-architecture` | on demand | S14, S15 | |
| `react-best-practices` | on demand | S14, S15 | |
| `next-best-practices` | on demand | S14, S15 | no RSC/route surface |
| `typescript-expert` | on demand | S14, S15 | |
| `security` | on demand | S15 | |
| `react-testing-library` | on demand | S14, S15 | |

## Handoffs → G6
- Skill tab `SkillEditor/_components/EvalsTab/` (EvalsTab, helpers, styles, test T11); header `skills/[id]/_components/RunOnEvalsButton/` (T12); `components/eval-suite/RunAgentsList.tsx` shared by `RunAllButton` and `RunOnEvalsButton`.
- Model choice: `chosen` is `undefined` until the user touches the picker, then follows `default_pick` (same pattern in `EvalCaseModal`).
- Paid POSTs only via typed hooks with `confirm: true` + JSON body. Not verified: browser/e2e (no flow in the plan).

| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `frontend-architecture` | on demand | S16, S17 | |
| `react-best-practices` | on demand | S16, S17 | |
| `next-best-practices` | on demand | S16, S17 | no RSC/route surface |
| `typescript-expert` | on demand (read in G5) | S16, S17 | |
| `security` | on demand (read in G5) | S16, S17 | |
| `react-testing-library` | on demand | S16, S17 | |
