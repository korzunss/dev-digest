# Agent Performance
<!-- verified against 005701d + working tree on 2026-10-19 · sources: server/src/modules/agent-performance/helpers.ts, server/src/modules/agent-performance/service.ts, server/src/modules/agent-performance/repository.ts, server/src/vendor/shared/contracts/agent-performance.ts, client/src/components/perf-kit/helpers.ts, client/src/components/perf-kit/CostAmount.tsx, client/src/app/agent-performance/_components/AgentPerformanceView/AgentPerformanceView.tsx, client/src/app/agent-performance/_components/AgentPerformanceView/KpiTiles.tsx, client/src/app/agent-performance/_components/AgentPerfTable/helpers.ts, client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/StatsTab.tsx, client/src/app/agents/_components/AgentCard/AgentCard.tsx, client/messages/en/agentPerformance.json -->

Read this when you change what the Agent Performance page, the agent Stats tab or the agent-card summary line shows, or when you need the rules behind a number on them. It describes the feature as built by [plan 42](plans/42-agent-performance.md) (spec [015](../specs/015-agent-performance.md)). The spec holds the acceptance criteria; the code is the final word.

Diátaxis type: explanation. Routes and parameters are in [`server/docs/agent-performance.md`](../server/docs/agent-performance.md); the client building blocks are in [`client/docs/agent-performance.md`](../client/docs/agent-performance.md).

## What the three surfaces show

Every surface is a read of stored runs, findings and traces. None starts a review or calls a model.

| Surface | Where | Scope | Shows |
|---|---|---|---|
| Agent Performance page | `/agent-performance`, sidebar GLOBAL → Agent Performance | the whole workspace, every repo; the repo picker is ignored | four KPI tiles (Total runs with a sparkline, Total cost, Avg accept rate with a ring, Most-active agent); one table row per existing agent plus a "Deleted agents" row; cost breakdown by agent and by model |
| Stats tab | `/agents/<id>?tab=stats`, the `stats` tab after `evals` | one agent | four KPI tiles (Total runs, Avg cost / run, Avg duration, Accept rate with a ring); the Run history table |
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

## Not built

- Billing reconciliation (invoices, CSV, provider usage APIs).
- The Stats-tab panels Most-used skills, Most-pulled memory, Findings by severity and by category; the Memory sidebar item.
- Per-agent icons in the table: agents store no icon (plan 42, follow-up DG6).
- Persisting sort order or row expansion.

## Related

- [`server/docs/agent-performance.md`](../server/docs/agent-performance.md) — routes, parameters, SQL, the no-index decision.
- [`client/docs/agent-performance.md`](../client/docs/agent-performance.md) — `lib/period.ts`, hooks, `perf-kit`, `period-control`.
- Spec [015](../specs/015-agent-performance.md) · plan [42](plans/42-agent-performance.md).
