# Repo research for SPEC-15 (agent performance) — 2026-10-19

Researcher, repo mode. Facts are read from the code; rows marked *inference* were not run.

## Q1 Data model and joins
- `agent_runs` (`server/src/db/schema/runs.ts:20-54`) has these columns: `workspace_id` (not null), `agent_id` (FK, set null on delete), `pr_id`, `ran_at`, `model`, `duration_ms`, `tokens_in/out`, `cost_usd` (null = unknown, 0 = free), `cost_source` (`api`|`estimate`), `status`, `source` (`local`|`ci`), `findings_count`, `multi_agent_run_id`, `finished_at`.
- Indexes (`runs.ts:59-69`): `agent_runs_pr_idx`, `agent_runs_agent_idx`, `agent_runs_multi_agent_run_idx`, and a partial `agent_runs_done_agent_ran_idx(agent_id, ran_at DESC) WHERE status='done'`. None covers `workspace_id` or `ran_at` alone.
- `reviews.run_id` is a plain uuid with no FK and no unique constraint, indexed by `reviews_run_idx` (`reviews.ts:25,36-40`). `findings.review_id` is a FK with cascade and is indexed. `findings` has `kind`, `accepted_at` and `dismissed_at` (`reviews.ts:43-80`).
- Finding kinds: `finding`, `secret_leak`, `lethal_trifecta`, `phantom`, `hook` (`contracts/findings.ts:29-35`).
- In practice each run has one review: the only writer is `run-executor.ts:363-372`, and a failed local run writes no review. The schema does not enforce this.
- Workspace scope is applied as `eq(agentRuns.workspaceId, ws)` in the repository. `ws` comes from `getContext(container, req)` (`skills/repository.ts:318-325`).
- *Inference:* 10k runs are fine with no new index, provided the aggregation is done in SQL (`GROUP BY` / `FILTER`). The existing skill stats load every row into JS (`skills/repository.ts:268-296`), so do not copy that pattern. No `EXPLAIN` was run.

## Q2 CI runs (spec 014)
- `recordCiRun` (`ci/repository.ts:277-340`, with the insert at 315-332) writes `agent_runs` with `prId: null`, `source:'ci'`, `costUsd`, `durationMs`, `model` and `findingsCount`. It writes no `cost_source` and no `provider`.
- Status mapping (`ci/repository.ts:326`): `error` → `failed`; `passed` and `gate_failed` → `done`. CI runs are never `cancelled`.
- CI writes no reviews, findings or traces. For CI rows, `ran_at` is the GitHub run's `created_at` (`ci/service.ts:470`).
- The PR number for a CI run lives only in `ci_runs.pr_number`, reached through `ci_runs.agent_run_id` (`db/schema/ci.ts:62-84`). For local runs it comes from `pr_id` → `pull_requests.number`.
- `test/ci-run-isolation.it.test.ts` asserts that CI runs are excluded from skill stats and multi-agent estimates. SPEC-15 includes them, so do not reuse `windowedRuns`, which hard-codes `source='local'`.

## Q3 Contracts
- `AgentStats` is in `server/src/vendor/shared/contracts/observability.ts:165-190`. `AgentPerf`, `AgentPerfRow` and `PerfCostSegment` are in `contracts/productionize.ts:138-181`. `AgentPerfRow.trend` is findings-per-run.
- Neither contract has a period, previous-period values, the provenance split, the denominator, the Deleted row, hourly buckets or run-history rows.
- Nothing imports either contract outside its own file in server, client or mcp-server, and nothing references the `agentPerformance.json` namespace. They can be redefined freely.
- The two shared copies: `observability.ts` is identical in both. `productionize.ts` differs by one line (line 36, the `PluginAgent.provider` enum: the server copy has `openrouter`). Mirror edits by hand; never `cp` one copy over the other (root INSIGHTS 2026-09-17).
- The client may import only types from shared (`client/src/lib/shared-type-only-imports.test.ts`). Any Zod value, such as a period schema, must be duplicated in the client.

## Q4 Aggregation code to mirror
- `skills/stats.ts:14-27`: `acceptRate` = accepted ÷ (accepted + dismissed-not-accepted), or null when the denominator is 0. Accepted wins when a finding has both timestamps. It works on row pairs, not on SQL counts.
- The skills period filter is `gte(ranAt, since)` only, with no upper bound. SPEC-15 needs `[from, to)` plus the previous window.
- `pulls/status.ts:35-60` `rollupCost`: worst-wins provenance. It cannot produce the three-way split of M-4.
- `reviews/multi-agent.helpers.ts:165-215`: `runTotals` and `estimatesFrom`.
- `lastDoneRunsPerAgent` (`reviews/repository.ts:233`) is not bounded by period, and it probably filters local runs only (not opened).
- Client `formatCostUsd(value, source)` (`client/src/lib/format-cost.ts:19-30`) returns "—" for null and puts `~` before an estimate. Its precision is adaptive (4 dp below $0.01), while the spec's NFR says "to cents".
- Shared helper placement (*inference*): a pure `stats.ts` in the new module, or `modules/_shared/`. Leave `skills/stats.ts` as it is. `server/.dependency-cruiser.cjs` was not found.

## Q5 Server placement and routing
- `agents/routes.ts:88-234` has no `/stats` and no `/performance`. `IdParams` requires a uuid (`_shared/schemas.ts:12`).
- Modules are a static map in `modules/index.ts:7-19,34-53`. Precedent for one module serving another's path: `ci/routes.ts:25-60` serves `/agents/:id/ci/*` through `app.container.ci`.
- DI uses lazy getters in `platform/container.ts:113-155,253-263`. Modules reach other modules' data through those getters (`server/docs/architecture.md:93-96`).
- Recommendation (*inference*): a new `modules/agent-performance/` that owns both `GET /agents/performance` and `GET /agents/:id/stats` through one service, so AC-22 holds by construction.
- *Unverified:* find-my-way should rank the static `/agents/performance` above `/agents/:id` across plugins. A test must confirm it.
- `GET /runs/:id/trace` (`reviews/routes.ts:189-194`, `run.repo.ts:196-199`) is not workspace-filtered. This exposure already exists.
- Date binding: use the builder helpers, or `.toISOString()` with `::timestamptz` in raw `sql` (`date_trunc` buckets).

## Q6 Client inventory
- `app-shell/helpers.ts:37` already maps `/agent-performance`. There is no `client/src/app/agent-performance/` yet.
- `client/messages/en/agentPerformance.json` exists, unused and out of date. The namespace loader picks up every file (`i18n/request.ts:15-25`).
- `vendor/ui/nav.ts:50-60`: the GLOBAL section has `multi-agent` and `ci-runs`. Each earlier hand-edit carries a "Signed-off exception (spec NNN)" comment.
- AgentEditor: `TABS` in `AgentEditor/constants.ts:10-18` (`config, skills, context, evals, versions, ci`). Tab bodies switch in `AgentEditor.tsx:38-46`. `agents/[id]/page.tsx:16` builds `VALID_TABS` from `TABS` and reads `?tab=`. `goTab` uses `router.replace` with `URLSearchParams`. The not-found state is at `page.tsx:60-72`.
- Hooks are React Query, one file per domain in `client/src/lib/hooks/*.ts`, behind the `hooks/index.ts` barrel. Keys are domain-first.
- Charts in `vendor/ui/charts`: `Sparkline({data,color,w,h})`, `LineChart`, `Donut` (Recharts, `{label,value,color}`, `formatValue`), `BarRow`, `MetricCard`. The ring is `vendor/ui/primitives/CircularScore`.
- **`Sparkline` with one point divides 0/0 and gives NaN** (`Sparkline.tsx:15-21`). The file is vendored and must not be edited, so guard length < 2 in a client wrapper.
- URL-state pattern: `page.tsx` wraps the view in `<Suspense fallback={null}>`, and the view uses `useSearchParams` + `router.replace` (`app/ci-runs/page.tsx`, `CiRunsView.tsx:60-85`, `eval/[agentId]` with `?period=`). No parser exists yet for `1d`, `30d` or custom from/to.

## Q7 Run trace
- `components/run-trace-drawer/RunTraceDrawer.tsx` uses `useRunTrace(runId)` → `GET /runs/:id/trace`. It is used from the PR page (`?trace=`) and the multi-agent ResultsPage; CI Runs has no trace entry.
- A CI run never has a trace (the route returns 404). With no `endedAt`, the drawer polls for 30 s showing "Trace is written when the run completes", then shows "No trace available yet." That differs from AC-24, so the Stats tab must handle CI rows itself: show the AC-24 text, or pass a flag to the drawer.

## Q8 Tests
- `.it` helpers: `test/helpers/pg.ts` (testcontainers pgvector + migrations), `config.ts` (`isolatedTestConfig`), `runs.ts`, `llm-stubs.ts`. There is no shared seeder for runs, reviews and findings. Tests insert rows by hand (`ci-run-isolation.it.test.ts:46-101`, `eval.it.test.ts:55-85` `addRun`, `dismissedAt` in `brief.it.test.ts:115`).
- Unit templates: `test/skills-stats.test.ts`, `pulls-status.test.ts`, `multi-agent-helpers.test.ts`. Integration templates: `skills.it.test.ts`, `run-cost.it.test.ts`, `ci-ingest.it.test.ts`.
- Client templates: `EvalDashboardView.test.tsx`, `AgentEvalDetail.test.tsx` (`?period=`), `CiRunsView.test.tsx`, `agents/[id]/page.test.tsx`, `AgentEditor.test.tsx`, `RunCostBadge.test.tsx`.

## Not established
- Whether a `(workspace_id, ran_at)` index is needed (needs `EXPLAIN`).
- Static vs param route priority across plugins (needs a test).
- The enforced dependency-cruiser rules. The body of `lastDoneRunsPerAgent`. The props of `MetricCard`, `CircularScore` and `Donut`, and whether Recharts renders in jsdom. The `agents` namespace tab labels.
