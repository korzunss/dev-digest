# Development Plan: Agent Performance dashboard and per-agent Stats tab
Status: done
Execution: multi-agent
Save as: docs/plans/42-agent-performance.md
Spec: specs/015-agent-performance.md

Mockups (every UI step must Read them): `docs/plans/assets/agent-performance/design-dashboard.png`, `design-row-expanded.png`, `design-agent-stats-tab.png`. Research: `docs/plans/assets/agent-performance/research.md`.

## Spec traceability
| Spec AC | Covered by |
|---|---|
| AC-1, AC-2, AC-3 | S8, S10, S11, S15 · T4, T8, T9, T13 |
| AC-4 | S2 (server), S8 + S10 (client) · T1, T2, T4, T8 |
| AC-5 | S2 · T1 |
| AC-M1 … AC-M8, AC-M10, AC-M12, AC-M15 | S2, S3, S4 · T1, T2 |
| AC-M9, AC-M14 | S10 · T7 |
| AC-M11 | S2 · T1 |
| AC-M13 | S2, S10 · T1, T7 |
| AC-6 | S14 · T9 |
| AC-7 | S3 · T2 |
| AC-8, AC-8a | S3, S11 · T2, T9 |
| AC-9 … AC-16 | S4, S12 · T2, T10, T11 |
| AC-17, AC-17a | S3, S4, S13 · T2, T12 |
| AC-18, AC-18a, AC-19 | S5, S11 · T2, T9 |
| AC-20, AC-21, AC-25 | S15 · T13 |
| AC-22 | S4 · T2 |
| AC-23, AC-23a | S3, S5, S16 · T2, T14 |
| AC-24 | S3, S16 · T2, T14 |
| AC-26, AC-27 | S11, S15, S16 · T9, T13, T14 |
| AC-28 | S5 · T2, T5 |
| AC-29 | S4, S15 · T2, T13 |
| AC-30, AC-31, AC-32 | S17 · T15, T16 |
| NFR performance (≤ 3 requests, 1 s) | S3, S8, S17 · T3, T5, T16 |
| NFR precision, a11y, i18n | S9, S10, S12 · T7, T11 |

## Decisions needed
| # | Decision | Options | Recommendation | Steps affected |
|---|---|---|---|---|
| D9 | Provenance of a **single derived** money figure (Avg cost, expanded-row avg, card avg, a delta) whose known costs mix `cost_source` values | A: `~` whenever any part is an estimate · B: `~` only when all of it is · C: no prefix; the split line carries provenance | A — an estimate-tainted figure never reads as exact (spec 001) | S10, S12, S15, S17 |

Everything else: none open — see *Decisions recorded*. D9 surfaced in pass 2 (AC-M4 labels a split, not one derived number); it is user-visible, so an answer other than A goes to `spec-creator`.

## Decisions recorded
User answers, 2026-10-19:
- **TQ1** default: the Stats tab goes after `evals` in `TABS`.
- **TQ2** default: `?period=1d|30d|custom&from=YYYY-MM-DD&to=YYYY-MM-DD`. The client sends ISO instants plus an IANA `tz`, and the server re-checks AC-4.
- **TQ3** default: a period menu. Its Custom option opens two native `<input type="date">` fields.
- **TQ4** — **in scope, against the default**: the agent-list cards show the runs / accept / avg-cost line from `design-agent-stats-tab.png`. This is a spec change and goes to spec-creator.
- **GAP1** — Run history loads the first 50 counted runs with the screen. "Load more" fetches the next 50 through a cursor. These user-initiated page requests are outside the 3-requests-per-screen cap (spec change).
- **GAP2** — every money figure uses the existing `formatCostUsd` (spec 001) as it is: 2 dp from $1, 3 dp from $0.01, up to 4 dp below $0.01, with trailing zeros trimmed. The user confirmed this at re-approval (spec change).
- **GAP3** — as in the mockup (spec change):
  - an expanded row keeps View;
  - the Deleted agents row expands to show the last 5 runs, but has no View;
  - a "No runs in this period" row does not expand, but has View.
- **D1** A · **D2** A · **D3** A · **D4** A (separate `contracts/agent-performance.ts` outside the barrel; runner bundle unchanged) · **D5** A (no index, no migration) · **D6** A · **D7** A.
- **D8** — `Execution: multi-agent`.
- **D9** A — a derived money figure gets `~` when any part of its known cost is an estimate, the same worst-wins rule as `rollupCost` (user, 2026-10-19).

## Prerequisites
- Docker running for G2's `.it` tests. No new dependency, no migration (D5 A).
- A step that names a spec AC / M-n implements **the spec's wording** — read that AC in `specs/015-agent-performance.md` (root INSIGHTS 2026-10-15, "a plan step that paraphrases a spec field").

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S4 | shared contract (both copies) + server helpers, repository, service | — | contract names; service method signatures |
| G2 | S5–S7 | server routes, DI, `.it` tests | G1 | final routes + query params; any contract change (mirror both copies) |
| G3 | S8–S10 | client period lib + hooks, i18n, shared perf UI | G2 | hook names/keys, `PeriodSel`, `perf-kit` / `period-control` exports, i18n keys |
| G4 | S11–S14 | client `/agent-performance` + nav | G3 | `perf-kit` prop changes |
| G5 | S15–S17 | client Stats tab, Run history, agent cards | G4 | — then M1 (main session) |

Sequential; G3–G5 share `client/`.

## Steps

### S1 — Agent-performance contract outside the barrel  [Contract]
- **Files:** `server/src/vendor/shared/contracts/agent-performance.ts` (create) · `client/src/vendor/shared/contracts/agent-performance.ts` (create, identical, written by hand)
- **Change:** the Zod schemas + `z.infer` types listed in Design notes → *Contract shape* (`PerfQuery`, `PerfFigures`, `PerfPrevious`, `PerfRow`, `AgentPerfDashboard`, `AgentPerfStats`, `PerfRunsCountQuery`/`PerfRunsCount`, `RunHistoryQuery`/`RunHistoryPage`, …). `CostSource` from `./trace.js`.
- **Layer / why here:** ports ring; D4 A keeps it out of `index.ts`, so the agent-runner bundle is unchanged.
- **Skills to apply:** `onion-architecture`, `zod`, `typescript-expert`, `security`
- **Practices:** schema + type exported together; imports only `zod` and sibling contracts; `.int()` on counts; no name that already exists in the barrel (`AgentStats`, `AgentPerf`, `AgentPerfRow`, `PerfCostSegment` do); `index.ts`, `observability.ts` and `productionize.ts` are untouched.
- **Known gotchas:** root INSIGHTS 2026-09-17 (shared copies drift) · 2026-10-15 (runner bundle inlines the barrel).
- **Done when:** `cd server && pnpm typecheck` · `diff server/src/vendor/shared/contracts/agent-performance.ts client/src/vendor/shared/contracts/agent-performance.ts` prints nothing · `git diff --quiet HEAD -- server/src/vendor/shared/index.ts client/src/vendor/shared/index.ts` exits 0.

### S2 — Pure helpers: window, figures, most-active, cursor
- **Files:** `server/src/modules/agent-performance/helpers.ts` (create) · `server/src/modules/agent-performance/constants.ts` (create) · `server/test/agent-performance-helpers.test.ts` (create)
- **Change:** `resolveWindow`, `acceptRate`, `toFigures`, `toPrevious`, `sumAggregates`, `pickMostActive`, `recentSummary`, `encodeCursor`/`decodeCursor` — rules in Design notes → *Helpers*. Constants `CLOCK_SKEW_MS = 60_000` (assumption), `MAX_CUSTOM_MS = 365 × 24 h + 1 h` (assumption, DST), `RECENT_RUNS = 5`, `HISTORY_PAGE = 50`.
- **Layer / why here:** application-layer pure functions; both endpoints use the same `toFigures`, so AC-22 holds by construction.
- **Skills to apply:** `onion-architecture`, `fastify-best-practices`, `zod`, `typescript-expert`, `security`
- **Practices:** no `drizzle-orm` / `db/schema` (not even `import type`); the CI cursor codec (`ci/service.ts:560-576`) is copied, not imported; `safeParse` on the cursor; values stay unrounded.
- **Known gotchas:** `server/insights/gotchas.md` → DB & migrations: a `db/schema` row type lives only in a repository.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/agent-performance-helpers.test.ts` passes, asserting every AC-4 rejection, the AC-5 window, pooled ≠ mean accept rate (M-10), null rate at 0 decisions, M-11 ties, and a forged cursor → `ValidationError`.

### S3 — Repository: SQL aggregates over `agent_runs`
- **Files:** `server/src/modules/agent-performance/repository.ts` (create)
- **Change:** `AgentPerformanceRepository(db)` with `timeZoneExists`, `aggregateByAgent`, `decisionsByAgent`, `costByModel`, `buckets`, `recentRuns`, `runHistory`, `countDone` — SQL in Design notes → *Repository queries*.
- **Layer / why here:** infrastructure; the only file with `drizzle-orm` + `db/schema`.
- **Skills to apply:** `onion-architecture`, `drizzle-orm-patterns`, `postgresql-table-design`, `fastify-best-practices`, `zod`, `typescript-expert`, `security`
- **Practices:** every query filters `workspace_id` and `ran_at >= from AND ran_at < to`, with no repo filter (AC-7) and both sources (unlike `windowedRuns`). Negative cost/duration = unknown. Findings are aggregated in a **separate** query so cost is never multiplied. Methods await and return rows. Row types are declared here. `tz` and dates are bound parameters.
- **Known gotchas:** `server/insights/gotchas.md` → DB & migrations: raw `sql` dates as `d.toISOString()` + `::timestamptz`, ids `::uuid` · `server/AGENTS.md`: a FK column carries no index (D5 A; T3 measures).
- **Done when:** `cd server && pnpm typecheck` · `bash .claude/skills/onion-architecture/scripts/check-module.sh agent-performance` shows `drizzle-orm`/`db/schema` only in `repository.ts`.

### S4 — Service + narrow deps
- **Files:** `server/src/modules/agent-performance/types.ts` (create) · `server/src/modules/agent-performance/service.ts` (create)
- **Change:** `AgentPerformanceServiceDeps { repo; agents: PerfAgentsPort; now?: () => Date }`, `PerfAgentsPort { list(ws); getById(ws, id) }`. `AgentPerformanceService.dashboard / agentStats / runHistory / runsCount` — assembly rules in Design notes → *Service*. An unknown `tz` → `ValidationError`; a missing agent → `NotFoundError` (AC-29).
- **Layer / why here:** application; house style is a deps object (onion step 3).
- **Skills to apply:** `onion-architecture`, `fastify-best-practices`, `zod`, `typescript-expert`, `security`
- **Practices:** no adapter, SDK, `Container` or foreign consumer-port import (`container.agentsRepo` satisfies `PerfAgentsPort` structurally); no writes, no LLM (AC-28).
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `node .claude/skills/onion-architecture/scripts/trace-imports.mjs server/src/modules/agent-performance` prints no leaking chain.

### S5 — Routes
- **Files:** `server/src/modules/agent-performance/routes.ts` (create)
- **Change:** GET only. `/agents/performance` (`querystring: PerfQuery` → `AgentPerfDashboard`), `/agents/performance/runs-count` (`PerfRunsCountQuery` → `PerfRunsCount`), `/agents/:id/stats` (`IdParams` + `PerfQuery` → `AgentPerfStats`), `/agents/:id/stats/runs` (`RunHistoryQuery` → `RunHistoryPage`). Handler = `getContext` → `app.container.agentPerformance.<method>`.
- **Layer / why here:** transport (D2 A); same shape as `ci/routes.ts:25-60`.
- **Skills to apply:** `onion-architecture`, `fastify-best-practices`, `zod`, `typescript-expert`, `security`
- **Practices:** schemas imported from `@devdigest/shared/contracts/agent-performance.js` (D4); no `parse` in a handler; `response` schemas declared so only contract fields are serialized (NFR Security).
- **Known gotchas:** `server/insights/gotchas.md` → Security: every route is reachable from the LAN.
- **Done when:** `cd server && pnpm typecheck`.

### S6 — DI getter and module registration
- **Files:** `server/src/platform/container.ts` (modify) · `server/src/modules/index.ts` (modify)
- **Change:** lazy `get agentPerformance()` → `new AgentPerformanceService({ repo: new AgentPerformanceRepository(this.db), agents: this.agentsRepo })` (like `get ci()`, `container.ts:253-263`); one import + entry `agentPerformance` in `modules`.
- **Layer / why here:** composition root.
- **Skills to apply:** `onion-architecture`, `fastify-best-practices`, `zod`, `typescript-expert`, `security`
- **Practices:** no `ContainerOverrides` field (no adapter); the port uses `agentsRepo.list` (all agents, `agents/repository.ts:63`), not `listEnabled`.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck`.

### S7 — Integration tests
- **Files:** `server/test/agent-performance.it.test.ts` (create) · `server/test/agent-performance-perf.it.test.ts` (create)
- **Change:** T2 seed and assertions: Design notes → *T2 fixture*. T3 seeds 20 agents × 10,000 done runs in 30 days and times `GET /agents/performance`: it asserts < 1000 ms when `process.env.CI` is unset, else only logs the time (D5 check).
- **Layer / why here:** server `.it` (Postgres).
- **Skills to apply:** `onion-architecture`, `fastify-best-practices`, `zod`, `typescript-expert`, `security`, `drizzle-orm-patterns`
- **Practices:** `startPg` + `isolatedTestConfig()` + `buildApp` + `app.inject`; rows inserted by hand (`ci-run-isolation.it.test.ts:46-101`).
- **Known gotchas:** `server/insights/gotchas.md` → Tests: prove the workspace filter with another workspace's rows; all `.it` "skipped" with the Reaper message → `TESTCONTAINERS_RYUK_DISABLED=true`; a hermetic `.it` never reaches a real key.
- **Done when:** `cd server && pnpm exec vitest run test/agent-performance` passes.

### S8 — Client period lib, hooks, type-only guard
- **Files:** `client/src/lib/period.ts` (create) · `client/src/lib/period.test.ts` (create) · `client/src/lib/hooks/agent-performance.ts` (create) · `client/src/lib/hooks/agent-performance.test.tsx` (create) · `client/src/lib/hooks/index.ts` (modify) · `client/src/lib/shared-type-only-imports.test.ts` (modify)
- **Change:** `period.ts` and hooks per Design notes → *Client period + hooks*. Extend the guard regex (`:22`) to `@devdigest/shared(/[^"']*)?`.
- **Layer / why here:** client data layer, in `src/lib` because three routes use it.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `zod`, `security`, `react-testing-library`
- **Practices:** type-only imports from the deep contract path; a query key never holds `Date.now()`; one window per key, so all history pages share it; disabled queries make no request.
- **Known gotchas:** `client/insights/gotchas.md` → Tests: types only from `@devdigest/shared`; spread `importActual` when mocking a hooks barrel; Tooling: targeted runs are `pnpm exec vitest run <pattern>`.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run src/lib/period agent-performance.test shared-type-only` passes. T5 asserts one GET per dashboard render and that Load more sends the same `from`/`to` plus `cursor`.

### S9 — i18n copy
- **Files:** `client/messages/en/agentPerformance.json` (modify — rewrite; old keys unused, `research.md` Q3)
- **Change:** the keys in Design notes → *i18n keys*, with the spec's literal strings.
- **Layer / why here:** `next-intl` namespace (NFR i18n).
- **Skills to apply:** none
- **Practices:** ICU plurals for counts; no markup in strings.
- **Known gotchas:** `client/insights/gotchas.md` → Tests: two `getByText` matches → check the two states first.
- **Done when:** `jq empty client/messages/en/agentPerformance.json` exits 0.

### S10 — Shared perf UI: period control + perf-kit
- **Files:** `client/src/components/period-control/{PeriodControl.tsx,PeriodControl.test.tsx,index.ts,styles.ts}` (create) · `client/src/components/perf-kit/{KpiTile.tsx,SafeSparkline.tsx,AcceptRate.tsx,CostAmount.tsx,CostDelta.tsx,FailedRunsNote.tsx,PerfEmptyState.tsx,helpers.ts,styles.ts,index.ts,PerfKit.test.tsx}` (create)
- **Change:** Read first: `docs/plans/assets/agent-performance/design-dashboard.png`, `docs/plans/assets/agent-performance/design-row-expanded.png`, `docs/plans/assets/agent-performance/design-agent-stats-tab.png`. Components per Design notes → *perf-kit*.
- **Layer / why here:** `src/components/` (kebab-case), because two routes use them.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `zod`, `security`, `react-testing-library`
- **Practices:** money only via `formatCostUsd`; not the vendored `MetricCard` for cost (it colours an increase green, `MetricCard.tsx:20-23`); the vendored `Sparkline` only with ≥ 2 points; one component per file; derived values computed in render; names rendered as text with `title`.
- **Known gotchas:** `client/insights/gotchas.md` → UI: `styles.ts` entries are literals with `satisfies CSSProperties`; Tests: no `user-event`, use `fireEvent`.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run period-control perf-kit` passes. T7 covers: no `NaN` with one point; small sample at n = 3; `~` on a mixed figure (D9); delta omitted when there is no previous cost; no note at M-15 = 0.

### S11 — `/agent-performance` page: header, tiles, states
- **Files:** `client/src/app/agent-performance/page.tsx` (create) · `client/src/app/agent-performance/_components/AgentPerformanceView/{AgentPerformanceView.tsx,AgentPerformanceView.test.tsx,index.ts,styles.ts}` (create)
- **Change:** Read first: `docs/plans/assets/agent-performance/design-dashboard.png`, `docs/plans/assets/agent-performance/design-row-expanded.png`, `docs/plans/assets/agent-performance/design-agent-stats-tab.png`.
  - The page wraps the view in `<Suspense fallback={null}>`. The view keeps the period in the URL (`router.replace`, AC-3) and renders `AppShell`.
  - States: skeletons (AC-26); `ErrorState` + retry with a usable period control (AC-27); `agent_count = 0` → AC-19 state linking `/agents`; `totals.runs = 0` → `PerfEmptyState` (AC-18/8a/18a; `useRunsCount30d` is enabled only here, and only when the period ≠ `30d`).
  - AC-8 tiles: Total runs + bucket sparkline + note; Total cost (`CostAmount` + split + `CostDelta` + M-3 note); Avg accept rate + `CircularScore` + n; Most-active.
- **Layer / why here:** route + colocated view.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `zod`, `security`, `react-testing-library`
- **Practices:** early return per state; no number in a non-data state; `"use client"` on the view only.
- **Known gotchas:** `client/insights/gotchas.md` → Tooling: every `useSearchParams()` page sits in `<Suspense>`; no `pnpm build` while `next dev` runs.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run AgentPerformanceView` passes. T9 covers each state, the default `30d`, the URL on change, "Try 30 days — 42 runs", and NAV with `agent-performance` between `multi-agent` and `ci-runs`.

### S12 — Agent table: sort, expand, View
- **Files:** `client/src/app/agent-performance/_components/AgentPerfTable/{AgentPerfTable.tsx,AgentPerfTable.test.tsx,helpers.ts,helpers.test.ts,index.ts,styles.ts}` (create)
- **Change:** Read first: `docs/plans/assets/agent-performance/design-dashboard.png`, `docs/plans/assets/agent-performance/design-row-expanded.png`, `docs/plans/assets/agent-performance/design-agent-stats-tab.png`.
  - AC-9 columns; Last run via `useFormatter().relativeTime`.
  - `sortRows`: default Accept, descending, in the AC-11 groups, with Deleted last; a header toggle reverses; empty values go last both ways (AC-12).
  - A row with runs (agent or Deleted) expands in place: `SafeSparkline` of `recent.runs` durations + "last N runs · avg … · …" (AC-15). A zero-run row shows "No runs in this period" and does not expand.
  - View → `/agents/<id>?tab=stats&<period>` on every agent row, expanded or not, and never on Deleted (AC-16).
- **Layer / why here:** colocated feature component.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `zod`, `security`, `react-testing-library`
- **Practices:** headers are `<button>` + `aria-sort`; the row toggle is `<button aria-expanded>`; View is a separate link; key = `agent_id ?? 'deleted'`; sort state is not persisted.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm exec vitest run AgentPerfTable` passes (T10 + T11).

### S13 — Cost breakdown charts
- **Files:** `client/src/app/agent-performance/_components/CostBreakdown/{CostBreakdown.tsx,CostDonut.tsx,CostBreakdown.test.tsx,index.ts,styles.ts}` (create)
- **Change:** Read first: `docs/plans/assets/agent-performance/design-dashboard.png`, `docs/plans/assets/agent-performance/design-row-expanded.png`, `docs/plans/assets/agent-performance/design-agent-stats-tab.png`.
  - By-agent and by-model charts (AC-17). `CostDonut` draws `recharts` `PieChart`/`Pie`/`Cell` directly, because the vendored `Donut` legend cannot show per-segment provenance (`Donut.tsx:51-60`).
  - Legend: label (`null` → "Deleted agents" / "Unknown model") + `CostAmount`, with each segment's split when the chart holds more than one provenance (AC-17a).
  - "No cost recorded in this period"; the "Reconciled billing data is not available" note (M-4).
- **Layer / why here:** colocated feature component.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `zod`, `security`, `react-testing-library`
- **Practices:** amounts come from unrounded values; the legend is the text equivalent.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm exec vitest run CostBreakdown` passes (T12).

### S14 — Sidebar entry (sanctioned vendor hand-edit)
- **Files:** `client/src/vendor/ui/nav.ts` (modify)
- **Change:** between `multi-agent` and `ci-runs`: `{ key: "agent-performance", label: "Agent Performance", icon: "Activity", href: "/agent-performance" }` under a `// Signed-off exception (spec 015, AC-6): … A vendor refresh drops this line — see client/INSIGHTS.md.` comment.
- **Layer / why here:** the only sidebar seam (`app-shell/helpers.ts:37` already maps the key).
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `zod`, `security`
- **Practices:** nothing else in `vendor/ui` changes.
- **Known gotchas:** `client/insights/gotchas.md` → UI: the nav item is the one sanctioned vendored edit; comment it.
- **Done when:** `cd client && pnpm typecheck` · `git diff --stat -- client/src/vendor/ui` lists only `nav.ts`.

### S15 — AgentEditor Stats tab
- **Files:** `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` (modify) · `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` (modify) · `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/{StatsTab.tsx,StatsTab.test.tsx,index.ts,styles.ts}` (create)
- **Change:** Read first: `docs/plans/assets/agent-performance/design-dashboard.png`, `docs/plans/assets/agent-performance/design-row-expanded.png`, `docs/plans/assets/agent-performance/design-agent-stats-tab.png`.
  - `TABS` gets `{ key: "stats", labelKey: "editor.tabs.stats", icon: "Activity" }` after `evals` (TQ1; the label exists, `agents.json:54`), plus a `stats` branch. Drop the "Stats arrives with a later lesson" comments.
  - `StatsTab`: `PeriodControl` on `period/from/to` beside `tab`.
  - AC-21 tiles: Total runs + sparkline + note; Avg cost / run (`CostAmount` + `CostDelta` on `avg_cost_usd`); Avg duration; Accept rate + ring + n.
  - States: AC-25 empty (this agent's scope), skeletons, error + retry. A 404 shows the editor's not-found `ErrorState` (the title/body of `[id]/page.tsx:60-72`, AC-29). `RunHistory` (S16) mounts below.
- **Layer / why here:** colocated editor tab.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `zod`, `security`, `react-testing-library`
- **Practices:** reuse `perf-kit`; no metric is computed twice; no request while another tab is open.
- **Known gotchas:** `client/insights/gotchas.md` → Tooling: a vitest filter with `[id]` matches nothing; filter on `AgentEditor`.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run AgentEditor` passes (T13 + the existing editor tests).

### S16 — Run history: Load more, View trace
- **Files:** `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/_components/RunHistory/{RunHistory.tsx,RunHistory.test.tsx,index.ts,styles.ts}` (create)
- **Change:** Read first: `docs/plans/assets/agent-performance/design-dashboard.png`, `docs/plans/assets/agent-performance/design-row-expanded.png`, `docs/plans/assets/agent-performance/design-agent-stats-tab.png`.
  - Columns exactly as AC-23 (each "—" case included).
  - Paging: 50 rows with the screen; "Load more" while `hasNextPage`; a failed page keeps the rows, with a retry beside the button (AC-23a).
  - View trace: `has_trace` → `RunTraceDrawer` (`runId`, `agentName`, `prNumber`, `endedAt = ran_at`); otherwise "No trace stored for this run" in that row (AC-24).
- **Layer / why here:** child of its only consumer, the Stats tab.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `zod`, `security`, `react-testing-library`
- **Practices:** key = `run_id`; the drawer is mounted only while open.
- **Known gotchas:** `client/insights/gotchas.md` → Tests: mock a hook from its real initial value.
- **Done when:** `cd client && pnpm exec vitest run RunHistory` passes (T14).

### S17 — Summary line on agent cards
- **Files:** `client/src/app/agents/_components/AgentCard/{AgentCard.tsx,AgentCard.test.tsx,helpers.ts}` (modify) · `client/src/app/agents/_components/AgentsListView/AgentsListView.tsx` (modify) · `client/src/app/agents/_components/AgentsListView/AgentsListView.test.tsx` (create) · `client/src/app/agents/[id]/page.tsx` (modify: its left list shows the same cards, as in the mockup) (assumption)
- **Change:** Read first: `docs/plans/assets/agent-performance/design-dashboard.png`, `docs/plans/assets/agent-performance/design-row-expanded.png`, `docs/plans/assets/agent-performance/design-agent-stats-tab.png`.
  - `AgentCard` gets an optional `summary` prop: `loading` | `error` | `row`. It renders "<runs> runs · <accept> accept · <avg> avg" (AC-30), "No runs in 30 days", a skeleton, or nothing on error (AC-32).
  - Each list calls `useAgentPerfDashboard(THIRTY_DAYS)` **once** and passes each card its row: one request, same figures as the dashboard (AC-31).
- **Layer / why here:** feature components fed by the S8 hook.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `zod`, `security`, `react-testing-library`
- **Practices:** select/toggle/delete work in every summary state; never zeros.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run AgentCard AgentsListView` passes (T15, T16).

### M1 — Main session, not an implementer step: screenshots vs mockups
After G5 and the full `.it` run: `./scripts/dev.sh`, seed runs, then screenshot `/agent-performance` (collapsed + one row expanded), `/agents/<id>?tab=stats` and `/agents`. Read the three mockups (header line 7) and compare (root INSIGHTS 2026-10-15). Log differences as `DGn` in the Verification log before `plan-verifier`.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| T1 `server/test/agent-performance-helpers.test.ts` | unit | AC-4, AC-5, M-3…M-8, M-10, M-11, cursor | S2 |
| T2 `server/test/agent-performance.it.test.ts` | integration | M-1…M-15, AC-7, 14, 17, 22, 23a, 24, 28, 29, routing, tz | S7 |
| T3 `server/test/agent-performance-perf.it.test.ts` | integration | NFR 1 s, D5 | S7 |
| T4 `client/src/lib/period.test.ts` | unit | AC-1…AC-4 | S8 |
| T5 `client/src/lib/hooks/agent-performance.test.tsx` | unit | request count, history window | S8 |
| T6 `client/src/lib/shared-type-only-imports.test.ts` | unit | deep imports type-only | S8 |
| T7 `client/src/components/perf-kit/PerfKit.test.tsx` | unit | M-9, M-13, M-14, D9, AC-8a, AC-18a | S10 |
| T8 `client/src/components/period-control/PeriodControl.test.tsx` | unit | AC-1, AC-4 | S10 |
| T9 `…/AgentPerformanceView/AgentPerformanceView.test.tsx` | unit | AC-2, 3, 6, 8, 18, 18a, 19, 26, 27 | S11 |
| T10 `…/AgentPerfTable/helpers.test.ts` | unit | AC-10…AC-12 | S12 |
| T11 `…/AgentPerfTable/AgentPerfTable.test.tsx` | unit | AC-9, 13, 15, 16, a11y | S12 |
| T12 `…/CostBreakdown/CostBreakdown.test.tsx` | unit | AC-17, AC-17a | S13 |
| T13 `…/StatsTab/StatsTab.test.tsx` | unit | AC-20, 21, 25, 29 | S15 |
| T14 `…/RunHistory/RunHistory.test.tsx` | unit | AC-23, 23a, 24 | S16 |
| T15 `…/AgentCard/AgentCard.test.tsx` | unit | AC-30, AC-32 | S17 |
| T16 `…/AgentsListView/AgentsListView.test.tsx` | unit | AC-31, one request | S17 |

## Migrations & contracts
No migration (D5 A). Contract: new `contracts/agent-performance.ts` in both shared copies (S1), outside `index.ts` (D4 A); `observability.ts`, `productionize.ts`, `agent-runner/**` untouched.

## Out of scope
- Stats-tab panels Most-used skills / Most-pulled memory / Findings by severity, category; the Memory nav item; billing reconciliation.
- Removing the old `AgentStats` / `AgentPerf*` contracts; any `agent-runner/**`, index or migration change.
- Workspace-filtering `GET /runs/:id/trace` (existing exposure, `research.md` Q5).
- Editing the vendored `Sparkline`, `Donut`, `MetricCard`.

## Design review (main session, M1)
2026-10-19. These are screenshots of the running build (live dev DB: 130 runs, 5 agents), compared with the three mockups. Parity holds for Security Reviewer: the dashboard row, the Stats tab and the card all show 32 runs · $0.018 · 4m 0s · 90% (n = 10). The user chose to fix DG1–DG5.
- **DG1 (defect, S13):** in the `CostDonut` legend, a row whose value cell carries a long provenance split (`provider-reported … · source not recorded …`) squeezes `legendLabel` (`flex:1; minWidth:0`) to zero width, so the agent or model name disappears. Seen on General Reviewer (By agent) and `deepseek/deepseek-v4-flash` (By model). The label must stay readable, e.g. by putting the split on its own line under the label/value pair, or by capping the value column's width. Assert in `CostBreakdown.test.tsx` that the name is present when the split has two parts.
- **DG2 (copy defect, S17/S9):** an agent card with no decisions reads "19 runs · no decisions yet accept · $0.026 avg". With no decisions, the accept part must read just "no decisions yet" (no trailing "accept"). Update the T15 assertion.
- **DG3 (S11/S9):** the Most-active tile shows "44 runs · 75%". It should read "44 runs · 75% accept", as in the mockup. Add the i18n key; when there are no decisions, use the same "no decisions yet" wording.
- **DG4 (S10/S12/S17):** the accept-rate figure is uncoloured in the table and on the card. As in the mockup, colour it by rate with the same thresholds `CircularScore` uses for its ring, and keep it neutral for a small sample or no rate. Apply it in one place (`perf-kit` `AcceptRate` or a helper) so the dashboard, Stats tab and card agree.
- **DG5 (S13):** the donut segments and legend are not ordered by amount. Sort by `amount_usd` descending (ties by label), with Deleted agents / Unknown model last, as in the mockup.
- **DG6 (follow-up, not fixed):** the mockup has per-agent coloured icons. Agents store no icon, so this is out of scope.

<!-- implementer-brief:end -->

## Design notes

### Contract shape (S1)
- `PerfPeriodKind` = enum `1d|30d|custom`. `PerfQuery` = `{ period, from, to: z.string().datetime({ offset: true }), tz: z.string().min(1).max(64).regex(/^[A-Za-z0-9_+\-/]+$/) }`.
- `PerfCostSplit` = `{ api_usd, estimate_usd, unrecorded_usd }` (M-4).
- `PerfFigures` = `{ runs (M-2), runs_not_counted (M-15), cost_known_runs, cost_unknown_runs, total_cost_usd|null (M-3; null when cost_known_runs = 0), cost_split, avg_cost_usd|null (M-5), avg_duration_ms|null (M-6), accepted, dismissed (M-7), accept_rate|null (M-8 / M-10), last_run_at|null (M-12) }`.
- `PerfPrevious` = `{ runs, cost_known_runs, total_cost_usd|null, avg_cost_usd|null, accept_rate|null }`.
- `PerfRecentRuns` = `{ runs: { ran_at, duration_ms|null, cost_usd|null, cost_source|null }[] (≤ 5, oldest → newest), avg_duration_ms|null, avg_cost_usd|null, cost_split }`.
- `PerfRow` = `{ kind: 'agent'|'deleted', agent_id|null, agent_name|null, enabled|null, current: PerfFigures, previous: PerfPrevious, recent: PerfRecentRuns }`.
- `PerfSegment` = `{ key, label|null, amount_usd, split }` · `PerfBucket` = `{ start: 'YYYY-MM-DDTHH:mm' (local wall clock), runs }` · `PerfWindow` = `{ period, from, to, previous_from, previous_to }`.
- `AgentPerfDashboard` = `{ window, agent_count, totals, previous_totals, buckets, rows, most_active: { agent_id, agent_name, runs, accepted, dismissed, accept_rate|null }|null, cost_by_agent, cost_by_model }`.
- `AgentPerfStats` = `{ window, agent_id, agent_name, figures, previous, buckets }`.
- `PerfRunsCountQuery` = `PerfQuery.extend({ agent_id: uuid optional })` → `PerfRunsCount` = `{ runs }`.
- `RunHistoryQuery` = `PerfQuery.extend({ cursor: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(50).optional() })` → `RunHistoryPage` = `{ items: { run_id, ran_at, pr_number|null, tokens|null, cost_usd|null, cost_source|null, findings_count|null, source: 'local'|'ci', has_trace }[], next_cursor|null }`.

### Helpers (S2)
- `resolveWindow(q, now)` → `{ from, to, previousFrom, previousTo, unit }`. It throws `ValidationError` when: `from >= to`; `to > now + CLOCK_SKEW_MS`; `1d` ≠ 24 h or `30d` ≠ 30 × 24 h (± skew); custom > `MAX_CUSTOM_MS`. The previous window has the same length and ends at `from` (AC-5). `unit` is `hour` only for `1d`.
- `acceptRate(a, d)` = a / (a + d), or null at 0. `toFigures(agg, decisions)` implements M-2…M-8, M-12 and M-15. `sumAggregates` pools rows for the totals (M-10 is pooled).
- `pickMostActive` (M-11): existing agents only; ties → newer `last_run_at`, then name A→Z. `recentSummary` gives the AC-15 avg over the shown runs.
- Cursor = base64url `{ t, id }`, checked with `safeParse`.

### Repository queries (S3)
- `timeZoneExists(tz)`: `select 1 from pg_timezone_names where name = $1`.
- `aggregateByAgent(ws, win, agentId?)`: `GROUP BY agent_id`, with `count(*) FILTER` for:
  - `status='done'`;
  - `status in ('failed','cancelled')`;
  - known cost (`cost_usd >= 0`), with `sum(cost_usd)` per `cost_source` (`api` / `estimate` / null);
  - known duration (`duration_ms >= 0`) and its sum;
  - `max(ran_at)` of done runs.
- `decisionsByAgent`: done runs → `reviews.run_id` → `findings`. `accepted` = `accepted_at is not null`; `dismissed` = `accepted_at is null and dismissed_at is not null`.
- `costByModel(ws, win)`: done runs with known cost, grouped by `model`, with the three-way split.
- `buckets(ws, win, tz, unit, agentId?)`: `generate_series` over `from AT TIME ZONE tz` … `to AT TIME ZONE tz`, left-joined to `date_trunc(unit, ran_at AT TIME ZONE tz)` counts of done runs.
- `recentRuns`: `row_number() over (partition by agent_id order by ran_at desc, id desc) <= 5`.
- `runHistory(ws, agentId, win, cursor, limit)`: keyset `(ran_at, id) < cursor`, order `ran_at desc, id desc`, `limit + 1`.
  - Left-join `pull_requests` on `pr_id`, and `ci_runs` on `agent_run_id`; `pr_number = coalesce(pull_requests.number, ci_runs.pr_number)`.
  - `has_trace = exists(run_traces)`; `tokens = tokens_in + tokens_out`.
- `countDone(ws, win, agentId?)`.

### Service (S4)
- `dashboard`:
  - Checks `tz`, then `resolveWindow`. Loads current + previous aggregates and decisions, `recentRuns`, `buckets` and `costByModel`.
  - Builds one row per `agents.list` agent (zero-run agents get `runs: 0`), plus a `deleted` row only when null-agent done runs exist.
  - Totals are pooled over every row. `cost_by_agent` takes rows with `cost_known_runs > 0`, Deleted included.
- `agentStats`: `getById` → 404, then the same aggregate with `agentId`.
- `runHistory`: 404 check; `limit` defaults to 50; `next_cursor` only when `limit + 1` rows came back.
- `runsCount`: `countDone` for the 30-day window, optionally for one agent.

### Client period + hooks (S8)
- `PeriodSel` (`1d` | `30d` | `custom` + `from`/`to` `YYYY-MM-DD`).
- `parsePeriod(sp)`: missing → `30d` (AC-2); malformed → `30d` (assumption).
- `periodKey`, `toSearch` (TQ2), `validateCustom(from, to, today)` → `'future'|'order'|'tooLong'|null` (inclusive days ≤ 365).
- `resolveWindow(sel, now, tz)` → `PerfQuery`. Custom `from` = local midnight of the start date; `to` = min(local midnight after the end date, now). `browserTimeZone()`, `THIRTY_DAYS`.
- Hooks: `useAgentPerfDashboard(sel)`, `useAgentPerfStats(id, sel)`, `useAgentRunHistory(id, sel)` (`useInfiniteQuery`, like `useCiRuns`), `useRunsCount30d(agentId|null, enabled)`. Keys start `"agent-performance"` and carry `periodKey` + tz.

### i18n keys (S9)
- Header, period menu and tiles: title, subtitle, period menu + AC-4 messages, "successful runs".
- Cost: the M-3 note, the M-4 labels, the billing note.
- Accept rate: "n = {n}", "small sample", "No decisions yet", "+{n} failed runs not counted".
- Dashboard table and states: table headers, "No runs in this period", "Deleted agents", "last {n} runs · avg {duration} · {cost}", View, "Unknown model", "No cost recorded in this period", "No successful runs in this period", "Try 30 days — {n} runs", the no-agents state.
- Run history: columns, Load more, retry, "No trace stored for this run".
- Agent card: the card line, "No runs in 30 days".
- a11y labels.

### perf-kit (S10)
- `PeriodControl`: calendar button + menu. Custom shows two `<input type="date">` + Apply; an invalid range shows the AC-4 message (`aria-describedby`) and keeps the previous value.
- `SafeSparkline`: ≥ 2 points → vendored `Sparkline`; 1 → a dot; 0 → nothing; carries a text label.
- `AcceptRate`: %, "n = …", "small sample" (1–9), "No decisions yet", ↑/↓ only when both rates exist and differ.
- `CostAmount`: `formatCostUsd(value, provenanceOf(split))`, where D9 A gives `estimate` if `estimate_usd > 0`; optional split line.
- `CostDelta`: "−$x" favourable / "+$x" unfavourable; omitted when the previous `cost_known_runs = 0`.
- `FailedRunsNote`: hidden at 0.
- `PerfEmptyState`: the empty text + note + "Try 30 days — N runs".

### T2 fixture (S7)
- **Seed:**
  - two repos; local + CI runs; done / failed / cancelled / running;
  - api / estimate / null `cost_source`; a null and a negative cost;
  - a deleted, a disabled and a zero-run agent;
  - findings accepted / dismissed / both / pending;
  - a run outside the window; rows in a second workspace.
- **Assert — figures:**
  - M-1…M-15; totals = Σ rows (AC-14); each breakdown sums to M-3 (AC-17);
  - Stats = the dashboard row (AC-22).
- **Assert — routes and validation:**
  - `/agents/performance` → 200, not the `/agents/:id` 422;
  - unknown `tz` and each AC-4 case → 422; unknown agent → 404.
- **Assert — history:**
  - 120 runs page 50/50/20, with no repeat after a newer run is inserted between pages;
  - a forged cursor → 422;
  - a CI row has `has_trace: false` and its `ci_runs.pr_number`.
- **Assert — read-only:** the `agent_runs` count is unchanged after every call (AC-28).

### Request budget
Dashboard: 1 request (current + previous), plus runs-count in the empty state only. Stats: stats + first history page (+ runs-count when empty), ≤ 3 in total. Load more is outside the cap.

### Pass-1 review (answered)
TQ1 tab position · TQ2 URL · TQ3 date inputs · TQ4 card line (now AC-30–32) · GAP1 Load more (AC-23a) · GAP2 `formatCostUsd` · GAP3 row behaviour · REC1 SQL aggregates + one derivation · REC2 request shape · REC3 runner bundle · REC4 `has_trace`. D1–D8 options were in the pass-1 summary; the answers are in *Decisions recorded*.

## Context applied
- `research.md` Q1–Q8 → table facts, CI rows, contracts, chart props, test templates.
- root `INSIGHTS.md` → runner bundle (D4, S1); shared copies drift (S1); paraphrased spec field (Prerequisites); mockups unseen by implementers (UI steps, M1).
- `server/insights/gotchas.md` → raw `sql` dates (S3), row types (S2), LAN (S5), `.it` workspace proof + Ryuk (S7).
- `client/insights/gotchas.md` → type-only imports (S8), Suspense (S11), nav (S14), `[id]` filter (S15), `fireEvent` + styles (S10).
- `client/src/lib/shared-type-only-imports.test.ts:22` → its regex misses deep imports (S8).
- `MetricCard.tsx:20-23`, `Donut.tsx:51-60`, `Sparkline.tsx:15-21` → own tiles, legend, guard.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| engineering-insights | preload | Context applied | — |
| onion-architecture | preload | S1–S7 | — |
| fastify-best-practices | on demand (S2) | S2–S7 | — |
| zod | on demand (S1) | S1–S8, S10–S17 | — |
| drizzle-orm-patterns | on demand (S3) | S3, S7 | — |
| postgresql-table-design | not read | S3 (implementer table row) | no table change (D5 A) |
| typescript-expert | on demand (S1) | S1–S8, S10–S17 | — |
| security | on demand (S1) | S1–S8, S10–S17 | — |
| frontend-architecture | on demand (S8) | S8, S10–S17 | — |
| react-best-practices | on demand (S8) | S8, S10–S17 | — |
| next-best-practices | on demand (S8) | S8, S10–S17 | — |
| react-testing-library | on demand (S8) | S8, S10–S13, S15–S17 | — |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `contracts/agent-performance.ts` (×2) | ports | new |
| server | `modules/agent-performance/*` | app / infra / transport | new |
| server | `platform/container.ts`, `modules/index.ts` | composition | changed |
| client | `lib/period.ts`, `lib/hooks/agent-performance.ts` | data | new |
| client | `components/period-control`, `components/perf-kit` | shared UI | new |
| client | `app/agent-performance/**` | route | new |
| client | AgentEditor + StatsTab, AgentCard, AgentsListView, `agents/[id]/page.tsx` | feature UI | changed / new |
| client | `vendor/ui/nav.ts` | vendored (sanctioned) | changed |

## Risks & open questions
- **`Sparkline` with one point** → `NaN` (`Sparkline.tsx:18`, 0/0); "1 day" with one run hits it → `SafeSparkline` (S10, T7).
- **CI trace case:** CI runs never have a trace, and the drawer would poll 30 s and then say "No trace available yet" → `has_trace` (D6) + the AC-24 text (S16, T14).
- **`/agents/performance` vs `/agents/:id`:** find-my-way should prefer the static segment across plugins (unverified); T2 asserts 200 with the dashboard body, so the pass-1 researcher question is optional.
- **`AT TIME ZONE` with an untrusted `tz`:** an unknown name is a Postgres error (500) → checked against `pg_timezone_names` first (S4), shape-limited by the contract regex (S1); T2 asserts 422. Hour buckets across a DST change follow the wall clock.
- **D5 (no index):** `agent_runs` has no `workspace_id`/`ran_at` index (`runs.ts:59-69`). T3 measures 10k runs. If it misses 1 s locally, run `EXPLAIN (ANALYZE)` on the S3 aggregate and reopen D5 (index + `pnpm db:generate` = a plan change).
- **Deep shared import is new:** vitest resolves it via the directory alias (`server/vitest.config.ts:7`), and tsx/Next via tsconfig `paths`; M1's `dev.sh` run proves the runtime.
- **nav.ts** is dropped by a vendor refresh (AC-6 records it).
- **D9** open (user-visible); recommendation A.
- **S17 editor left list** gets the card line too (assumption from the mockup; AC-30 names "the `/agents` list").

## Handed off
- architecture-reviewer: the deep contract path (D4); the deps object + structural port (S4); `perf-kit` in `src/components/` (S10); the client-side sort (S12).
- security review: `PerfQuery` / `RunHistoryQuery` + `tz` (S1, S2, S4); the cursor decode (S2); the workspace filter on every query (S3); response schemas (S5); names rendered as text (S10–S17).

## Insights to record
- None yet. Candidate after G1: a non-barrel shared contract leaves `agent-runner/dist` unchanged (root `INSIGHTS.md`).

## Red-flags check
- [x] Every AC maps to at least one step or test (no-spec plans) — n/a
- [x] Every spec AC-n has a row in *Spec traceability* with a step or test
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; technical choices are in *Decisions needed*, product gaps are GAPn (D9 flagged user-visible)
- [x] Groups end type-checking; parallel groups share no file (none parallel)
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [ ] The brief above the marker is under ~20,000 characters. It is ~29k: the locked *Decisions recorded* section plus 17 steps that each spell out the mockup paths and skills. Detail already lives below the marker. Each implementer group reads only its own steps.
- [x] Pass 1: only the pass-1 sections — n/a (pass 2)
- [x] Execution mode recommended per the D4 rule — multi-agent
- [x] Every step's *Skills to apply* is complete (the implementer reads only those)
- [x] `bash .claude/skills/sdd-engineering/scripts/sdd.sh plan-lint <plan>` prints `plan-lint: ok`

## Handoffs → G1

## Steps
| Step | Status | Files changed |
|---|---|---|
| S1 [Contract] | done | `server/src/vendor/shared/contracts/agent-performance.ts`, `client/src/vendor/shared/contracts/agent-performance.ts` (byte-identical) |
| S2 | done | `server/src/modules/agent-performance/helpers.ts`, `constants.ts`, `server/test/agent-performance-helpers.test.ts` |
| S3 | done | `server/src/modules/agent-performance/repository.ts` |
| S4 | done | `server/src/modules/agent-performance/types.ts`, `service.ts` |

## Handoff to the next group (G2)
- Contract: `@devdigest/shared/contracts/agent-performance.js` (both copies, not in the barrel). It exports `PerfQuery`, `PerfRunsCountQuery`, `RunHistoryQuery` (`limit` is `z.coerce`), `AgentPerfDashboard`, `AgentPerfStats`, `PerfRunsCount`, `RunHistoryPage` and the `Perf*` figure types.
- Service: `new AgentPerformanceService({ repo: AgentPerformanceRepository, agents: PerfAgentsPort, now? })`.
  - Methods: `dashboard(ws,q)`, `agentStats(ws,agentId,q)`, `runHistory(ws,agentId,q)`, `runsCount(ws,q)`.
  - An unknown tz or an AC-4 violation throws `ValidationError` (422). A missing agent throws `NotFoundError` (404), `runsCount` with `agent_id` included.
- Repository: `new AgentPerformanceRepository(db)`. Row shapes live in `types.ts` (plain shapes, no `db/schema` types; a deviation the main session accepted).
- S6: `container.agentsRepo` satisfies `PerfAgentsPort` structurally.
- S7:
  - `ran_at` and cursors are ms-precision; the keyset uses `date_trunc('milliseconds', ran_at), id`.
  - 1d gives 24–25 hourly buckets.
  - The dev DB holds about 130 done runs, so use a fresh `startPg`.
  - The filter `test/agent-performance` also matches the helpers unit test.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S1–S4 | |
| zod | on demand | S1, S2 | |
| typescript-expert | on demand | S1–S4 | |
| security | on demand | S2–S4 | |
| fastify-best-practices | on demand | — | no route code in G1 |
| drizzle-orm-patterns | on demand | S3 | |
| postgresql-table-design | on demand | — | no schema change |

## Handoffs → G2

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S5 | done | `server/src/modules/agent-performance/routes.ts` |
| S6 | done | `server/src/platform/container.ts`, `server/src/modules/index.ts` |
| S7 | done | `server/test/agent-performance.it.test.ts`, `server/test/agent-performance-perf.it.test.ts` |

## Handoff to the next group (G3)
- Routes (all GET):
  - `/agents/performance?period&from&to&tz` → `AgentPerfDashboard`
  - `/agents/performance/runs-count?period&from&to&tz[&agent_id]` → `{runs}`
  - `/agents/:id/stats?period&from&to&tz` → `AgentPerfStats`
  - `/agents/:id/stats/runs?period&from&to&tz[&cursor][&limit<=50]` → `{items, next_cursor}`
- Params: `period` is `1d|30d|custom`; `from`/`to` are ISO instants; `tz` is an IANA name.
- Errors: 422 for an unknown tz, an AC-4 violation or a forged cursor. 404 for an unknown agent.
- `has_trace` is false for CI runs. `pr_number` falls back to `ci_runs.pr_number`.
- Buckets: hourly for 1d, daily otherwise, with empty buckets present.
- A `kind: 'deleted'` row appears only when deleted agents have counted runs. `most_active` may be null.
- Contract unchanged since G1, outside the barrel (D4 A).
- Perf T3: 201 ms for 20 agents × 10k runs with no index, so D5 A holds.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S5–S7 | |
| fastify-best-practices | on demand | S5, S7 | |
| zod | on demand | S5 | |
| typescript-expert | on demand | S5–S7 | |
| security | on demand | S5, S7 | |
| drizzle-orm-patterns | on demand | S7 | |

## Handoffs → G3

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S8 | done | `client/src/lib/period.ts` (+test), `client/src/lib/hooks/agent-performance.ts` (+test), `hooks/index.ts`, `shared-type-only-imports.test.ts` |
| S9 | done | `client/messages/en/agentPerformance.json` (rewritten) |
| S10 | done | `client/src/components/period-control/*`, `client/src/components/perf-kit/*` |

## Handoff to the next group (G4)
- `@/lib/period`:
  - types and constants: `PeriodSel {period, from?, to?}` (YYYY-MM-DD), `PeriodKind`, `THIRTY_DAYS`, `MAX_CUSTOM_DAYS`, `CustomError`;
  - functions:
    - `parsePeriod(sp)` falls back to 30d;
    - `toSearch(sel)` returns a `URLSearchParams`; add `tab` or other params yourself;
    - also `periodKey`, `validateCustom`, `resolveWindow`, `browserTimeZone`, `localToday`.
- Hooks (`@/lib/hooks`, keys `["agent-performance", …, periodKey, tz]`):
  - `useAgentPerfDashboard(sel)`
  - `useAgentPerfStats(agentId, sel, enabled)`
  - `useAgentRunHistory(agentId, sel, enabled)`: infinite, 50 rows per page, the window is shared across pages
  - `useRunsCount30d(agentId|null, enabled)`: idle unless `enabled`
- `@/components/period-control`: `PeriodControl({value, onChange, today?})`. Custom has two date inputs and Apply; an invalid range shows an inline `role="alert"` and does not call `onChange`.
- `@/components/perf-kit`:
  - components:
    - `KpiTile`
    - `SafeSparkline({data,label,w?,h?,color?})`
    - `AcceptRate({rate,accepted,dismissed,previousRate?,runs?})`
    - `CostAmount({value,split,showSplit?})`
    - `CostDelta({current,previous,previousKnownRuns,split})`
    - `FailedRunsNote({count})`
    - `PerfEmptyState({failedRuns,tryThirty?})`
  - helpers: `formatDuration`, `formatPercent`, `ratePercent`, `provenanceOf` (D9 A: `~` when `estimate_usd > 0`), `acceptTrend`, `costDeltaOf`, `SMALL_SAMPLE_MAX`.
  - Each component calls `useTranslations("agentPerformance")`. In tests, wrap in `NextIntlClientProvider` with `messages={{ agentPerformance: messages }}`.
- i18n `agentPerformance`:
  - `title`, `subtitle`, `loadError`, `statsLoadError`, `retry`
  - `period.*`, `tiles.*`, `mostActive.*`, `cost.*`, `accept.*`
  - `table.*`: `recent {n,duration,cost}`; `view`, `viewAgent`, `sortBy`, `expand` and `collapse` take `{name}`
  - `empty.*` including `tryThirty`, `noAgents.*`, `breakdown.*`, `runHistory.*`
  - `card.summary {runs,accept,avg}`, `card.noDecisions`, `card.noRuns`
- `@devdigest/ui` exports `Sparkline`, `Icon`, `Button`, `CircularScore`. `relativeTime` comes from `useFormatter()`.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| engineering-insights | preload | gotchas | |
| onion-architecture | preload | trace-imports on period.ts | |
| frontend-architecture | on demand | S8, S10 | |
| react-best-practices | on demand | S8, S10 | |
| next-best-practices | on demand | S8, S10 | |
| typescript-expert | on demand | S8, S10 | |
| zod | on demand | S8, S10 | |
| security | on demand | S8, S10 | |
| react-testing-library | on demand | S8, S10 | |

## Handoffs → G4

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S11 | done | `client/src/app/agent-performance/page.tsx`, `_components/AgentPerformanceView/*` (incl. `KpiTiles.tsx`) |
| S12 | done | `_components/AgentPerfTable/*` (incl. `helpers.ts`, `fixtures.ts`) |
| S13 | done | `_components/CostBreakdown/*` (`CostDonut.tsx`) |
| S14 | done | `client/src/vendor/ui/nav.ts` (+3 lines, signed-off exception comment) |

## Handoff to the next group (G5)
- perf-kit, period-control and the hooks are unchanged. Reuse `KpiTile`, `AcceptRate`, `CostAmount`, `CostDelta`, and `CircularScore size={40}` with `ratePercent(rate)` (only when decisions > 0).
- Dashboard View links to `/agents/:id?tab=stats&<toSearch(sel)>`. The Stats tab reads `period/from/to` from the URL itself (`parsePeriod` ignores `tab`).
- Fixtures: `client/src/app/agent-performance/_components/AgentPerfTable/fixtures.ts` (`split`, `figures`, `row`, `zeroRow`).
- Test setup:
  - `vi.mock("@/lib/api")` spreads `importActual`;
  - wrap in `NextIntlClientProvider messages={{ agentPerformance: messages }}`;
  - `AppShell` mocked;
  - `next/navigation` mocked (`replace`, `useSearchParams`).
- Call `format.relativeTime(date, new Date())` with an explicit `now`, otherwise next-intl throws `ENVIRONMENT_FALLBACK` in tests.
- Open for the M1 design check: the Most-active tile shows "N runs · 78%" without the word "accept", because no i18n key was added in G4.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| engineering-insights | preload | gotchas | |
| onion-architecture | preload | trace-imports | |
| frontend-architecture | on demand | S11–S14 | |
| react-best-practices | on demand | S11–S13 | |
| next-best-practices | on demand | S11 | |
| typescript-expert | on demand | S11–S14 | |
| zod | on demand | type-only imports | |
| security | on demand | S11–S13 | |
| react-testing-library | on demand | S11–S13 | |

## Handoffs → G5

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S15 | done | `AgentEditor/constants.ts`, `AgentEditor.tsx`, `AgentEditor/_components/StatsTab/*`, plus `AgentEditor.test.tsx` (tab-order assertion updated for TQ1; this file is outside every step's Files) |
| S16 | done | `StatsTab/_components/RunHistory/*` |
| S17 | done | `app/agents/_components/AgentCard/{AgentCard.tsx,AgentCard.test.tsx,helpers.ts,styles.ts}`, `AgentsListView/AgentsListView.tsx` (+test), `app/agents/[id]/page.tsx` |

## Handoff to the next group (tests / M1)
- Full client suite: 812 passed. `EvalsTab` "missing key" failed once in a full run and passed on rerun; G5 did not touch it, so it looks flaky.
- To check in M1:
  - tab order is Config, Skills, Context, Evals, Stats, Versions, CI (the mockup has no Versions tab);
  - the card summary is plain text, so "accept" is not green;
  - the Most-active tile omits the word "accept";
  - Run history shows timestamps as local `YYYY-MM-DD HH:mm` and tokens as `16k`.
- `/agents/[id]`: the left card list adds one dashboard request. This is outside the Stats tab's cap of 3, and is the planned S17 assumption.
- Review notes:
  - `summaryFor` is imported from the sibling `../AgentCard/helpers`.
  - `RunHistory` hides its last `<th>` text with `left:-9999`; an aria-label would be cleaner.
  - The API 404 message is shown verbatim in `ErrorState`.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| engineering-insights | preload | gotchas | |
| onion-architecture | preload | trace-imports client/src | |
| frontend-architecture | on demand | S15–S17 | |
| react-best-practices | on demand | S15–S17 | |
| next-best-practices | on demand | S15–S17 | |
| typescript-expert | on demand | S15–S17 | |
| zod | on demand | type-only imports | |
| security | on demand | S15–S17 | |
| react-testing-library | on demand | S15–S17 | |

## Follow-ups
- 2026-10-19 DG6: per-agent icons on the dashboard/table (needs an icon field on agents)
- 2026-10-19 test for the Most-active tile small-sample branch (KpiTiles, main-session fix had no test)
- 2026-10-19 self-review H1: run-history window frozen per mount and not in queryKey — client/src/lib/hooks/agent-performance.ts:61
- 2026-10-19 self-review H2: PeriodControl custom draft never re-syncs from value; customOpen not reset — client/src/components/period-control/PeriodControl.tsx:26
- 2026-10-19 self-review H3: expanded row details div lacks row/cell role; toggle relies on bubbling — AgentPerfTable.tsx:59
- 2026-10-19 self-review M: 12 MEDIUM findings (i18n literal in StatsTab, duplicated accept-summary in AgentCard/KpiTiles, fixtures placement, hex palette, beforeEach concise arrow in hooks test) — see .pr-self-review.json run 2026-10-19
- 2026-10-19 retro P1: Skills table Applied in = step ids only — .claude/agents/implementer.md
- 2026-10-19 retro P2: handback-check accepts '| Step |' or template fixes header — sdd.sh cmd_handback_check
- 2026-10-19 retro P3: plan-lint fails when brief > ~20k chars — sdd.sh plan-lint
- 2026-10-19 retro P4: spec-creator pass-2 check of NFR caps vs listing/paging ACs — .claude/agents/spec-creator.md
- 2026-10-19 retro P5: React-rules self-check or UI analyzer after last UI group — implementer.md / stages.md implement

## Verification log
- 2026-10-19 agent: spec-p1 a08b55be20a853145 spec-creator 2026-10-19T13:38:14Z
- 2026-10-19 agent: spec-p2 a08b55be20a853145 spec-creator 2026-10-19T13:46:31Z
- 2026-10-19 agent: research a6a331ee8317ae59e researcher 2026-10-19T15:15:47Z
- 2026-10-19 agent: plan-p1 a41e93828ff570e26 implementation-planner 2026-10-19T15:19:14Z
- 2026-10-19 decisions recorded (TQ1-4, GAP1-3, D1-D8); GAP1-3 + TQ4 go to spec-creator
- 2026-10-19 agent: spec-p2 a08b55be20a853145 spec-creator 2026-10-19T15:26:07Z
- 2026-10-19 spec 015 re-approved after GAP1-3 + TQ4
- 2026-10-19 agent: plan-p2 a41e93828ff570e26 implementation-planner 2026-10-19T15:39:06Z
- 2026-10-19 plan approved; plan-approved tree 53ac84f3aff98021392ff7c86b4a683a33cf1691
- 2026-10-19 agent: implement a018dc8fa79ff4318 implementer 2026-10-19T16:40:18Z
- 2026-10-19 handback: unknown G1
- 2026-10-19 implement G1: done S1-S4; main-session spot-check: typecheck 0, helpers 21 passed, contract copies identical
- 2026-10-19 handback G1: report has a step table headed '| Step |' (not '| Step / gap |'); main session read the diff and ran the Done-when checks, so the result is known
- 2026-10-19 agent: implement ac8987ff80c9080fc implementer 2026-10-19T16:42:53Z
- 2026-10-19 implement G2: done S5-S7; main-session spot-check: agent-performance.it 9 passed; perf 201 ms (D5 A holds)
- 2026-10-19 agent: implement afd750ace565f2e6e implementer 2026-10-19T16:47:19Z
- 2026-10-19 implement G3: done S8-S10; main-session spot-check: client typecheck 0; perf-kit+period-control+type-only guard 15 passed
- 2026-10-19 agent: implement a1989953a0617522a implementer 2026-10-19T16:51:43Z
- 2026-10-19 implement G4: done S11-S14; main-session spot-check: typecheck 0; 21 passed; nav.ts diff = 3 lines with exception comment
- 2026-10-19 agent: implement ad2f24456bcc90e16 implementer 2026-10-19T16:56:24Z
- 2026-10-19 implement G5: done S15-S17; main-session spot-check: typecheck 0; StatsTab+RunHistory+AgentCard+AgentsListView 39 passed; deviation: AgentEditor.test.tsx tab-order assertion (TQ1) accepted as a test-only consequence
- 2026-10-19 agent: tests a5b2c721ec461907a test-writer 2026-10-19T17:05:05Z
- 2026-10-19 tests: test-writer closed AC-22/AC-28/AC-4/trust-boundary gaps; +1 server .it file (12), +3 client files, +3 tests; each break-checked; client 826 passed, server agent-performance 43 passed; no production defects
- 2026-10-19 it-suite: 47 files, 421 passed (exit 0)
- 2026-10-19 M1 design review: DG1-DG5 to fix (user), DG6 follow-up
- 2026-10-19 agent: fix-loop aba0dccde470c60cb implementer 2026-10-19T17:13:30Z
- 2026-10-19 fix DG1-DG5: done; client 830 passed; main-session re-screenshot confirms names in legend, sorted legend, 'accept' wording, accept colours
- 2026-10-19 agent: review accdda2ef0bb3790f security-reviewer 2026-10-19T17:14:58Z
- 2026-10-19 security-reviewer: PASS, 0 findings; dep audit not needed (no package.json/lock change)
- 2026-10-19 agent: review a0ca365075cb9ca90 architecture-reviewer 2026-10-19T17:15:49Z
- 2026-10-19 architecture-reviewer: PASS, 0 findings (deep-path runtime confirmed live by M1 under dev.sh)
- 2026-10-19 agent: review ac44e5eb88e322a1b plan-verifier 2026-10-19T17:33:32Z
- 2026-10-19 review-1: plan-verifier incomplete 143/161; R4 closed by the test-writer Proof table above; P3 accepted (row shapes in types.ts, no db/schema types; moving them would make helpers import the repository); to fix mode: T2, SP-AC-30, P9, SK1-SK4, SK6, SK7, SK10-SK16
- 2026-10-19 agent: fix-loop a5ab76e83f0623477 implementer 2026-10-19T18:10:10Z
- 2026-10-19 fix review-1 gaps: T2, SP-AC-30, P9 done; SK table per step recorded; main-session check: client typecheck 0, full client 831 passed, no '<' in agentPerformance.json
- 2026-10-19 main-session fix: KpiTiles Most-active small-sample mark (verifier handoff); SK3 applied by main session (EXPLAIN, D5 consistent)
- 2026-10-19 agent: review ac44e5eb88e322a1b plan-verifier 2026-10-19T18:13:19Z
- 2026-10-19 review-3: plan-verifier complete 160/161 (P3 accepted)
- 2026-10-19 close: plan done, spec implemented
- 2026-10-19 insights: server (raw timestamptz + ms keyset), client (vitest beforeEach teardown; next-intl t.rich/relativeTime), root (deep-path contract outside barrel; handback-check header); gotchas updated server+client; candidate (7) already recorded 2026-09-29
- 2026-10-19 agent: docs afcabfdaf6d1c5333 doc-writer 2026-10-19T18:16:16Z
- 2026-10-19 docs: docs/agent-performance.md + server/ and client/docs/agent-performance.md with index rows; main-session fix: stale perf-test comment (S7, comment only)
- 2026-10-19 self-review: PASS (0 critical, 3 high, 12 medium); gates green (server 1511, client 831)
- 2026-10-19 metrics: 4 flags (F1 implement/spec-p2/tests, F3 handback unknown x1), 2 repeats (F1 plans 24,26,28,34,42; F3 plans 28,34,42); 8.27M weighted tokens, 17 runs
- 2026-10-19 metrics: flags: 4 flag(s), 2 repeat(s)
- 2026-10-19 retro-fact: spec-creator was resumed across 3 user gates (pass 2, SG2/SG4 correction, GAP1-3+TQ4 correction), so spec-p2 busy 101m55s is mostly user think-time
- 2026-10-19 retro-fact: plan-p2 brief was ~29k chars vs the ~20k budget (planner left the red-flag box unchecked); every implementer group read it
- 2026-10-19 retro-fact: M1 screenshots found DG1 (donut legend label squeezed to 0 width) that 830 green client tests missed - jsdom does no layout
- 2026-10-19 retro-fact: plan-verifier needed 3 passes (full 143/161, delta 159/161, delta 160/161); 14 of the 18 open items were SK bookkeeping (Skills tables with free-text Applied in)
- 2026-10-19 retro-fact: pr-self-review UI pass found 3 HIGH (run-history window frozen per mount; PeriodControl draft never re-syncs; ARIA rowgroup child) that no reviewer agent flagged
- 2026-10-19 retro: docs/plans/assets/agent-performance/workflow-retro.md
- 2026-10-19 repeat: brainstormer brief saved as docs/ideas/09-sdd-repeat-flags-after-42.md (open, go Opt1); overlaps open brief 08
- 2026-10-19 eval:workflow: 5 passed, 4 failed (server gotchas not read; sandbox-leak = my docs/ideas write during the run; insights not activated with empty trace; 1 timeout) - one sample, not attributed to the gotchas/INSIGHTS edits
- 2026-10-20 eval:workflow rerun: 8/9 passed; only 'server task … server/AGENTS.md' fails (gotchas not read), which has passed 13 of 37 recorded runs in evals/results/records.jsonl before this plan — pre-existing low pass rate, not attributed to the gotchas/INSIGHTS edits

## Handoffs → tests (test-writer report, Proof table)
| Test file | Break check (subject · mutation · failing test) | shasum restored |
|---|---|---|
| `server/test/agent-performance-boundary.it.test.ts` | `repository.ts` workspace filter dropped → 3 fail; `service.ts` tz check + `helpers.ts` cursor guard removed → 500 instead of 422; POST route added to `routes.ts` → "has no write route" fails | yes |
| `client/src/app/agent-performance/agent-performance.parity.test.tsx` | `StatsTab.tsx` estimate dropped → missing `~$0.04`; `AgentPerfTable.tsx` `dismissed={0}` → "n = 5" fails | yes |
| `client/src/app/agent-performance/agent-performance.readonly.test.tsx` | `api.post` added to dashboard hook → 3 fail; extra GET in history hook → Stats-tab test fails | yes |
| `client/src/app/agent-performance/agent-performance.period-rejection.test.tsx` | `period.ts` future check removed → both screens fail | yes |
| `client/src/lib/period.test.ts`, `RunHistory.test.tsx` | calendar check relaxed / provenance arg dropped → one new test each fails | yes |
Not proven by mutation: the AC-28 "no LLM provider call" spy (the service has no LLM dependency to break).

## Handoffs → fix (review-1 gaps)
| Step / gap | Status | Files changed |
|---|---|---|
| T2 (S7) | done | `server/test/agent-performance.it.test.ts`: a second repo with agent `PerfX` (AC-7, runs = 2 on the dashboard and on stats); M-12 `last_run_at` asserted |
| SP-AC-30 (S17, S9) | done | `AgentCard.tsx` (+test), i18n `card.acceptSmall`: "75% accept (n = 4, small sample)" |
| P9 (S9, S17) | done | `<tone>` removed; plain keys `card.runs`/`card.avg`, accept rendered as its own coloured span |

### Skills (per step, re-checked in fix mode)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S1, S2, S3, S4, S6, S7 | |
| fastify-best-practices | read | S2, S3, S4, S6, S7 | |
| zod | read | S1, S2, S3, S4, S6, S7, S11, S12, S13, S14, S15, S16, S17 | |
| typescript-expert | read | S1, S2, S3, S4, S6, S7, S11, S12, S13, S14, S15, S16, S17 | |
| security | read | S1, S2, S3, S4, S6, S7, S11, S12, S13, S14, S15, S16, S17 | |
| drizzle-orm-patterns | read | S3, S7 | |
| postgresql-table-design | not read | | S3: no schema/table change (D5 A) |
| frontend-architecture | read | S11, S12, S13, S14, S15, S16, S17 | |
| react-best-practices | read | S11, S12, S13, S14, S15, S16, S17 | |
| next-best-practices | read | S11, S12, S13, S14, S15, S16, S17 | |
| react-testing-library | partial | S17 | S11–S16 tests not re-audited line by line; full client suite green |

## Handoffs → main session (review-2 gaps)
- **SK3 (S3 · `postgresql-table-design`, applied by the main session).** I checked the S3 queries against the skill's *Indexing* and *Insert-Heavy Workloads* rules ("index access paths you actually query", "minimize indexes on insert-heavy tables"), then ran `EXPLAIN (ANALYZE, BUFFERS)` read-only on the dev DB (`BEGIN READ ONLY … ROLLBACK`).
  - The aggregate is a `Seq Scan on agent_runs` with the filter `workspace_id`/`ran_at`: 164 rows, 0.12 ms.
  - The decisions join hashes `reviews` and `findings`. The join keys already carry indexes (`reviews_run_idx`, `findings_review_idx`).
  - T3 gives 201 ms at 200k rows. `agent_runs` is insert-heavy and read here only by a range aggregate, so D5 A (no index) is consistent with the skill.
  - Revisit with `(workspace_id, ran_at)` if T3 regresses past 1 s.
- **main-session fix: verifier handoff (unused `mostActive.acceptSmall`).** The key was unused because the Most-active tile showed "75% accept" for General Reviewer with n = 4. Under M-8/M-9 that tile needs the small-sample mark, the same as the card (AC-30). Fixed in `KpiTiles.tsx` (S11, +3 lines): the tile uses `mostActive.acceptSmall` when 1–9 decisions.
  - S11 Done-when: client typecheck 0.
  - `vitest run AgentPerformanceView agent-performance`: 8 files, 38 passed.
  - No new test: the ≤1-file trivial-fix rule.
