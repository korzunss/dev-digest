# Agent Performance
<!-- verified against 037890c1 + working tree on 2026-10-20 · sources: server/src/modules/agent-performance/helpers.ts, server/src/modules/agent-performance/service.ts, server/src/modules/agent-performance/repository.ts, server/src/modules/skills/service.ts, server/src/vendor/shared/contracts/agent-performance.ts, server/src/vendor/shared/contracts/skill-stats.ts, server/src/modules/reviews/run-executor.ts, client/src/lib/finding-category.ts, client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/_components/BreakdownPanels/, client/src/app/skills/[id]/_components/SkillEditor/_components/StatsTab/StatsTab.tsx, client/src/components/perf-kit/helpers.ts, client/src/components/perf-kit/CostAmount.tsx, client/src/app/agent-performance/_components/AgentPerformanceView/AgentPerformanceView.tsx, client/src/app/agent-performance/_components/AgentPerformanceView/KpiTiles.tsx, client/src/app/agent-performance/_components/AgentPerfTable/helpers.ts, client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/StatsTab.tsx, client/src/app/agents/_components/AgentCard/AgentCard.tsx, client/messages/en/agentPerformance.json -->

Read this when you change what the Agent Performance page, the agent Stats tab or the agent-card summary line shows, or when you need the rules behind a number on them. It describes the feature as built by [plan 42](plans/42-agent-performance.md) (spec [015](../specs/015-agent-performance.md)) and extended by [plan 43](plans/43-agent-stats-breakdown.md) (spec [016](../specs/016-agent-stats-breakdown.md)): the Stats-tab breakdown panels and the period control on Skill → Stats. The specs hold the acceptance criteria; the code is the final word.

Diátaxis type: explanation. Routes and parameters are in [`server/docs/agent-performance.md`](../server/docs/agent-performance.md); the client building blocks are in [`client/docs/agent-performance.md`](../client/docs/agent-performance.md).

## What the three surfaces show

Every surface is a read of stored runs, findings and traces. None starts a review or calls a model.

| Surface | Where | Scope | Shows |
|---|---|---|---|
| Agent Performance page | `/agent-performance`, sidebar GLOBAL → Agent Performance | the whole workspace, every repo; the repo picker is ignored | four KPI tiles (Total runs with a sparkline, Total cost, Avg accept rate with a ring, Most-active agent); one table row per existing agent plus a "Deleted agents" row; cost breakdown by agent and by model |
| Stats tab | `/agents/<id>?tab=stats`, the `stats` tab after `evals` | one agent | four KPI tiles (Total runs, Avg cost / run, Avg duration, Accept rate with a ring); four breakdown panels (see [Stats-tab panels](#stats-tab-panels)); the Run history table |
| Skill Stats tab | the Stats tab of a skill under `/skills/<id>` | one skill | usage tiles and findings by category, over a period chosen with the same period control (see [Skill → Stats](#skill--stats)) |
| Agent card line | each card on `/agents` and in the left list of `/agents/<id>` | one agent, always the last 30 days | "N runs · X% accept · $Y avg", or "No runs in 30 days" |

Page behaviour that is easy to miss:

- **Period.** Three choices: 1 day (rolling 24 h), 30 days (rolling 30 × 24 h) and Custom (inclusive local dates). The default is 30 days. The choice lives in the URL, so a reload or a shared link reopens it. A custom range that ends in the future, runs backwards or spans more than 365 days is rejected inline and the previous data stays on screen.
- **States.** Loading shows skeletons, never numbers. A failed load shows an error with Retry and leaves the period control usable. No agents in the workspace shows a separate state that links to `/agents`. No counted runs in the period shows one empty state ("No successful runs in this period") instead of zero tiles, rows or charts.
- **Try 30 days.** In an empty state, when the period is not 30 days and the last 30 days have counted runs, a "Try 30 days — N runs" button selects 30 days. The count is a separate request, made only in that state.
- **Table.** Columns: Agent, Runs, Avg cost, Avg duration, Accept, Last run, View. It opens sorted by Accept, descending. Clicking another sortable header sorts by it; a second click reverses. Rows with no value for the column go last in either direction, and the Deleted agents row is always last. A row with counted runs expands in place to a sparkline of its newest five runs' durations and a line "last N runs · avg … · …". A row with no counted runs reads "No runs in this period" and does not expand. View opens that agent's Stats tab with the same period; the Deleted agents row has no View.
- **Run history** (Stats tab). Counted runs, newest first, 50 with the screen. "Load more" appends the next 50 older runs by cursor, so a run arriving meanwhile neither repeats nor shifts a row. A failed page keeps the rows already shown and offers a retry. View trace opens the run's stored trace; a run with no stored trace (every CI run) reads "No trace stored for this run".

## Metric rules (M-1 … M-15)

One set of rules serves all three surfaces. On the server both the dashboard row and the Stats tab are built by `toFigures` in `server/src/modules/agent-performance/helpers.ts`, so the same agent and period give the same numbers on every surface by construction.

| Rule | Definition |
|---|---|
| M-1 counted run | status `done` and `ran_at` inside the period, from both sources (local and CI). Failed, cancelled and running runs count nowhere except M-15. Screens say "successful runs". |
| M-2 Runs | the number of counted runs |
| M-3 Total cost | sum of `cost_usd` over counted runs whose cost is known. 0 is a known free run. A negative cost is treated as unknown. When some counted runs have no cost the tile adds "N runs without cost; total is a lower bound". With no known cost at all the total is "—", never `$0.00`. |
| M-4 provenance | every known cost is split three ways; see [Cost provenance](#cost-provenance) |
| M-5 Avg cost | M-3 divided by the number of counted runs with known cost; "—" when that number is 0 |
| M-6 Avg duration | mean `duration_ms` over counted runs with a known (non-negative) duration; "—" when none |
| M-7 decided finding | a finding of a review produced by a counted run, any kind. Accepted when `accepted_at` is set, dismissed when only `dismissed_at` is set, pending otherwise. A finding with both timestamps counts as accepted. A decision counts in its run's period, whenever it was made. |
| M-8 Accept rate | accepted ÷ (accepted + dismissed). The denominator shows as "n = 12"; with 0 decisions the screen says "No decisions yet", not a percentage. CI runs carry no findings, so an agent with only CI runs shows "No decisions yet". |
| M-9 small sample | a denominator of 1 to 9 is marked "small sample" |
| M-10 Avg accept rate | the pooled rate over all counted runs, deleted agents included. It is not a mean of per-agent rates. |
| M-11 Most-active | the existing agent with the most counted runs. Ties go to the newer last run, then to the name A to Z. The Deleted agents row is never chosen. |
| M-12 Last run | the newest `ran_at` among counted runs, as relative time; "—" with none |
| M-13 cost delta | current figure minus the same figure over the previous period; a decrease reads as favourable. Omitted when the previous period has no counted run with known cost. |
| M-14 accept trend | ↑ or ↓ when the previous rate exists and differs from the current one; no arrow when equal or either is missing |
| M-15 runs not counted | failed plus cancelled runs in the period, in the same scope as the Runs figure beside it. It drives the "+N failed runs not counted" note, which is hidden at 0 and appears on the Total runs tile and in the empty states, not in table rows. |

The **previous period** is the window of equal length that ends where the selected one starts. Every delta and trend compares against it.

Rules the code adds on top of the spec's wording:

- **Small-sample colouring.** The accept percentage is coloured by rate (green from 75, amber from 50, red below, the thresholds of the `CircularScore` ring) only when the denominator is 10 or more; at 1 to 9 it stays neutral. See `acceptTone` in `client/src/components/perf-kit/helpers.ts`.
- **Table sort groups.** Sorted by Accept, descending, rows fall in three groups: 10 or more decisions, then small samples, then no rate. Ascending reverses the first two groups; rate-less rows stay last. See `sortRows` in `client/src/app/agent-performance/_components/AgentPerfTable/helpers.ts`.
- **Money format.** Every amount goes through `formatCostUsd` (spec 001): two decimals from $1, three from $0.01, up to four below that, trailing zeros trimmed. A total and its breakdown parts are computed from the same unrounded values; only the display rounds.

## Cost provenance

The page never shows a "reconciled" cost. Provider invoices and usage APIs are not imported. What it shows is the stored `cost_source` of each run:

| Label on screen | Stored value | How it appears |
|---|---|---|
| provider-reported | `cost_source = 'api'` | plain `$` amount |
| DevDigest estimate | `cost_source = 'estimate'` | `~` prefix on the amount |
| source not recorded | a known cost with no `cost_source` (every CI run today) | plain `$` amount, labelled |

The cost area also states "Reconciled billing data is not available." (`cost.billingNote` in `client/messages/en/agentPerformance.json`).

A single derived money figure can mix sources: an average, a delta, a card's avg. The rule is **worst wins**: such a figure carries `~` when any part of its known cost is an estimate, so an estimate-tainted number never reads as exact. `provenanceOf` in `client/src/components/perf-kit/helpers.ts` implements it as `estimate_usd > 0`, and `CostAmount` and `CostDelta` both use it. This is decision D9 A of plan 42, the same rule as `rollupCost`. The plain amounts and the split line (for example "provider-reported $0.02 · DevDigest estimate ~$0.01") use the three parts directly.

In the cost breakdown, each legend row shows its amount, and its split when the chart holds more than one provenance, so the estimated share is visible per agent and per model.

## Stats-tab panels

Under the tiles the agent Stats tab shows four panels from one request. They cover the same period as the tiles. Like the tiles, they read stored data and call no model.

| Panel | Shows | Counts |
|---|---|---|
| Most-used skills | share of the agent's local runs whose prompt included each skill | local runs on or after the workspace's first run with a recorded skill |
| Most-pulled memory | share of runs where a memory entry (text plus PR) was pulled into the prompt | local runs with a stored trace on or after the first stored trace |
| Findings by severity | stacked columns per time bucket: 4 hours for 1 day, weeks for 30 days or a custom range of up to 90 local days, months beyond that | every finding of a counted run, by the run's time |
| Findings by category | donut with the total in the centre and a legend of count and percent | every finding of a counted run |

Rules that are easy to miss:

- **Local runs only for skills and memory.** CI runs record neither, so a CI-only agent shows a "no local runs" line in these panels, and in the findings panels (CI runs record no findings). The panels still appear for such an agent, because they hide only when the period has no counted run at all (local and CI).
- **"Tracked since".** Skill and memory shares use the runs since the first one that recorded anything as the denominator. When the period starts earlier, the panel says "No data before <date>".
- **Severity is matched exactly** against `CRITICAL`, `WARNING` and `SUGGESTION`. Anything else, `INFO` or lower case included, is counted as "Other", which the legend shows only when it is above 0. Categories are shown as stored; an unknown one keeps its name in a fallback colour.
- **Totals agree.** The findings total equals the sum over categories and the sum over buckets.
- **DST.** Four-hour buckets are real hours, so a bucket can read 3 or 5 hours on the clock on a DST day. Week and month buckets start at local midnights in the browser's zone.
- **Memory is empty today.** Reviews do not pull memory: `server/src/modules/reviews/run-executor.ts` stores `memory_pulled: []`. The memory panel therefore shows "No memory pulled in this period" until something fills that field.

Why 90 days: a user decision on spec 016 (B5, 2026-10-20). A custom range can run to 365 days, which would be 53 weekly bars; up to 90 days stays at 13 or fewer weekly bars, and anything longer switches to calendar months.

The three independent regions of the tab (tiles, panels, history) fail separately: a stats error does not hide the panels, and the panels' own error shows a Retry in each of the four slots. Details: [`client/docs/agent-performance.md`](../client/docs/agent-performance.md#breakdownpanels), route and SQL: [`server/docs/agent-performance.md`](../server/docs/agent-performance.md#breakdown).

## Skill → Stats

The Skill Stats tab takes the same period selection as the agent tab (1 day, 30 days, custom, kept in the URL). Its figures `runs_with_skill`, `runs_total`, pull rate, accept rate and findings are scoped to that period. The list of agents using the skill is not.

- **Period validation is shared.** The skills module asks the Agent Performance service to check the window and the time zone, so both tabs refuse the same invalid periods with a 422.
- **Empty means never used.** The tab shows its empty state only when no agent has the skill attached and no run ever recorded it. A period without runs shows the tiles with dashes.
- **The rail card stays at 30 days.** The skill list's footer line is unchanged and ignores the tab's period.
- **`findings_30d` now means "findings in the requested window".** The field kept its name so the shared contract did not change; the tab labels the tile "FINDINGS" and names the period under it.

## Why the contract bypasses the barrel

The Zod schemas live in `server/src/vendor/shared/contracts/agent-performance.ts`, with a hand-kept identical copy in `client/src/vendor/shared/contracts/agent-performance.ts`. `index.ts` of `@devdigest/shared` does not re-export them. Import them by the deep path:

```ts
import { PerfQuery } from '@devdigest/shared/contracts/agent-performance.js';
```

The reason is the agent-runner: its `dist/index.js` bundles the whole `@devdigest/shared` barrel, so any new barrel export makes the committed bundle stale (root `INSIGHTS.md`, 2026-10-15, "`agent-runner/dist/index.js` inlines `@devdigest/shared`"). A contract only the server and the client use stays out of the barrel, and the runner bundle is unchanged. This is decision D4 A of plan 42.

What makes the deep path resolve:

- `tsconfig.json` of `server/` and `client/` maps `@devdigest/shared/*` to `./src/vendor/shared/*`.
- Vitest in both packages aliases `@devdigest/shared` to the directory, so a deep import works in tests.
- In the client, import types only. The guard `client/src/lib/shared-type-only-imports.test.ts` matches `@devdigest/shared` with or without a sub-path and fails on a value import (a value import breaks `next dev`; see `client/insights/gotchas.md`).

Two consequences to remember: edit both copies together, and a name already exported by the barrel (`AgentStats`, `AgentPerf`, `AgentPerfRow`, `PerfCostSegment`) must not be reused in this file. The old `AgentStats` and `AgentPerf*` contracts are untouched.

Plan 43 follows the same rule twice. The breakdown schemas (`AgentStatsBreakdown` and its parts) sit in the same `agent-performance.ts`. The period-scoped skill response, `SkillStatsPeriod`, sits in a second deep-path file, `server/src/vendor/shared/contracts/skill-stats.ts` (also copied to the client). It extends `SkillStats` from `knowledge.ts`, which the barrel does re-export, so extending it in place would have changed the runner bundle; `skill-stats.ts` is imported by no barrel file.

## Not built

- Billing reconciliation (invoices, CSV, provider usage APIs).
- The Memory sidebar item.
- Memory pulled into review prompts: the memory panel is built and always empty until a review records `memory_pulled`.
- Breakdown panels on Skill → Stats and on the global dashboard; a "Sync CI" action.
- Per-agent icons in the table: agents store no icon (plan 42, follow-up DG6).
- Persisting sort order or row expansion.

## Related

- [`server/docs/agent-performance.md`](../server/docs/agent-performance.md) — routes, parameters, SQL, the no-index decision.
- [`client/docs/agent-performance.md`](../client/docs/agent-performance.md) — `lib/period.ts`, hooks, `perf-kit`, `period-control`.
- Specs [015](../specs/015-agent-performance.md), [016](../specs/016-agent-stats-breakdown.md) · plans [42](plans/42-agent-performance.md), [43](plans/43-agent-stats-breakdown.md).
