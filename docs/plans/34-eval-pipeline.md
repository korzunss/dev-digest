# Development Plan: Eval Pipeline (regression suites per agent)
Status: done
Save as: docs/plans/34-eval-pipeline.md
Spec: specs/011-eval-pipeline.md
Execution: multi-agent

## Spec traceability
| Spec AC | Covered by |
|---|---|
| AC-1 | S2, S3, T7 |
| AC-2 | S2, T7 |
| AC-3 | S1, S2, T6 |
| AC-4 | S9, T6 |
| AC-5 | S1, S4, T1, T2 |
| AC-6 | S4, T2 |
| AC-7 | S2, S9, T6 |
| AC-8 | S16, T11 |
| AC-9 | S9, S16, T6, T11 |
| AC-10 | S9, S16, T6, T11 |
| AC-11 | S5, S9, T3, T6 |
| AC-12 | S5, S7, T3, T6 |
| AC-13 | S5, T3, T6 |
| AC-14 | S7, S9, S16, T6, T11 |
| AC-15 | S9, S16, T6, T11 |
| AC-16 | S9, S16, T6, T11 |
| AC-17 | S15, T10 |
| AC-18 | S9, S17, T12 |
| AC-19 | S3, S17, T12 |
| AC-20 | S17, T12 |
| AC-21 | S3, S17, T6, T12 |
| AC-22 | S15, T10 |
| AC-23 | S15, T9, T10 |
| AC-24 | S5, S15, T3, T6 |
| AC-25 | S5, T3, T6 |
| AC-26 | S9, T6 |
| AC-27 | S15, T10 |
| AC-28 | S17, S19, T12, T14 |
| AC-29 | S6, T4 |
| AC-30 | S2, S9, T7 |
| AC-31 | S9, S17, T7, T12 |
| AC-32 | S6, T4, T7 |
| AC-33 | S9, S17, T6, T12 |
| AC-34 | S9, S18, T7, T13 |
| AC-35 | S9, S18, T7, T13 |
| AC-36 | S9, T7 |
| AC-37 | S4, T2, T4, T7 |
| AC-38 | S4, T2 |
| AC-39 | S4, T2 |
| AC-40 | S4, T2 |
| AC-41 | S4, S6, T2, T4 |
| AC-42 | S4, T2 |
| AC-43 | S4, S19, T2, T14 |
| AC-44 | S4, S19, T2, T14 |
| AC-45 | S9, S19, T5, T14 |
| AC-46 | S19, T14 |
| AC-47 | S3, S19, T7, T14 |
| AC-48 | S19, T14 |
| AC-49 | S9, S19, T5, T14 |
| AC-50 | S4, S19, T2, T14 |
| AC-51 | S19, T14 |
| AC-52 | S9, S20, T5, T15 |
| AC-53 | S9, S20, T5, T15 |
| AC-54 | S9, S20, T5, T15 |
| AC-55 | S20, T15 |
| AC-56 | S8, S9, T7 |
| AC-57 | S9, S20, T7, T15 |
| AC-58 | S18, T13 |
| AC-59 | S9, S18, T5, T13 |
| AC-60 | S18, T13 |
| AC-61 | S3, S18, T7, T13 |
| AC-62 | S1, S12, S23, T4, T6, T7, T8 |
| AC-63 | S24 |
| AC-64 | S1, S5, T1, T3 |
| AC-65 | S15, T10 |
| AC-66 | S15, T10 |
| AC-67 | S6, S9, S15, T6, T10 |
| AC-68 | S15, T10 |
| AC-69 | S9, T6 |
| AC-70 | S5, S9, T3, T6 |
| AC-71 | S15, T10 |
| AC-72 | S2, S9, T6 |
| AC-74 | S5, S15, T3, T6, T10 |
| AC-75 | S9, T7 |
| AC-76 | S4, S20, T2, T15 |
| AC-77 | S2, S15, S16, T6, T10 |
| AC-78 | S15, T10 |
| AC-79 | S9, T6, T7 |
| AC-80 | S9, S20, T7, T15 |

Tooling scope with no spec (from the same homework; listed in the spec's Non-goals):
- TAC1: mutation testing runs on the new scoring module only, through a `server/package.json` script.
- TAC2: the surviving mutants are listed in a committed report.
- TAC3: each survivor has one test that kills it, and a re-run shows it killed.

## Decisions needed
None open — see *Decisions recorded*. (The pass-1 review and the options table are below the marker under *Design notes → Pass-1 review*.)

## Decisions recorded
User, 2026-10-12: "так, беремо по рекомендаціям" — every recommendation of pass 1 taken. Not an approval of the plan.
- **D1–D11 → A** each, as recommended in *Decisions needed*. **D12 → multi-agent.**
- **TQ1–TQ6 → the defaults:** name title part ≤ 48 chars cut at a hyphen, suffix `-2`…; case concurrency 3; "current version" = agent `version` + enabled skill set (names, versions); finding link `…/pulls/<n>#finding-<id>` + `id` on FindingCard; AC-62 #5 as a server `.it` route test; demo doc `server/docs/eval-pipeline-demo.md`.
- **GAP1 → Promote also restores the skill set recorded on the promoted run** (AC-75), bodies at their latest version (skills are unpinned). Sent to `spec-creator`.
- **GAP2 → the ≥8-case demo suite is NOT seeded.** A fixture serves tests and `verify:l06`; the real suite on Security Reviewer is built by the user from real accepted/dismissed findings through the EvalCaseModal. Sent to `spec-creator`.
- **GAP3 → a missing provider key refuses the run start** with a stated reason; no run is created. Sent to `spec-creator`.
- **GAP4 → accepted:** the finding's diff is re-derived from the PR's current SHAs; if the PR moved and the hunks miss the finding lines, Save is refused under AC-25. Sent to `spec-creator`.
- **Vendor exception approved:** a hand edit of `client/src/vendor/ui/nav.ts` adding the Eval Dashboard NAV item (same kind as the conventions exception); listed under Risks — a vendor refresh drops it.
- **Install approved:** `@stryker-mutator/core` + `@stryker-mutator/vitest-runner` as `server/` devDependencies, installed with pnpm by the main session after R1 confirms versions.
- **Pass 2 approval (user, 2026-10-12, "дава згідно рекомендацій"):** brief size ~26 KB accepted as is; every "(assumption)" default accepted (synchronous draft/single-case runs with a 240 s call deadline; draft-run result attachable at Save for 1 h; dashboard sparkline = recall; `Gauge` nav icon; disabled-button tooltip via `title`; uuid primary keys). Plan approved.

## Prerequisites
- Docker for the `.it` tier.
- **M1, main session, before G8, never the implementer:** `cd server && pnpm add -D @stryker-mutator/core@10.0.0 @stryker-mutator/vitest-runner@10.0.0`.
- No other new dependency (`diff` 9.0.0 and `recharts` are installed).

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S3 | shared contract, server schema + repository | — | contract names, migration file, repo methods |
| G2 | S4–S6 | server eval pure code, ports, case runner | G1 | scoring exports, `eval/types.ts` ports |
| G3 | S7–S10 | reviews/agents additions, eval service, container | G2 | `findingSource`, `promote`, `container.evalPipeline` |
| G4 | S11–S12 | eval routes, server tests | G3 | routes as built, `ScriptedLLMProvider`, fixture |
| G5 | S13–S15 | client i18n, hooks, EvalCaseModal | G4 | hook names, modal props |
| G6 | S16–S17 | client FindingCard action, Evals tab | G5 | — |
| G7 | S18–S20 | client nav, `/eval` pages, compare | G6 | — |
| G8 | S21–S22 | server mutation testing | G4 + M1; may run in parallel with G5–G7 (no shared file) | survivors, tests |
| G9 | S23–S24 | `verify:l06`, demo doc | G7, G8 | — |

## Steps
Key to the abbreviations:
- **DN** = *Design notes*, below the marker. Spec ACs give the behaviour; DN gives the shapes.
- **C-skills** = `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`. Read all five.
- **Gotcha files:** srv = `server/insights/gotchas.md`, cli = `client/insights/gotchas.md`, root = `INSIGHTS.md`.
- **Paths:** `E/` = `server/src/modules/eval/`; `PR/` = `client/src/app/repos/[repoId]/pulls/[number]/_components/`; `AE/` = `client/src/app/agents/[id]/_components/AgentEditor/`; `EV/` = `client/src/app/eval/`.

### S1 — Add the eval-pipeline contract  [Contract]
- **Files:** `{server,client}/src/vendor/shared/contracts/eval-pipeline.ts` (create, byte-identical) · `{server,client}/src/vendor/shared/index.ts` (modify) · `server/test/eval-pipeline-contracts.test.ts` (create)
- **Change:** DN → Contract; one `export * from './contracts/eval-pipeline.js';` after the `eval-ci.js` line in each barrel.
- **Layer / why here:** ports, contracts first.
- **Skills to apply:** `onion-architecture`, `zod`, `typescript-expert`, `security`
- **Practices:** imports only `zod`; nullable metrics, never optional; `provider` is `z.string()`; existing `Eval*` untouched, no clashing names.
- **Known gotchas:** the copies drift, so mirror this file only (root 2026-09-17); run the server unit suite too (root 2026-10-05).
- **Done when:** `cmp server/src/vendor/shared/contracts/eval-pipeline.ts client/src/vendor/shared/contracts/eval-pipeline.ts` · `diff server/src/vendor/shared/index.ts client/src/vendor/shared/index.ts` empty · `cd server && pnpm typecheck` · `cd client && pnpm typecheck` · T1.

### S2 — Add the suite tables, generate the migration
- **Files:** `server/src/db/schema/eval.ts` (modify) · the migration `pnpm db:generate` writes
- **Change:** append `evalSuiteCases`, `evalSuiteRuns`, `evalCaseResults` (DN → Schema).
- **Layer / why here:** infrastructure.
- **Skills to apply:** `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`
- **Practices:** timestamptz `defaultNow()`; FKs with `onDelete`; an index per read FK column; `<table>_<scope>_idx`; no hand SQL, no `db:migrate`.
- **Known gotchas:** a FK column has no index; NULLs are distinct in a unique index (wanted, comment it); text enum has no SQL check (srv DB).
- **Done when:** `cd server && pnpm db:generate` adds one migration with three `CREATE TABLE`, nothing on `eval_cases`/`eval_runs` · `cd server && pnpm typecheck`.

### S3 — Add `EvalPipelineRepository`
- **Files:** `E/repository/pipeline.repo.ts` (create)
- **Change:** DN → Repository; row types exported here.
- **Layer / why here:** infrastructure (`repository/*.repo.ts`).
- **Skills to apply:** `drizzle-orm-patterns`, `postgresql-table-design`, `onion-architecture`, `typescript-expert`
- **Practices:** awaited rows, never a builder; limit/order as parameters; workspace-scoped reads; never reads `eval_cases`/`eval_runs` (AC-1).
- **Known gotchas:** `$inferSelect` outside a repository file (srv DB 1).
- **Done when:** `cd server && pnpm typecheck` · `.claude/skills/onion-architecture/scripts/check-module.sh eval` has no new schema hit outside `repository*`.

### S4 — Write the code-only scoring module
- **Files:** `E/pipeline-scoring.ts`, `server/test/eval-pipeline-scoring.test.ts` (create)
- **Change:** DN → Scoring rules.
- **Layer / why here:** pure domain logic (D4-A), mutation target.
- **Skills to apply:** `typescript-expert`, `onion-architecture`
- **Practices:** only `import type` from `@devdigest/shared`; no clock, randomness or I/O; matching ignores display fields (AC-5).
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm exec vitest run test/eval-pipeline-scoring.test.ts` · T2.

### S5 — Add pipeline helpers and limits
- **Files:** `E/pipeline-helpers.ts`, `server/test/eval-pipeline-helpers.test.ts` (create) · `E/constants.ts` (modify, append)
- **Change:** DN → Helpers.
- **Layer / why here:** pure helpers.
- **Skills to apply:** `typescript-expert`, `zod`, `onion-architecture`, `security`
- **Practices:** `parseDiff` injected, never imported from `adapters/`; `safeParse` names the element index; reasons returned, not thrown.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm exec vitest run test/eval-pipeline-helpers.test.ts` · T3.

### S6 — Declare the eval ports and the case runner
- **Files:** `E/types.ts`, `E/pipeline-runner.ts`, `server/test/eval-pipeline-runner.test.ts` (create)
- **Change:** DN → Service deps, DN → Runner.
- **Layer / why here:** application.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:** ports in eval's own `types.ts`; no import from `../reviews|agents|skills`; model output used through file/line only; `describeJobError` (`./replay.js`).
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/eval-pipeline-runner.test.ts` · T4.

### S7 — Expose a finding's source and file diff from reviews
- **Files:** `server/src/modules/reviews/{service,helpers}.ts` (modify) · `server/test/reviews-file-section.test.ts` (create)
- **Change:** DN → findingSource.
- **Layer / why here:** reviews owns findings and the PR diff (D7-A).
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:** reuse `loadDiff` + `diffFromPrFiles`, no new git call or schema import; workspace check as `findings.ts:17-19`; writes nothing.
- **Known gotchas:** SHAs plus a signal, which `loadDiff` already has (srv Git & diffs).
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/reviews-file-section.test.ts`.

### S8 — Add promote to the agents service
- **Files:** `server/src/modules/agents/service.ts` (modify)
- **Change:** DN → Promote.
- **Layer / why here:** agents owns agent writes.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** one `repo.transaction` + `lockById`, like `syncBuiltin` (`service.ts:223-257`); past versions untouched.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · T7 promote cases.

### S9 — Write `EvalPipelineService` and the read models
- **Files:** `E/pipeline-service.ts`, `E/pipeline-views.ts`, `server/test/eval-pipeline-views.test.ts` (create)
- **Change:** DN → Service behaviour; pure `buildAgentDetail`, `buildCompare` (`diffLines` from `diff`), `buildDashboard`.
- **Layer / why here:** application (`<Name>ServiceDeps`).
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `zod`, `security`
- **Practices:** ports and functions only; no `process.env`; `Set` added before the first `await`; key check before any spend; only server tokens attach a result.
- **Known gotchas:** a paid side effect reachable from the LAN (srv Security 1).
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/eval-pipeline-views.test.ts` · T5 · `check-module.sh eval` clean.

### S10 — Wire the container and reap on boot
- **Files:** `server/src/platform/container.ts`, `server/src/app.ts` (modify)
- **Change:** DN → Container wiring; `await container.evalPipeline.reapStaleRuns()` after the agent-run reaper, in its own try/catch.
- **Layer / why here:** composition root.
- **Skills to apply:** `onion-architecture`, `fastify-best-practices`, `typescript-expert`
- **Practices:** one instance per app; LLMs via the existing `overrides.llm`; no `process.env`.
- **Known gotchas:** the single-API reap assumption; comment it (srv Tooling 1).
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`.

### S11 — Add the eval routes
- **Files:** `E/routes.ts` (create) · `server/src/modules/index.ts` (modify)
- **Change:** DN → Routes; register `eval`.
- **Layer / why here:** transport.
- **Skills to apply:** `fastify-best-practices`, `zod`, `onion-architecture`, `security`
- **Practices:** Zod params, query, body and response; `getContext`; handlers only call `app.container.evalPipeline`; RL routes `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }`.
- **Known gotchas:** srv Security 1.
- **Done when:** `cd server && pnpm typecheck` · routes hit in T6/T7.

### S12 — Add the scripted LLM, fixture suite and server integration tests
- **Files:** `server/test/helpers/llm-stubs.ts` (modify) · `server/test/helpers/eval-pipeline-suite.ts`, `server/test/eval-pipeline-fixture.test.ts`, `server/test/eval-pipeline-cases.it.test.ts`, `server/test/eval-pipeline-runs.it.test.ts` (create)
- **Change:** `ScriptedLLMProvider extends RecordingStub` returns the `Review` of the first script whose `match` is in the system prompt. A fixture of ≥ 8 cases (`must_find`, `must_not_flag`, `[]`) plus old/new prompt scripts. T6–T8.
- **Layer / why here:** tests.
- **Skills to apply:** `fastify-best-practices`, `drizzle-orm-patterns`, `typescript-expert`
- **Practices:** `buildApp` + `isolatedTestConfig()` + stubbed `secrets` + `overrides.llm` per provider; AC-79 via a provider with neither; row counts prove "writes nothing"; polling throws on its own timeout.
- **Known gotchas:** hermetic `.it`; `TESTCONTAINERS_RYUK_DISABLED=true`; one mock PR (srv Tests).
- **Done when:** `cd server && pnpm exec vitest run test/eval-pipeline-fixture.test.ts test/eval-pipeline-cases.it.test.ts test/eval-pipeline-runs.it.test.ts` · `cd server && pnpm exec vitest run test/eval.it.test.ts` (AC-2).

### S13 — Write the eval copy
- **Files:** `client/messages/en/eval.json` (modify)
- **Change:** keys for every client surface (S15–S20); the spec's quoted strings verbatim (AC-65/66/68/78/79).
- **Layer / why here:** i18n.
- **Skills to apply:** `frontend-architecture`, `next-best-practices`
- **Practices:** ICU plurals; one key per distinct state.
- **Known gotchas:** one string for two states (cli Tests 3).
- **Done when:** `jq . client/messages/en/eval.json` · `cd client && pnpm typecheck`.

### S14 — Add the eval data hooks
- **Files:** `client/src/lib/hooks/eval.ts` (create) · `client/src/lib/hooks/index.ts` (modify)
- **Change:** DN → Hooks; `useEvalRun` polls every 2000 ms while running.
- **Layer / why here:** client data layer.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`
- **Practices:** TanStack Query + `api.*`; `refetchInterval` as a function (`brief.ts:23`); invalidate on success.
- **Known gotchas:** a barrel `vi.mock` spreads `importActual` (cli Tests 2).
- **Done when:** `cd client && pnpm typecheck`.

### S15 — Build the EvalCaseModal
- **Files:** `client/src/components/eval-case-modal/` (create): `EvalCaseModal.tsx`, `CaseInputTabs.tsx`, `ExpectedOutputEditor.tsx`, `CaseRunResult.tsx`, `helpers.ts`, `constants.ts`, `styles.ts`, `index.ts`, `helpers.test.ts`, `EvalCaseModal.test.tsx`
- **Change:** DN → Modal (AC-17, 22–27, 65–68, 71, 72, 74, 77, 78).
- **Layer / why here:** shared chrome, two consumers.
- **Skills to apply:** C-skills, `security`
- **Practices:** dirty/stale derived from snapshots, no effects; files ≤ ~200 lines; untrusted text as plain text.
- **Known gotchas:** `fireEvent` (cli Tests 1); `satisfies CSSProperties` per entry; border longhand (cli UI).
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run eval-case-modal` · T9, T10.

### S16 — Add "Turn into eval case" to FindingCard
- **Files:** `PR/FindingCard/FindingCard.tsx`, `PR/FindingCard/FindingCard.test.tsx` (modify) · `PR/TurnIntoEvalCase/` (create): `TurnIntoEvalCase.tsx`, `styles.ts`, `index.ts`, `TurnIntoEvalCase.test.tsx`
- **Change:** card root `id={`finding-${f.id}`}`; `<TurnIntoEvalCase finding={f} />` after Dismiss (AC-8–10, 14–16: seed → modal; refusal → toast).
- **Layer / why here:** route-private.
- **Skills to apply:** C-skills
- **Practices:** FindingCard props unchanged; the child owns the modal state; tooltip via `title` (assumption).
- **Known gotchas:** a vitest filter with `[repoId]` matches nothing (cli Tooling).
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run TurnIntoEvalCase FindingCard` · T11.

### S17 — Add the Evals tab
- **Files:** `AE/constants.ts`, `AE/AgentEditor.tsx`, `client/src/app/agents/[id]/page.tsx` (modify) · `AE/_components/EvalsTab/` (create): `EvalsTab.tsx`, `CaseRow.tsx`, `helpers.ts`, `styles.ts`, `index.ts`, `EvalsTab.test.tsx`
- **Change:** `TABS` gets `{ key: "evals", labelKey: "editor.tabs.evals", icon: "FlaskConical" }`; `"evals"` in `VALID_TABS`; the tab for AC-18–21, 28, 31, 33, 36, 79.
- **Layer / why here:** route-private sub-tab.
- **Skills to apply:** C-skills
- **Practices:** `Skeleton`/`ErrorState` before controls; `MetricCard` from `@devdigest/ui`.
- **Known gotchas:** controls before load (cli UI 2).
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run EvalsTab AgentEditor` · T12.

### S18 — Add the sidebar item and the Eval Dashboard
- **Files:** `client/src/vendor/ui/nav.ts` (modify, approved exception) · `EV/page.tsx` (create) · `EV/_components/EvalDashboardView/` (create): `EvalDashboardView.tsx`, `AgentRow.tsx`, `RunAllButton.tsx`, `styles.ts`, `index.ts`, `EvalDashboardView.test.tsx`
- **Change:** a SKILLS LAB item `{ key: "eval", label: "Eval Dashboard", icon: "Gauge", href: "/eval" }` plus an exception comment; the page for AC-34, 35, 58–61, 79.
- **Layer / why here:** new route.
- **Skills to apply:** C-skills
- **Practices:** thin page; data via hooks; one component per file.
- **Known gotchas:** the `nav.ts` line is disposable (cli UI 1).
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run EvalDashboardView` · T13.

### S19 — Add the per-agent detail page
- **Files:** `EV/[agentId]/page.tsx` (create) · `EV/[agentId]/_components/AgentEvalDetail/` (create): `AgentEvalDetail.tsx`, `RegressionAlert.tsx`, `RunsTable.tsx`, `helpers.ts`, `styles.ts`, `index.ts`, `AgentEvalDetail.test.tsx` · `EV/[agentId]/_components/EvalTrendChart/` (create): `EvalTrendChart.tsx`, `helpers.ts`, `index.ts`
- **Change:** AC-28, 43–51; a `recharts` chart with a `Tooltip` (version, time, cost; D8-A); `?period=30d|all`.
- **Layer / why here:** new route.
- **Skills to apply:** C-skills
- **Practices:** period in URL params; `<Suspense>` around the page; vendored `LineChart` untouched; the tooltip formatter is a tested helper.
- **Known gotchas:** `useSearchParams` needs `Suspense` (cli Tooling 4).
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run AgentEvalDetail EvalTrendChart` · T14.

### S20 — Add the compare and promote modal
- **Files:** `EV/[agentId]/_components/CompareRunsModal/` (create): `CompareRunsModal.tsx`, `PromptDiff.tsx`, `SkillsDiff.tsx`, `styles.ts`, `index.ts`, `CompareRunsModal.test.tsx` · `…/AgentEvalDetail/AgentEvalDetail.tsx` (modify)
- **Change:** AC-52–57, 76, 80; the promote confirm names the version, the restore list and the missing skills.
- **Layer / why here:** route-private modal.
- **Skills to apply:** C-skills, `security`
- **Practices:** prompts as plain text; no client diff library (D3-A).
- **Known gotchas:** as S15.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run CompareRunsModal` · T15.

### S21 — Set up mutation testing on the scoring module
- **Files:** `server/vitest.mutation.config.ts`, `server/stryker.config.json` (create) · `server/package.json` (modify: `"mutation:eval-scoring": "stryker run"`) · `.gitignore` (modify: `server/.stryker-tmp/`, `server/reports/`)
- **Change:** the research-stryker.md setup, but `test.include: ['test/eval-pipeline-scoring.test.ts']`, `mutate: ['src/modules/eval/pipeline-scoring.ts']`, `inPlace: true`, reports in `reports/mutation/`.
- **Layer / why here:** server tooling (TAC1).
- **Skills to apply:** `typescript-expert`
- **Practices:** `vitest.config.ts` untouched; clean tree first; lockfile untouched (M1).
- **Known gotchas:** none recorded (the sandbox alias risk is from research).
- **Done when:** first a trial: `cd server && pnpm mutation:eval-scoring` writes `server/reports/mutation/mutation.json` (on failure, stop and report) · `git status --short server/src` clean afterwards.

### S22 — Report the survivors and kill them
- **Files:** `docs/plans/assets/34-eval-pipeline/mutation-report.md` (create) · `server/test/eval-pipeline-scoring.test.ts` (modify)
- **Change:** a report (score, counts, each survivor: id, mutator, line, original → mutant); one test per survivor in `describe('mutation survivors')`; equivalent mutants listed with a reason; an "after" table (TAC2/3).
- **Layer / why here:** tests + plan asset.
- **Skills to apply:** `typescript-expert`
- **Practices:** assert the output of exported functions only.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm exec vitest run test/eval-pipeline-scoring.test.ts` · `cd server && pnpm mutation:eval-scoring` shows 0 survived beyond the listed equivalents.

### S23 — Add `pnpm verify:l06`
- **Files:** `scripts/verify-l06.sh` (create) · `server/package.json` (modify: `"verify:l06": "bash ../scripts/verify-l06.sh"`)
- **Change:**
  - setup: `set -euo pipefail`; a temporary `HOME`; unset `OPENAI_API_KEY ANTHROPIC_API_KEY OPENROUTER_API_KEY GITHUB_TOKEN`;
  - checks: server `pnpm exec vitest run test/eval-pipeline` (AC-62 #1–5); client `pnpm typecheck` + `pnpm test` (#6); `cmp` of the two `eval-pipeline.ts` (#7);
  - the first failure exits non-zero.
- **Layer / why here:** repo tooling (D9-A).
- **Skills to apply:** `security`
- **Practices:** no secret read or printed; paths from the script's own directory.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm verify:l06` exits 0 with Docker up.

### S24 — Write the manual demo
- **Files:** `server/docs/eval-pipeline-demo.md` (create)
- **Change:** DN → Demo (AC-63).
- **Layer / why here:** docs.
- **Skills to apply:** none
- **Practices:** commands from `server/AGENTS.md` only.
- **Known gotchas:** none.
- **Done when:** `grep -n 'Security' server/docs/eval-pipeline-demo.md` finds the suite step.

## Tests
| Test file (`server/test/` or client path) | Tier | Covers | Step |
|---|---|---|---|
| T1 `eval-pipeline-contracts.test.ts` | unit | AC-5, 64 | S1 |
| T2 `eval-pipeline-scoring.test.ts` | unit | AC-6, 37–44, 50, 76; TAC3 | S4, S22 |
| T3 `eval-pipeline-helpers.test.ts` | unit | AC-11–13, 24, 25, 64, 70, 74, size | S5 |
| T4 `eval-pipeline-runner.test.ts` | unit | AC-29, 32, 41, 62 #2 | S6 |
| T5 `eval-pipeline-views.test.ts` | unit | AC-45, 49, 52–54, 59 | S9 |
| T6 `eval-pipeline-cases.it.test.ts` | integration | AC-3, 4, 7, 9–16, 21, 24–26, 33, 62 #5, 67, 69, 70, 72, 74, 77, 79 | S12 |
| T7 `eval-pipeline-runs.it.test.ts` | integration | AC-1, 2, 30–32, 34–37, 47, 56, 57, 61, 62 #3, 75, 79, 80; delete cascade; boot reap | S12 |
| T8 `eval-pipeline-fixture.test.ts` | unit | AC-62 #4 | S12 |
| T9 `client/src/components/eval-case-modal/helpers.test.ts` | unit | AC-23, diff → `PrFile[]` | S15 |
| T10 `…/eval-case-modal/EvalCaseModal.test.tsx` | unit | AC-17, 22, 23, 27, 65–68, 71, 74, 77, 78 | S15 |
| T11 `PR/TurnIntoEvalCase/TurnIntoEvalCase.test.tsx` | unit | AC-8–10, 14–16 | S16 |
| T12 `AE/_components/EvalsTab/EvalsTab.test.tsx` | unit | AC-18–21, 28, 31, 33 | S17 |
| T13 `EV/_components/EvalDashboardView/EvalDashboardView.test.tsx` | unit | AC-34, 35, 58 (NAV has `eval`), 59–61 | S18 |
| T14 `EV/[agentId]/_components/AgentEvalDetail/AgentEvalDetail.test.tsx` | unit | AC-28, 43–51 | S19 |
| T15 `EV/[agentId]/_components/CompareRunsModal/CompareRunsModal.test.tsx` | unit | AC-52–57, 76, 80 | S20 |

## Migrations & contracts
- `cd server && pnpm db:generate` after S2 (three new tables only); the implementer never runs `db:migrate`.
- Contract: the new `contracts/eval-pipeline.ts` plus one barrel line, S1 only, identical in both copies; no existing field changes.

## Out of scope
- `eval_cases`/`eval_runs` and `E/{cli,service,repository,replay,replay-cli,helpers,fixture}.ts` (AC-2); `E/constants.ts` is append-only.
- reviewer-core, mcp-server, e2e, `db/seed.ts` (no seeded cases), `server/vitest.config.ts`, every other `*/src/vendor/**` file.
- Run on save, skill-owned cases, runs of old versions, LLM scoring, line tolerance, MCP tools, CI gating; package installs (M1).

<!-- implementer-brief:end -->

## Design notes

### Contract (`contracts/eval-pipeline.ts`)
- `EvalExpectationKind` = `must_find | must_not_flag`. `EvalExpectation` (`.strict()`, `superRefine` rejects start > end with a `path`): `expect`, `file` (min 1), `start_line` (int ≥ 1), `end_line?` (int ≥ 1), and display-only `title?`, `severity?`, `category?` (strings).
- `EvalPrMeta` `{ repo_id: string|null, repo, pr_number, title, head_sha }`. `EvalSuiteCaseInput` `{ diff, files: string[], pr_meta: EvalPrMeta|null }`. `EvalCaseSource` `{ finding_id, pr_id, repo_id, pr_number }`, all nullable.
- `EvalCaseStatus` = `passed | failed | errored`. `EvalFindingBrief` `{ file, start_line, end_line, title, severity }`. `EvalCaseResult` `{ status, expected_count, actual_count, must_find_total, must_find_matched, noise, kept, dropped, duration_ms, cost_usd|null, error|null, ran_at, agent_version, findings: EvalFindingBrief[] }`.
- `EvalSuiteCase` `{ id, agent_id, name, input, expected: EvalExpectation[], source, created_at, updated_at, last_result|null }`. `EvalCaseSaveBody` `{ name (min 1), input: { diff, pr_meta? }, expected_output: unknown, source_finding_id?: uuid, draft_run_token?: string }`.
- `EvalDraft` `{ agent_id, agent_name, provider, model, name, input, expected, source, seeded_from: accepted|dismissed }`. `EvalDraftSeed` = discriminated union on `kind`: `draft` `{ draft }` | `existing` `{ case }`. `EvalDraftRunBody` `{ input: { diff, pr_meta? }, expected_output: unknown }`. `EvalDraftRunResult` `{ result, run_token }`.
- `EvalMetrics` `{ recall, precision, citation_accuracy }`, each `number(0..1)|null`. `EvalSkillRef` `{ id, name, version }`. `EvalSuiteRunStatus` = `running | completed | failed`. `EvalSuiteRun` `{ id, agent_id, agent_name, agent_version, provider, model, skills, status, started_at, finished_at|null, cases_total, cases_done, cases_passed, cases_errored, metrics, cost_usd|null }`. `EvalSuiteRunDetail` = run + `results: { case_id|null, case_name, result }[]`.
- `EvalSuiteTrendPoint` `{ run_id, started_at, agent_version, cost_usd, metrics }`. `EvalMetricDeltas` (nullable numbers). `EvalAlert` `{ version, dropped: { metric, points }[], rose: { metric, points }[] }`. `EvalPeriod` = `30d | all`.
- `EvalAgentDetail` `{ agent: { id, name, provider, model, version }, cases_total, runs_total, latest|null, deltas, alert|null, trend, runs }`. Only `trend` and `runs` follow the period.
- `EvalPromptDiffLine` `{ op: add|del|same, text }`. `EvalCompare` `{ older, newer, deltas: metrics + cost_usd, same_version, prompt_diff|null, skills_diff: { added, removed, changed: { name, from, to }[] }, same_skills, promote: { version, restore: EvalSkillRef[], missing: string[] }|null }`. `EvalPromoteResult` `{ agent_id, version }`.
- `EvalDashboardAgent` `{ agent_id, name, model, enabled, cases_total, latest|null, sparkline: number[] }` (recall per completed run, assumption). `EvalDashboardView` `{ agents, recent_runs }`. `EvalRunAllPreview` `{ agents: { agent_id, name, model, cases }[], total_cases, skipped: { agent_id, name, reason: run_in_progress|no_api_key }[] }`. `EvalRunAllResult` `{ started: { agent_id, run_id }[], skipped }`.

### Schema
- `eval_suite_cases`:
  - columns: `id` uuid pk; `workspace_id` → workspaces cascade; `agent_id` → agents cascade, not null; `name`; `input_diff` not null; `input_files` jsonb not null; `input_meta` jsonb; `expected` jsonb not null; `source_finding_id` → findings set null; `source_pr_id` → pull_requests set null; `last_result` jsonb; `created_at`/`updated_at` timestamptz.
  - indexes: unique `eval_suite_cases_agent_name_idx` (agent_id, name); unique `eval_suite_cases_source_finding_idx`; `eval_suite_cases_source_pr_idx`.
- `eval_suite_runs`:
  - columns: `id`; `workspace_id` cascade; `agent_id` → agents cascade; `agent_version` int; `provider`; `model`; `skills` jsonb; `status` text enum; `started_at`; `finished_at`; `cases_total`/`cases_done`/`cases_passed`/`cases_errored` int default 0; `recall`/`precision`/`citation_accuracy`/`cost_usd` double, nullable.
  - indexes: `eval_suite_runs_agent_started_idx` (agent_id, started_at); `eval_suite_runs_workspace_started_idx`.
- `eval_case_results`:
  - columns: `id`; `suite_run_id` → runs cascade; `case_id` → cases cascade; `case_name`; `result` jsonb; `created_at`.
  - indexes: `eval_case_results_run_idx`; `eval_case_results_case_idx`.
- uuid primary keys follow the repo convention, against the skill's identity default.
- Deleting a case cascades its results; the run's stored metrics stay (AC-21). Deleting an agent cascades both (Edge "Agent deleted").

### Repository (`repository/pipeline.repo.ts`)
- Cases: `listCases(agentId)` (newest first), `getCase(ws, id)`, `caseBySourceFinding(findingId)`, `caseNames(agentId)`, `countCases(agentId)`, `insertCase`, `updateCase` (also sets `lastResult: null` and `updatedAt`), `deleteCase`, `setLastResult`.
- Runs: `insertRun`, `recordCaseResult(runId, result)` (insert plus `cases_done = cases_done + 1` and the passed/errored counters, in one transaction), `completeRun`, `getRun(ws, id)`, `resultsForRun`, `listRuns(agentId, since: Date|null)` (newest first), `latestRunsByAgent(ws)`, `recentRuns(ws, limit)`, `hasRunning(agentId)`, `reapRunning()`.
- `transaction(fn)`.

### Scoring rules (`pipeline-scoring.ts`)
Exports: `linesIntersect`, `findingMatches`, `scoreCase({ expected, kept, droppedCount })`, `aggregateRun(scores, erroredCount)`, `metricDeltas`, `regressionAlert`, `skillSetDiff`, `trendPoints`.
- Matching: same path, and `[min,max]` ranges intersect (AC-38).
- Per case: `mustFindMatched` / `mustFindTotal`.
- Noise: a kept finding that intersects a `must_not_flag`, or any kept finding when `expected` is `[]`.
- Pass: every must-find is matched and noise is 0.
- Run metrics, over completed cases only:
  - recall = Σmatched / Σmust_find;
  - precision = 1 − Σnoise / Σkept;
  - citation = Σkept / Σ(kept + dropped);
  - a zero denominator gives null.
- A run where every case errored is `failed` with null metrics and gives no trend point.
- Deltas use the previous completed run; either side null gives null.
- Alert: `Math.round(Δ × 100)` < 0 for any metric. It lists the drops and the rises.
- `skillSetDiff` matches skills by `id`.
- T2 cases include adjacency: finding 10–12 vs expectation 13 → no match; 12–14 → match; another file → no match.

### Helpers (`pipeline-helpers.ts`, `constants.ts`)
- `caseName(kind, title, taken)`: prefix `must-find-` / `must-not-flag-`, then the kebab title cut to 48 at the last hyphen, then `-2`, `-3`…
- `seedExpectation(finding)`: one element at the finding's file and lines; `must_find` when accepted, otherwise `must_not_flag`; display fields copied.
- `normaliseExpectations(value)`: `end_line ??= start_line`, or `{ index, message }`.
- `validateCase({ diff, expected, name, takenNames, parseDiff })`:
  - AC-24: no file or no hunk (a hunks-only paste parses to zero files, research Q3);
  - AC-25: reviewer-core `groundFindings` over synthetic `kind: 'finding'` findings, with the index named;
  - AC-26;
  - 256 KB via `Buffer.byteLength`.
- `runTokenHash`: sha256 (`node:crypto`) over canonical JSON of diff, expected, agent id, version and skills.
- `pool(limit, tasks)`.
- Constants: `EVAL_NAME_TITLE_MAX = 48`, `EVAL_MAX_DIFF_BYTES = 262_144`, `EVAL_MAX_SUITE_CASES = 200`, `EVAL_CASE_CONCURRENCY = 3`, `EVAL_RECENT_RUNS = 20`, `EVAL_DRAFT_TOKEN_TTL_MS = 3_600_000` (assumption), `EVAL_CASE_CALL_DEADLINE_MS = 240_000` (assumption).

### Service deps (`eval/types.ts`)
- `EvalAgentsPort`: `getById`, `listAll`, `skillsFor(agentId)` → `{ id, name, version, enabled, rendered }[]`, `versionConfig(agentId, version)`.
- `EvalReviewSourcePort`: `findingSource(ws, id)` → `FindingSource`.
- `EvalPromotePort`: `promote(ws, agentId, { config, skillIds })`.
- Plus: `repo`, `llm(id)`, `review`, `parseDiff`, `callOptions`, `countTokens`, `estimateCost`, `now()`.
- `EvalAgentSnapshot` `{ id, provider, model, systemPrompt, strategy, version, skills: EvalSkillRef[], rendered: string[] }` (enabled skills only, TQ3).

### Runner (`pipeline-runner.ts`)
- `runCase(snapshot, llm, input, expected, deps)` → `EvalCaseResult`.
- Parse the diff, then call the injected `review` with **only** `systemPrompt, model, diff, llm, strategy, skills` (when non-empty), `countTokens, estimateCost`, the call options and `requireParameters: true`.
- No callers, repoMap, specs, intent, repoRules, changedFiles or prDescription (AC-29).
- Kept = `outcome.review.findings`, dropped = `outcome.dropped.length`, then `scoreCase`. The call is timed.
- A throw or a parse failure gives `errored` with the redacted reason (AC-32).
- T4 uses the real `reviewPullRequest` with `MockLLMProvider` and `ThrowingLLMProvider`. It asserts one `completeStructured` per case and none from scoring (AC-62 #2), and no `## Project context` or callers section in the request.

### findingSource (reviews, S7)
- `helpers.ts`: pure `fileDiffSection(raw, path)` returns the `diff --git` section whose `+++ b/<path>` equals `path` exactly, or null. The S7 test checks that `src/a.ts` does not match `src/a.tsx` and that a missing file gives null.
- `FindingSource` `{ finding: { id, file, start_line, end_line, title, severity, category, accepted, dismissed }, agentId|null, pr: { id, repo_id, repo, number, title, head_sha }, fileDiff|null }`.
- Steps: `repo.findingContext` (workspace check), then `repo.getRepo`, then `loadDiff(this.container.git, this.repo, pull, { owner, name })` → `fileDiffSection`.
- Fallback when that is empty, or `loadDiff` throws: `diffFromPrFiles` over that file's stored `patch`. Still nothing → `fileDiff: null` (AC-14).

### Promote (agents, S8)
- `promote(workspaceId, agentId, { config, skillIds })` → `{ version } | undefined`.
- Steps: `lockById`, then `setSkills(agentId, skillIds)`, then `update(…)` copying provider, model, system_prompt, strategy, ci_fail_on and repo_intel, with `{ bumpVersion: true }`.
- A new version is always written, and its snapshot records the restored skills (AC-56).
- `output_schema` is passed only when it differs. A vanished row throws.

### Service behaviour (`pipeline-service.ts`)
- `seedDraft(ws, findingId)`: undecided → `finding_undecided`; no agent → `agent_missing`; a saved case → `existing`; `fileDiff` null → `no_diff_text` ("no diff text available for <file>"); otherwise a draft. Writes nothing.
- `createCase(ws, agentId, body)`:
  - validate, including the 200-case cap;
  - a source that already has a case → `case_exists` with `details.case_id`; a unique violation (race) maps to the same code;
  - a valid, unexpired token whose hash equals the saved input, expected and current snapshot → its result becomes `last_result`;
  - the token is consumed in every case.
- `updateCase` clears `last_result`. `deleteCase`.
- `draftRun(ws, agentId, body)`: snapshot, then the key check (`no_api_key`, "no API key for <provider>"), then validate, then `runCase`, then store the token. Persists nothing.
- `runSavedCase(ws, caseId)`: same guard, then `setLastResult`. Not a suite run.
- `startSuiteRun(ws, agentId)`:
  - refusals: `suite_empty`, `suite_too_large`, `run_in_progress` (the in-memory `Set` or `hasRunning`), `no_api_key`;
  - snapshot, then `insertRun`;
  - fire-and-forget `pool(3)` over the cases with that one snapshot; each result is recorded as it lands;
  - at the end `aggregateRun` → `completeRun`; a crash marks the run failed; `finally` removes the agent from the `Set`.
- `runAllPreview` / `runAll`: enabled agents with ≥ 1 case; skip `run_in_progress` and `no_api_key`, by name.
- `getRun`, `agentDetail(period)`.
- `compare(a, b)`: same agent, else `runs_not_comparable`. Promote is offered when `newer.agent_version` ≠ the current version. The restore list is the newer run's skills that still exist; the rest are `missing`.
- `promote(runId)`: no stored config → `version_config_missing`; otherwise the promote port.
- `dashboard`: all agents, newest latest run first, never-run agents last; recent 20.
- `reapStaleRuns`.
- T5 covers the views: the period filter, deltas vs the previous completed run, same version → `prompt_diff: null`, promote only when newer ≠ current, ordering, the 20 cap.

### Container wiring (S10)
- `get evalPipeline(): EvalPipelineService`, lazy.
- `repo: new EvalPipelineRepository(this.db)`.
- The agents port over `this.agentsRepo` and `this.skillsRepo` (skill `version`; `renderSkillBlock`; enabled only).
- `findingSource` via `new ReviewService(this)`; `promote` via `new AgentsService(this)`.
- `llm: (id) => this.llm(id)`, `review: reviewPullRequest`, `parseDiff: parseUnifiedDiff`.
- Call options from the same `reviews/constants.ts` values the executor uses, plus `EVAL_CASE_CALL_DEADLINE_MS`.
- Tokenizer count and price-book estimate.

### Routes (`eval/routes.ts`; RL = rate limit 10/min)
- Cases:
  - `GET /agents/:id/eval-cases` → `EvalSuiteCase[]`;
  - `POST /agents/:id/eval-cases` → 201 `EvalSuiteCase`;
  - `PUT /eval-cases/:id` → `EvalSuiteCase`;
  - `DELETE /eval-cases/:id` → 204;
  - `POST /eval-cases/:id/runs` (RL) → `EvalSuiteCase`.
- Drafts:
  - `GET /findings/:id/eval-draft` → `EvalDraftSeed`;
  - `POST /agents/:id/eval-draft-runs` (RL) → `EvalDraftRunResult`.
- Suite runs and views:
  - `POST /agents/:id/eval-runs` (RL) → 202 `EvalSuiteRun`;
  - `GET /agents/:id/eval?period=` → `EvalAgentDetail`;
  - `GET /eval-runs/:id` → `EvalSuiteRunDetail`;
  - `GET /eval-runs/compare?a=&b=` → `EvalCompare`;
  - `POST /eval-runs/:id/promote` (RL) → `EvalPromoteResult`.
- Dashboard:
  - `GET /eval/dashboard` → `EvalDashboardView`;
  - `GET /eval/run-all` → `EvalRunAllPreview`;
  - `POST /eval/run-all` (RL) → `EvalRunAllResult`.
- Error codes:
  - 409: `finding_undecided`, `agent_missing`, `case_exists`, `run_in_progress`;
  - 422: `no_diff_text`, `validation_error` (`details: { index?, field, message }[]`), `suite_empty`, `suite_too_large`, `no_api_key`, `version_config_missing`, `runs_not_comparable`;
  - 404: `not_found`.

### Hooks (S14)
`useEvalCases`, `useEvalAgentDetail(agentId, period)`, `useEvalRun(runId)`, `useEvalDashboard`, `useEvalCompare(a, b)`, `useEvalDraftSeed`, `useSaveEvalCase`, `useUpdateEvalCase`, `useDeleteEvalCase`, `useRunEvalCase`, `useRunEvalDraft`, `useStartEvalRun`, `useRunAllPreview`, `useRunAllAgents`, `usePromoteEvalRun`. Query keys are `const` tuples.

### Modal (S15)
- Name field.
- Diff tab: a textarea plus a `DiffViewer` preview of `diffToPrFiles(raw)`.
- Files tab.
- PR meta tab: meta or "none", and the AC-77 links (`/repos/<repo_id>/pulls/<n>` and `#finding-<id>`), shown as unavailable when the source is null.
- Expected-output JSON with a valid/parse-error indicator and "Finding skeleton".
- Title, subtitle and banner for a seeded draft.
- "Run case" → confirm with the model → result line. It is stale when the input or expected output differs from what ran.
- Save: the server's reasons, with the element; `case_exists` → "Open existing case"; a success toast with a link.
- Cancel/close: silent when there are no edits and no run, otherwise `ConfirmModal` "Discard draft?"/"Discard changes?".
- `JSON.parse` lives only in `helpers.ts`, inside a try.

### Demo (S24)
1. Build ≥ 8 cases on Security Reviewer from real accepted and dismissed findings on a forge-synced PR with diff text.
2. Run with the old prompt.
3. Edit the prompt, run again, compare.
4. Break the prompt, run a third time, and see lower precision.
5. Promote back.

### Pass-1 review (resolved — see *Decisions recorded*)
- TQ1–TQ6: defaults taken (name ≤ 48, concurrency 3, version + skills match, `#finding-<id>`, `.it` route test, demo doc path).
- GAP1–GAP4: closed in the spec (AC-56/80, AC-62 #4/63, AC-79, AC-12).
- REC1–REC6: accepted as D1–D6.
- D1–D11: option A each.
  - D1: new tables.
  - D2: new contract file.
  - D3: server-side prompt diff.
  - D4: scoring in the server eval module.
  - D5: background suite run, polled.
  - D6: synchronous draft/single run with a token.
  - D7: reviews port.
  - D8: client chart wrapper.
  - D9: `scripts/verify-l06.sh` via `server/package.json`.
  - D10: `ScriptedLLMProvider`.
  - D11: StrykerJS.
- D12: multi-agent.
- R1: answered by research-stryker.md.

## Context applied
- `specs/011-eval-pipeline.md` (re-approved after GAP1–GAP4) → every step; AC-79/80 → S9, S20.
- `docs/plans/assets/34-eval-pipeline/research.md` Q1–Q8 → S6 (review slots), S7 (`loadDiff`/`diffFromPrFiles`), S8 (promote caveats), S9 (in-flight guard), S12 (mocks).
- `docs/plans/assets/34-eval-pipeline/research-stryker.md` → S21 (versions, `inPlace`, gitignore, trial run first).
- `server/insights/gotchas.md` → DB & migrations (S2, S3), Tests (S12), Security 1 (S9, S11), Git & diffs (S7), Tooling 1 (S10).
- `client/insights/gotchas.md` → UI 1 nav (S18), UI 2 load-before-render (S17), Tests 1–3 (S13–S20), Tooling (vitest filters, Suspense S19), `styles.ts` (S15).
- Root `INSIGHTS.md` → "the two vendored `shared` copies are not actually in sync" (S1), "a reviewer-core input-type change breaks server tests…" (S1), "the auto-mode permission check blocks an implementer from writing a migration file" (Risks).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1, S3–S11 | — |
| `engineering-insights` | preload | Context applied, Insights to record | — |
| `zod` | on demand (S1) | S1, S5, S9, S11 | — |
| `fastify-best-practices` | on demand (S10) | S10, S11, S12 | — |
| `drizzle-orm-patterns` | on demand (S2) | S2, S3, S12 | — |
| `postgresql-table-design` | on demand (S2) | S2, S3 | — |
| `typescript-expert` | on demand (S1) | S1–S12, S14–S22 | — |
| `security` | on demand (S1) | S1, S5–S7, S9, S11, S15, S20, S23 | — |
| `frontend-architecture` | on demand (S13) | S13–S20 | — |
| `react-best-practices` | on demand (S14) | S14–S20 | — |
| `next-best-practices` | on demand (S13) | S13–S20 | — |
| `react-testing-library` | on demand (S15) | S15–S20 | — |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `vendor/shared/contracts/eval-pipeline.ts` (both copies), `index.ts` | ports | new / changed |
| server | `db/schema/eval.ts`, migration | infrastructure | changed / new |
| server | `modules/eval/repository/pipeline.repo.ts` | infrastructure | new |
| server | `modules/eval/{pipeline-scoring,pipeline-helpers,pipeline-views}.ts` | pure | new |
| server | `modules/eval/{types,pipeline-runner,pipeline-service,routes}.ts`, `constants.ts` | application / transport | new / appended |
| server | `modules/reviews/{service,helpers}.ts`, `modules/agents/service.ts` | application | changed |
| server | `platform/container.ts`, `app.ts`, `modules/index.ts` | composition / boot | changed |
| server | test helpers, 9 test files, Stryker config, `package.json` | tests / tooling | new / changed |
| client | `messages/en/eval.json`, `lib/hooks/eval.ts`, `components/eval-case-modal/` | i18n / data / shared UI | changed / new |
| client | FindingCard + `TurnIntoEvalCase`, AgentEditor + `EvalsTab`, `app/eval/**`, `vendor/ui/nav.ts` | route UI | changed / new |
| repo | `scripts/verify-l06.sh`, `.gitignore`, `server/docs/eval-pipeline-demo.md` | tooling / docs | new / changed |

## Risks & open questions
- **Vendor edit** `client/src/vendor/ui/nav.ts` (S18), the approved exception. A vendor refresh silently drops the line; the comment points to `client/INSIGHTS.md`.
- **Stryker sandbox/alias** (research: inference, not run). The S21 trial run is the first Done-when. If it fails, the group stops and reports.
- **AC-12 limitation** (GAP4, accepted). The seed uses the PR's current SHAs. `loadDiff` may also fetch into the clone, which is a disk side effect, slow, but bounded by its timeout.
- **Synchronous draft run.** It can hold a request for up to `EVAL_CASE_CALL_DEADLINE_MS` (240 s, assumption). A proxy or browser could cut it first.
- **In-memory state.** The in-flight `Set` and the tokens are lost on restart. A lost token means Save stores the case as "never run" (AC-70 allows that), and the boot reap fails runs left `running`.
- **Migration write.** If the permission classifier blocks the generated migration, the implementer stops and the main session asks the user (root INSIGHTS 2026-09-30).
- **Unproven rendering.** `DiffViewer` has not rendered a synthetic `PrFile` before (T10 checks it). Recharts does not lay out in jsdom, so tests cover the tooltip formatter, not the chart.
- **Assumptions:** 240 s deadline, 1 h token TTL, recall as the dashboard sparkline, `Gauge` icon, tooltip via `title`, uuid primary keys.
- **Doc vs code.** `server/docs/architecture.md` has no eval-module section, and research found no `reviews/adhoc.ts` (the precedent is `eval/replay.ts`).
- **Mode re-check.** The real steps include a migration, a contract and paid routes, so `multi-agent` stands.
- **Brief size.** The brief above the marker is over the ~20,000-character target, because the traceability table (one row per AC, 77 rows) and *Decisions recorded* are mandatory. The shapes are moved below the marker under DN.

## Handed off
- architecture-reviewer: the `container.evalPipeline` getter; ports in `eval/types.ts`; `ReviewService.findingSource` and `AgentsService.promote` as the only cross-module seams; file names `pipeline-*.ts` and `repository/pipeline.repo.ts`; that `pipeline-scoring.ts` stays pure.
- security review: run-start routes (LAN, rate limits, one run per agent, AC-79 before any spend); draft-run token trust (AC-70); the 256 KB / 200 limits; untrusted diff, PR meta, model text and prompts rendered as text (S15, S20); error redaction (S6); secret isolation in `scripts/verify-l06.sh`.

## Insights to record
- `server/INSIGHTS.md` · Codebase Patterns — reviews store no reviewed SHA, so any "diff the review ran on" can only be re-derived from the PR's current `base_sha`/`head_sha` (`server/src/db/schema/reviews.ts:17-34`, `pulls.ts:20-21`).
- `server/INSIGHTS.md` · Tool & Library Notes — `diff` 9.0.0 ships its own types (`server/node_modules/diff/package.json` `types: libcjs/index.d.ts`), so `@types/diff` ^8 may be redundant.

## Red-flags check
- [x] Every AC maps to at least one step or test (tooling TAC1–TAC3 → S21, S22, T2)
- [x] Every spec AC-n has a row in *Spec traceability* with a step or test
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; technical choices are in *Decisions needed*, product gaps are GAPn
- [x] Groups end type-checking; parallel groups share no file (G8 ∥ G5–G7: server vs client)
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [ ] The brief above the marker is under ~20,000 characters — see *Risks* → Brief size
- [x] Pass 1 (n/a in pass 2)
- [x] Execution mode recommended per the D4 rule (multi-agent)
- [x] Every step's *Skills to apply* is complete (the implementer reads only those)
- [x] `bash .claude/skills/sdd/scripts/sdd.sh plan-lint <plan>` prints `plan-lint: ok`

## Handoffs → G1

## Steps
| Step | Status | Files changed |
|---|---|---|
| S1 [Contract] | done | `{server,client}/src/vendor/shared/contracts/eval-pipeline.ts` (new, byte-identical), both `vendor/shared/index.ts` (one barrel line), `server/test/eval-pipeline-contracts.test.ts` (T1) |
| S2 | done | `server/src/db/schema/eval.ts`, `server/src/db/migrations/0024_cold_switch.sql`, `meta/0024_snapshot.json`, `meta/_journal.json` |
| S3 | done | `server/src/modules/eval/repository/pipeline.repo.ts` (new) |

### Handoff to the next group
- Contract (`@devdigest/shared`, `contracts/eval-pipeline.ts`): `EvalExpectation`, `EvalExpectationKind`, `EvalPrMeta`, `EvalSuiteCaseInput`, `EvalCaseSource`, `EvalCaseStatus`, `EvalFindingBrief`, `EvalCaseResult`, `EvalSuiteCase`, `EvalCaseSaveBody`, `EvalDraft`, `EvalDraftSeed`, `EvalDraftRunBody`, `EvalDraftRunResult`, `EvalMetrics`, `EvalSkillRef`, `EvalSuiteRun(Status)`, `EvalSuiteRunDetail`, `EvalSuiteTrendPoint`, `EvalMetricDeltas`, `EvalAlert`, `EvalPeriod`, `EvalAgentDetail`, `EvalPromptDiffLine`, `EvalCompare`, `EvalPromoteResult`, `EvalDashboardAgent`, `EvalDashboardView`, `EvalRunAllSkipReason`, `EvalRunAllPreview`, `EvalRunAllResult` — Zod schema + same-named type each; ISO date strings; `EvalMetrics` fields `number(0..1)|null`. `expected_output` is `z.unknown()` on purpose — S5 parses it with `safeParse`.
- Migration `0024_cold_switch.sql` (not applied; `db:migrate` is the user's). Tables `evalSuiteCases`, `evalSuiteRuns`, `evalCaseResults` in `db/schema/eval.ts`; `evalCaseResults.caseId` nullable (deleted case keeps run metrics).
- `EvalPipelineRepository(db: DbExecutor)` in `modules/eval/repository/pipeline.repo.ts`. Row types `SuiteCaseRow`, `SuiteRunRow`, `CaseResultRow`; inputs `SuiteCaseInsert`, `SuiteCasePatch`, `SuiteRunInsert`, `CaseResultInsert { caseId, caseName, result, status }`, `SuiteRunCompletion`. Methods: `transaction`, `listCases(ws, agentId)`, `getCase(ws, id)`, `caseBySourceFinding(ws, findingId)`, `caseNames(ws, agentId)`, `countCases(ws, agentId)`, `insertCase`, `updateCase(ws, id, patch)`, `deleteCase(ws, id): boolean`, `setLastResult(ws, id, result)`, `insertRun`, `recordCaseResult(runId, r)`, `completeRun(runId, c)` (sets `finishedAt`), `getRun(ws, id)`, `resultsForRun(runId)`, `listRuns(ws, agentId, since|null)`, `latestRunsByAgent(ws)` (newest of ANY status — filter to completed where needed), `recentRuns(ws, limit)`, `hasRunning(agentId)`, `reapRunning(): number`.
- Deviation (trivial): workspace-scoped reads take `workspaceId` first; `pr_meta` is `.nullish()`.
- Pre-existing, not ours: `check-module.sh eval` flags `modules/eval/replay-cli.ts:13-25` cross-module imports.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1, S3 | |
| `zod` | on demand | S1 | |
| `typescript-expert` | on demand | S1, S2, S3 | |
| `security` | on demand | S1 | |
| `drizzle-orm-patterns` | on demand | S2, S3 | |
| `postgresql-table-design` | on demand | S2 | |

## Handoffs → G2

## Steps
| Step | Status | Files changed |
|---|---|---|
| S4 | done | `server/src/modules/eval/pipeline-scoring.ts`, `server/test/eval-pipeline-scoring.test.ts` (T2, 18 passed) |
| S5 | done | `server/src/modules/eval/pipeline-helpers.ts`, `eval/constants.ts` (append), `server/test/eval-pipeline-helpers.test.ts` (T3, 23 passed) |
| S6 | done | `server/src/modules/eval/types.ts`, `server/src/modules/eval/pipeline-runner.ts`, `server/test/eval-pipeline-runner.test.ts` (T4, 6 passed) |

### Handoff to the next group
- `pipeline-scoring.ts`: `linesIntersect`, `findingMatches(finding, expectation)`, `scoreCase({expected, kept, droppedCount}) → CaseScore`, `aggregateRun(scores, erroredCount) → {status: 'completed'|'failed', metrics, cases_passed}`, `metricDeltas(latest|null, previous|null)`, `regressionAlert(version, deltas) → EvalAlert|null` (points are positive whole numbers in both `dropped` and `rose`), `skillSetDiff(older, newer)`, `trendPoints(TrendRunInput[])` (completed runs only, oldest first).
- `pipeline-helpers.ts`: `caseName(kind, title, taken)`, `seedExpectation(finding, kind: 'accepted'|'dismissed')`, `normaliseExpectations(value) → {ok, expected} | {ok:false, index, message}`, `validateCase({diff, expected, name, takenNames, parseDiff}) → {ok, diff, files, expected} | {ok:false, code, message, index?}` with codes `name_empty`, `name_taken`, `diff_too_large`, `diff_unparsable`, `expected_invalid`, `expectation_ungrounded`; `runTokenHash({diff, expected, agentId, version, skills})`; `pool(limit, tasks)`; `EVAL_*` constants in `eval/constants.ts`. `validateCase` also refuses a hunks-only paste (`parseUnifiedDiff` → zero files).
- `pipeline-runner.ts`: `runCase(snapshot, llm, {diff}, expected, deps: CaseRunnerDeps)` never throws, returns `EvalCaseResult`; `deps.now()` returns a `Date`; `describeJobError` redacts stored error text.
- `eval/types.ts`: `ReviewFn`, `ReviewParams`, `EvalAgent`, `EvalAgentSkill`, `EvalAgentsPort`, `EvalReviewSourcePort`, `EvalPromotePort`, `FindingSource`, `EvalAgentSnapshot`, `EvalPipelineServiceDeps`.
- **For G3:** `FindingSource` in `eval/types.ts` is G2's guess — S7's `ReviewsService.findingSource` must return a structurally compatible value, or adjust `types.ts`. S8's `promote` must return `{ version: number }`. The S10 container getter maps the agents service onto `EvalAgentsPort`: `getById`, `listAll`, `skillsFor` (rendered bodies), `versionConfig`.
- Architecture note: `validateCase` value-imports `groundFindings` from `@devdigest/reviewer-core` (pure core).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S4, S5, S6 | |
| `typescript-expert` | on demand | S4, S5, S6 | |
| `zod` | on demand | S5 | |
| `security` | on demand | S5, S6 | |

## Handoffs → G3

## Steps
| Step | Status | Files changed |
|---|---|---|
| S7 | done | `server/src/modules/reviews/{helpers,service}.ts`, `server/test/reviews-file-section.test.ts` (4 passed) |
| S8 | done | `server/src/modules/agents/service.ts` (T7 promote cases are G4's) |
| S9 | done | `server/src/modules/eval/{pipeline-service,pipeline-views}.ts`, `eval/types.ts` (port shapes corrected), `server/test/eval-pipeline-views.test.ts` (T5, 8 passed) |
| S10 | done | `server/src/platform/container.ts`, `server/src/app.ts` (unit 890 passed) |

### Handoff to the next group
- `container.evalPipeline` → `EvalPipelineService` (`modules/eval/pipeline-service.ts`). Cases: `listCases(ws, agentId)`, `seedDraft(ws, findingId)`, `createCase(ws, agentId, body)`, `updateCase(ws, caseId, body)`, `deleteCase(ws, caseId): boolean` (false → 404). Runs: `draftRun(ws, agentId, body)`, `runSavedCase(ws, caseId)`, `startSuiteRun(ws, agentId): EvalSuiteRun` (→ 202), `getRun(ws, runId)`. Views/actions: `runAllPreview(ws)`, `runAll(ws)`, `agentDetail(ws, agentId, period)`, `dashboard(ws)`, `compare(ws, a, b)` (orders the two runs by `started_at`), `promote(ws, runId)`, `reapStaleRuns()` (called from `app.ts` after the agent-run reaper).
- Errors are `AppError` codes — 409: `finding_undecided`, `agent_missing`, `case_exists` (`details.case_id`), `run_in_progress`; 422: `no_diff_text`, `validation_error` (`details: [{ index?, field, message }]`), `suite_empty`, `suite_too_large`, `no_api_key`, `version_config_missing`, `runs_not_comparable`; 404 via `NotFoundError`. **Check the shared error handler maps `AppError.code` + `details`.**
- S7: `fileDiffSection(raw, path)` matches the exact `+++ b/<path>`; `ReviewService.findingRef` (cheap lookup for Save, no `loadDiff`) and `findingSource` (`fileDiff` from `loadDiff`, fallback stored `pr_files` patch, else null). Ports `EvalReviewSourcePort.findingRef/findingSource`.
- S8: `AgentsService.promote(ws, agentId, { config, skillIds }) → { version } | undefined`, one transaction after `lockById`, restores skills (workspace-checked), new version via `bumpVersion`.
- Port changes in `eval/types.ts`: `FindingSource` is snake_case with accepted/dismissed booleans and `fileDiff|null`; `llm` returns `Promise<LLMProvider>` (`container.llm` is async and throws `ConfigError` → service maps to `no_api_key` before any spend); added `EvalAgentsPort.existingSkillIds`.
- For S12 tests: `container.llm` is `overrides.llm` or a secret lookup — AC-79 needs a provider with neither. Draft tokens and the in-flight `Set` live in service memory; each `createCase` consumes its token (single-use, 1 h).
- S11 routes must be registered in `modules/index.ts` and must rate-limit the paid starts (suite, draft run, single-case run, run-all).
- Review notes: the container value-imports `ReviewService` and `AgentsService` (the two design-note seams, mapped structurally onto the eval ports); `createCase` checks `source_finding_id` belongs to the workspace and takes `pr_id` from the server; stored error text goes through `describeJobError`.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S7–S10 | |
| `typescript-expert` | on demand | S7–S10 | |
| `security` | on demand | S7, S9 | |
| `zod` | on demand | S8, S9 | |
| `fastify-best-practices` | on demand | S10 | no route code in this group |

## Handoffs → G4

## Steps
| Step | Status | Files changed |
|---|---|---|
| S11 | done | `server/src/modules/eval/routes.ts` (new), `server/src/modules/index.ts` (registry key `eval: evalRoutes`) |
| S12 | done | `server/test/helpers/llm-stubs.ts` (+`ScriptedLLMProvider`, `LlmScript`), `server/test/helpers/eval-pipeline-{suite,env}.ts`, `server/test/eval-pipeline-fixture.test.ts` (T8, 2), `eval-pipeline-cases.it.test.ts` (T6, 10), `eval-pipeline-runs.it.test.ts` (T7, 13); `eval.it.test.ts` still 10 passed (AC-2) |

### Handoff to the next group
- Routes (`modules/eval/routes.ts`): cases `GET`/`POST /agents/:id/eval-cases` (201), `PUT`/`DELETE /eval-cases/:id` (204), `POST /eval-cases/:id/runs`; drafts `GET /findings/:id/eval-draft`, `POST /agents/:id/eval-draft-runs`; runs `POST /agents/:id/eval-runs` (202), `GET /agents/:id/eval?period=30d|all` (default `30d`), `GET /eval-runs/:id`, `GET /eval-runs/compare?a=&b=`, `POST /eval-runs/:id/promote`; dashboard `GET /eval/dashboard`, `GET`/`POST /eval/run-all`. Paid calls + promote: `rateLimit { max: 10, timeWindow: '1 minute' }`.
- Error envelope `{ error: { code, message, details } }`. Save refusal = 422 `validation_error`, `details: [{ index?, field, message }]`, `field` ∈ `input.diff` | `expected_output` | `name` (an empty name is a Zod issue instead). `case_exists` = 409 with `details.case_id`. `no_api_key` message `no API key for <provider>`; `no_diff_text` message `no diff text available for <file>`.
- Client mirror: `EvalDraftSeed` is a union on `kind: 'draft' | 'existing'`; `EvalDraftRunResult` = `{ result, run_token }`; `last_result` is `null` until a run is stored.
- Test helpers: `ScriptedLLMProvider`/`LlmScript` (`review` may be a function of the request); `FIXTURE_CASES`, `FIXTURE_SCRIPTS`, `OLD_PROMPT`, `NEW_PROMPT`, `EXPECTED_OLD`, `EXPECTED_NEW` in `eval-pipeline-suite.ts`; `buildEvalApp`, `insertPr`, `insertFinding`, `suiteCounts` in `eval-pipeline-env.ts`. A hermetic no-key test needs `secrets: new MockSecretsProvider({})` + an `llm` override only for the other providers.
- For G9: `pnpm exec vitest run test/eval-pipeline` matches every eval-pipeline test file; `eval-pipeline-fixture.test.ts` is the AC-62 #4 check; the two `.it` files need Docker.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S11 | |
| `fastify-best-practices` | on demand | S11, S12 | |
| `zod` | on demand | S11 | |
| `typescript-expert` | on demand | S11, S12 | |
| `drizzle-orm-patterns` | on demand | S12 | read; tests only use plain insert/select |
| `security` | not read | | not named for S11/S12; rate limits + Zod at the edge applied |

## Handoffs → G5

## Steps
| Step | Status | Files changed |
|---|---|---|
| S13 | done | `client/messages/en/eval.json` (existing keys kept, groups added) |
| S14 | done | `client/src/lib/hooks/eval.ts` (new), `client/src/lib/hooks/index.ts` |
| S15 | done | `client/src/components/eval-case-modal/` — `EvalCaseModal.tsx`, `CaseInputTabs.tsx`, `ExpectedOutputEditor.tsx`, `CaseRunResult.tsx`, `RunConfirmModal.tsx` (cost confirm; `ConfirmModal` is the red delete variant), `helpers.ts` (+`diffToPrFiles`), `constants.ts`, `styles.ts`, `index.ts`, tests T9 (11) + T10 (13) |

### Handoff to the next group
- Hooks (`@/lib/hooks/eval`, also re-exported from `@/lib/hooks`; in tests import the specific file and mock it with an `importActual` spread). Queries: `useEvalCases(agentId)`, `useEvalAgentDetail(agentId, period)`, `useEvalRun(runId)` (polls 2000 ms while running), `useEvalDashboard()`, `useEvalCompare(a, b)`, `useRunAllPreview(enabled = true)`. Mutations: `useEvalDraftSeed()` (`mutateAsync(findingId)` → `EvalDraftSeed`; a refusal is an `ApiError` with `.code`/`.message`), `useSaveEvalCase()` `{agentId, body}`, `useUpdateEvalCase()` `{id, agentId, body}`, `useDeleteEvalCase()` `{id, agentId}`, `useRunEvalCase()` `{id, agentId}`, `useRunEvalDraft()` `{agentId, body}`, `useStartEvalRun()` `agentId`, `useRunAllAgents()`, `usePromoteEvalRun()` `{runId, agentId}`. Mutations invalidate cases/detail/dashboard; `useEvalRun` completion does NOT — callers refetch.
- Modal: `import { EvalCaseModal } from "@/components/eval-case-modal"`; props `{ agentId, draft?: EvalDraft | null, existing?: EvalSuiteCase | null, onClose, onOpenExisting?(caseId) }`; neither draft nor existing → new hand-written case; it fetches the agent's model itself (`useAgent`); on `case_exists` it calls `onOpenExisting` (consumer reopens with `existing=`); it does not close itself after Save (shows a confirmation naming case + type with a link to `/agents/<id>?tab=evals`, plus `toast.success`); needs a `ToastProvider` (present under the app shell). No "Run on save" toggle.
- i18n namespace `eval`: groups `modal`, `finding`, `evalsTab`, `detail`, `compare`, `dashboard` (extended). For S16: `finding.action`, `finding.undecidedTooltip`, `finding.refusal.{no_diff_text,agent_missing,finding_undecided,generic}` (`no_diff_text` takes `{file}`). `evalsTab.*` → S17; `detail.*`, `compare.*` → S19/S20; `dashboard.*` → S18.
- Tests' `NextIntlClientProvider` needs `evalMessages`, `common` and `shell` (DiffViewer).
- Deviations (trivial): `useEvalDraftSeed` is a mutation wrapping the GET; `EvalCaseModal.tsx` is 211 lines.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `frontend-architecture` | on demand | S13–S15 | |
| `react-best-practices` | on demand | S14, S15 | |
| `next-best-practices` | on demand | S13–S15 | |
| `react-testing-library` | on demand (partial read) | S15 | |
| `typescript-expert` | on demand (partial read) | S14, S15 | |
| `security` | on demand (partial read) | S15 | |
| `onion-architecture` | preload | — | client-only group |

## Handoffs → G8

## Steps
| Step | Status | Files changed |
|---|---|---|
| S21 | done | `server/vitest.mutation.config.ts`, `server/stryker.config.json`, `server/package.json` (script `mutation:eval-scoring`), `.gitignore` (`.stryker-tmp/`, `server/reports/`) |
| S22 | done | `docs/plans/assets/34-eval-pipeline/mutation-report.md`, `server/test/eval-pipeline-scoring.test.ts` (20 tests) |

### Handoff to the next group
- `cd server && pnpm mutation:eval-scoring` (~5 min) — 179 mutants, 175 killed, 4 survived, 97.77 %. The sandbox alias risk did not occur with `inPlace: true`; the file is restored (cmp-checked). Output in `server/reports/mutation/` (gitignored); committed report `docs/plans/assets/34-eval-pipeline/mutation-report.md`.
- The 4 survivors (ids 176–179) are all on `pipeline-scoring.ts:193`, the `a.startedAt > b.startedAt ? 1 : 0` half of the `trendPoints` comparator — equivalent mutants (V8 sort acts only on `order < 0`). Two contract tests added under `describe('mutation survivors')`; they cannot kill them. TAC3 ("one killing test per survivor") is therefore not literally met — open for the user.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `typescript-expert` | on demand | S21, S22 | |
| `onion-architecture` | preload | — | tooling only, no layer change |

## Handoffs → G6

## Steps
| Step | Status | Files changed |
|---|---|---|
| S16 | done | `FindingCard.tsx` (root `id="finding-<id>"`), `FindingCard.test.tsx`, new `pulls/[number]/_components/TurnIntoEvalCase/` (+test); out of *Files*: `FindingsPanel.test.tsx` (providers + eval messages added to its render helper) |
| S17 | done | `AgentEditor/constants.ts` (`{ key: "evals", icon: "FlaskConical" }`), `AgentEditor.tsx`, `app/agents/[id]/page.tsx` (`VALID_TABS`), new `AgentEditor/_components/EvalsTab/` (`EvalsTab.tsx`, `CaseRow.tsx`, `RunConfirm.tsx`, `helpers.ts`, `styles.ts`, `index.ts`, test); one assertion added to `AgentEditor.test.tsx` |

### Handoff to the next group
- `EvalsTab` (`client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.tsx`) takes `{ agent: Agent }`; its "View full dashboard" link goes to `/eval/<agentId>` — G7 builds `client/src/app/eval/[agentId]/page.tsx`.
- Run flow to reuse in G7: `useEvalAgentDetail` + `useStartEvalRun` + `useEvalRun` progress ("Running x / y"); start refusals `run_in_progress`, `suite_empty`, `no_api_key` map to toasts; run confirms name case count + model (`RunConfirm.tsx` is local to EvalsTab; `RunConfirmModal` is private to `eval-case-modal`).
- Any test rendering `FindingCard`/`FindingsPanel` now needs `QueryClientProvider`, `ToastProvider` and the `eval` messages.
- Tests stub `EvalCaseModal` with a marker (it has its own tests); hooks are real, only `api` is stubbed.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `frontend-architecture` | on demand | S16, S17 | |
| `react-best-practices` | on demand | S16, S17 | |
| `next-best-practices` | on demand | S16, S17 | |
| `react-testing-library` | on demand | S16, S17 | |
| `typescript-expert` | on demand | S16, S17 | |
| `onion-architecture` | preload | — | client-only group |

## Handoffs → G7

## Steps
| Step | Status | Files changed |
|---|---|---|
| S18 | done | `client/src/vendor/ui/nav.ts` (one `eval` NAV item, `Gauge`, exception comment), `client/src/app/eval/page.tsx`, `app/eval/_components/EvalDashboardView/` (+T13, 5) |
| S19 | done | `client/src/app/eval/[agentId]/page.tsx` (server page, awaits `params`, `<Suspense>`), `AgentEvalDetail/` (+T14), `EvalTrendChart/` (Recharts + `Tooltip`; helpers tested) |
| S20 | done | `CompareRunsModal/` (`PromptDiff.tsx`, `SkillsDiff.tsx`, +T15, 5); compare state in `AgentEvalDetail.tsx` |

### Handoff to the next group
- No new server or contract symbols. Beside-files (trivial): `app/eval/helpers.ts` (`toPercent`, `formatRunTime`, `METRIC_COLORS`), `app/eval/_components/MetricBar/`, `AgentEvalDetail/{MetricCards,RunEvalControl}.tsx`, `CompareRunsModal/{MetricDelta.tsx,helpers.ts}`; 17 keys appended to `client/messages/en/eval.json` (outside these steps' Files).
- Not run: `pnpm build` (can break a running `next dev`) and a visual check against designs 02–04.
- `RunEvalControl` repeats the EvalsTab run-progress flow (`RunConfirm` is private to EvalsTab).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `frontend-architecture` | on demand | S18–S20 | |
| `react-best-practices` | on demand | S18–S20 | |
| `next-best-practices` | on demand | S18–S20 | |
| `react-testing-library` | on demand | S18–S20 | |
| `typescript-expert` | on demand | S18–S20 | |
| `security` | on demand | S20 | |
| `onion-architecture` | preload | — | client-only group |

## Handoffs → G9

## Steps
| Step | Status | Files changed |
|---|---|---|
| S23 | done | `scripts/verify-l06.sh` (new: `set -euo pipefail`, temp `HOME` removed by `trap`, unsets provider keys + `GITHUB_TOKEN`, `TESTCONTAINERS_RYUK_DISABLED=true`), `server/package.json` (`verify:l06`) |
| S24 | done | `server/docs/eval-pipeline-demo.md` (new; the five AC-63 steps) |

### Handoff to the next group
- Last group. `cd server && pnpm verify:l06` (needs Docker: the `test/eval-pipeline` filter includes both `.it` files) — server 8 files / 89 tests, client typecheck + 593 tests, `cmp` of both `eval-pipeline.ts` copies; prints `verify:l06: all checks passed`.
- Not run: the live-model demo (needs a provider key and a synced PR) — it is the user's manual step in `server/docs/eval-pipeline-demo.md`.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `security` | on demand | S23 | |
| `onion-architecture` | preload | — | tooling and docs only |

## Follow-ups
- 2026-10-12 audit: @stryker-mutator/* 10.0.0 (devDeps) add 3 moderate qs advisories reachable only via Stryker; prod audit unchanged (22, all pre-existing); HEAD full audit already 66
- 2026-10-12 SEC pre-existing: server binds 0.0.0.0 with no Host/Origin allowlist (server.ts:29) — LAN peers / DNS rebinding reach all routes; per-route RATE_LIMIT is the only spend bound
- 2026-10-12 tests: the 10/min RATE_LIMIT on paid eval routes has no test; cross-agent source_finding_id (same workspace, other agent) is unspecified in spec/plan
- 2026-10-12 vendor MetricCard shows delta as Math.abs(delta).toFixed(2) next to percent values (client/src/vendor/ui/charts/MetricCard.tsx:65)
- 2026-10-12 devdigest-appsec skill anchors drifted (prompt.ts guard now :16-28, wrapUntrusted :40, wrapped sections :171-206)
- 2026-10-12 SK3 note: eval_suite_cases.workspace_id FK has no own index (no query filters on it alone today); add one with the next eval migration
- 2026-10-12 tests: run-all no_api_key skip is asserted only client-side (no server .it); client tests print MISSING_MESSAGE 'common' from a render helper
- 2026-10-12 sdd tooling: handback-check greps '| Step / gap |' but implementer reports use '| Step |' — every hand-back of plan 34 logged 'handback: unknown' and needed a diff read; align the implementer report template or the grep (.claude/skills/sdd/scripts/sdd.sh:243)
- 2026-10-12 evals: 'server task follows the protocol' passed 2/6 sessions on 2026-10-12 (gotchas.md not read) with and without the test-gate hook — below its recorded ~50%; worth an eval:repeat -n 5 series and a look at the server/AGENTS.md gotchas-first line
- 2026-10-12 PR3 (HIGH, pr-self-review): dashboard() does countCases + unbounded listRuns per agent (N+1); use a grouped count + latestRunsByAgent or a bounded window
- 2026-10-12 pr-self-review MEDIUM (server): completeRun/counter bump lack a status='running' guard; 200-case cap check-then-insert race + runAll does not skip suite_too_large/suite_empty; no partial unique index on one running run per agent; EvalCaseSaveBody.name has no .max() and expectations are uncapped; GET /findings/:id/eval-draft does git I/O without a rate limit; runSavedCase silently drops invalid stored expectations (suite path marks errored); a swallowed fallback completeRun error leaves a run 'running'; stryker inPlace leaves a mutant in src if interrupted
- 2026-10-12 pr-self-review MEDIUM (client): startedId never cleared in EvalsTab/RunEvalControl (a run started elsewhere is not tracked) — extract useActiveEvalRun; duplicated toPercent/startRefusalKey helpers; needless 'as ApiError' cast in EvalCaseModal
- 2026-10-12 eval_case_results.case_id is onDelete cascade: a deleted case's results written before the delete vanish (cases_done not lowered), those written after are kept with case_id null — pick one behaviour (set null on delete, or delete both) with the next eval migration
- 2026-10-12 retro P1: handback-check accepts the implementer's real table headers + a selftest case from a real report — .claude/skills/sdd/scripts/sdd.sh cmd_handback_check
- 2026-10-12 retro P2: run /pr-self-review inside the review wave, before close — .claude/skills/sdd/SKILL.md §2, review-loop.md
- 2026-10-12 retro P3: implementer report must carry a break check (what -> red, sha restored) for every new bug-fix test — .claude/agents/implementer.md
- 2026-10-12 retro P4: mutation-step Done-when includes jq '.testFiles|keys' — docs/plans/README.md plan guidance
- 2026-10-12 retro P5: researcher/plan-verifier write the report by turn N-10; split >150-item verifier passes — .claude/agents/researcher.md, plan-verifier.md
- 2026-10-12 retro P6: a busy lock while a writing agent runs, checked before harness evals — .claude/skills/sdd/scripts/sdd.sh, stages.md
- 2026-10-12 retro P7: sdd.sh stages for skill-eval / self-review / brainstorm so those agents are logged — .claude/skills/sdd/scripts/sdd.sh
- 2026-10-12 retro P8: batch late spec sources into one spec-creator correction — .claude/skills/sdd/stages.md (spec-answers)

## Handoffs → fix-1

### Handoff (fix-loop 1)
- SF1: `POST /eval/run-all` requires `EvalRunAllBody = { confirm: true }` (both contract copies); client `useRunAllAgents` sends it; `runs.it` refuses 5 simple-request shapes with counts unchanged.
- S21/TAC2/TAC3: mutation scope = `test/eval-pipeline-scoring.test.ts` only; 179 → 170 killed / 9 survived; 3 real gaps (80, 129, 131) killed by 2 new tests → 173 killed; 6 equivalents (119, 163, 176–179) listed with reasons.
- `EvalRunAllSkipped` carries `provider`; the skip reason reads "no API key for {provider}".

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `postgresql-table-design` | on demand | S3 (re-check, SK3) | every `pipeline.repo.ts` query is index-served (PK, `(agent_id,name)`, `source_finding_id`, `(agent_id,started_at)`, `(workspace_id,started_at)`); `eval_suite_cases.workspace_id` FK has no own index — no query filters on it alone → follow-up |
| `security` | on demand | S11 (re-check, SK11) | run-all JSON body (fail-closed 4xx) + rate limit; the other bodyless paid POSTs need an unreadable server UUID |
| `zod` | on demand | SF1 | |
| `react-testing-library` | on demand | T12, SP-AC-43 | |
| `onion-architecture` | preload | SF1, SP-AC-79 | |

## Verification log
- 2026-10-12 agent: plan-p1 a42dc37b0b626556f implementation-planner 2026-10-12T08:17:04Z
- 2026-10-12 agent: spec-p1 a6b980e17396968a0 spec-creator 2026-10-12T08:08:16Z
- 2026-10-12 agent: spec-p2 a6b980e17396968a0 spec-creator 2026-10-12T08:08:16Z
- 2026-10-12 agent: research a933909015e03d041 researcher 2026-10-12T08:08:16Z
- 2026-10-12 plan-decisions: user took every pass-1 recommendation (D1-D12, TQ1-TQ6, GAP1-GAP4, nav.ts vendor exception, Stryker install); spec back to draft for GAP1-GAP4
- 2026-10-12 agent: ext-research a74f6e85647ea24f2 researcher 2026-10-12T08:23:36Z
- 2026-10-12 agent: spec-p2 a6b980e17396968a0 spec-creator 2026-10-12T08:23:40Z
- 2026-10-12 spec re-approved after GAP1-GAP4 (AC-79 all triggers, AC-80 partial skill restore confirmed); Stryker step kept (user, after explanation)
- 2026-10-12 agent: plan-p2 a42dc37b0b626556f implementation-planner 2026-10-12T08:51:54Z
- 2026-10-12 plan-approve: user approved pass 2 with every recommendation
- 2026-10-12 agent: implement a41803fe7976b2165 implementer 2026-10-12T09:03:50Z
- 2026-10-12 handback: unknown G1
- 2026-10-12 implement G1: done S1-S3 (report table header '| Step |' fails handback-check -> unknown; main session read the diff: files match S1-S3, cmp of both contracts ok, 0024 has 3 CREATE TABLE and no ALTER/DROP elsewhere); server unit 831 passed, typecheck server+client ok; wave-1 checkpoint skipped (G2 already running), wave-2 will cover G1+G2
- 2026-10-12 agent: implement aa38caf2608f52bdc implementer 2026-10-12T09:04:26Z
- 2026-10-12 implement G2 run 1: stopped at Step 0 (no Handoffs -> G1 yet), edited nothing; wave-1 now taken
- 2026-10-12 agent: implement aa38caf2608f52bdc implementer 2026-10-12T09:08:22Z
- 2026-10-12 implement G2: done S4-S6; server unit 878 passed, typecheck ok; handback table '| Step |' (unknown per handback-check) -> main session read the diff (8 files = S4-S6), re-ran T2 18 passed, read pipeline-scoring.ts against spec B5
- 2026-10-12 agent: implement ae4e18850c57bb2fd implementer 2026-10-12T09:14:59Z
- 2026-10-12 implement G3: done S7-S10; server unit 890 passed, typecheck ok; main session read the diff (10 files = S7-S10), checked the in-flight guard (add before await, delete in finally), re-ran typecheck
- 2026-10-12 agent: implement a06727fae096222d9 implementer 2026-10-12T09:20:41Z
- 2026-10-12 implement G4: done S11-S12; unit 892, T6 10, T7 13, eval.it 10 passed; main session read the diff (8 files = S11-S12), re-ran T7 13 passed
- 2026-10-12 M1 (main session): pnpm add -D @stryker-mutator/core@10.0.0 @stryker-mutator/vitest-runner@10.0.0 in server/ — package.json + pnpm-lock.yaml via pnpm only; cpu-features node-gyp warning is the pre-existing optional testcontainers→ssh2 dep; typecheck + T2 green after install
- 2026-10-12 agent: implement ac67ea3d3289271ad implementer 2026-10-12T09:27:21Z
- 2026-10-12 implement G5: done S13-S15; client typecheck ok, client 561 tests passed; main session read the diff (14 client files = S13-S15), re-ran eval-case-modal 24 passed, checked test titles cover banner/draft run/save validation/discard prompts and no Run-on-save; checkpoint deferred while G8 (inPlace Stryker) runs
- 2026-10-12 agent: implement af2e8d9b393645629 implementer 2026-10-12T09:31:14Z
- 2026-10-12 implement G8: done S21-S22; Stryker 179 mutants, 175 killed, 4 equivalent survivors on pipeline-scoring.ts:193 (comparator tie/greater half); main session read the comparator and agrees they are equivalent; TAC3 not literally met — asked the user
- 2026-10-12 agent: implement a75e04cc957adb135 implementer 2026-10-12T09:31:49Z
- 2026-10-12 implement G6: done S16-S17; client 574 passed, typecheck ok; main session read the diff (S16-S17 files + FindingsPanel.test.tsx out of Files, trivial: providers only), re-ran TurnIntoEvalCase/EvalsTab/FindingsPanel 19 passed
- 2026-10-12 agent: implement af7a49558690d7f01 implementer 2026-10-12T09:38:04Z
- 2026-10-12 implement G7: done S18-S20; client 593 passed, typecheck ok; main session read nav.ts diff (one NAV line + exception comment) and re-ran the 4 G7 test files, 19 passed; eval.json keys appended outside Files (trivial)
- 2026-10-12 agent: implement ac2f6f5e21abed8c5 implementer 2026-10-12T09:39:52Z
- 2026-10-12 implement G9: done S23-S24; main session ran pnpm verify:l06 itself: exit 0, server 89 + client 593 tests, cmp ok
- 2026-10-12 agent: tests a39e60a8f752ce49f test-writer 2026-10-12T09:42:23Z
- 2026-10-12 tests: T1-T15 all present; added server/test/eval-pipeline-boundary.it.test.ts (4, horizontal isolation + 422 + cross-agent compare), break-check on pipeline.repo.ts getRun, shasum restored; gaps left: rate-limit config untested, cross-agent source finding unspecified
- 2026-10-12 it-suite: TESTCONTAINERS_RYUK_DISABLED=true pnpm exec vitest run .it.test — 32 files, 274 passed
- 2026-10-12 agent: review afa2274ddcaeaaf42 plan-verifier 2026-10-12T09:51:03Z
- 2026-10-12 agent: review a20cbaaf569c3b24a architecture-reviewer 2026-10-12T09:51:03Z
- 2026-10-12 agent: review ae729ed44556b856a security-reviewer 2026-10-12T09:51:03Z
- 2026-10-12 main-session fix: P24 + verifier handoff — server/docs/eval-pipeline-demo.md: dev.sh line names the root script and the server/AGENTS.md pnpm dev + db:migrate; 'Run eval' -> 'Run all evals'; 'Prompt' tab -> 'Config' (3 lines)
- 2026-10-12 review iteration 1 triage: fix 10 (SF1, S21-change, TAC2, TAC3, SK3, SK11, T6, SP-AC-43, SP-AC-79, T12 + G6 AgentEditor.test assertion claim), plan-change 0, trivial 1 (P24, applied), follow-up 5, sign-off 2 (R4, TAC3 equivalents); arch PASS 0 findings; security PASS, SF1 HIGH
- 2026-10-12 agent: fix-loop a43ad51340bfe3eb9 implementer 2026-10-12T09:56:14Z
- 2026-10-12 fix-loop 1: SF1 (run-all requires {confirm:true}), S21 scope fixed (testFiles = scoring only), TAC2 report rewritten (179/170/9 -> 173 killed), TAC3 3 real survivors killed (80,129,131), 6 equivalents listed (119,163,176-179), T6 dismissed path, AC-43 n/a everywhere, AC-79 provider in skip reason (contract both copies), T12 deltas + AgentEditor tab test; main session: testFiles jq ok, verify:l06 exit 0
- 2026-10-12 agent: review a5d1072d9d02eeb50 security-reviewer 2026-10-12T10:02:34Z
- 2026-10-12 agent: review a1fd9f131c91f0a5f plan-verifier 2026-10-12T10:02:34Z
- 2026-10-12 main-session fix: AC-23 (EvalCaseModal.test.tsx +2 lines, indicator shows 'invalid JSON') and AC-48 (AgentEvalDetail.test.tsx +4 lines, row metric values); break check: both fail when the expectation is altered (2 failed), restored, 19 passed. SK3/SK11: fix-loop Skills table appended as Handoffs -> fix-1. review iteration 2: security PASS (SF1 closed), verifier delta 30/35 met, remaining TAC3 sign-off
- 2026-10-12 agent: review ab46ccacc7dd1352d plan-verifier 2026-10-12T10:18:02Z
- 2026-10-12 sign-off: user accepted TAC3 (6 equivalent mutants 119, 163, 176-179 per mutation-report.md) and the vendor MetricCard delta format (follow-up) — 'так'
- 2026-10-12 close: plan done, spec implemented
- 2026-10-12 insights: server/INSIGHTS.md +2 (SF1 bodyless POST CSRF; mergeConfig Stryker scope), server/insights/gotchas.md +2 items; candidates (4)-(6) not written (spec records the SHA limitation; the client ones are obvious/minor); (7) sdd tooling recorded as a follow-up
- 2026-10-12 agent: docs ace036abc2eb6ee7a doc-writer 2026-10-12T10:20:32Z
- 2026-10-12 docs: server/docs/eval-pipeline.md (new, Mermaid run lifecycle) + server/docs/README.md rows (incl. the demo doc); main session filled the 'why code-only scoring' rationale gap from the assignment text; fixture >=8 assertion confirmed (eval-pipeline-fixture.test.ts:45)
- 2026-10-12 eval:workflow (settings.json hook change): 7/9 first run; 'server task follows the protocol' failed once from a false sandbox leak (doc-writer wrote server/docs/* concurrently — main-session sequencing error) and then on 'server/insights/gotchas.md not read'; A/B 3 runs each: with hook 1/3, HEAD settings 1/3 -> not caused by the hook, known flaky (case comment: gotchas skipped in ~half); 'engineering-insights activates' 1/2 on rerun (history v1 0/2, v2-v3 2/2). settings.json restored, cmp ok
- 2026-10-12 pr-self-review 1: gates green (server 1172, client 597, typecheck x3); 0 CRITICAL, contract drift none; HIGH PR1 pool() keeps paid workers after a rejection, PR2 FK violation when a case is deleted mid-run, PR3 dashboard N+1 unbounded, PR4 test-gate.sh checks the working tree not the commit; user: fix PR1, PR2 (fix mode) and PR4 (main session, outside the plan); rest -> follow-ups
- 2026-10-12 agent: fix-loop a888cefb5006bf851 implementer 2026-10-12T10:59:49Z
- 2026-10-12 reopened done -> in-progress for pr-self-review fixes PR1, PR2 (user: 'так, давай виправимо'); fix run 1 stopped at Step 0 on Status: done, edited nothing
- 2026-10-12 main-session fix (outside the plan, harness tooling): PR4 .claude/hooks/test-gate.sh — package list from what the commit contains (index; +unstaged only with -a/--all); deny when a touched package has untracked files or, without -a, unstaged edits; cache key from the committed tree; matcher also catches /usr/bin/git, bash -c and quoted forms; unparsable hook input that mentions a commit is denied, other commands allowed. Scratch-repo tests: stray-untracked deny, stray-unstaged deny, the -a form reaches the tests, bad input deny/allow, regex 10 cases. Live catches (main session): the hook blocked (1) a Bash test script whose text held real commit commands for a scratch repo — real repo has unstaged client/ changes, so deny was correct for the project but the commit targeted another dir; (2) this very log command, whose text quoted a commit command — the known text-match false positive. Limitation: always checks the project repo; matches commit commands inside quoted text
- 2026-10-12 agent: fix-loop a888cefb5006bf851 implementer 2026-10-12T11:02:08Z
- 2026-10-12 fix-loop 3 (pr-self-review): PR1 pool() stops handing out tasks after the first rejection and rethrows only after in-flight workers settle; PR2 recordCaseResult retries with caseId null on FK 23503. main-session fix: PR1 test was vacuous (indexOf -1 passes, started checked before the stuck worker could pick a task) -> asserts the exact event order and re-checks started after 60 ms (test file +4 lines). Break checks by the main session: bare Promise.all pool -> pool test fails; isForeignKeyViolation forced false -> runs.it mid-run-delete case fails; both restored, sha identical; server unit 897, eval .it 30, verify:l06 green (implementer)
- 2026-10-12 agent: review ac5802e4c788629ca plan-verifier 2026-10-12T11:03:37Z
- 2026-10-12 verification after fix-loop 3: complete (PR1, PR2, T-PR1, T-PR2, R1, R4 met)
- 2026-10-12 close: plan done again (spec stays implemented)
- 2026-10-12 self-review: /pr-self-review PASS — 0 CRITICAL; gates server typecheck + 1174 tests, client 597, evals typecheck; PR1/PR2/PR4 fixed, PR3 + MEDIUMs are follow-ups; .pr-self-review.json written (added to .gitignore, it was missing)
- 2026-10-12 retro-fact: spec-creator ran as one agent resumed 5 times — pass 1, pass 2, the EvalCaseModal correction (mentor feedback after the first approval prompt), the SG1/SG4/SG5 round, the plan-34 GAP1-GAP4 round; only 3 of them were logged as agent lines, and its 632m busy span is mostly time waiting for the user's answers
- 2026-10-12 retro-fact: researcher (Q1-Q8) stopped at its 40-turn limit and plan-verifier (first full pass) at its 60-turn limit, each with no report; both needed a 'write the report now' resume; the verifier left 23 items 'not verified' for the next delta
- 2026-10-12 retro-fact: the G8 implementer's Done-when checked the mutation score, not the test scope, so the mergeConfig include-append (33 test files incl .it) shipped as done; plan-verifier caught it from mutation.json testFiles
- 2026-10-12 retro-fact: the PR1 pool() test from fix-loop 3 passed against the buggy code (indexOf -1, early started check); only the main session's own break check exposed it — the implementer reported 'did not check that the new tests fail'
- 2026-10-12 retro-fact: /pr-self-review, run after all three reviewers had passed, found two real HIGH correctness bugs (PR1 paid workers after a rejection, PR2 FK on mid-run case delete) outside the reviewers' remit — the plan was reopened after done
- 2026-10-12 retro-fact: eval:workflow was run while doc-writer was writing server/docs/*, so its sandbox-leak check reported a false leak; the main session had to re-run and A/B the case
- 2026-10-12 retro-fact: 4 agents ran outside any sdd stage and were not logged: the pr-self-review skill-eval general-purpose agent, the two /pr-self-review bucket analyzers, and the brainstormer for the repeated flags
- 2026-10-12 retro: docs/plans/assets/34-eval-pipeline/workflow-retro.md
- 2026-10-12 brainstorm: repeat F1/F3 -> docs/ideas/08-sdd-repeat-flags.md (open, recommends Opt3: fix handback-check + measure F1 per run/stage)
- 2026-10-12 reopened for UI1/UI2 (user screenshot of EvalCaseModal on PR #12): UI1 the modal renders inside FindingCard without a portal, so sibling cards paint over it and its footer; UI2 the body is one column at 880px while design 09 is two columns (left: banner, name, input tabs; right: expected output, last run)
- 2026-10-12 agent: fix-loop a167a4e0f5562e8f1 implementer 2026-10-12T15:17:14Z
- 2026-10-12 fix-loop 4 (UI1, UI2): EvalCaseModal tree portaled to document.body (precedent FindingsPreview), body is a two-column grid (left banner/name/input, right expected output/run result/errors, divider), MODAL_WIDTH 1120; +1 RTL test (dialog under document.body); main session: diff = 4 files in eval-case-modal/, client typecheck ok, 38 tests passed; visual check pending with the user
- 2026-10-12 agent: review a286a72482fb8c1d9 plan-verifier 2026-10-12T15:18:55Z
- 2026-10-12 verification after fix-loop 4: complete — needs sign-off (UI2-visual: user to check in the browser; R4 closed by the main session's break check: return tree without createPortal -> the document.body test fails, restored, sha identical). insights: client/INSIGHTS.md portal entry extended for the vendored Modal, client/insights/gotchas.md item widened
- 2026-10-12 main-session fix: UI3 EvalsTab/styles.ts confirmBody had no padding (the vendored Modal pads nothing) -> padding 18px 24px like the other eval confirms; UI4 EvalsTab.tsx 'Run all evals' disabled on an empty suite and 'Cases passed' shows n/a (was a dash); EvalsTab.test.tsx expects 4 n/a + the disabled button. Break check: dropping the empty-suite guard fails the test, restored, sha identical; EvalsTab+AgentEditor 29 passed, client typecheck ok
- 2026-10-12 reopened for UI5–UI9 (user screenshot of the agent Evals tab vs design 05; user: "change the visualization, do not change the logic" — visual only, no behaviour/data/contract change): UI5 metric deltas read the 0..1 fraction via the vendored MetricCard (`↑0.50`, `⁄0.00`) — design shows whole points (`▲ 4pt`, `▼ 2pt`); UI6 metric cards: order Recall, Precision, Citation accuracy, Cases passed last; values coloured (recall var(--accent), precision var(--ok), citation var(--warn)); uppercase small muted labels; section head `EVAL METRICS` small uppercase with Gauge icon, "View full dashboard →" mono; UI7 "N / M passing" as a green pill; buttons: "Run all evals" secondary with Play, "New eval case" primary with Plus (copy only); UI8 CaseRow: status icon on the left (CheckCircle var(--ok) passed, XCircle var(--crit) failed, warn colour errored, small muted dot never run), mono case name, the result badge removed from the row (result + recall kept as the icon's accessible name/title), "never run" as the summary line for a never-run case only if that is the current text; UI9 row actions icon-only ghost buttons (Play/Edit/Trash) with aria-label Run/Edit/Delete, muted
- 2026-10-12 fix-loop 5 (UI5–UI9, visual only): new EvalsTab/StatCard.tsx (delta as whole points ▲/▼ Npt, coloured values); EvalsTab.tsx card order + EVAL METRICS head + green passing pill + button swap; CaseRow.tsx left status icon (role=img, label "passed · recall N%"), mono name, result badge removed, icon-only Run/Edit/Delete with aria-label; styles.ts; eval.json newCase -> "New eval case"; tests updated (10pt/25pt deltas, status via role img). Deviations: never-run row summary reads "never run"; "Latest completed run" caption dropped; the Run icon no longer swaps to "Running…" text (still disabled while busy). Main session: diff read (no hook/data/contract change), client typecheck ok, EvalsTab+AgentEditor 29 passed; visual check pending with the user
- 2026-10-12 reopened for UI10 (user screenshot of CompareRunsModal vs design 04; visual only, no logic change): title "Compare runs · vA → vB"; metric tiles keep `from → to delta` on one line (no wrap; the delta wrapped under the value at 860px), `to` coloured per metric (recall accent, precision ok, citation warn; cost neutral), delta as "▲ 4pt"/"▼ 2pt"/muted "0pt" like EvalsTab StatCard, label "Citation"; cost delta formatted as money (was "↓ 0.00" for equal costs); heading "System prompt diff" with a file icon and the legend with red/green swatches; main modal footer left-aligned Close, Promote (PromoteConfirm footer unchanged). Not a gap: Promote absent in the screenshot is correct (both runs v2); detail-page MetricCards match design 03 (fraction delta "↑ 0.04")
- 2026-10-12 fix-loop 6 (UI10, visual only): CompareRunsModal title "Compare runs · vA → vB", subtitle with the case count, one-line tiles with METRIC_COLORS values and "▲ 4pt" deltas, cost delta via formatCostUsd (kept muted: a cost rise must not read as good), "System prompt diff" heading + red/green legend swatches, main footer left-aligned (PromoteConfirm unchanged); MetricDelta gets an optional color prop; test assertions for title/deltas updated, promote assertions unchanged. main-session fix: UI10 copy — subtitle said "N-trace gold set" (not our term) -> "on N cases" (ICU plural); removed the now-unused compare.title/compare.points keys. client typecheck ok, CompareRunsModal+AgentEvalDetail 12 passed; visual check pending with the user
- 2026-10-12 user visual sign-off: UI2–UI10 (agent Evals tab, EvalCaseModal, CompareRunsModal) match the designs · user "Наче усе відповідає дизайну"; delta plan-verifier for UI3–UI10 requested before done
- 2026-10-12 verification delta UI3–UI10: complete (8/8 met; visual-only constraint held; client typecheck ok, 7 files / 55 passed); status -> done. Spec 011 stays approved: its AC-81–AC-95 amendment is implemented by plan 35
