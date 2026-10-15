# Development Plan: Multi-Agent Review
Status: done
Save as: docs/plans/40-multi-agent-review.md
Spec: specs/013-multi-agent-review.md
Execution: multi-agent

## Spec traceability
Test ids T1–T19: see *Tests*.

| Spec AC | Covered by |
|---|---|
| AC-1 | S14, T9 |
| AC-2 | S14, T9 |
| AC-3 | S14, T9 |
| AC-4 | S14, T9 |
| AC-5 | S14, T9 |
| AC-6 | S14, T9 |
| AC-7 | S14, T9 |
| AC-8 | S4, S14, T3, T9 |
| AC-9 | S13 |
| AC-10 | S15, T10 |
| AC-11 | S15, T10 |
| AC-12 | S12, S15, T10 |
| AC-13 | S15, T10 |
| AC-14 | S9, S15, T5, T10 |
| AC-15 | S15, T10 |
| AC-15a | S23, S24, T2, T15 |
| AC-15b | S23, S25, T15, T16 |
| AC-15c | S23, S25, T15, T16 |
| AC-15d | S25, T16 |
| AC-15e | S25, T16 |
| AC-15f | S25, T16 |
| AC-15g | S24, S25, T15, T17 |
| AC-15h | S21, S23, S26, T15, T18 |
| AC-16 | S5–S7, T2, T4 |
| AC-17 | S9, T5 |
| AC-18 | S6, S9, T2, T5 |
| AC-19 | S5–S7, T2, T4 |
| AC-20 | S12, T8 |
| AC-21 | S1, S8, T1, T4 |
| AC-22 | S7, T4 |
| AC-23 | S2, S3, S7, T4 |
| AC-24 | S4, T3 |
| AC-25 | S4, T3 |
| AC-26 | S4, T3 |
| AC-27 | S4, T4 |
| AC-28 | S4, S17, T3, T12 |
| AC-29 | S4, T3 |
| AC-30 | S8, S16, T4, T11 |
| AC-31 | S6, S16, T2, T11 |
| AC-32 | S16, T11 |
| AC-33 | S9, S16, S17, T12 |
| AC-34 | S7, S17, T4, T12 |
| AC-35 | S6, S17, S19, T2, T12, T14 |
| AC-36 | S10, S18, T6, T13 |
| AC-37 | S6, T2 |
| AC-38 | S17, T12 |
| AC-39 | S17, T12 |
| AC-40 | S18, T13 |
| AC-41 | S18, T13 |
| AC-41a | S27, T19 |
| AC-41b | S27, T19, live check (S27) |
| AC-42 | S18, T13 |
| AC-43 | S6, T2 |
| AC-44 | S6, S17, S18, T2, T12 |
| AC-45 | S6, T2 |
| AC-46 | S6, S19, T2, T14 |
| AC-47 | S19, T14 |
| AC-48 | S6, T2 |
| AC-49 | S6, T2 |
| AC-50 | S19, T14 |
| AC-51 | S19, T14 |
| AC-52 | S16, T11 |
| AC-53 | S11, S16, T7 |
| AC-54 | S11, T7 |
| AC-54a | S2, S11, T7 |
| AC-55 | S16, T11 |
| AC-56 | S16, T11 |
| AC-57 | S11, T7 |
| AC-58 | S20 |

## Decisions needed
D1–D10: none open — see *Decisions recorded*. One new technical row from pass 2:

| # | Decision | Options | Recommendation | Steps affected |
|---|---|---|---|---|
| D11 | Source of the wall-clock "<time>s total" (AC-31) and of the run end time for AC-54a | A: nullable `agent_runs.finished_at` (timestamptz), set by `completeAgentRun` + `cancelRunIfRunning`, in the D7 migration · B: no column; total ≈ longest `duration_ms` (wrong once a 5th agent queues; `duration_ms` starts after the shared preparation, `run-executor.ts:239`) | A — `agent_runs` has no end time (`schema/runs.ts:19-56`) | S2, S3, S6, S11 |

Correction round (UF1/UF2, 2026-10-15) — REC2/D6 is reversed in part by the spec (*Module interactions*): `GET /pulls/:id/multi-agent` is now built (S24). New technical rows:

| # | Decision | Options | Recommendation | Steps affected |
|---|---|---|---|---|
| D12 | Index for the new reads on `multi_agent_runs` (latest per PR; recent per repo via the PR join) — `pr_id` is a FK with no index (`schema/runs.ts:99-108`) | A: `index('multi_agent_runs_pr_ran_idx').on(t.prId, t.ranAt)` + a second generated migration (0029) · B: no index, no migration (small table today) | A — [SG] "A foreign-key column carries no index" is a rule in force | S22, S23 |
| D13 | Response of `GET /pulls/:id/multi-agent` when the PR has no multi-agent run | A: always 200 `LatestMultiAgentRun = { run: MultiAgentRunSummary \| null }` (foreign/unknown PR → 404) · B: 404 when none (client must treat 404 as "no link") | A — "none" is a normal state, not an error; no 404 noise in the client | S21, S24, S25 |
| D14 | Route for the repository's recent runs (AC-15b) | A: `GET /repos/:id/multi-agent-runs` (`IdParams`, server-fixed limit 10; foreign repo → `[]`) · B: `GET /multi-agent-runs?repo_id=` with a querystring schema | A — same shape as `/repos/:id/pulls`; no querystring coercion | S24, S25 |
| D15 | Split of the correction work | A: G9 (contract + server) then G10 (client), one package per group · B: one group G9 across shared, server and client | A — groups stay one package/layer and end type-checking | all new |

## Decisions recorded
2026-10-14 — the user answered "all as recommended":
- TQ1 yes (AC-57 met by `stats.grounding` + persisted "grounding dropped" log lines; no new trace field) · TQ2 yes (connected components) · TQ3 yes (inclusive `[start_line, end_line ?? start_line]`) · TQ4 yes (`{ agent_ids: uuid[] }`, 1–20, deduplicated).
- GAP1–GAP4: suggested resolutions accepted; sent to `spec-creator`, spec back to `draft` until re-approved.
- REC1–REC4 accepted.
- D1 A · D2 A · D3 A · D4 A · D5 A · D6 accept (REC2 + REC3) · D7 A · D8 A · D9 as stated · D10 multi-agent.
2026-10-15 — pass 2 review:
- D11 A (`agent_runs.finished_at` in the D7 migration).
- S10 accepted: the two import-line edits in `onboarding-tour/` (outside the Worktree A pages) are allowed for the `SafeMarkdown` move.
- Plan approved by the user (explicit "план затверджую"); implementation started with G1.
2026-10-15 — design review (main session, under the user's standing instruction "follow the design as closely as possible"): DG1–DG8 supersede the conflicting step text — notably S13's "WORKSPACE nav item" / design-notes icon `Layers` → DG8: a GLOBAL group holding only "Multi-Agent Review" with the `Users` icon.
2026-10-15 — grouping on wide ranges (Verification log observation): the user chose **option C** — a finding spanning more than 10 lines groups by its `start_line` only (range treated as `[start_line, start_line]`); transitive + inclusive overlap otherwise unchanged. Spec AC-43 amended; fix gap **GR1** (`multi-agent.helpers.ts` `groupFindings`, S6, + T2).
2026-10-15 — user review UF1 + UF2 (see *User review*): the user asked to implement them ("давай виконаємо ці зміни"). UF1 needs files outside the steps → plan change; plan back to `draft` until the user approves the added steps.
2026-10-15 — UF correction approved by the user (explicit "так" to "A на все, затверджую спеку і план"): D12 A (index + migration 0029) · D13 A (`{ run: null }`, foreign PR 404) · D14 A (`GET /repos/:id/multi-agent-runs`) · D15 A (G9 server, then G10 client); spec 013 re-approved; implementation G9 started. Baseline of the approved text before this line: `docs/plans/assets/40-multi-agent-review/plan-baseline-uf.md`.

## Prerequisites
- Docker for server `.it` tests; no new dependency (`p-queue` `server/package.json:43`). S20: dev stack, a real model key, a demo PR.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S3 | shared, server schema/migration, run repo | — | contract exports; `createAgentRun({ multiAgentRunId })` |
| G2 | S4–S6 | server executor, repo, helpers | G1 | `runReview(…, opts?)`; repo/helper signatures |
| G3 | S7–S8 | server service + routes | G2 | route paths, response shapes |
| G4 | S9–S11 | client data, moves, drawer | G1 (parallel to G2/G3 allowed: no shared file) | hooks; `src/components/*` paths; `endedAt` prop |
| G5 | S12–S14 | client identity, i18n/nav, PR picker | G3, G4 | `AgentIdentity`; i18n keys |
| G6 | S15 | client Configure run | G5 | — |
| G7 | S16–S17 | client results shell + columns | G6 | `AlsoFlaggedBy`; page state |
| G8 | S18–S19 | client tabs + disagree | G7 | — |
| — | S20 | main session measurement | G8 + `.it` green | *Verification log* |
| G9 | S21–S24 | shared contract + server (schema index, repo, helpers, service, routes) | G8 | `MultiAgentRunSummary`, `LatestMultiAgentRun`, `RunSummary.multi_agent_run_id`; routes `GET /repos/:id/multi-agent-runs`, `GET /pulls/:id/multi-agent` |
| G10 | S25–S27 | client (hooks, RecentRuns + latest link, PR run-history link, Tabs width) | G9 | — |

**Aliases.** `RV/` = `server/src/modules/reviews/` · `PRC/` = `client/src/app/repos/[repoId]/pulls/[number]/_components/` · `MA/` = `client/src/app/repos/[repoId]/multi-agent/` · `CMP/` = `client/src/components/`. Gotchas: [SG] `server/insights/gotchas.md`, [CG] `client/insights/gotchas.md`, [RI] root `INSIGHTS.md`. A component folder `X/` means `X.tsx`, `X.test.tsx`, `styles.ts`, `index.ts`. Detailed shapes and test cases: *Design notes* below the marker.

## Steps

### S1 — Extend the multi-agent contracts  [Contract]
- **Files:** `server/src/vendor/shared/contracts/observability.ts`, `client/src/vendor/shared/contracts/observability.ts` (modify, same edit); `server/test/multi-agent-contracts.test.ts` (create, T1)
- **Change:** the shapes in *Design notes → Contract*.
- **Layer / why here:** ports; shared first, targeted mirror.
- **Skills to apply:** `zod`, `typescript-expert`, `security`, `onion-architecture`
- **Practices:** schema + `z.infer` type per export; imports only `zod` + sibling contracts; no other `vendor/shared` file changes.
- **Known gotchas:** [RI] "the two vendored `shared` copies are not actually in sync"; [RI] "TS2719 …"; [CG] type-only `@devdigest/shared` imports.
- **Done when:** `diff server/src/vendor/shared/contracts/observability.ts client/src/vendor/shared/contracts/observability.ts` prints nothing · `cd server && pnpm typecheck` · `cd client && pnpm typecheck` · T1: rejects `null`, `{}`, `[]` ids, 21 ids, a non-uuid; accepts 1 and 20.

### S2 — Schema + migration
- **Files:** `server/src/db/schema/runs.ts`, `server/src/db/schema/reviews.ts` (modify); migration (create, `pnpm db:generate` only)
- **Change:** `agentRuns.multiAgentRunId` `uuid('multi_agent_run_id')` → `multiAgentRuns.id`, `onDelete: 'set null'`, + `agent_runs_multi_agent_run_idx`; `agentRuns.finishedAt` `timestamp('finished_at', { withTimezone: true })` nullable (D11); `reviews_run_idx` on `reviews.runId`. Then `cd server && pnpm db:generate`.
- **Layer / why here:** schema.
- **Skills to apply:** `drizzle-orm-patterns`, `postgresql-table-design`, `onion-architecture`
- **Practices:** additions only; explicit FK index; never edit generated SQL.
- **Known gotchas:** [SG] "A foreign-key column carries no index"; [SG] "`pnpm db:generate` can hang"; [RI] "auto-mode permission check blocks an implementer from writing a migration file" (hand back if blocked).
- **Done when:** a new `server/src/db/migrations/0028_*.sql` matches `grep -l multi_agent_run_id`, `grep -l finished_at` and `grep -l reviews_run_idx` · `cd server && pnpm typecheck`.

### S3 — Run repo: link + end time
- **Files:** `RV/repository/run.repo.ts`, `RV/repository.ts` (modify)
- **Change:** `createAgentRun` takes `multiAgentRunId?: string | null`; `completeAgentRun` and `cancelRunIfRunning` set `finishedAt: new Date()`; reaper unchanged.
- **Layer / why here:** repository.
- **Skills to apply:** `drizzle-orm-patterns`, `onion-architecture`, `typescript-expert`
- **Practices:** awaited queries, plain values.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run run-cancel` passes.

### S4 — Concurrent executor (limit 4)
- **Files:** `RV/run-executor.ts`, `RV/constants.ts`, `RV/service.ts` (modify); `server/test/review-concurrency.it.test.ts` (create, T3)
- **Change:** `MAX_PARALLEL_AGENTS = 4`; the loop at `run-executor.ts:196-223` becomes `new PQueue({ concurrency: MAX_PARALLEL_AGENTS })` + one `add` per job wrapping the existing try/catch, then `await queue.onIdle()`; shared preparation unchanged. `runReview(…, logger?, opts?: { multiAgentRunId?: string })` forwards it; `POST /pulls/:id/review` passes none.
- **Layer / why here:** application.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `fastify-best-practices`, `zod`, `security`
- **Practices:** a queue per `executeRuns` call; each task catches its own error; import as `platform/jobs.ts:1`.
- **Known gotchas:** [SG] "A hermetic `.it` test must not be able to reach a real API key"; [SG] "Never read `run_traces` straight after `waitForPrRuns`"; `fail()` an intent call that reaches `DeferredLLMProvider` first (`run-executor.ts:156-167`).
- **Done when:** `cd server && pnpm typecheck` · T3 passes (*Design notes → T3*).

### S5 — Multi-agent queries
- **Files:** `RV/repository/multi-agent.repo.ts` (create), `RV/repository.ts` (modify)
- **Change:** six functions in *Design notes → Repo*, exposed via `ReviewRepository`.
- **Layer / why here:** repository.
- **Skills to apply:** `drizzle-orm-patterns`, `postgresql-table-design`, `onion-architecture`, `typescript-expert`
- **Practices:** awaited, no builder returned; `workspace_id` on workspace reads; empty ids → `[]` without a query.
- **Known gotchas:** [SG] "A row type derived from `db/schema` … goes in the module's `repository.ts`".
- **Done when:** `cd server && pnpm typecheck` · exercised by T4.

### S6 — Pure helpers
- **Files:** `RV/multi-agent.helpers.ts` (create); `server/test/multi-agent-helpers.test.ts` (create, T2)
- **Change:** *Design notes → Helpers*.
- **Layer / why here:** pure application helper.
- **Skills to apply:** `typescript-expert`, `onion-architecture`
- **Practices:** no `db/`, adapter or `container` import; findings copied, never merged (AC-45).
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm exec vitest run multi-agent-helpers` passes (*Design notes → T2*).

### S7 — Multi-agent service
- **Files:** `RV/multi-agent.service.ts` (create)
- **Change:** `start` (PR missing → `NotFoundError`; dedupe; unknown agent → `NotFoundError` before any insert, AC-22; insert row; `startRuns(…, { multiAgentRunId })`; return `get`), `get` (missing/foreign → `NotFoundError`; rows → `AgentColumn`, `agent_id` null → `agent_deleted`, AC-34; S6 helpers), `estimates(workspaceId)` (one per agent).
- **Layer / why here:** application; narrow deps `{ repo, agents: { list }, startRuns }`, port types in this file.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `zod`, `security`
- **Practices:** no `Container`; no `db/schema`/`drizzle-orm`/adapter import; no model call.
- **Known gotchas:** onion step 6 (no foreign consumer ports).
- **Done when:** `cd server && pnpm typecheck` · `.claude/skills/onion-architecture/scripts/check-module.sh reviews` shows no edge from the new files.

### S8 — Routes
- **Files:** `RV/routes.ts` (modify); `server/test/multi-agent-run.it.test.ts` (create, T4)
- **Change:** `POST /pulls/:id/multi-agent-run` (`IdParams`, body `MultiAgentRunRequest`, `rateLimit { max: 10, timeWindow: '1 minute' }`), `GET /multi-agent-runs/:id`, `GET /multi-agent/estimates`; service built from `container.reviewRepo`, `container.agentsRepo`, `service.runReview`.
- **Layer / why here:** transport.
- **Skills to apply:** `fastify-best-practices`, `zod`, `onion-architecture`, `security`, `typescript-expert`
- **Practices:** schema-first body, no `parse` in handlers; `response` schemas; thin handlers.
- **Known gotchas:** [SG] "A mutating route … must require a JSON object body"; [SG] "Every route is reachable from the LAN"; rate limit off under test (`app.ts:103-105`).
- **Done when:** `cd server && pnpm typecheck` · T4 passes (*Design notes → T4*).

### S9 — Client data layer
- **Files:** `client/src/lib/hooks/multi-agent.ts` (create), `client/src/lib/hooks/index.ts` (modify), `client/src/lib/agent-estimates.ts`, `client/src/lib/agent-estimates.test.ts` (create, T5)
- **Change:** `useAgentEstimates`, `useMultiAgentRun` (3 s `refetchInterval` while a column is `running`), `useStartMultiAgentRun`, `useMultiAgentFindingAction(runId)` (invalidates `["multi-agent-run", runId]`); `aggregateEstimate` (max time, sum cost, `sample_size > 0` only), `formatEstimate` via `lib/format-cost.ts`.
- **Layer / why here:** data layer.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `security`
- **Practices:** type-only shared imports; requests only via `api.ts`.
- **Known gotchas:** [CG] "Import only types from `@devdigest/shared`".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run agent-estimates` passes.

### S10 — Move shared components (D4)
- **Files:** `git mv` `PRC/{RunTraceDrawer,FindingCard,TurnIntoEvalCase}` → `CMP/{run-trace-drawer,finding-card,turn-into-eval-case}` and `client/src/app/repos/[repoId]/onboarding-tour/_components/SafeMarkdown` → `CMP/safe-markdown`; modify `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `PRC/FindingsPanel/FindingsPanel.tsx`, `client/src/app/repos/[repoId]/onboarding-tour/_components/{ArchitectureSection/ArchitectureSection.tsx,FirstTasks/FirstTasks.tsx}`, `CMP/finding-card/FindingCard.tsx` + test (T6)
- **Change:** imports → `@/…`; `FindingCard` renders `rationale`/`suggestion` with `SafeMarkdown` (`FindingCard.tsx:81,87`, AC-36); nothing else.
- **Layer / why here:** shared UI (second consumer route).
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`, `security`
- **Practices:** kebab-case folders; barrels and inner file names kept.
- **Known gotchas:** [CG] "Render model/untrusted Markdown through a `react-markdown` wrapper"; [CG] "A vitest filter containing a bracketed route segment"; [CG] "`vi.mock` … spread the real module".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run components/ FindingsPanel onboarding-tour` passes · `find client/src/app -type d \( -name RunTraceDrawer -o -name FindingCard -o -name TurnIntoEvalCase -o -name SafeMarkdown \)` prints nothing · T6: `![x](http://e.test/x.png)` rationale renders no `img`.

### S11 — Drawer "trace pending" (30 s)
- **Files:** `CMP/run-trace-drawer/{RunTraceDrawer.tsx,RunTraceDrawer.test.tsx,constants.ts}`, `client/src/lib/hooks/trace.ts` (modify; test = T7)
- **Change:** `useRunTrace(runId, enabled, opts?: { pollUntil?: number })` polls every 2 s (`TRACE_POLL_MS`) while no data and before `pollUntil`; `retry: false` kept. Prop `endedAt?: string | null`; deadline = (`endedAt` ?? first time the drawer sees the run not running) + 30000 (`TRACE_PENDING_MS`); a cleared `setTimeout` sets `timedOut`; before it → `drawer.tracePending`, after → `drawer.noTrace`.
- **Layer / why here:** shared component + hook.
- **Skills to apply:** `react-best-practices`, `next-best-practices`, `frontend-architecture`, `react-testing-library`, `typescript-expert`
- **Practices:** derived state, no syncing effect; timer cleanup.
- **Known gotchas:** [CG] "no `@testing-library/user-event`".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run run-trace-drawer`, fake timers: 404→200 pending then trace (AC-54); 404 throughout → "No trace available yet." at 30 s (AC-54a); old `endedAt` → no-trace at once; `running` → Live log (AC-53); tokens + grounding badge (AC-57).

### S12 — Agent identity
- **Files:** `CMP/agent-identity/` + `helpers.ts` (create; test = T8)
- **Change:** `agentIdentity(name | null)` → `{ icon: IconName, color }` from an 8-entry palette (assumption) by a stable hash; `null` → neutral; `<AgentIdentity name />`.
- **Layer / why here:** shared UI (two routes).
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** icons from `IconName`; existing CSS variables; each `styles.ts` entry its own literal.
- **Known gotchas:** [CG] "In a colocated `styles.ts`, give every entry its own literal".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run agent-identity` (same name → same identity; ≥2 slots reachable).

### S13 — i18n + nav
- **Files:** `client/messages/en/runs.json`, `client/messages/en/prReview.json`, `client/src/vendor/ui/nav.ts` (modify)
- **Change:** keys in *Design notes → Strings*; `runs.page.meta` drops "fan-out via p-queue"; WORKSPACE nav item `{ key: "multi-agent", label: "Multi-Agent Review", icon: <IconName>, href: "/repos/:repoId/multi-agent" }` with the sanctioned-exception comment (spec 013).
- **Layer / why here:** i18n + sanctioned vendored edit.
- **Skills to apply:** `frontend-architecture`, `next-best-practices`, `typescript-expert`
- **Practices:** key `multi-agent` matches `activeKeyFor` (`components/app-shell/helpers.ts:28`).
- **Known gotchas:** [CG] "Adding a nav item to `src/vendor/ui/nav.ts` is the one sanctioned hand-edit"; [CG] "`getByText` reports multiple matches".
- **Done when:** `jq . client/messages/en/runs.json client/messages/en/prReview.json` succeeds · `cd client && pnpm typecheck`.

### S14 — PR page picker
- **Files:** `PRC/RunReviewDropdown/` + `constants.ts` (modify); `PRC/AgentPickerPanel/` + `helpers.ts` (create); `PRC/PrDetailHeader/PrDetailHeader.test.tsx` (modify mocks). Tests = T9.
- **Change:** *Design notes → Picker*.
- **Layer / why here:** route-local UI.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`, `security`
- **Practices:** ≤200 lines per component; selection seeded in the open handler; keyboard `Checkbox`.
- **Known gotchas:** [CG] "An overlay that must escape … needs `createPortal`"; [CG] "no `user-event`".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run RunReviewDropdown AgentPickerPanel PrDetailHeader` asserts AC-1 … AC-8.

### S15 — Configure run screen
- **Files:** `MA/page.tsx`, `MA/_components/ConfigureRun/`, `MA/_components/AgentPickList/` (create). Tests = T10.
- **Change:** thin page (AppShell, crumb, `<Suspense>`) → `ConfigureRun`: `SelectInput` over `usePulls(repoId)` writing `?pr=<number>` (AC-10); none → "Pick a pull request first", run disabled (AC-11); `AgentPickList` rows: Checkbox, `AgentIdentity`, name, `last_verdict` as text, estimate (AC-12); "Select all" (AC-13); aggregate (AC-14); run → start + push (AC-15); no agents → `EmptyState` → `/agents`.
- **Layer / why here:** route + route-local.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`, `security`
- **Practices:** `pr` in the URL; ticked ids local state.
- **Known gotchas:** [CG] "Wrap every page that calls `useSearchParams()` in a `<Suspense>`".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run ConfigureRun AgentPickList` asserts AC-10 … AC-15 + no-agents.

### S16 — Results shell, header, trace wiring
- **Files:** `MA/[runId]/page.tsx`, `MA/[runId]/_components/ResultsPage/`, `MA/[runId]/_components/ResultsHeader/` (create). Tests = T11.
- **Change:** `useMultiAgentRun(runId)`; Skeleton / not-found / ErrorState; Columns|Tabs switch, Columns default; slots for S17–S19; `?trace=` opens `RunTraceDrawer` only for a column `run_id` (AC-55/56), with `running`, `endedAt = finished_at`, `findings`, `agentName`; "View trace" sets it via `router.replace`. Header per AC-31 (+ partial cost mark).
- **Layer / why here:** route + route-local.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`, `security`
- **Practices:** view mode local state; trace in the URL.
- **Known gotchas:** [CG] "`useSearchParams()` … `<Suspense>`"; [CG] "`vi.mock` … `importActual`".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run ResultsPage ResultsHeader` asserts AC-30–32, 52, 55, 56.

### S17 — Columns view
- **Files:** `MA/[runId]/_components/ColumnsView/`, `MA/[runId]/_components/AlsoFlaggedBy/` (create); `ResultsPage.tsx` (modify). Tests = T12.
- **Change:** per column: `AgentIdentity`, name or "Deleted agent", status, duration, cost, `CircularScore` (empty + status word when `score` null), failure reason, findings (severity word, title, `file:line`, `AlsoFlaggedBy`), "View trace", count / "No findings."; independent scroll.
- **Layer / why here:** route-local UI.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `react-testing-library`, `typescript-expert`, `security`
- **Practices:** model text as plain text.
- **Known gotchas:** [CG] "`SeverityBadge compact` … shows the icon only"; [CG] "write all four sides longhand".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run ColumnsView AlsoFlaggedBy` asserts AC-28, 33, 34, 35, 38, 39, 44.

### S18 — Tabs + detail view
- **Files:** `MA/[runId]/_components/TabsView/` (create); `ResultsPage.tsx` (modify). Test = T13.
- **Change:** tab per column (name + score); header: ring, summary via `SafeMarkdown`, duration, cost, "View trace"; `FindingCard` from `@/components/finding-card` with `onAction` → `useMultiAgentFindingAction`, `AlsoFlaggedBy` per card; no Learn/Reply.
- **Layer / why here:** route-local UI.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `react-testing-library`, `typescript-expert`, `security`
- **Practices:** reuse `FindingCard`, never fork it.
- **Known gotchas:** [CG] "Render model/untrusted Markdown through a `react-markdown` wrapper".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run TabsView` asserts AC-36, 40, 41, 42.

### S19 — "Where agents disagree"
- **Files:** `MA/[runId]/_components/DisagreeBlock/` + `helpers.ts` (create); `ResultsPage.tsx` (modify). Test = T14.
- **Change:** entries from `run.conflicts`; `visibleGroups(conflicts, onlyConflicts)`; heading `file:line · title`; a row per take (name + severity word + title, or "did not flag"); labelled `Toggle`; empty → AC-51 copy.
- **Layer / why here:** route-local UI.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** visible toggle label; filtering in `helpers.ts`.
- **Known gotchas:** [CG] "`getByText` reports multiple matches".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run DisagreeBlock` asserts AC-35, 46, 47, 50, 51 · `cd client && pnpm test` passes.

### S20 — 1-vs-3 measurement (main session)
- **Files:** none (*Verification log*).
- **Change:** same demo PR via Configure run, 1 agent then 3; record `total_duration_ms`, per-agent `duration_ms`, `tokens_in`/`tokens_out`, `cost_usd`, model (`GET /multi-agent-runs/:id`). No target ratio.
- **Layer / why here:** verification evidence.
- **Skills to apply:** none
- **Practices:** observed numbers only.
- **Known gotchas:** [RI] "a local review run that dies with `Socket timeout` …".
- **Done when:** *Verification log* has both runs' numbers and ids.

### S21 — Recent-run summary contracts  [Contract]
- **Files:** `server/src/vendor/shared/contracts/observability.ts`, `client/src/vendor/shared/contracts/observability.ts`, `server/src/vendor/shared/contracts/trace.ts`, `client/src/vendor/shared/contracts/trace.ts` (modify, same edits); `server/test/multi-agent-contracts.test.ts` (modify, T1); `PRC/RunHistory/RunHistory.test.tsx` (modify: its `RunSummary` fixture gets `multi_agent_run_id: null`)
- **Change:** *Design notes → Contract (S21)*: `MultiAgentOverallStatus`, `MultiAgentRunSummary`, `MultiAgentRunSummaries`, `LatestMultiAgentRun` (D13); `RunSummary.multi_agent_run_id: z.string().nullable()`; header comment's route list.
- **Layer / why here:** ports; shared first, targeted mirror (`trace.ts` copies differ in comments — edit, never copy).
- **Skills to apply:** `zod`, `typescript-expert`, `security`, `onion-architecture`
- **Practices:** schema + `z.infer` type per export; only additive changes; no other `vendor/shared` file.
- **Known gotchas:** [RI] "the two vendored `shared` copies are not actually in sync"; [RI] "TS2719 …"; [CG] type-only `@devdigest/shared` imports.
- **Done when:** `diff server/src/vendor/shared/contracts/observability.ts client/src/vendor/shared/contracts/observability.ts` prints nothing · `grep -n multi_agent_run_id` matches in both `trace.ts` copies · `cd server && pnpm typecheck` · `cd client && pnpm typecheck` · T1 adds: `MultiAgentOverallStatus` accepts the 4 values only; `LatestMultiAgentRun` accepts `{ run: null }`.

### S22 — Index `multi_agent_runs` (D12)
- **Files:** `server/src/db/schema/runs.ts` (modify); migration (create, `pnpm db:generate` only)
- **Change:** `multiAgentRuns` table callback with `index('multi_agent_runs_pr_ran_idx').on(t.prId, t.ranAt)`; then `cd server && pnpm db:generate`.
- **Layer / why here:** schema.
- **Skills to apply:** `drizzle-orm-patterns`, `postgresql-table-design`, `onion-architecture`
- **Practices:** addition only; never edit the generated SQL.
- **Known gotchas:** [SG] "A foreign-key column carries no index"; [RI] "auto-mode permission check blocks an implementer from writing a migration file" (hand back if blocked).
- **Done when:** a new `server/src/db/migrations/0029_*.sql` matches `grep -l multi_agent_runs_pr_ran_idx` · `cd server && pnpm typecheck`.

### S23 — Repo reads + status helpers
- **Files:** `RV/repository/multi-agent.repo.ts`, `RV/repository/run.repo.ts`, `RV/repository.ts`, `RV/multi-agent.helpers.ts` (modify); `server/test/multi-agent-helpers.test.ts` (modify, T2)
- **Change:** repo: `recentMultiAgentRunsForRepo(db, workspaceId, repoId, limit)`, `latestMultiAgentRunForPull(db, workspaceId, prId)`, `agentRunsForMultiRuns(db, ids)` (*Design notes → Repo (S23)*); `listRunsForPull` maps `multi_agent_run_id: run.multiAgentRunId`. Helpers: `overallStatus(statuses)` (AC-15a) and `orderRecent(summaries)` (running first, then newest first, stable).
- **Layer / why here:** repository + pure helper.
- **Skills to apply:** `drizzle-orm-patterns`, `postgresql-table-design`, `onion-architecture`, `typescript-expert`
- **Practices:** awaited queries; `multi_agent_runs.workspace_id` filter on every read; one bulk query for agent runs (no per-run loop); empty ids → `[]`; explicit return types.
- **Known gotchas:** [SG] "A row type derived from `db/schema` … goes in the module's `repository.ts`".
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run multi-agent-helpers` passes, with *Design notes → T2 (S23)* cases.

### S24 — Service + routes for the new reads
- **Files:** `RV/multi-agent.service.ts`, `RV/routes.ts` (modify); `server/test/multi-agent-recent.it.test.ts` (create, T15)
- **Change:** service `recent(workspaceId, repoId)` → `MultiAgentRunSummary[]` (10 newest headers → bulk agent runs → `overallStatus` + `runTotals` → `orderRecent`); `latestForPull(workspaceId, prId)` → `LatestMultiAgentRun` (PR not in workspace → `NotFoundError` via `getPull`). Routes `GET /repos/:id/multi-agent-runs` (D14) and `GET /pulls/:id/multi-agent` (D13), both `IdParams` + `response` schemas, behind `getContext`; extend `MultiAgentRepoPort`.
- **Layer / why here:** application + transport.
- **Skills to apply:** `onion-architecture`, `fastify-best-practices`, `zod`, `typescript-expert`, `security`
- **Practices:** thin handlers; no `db/schema` import in the service; reuse `runTotals` (AC-15c time = AC-31 rule); no model call.
- **Known gotchas:** [SG] "Every route is reachable from the LAN" (reads stay workspace-scoped); [SG] "A hermetic `.it` test must not be able to reach a real API key".
- **Done when:** `cd server && pnpm typecheck` · `.claude/skills/onion-architecture/scripts/check-module.sh reviews` shows no new edge · T15 passes (*Design notes → T15*).

### S25 — Configure run: hooks, "Recent runs", "Latest run for #N"
- **Files:** `client/src/lib/hooks/multi-agent.ts` (modify); `MA/_components/RecentRuns/`, `MA/_components/LatestRunLink/` (create); `MA/_components/ConfigureRun/ConfigureRun.tsx`, `ConfigureRun.test.tsx`, `styles.ts` (modify); `client/messages/en/runs.json` (modify). Tests = T16, T17.
- **Change:** hooks `useRecentMultiAgentRuns(repoId)` (`["multi-agent-recent", repoId]`) and `useLatestMultiAgentRun(prId)` (`["multi-agent-latest", prId]`), each `refetchInterval` 3000 while any returned run is `running` (AC-15d); `useStartMultiAgentRun` also invalidates `["multi-agent-recent"]`. `RecentRuns` below the run button (AC-15b): rows as `next/link` to `/repos/${repoId}/multi-agent/${id}` (AC-15e) with `#N · title`, agent names (more than 3 → "<N> agents", assumption), status word, time, cost + partial mark (AC-15c); empty → AC-15f copy. `LatestRunLink` beside step 1 when the PR has a run: "Latest run for #N" + status (AC-15g). Strings in *Design notes → Strings (S25)*.
- **Layer / why here:** data layer + route-local UI (Configure run only).
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`, `security`
- **Practices:** PR title and agent names as plain text; status/time/cost formatting in a `helpers.ts`; rows keyboard-reachable links; ≤200 lines per component.
- **Known gotchas:** [CG] "Import only types from `@devdigest/shared`"; [CG] "no `user-event`"; [CG] "`vi.mock` … `importActual`".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run RecentRuns LatestRunLink ConfigureRun` asserts AC-15b (order as given, block below the button), AC-15c (all fields; "<N> agents" over 3; partial mark), AC-15d (new data → new status without remount), AC-15e (href), AC-15f (empty copy), AC-15g (link with status when present; absent when `run: null`).

### S26 — PR page: link from a run-history row to its multi-agent run
- **Files:** `PRC/RunHistory/RunHistory.tsx`, `PRC/RunHistory/RunHistory.test.tsx`, `PRC/FindingsTab/FindingsTab.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `client/messages/en/prReview.json` (modify). Test = T18.
- **Change:** `RunHistory` prop `multiRunHref?: (multiAgentRunId: string) => string`; a row with `multi_agent_run_id` shows a `next/link` icon link (label `prReview.timeline.openMultiRun`, "Open multi-agent results") to that href; no link otherwise (AC-15h). `FindingsTab` passes it through; `page.tsx` builds `/repos/${repoId}/multi-agent/${id}`.
- **Layer / why here:** route-local UI (PR page, Agent runs tab = `FindingsTab`, `PrDetailHeader.tsx:144`).
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** `RunHistory` stays free of router hooks (href from the prop); accessible label.
- **Known gotchas:** [CG] "A vitest filter containing a bracketed route segment".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run RunHistory FindingsPanel` passes; T18 asserts the link and href for a linked run and no link for `multi_agent_run_id: null`.

### S27 — Tabs mode at full width, tab bar without scrollbar
- **Files:** `MA/[runId]/_components/TabsView/styles.ts`, `TabsView.tsx`, `TabsView.test.tsx` (modify). Test = T19.
- **Change:** drop `maxWidth: 760` from `s.wrap` (`TabsView/styles.ts:5`) and set `width: "100%"` (AC-41a); tabs `flex: "1 1 0"`, `minWidth: 0`, name truncated with ellipsis (full name in `title`) so up to 5 tabs fit without scrolling (AC-41b); keep `overflowX: "auto"` as the >5-agent fallback.
- **Layer / why here:** route-local UI styles.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** each `styles.ts` entry its own literal; border longhand kept.
- **Known gotchas:** [CG] "In a colocated `styles.ts`, give every entry its own literal"; [CG] "write all four sides longhand".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run TabsView` passes; T19 asserts the wrap has no `maxWidth` and each tab has `flex: 1 1 0` + a `title` with the full name · main session: live screenshot at 1280 px with a 5-agent run shows no tab-bar scrollbar and content at full width (*Verification log*).

## Tests
| Id | File | Tier | Covers | Step |
|---|---|---|---|---|
| T1 | `server/test/multi-agent-contracts.test.ts` | unit | AC-21 | S1 |
| T2 | `server/test/multi-agent-helpers.test.ts` | unit | AC-16–19, 31, 35, 37, 43–49 | S6 |
| T3 | `server/test/review-concurrency.it.test.ts` | integration | AC-8, 24–26, 28, 29 | S4 |
| T4 | `server/test/multi-agent-run.it.test.ts` | integration | AC-16, 18, 19, 21–23, 27, 30, 31, 34 | S8 |
| T5 | `client/src/lib/agent-estimates.test.ts` | unit | AC-14, 17, 18 | S9 |
| T6 | `CMP/finding-card/FindingCard.test.tsx` | unit | AC-36 | S10 |
| T7 | `CMP/run-trace-drawer/RunTraceDrawer.test.tsx` | unit | AC-53, 54, 54a, 57 | S11 |
| T8 | `CMP/agent-identity/AgentIdentity.test.tsx` | unit | AC-20 | S12 |
| T9 | `RunReviewDropdown.test.tsx`, `AgentPickerPanel.test.tsx` | unit | AC-1–8 | S14 |
| T10 | `ConfigureRun.test.tsx`, `AgentPickList.test.tsx` | unit | AC-10–15 | S15 |
| T11 | `ResultsPage.test.tsx`, `ResultsHeader.test.tsx` | unit | AC-30–32, 52, 55, 56 | S16 |
| T12 | `ColumnsView.test.tsx`, `AlsoFlaggedBy.test.tsx` | unit | AC-28, 33–35, 38, 39, 44 | S17 |
| T13 | `TabsView.test.tsx` | unit | AC-36, 40–42 | S18 |
| T14 | `DisagreeBlock.test.tsx` | unit | AC-35, 46, 47, 50, 51 | S19 |
| T15 | `server/test/multi-agent-recent.it.test.ts` | integration | AC-15a–c, 15g, 15h; workspace scoping | S24 |
| T16 | `MA/_components/RecentRuns/RecentRuns.test.tsx` (+ `ConfigureRun.test.tsx`) | unit | AC-15b–f | S25 |
| T17 | `MA/_components/LatestRunLink/LatestRunLink.test.tsx` | unit | AC-15g | S25 |
| T18 | `PRC/RunHistory/RunHistory.test.tsx` | unit | AC-15h | S26 |
| T19 | `MA/[runId]/_components/TabsView/TabsView.test.tsx` | unit | AC-41a, 41b | S27 |
| T1, T2 | (extended) | unit | S21 contracts; AC-15a status, recent order | S21, S23 |

## Migrations & contracts
- S2 migration (`multi_agent_run_id` + index, `finished_at`, `reviews_run_idx`) via `cd server && pnpm db:generate`; `pnpm db:migrate` by the main session. S1 contract, mirrored in the same step.
- S22 migration 0029 (`multi_agent_runs_pr_ran_idx`, D12) via `pnpm db:generate`; `pnpm db:migrate` by the main session. S21 contracts (`observability.ts` + `trace.ts` `RunSummary`), mirrored in the same step.

## Out of scope
- `ci/`, `agent-runner/`, `reviewer-core/`, `mcp-server/`, `e2e/`; a body schema for `POST /pulls/:id/review` (D6); Learn/Reply; stored icons; worktrees; merging findings; seeded agents; any other `vendor/**` edit.

<!-- implementer-brief:end -->

## Design notes

### Contract
- `MultiAgentRunRequest = z.object({ agent_ids: z.array(z.string().uuid()).min(1).max(20) })` (the service removes duplicates).
- `AgentColumnStatus = z.enum(['running','done','failed','cancelled'])`.
- `AgentColumnFinding = FindingRecord.extend({ group_id: z.string().nullable(), also_flagged_by: z.array(z.string()) })`. `also_flagged_by` holds the other agents' run ids. Import `FindingRecord` from `./review-api.js`.
- `AgentColumn`: `run_id`, `agent_id: string|null`, `agent_name: string|null`, `agent_deleted: boolean`, `provider`, `model`, `status: AgentColumnStatus`, `error: string|null`, `verdict`, `score`, `summary`, `duration_ms`, `cost_usd`, `cost_source: CostSource.nullable()`, `tokens_in`/`tokens_out: int|null`, `grounding: string|null`, `ran_at: string`, `finished_at: string|null`, `findings`.
- `ConflictTake`: `run_id`, `agent_id|null`, `agent_name|null`, `verdict: Severity | 'ignored'` ('ignored' renders "did not flag"), `finding_id|null`, `title|null`. `persona` and `note` are removed; nothing reads them.
- `Conflict`: `id`, `file`, `line`, `title`, `severity`, `is_conflict: boolean`, `takes`.
- `MultiAgentRun`: existing fields plus `pr_title: string|null` and `total_cost_partial: boolean`; `total_duration_ms` becomes nullable; `conflicts` holds every listed group.
- `AgentEstimate = { agent_id, duration_ms|null, cost_usd|null, sample_size: int, last_verdict|null }` and `AgentEstimates = z.array(AgentEstimate)`.
- Update the file's header comment (no `GET /pulls/:id/multi-agent`).

### Repo
- `insertMultiAgentRun(db, { workspaceId, prId }) → { id, ranAt }`
- `getMultiAgentRun(db, workspaceId, id) → { id, prId, ranAt, prNumber, prTitle } | undefined`
- `agentRunsForMultiRun(db, multiAgentRunId) → { run, agentName }[]`, ordered by `ran_at`, then `id`
- `reviewsWithFindingsForRuns(db, runIds) → { review, findings }[]`
- `lastDoneRunsPerAgent(db, workspaceId, limit = 5) → { agentId, runId, durationMs, costUsd, ranAt }[]`. This uses a subquery with `row_number() over (partition by agent_id order by ran_at desc)`, keeps `status = 'done'` and `agent_id is not null`, and filters `rn <= limit`.
- `summariesForRuns(db, runIds) → { runId, summary, createdAt }[]`

### Helpers
- `sortFindings`: CRITICAL, then WARNING, then SUGGESTION; then `file`, then `start_line`.
- `groupFindings(columns)`: per file, union-find over inclusive `[start_line, end_line ?? start_line]` overlaps. A group counts only when it spans 2 or more runs. It sets `group_id` and `also_flagged_by`, deduplicated.
- `buildConflicts(columns)`: one entry per group.
  - Heading: the highest-severity finding; on a tie, the lowest `start_line`.
  - Takes: one per `done` column. The verdict is that column's highest severity in the group, or `'ignored'`.
  - `is_conflict`: some `done` column did not flag the group, or the flagging columns' severities differ.
  - Listed: groups flagged by 2 or more columns, plus every `is_conflict` group.
- `median(nums)`.
- `firstSentence(text)`: text up to the first `.`, `!` or `?` followed by whitespace or end of text, or up to the first newline; trimmed; at most 200 characters.
- `estimatesFrom(rows, summaries, agentIds)`:
  - Duration: median of up to 5 durations.
  - Cost: median of the non-null costs, else null.
  - `sample_size`: the number of runs used.
  - Last verdict: `firstSentence` of the newest non-empty summary among those runs (assumption).
- `runTotals(columns)`:
  - `total_duration_ms` = max `finished_at` − min `ran_at`. It is null while a column is `running`, or when no column has `finished_at`.
  - `total_cost_usd` = sum of the known costs.
  - `total_cost_partial` = some `done` column has a null cost.
- `toColumnStatus(status)`: anything unknown or null maps to `failed`.

### T2
- Grouping (AC-43):
  - A–B–C chain with A∩C empty → one group.
  - A shared single line counts as overlap.
  - `end_line` null.
  - The same agent twice → that agent appears once in `also_flagged_by`.
  - Different files never group.
- Heading tie-break (AC-46).
- A failed column has no take (AC-48).
- Conflicts (AC-49): one case where an agent did not flag, one where the severities differ.
- Sort order (AC-37).
- Median of odd, even and empty inputs; `firstSentence`.
- All columns failed → no conflicts (AC-35).
- Partial cost; totals while a column is running are null (AC-31).

### T3
Setup: run-all on the 5 seeded, enabled agents (`seed.ts:192-239`), with `DeferredLLMProvider` installed via `llmUnderEveryProvider` and `isolatedTestConfig()`.

| Case | Assertion | AC |
|---|---|---|
| Concurrency limit | `pendingCount` reaches 4 and never 5 before a release; after the release the 5th call arrives | AC-25, AC-29 |
| Shared preparation | `vi.spyOn(app.container.git, 'diffCommits')` is called once | AC-24 |
| One agent fails | `ScriptedLLMProvider` matches every agent's system prompt except one; that run ends `failed` with an `error`, the other four end `done` | AC-26, AC-28 |
| One agent cancelled | `POST /runs/:id/cancel` on one pending run → it ends `cancelled`; the rest end `done` after the release | AC-26 |
| Run-all stays unlinked | run-all rows have `multi_agent_run_id` null | AC-8 |

### T4
| Case | Assertion | AC |
|---|---|---|
| Bad body | missing body, `[]` or 21 ids → 4xx; no new `agent_runs` or `multi_agent_runs` rows | AC-21 |
| Unknown agent | → 404; no new rows | AC-22 |
| Duplicate id | the agent runs once | AC-21 |
| Accepted | 200, every column `running`, rows linked to the multi-agent run | AC-23 |
| Read after finish | `GET` returns findings, groups, `finished_at` and totals | AC-30, AC-31 |
| Not found | another workspace or a random uuid → 404 | — |
| Deleted agent | the column has `agent_deleted` set and keeps its results | AC-34 |
| Diff fails | `diffCommits` rejects on a PR with `base_sha` → every column `failed` with the same error | AC-27 |
| Estimates | medians of the last 5 `done` runs; an agent with only failed runs → `sample_size` 0 and nulls; first sentence of the latest summary | AC-16, AC-18, AC-19 |

### Strings
- `runs.page`:
  - `meta` = `"{count} agents · parallel fan-out · {duration}s total · {cost}"`
  - new keys: `selectedAgents` "{count} selected agents · parallel", `configureRun` "Configure run", `costPartial`, `notFound`
- `runs.configure`:
  - `step1`, `step2`
  - `pickPrFirst` "Pick a pull request first"
  - `selectAll` "Select all"
  - `noEstimate` "no estimate yet"
  - `aggregate` "≈ {duration}s · {cost} · parallel fan-out"
  - `run` "Run multi-agent review ({count})"
  - `noAgents` plus its CTA "Go to Agents"
- `runs.column`: `deletedAgent` "Deleted agent"; `status.{running,done,failed,cancelled}`
- `runs.alsoFlaggedBy` "also flagged by {agents}"
- `prReview.runReview`: `pickAgents` "Pick agents to run", `clear` "Clear", `runMulti` "Run multi-agent review ({count})", `runOnly`
- Keep the existing `runs.conflicts.*` and `prReview.runReview.configureAgents`.

### Picker
- The trigger opens a panel rendered with `createPortal` into `document.body`, `position: fixed` from the trigger rect. Escape and an outside click close it.
- Panel contents, top to bottom:
  1. The merged warning (when it applies).
  2. "Run all enabled agents" (the call is unchanged).
  3. "Pick agents to run": one `Checkbox` row per agent with its name and estimate (or "no estimate yet"), plus a "run only this agent" icon. That icon keeps the single-agent run (AC-8; the layout is an assumption about the mockup).
  4. "Clear" and "Run multi-agent review (N)". The button is disabled at 0; it calls `useStartMultiAgentRun`, then `router.push(/repos/${repoId}/multi-agent/${id})`.
  5. "Configure agents…" → `/repos/${repoId}/multi-agent?pr=${number}`.
- The selection resets to the enabled agents every time the panel opens (AC-2).
- `repoId` and `number` come from `useParams`, so the props are unchanged. Update the `next/navigation` mocks in the two test files to include `useParams`.

### Contract (S21)
- `MultiAgentOverallStatus = z.enum(['running','done','partially_failed','failed'])`.
- `MultiAgentRunSummary = z.object({ ... })` with these fields:
  - `id`, `pr_id`, `pr_number: int`, `pr_title: string|null`, `ran_at`
  - `status: MultiAgentOverallStatus`
  - `agent_count: int`, `agent_names: z.array(z.string().nullable())` (null = deleted agent)
  - `total_duration_ms: int|null`, `total_cost_usd: number|null`, `total_cost_partial: boolean`
- `MultiAgentRunSummaries = z.array(MultiAgentRunSummary)`.
- `LatestMultiAgentRun = z.object({ run: MultiAgentRunSummary.nullable() })` (D13).
- `RunSummary` (`trace.ts`) gains `multi_agent_run_id: z.string().nullable()`.
- Header comment routes: add `GET /repos/:id/multi-agent-runs` and `GET /pulls/:id/multi-agent`.

### Repo (S23)
- `recentMultiAgentRunsForRepo(db, workspaceId, repoId, limit = 10) → MultiAgentRunHeader[]`. It joins `pull_requests`, filters `multi_agent_runs.workspace_id = workspaceId` and `pull_requests.repo_id = repoId`, and orders by `ran_at desc` with the limit applied.
- `latestMultiAgentRunForPull(db, workspaceId, prId) → MultiAgentRunHeader | undefined`.
- `agentRunsForMultiRuns(db, ids) → (AgentRunWithName & { multiAgentRunId: string })[]` — one query, `inArray`.

### T2 (S23)
- `overallStatus` (AC-15a):
  - any `running` → `running`;
  - all `done` → `done`;
  - `done` + `failed` → `partially_failed`, and the same for `done` + `cancelled`;
  - no `done` → `failed`;
  - empty list → `failed` (assumption: every agent run was deleted).
- `orderRecent`: running runs first (newest first among them), then the rest newest first; the order is stable.

### T15 (S24)
Rows are inserted directly with fixed statuses (`multi_agent_runs` + `agent_runs`), so no model is involved.

| Case | Assertion | AC |
|---|---|---|
| Limit | 11 runs on one repo → 10 returned | AC-15b |
| Order | a running run older than a done one is listed first | AC-15b |
| Status | `done`, `partially_failed` (done + cancelled), `failed` and `running` are each derived | AC-15a |
| Row fields | totals follow the AC-31 rule; a partial cost is flagged; agent names come back, and a deleted agent is null | AC-15c |
| Other repo | a run on another repo of the same workspace is excluded | — |
| Other workspace | `GET /repos/:id/multi-agent-runs` for a repo of another workspace → `[]` | — |
| Latest run | `GET /pulls/:id/multi-agent` returns the newest run of the PR | AC-15g |
| No run | a PR with no run → `{ run: null }` | AC-15g |
| Foreign PR | a PR of another workspace, or a random uuid → 404 | — |
| Run history | `GET /pulls/:id/runs` gives a linked row its `multi_agent_run_id`, and a single-agent row null | AC-15h |

### Strings (S25)
- `runs.recent.title` "Recent runs"
- `runs.recent.empty` "No multi-agent runs yet — runs you start appear here."
- `runs.recent.agentsCount` "{count} agents"
- `runs.recent.latestFor` "Latest run for #{number}"
- `runs.overallStatus.{running,done,partially_failed,failed}` ("running", "done", "partially failed", "failed")
- `prReview.timeline.openMultiRun` "Open multi-agent results"

### Other
- **Wall-clock (D11):** start = the earliest `agent_runs.ran_at`, which is set at request time and so includes the shared preparation. End = the latest `finished_at`; reaped runs have none and are skipped.
- **Column order:** `ran_at`, then `id` (assumption).
- **Palette:** 8 pairs (assumption).
- **Pass-1 review:** TQ1–TQ4, GAP1–GAP4 (closed in the spec) and REC1–REC4. The answers are in *Decisions recorded*.

## Context applied
- `server/insights/gotchas.md` → FK index, `db:generate` hang, bodyless POST, LAN reach, hermetic `.it`, trace after `waitForPrRuns` — S2, S4, S8.
- `client/insights/gotchas.md` → type-only shared imports, nav.ts exception, SafeMarkdown, portals, `SeverityBadge compact`, Suspense, `fireEvent`, bracket filters, TS2742 — S9–S19.
- Root `INSIGHTS.md` → shared copies drift, TS2719, auto-mode blocks migration writes, Socket timeout — S1, S2, S20.
- `docs/plans/assets/40-multi-agent-review/research.md` Q1–Q8 → S4–S11.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| engineering-insights | preload | Context applied | — |
| onion-architecture | preload | S1–S8 | — |
| fastify-best-practices | on demand (S4) | S4, S8 | — |
| zod | on demand (S1) | S1, S4, S7, S8 | — |
| drizzle-orm-patterns | on demand (S2) | S2, S3, S5 | — |
| postgresql-table-design | on demand (S2) | S2, S5 | — |
| frontend-architecture | on demand (S9) | S9–S19 | — |
| react-best-practices | on demand (S9) | S9–S12, S14–S19 | — |
| next-best-practices | on demand (S9) | S9–S11, S13–S16 | — |
| react-testing-library | on demand (S10) | S10–S12, S14–S19 | — |
| typescript-expert | on demand (S1) | S1, S3–S19 | — |
| security | on demand (S1) | S1, S4, S7–S10, S14–S18 | — |
| (correction round) all of the above | on demand per step | S21–S27 as listed in each step | — |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `contracts/observability.ts` (both copies) | ports | changed |
| server | `db/schema/{runs,reviews}.ts`, migration | infrastructure | changed / new |
| server | `modules/reviews/repository/{run,multi-agent}.repo.ts`, `repository.ts` | infrastructure | changed / new |
| server | `modules/reviews/{run-executor,service,constants}.ts` | application | changed |
| server | `modules/reviews/multi-agent.{service,helpers}.ts` | application | new |
| server | `modules/reviews/routes.ts` | transport | changed |
| client | `lib/hooks/{multi-agent,trace,index}.ts`, `lib/agent-estimates.ts` | data | new / changed |
| client | `components/{run-trace-drawer,finding-card,turn-into-eval-case,safe-markdown,agent-identity}` | shared UI | moved / new |
| client | `app/repos/[repoId]/pulls/[number]/…` | route UI | changed |
| client | `app/repos/[repoId]/multi-agent/**` | route UI | new |
| client | `messages/en/{runs,prReview}.json`, `vendor/ui/nav.ts` | i18n / nav | changed |
| shared | `contracts/trace.ts` (`RunSummary`, both copies) | ports | changed (S21) |
| server | `db/schema/runs.ts` + migration 0029 | infrastructure | changed / new (S22) |
| client | `multi-agent/_components/{RecentRuns,LatestRunLink}`; `pulls/[number]/_components/{RunHistory,FindingsTab}` | route UI | new / changed (S25–S27) |

## Risks & open questions
- **D11 resolved: A** (see *Decisions recorded*).
- **The brief above the marker is about 24.5k characters**, over the ~20k guide: there are 20 steps and 59 ACs. Shapes and test cases were moved below the marker to keep it close.
- **S10 changes two import lines in `onboarding-tour/`.** That is outside the PR and Multi-Agent pages. The move is needed because `FindingCard` must use `SafeMarkdown` for AC-36, and the PR page's FindingCard gets the same fix.
- **Tokenizer concurrency safety was not checked.** The LLM adapters hold only an SDK client (`adapters/llm/anthropic.ts:43-46`, `openai.ts:49-52`), and T3 runs against stubs.
- **TanStack Query `refetchInterval` after a 404 error (S11).** T7 must prove the trace is polled again. If it is not, poll with a timer instead.
- **Cancel is not workspace-scoped.** `POST /runs/:id/cancel` and `cancelRunIfRunning` were like this before this plan (research Q2) and stay unchanged.
- **The `nav.ts` line is lost on a vendor refresh.** S13 adds a comment saying so.
- **Docs vs code:** `runs.json` `page.meta` claimed "fan-out via p-queue", which the spec rejects. S13 fixes it.
- **No external research is needed.**
- **Correction round (UF1/UF2): D12–D15 are open.** S21–S27 are written assuming A for each.
- **S21 adds a required field to `RunSummary`.** Any typed `RunSummary` literal must add it. The only fixture found is `RunHistory.test.tsx` (grep for `findings_count`); `mcp-server` has its own vendored copy and is not touched. The API only adds a field, so existing clients keep working.
- **AC-41b can't be measured in jsdom.** T19 checks the styles; the real proof is the main session's 1280 px live screenshot (S27 Done when).
- **"Does not fit" in AC-15c is read as "more than 3 names"** (assumption), so it can be tested; a design review may change the threshold.
- **The brief grows to about 38k characters** with S21–S27 and the main session's *Decisions recorded* lines. The G9/G10 runs read all of it.

## Handed off
- architecture-reviewer: `multi-agent.service.ts` deps (no `Container`, local ports); helper purity; executor queue; S10 moves.
- security review: `POST /pulls/:id/multi-agent-run` (body schema, 20-id cap, rate limit, validation before insert); `GET /multi-agent-runs/:id` workspace scope; `?trace=` validated against columns; model text via `SafeMarkdown`.
- correction round: security — `GET /repos/:id/multi-agent-runs` and `GET /pulls/:id/multi-agent` workspace scoping (T15); architecture — repo bulk query, `MultiAgentRepoPort` growth.

## Insights to record
- `client/INSIGHTS.md` · What Doesn't Work — the PR page `FindingCard` rendered model rationale and suggestion with the vendored `Markdown`, which loads remote images (`FindingCard.tsx:81,87` before S10).
- `server/INSIGHTS.md` · Codebase Patterns — `agent_runs` had no end time, and `duration_ms` starts after the shared preparation (`run-executor.ts:239`), so a batch's wall-clock time can't be derived from it. Record this only if D11 = A lands.

## Red-flags check
- [x] Every spec AC-n has a row in *Spec traceability* with a step or test
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; technical choices in *Decisions needed* (D11); no product gap left
- [x] Groups end type-checking; G4 parallel to G2/G3 only (no shared file)
- [x] No group under 3 files / ~80 lines that could merge (G6 is one large step)
- [ ] The brief above the marker is under ~20,000 characters — ~24.5k, see *Risks*
- [x] Execution mode multi-agent per the rule (migration + contract)
- [x] Every step's *Skills to apply* is complete
- [x] `bash .claude/skills/sdd/scripts/sdd.sh plan-lint <plan>` prints `plan-lint: ok`

## Handoffs → G1
- Contract exports from `@devdigest/shared` (schema + type each): `MultiAgentRunRequest`, `AgentColumnStatus`, `AgentColumnFinding`, `AgentColumn`, `ConflictTake`, `Conflict`, `MultiAgentRun`, `AgentEstimate`, `AgentEstimates`. Removed `ConflictTake.persona` and `note`; `AgentColumn.agent_id`/`agent_name` and `MultiAgentRun.total_duration_ms` are nullable. Server and client `observability.ts` copies are identical (`diff` clean).
- `createAgentRun({ ..., multiAgentRunId?: string | null })` in `run.repo.ts` and `ReviewRepository`; `completeAgentRun` and `cancelRunIfRunning` set `finishedAt`.
- Schema: `agentRuns.multiAgentRunId` (FK `set null`), `agentRuns.finishedAt`, indexes `agent_runs_multi_agent_run_idx`, `reviews_run_idx`; migration `0028_tearful_lyja.sql`, applied to the local DB by the main session (2026-10-15).
- Main session: `reviewer-core` had no `node_modules` (server typecheck failed on `../reviewer-core/src/**`); `npm ci` there fixed it, server `pnpm typecheck` is now clean.
- Security handoff: `MultiAgentRunRequest` (uuid array, 1–20) is the trust boundary for G3.

### Skills (G1)
| Skill | Loaded | Applied in |
|---|---|---|
| `onion-architecture` | preload | S1–S3 |
| `engineering-insights` | preload | server gotchas read; no new insight |
| `zod`, `typescript-expert`, `security` | on demand | S1 |
| `drizzle-orm-patterns`, `postgresql-table-design` | on demand | S2, S3 |

## Handoffs → G4
- Hooks from `@/lib/hooks` (barrel exports `multi-agent`): `useAgentEstimates()`; `useMultiAgentRun(runId)` (polls every 3 s while a column is `running`, `retry: false`); `useStartMultiAgentRun()` (`mutate({ prId, agentIds })`); `useMultiAgentFindingAction(runId)` (`mutate({ findingId, action })`).
- `@/lib/agent-estimates`: `aggregateEstimate(estimates)` → `{ duration_ms, cost_usd }`; `formatEstimate({ duration_ms, cost_usd })` → `{ duration: string | null (seconds, no unit), cost: string | null }`.
- Moved (barrels kept): `@/components/run-trace-drawer` (default + `RunTraceDrawer`, new prop `endedAt?: string | null`), `@/components/finding-card`, `@/components/turn-into-eval-case`, `@/components/safe-markdown`. `FindingCard` renders rationale/suggestion via `SafeMarkdown` (T6).
- `useRunTrace(runId, enabled, { pollUntil? })` and `TRACE_POLL_MS` (2000) exported from `lib/hooks/trace.ts`; `TRACE_PENDING_MS` (30_000) in the drawer's `constants.ts`. T7 lives in `RunTraceDrawer.pending.test.tsx`.
- Deviations (trivial): T7 in a separate test file (the existing one mocks `useRunTrace`); `TRACE_POLL_MS` in the hook file.
- Client `pnpm test`: 90 files, 662 passed; typecheck clean. Browser not checked.
- Insight candidates: TanStack `refetchInterval` as a function keeps polling after a 404 with `retry: false`; moved tests importing `messages/en/*.json` by deep relative path need the depth recounted.

### Skills (G4)
| Skill | Loaded | Applied in |
|---|---|---|
| `onion-architecture`, `engineering-insights` | preload | client gotchas read |
| `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`, `security` | on demand | S9–S11 |

## Handoffs → G2
- `ReviewService.runReview(workspaceId, prId, targets, logger?, opts?: { multiAgentRunId?: string })` forwards the id to `createAgentRun`. `MAX_PARALLEL_AGENTS = 4` in `constants.ts`; `executeRuns` uses a per-call `PQueue` and awaits `onIdle`.
- `ReviewRepository` (from `repository/multi-agent.repo.ts`): `insertMultiAgentRun({ workspaceId, prId }) → { id, ranAt }`; `getMultiAgentRun(workspaceId, id) → { id, prId, ranAt, prNumber, prTitle } | undefined`; `agentRunsForMultiRun(id) → { run: AgentRunRow, agentName }[]` (ordered `ran_at`, `id`); `reviewsWithFindingsForRuns(runIds) → { review: MultiReviewRow, findings: FindingRow[] }[]`; `lastDoneRunsPerAgent(workspaceId, limit = 5)`; `summariesForRuns(runIds)`. `AgentRunRow`, `MultiReviewRow` exported from `repository.ts`. These queries are typechecked only — T4 (G3) exercises them.
- Helpers in `multi-agent.helpers.ts` (contract types in/out): `sortFindings`, `groupFindings(columns)` (`group_id = <file>:<first start_line>`), `buildConflicts(groupedColumns)` (conflict id = `group_id`), `median`, `firstSentence`, `estimatesFrom(rows, summaries, agentIds)`, `runTotals(columns)`, `toColumnStatus`. S7 must call `groupFindings` before `buildConflicts`, convert `Date` → ISO, and `sortFindings` per column.
- T3 pattern for T4: `GatedProvider` in `review-concurrency.it.test.ts` rejects the PR-intent call (system prompt "You classify the INTENT") so the shared preparation doesn't hang on a deferred stub.
- Security note for S8: check the `getMultiAgentRun` workspace filter.
- Server unit 951 passed; T3 + `reviews.it` + `review-repo-rules.it` 14 passed; typecheck clean.
- Skills gap: `fastify-best-practices`, `zod`, `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`, `security` were named on S4–S6 but their `SKILL.md` was not opened this run.

### Skills (G2)
| Skill | Loaded | Applied in |
|---|---|---|
| `onion-architecture` | preload | S4–S6 |
| `engineering-insights` | preload | server gotchas read |
| `fastify-best-practices`, `zod`, `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`, `security` | **not opened** | — |

## Handoffs → G3
- Routes in `reviews/routes.ts`, all behind `getContext`: `POST /pulls/:id/multi-agent-run` (body `MultiAgentRunRequest` `{ agent_ids }`, rate limit 10/min, returns `MultiAgentRun` with every column `running`); `GET /multi-agent-runs/:id` (`MultiAgentRun`; missing or foreign id → 404); `GET /multi-agent/estimates` (`AgentEstimates`, one entry per workspace agent).
- `MultiAgentService` (`multi-agent.service.ts`) takes `{ repo, agents: { list }, startRuns }`, built in `routes.ts` from `container.reviewRepo`, `container.agentsRepo`, `service.runReview`. `MultiAgentRepoPort = Pick<ReviewRepository, …>`.
- Column/conflict fields: `group_id = <file>:<first start_line>`; `also_flagged_by` = other runs' ids; conflict id = `group_id`; deleted agent → `agent_deleted: true`. Accept/dismiss stay on `POST /findings/:id/(accept|dismiss)`.
- Deviations (trivial): T4's diff-failure case seeds no `pr_files` (`loadDiff` falls back to them, `diff-loader.ts:86-87`); "not found" is tested with a random uuid only, not a foreign-workspace run.
- Server typecheck clean; T4 + T3 + `reviews.it` 15 passed; unit 951 passed.
- Skills note: `typescript-expert`, `security`, `fastify-best-practices`, `zod` — `SKILL.md` read, rule files under them not opened.

### Skills (G3)
| Skill | Loaded | Applied in |
|---|---|---|
| `onion-architecture`, `engineering-insights` | preload | S7, S8 |
| `fastify-best-practices`, `zod`, `typescript-expert`, `security` | on demand (SKILL.md only) | S7, S8 |

## Handoffs → G5
- `@/components/agent-identity`: `AgentIdentity({ name: string | null | undefined, size?: number = 22 })`, `agentIdentity(name)` → `{ icon: IconName, color }`, `PALETTE`, `NEUTRAL_IDENTITY` (null name → neutral).
- i18n (`runs.json`): `page.selectedAgents`, `page.configureRun`, `page.costPartial`, `page.notFound`; `configure.{step1,step2,pickPrFirst,selectAll,noEstimate,aggregate,run,noAgents.{title,body,cta}}`; `alsoFlaggedBy`; `column.deletedAgent`, `column.status.{running,done,failed,cancelled}`; `page.meta` = "{count} agents · parallel fan-out · {duration}s total · {cost}". `prReview.json` gained `runReview.estimate` ("≈ {duration}s · {cost}", not listed in the plan's Strings note).
- Reuse for G6: `AgentPickerPanel/helpers.ts` `estimateParts(estimate)` → `{ duration, cost } | null`; `@/lib/agent-estimates` `aggregateEstimate`, `formatEstimate`.
- PR page "Configure agents…" → `/repos/${repoId}/multi-agent?pr=${number}`. Nav item `multi-agent` (icon `Layers`) → `/repos/:repoId/multi-agent`, commented as the spec-013 sanctioned vendored edit (checked by the main session).
- Tests rendering `RunReviewDropdown`/`PrDetailHeader` must mock `next/navigation` (`useParams`) and `@/lib/hooks/multi-agent`.
- Picker popover: portal + outside-click via `data-agent-picker`; estimates fetched on open; tested in jsdom only.
- Deviations (trivial): popover geometry in `RunReviewDropdown/constants.ts`; extra `runReview.estimate` key; an accidental `git rm --cached` was reverted with `git reset` (index back to HEAD for that file).
- Client typecheck clean; `pnpm test` 92 files, 669 passed.

### Skills (G5)
| Skill | Loaded | Applied in |
|---|---|---|
| `onion-architecture`, `engineering-insights` | preload | client gotchas read |
| `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`, `security` | on demand (SKILL.md head only) | S12–S14 |

## Handoffs → G6
- `client/src/app/repos/[repoId]/multi-agent/page.tsx` (Configure run) with `_components/ConfigureRun` and `_components/AgentPickList`. On start success it navigates to `/repos/${repoId}/multi-agent/${run.id}`.
- Page pattern for G7: `"use client"`, `AppShell` with a crumb, `RepoNotFound` on a stale repo, `<Suspense>` around the component that calls `useSearchParams`.
- Tests mock `next/navigation` (`useRouter`, `useSearchParams`) and `@/lib/hooks`, `@/lib/hooks/agents`, `@/lib/hooks/multi-agent`; messages loaded with 7 `../` from `_components/<X>/`.
- Deviations (trivial): row estimate composed in `AgentPickList` from `formatEstimate` + `formatCostUsd` (no cross-route import of `estimateParts`); errors use `ErrorState` default + `ApiError` message; "Pick a pull request first" (AC-11) takes precedence over the no-agents state; PR select uses `page.selectPr`/`page.prItem`, `?pr=` = PR number; default selection = enabled agents (assumption, as the PR picker).
- The implementer did not see the pixel mockups (built from AC-10..AC-15 only) — the main session will compare against the mockups in a browser after G8.
- Client typecheck clean; `pnpm test` 94 files, 674 passed. Browser not checked.

### Skills (G6)
| Skill | Loaded | Applied in |
|---|---|---|
| `onion-architecture`, `engineering-insights` | preload | client gotchas read |
| `frontend-architecture` (SKILL.md, component-organization, nextjs-organization), `react-best-practices` (SKILL.md), `next-best-practices` (SKILL.md, suspense-boundaries, file-conventions) | on demand | S15 |
| `react-testing-library`, `typescript-expert`, `security` | on demand (SKILL.md head only) | S15 |

## Handoffs → G7
- `ResultsPage` (`[runId]/_components/ResultsPage`) owns the view state (`ResultsView = "columns" | "tabs"`, exported from `ResultsHeader`), holds `run` (`MultiAgentRun`), `openTrace(runId)` (sets `?trace=` via `router.replace`) and `closeTrace`; the drawer is wired and `?trace=` is honoured only for a column `run_id` of the loaded run. Tabs mode renders only the header for now — G8 adds `{view === "tabs" && <TabsView … />}` and `DisagreeBlock` below both views (no slot left).
- `ColumnsView({ columns, onViewTrace })`; `AlsoFlaggedBy({ runIds, columns })` (from `finding.also_flagged_by`; null name → "Deleted agent"; empty list → nothing) — reuse on every `FindingCard` in `TabsView`.
- Messages path from `[runId]/_components/<X>/`: 8 `../`. `ResultsPage.test.tsx` mocks `@/lib/hooks/multi-agent` (`useMultiAgentRun`) and `@/components/run-trace-drawer`. Severity words: `runs.severity.{critical,warning,suggestion}`; `SEVERITY_META` in `@/lib/severity`.
- Deviations (trivial): new key `runs.page.metaRunning` for a null `total_duration_ms`; `[runId]/page.tsx` also calls `useMultiAgentRun` for the crumb (shared query key); partial cost shown as `+` with `title`/`aria-label` = `page.costPartial`; status word in the header sub-line when scored, inside the empty ring otherwise (AC-39).
- Client typecheck clean; `pnpm test` 98 files, 685 passed. Mockups were given (5.png, 6.png) but no browser comparison was run.

### Skills (G7)
| Skill | Loaded | Applied in |
|---|---|---|
| `onion-architecture`, `engineering-insights` | preload | client gotchas read |
| `frontend-architecture` (SKILL.md, component-organization, nextjs-organization), `next-best-practices` (SKILL.md, suspense-boundaries, file-conventions), `react-best-practices`, `react-testing-library` | on demand | S16, S17 |
| `typescript-expert`, `security` | SKILL.md head only | S16, S17 |

## Handoffs → G8
- `TabsView` and `DisagreeBlock` under `[runId]/_components/`; `ResultsPage` renders `TabsView` for "tabs" and `DisagreeBlock` below both views. `TabsView` calls `useMultiAgentFindingAction(runId)` itself; `DisagreeBlock` takes `run.conflicts`.
- `column.summary` via `SafeMarkdown`; disagree takes and `AlsoFlaggedBy` render model text as plain text. No Learn/Reply buttons (tested).
- Deviations (trivial): a flagged take shows its title, an ignored take only "did not flag"; first finding expanded by default (mockup); a deleted agent's tab reads "Deleted agent".
- Client typecheck clean; `pnpm test` 100 files, 690 passed. Mockups 5.png/6.png viewed; no browser comparison.
- Remaining: S20 (main session, 1-vs-3 measurement).

### Skills (G8)
| Skill | Loaded | Applied in |
|---|---|---|
| `onion-architecture`, `engineering-insights` | preload | client gotchas read |
| `frontend-architecture`, `react-best-practices`, `react-testing-library`, `typescript-expert`, `security` | on demand (SKILL.md head) | S18, S19 |

## Design review (main session, 2026-10-15)
Live check of the worktree build (web :3100, API :3101) against the user's mockups:
`/private/tmp/claude-501/-Users-sergey-emdash-worktrees-dev-digest-fef43e1e-emdash-l07-multi-agents-review-lndx7/26541aca-cba9-494a-bae5-b0df77605634/images/2.png` (PR picker), `3.png` (Configure run, empty), `4.png` (Configure run, filled), `5.png` (results Columns), `6.png` (results Tabs).
The spec wins where it differs (no Learn/Reply, bare "did not flag", "parallel fan-out" copy). Gaps for fix mode:

- **DG1 — Configure run header (3.png/4.png).** Crumb must read "Multi-Agent Review › Configure run" (today "acme/payments-api › Multi-Agent Review"). Title "Run a Multi-Agent Review" with the subtitle "Pick a pull request and choose which agents to fan out — they run in parallel and you compare their findings side by side." Drop the "N selected agents · parallel" line under the title (not in the mockup).
- **DG2 — Configure run steps (3.png/4.png).** No card boxes around the steps. Each step is a numbered circle badge + label ("1 Pull request", "2 Agents to run"; step 2 label muted until a PR is chosen). Step 1 is a compact select button (PR icon, "Select a pull request…" / "#482 · Add rate limiting to public API endpoints", chevron), not a full-width input. "Select all" is a blue text link right-aligned on the step-2 label row.
- **DG3 — Configure run empty state (3.png).** A dashed-border box with the PR icon tile, the title "Pick a pull request first" and the body "Choose which PR to review above, then select the agents to run on it."
- **DG4 — Agent rows (4.png).** Each agent is a stacked card: checkbox, tinted icon tile, name on line 1, last-verdict text on line 2 (wrapping, muted), estimate "8.2s · $0.06" mono, top-right. A checked row gets the agent's colour as border and a faint tint, with the checkbox in that colour; an unchecked row is neutral. Today the row is one line and long verdicts overflow the card (Security Reviewer row runs past the right edge).
- **DG5 — Run button (3.png/4.png).** Users icon before "Run multi-agent review (N)"; the aggregate "≈ 8.2s · $0.20 · parallel fan-out" in mono muted text beside it.
- **DG6 — Agent identity icons (2.png/4.png/5.png).** Map by name keyword where possible: security → shield, performance → bolt (zap), mentor/junior → lightbulb, customer → users, architecture → network/workflow, test → flask/check, api/contract → plug/globe, general → a neutral glyph; fallback palette otherwise. Today four of five seeded agents show the same "<>" glyph.
- **DG7 — PR page picker (2.png).** "Clear" is a blue text link at the right of the "PICK AGENTS TO RUN" header (not a bottom button). Rows: checkbox, agent icon (DG6), name, estimate "~6s" right-aligned on the same line. "Run multi-agent review (N)" is a full-width primary button with the users icon. Keep "Run all enabled agents" and the per-agent run (AC-8) but they must not break this layout.
- **DG8 — Nav placement (3.png).** "Multi-Agent Review" sits in a GLOBAL group (below SKILLS LAB) with the users icon, not in WORKSPACE with "Layers". Only this item is added to GLOBAL (Memory / Agent Performance / CI Runs stay out of scope).
- Results page (5.png/6.png) not yet checked live — needs a run; checked during S20.

## Verification log
- 2026-10-15 — main session: full server `.it` suite `TESTCONTAINERS_RYUK_DISABLED=true pnpm exec vitest run .it.test` → 39 files, 336 passed (after G8 + test-writer, before the DG fix pass; the DG pass is client-only).
- 2026-10-15 — test-writer: `server/test/multi-agent-boundaries.it.test.ts` (5, tenancy 404s, AC-21 body negatives, duplicates, estimates on real rows; break-checked twice) and +1 contract unit test. Empty JSON body → 400 from Fastify's parser (not 422), no rows created.
- 2026-10-15 — DG1–DG8 fixed (implementer fix mode, client only): client `pnpm test` 100 files, 692 passed; typecheck clean. Main session re-screenshotted Configure run (filled) and the PR picker: match 4.png / 2.png. Results page Columns/Tabs and the trace drawer checked live on PR #12: match 5.png / 6.png (trace drawer shows Configuration, Stats with tokens/cost/"6/6 passed", Findings, Log tab, Copy raw output).

### S20 — 1-vs-3 measurement (AC-58)
Setup: worktree API on :3101 (same code as the suite above), all agents `openrouter` · `deepseek/deepseek-v4-flash`, started via `POST /pulls/:id/multi-agent-run`, polled `GET /multi-agent-runs/:id` until no column was `running`. Order: 1 agent first, then 3 agents, back to back.

**Attempt on the demo PR #482 (acme/payments-api) — not usable.** The seeded PR has no base SHA and no `pr_files` patches; the run log says "no base SHA, no PR file patches, and the legacy branch diff failed — reviewing an empty diff". Multi-runs `3746b3c1-…` (1 agent: 4.7 s, $0.00043, 0 findings) and `bc926137-…` (3 agents: 4.1 s, $0.00105, 0 findings). Recorded only to explain why the measurement moved to PR #12.

**PR #12 (korzunss/dev-digest, "feat(pr-export): add PR export endpoint and webhook test", 3 files):**

| Run | Multi-run id | Agent | Status | Duration | Tokens in → out | Cost (USD) | Findings | Grounding |
|---|---|---|---|---|---|---|---|---|
| 1 agent | `bac9c560-d3ae-47b8-b3ca-c56a236e7701` | Security (`9f3a983e-…`) | done | 24.8 s | 5,701 → 3,408 | 0.00175 | 4 | 4/4 passed |
| 3 agents | `49f43eed-d8b3-43ec-8156-d742835e6de4` | Security (`324c155b-…`) | done | 18.5 s | 5,701 → 2,933 | 0.00123 | 6 | 6/6 passed |
| | | Performance (`e81ddc6b-…`) | done | 12.7 s | 5,569 → 2,171 | 0.00139 | 3 | 3/3 passed |
| | | General (`2034e921-…`) | done | 45.1 s | 5,465 → 4,890 | 0.00213 | 6 | 6/6 passed |

| Total | Wall-clock (header) | Cost | Findings | Conflicts |
|---|---|---|---|---|
| 1 agent | 24.8 s | $0.00175 | 4 | 0 |
| 3 agents | 45.1 s | $0.00475 | 15 | 2 |
| Ratio 3 : 1 | **1.82×** | **2.71×** | 3.75× | — |

Reading (facts, no target ratio): wall-clock is set by the slowest agent (General, 45.1 s), not the sum (76.3 s), so the fan-out ran in parallel. Cost is below 3× because the agents' output lengths differ (2.2k–4.9k tokens) and the same agent produced fewer output tokens in the second run (Security 3,408 → 2,933), i.e. run-to-run variance; input tokens per agent are nearly identical (one shared diff prep), and no provider prompt-cache discount is visible in the per-agent cost. One sample per side: a series would be needed before drawing a general conclusion.

Not observed live in this measurement: per-column status changing during the run (runs were driven by a script; covered by T11/T12 and the 3 s poll) and a single-agent failure (covered by T3 `review-concurrency.it.test.ts`).

### Observation for the user — grouping on wide line ranges
On PR #12 the disagree entry `routes.ts:14` "Missing authentication/authorization" (Security, lines 14–53) groups Performance's "No SQL pagination" (line 24) and General's "SQL injection" (line 18): the transitive, inclusive-overlap rule (AC-43, TQ2/TQ3) lets one wide finding absorb unrelated ones, so the block shows a "disagreement" between different issues. Behaviour matches the approved spec; changing it is a spec decision.
- 2026-10-15 — plan-verifier full pass: incomplete — 184/191 met; missing SK3–SK6 (skills named on S3–S6 not loaded in G1/G2); not-verifiable AC-33 (live status without reload), R3 (plan untracked, no approved baseline), R4 (no test-writer Proof table in the plan). Handoff gap **H1**: `RunReviewDropdown.tsx` `runMulti` awaits `startMulti.mutateAsync` with no catch — a failed start on the PR page shows no error (S14). Sent to fix mode: SK3, SK4, SK5, SK6, H1.
- 2026-10-15 — architecture-reviewer: PASS, no findings. security-reviewer: PASS, no findings (dependency audit not needed — no dependency changed).
- 2026-10-15 — main session, AC-33 observed live (closes the not-verifiable item): multi-run `8b2450b2-d30a-4535-a584-2f5b1ad23a8c` on PR #12 (Security, Performance, General), results page opened once and never reloaded; API status sequence `running,running,running` → `running,done,running` → `done,done,running` → `done,done,done`; screenshots show all three columns "running" at start, then Security + Performance done with findings and the disagree block populated while General still showed "running", then all done with the header "3 agents · parallel fan-out · 30.4s total · $0.0041" (screenshots in the session scratchpad: live-1/2/3.png).
- 2026-10-15 — fix mode SK3–SK6, H1 (implementer): skills re-loaded for S3–S6 (`typescript-expert`, `drizzle-orm-patterns`, `postgresql-table-design`, `fastify-best-practices`, `zod`, `security`); S5 gained explicit return types / exported row interfaces in `multi-agent.repo.ts`; S3, S4, S6 re-checked, no change. H1: `runMulti` catches a failed start, keeps the panel and selection, shows a `role="alert"` with the `ApiError` message or `runReview.multiStartFailed`; 2 tests. Deviation: H1 also touched `RunReviewDropdown/styles.ts` and `client/messages/en/prReview.json` (not in S14's Files). Not fixed (out of the gap): the single-agent `kick` path has the same missing catch (pre-existing).
- 2026-10-15 — main session after the fix: client `pnpm test` 100 files, 694 passed; server unit 71 files, 952 passed; server `.it` 39 files, 336 passed.

### Skills (fix SK3–SK6)
| Skill | Loaded | Applied in |
|---|---|---|
| `onion-architecture` | preload | S3–S6 |
| `drizzle-orm-patterns` | on demand | S3, S5 |
| `postgresql-table-design` | on demand | S5 |
| `typescript-expert` | on demand | S3–S6 |
| `fastify-best-practices`, `zod`, `security` | on demand | S4 (no route/schema/input change found) |
- 2026-10-15 — R3 evidence (main session; the user did not sign off, so a baseline was rebuilt): `docs/plans/assets/40-multi-agent-review/plan-baseline-pass2.md` is the implementation-planner's last version of this file, rebuilt by replaying its own Write/Edit calls (4 Write + 2 Edit, 0 misses) from its run transcript. `diff` of everything above `<!-- implementer-brief:end -->` against the current file shows only `Status: draft → in-progress` and added lines under *Decisions recorded*. Below the marker, the planner's part differs only in the Risks line "D11 is open" → "D11 resolved: A" and one blank line; everything after that is main-session sections (Handoffs, Design review, Verification log).
- 2026-10-15 — fix mode GR1 (implementer): `MULTI_AGENT_WIDE_FINDING_MAX_LINES = 10` in `reviews/constants.ts`; `groupFindings` groups a finding spanning > 10 lines by `[start_line, start_line]` (new `groupEndOf`), output keeps the full range; T2 +2 tests (14–53 vs 18/24 not grouped, 14 still joins, `end_line` stays 53; a 10-line 14–23 finding still groups with 23). Server typecheck clean, unit 71 files / 954 passed. Skills: `onion-architecture` (preload), `typescript-expert` (on demand) — GR1.
- 2026-10-15 — R4 evidence (the user did not accept the one-line log): test-writer re-ran break checks and its Test Report with a *Proof* table is saved verbatim at `docs/plans/assets/40-multi-agent-review/test-report-proof.md` — T4/boundaries (workspace filter, `status='done'` filter, and the never-proved `AgentsRepository.list` scoping), T2 (GR1 wide-finding rule), T3 (concurrency 1 and 100), T7 (polling; 30 s fallback). All subjects restored (shasums match; `git diff -- server/src/modules/agents/repository.ts` empty). Caveat: the T7 30 s fallback is doubly implemented (timer + render-time deadline), so only removing both mechanisms fails the test.
- 2026-10-15 — plan-verifier delta: **complete** — 191/191 met, nothing to sign off (R3 rebuilt independently from the planner transcript; R4 Proof table; GR1/AC-43). Plan → `done`, spec 013 → `implemented` (main session).

## User review (live check, 2026-10-15)
Collected from the user's own check of the worktree build; to be applied in one spec-correction round once the user has sent all remarks (the plan and spec 013 reopen then).
- **UF1 — a past multi-agent run cannot be found again.** The user started 5 agents on PR #4 from Configure run, left for the PR page while it ran, came back via the nav item and saw a fresh Configure run with no way back to the run (`f25e0507-2fd5-4dc2-9208-39f8bfd894d8`). Chosen: **A + C** —
  - A: Configure run shows a "Recent runs" block below the run button (PR, agents, status running/done/failed, time, cost); a click opens the results page; a running run is listed first with a live status.
  - C: when a PR is selected on Configure run, a link "Latest run for #N (status)" to its newest multi-agent run; the PR page's Agent runs tab links to the multi-agent results of runs that belong to one.
  - Reverses REC2 / D6 in part (a read of a PR's / repo's recent multi-agent runs is now needed).
- **UF2 — Tabs mode is narrower than the page.** In Tabs mode the agent tab bar and the content (agent summary card, finding cards) sit in a ~1200 px column with a horizontal scrollbar on the tab bar and empty space to the right. The user wants the tab bar and the content to take the full content width (the user's explicit request overrides 6.png, which shows a narrower column); the tab bar should not need a horizontal scrollbar at normal widths.
- Note (not a defect of this feature): the "822.8s total" on PR #4's run `f25e0507-…` is real wall-clock — API Contract Reviewer ran 822.7 s and failed with "deepseek/deepseek-v4-flash hit the output cap (max_tokens=32000) after 32000 output tokens" (the runaway output known from `docs/ideas/05-truncated-chunk-runaways.md`); the other four finished within 18–432 s and kept their results.

## Handoffs → G9
- Contracts (`@devdigest/shared`, mirrored): `MultiAgentOverallStatus`; `MultiAgentRunSummary` (`id`, `pr_id`, `pr_number`, `pr_title|null`, `ran_at`, `status`, `agent_count`, `agent_names: (string|null)[]`, `total_duration_ms|null`, `total_cost_usd|null`, `total_cost_partial`); `MultiAgentRunSummaries`; `LatestMultiAgentRun = { run: MultiAgentRunSummary | null }`; `RunSummary.multi_agent_run_id: string | null`.
- Routes (behind `getContext`): `GET /repos/:id/multi-agent-runs` → `MultiAgentRunSummaries` (≤10, running first, then newest; foreign/unknown repo → `[]`); `GET /pulls/:id/multi-agent` → `LatestMultiAgentRun` (no run → `{ run: null }`; foreign/unknown PR → 404).
- Migration `0029_hesitant_mathemanic.sql` (`multi_agent_runs_pr_ran_idx` on `(pr_id, ran_at)`) — applied to the local DB by the main session; worktree API on :3101 restarted (0 running runs beforehand).
- Deviations (trivial): `RECENT_RUNS_LIMIT = 10` in `reviews/constants.ts`; `runTotals` takes a `Pick<AgentColumn, …>`; new `AgentRunWithMultiId`; T15 asserts names with `arrayContaining` (same-`ran_at` order).
- Server typecheck clean; unit 958 passed; T15 + `multi-agent-run.it` 15 passed; client typecheck clean, `RunHistory` 14 passed.

### Skills (G9)
| Skill | Loaded | Applied in |
|---|---|---|
| `onion-architecture` | preload | S21–S24 (`check-module.sh reviews`) |
| `engineering-insights` | preload | server gotchas read |
| `zod`, `typescript-expert`, `security` | on demand (SKILL.md) | S21, S24 |
| `drizzle-orm-patterns`, `postgresql-table-design` | on demand (SKILL.md) | S22, S23 |
| `fastify-best-practices` | on demand (SKILL.md) | S24 |

## Handoffs → G10
- Hooks: `useRecentMultiAgentRuns(repoId)`, `useLatestMultiAgentRun(prId)` (poll 3 s while a run is `running`); `useStartMultiAgentRun` also invalidates `["multi-agent-recent"]` and `["multi-agent-latest"]`.
- UI: `multi-agent/_components/RecentRuns` (below the run button, `next/link` cards) and `LatestRunLink` (beside step 1); strings `runs.recent.*`, `runs.overallStatus.*`. `RunHistory` optional `multiRunHref` prop → `Users` icon link "Open multi-agent results", passed via `FindingsTab` from `page.tsx`. `TabsView`: no `maxWidth: 760`, `width: 100%`, tabs `flex: 1 1 0`, `minWidth: 0`, ellipsis + `title`; `overflowX: auto` kept for > 5 agents.
- Deviations (trivial): `formatRunTime` local copy in `RecentRuns/helpers.ts` (no cross-route import); `LatestRunLink` imports `statusColor` from the sibling `RecentRuns/helpers`. Note: `ConfigureRun.tsx` ≈ 225 lines (> 200 guideline; ≈ 215 before G10).
- Client typecheck clean; `pnpm test` 102 files, 700 passed. Live (implementer): Tabs at 1280 px — tab bar `scrollWidth == clientWidth` (952), 5 tabs shown.
- Main session live check (2026-10-15): Configure run `?pr=4` shows "Latest run for #4 · partially failed →" and "Recent runs" (PR #4 partially failed, PR #12 runs done); Tabs mode at 1280 px on `f25e0507-…` spans the full content width with all 5 tabs (names ellipsised) and no scrollbar; PR #4 `?tab=findings` timeline shows the multi-agent link icon on the five runs of the multi-run and none on the older single runs.

### Skills (G10)
| Skill | Loaded | Applied in |
|---|---|---|
| `engineering-insights`, `onion-architecture` | preload | client gotchas; placement check |
| `frontend-architecture`, `react-best-practices` | on demand (SKILL.md) | S25, S26, S27 |
| `next-best-practices` | on demand (SKILL.md) | S25, S26 |
| `react-testing-library` | on demand (SKILL.md) | S25, S26, S27 |
| `typescript-expert`, `security` | on demand (SKILL.md) | S25–S27 |
- 2026-10-15 — UF correction (G9 + G10): test-writer filled 3 gaps (hook polling AC-15d; two horizontal-scoping cases for the new reads) and proved them; Test Report with *Proof* table saved verbatim at `docs/plans/assets/40-multi-agent-review/test-report-uf.md`. Main session full run afterwards: client typecheck clean, `pnpm test` 103 files / 705 passed; server typecheck clean, unit 71 files / 958 passed, `.it` 40 files / 347 passed.
- 2026-10-15 — UF wave reviews: security-reviewer PASS (no findings); architecture-reviewer PASS with one non-blocking **F1** (`LatestRunLink.tsx:10` deep-imports `statusColor` from `../RecentRuns/helpers`, skipping the barrel). plan-verifier: incomplete — 254/260 met, no regression of the earlier 191; gaps **AC15C** (Recent runs rows render the run's age via `formatRunTime(r.ran_at)` instead of the AC-31 wall-clock `total_duration_ms`; also SP-AC-15d, S25-change, D-S25.2, T16) and **SK-S23** (`typescript-expert` not recorded for S23). Handoff **H2**: `RecentRuns/helpers.ts:34` `listedAgentNames` drops deleted agents (null) instead of showing "Deleted agent" (AC-34 wording). Sent to fix mode: AC15C, SK-S23, F1, H2.
- 2026-10-15 — fix mode AC15C, SK-S23, F1, H2 (implementer): AC15C — `formatRunDuration(ms)` (`(ms/1000).toFixed(1)+"s"`, "—" when null) replaces the age label in Recent runs rows; test asserts "9.0s" and the absence of "3h", plus a null case. F1 — `statusColor` exported via `RecentRuns/index.ts`, imported from `../RecentRuns`. H2 — `listedAgentNames` maps a null name to `column.deletedAgent`; test asserts "Security, Deleted agent". SK-S23 — `typescript-expert` (SKILL.md + `references/typescript-cheatsheet.md`) applied to S23's files: every public export of `multi-agent.repo.ts` and `overallStatus`/`orderRecent` already has an explicit return type; no change. Client typecheck clean; `pnpm test` 103 files / 706 passed.

### Skills (fix AC15C, SK-S23, F1, H2)
| Skill | Loaded | Applied in |
|---|---|---|
| `typescript-expert` | on demand | S23 (SK-S23 re-check), S25 (AC15C, H2) |
| `onion-architecture` | preload | S23 |
- 2026-10-15 — plan-verifier delta after the UF fixes: **complete** — 260/260 met (F1 and H2 closed). Plan → `done`, spec 013 → `implemented` (main session).

## pr-self-review fix wave (2026-10-15)
`/pr-self-review` (base `origin/main`): PASS, 0 verified CRITICAL (2 downgraded to HIGH). The user asked to fix HIGH #1, #2 and the MEDIUM findings now ("виправ пункти 1 і 2 зараз, і виправь також MEDIUM"). Plan back to `in-progress` for this wave. Excluded: **PR-S4** (recent runs `[]` vs 404 — contradicts the user-approved D14 A) and all `agent-runner/` findings (outside Worktree A).

**Client (fix mode):**
- **PR-H1** `ResultsPage.tsx:73` — mount `RunTraceDrawer` with `key={traced.run_id}` so per-run pending/timeout state resets when `?trace=` changes.
- **PR-H2** `AgentPickerPanel.tsx:121` / `RunReviewDropdown.tsx:99` — "Run multi-agent review (N)" disabled + loading while the start mutation is pending; no double start.
- **PR-C1** `ConfigureRun.tsx:203` — non-`ApiError` start failure shows a translated fallback (as `RunReviewDropdown` `runReview.multiStartFailed`), not `String(error)`.
- **PR-C2** `AgentPickList.tsx:45` — clickable row is keyboard-accessible (label tied to the checkbox, or no row onClick + larger hit area).
- **PR-C3** `AgentPickerPanel.tsx:46` — portalled dialog: focus moves in on open, returns to the trigger on close.
- **PR-C4** `TabsView.tsx:52` — complete ARIA tabs pattern (ids, `aria-controls`/`aria-labelledby`, roving `tabIndex`, ArrowLeft/ArrowRight).
- **PR-C5** `ColumnsView.tsx:12`, `TabsView.tsx:12` — import `agentIdentity` from the `@/components/agent-identity` barrel.
- **PR-C6** `RunReviewDropdown.tsx:17` ↔ `AgentPickerPanel/styles.ts:2` — break the sibling-internals cycle (panel owns `PANEL_WIDTH`; `initialSelection` exported from the panel's index).
- **PR-C7** `LatestRunLink.tsx:10` — move `statusColor` to a shared helper under `multi-agent/_components/` used by both components.
- **PR-C8** `ColumnsView.tsx:69,71` — drop `f.severity as Severity` casts (narrow properly).
- **PR-C9** `RunTraceDrawer.tsx:56,59,70` — no `Date.now()`/setState during render: record the first-seen-ended time in an effect, single source of truth for "deadline passed" (also closes the downgraded CRITICAL).
- **PR-C10** `lib/hooks/multi-agent.ts:30,44,55,67,81` — `encodeURIComponent` on interpolated ids.
- **PR-C11** `ConfigureRun.test.tsx:17` — `vi.mock('@/lib/hooks', …)` spreads `importActual` (client gotcha).
- **PR-C12** `ConfigureRun.tsx:27` — `SKELETON_ROWS` to `ConfigureRun/constants.ts`.

**Server (fix mode):**
- **PR-S1** `multi-agent.service.ts:84` — no orphan `multi_agent_runs` row when `startRuns` throws (resolve first / transaction / delete on failure); test it.
- **PR-S2** `run.repo.ts` `reapStaleRunningRuns` — also set `finishedAt`; test it.
- **PR-S3** `multi-agent.service.ts:12` — import `MultiAgentRunHeader` (and siblings) via the `repository.ts` facade.
- **PR-S5** `multi-agent.repo.ts:182` `lastDoneRunsPerAgent` — supporting index on `agent_runs` (e.g. `(agent_id, ran_at)` or partial `WHERE status='done'`) in `db/schema/runs.ts` + generated migration 0030 (main session applies it).

- 2026-10-15 — fix mode PR-S1, PR-S2, PR-S3, PR-S5 (implementer, server): PR-S1 `start()` deletes the group row (new workspace-scoped `deleteMultiAgentRun`, via the facade/port) when `startRuns` throws, then rethrows — agent_runs already created stay (FK `set null`); PR-S2 `reapStaleRunningRuns` sets `finishedAt`; PR-S3 `MultiAgentRunHeader` re-exported from `repository.ts`; PR-S5 partial index `agent_runs_done_agent_ran_idx` on `(agent_id, ran_at DESC) WHERE status='done'`, migration `0030_gorgeous_zaladane.sql` (generated; applied to the local DB and API on :3101 restarted by the main session, 0 running runs beforehand). New `server/test/multi-agent-fixes.it.test.ts` (PR-S1, PR-S2). Server typecheck clean, unit 958, related `.it` 24 passed. Skills: `onion-architecture` (PR-S1, PR-S3), `drizzle-orm-patterns` (PR-S1, PR-S5), `postgresql-table-design` (PR-S5); `typescript-expert`/`fastify-best-practices` not opened (no route changes).
- 2026-10-15 — fix mode PR-H1, PR-H2, PR-C1…PR-C12 (implementer, client): all 14 closed — H1 `key={traced.run_id}`; H2 `starting` prop + `isPending` guard; C1 `runs.configure.startFailed`; C2 row is a `<label>`; C3 dialog focus in/out; C4 full ARIA tabs + Arrow/Home/End; C5 barrel imports; C6 `AgentPickerPanel/constants.ts` owns `PANEL_WIDTH`, index exports `initialSelection`/`PANEL_WIDTH`; C7 `multi-agent/_components/status-color.ts`; C8 casts dropped; C9 first-seen-ended time in an effect, `waiting = !stillRunning && !timedOut` (no clock/setState in render; deviation: with an `endedAt` > 30 s old the pending state shows for one render); C10 `encodeURIComponent`; C11 `importActual` spread; C12 `ConfigureRun/constants.ts`. New tests for H1, H2, C1, C3, C4; `RunTraceDrawer.pending.test.tsx` unchanged and green. Client typecheck clean, `pnpm test` 103 files / 711 passed. Skills: `frontend-architecture` (C6, C7, C12), `react-best-practices` (C3, C4, C9); **`react-testing-library`, `typescript-expert`, `security` not opened** this run.
- 2026-10-15 — plan-verifier delta on the fix wave: complete (18 gaps + 5 process rows met; PR-S4 and agent-runner untouched; 260 earlier items unchanged). Notes: wave Skills logged inline, client run did not open `react-testing-library`/`typescript-expert`/`security`; R4: no Proof for the wave.
- 2026-10-15 — `/pr-self-review` re-run on the wave's files: 0 CRITICAL; one **regression** and five MEDIUM, sent to a second fix round (the verifier missed the regression because `RunTraceDrawer.pending.test` mocks `useRunEvents` as running from the first render):
  - **PR2-H1** `RunTraceDrawer.tsx:55-74` — `timedOut` latches true and never resets when `deadline` moves later; on ResultsPage the real `useRunEvents` starts with `running=false`, so `firstSeenEnded` = mount time; a run that ends > 30 s after mount (SSE closes before the 3 s poll brings `finished_at`) latches `timedOut`, and the drawer shows "No trace available yet" instead of "pending" for the whole window; the mount render also enables the trace fetch for a running run (AC-53). Fix: tie the timeout to the deadline it fired for; record `firstSeenEnded` only after a seen running→ended transition or when `!running`; add a test whose `useRunEvents` mock starts with `running=false` and flips.
  - **PR2-S1** `multi-agent.service.ts:84` — a partial `startRuns` failure leaves already-created agent runs `running` forever (until reboot) and unlinked; create the group and its runs atomically, or mark the created runs `failed` + `finishedAt` before deleting the group; test it.
  - **PR2-S2** `multi-agent.service.ts:89` — log a failed group cleanup instead of `.catch(() => undefined)`.
  - **PR2-C1** `AgentPickerPanel.tsx:51` — no focus containment (Tab leaves the portalled dialog while it stays open) and restore targets the trigger after it became `disabled`; close on focusout outside panel+trigger (or trap Tab) and restore focus to a focusable trigger.
  - **PR2-C2** `TabsView.tsx:57` — roving focus via `document.getElementById`; use per-tab refs.
  - **PR2-C3** `multi-agent/_components/status-color.ts:5` — exhaustive switch with no runtime default (unknown status → `undefined` → destructuring throws); add a `never`-checked default fallback.
- 2026-10-15 — fix mode PR2-S1, PR2-S2 (implementer, server): PR2-S1 — fallback path (atomic create would change the `runReview` contract): new workspace-scoped `failRunningRunsOfMultiRun` marks the group's still-running runs `failed` + `finishedAt` + "Multi-agent start failed: <message>" before `deleteMultiAgentRun`; `POST /pulls/:id/review` untouched. PR2-S2 — both cleanup calls in one try; failure logged via `logger?.error`, original error rethrown. `.it` tests: partial failure leaves the created run failed/finished/unlinked; a throwing cleanup is logged once. Server typecheck clean, unit 958, multi-agent `.it` 26 passed.

### Skills (fix PR2-S1, PR2-S2)
| Skill | Loaded | Applied in |
|---|---|---|
| `onion-architecture` | preload | PR2-S1, PR2-S2 |
| `drizzle-orm-patterns` | on demand (SKILL.md + `references/transactions.md`) | PR2-S1 |
| `typescript-expert` | on demand (SKILL.md) | PR2-S1, PR2-S2 |
- 2026-10-15 — fix mode PR2-H1, PR2-C1, PR2-C2, PR2-C3 (implementer, client): PR2-H1 — a run counts as ended only after `useRunEvents` was seen running and then stopped (no fetch while running, 30 s from the real end); timeout tied to the deadline it fired for (`expiredDeadline === deadline`); new test mounts with the hook at `running=false`, flips true, 40 s fake time, flips false → no fetch before the end, "pending" right after, fetch + render after. PR2-C1 — panel closes on `focusout` outside panel+trigger; restore only if focus fell to `body`; dropdown refocuses the trigger once not busy (no new test; Tab out to browser chrome — null `relatedTarget` — does not close). PR2-C2 — per-tab ref map. PR2-C3 — `never`-checked default → `--text-muted`/`--bg-hover`. Client typecheck clean; `pnpm test` 103 files / 712 passed.

### Skills (fix PR2-H1, PR2-C1…C3)
| Skill | Loaded | Applied in |
|---|---|---|
| `react-best-practices` | on demand (SKILL.md) | PR2-H1, PR2-C1, PR2-C2 |
| `react-testing-library` | on demand (SKILL.md) | PR2-H1 |
| `typescript-expert` | on demand (SKILL.md) | PR2-C3, PR2-H1, PR2-C1, PR2-C2 |
| `frontend-architecture` | on demand (SKILL.md) | PR2-H1, PR2-C1, PR2-C2, PR2-C3 |
- 2026-10-15 — plan-verifier delta on round 2: complete — needs sign-off (R4: no Proof table for the round's new tests; PR2-C1 untested). The main session closes both with a test-writer run instead of asking for sign-off.
- 2026-10-15 — `/pr-self-review` re-run on round 2: 0 CRITICAL, five MEDIUM → round 3 (last round; the gate will be re-run once afterwards):
  - **PR3-C1** `pulls/[number]/page.tsx:245` — mount the PR page's `RunTraceDrawer` with `key={traceRunId}` (same defect PR-H1 fixed on ResultsPage).
  - **PR3-C2** `RunTraceDrawer.tsx:57` — an SSE close on a transient error counts a still-running run (parent `running` prop still true) as ended: trace fetched mid-run, "completed", then no-trace. Make the parent's `running` prop (+ `endedAt`) the authority for "ended"; SSE drives only the live log. Keep AC-53/54/54a and the PR2-H1 test green; add a test: stream closes while the prop stays true → still running, no fetch.
  - **PR3-C3** `RunReviewDropdown.tsx:86` — Escape goes through `close()` so focus returns to the trigger.
  - **PR3-S1** `multi-agent.service.ts:91` — store a fixed message ("Multi-agent start failed") in `agent_runs.error`; keep the detail only in the log.
  - **PR3-S2** `multi-agent.service.ts:92` — separate try blocks (or one transaction) so the group delete still runs when marking the runs failed throws.
- 2026-10-15 — fix mode round 3 (implementer): PR3-C1 `key={traceRunId}` on the PR page drawer; PR3-C2 `stillRunning = running` (parent prop + `endedAt` are the authority; `useRunEvents` feeds only the log; `seenLive`/`liveRunning` removed) + transient-close test — the PR2-H1 test now also flips the `running` prop (assertions unchanged); PR3-C3 Escape → `close()` + test; PR3-S1 `agent_runs.error` = "Multi-agent start failed" (detail only in the rethrown error); PR3-S2 separate try blocks, each logging its own failure + test. Client typecheck clean, `pnpm test` 103 files / 714; server typecheck clean, unit 958, `.it` 41 files / 352.

### Skills (fix round 3)
| Skill | Loaded | Applied in |
|---|---|---|
| `react-best-practices` | on demand (SKILL.md) | PR3-C1, PR3-C2, PR3-C3 |
| `react-testing-library` | on demand (SKILL.md) | PR3-C2, PR3-C3 tests |
| `typescript-expert` | on demand (SKILL.md) | PR3-S1, PR3-S2 |
| `onion-architecture` | preload | PR3-S1, PR3-S2 |
| `drizzle-orm-patterns` | on demand (SKILL.md) | PR3-S2 |
- 2026-10-15 — test-writer proof for fix rounds 2–3 (closes R4 and PR2-C1): +4 test files/cases (PR2-C1 focus, PR2-H1 deadline tie, PR3-C1 page key, PR2-C3 fallback); 13 break checks, all failing as expected and restored. Report: `docs/plans/assets/40-multi-agent-review/test-report-fix-rounds.md`.
- 2026-10-15 — final `/pr-self-review` pass on round 3: no defect introduced (0 findings, 3 suppressed as pre-existing/style). plan-verifier delta: **complete** 15/15, nothing to sign off (R4 rounds 2–3 proved; PR2-C1 tested). Full gates: client 722, server 1310 (unit + `.it`), agent-runner 23; typecheck clean. Plan → `done` (main session).
- Follow-ups (not in this plan): the PR page mounts `RunTraceDrawer` without `running`/`endedAt` (pre-existing at HEAD; since PR3-C2 a running run opened there shows as ended) — pass `status === "running"` and `finished_at` from `runs`; the single-agent `kick` path in `RunReviewDropdown` has no catch (pre-existing); `agent-runner/` findings from the pr-self-review (outside Worktree A); the seed's PR #482 has no diff for demos; PR-S4 (recent runs `[]` vs 404) kept by D14.
