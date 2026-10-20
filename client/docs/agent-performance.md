# Agent Performance — client building blocks
<!-- verified against 005701d + working tree on 2026-10-19 · sources: client/src/lib/period.ts, client/src/lib/hooks/agent-performance.ts, client/src/lib/hooks/index.ts, client/src/components/perf-kit/, client/src/components/period-control/PeriodControl.tsx, client/src/app/agent-performance/page.tsx, client/src/app/agent-performance/_components/, client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/, client/src/app/agents/_components/AgentCard/, client/src/app/agents/_components/AgentsListView/AgentsListView.tsx, client/src/vendor/ui/nav.ts, client/src/lib/shared-type-only-imports.test.ts -->

Read this when you change the period handling, one of the Agent Performance hooks, the shared `perf-kit` or `period-control` components, or the screens that use them. It describes the client side of [plan 42](../../docs/plans/42-agent-performance.md) (spec [015](../../specs/015-agent-performance.md)). What the figures mean is in [`docs/agent-performance.md`](../../docs/agent-performance.md); the routes they call are in [`server/docs/agent-performance.md`](../../server/docs/agent-performance.md).

Diátaxis type: reference.

## Where the pieces sit

| Path | Role | Used by |
|---|---|---|
| `client/src/lib/period.ts` | period selection: URL parsing, validation, request window | dashboard, Stats tab, hooks, `PeriodControl` |
| `client/src/lib/hooks/agent-performance.ts` | four React Query hooks, re-exported from `@/lib/hooks` | dashboard, Stats tab, agent cards |
| `client/src/components/perf-kit/` | presentational pieces shared by the screens | dashboard, Stats tab, agent card |
| `client/src/components/period-control/` | the period menu | dashboard, Stats tab |
| `client/src/app/agent-performance/` | the `/agent-performance` route: `AgentPerformanceView`, `AgentPerfTable`, `CostBreakdown` | — |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/` | the Stats tab and its `RunHistory` | `AgentEditor` |
| `client/src/app/agents/_components/AgentCard/` | the 30-day summary line (`summary` prop, `summaryFor`) | `AgentsListView`, `agents/[id]/page.tsx` |

`period.ts` and the hooks sit in `src/lib` and the two components in `src/components` because more than one route uses them.

## `lib/period.ts`

Pure functions, no React. The clock enters only through the `now` and `today` arguments, so a query key never holds a timestamp.

| Export | Behaviour |
|---|---|
| `PeriodSel` | `{ period: '1d' \| '30d' \| 'custom'; from?; to? }`, with `from`/`to` as inclusive `YYYY-MM-DD` local dates. This is what the URL holds. |
| `THIRTY_DAYS`, `MAX_CUSTOM_DAYS` | the default selection; 365 |
| `parsePeriod(sp)` | reads the URL. A missing or malformed value, or a custom range that breaks the rules, falls back to 30 days, so a hand-edited link cannot break the screen. Extra params such as `tab` are ignored. |
| `toSearch(sel)` | `URLSearchParams` with `period` and, for custom, `from` and `to`. Callers add `tab` themselves. |
| `validateCustom(from, to, today)` | returns `'order'`, `'future'`, `'tooLong'` or `null`. A malformed date counts as `'order'`. `tooLong` counts inclusive days against 365. |
| `periodKey(sel)` | stable string for query keys (`30d`, `custom:<from>:<to>`) |
| `resolveWindow(sel, now, tz)` | builds the `PerfQuery` the API takes: ISO `from` and `to` plus `tz`. 1 day is `now − 24 h`; 30 days is `now − 30 × 24 h`; custom `from` is the local midnight starting the first day and `to` is the local midnight after the last day, capped at `now`. |
| `browserTimeZone()`, `localToday()` | the browser's IANA zone (fallback `UTC`) and today's local date |

The server re-checks every window rule, so these checks give inline feedback; they are not the only guard.

## Hooks

All four live in `client/src/lib/hooks/agent-performance.ts`. Each key starts with `"agent-performance"` and carries `periodKey(sel)` and the time zone. The window is resolved inside the query function, so a refetch reads a fresh "now" without changing the key.

| Hook | Endpoint | Notes |
|---|---|---|
| `useAgentPerfDashboard(sel)` | `GET /agents/performance` | one request for current and previous window. Also feeds the agent cards with `THIRTY_DAYS`. |
| `useAgentPerfStats(agentId, sel, enabled = true)` | `GET /agents/:id/stats` | idle without an id or when `enabled` is false |
| `useAgentRunHistory(agentId, sel, enabled = true)` | `GET /agents/:id/stats/runs` | `useInfiniteQuery`, 50 rows per page. The window is memoised per `(period, tz)`, so every "Load more" sends the same `from` and `to` plus the `cursor`. |
| `useRunsCount30d(agentId \| null, enabled)` | `GET /agents/performance/runs-count` | idle unless `enabled`; the screens enable it only in an empty state when the period is not 30 days |

The per-screen request budget follows from this: the dashboard makes one request, plus the runs count in the empty state. The Stats tab makes the stats request and the first history page, plus the runs count in the empty state. "Load more" requests are outside that cap.

## `perf-kit`

Each component calls `useTranslations("agentPerformance")`, so a test wraps it in `NextIntlClientProvider` with `messages={{ agentPerformance: messages }}`. Import from `@/components/perf-kit`.

| Export | Behaviour |
|---|---|
| `KpiTile` | label, optional `aside` (a ring), value, footer. It replaces the vendored `MetricCard` because that one colours an increase green, which is wrong for cost. |
| `SafeSparkline` | 2 or more points draw the vendored `Sparkline`; one point draws a dot; none renders nothing. It always carries a text label. The guard exists because the vendored `Sparkline` divides by `length − 1`, which is `NaN` for one point. |
| `AcceptRate` | "78% ↑ · n = 12 · small sample", or "No decisions yet". The arrow shows only when both rates exist and differ. |
| `CostAmount` | money through `formatCostUsd`, with `~` per the worst-wins rule; `showSplit` adds the provenance line |
| `CostDelta` | "−$x" or "+$x" against the previous period; renders nothing when the previous period has no known cost |
| `FailedRunsNote` | "+N failed runs not counted"; renders nothing at 0 |
| `PerfEmptyState` | the empty text, the failed-runs note and, when given, the "Try 30 days — N runs" button |
| helpers | `SMALL_SAMPLE_MAX` (9), `provenanceOf`, `acceptTone`, `acceptTrend`, `costDeltaOf`, `formatPercent`, `ratePercent`, `formatDuration` |

Keep these rules in one place: a metric is computed once, in a `perf-kit` helper or on the server, and the screens only render it.

## `period-control`

`PeriodControl({ value, onChange, today? })` is a calendar button with a menu of three radio items. 1 day and 30 days call `onChange` at once. Custom opens two native `<input type="date">` fields and an Apply button. Apply runs `validateCustom`; a problem shows an inline `role="alert"` message tied to the inputs with `aria-describedby`, and `onChange` is not called, so the screen keeps the previous valid period. `today` is injectable for tests; `max` on both inputs is today.

The control does not touch the URL. The dashboard writes the new selection with `router.replace` and `toSearch`. The Stats tab copies the current search params, replaces only `period`, `from` and `to`, and keeps `tab`.

## Screens

- **`AgentPerformanceView`** returns early for each state in the order loading → error → no agents → no counted runs → data. The page file wraps it in `<Suspense>` because it reads `useSearchParams`. `KpiTiles` draws the four tiles; `AgentPerfTable` holds the sortable table (`sortRows` in its `helpers.ts`); `CostBreakdown` and `CostDonut` draw the two charts.
- **`CostDonut`** draws `recharts` `PieChart` directly instead of the vendored `Donut`, whose legend cannot show provenance per segment. Segments sort by amount, largest first, ties by label, with the null-label segment (Deleted agents or Unknown model) last. The legend prints each segment's split only when the chart holds more than one provenance.
- **`StatsTab`** mounts only while `?tab=stats` is open, so no other tab makes a stats request. A 404 from the stats call shows the editor's not-found state; other errors show the stats error with Retry. `RunHistory` renders below the tiles and mounts `RunTraceDrawer` only while a trace is open; a run with `has_trace: false` shows "No trace stored for this run".
- **Agent cards.** `AgentsListView` and `agents/[id]/page.tsx` each call `useAgentPerfDashboard(THIRTY_DAYS)` once and pass each card its row through `summaryFor`. While loading the card shows a skeleton; on error, or for an agent the dashboard does not list, it shows no line; with 0 runs it shows "No runs in 30 days". The card stays fully usable in every state. The `/agents/[id]` left list therefore adds one dashboard request, outside the Stats tab's budget.
- **Sidebar.** `client/src/vendor/ui/nav.ts` lists `agent-performance` between `multi-agent` and `ci-runs`. This is a sanctioned hand edit of a vendored file, commented as such; a vendor refresh drops it.

## Imports from the contract

Take types from `@devdigest/shared/contracts/agent-performance.js` with `import type`. The guard `client/src/lib/shared-type-only-imports.test.ts` fails on a value import from `@devdigest/shared` or any sub-path of it. Why the contract sits outside the barrel is in [`docs/agent-performance.md`](../../docs/agent-performance.md#why-the-contract-bypasses-the-barrel).

## Tests

| File | Covers |
|---|---|
| `client/src/lib/period.test.ts` | URL parsing, `validateCustom`, window resolution |
| `client/src/lib/hooks/agent-performance.test.tsx` | request counts; "Load more" sends the same window plus `cursor` |
| `client/src/components/perf-kit/PerfKit.test.tsx`, `client/src/components/period-control/PeriodControl.test.tsx` | the shared components |
| `client/src/app/agent-performance/**` | view states, table sorting and expansion, cost breakdown, and the `agent-performance.parity`, `.readonly` and `.period-rejection` suites |
| `…/StatsTab/StatsTab.test.tsx`, `…/RunHistory/RunHistory.test.tsx` | the Stats tab and Run history |
| `…/AgentCard/AgentCard.test.tsx`, `…/AgentsListView/AgentsListView.test.tsx` | the card line and its single request |

A vitest filter containing `[id]` matches nothing; filter on `StatsTab` or `AgentEditor` (`client/insights/gotchas.md`).
