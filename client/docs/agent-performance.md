# Agent Performance — client building blocks
<!-- verified against 037890c1 + working tree on 2026-10-20 · sources: client/src/lib/period.ts, client/src/lib/hooks/agent-performance.ts, client/src/lib/hooks/skills.ts, client/src/lib/hooks/index.ts, client/src/lib/finding-category.ts, client/src/components/perf-kit/, client/src/components/period-control/PeriodControl.tsx, client/src/app/agent-performance/page.tsx, client/src/app/agent-performance/_components/, client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/, client/src/app/skills/[id]/_components/SkillEditor/_components/StatsTab/, client/src/app/agents/_components/AgentCard/, client/src/app/agents/_components/AgentsListView/AgentsListView.tsx, client/src/vendor/ui/nav.ts, client/src/lib/shared-type-only-imports.test.ts, client/messages/en/agentPerformance.json, client/messages/en/skills.json -->

Read this when you change the period handling, one of the Agent Performance hooks, the shared `perf-kit` or `period-control` components, the Stats-tab breakdown panels, the Skill → Stats tab, or the screens that use them. It describes the client side of [plan 42](../../docs/plans/42-agent-performance.md) (spec [015](../../specs/015-agent-performance.md)) and [plan 43](../../docs/plans/43-agent-stats-breakdown.md) (spec [016](../../specs/016-agent-stats-breakdown.md)). What the figures mean is in [`docs/agent-performance.md`](../../docs/agent-performance.md); the routes they call are in [`server/docs/agent-performance.md`](../../server/docs/agent-performance.md).

Diátaxis type: reference.

## Where the pieces sit

| Path | Role | Used by |
|---|---|---|
| `client/src/lib/period.ts` | period selection: URL parsing, validation, request window | dashboard, Stats tab, hooks, `PeriodControl` |
| `client/src/lib/hooks/agent-performance.ts` | five React Query hooks, re-exported from `@/lib/hooks` | dashboard, Stats tab, agent cards |
| `client/src/lib/hooks/skills.ts` | `useSkillStats(id, sel)`, the period-scoped Skill → Stats hook | Skill Stats tab |
| `client/src/lib/finding-category.ts` | category colours and the count formatter | Skill Stats donut, `BreakdownPanels` |
| `client/src/components/perf-kit/` | presentational pieces shared by the screens | dashboard, Stats tab, agent card |
| `client/src/components/period-control/` | the period menu | dashboard, agent Stats tab, Skill Stats tab |
| `client/src/app/agent-performance/` | the `/agent-performance` route: `AgentPerformanceView`, `AgentPerfTable`, `CostBreakdown` | — |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/` | the Stats tab, its `RunHistory` and `BreakdownPanels` | `AgentEditor` |
| `client/src/app/skills/[id]/_components/SkillEditor/_components/StatsTab/` | the Skill → Stats tab | `SkillEditor` |
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

The first five live in `client/src/lib/hooks/agent-performance.ts`. Each key starts with `"agent-performance"` and carries `periodKey(sel)` and the time zone. The window is resolved inside the query function, so a refetch reads a fresh "now" without changing the key. `useSkillStats` follows the same pattern in `client/src/lib/hooks/skills.ts`.

| Hook | Endpoint | Notes |
|---|---|---|
| `useAgentPerfDashboard(sel)` | `GET /agents/performance` | one request for current and previous window. Also feeds the agent cards with `THIRTY_DAYS`. |
| `useAgentPerfStats(agentId, sel, enabled = true)` | `GET /agents/:id/stats` | idle without an id or when `enabled` is false |
| `useAgentRunHistory(agentId, sel, enabled = true)` | `GET /agents/:id/stats/runs` | `useInfiniteQuery`, 50 rows per page. The window is memoised per `(period, tz)`, so every "Load more" sends the same `from` and `to` plus the `cursor`. |
| `useRunsCount30d(agentId \| null, enabled)` | `GET /agents/performance/runs-count` | idle unless `enabled`; the screens enable it only in an empty state when the period is not 30 days |
| `useAgentStatsBreakdown(agentId, sel)` | `GET /agents/:id/stats/breakdown` | key `["agent-performance", "breakdown", agentId, periodKey(sel), tz]`; idle only without an id. It is not gated on the stats request. |
| `useSkillStats(id, sel)` | `GET /skills/:id/stats?period&from&to&tz` | key `["skill-stats", id, periodKey(sel), tz]`; returns `SkillStatsPeriod`; idle without an id |

The per-screen request budget follows from this: the dashboard makes one request, plus the runs count in the empty state. The Stats tab makes the stats request, the breakdown request and the first history page, plus the runs count in the empty state; a test caps it at four. "Load more" requests are outside that cap.

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
- **`StatsTab`** mounts only while `?tab=stats` is open, so no other tab makes a stats request. It is three independent regions under the period control: the tiles (or their loading, error, not-found and empty state), `BreakdownPanels`, and `RunHistory`. A 404 from the stats call shows the editor's not-found state and hides the panels; other stats errors show the stats error with Retry and leave the panels alone. The panels follow their own response, so a stats failure does not hide them. `RunHistory` renders only when stats has data, below the panels; it mounts `RunTraceDrawer` only while a trace is open, and a run with `has_trace: false` shows "No trace stored for this run".
- **Agent cards.** `AgentsListView` and `agents/[id]/page.tsx` each call `useAgentPerfDashboard(THIRTY_DAYS)` once and pass each card its row through `summaryFor`. While loading the card shows a skeleton; on error, or for an agent the dashboard does not list, it shows no line; with 0 runs it shows "No runs in 30 days". The card stays fully usable in every state. The `/agents/[id]` left list therefore adds one dashboard request, outside the Stats tab's budget.
- **Sidebar.** `client/src/vendor/ui/nav.ts` lists `agent-performance` between `multi-agent` and `ci-runs`. This is a sanctioned hand edit of a vendored file, commented as such; a vendor refresh drops it.

## `BreakdownPanels`

`BreakdownPanels({ agentId, sel })` sits at `…/StatsTab/_components/BreakdownPanels/`, next to `RunHistory`. It calls `useAgentStatsBreakdown` and decides what to draw from the one response:

| Response state | Result |
|---|---|
| loading | four skeletons |
| 404 | nothing |
| other error | four cards, each titled and holding the same "Could not load this panel." message with a Retry that refetches |
| `counted_runs === 0` | nothing (the panels use their own count, CI runs included) |
| otherwise | a 2 × 2 grid: `SkillsPanel`, `MemoryPanel`, `SeverityBars`, `CategoryDonut` |

The view rules are pure functions in the folder's `helpers.ts`; the components only render them. Texts come from `agentPerformance.panels.*`; severity names come from `prReview.severity.*`, so a test needs both message sets.

| Panel | States, in precedence order | Notes |
|---|---|---|
| `SkillsPanel` | no local runs → "No local runs in this period; CI runs record no skills or memory"; `tracked_since` null → "Skill usage not recorded yet"; denominator 0; no rows → "No skills in this agent's prompts in this period"; list | rows are skill name, `ProgressBar` and a share, sorted by share then name, with "based on N local runs". A share above 0 that rounds to 0 reads "<1%". |
| `MemoryPanel` | no local runs → the same CI-only text (it reuses `panels.skills.ciOnly`); no rows → "No memory pulled in this period"; list | text and optional `#pr`, cut by CSS with the full text in `title`. **Always empty today**: reviews do not pull memory, because `run-executor.ts` stores `memory_pulled: []`. |
| `SeverityBars` | no local runs → "CI runs record no findings"; total 0 → "No findings in this period"; charts | CSS stacked columns, one per bucket, with the label kept at zero. Bottom to top: Suggestion, Warning, Critical, Other. Heights are relative to the largest bucket. |
| `CategoryDonut` | same two empty states | a local recharts `PieChart` of 140 px with the total in the centre and a legend of "count · percent". The vendored `Donut` is not used. |

Details worth knowing:

- **"No data before <date>".** Skills and memory add this line when `tracked_since` is later than the window start, so the reader knows the shares cover only the runs since then.
- **Bucket labels.** `H1…H6` for `4h`, `W1…Wn` for `7d`, and the short month for `month` (with the year when the range crosses a year). The range on hover or focus reads "Oct 11 08:00–12:00" for `4h` and "Oct 11–Oct 17" for the others, formatted by `Intl` in the browser's zone.
- **Hover equals focus.** Each column has `tabIndex={0}` and an `aria-label` carrying range and counts; mouse enter and focus both set the detail line above the chart.
- **Other.** A severity other than `CRITICAL`, `WARNING` or `SUGGESTION` is drawn as Other in `var(--text-muted)`, and the legend shows it only when its total is above 0. An unknown category keeps its stored name, in the fallback colour; the legend always lists the five known categories, with real zeros.
- **Plain text only.** Skill names and memory text render as text nodes; nothing is parsed as HTML or Markdown.
- **Shared category palette.** `client/src/lib/finding-category.ts` holds `KNOWN_CATEGORIES`, `CATEGORY_COLOR`, `CATEGORY_FALLBACK_COLOR` and `formatCount`. It sits in `src/lib` because the Skill → Stats donut uses it too; the Skill tab's `helpers.ts` keeps `formatSegmentValue` as an alias of `formatCount`.

## Skill → Stats

The Skill `StatsTab` has the same period control as the agent tab. It reads `parsePeriod(search)`, calls `useSkillStats(skill.id, sel)` and, on change, copies the URL's search params and replaces only `period`, `from` and `to`. That logic is written twice (agent tab and skill tab); neither imports the other's copy.

- **Header in every state.** The `PeriodControl` renders while loading, on error and in the empty state, so a failed or quiet period can be changed.
- **Empty state.** `hasNothingToShow` is `agent_count === 0 && !ever_used`: the empty state shows only for a skill with no agent and no run ever. A period without runs shows the tiles with dashes, not the empty state.
- **No local run in the period carried the skill** (`runs_with_skill === 0`): the pull-rate, accept-rate and findings tiles show "—" and the category panel says "No findings in this period".
- **Findings tile.** It reads `findings_30d` from the response, which now means findings in the requested window, and names the period under it with the same label text as the control (or the custom range). The label reads "FINDINGS", not "FINDINGS (30D)".
- **Loading and error** show no numbers: the hook sets no placeholder data.

## Imports from the contract

Take types from `@devdigest/shared/contracts/agent-performance.js` (and `…/skill-stats.js` for `SkillStatsPeriod`) with `import type`. The guard `client/src/lib/shared-type-only-imports.test.ts` fails on a value import from `@devdigest/shared` or any sub-path of it. Why the contract sits outside the barrel is in [`docs/agent-performance.md`](../../docs/agent-performance.md#why-the-contract-bypasses-the-barrel).

## Tests

| File | Covers |
|---|---|
| `client/src/lib/period.test.ts` | URL parsing, `validateCustom`, window resolution |
| `client/src/lib/hooks/agent-performance.test.tsx` | request counts; "Load more" sends the same window plus `cursor` |
| `client/src/components/perf-kit/PerfKit.test.tsx`, `client/src/components/period-control/PeriodControl.test.tsx` | the shared components |
| `client/src/app/agent-performance/**` | view states, table sorting and expansion, cost breakdown, and the `agent-performance.parity`, `.readonly` and `.period-rejection` suites |
| `…/StatsTab/StatsTab.test.tsx`, `…/RunHistory/RunHistory.test.tsx` | the Stats tab (including the four-request cap) and Run history |
| `…/BreakdownPanels/helpers.test.ts`, `…/BreakdownPanels/BreakdownPanels.test.tsx` | panel states, shares, labels, legends; skeletons, retry, hiding, hover and focus |
| `client/src/lib/hooks/skills-stats.test.tsx`, `…/SkillEditor/_components/StatsTab/StatsTab.test.tsx`, `…/SkillEditor/SkillEditor.test.tsx` | the skill hook's refetch on period change; the Skill → Stats states |
| `…/AgentCard/AgentCard.test.tsx`, `…/AgentsListView/AgentsListView.test.tsx` | the card line and its single request |

A vitest filter containing `[id]` matches nothing; filter on `StatsTab` or `AgentEditor` (`client/insights/gotchas.md`).
