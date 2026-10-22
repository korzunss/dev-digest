# Agent Performance — server module
<!-- verified against 037890c1 + working tree on 2026-10-20 · sources: server/src/modules/agent-performance/routes.ts, server/src/modules/agent-performance/service.ts, server/src/modules/agent-performance/repository.ts, server/src/modules/agent-performance/helpers.ts, server/src/modules/agent-performance/constants.ts, server/src/modules/agent-performance/types.ts, server/src/vendor/shared/contracts/agent-performance.ts, server/src/vendor/shared/contracts/skill-stats.ts, server/src/modules/skills/service.ts, server/src/modules/skills/repository.ts, server/src/modules/skills/routes.ts, server/src/modules/skills/stats.ts, server/src/platform/container.ts, server/src/modules/index.ts, server/src/db/schema/runs.ts, server/test/agent-performance.it.test.ts, server/test/agent-performance-perf.it.test.ts, server/test/agent-stats-breakdown.it.test.ts -->

Read this when you change the `agent-performance` module, add a figure to its responses, or want to know why the aggregates run in SQL without a new index. It describes the module as built by [plan 42](../../docs/plans/42-agent-performance.md) (spec [015](../../specs/015-agent-performance.md)) and extended by [plan 43](../../docs/plans/43-agent-stats-breakdown.md) (spec [016](../../specs/016-agent-stats-breakdown.md)): the breakdown route and the period on the skills stats route. What the numbers mean (M-1 … M-15) is in [`docs/agent-performance.md`](../../docs/agent-performance.md).

Diátaxis type: reference, with the design reasons in short sections after the tables.

## Shape

`server/src/modules/agent-performance/` is a read-only module. It has no write route and no LLM or adapter dependency.

| File | Layer | Holds |
|---|---|---|
| `routes.ts` | transport | the five GET routes; each handler is `getContext` → `app.container.agentPerformance.<method>` |
| `service.ts` | application | `AgentPerformanceService`: `dashboard`, `agentStats`, `runHistory`, `runsCount`, `breakdown`, and the public `checkWindow` |
| `helpers.ts` | application, pure | `resolveWindow`, `toFigures`, `toPrevious`, `sumAggregates`, `sumDecisions`, `pickMostActive`, `recentSummary`, `acceptRate`, `encodeCursor` / `decodeCursor`, `breakdownBucketKind`, `toBreakdown`. No `drizzle-orm` import. |
| `repository.ts` | infrastructure | `AgentPerformanceRepository`: the only file with SQL |
| `types.ts` | | row shapes, `AgentPerformanceServiceDeps`, `PerfAgentsPort` |
| `constants.ts` | | `CLOCK_SKEW_MS`, `MAX_CUSTOM_MS`, `DAY_MS`, `RECENT_RUNS`, `HISTORY_PAGE`, `MONTH_BUCKETS_AFTER_DAYS` |

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
| `/agents/:id/stats/breakdown` | `PerfQuery` | `AgentStatsBreakdown` | the Stats-tab panels; see [Breakdown](#breakdown) |

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

An unknown `tz` is also a 422: the service asks `timeZoneExists` (`pg_timezone_names`) before any query, because an unknown name inside `AT TIME ZONE` is a Postgres error, which would surface as a 500. A forged `cursor` is a 422 (`decodeCursor` runs `safeParse` on the decoded payload). A missing agent is a 404 (`NotFoundError`) on `/agents/:id/stats`, `/agents/:id/stats/runs`, `/agents/:id/stats/breakdown` and on `runs-count` when `agent_id` is given. The service keeps the tz and window check in one private method, `checked`; the public `checkWindow(q)` wraps it so another module can reuse the same rules (see [Skills stats](#skills-stats-with-a-period)).

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

Every query filters `workspace_id` and `ran_at >= from AND ran_at < to`, with no repo filter and both run sources (`local` and `ci`). The breakdown's own methods are listed under [Breakdown](#breakdown); its two tracked-since reads are the exception and ignore the window. Instants are bound as ISO strings cast with `::timestamptz`, ids as `::uuid`, and `tz` as a bound parameter.

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

## Breakdown

`GET /agents/:id/stats/breakdown` feeds the four panels under the Stats-tab tiles. It is read-only and starts no model call. `AgentPerformanceService.breakdown` runs in this order: `checked(q)` (tz, then window; 422), then `agents.getById` (404 for an unknown agent or one of another workspace), then the bucket kind, then the reads. The two "tracked since" reads run first, because their results feed the usage reads; the other five reads then run in one `Promise.all`. `toBreakdown` in `helpers.ts` assembles the response from the raw reads. It rounds nothing: shares and percentages are the client's job.

### Response

| Field | Meaning |
|---|---|
| `window` | the resolved window, as on `/stats` |
| `counted_runs` | the agent's counted runs in the window, local and CI (M-1, M-2). At 0 the client hides the panels. |
| `local_runs` | the counted runs with `source = 'local'` |
| `skills`, `memory` | each `{ tracked_since, denominator, rows }` |
| `findings` | `{ total, by_category, bucket_kind, buckets }` |

`counted_runs` comes from the breakdown's own query (`countedRuns`), not from `/stats`, so the panels stay consistent with themselves if a run finishes between the two requests.

### Skills and memory: tracked since and denominators

Skills and memory are read from local runs only (the panel copy says CI runs record neither). A share needs a denominator, and the denominator starts at the first run that has any record, so earlier runs do not count as "did not use it".

| | `tracked_since` | `denominator` | `rows` |
|---|---|---|---|
| `skills` | earliest `ran_at` of a done local run in the workspace that has a `run_skills` row (`skillsTrackedSince`) | the agent's counted local runs in the window with `ran_at >= tracked_since` | per skill, `count(*)` over `run_skills ⋈ agent_runs ⋈ skills`, sorted by runs, name, id |
| `memory` | earliest `ran_at` of a done local run in the workspace that has a `run_traces` row (`memoryTrackedSince`) | the same runs, joined to `run_traces` | per entry (`text` + `pr`), `count(DISTINCT run_id)` over the elements of `trace->'memory_pulled'`, sorted by runs, text, pr |

Rules in the SQL:

- Both "tracked since" reads look at the whole workspace and ignore the window; every other read uses the window and the agent (`scope`).
- A null `tracked_since` makes `skillUsage` and `memoryUsage` return a denominator of 0 and no rows without querying, and `toBreakdown` zeroes the panel too.
- A skill row exists only when the skill still exists in the workspace (the join carries `s.workspace_id`). A skill detached from the agent since the run keeps its row under its current name.
- Memory reads are defensive: a trace whose `memory_pulled` is not an array, or an entry whose `text` is not a string, adds no row; a `pr` that is not an integer of at most nine digits becomes null.

Today `memory.rows` is always empty in practice: `server/src/modules/reviews/run-executor.ts` writes `memory_pulled: []` into every trace it stores (two sites). The query is ready for the day a review pulls memory.

### Findings by category and severity

- **Category:** the M-7 join (`agent_runs ⋈ reviews ⋈ findings`, done runs), grouped by the stored `category`. No mapping: an unknown category comes back as stored. `findings.total` is the sum of the category counts.
- **Severity:** `severityBuckets` builds the buckets in SQL (`generate_series`) and left-joins findings by their run's `ran_at`, so every bucket is present, empty ones with zeros. Severity matches the stored literals `CRITICAL`, `WARNING`, `SUGGESTION` exactly; any other non-null value (`INFO`, lower case) counts as `other`.

Bucket kind comes from `breakdownBucketKind`:

| Period | `bucket_kind` | Buckets |
|---|---|---|
| `1d` | `4h` | six, from the window start in steps of 4 real hours; the last ends at `to` |
| `30d` | `7d` | calendar weeks counted from the window start in the caller's `tz` (five for 30 days, the last one shorter) |
| `custom`, at most 90 local days | `7d` | as `30d` |
| `custom`, more than 90 local days (`MONTH_BUCKETS_AFTER_DAYS`) | `month` | calendar months in `tz`; the first starts at `from`, the last ends at `to` |

For `custom`, the helper counts local calendar days in `tz` from `from` to `to − 1 ms`, inclusive.

DST behaviour follows from building buckets as instant ranges `[start, end)`:

- `4h` buckets are real hours, so on a day with a DST change the clock shows one bucket as 3 or 5 hours.
- `7d` and `month` buckets start at local midnights (`AT TIME ZONE tz`), so a week that contains a DST change is 167 or 169 real hours long, and the bounds the client prints are still local days.
- A finding belongs to the bucket whose range contains its run's `ran_at`, so counts always match the displayed bounds. Bounds leave SQL as millisecond ISO text.

The `kind` argument chooses one of three fixed SQL fragments; the instants and `tz` are bound parameters, never interpolated.

## Skills stats with a period

`GET /skills/:id/stats` lives in the `skills` module but takes the same window as Agent → Stats. Its query is `SkillStatsQuery` (an alias of `PerfQuery`), and all four parameters (`period`, `from`, `to`, `tz`) are required: a missing query is a 422. The response is `SkillStatsPeriod`: the existing `SkillStats` plus `ever_used`.

`SkillsService.stats` calls `this.container.agentPerformance.checkWindow(q)` first, so a bad tz or window is a 422 even for an unknown skill, and an unknown skill with a valid query is a 404. The skills module reaches the other module only through the container; there is no import from `agent-performance`. Reuse keeps one implementation of the tz and window rules.

| Field | Scope |
|---|---|
| `runs_with_skill`, `runs_total`, `pull_rate`, `accept_rate`, `findings_30d`, `findings_by_category` | the requested window; the end is exclusive (`lt(ranAt, until)` in the repository) |
| `agents`, `agent_count` | not windowed: the skill's current links |
| `ever_used` | not windowed: any `run_skills` row for the skill on any run of the workspace, whatever the run's outcome (`everUsed`, `LIMIT 1`) |

`findings_30d` keeps its name and now means "findings in the requested window". The old name stays because `SkillStats` lives in `knowledge.ts`, which the barrel re-exports; renaming or extending it would change the agent-runner bundle. `SkillStatsPeriod` therefore extends it in `server/src/vendor/shared/contracts/skill-stats.ts`, a file the barrel does not import, with a copy in the client. Import by the deep path `@devdigest/shared/contracts/skill-stats.js`.

`ever_used` exists because `runs_with_skill` is now period-scoped: a skill whose runs all predate the period reads 0 there but is not unused. `GET /skills` (the list rail card) is unchanged: `SkillsService.list` still rolls up the last 30 days (`STATS_WINDOW_DAYS`), now with an upper bound at the current time.

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
| `server/test/agent-performance-helpers.test.ts` | unit | window rules, pooled rate, most-active ties, cursor, `breakdownBucketKind` (including New York DST and Kolkata), `toBreakdown` |
| `server/test/agent-stats-breakdown.it.test.ts` | integration | the breakdown: denominators, memory identity, CI-only agent, category and severity totals, bucket kinds, workspace filters, 404/422. The DST cases call `AgentPerformanceRepository.severityBuckets` directly, because a `1d` request must be exactly 24 h long and the route cannot take a 23 h window. |
| `server/test/agent-performance.it.test.ts` | integration | M-1 … M-15 over seeded runs, workspace isolation, routing, paging, 404/422 |
| `server/test/agent-performance-boundary.it.test.ts` | integration | workspace filter, tz and cursor rejection, no write route |
| `server/test/agent-performance-perf.it.test.ts` | integration | the 1 s budget, for the dashboard and for the breakdown (2 000 traced runs of about 32 KB each, two skills per run, five findings per run; plan 43 recorded 127 ms) |
| `server/test/skills.it.test.ts` | integration | the skills stats window: exclusive end, unwindowed agents, `ever_used`, the unchanged 30-day list, 422 and 404 |

The filter `vitest run test/agent-performance` matches the four agent-performance files; `agent-stats-breakdown` needs its own filter. The `.it` files need Postgres.
