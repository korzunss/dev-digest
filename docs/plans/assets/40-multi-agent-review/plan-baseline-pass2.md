# Development Plan: Multi-Agent Review
Status: draft
Save as: docs/plans/40-multi-agent-review.md
Spec: specs/013-multi-agent-review.md
Execution: multi-agent

## Spec traceability
Test ids T1–T14: see *Tests*.

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

## Decisions recorded
2026-10-14 — the user answered "all as recommended":
- TQ1 yes (AC-57 met by `stats.grounding` + persisted "grounding dropped" log lines; no new trace field) · TQ2 yes (connected components) · TQ3 yes (inclusive `[start_line, end_line ?? start_line]`) · TQ4 yes (`{ agent_ids: uuid[] }`, 1–20, deduplicated).
- GAP1–GAP4: suggested resolutions accepted; sent to `spec-creator`, spec back to `draft` until re-approved.
- REC1–REC4 accepted.
- D1 A · D2 A · D3 A · D4 A · D5 A · D6 accept (REC2 + REC3) · D7 A · D8 A · D9 as stated · D10 multi-agent.

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

## Migrations & contracts
- S2 migration (`multi_agent_run_id` + index, `finished_at`, `reviews_run_idx`) via `cd server && pnpm db:generate`; `pnpm db:migrate` by the main session. S1 contract, mirrored in the same step.

## Out of scope
- `ci/`, `agent-runner/`, `reviewer-core/`, `mcp-server/`, `e2e/`; `GET /pulls/:id/multi-agent`; a body schema for `POST /pulls/:id/review` (D6); Learn/Reply; stored icons; worktrees; merging findings; seeded agents; any other `vendor/**` edit.

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

## Risks & open questions
- **D11 is open.** S2, S3, S6 and S11 assume option A.
- **The brief above the marker is about 24.5k characters**, over the ~20k guide: there are 20 steps and 59 ACs. Shapes and test cases were moved below the marker to keep it close.
- **S10 changes two import lines in `onboarding-tour/`.** That is outside the PR and Multi-Agent pages. The move is needed because `FindingCard` must use `SafeMarkdown` for AC-36, and the PR page's FindingCard gets the same fix.
- **Tokenizer concurrency safety was not checked.** The LLM adapters hold only an SDK client (`adapters/llm/anthropic.ts:43-46`, `openai.ts:49-52`), and T3 runs against stubs.
- **TanStack Query `refetchInterval` after a 404 error (S11).** T7 must prove the trace is polled again. If it is not, poll with a timer instead.
- **Cancel is not workspace-scoped.** `POST /runs/:id/cancel` and `cancelRunIfRunning` were like this before this plan (research Q2) and stay unchanged.
- **The `nav.ts` line is lost on a vendor refresh.** S13 adds a comment saying so.
- **Docs vs code:** `runs.json` `page.meta` claimed "fan-out via p-queue", which the spec rejects. S13 fixes it.
- **No external research is needed.**

## Handed off
- architecture-reviewer: `multi-agent.service.ts` deps (no `Container`, local ports); helper purity; executor queue; S10 moves.
- security review: `POST /pulls/:id/multi-agent-run` (body schema, 20-id cap, rate limit, validation before insert); `GET /multi-agent-runs/:id` workspace scope; `?trace=` validated against columns; model text via `SafeMarkdown`.

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
