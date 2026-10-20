# Agent Performance — server module
<!-- verified against 005701d + working tree on 2026-10-19 · sources: server/src/modules/agent-performance/routes.ts, server/src/modules/agent-performance/service.ts, server/src/modules/agent-performance/repository.ts, server/src/modules/agent-performance/helpers.ts, server/src/modules/agent-performance/constants.ts, server/src/modules/agent-performance/types.ts, server/src/vendor/shared/contracts/agent-performance.ts, server/src/platform/container.ts, server/src/modules/index.ts, server/src/db/schema/runs.ts, server/test/agent-performance.it.test.ts, server/test/agent-performance-perf.it.test.ts -->

Read this when you change the `agent-performance` module, add a figure to its responses, or want to know why the aggregates run in SQL without a new index. It describes the module as built by [plan 42](../../docs/plans/42-agent-performance.md) (spec [015](../../specs/015-agent-performance.md)). What the numbers mean (M-1 … M-15) is in [`docs/agent-performance.md`](../../docs/agent-performance.md).

Diátaxis type: reference, with the design reasons in short sections after the tables.

## Shape

`server/src/modules/agent-performance/` is a read-only module. It has no write route and no LLM or adapter dependency.

| File | Layer | Holds |
|---|---|---|
| `routes.ts` | transport | the four GET routes; each handler is `getContext` → `app.container.agentPerformance.<method>` |
| `service.ts` | application | `AgentPerformanceService`: `dashboard`, `agentStats`, `runHistory`, `runsCount` |
| `helpers.ts` | application, pure | `resolveWindow`, `toFigures`, `toPrevious`, `sumAggregates`, `sumDecisions`, `pickMostActive`, `recentSummary`, `acceptRate`, `encodeCursor` / `decodeCursor`. No `drizzle-orm` import. |
| `repository.ts` | infrastructure | `AgentPerformanceRepository`: the only file with SQL |
| `types.ts` | | row shapes, `AgentPerformanceServiceDeps`, `PerfAgentsPort` |
| `constants.ts` | | `CLOCK_SKEW_MS`, `MAX_CUSTOM_MS`, `DAY_MS`, `RECENT_RUNS`, `HISTORY_PAGE` |

Wiring: `Container.agentPerformance` in `server/src/platform/container.ts` is a lazy getter that builds `new AgentPerformanceService({ repo: new AgentPerformanceRepository(this.db), agents: this.agentsRepo })`. The service asks for a narrow `PerfAgentsPort` (`list`, `getById`), which `agentsRepo` satisfies structurally. `agentPerformance` is registered in `server/src/modules/index.ts`. There is no `ContainerOverrides` field because there is no adapter to replace.

Row shapes live in `types.ts` as plain shapes, not `db/schema` types. Plan 42 accepted this deviation: a `db/schema` type in `helpers.ts` would make the pure helpers import the repository.

## Routes

All routes are `GET`, workspace-scoped through `getContext`, and declare a `response` schema, so only contract fields leave the server. Schemas come from `@devdigest/shared/contracts/agent-performance.js` (a deep path outside the barrel; see [why](../../docs/agent-performance.md#why-the-contract-bypasses-the-barrel)).

| Route | Query | Response | Notes |
|---|---|---|---|
| `/agents/performance` | `PerfQuery` | `AgentPerfDashboard` | the whole workspace; current and previous window in one response |
| `/agents/performance/runs-count` | `PerfRunsCountQuery` (`PerfQuery` + optional `agent_id`) | `PerfRunsCount` (`{ runs }`) | counted runs for the "Try 30 days" suggestion |
| `/agents/:id/stats` | `PerfQuery` | `AgentPerfStats` | one agent; same `toFigures` as a dashboard row |
| `/agents/:id/stats/runs` | `RunHistoryQuery` (`PerfQuery` + `cursor`, `limit` 1 to 50) | `RunHistoryPage` (`items`, `next_cursor`) | Run history; default page 50 |

The static `/agents/performance…` paths take precedence over the parametric `/agents/:id`, so they never reach the agents module's UUID check. `server/test/agent-performance.it.test.ts` asserts a 200 with the dashboard body.

### Parameters

| Parameter | Rule |
|---|---|
| `period` | `1d`, `30d` or `custom` |
| `from`, `to` | ISO datetimes with offset: instants, not dates. The client resolves local midnights itself. |
| `tz` | an IANA name, 1 to 64 characters of `[A-Za-z0-9_+\-/]`. It is used only to bucket the sparkline. |
| `cursor` | opaque string, at most 200 characters; base64url of `{ t, id }` |
| `limit` | coerced integer, 1 to 50 |

The service re-checks the window on top of the schema (`resolveWindow`). A violation throws `ValidationError`, which is HTTP 422:

- `from >= to`;
- `to` more than `CLOCK_SKEW_MS` (60 s) after the server's clock;
- `1d` not 24 h long, or `30d` not 30 × 24 h long, beyond the same 60 s tolerance;
- a `custom` range longer than `MAX_CUSTOM_MS` (365 days plus one hour, so a range that spans a DST change still fits).

The previous window has the same length and ends at `from`. Hourly buckets are used for `1d`, daily buckets otherwise.

An unknown `tz` is also a 422: the service asks `timeZoneExists` (`pg_timezone_names`) before any query, because an unknown name inside `AT TIME ZONE` is a Postgres error, which would surface as a 500. A forged `cursor` is a 422 (`decodeCursor` runs `safeParse` on the decoded payload). A missing agent is a 404 (`NotFoundError`) on `/agents/:id/stats`, `/agents/:id/stats/runs` and on `runs-count` when `agent_id` is given.

### Response composition

`dashboard` builds:

- one row per agent from `agents.list` (all agents, disabled ones included; an agent with no runs gets `runs: 0`);
- one `deleted` row only when runs with no known agent have counted runs;
- `totals`, pooled over every scope with `sumAggregates` and `sumDecisions`, so the rows add up to the totals and the average accept rate is pooled, not a mean of rates;
- `most_active` (`pickMostActive`, `null` when no agent has runs);
- `cost_by_agent` from rows with known cost, the Deleted row included, and `cost_by_model` from `costByModel`, so each sums to the total cost.

`runHistory` asks the repository for `limit + 1` rows and returns `next_cursor` only when the extra row came back.

## SQL aggregation

The aggregates are computed in Postgres, not in Node. The service never loads individual runs for the dashboard except the newest five per agent.

Every query filters `workspace_id` and `ran_at >= from AND ran_at < to`, with no repo filter and both run sources (`local` and `ci`). Instants are bound as ISO strings cast with `::timestamptz`, ids as `::uuid`, and `tz` as a bound parameter.

| Method | What it does |
|---|---|
| `timeZoneExists` | `SELECT 1 FROM pg_timezone_names WHERE name = $1` |
| `aggregateByAgent` | one row per `agent_id` over `agent_runs`, using `count(*) FILTER` and `sum(...) FILTER` for done runs, failed and cancelled runs, known cost per `cost_source` (`api`, `estimate`, null), known duration and its sum, and `max(ran_at)` of done runs. A negative cost or duration is excluded as unknown. |
| `decisionsByAgent` | done runs → `reviews.run_id` → `findings`; counts accepted and dismissed (accepted wins when both timestamps are set) |
| `costByModel` | done runs with known cost grouped by `model`, with the three-way split |
| `buckets` | `generate_series` over the window in the caller's zone, left-joined to done-run counts per hour or day, so empty buckets are present |
| `recentRuns` | `row_number() OVER (PARTITION BY agent_id ORDER BY ran_at DESC, id DESC)`, keeping 5 per agent |
| `runHistory` | keyset on `(date_trunc('milliseconds', ran_at), id)`, newest first; left joins `pull_requests` and, laterally, `ci_runs` |
| `countDone` | counted runs in a window, optionally for one agent |

Design points:

- **Findings are aggregated in a separate query.** Joining findings into the run aggregate would multiply each run's cost by its finding count.
- **One derivation.** `toFigures` turns an aggregate row and a decision row into the response figures. Both endpoints call it.
- **Keyset at millisecond precision.** The cursor carries milliseconds, and the query truncates `ran_at` to milliseconds on both sides, so a page boundary neither repeats nor skips a run. A run inserted between two page requests does not shift the next page.
- **Run history fields.** `pr_number` is `coalesce(pull_requests.number, ci_runs.pr_number)`; `tokens` is `tokens_in + tokens_out`, or null when both are null; `has_trace` is true when a `run_traces` row exists. CI runs never have a trace, so `has_trace` is false for them.
- **Timestamps leave SQL as ISO text.** The repository's doc comment records why: the postgres-js client returns raw `execute` timestamps as strings whose shape is not a safe `Date` input.

## Why there is no index (D5)

Plan 42 chose to add no index and no migration (decision D5 A). `agent_runs` has indexes on `pr_id`, `agent_id`, `multi_agent_run_id` and a partial one on done runs by agent and `ran_at` (`server/src/db/schema/runs.ts`), but none on `workspace_id` or `ran_at` alone, so the dashboard aggregate scans the table.

The evidence recorded in the plan:

- `server/test/agent-performance-perf.it.test.ts` seeds 20 agents × 10 000 done runs inside 30 days and times `GET /agents/performance`. The test asserts under 1000 ms when `CI` is unset and only logs the time in CI. The plan's log records 201 ms.
- An `EXPLAIN (ANALYZE, BUFFERS)` on the dev DB (164 rows) showed a sequential scan on `agent_runs` with the workspace and `ran_at` filter, and the join keys of the decisions query already indexed (`reviews_run_idx`, `findings_review_idx`).
- `agent_runs` is insert-heavy and this module reads it only through range aggregates, so a new index costs every insert for a read that already meets the budget.

If the perf test regresses past 1 s, the plan's own follow-up is a `(workspace_id, ran_at)` index; that is a schema change and needs a migration through `pnpm db:generate`.

## Tests

| File | Tier | Covers |
|---|---|---|
| `server/test/agent-performance-helpers.test.ts` | unit | window rules, pooled rate, most-active ties, cursor |
| `server/test/agent-performance.it.test.ts` | integration | M-1 … M-15 over seeded runs, workspace isolation, routing, paging, 404/422 |
| `server/test/agent-performance-boundary.it.test.ts` | integration | workspace filter, tz and cursor rejection, no write route |
| `server/test/agent-performance-perf.it.test.ts` | integration | the 1 s budget |

The filter `vitest run test/agent-performance` matches all four; the `.it` files need Postgres.
