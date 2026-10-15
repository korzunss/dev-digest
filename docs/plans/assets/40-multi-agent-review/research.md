# Repo research — SPEC-13 multi-agent review (planning input)

Source: `researcher` agent, repo mode, 2026-10-14. Saved by the main session
for the `implementation-planner`. Paths are repo-relative. "inference" marks a
conclusion read from code, not run.

## Q1. Concurrency safety of the run executor

- Today `executeRuns` is strictly sequential:
  `for (const { agent, runId } of jobs) { await this.runOneAgent(...) }`
  (`server/src/modules/reviews/run-executor.ts:196-223`).
- Shared state and whether it races if `runOneAgent` runs concurrently:
  - `diff`, `intent`, `repoRules`, `changedPaths`: loaded once (`:126-194`),
    passed read-only (`:203`) — safe (inference).
  - `RunLogger`: one over all run ids (`:96`); `forRun(runId)` narrows per agent
    (`run-logger.ts:46-48`) — safe.
  - `RunBus`: per-run maps keyed by runId (`server/src/platform/sse.ts:19-25`) — safe.
  - Cancel: one `AbortController` per run (`sse.ts:39-48`), read at
    `run-executor.ts:295`. `signalForAll` aborts pre-work only when every run is
    cancelled (`sse.ts:52-63`).
  - Git: only the shared pre-work calls git (`diffCommits` under `KeyedMutex`,
    `adapters/git/simple-git.ts:188`, `clone-lock.ts`). Per-agent work is
    read-only file/ripgrep access (`repo-intel/service.ts:580-`,
    `context/service.ts:168-`) — no git-lock contention (inference).
  - LLM provider: cached per id in `llmCache` (`container.ts:437-445`); the
    get-or-build awaits between check and set, so two concurrent first calls may
    build two providers (harmless). OpenRouter provider holds no per-request
    state (`reviewer-core/src/llm/openrouter.ts:48-62`). Anthropic/OpenAI
    adapters and the tokenizer not checked.
  - Retry/timeouts per call (`reviewer-core/src/review/llm-call.ts:129`,
    `REVIEW_CALL_DEADLINE_MS`).
  - `priceBook`: shared cache with a `refreshing` guard — safe.
  - DB: pool `max: 10` (`db/client.ts:21`); writes per run id; `markReviewed`
    writes the same value from each agent (`run-executor.ts:367`) — safe.
  - `recordRunSkills`: `onConflictDoNothing` — safe.
- Failure isolation: `runOneAgent` persists failed/cancelled state + trace,
  completes the bus, then rethrows (`:441-464`); the caller catches and logs
  (`:214-222`). A concurrent wrapper must still catch per task.
- Pre-work failure → `failAll` marks every job failed (`:106-124`, `:147-151`).
- p-queue: `server/package.json:43` `"p-queue": "^8.0.1"`, lock `8.1.1`; used in
  `platform/jobs.ts:1,26,32` (`new PQueue({ concurrency })`, `add`, `onIdle`) and
  `repo-intel/pipeline/full.ts:25`. `JobRunner` adds a jobs row, 120 s timeout
  and 2 retries — unsuitable as-is; a local `PQueue({ concurrency: 4 })` needs
  no new dependency.

## Q2. Run lifecycle, cancel, write order

- Reaper: `app.ts:~70-85` → `reapStaleRunningRuns` sets `failed` where
  `running`, no error text (`run.repo.ts:106-113`); assumes one API instance.
- Cancel: `POST /runs/:id/cancel` → `service.cancelRun` (`service.ts:86-91`):
  info event → `runBus.cancel` (abort) → `cancelRunIfRunning` (DB `cancelled`,
  `run.repo.ts:95-102`, not workspace-scoped) → `runBus.complete`. The agent
  sees the abort via `signal` (`run-executor.ts:332`) and `checkCancelled`
  (`:340-344`); its catch then writes `cancelled` + `Cancelled by user`, then the
  trace. Test: `test/run-cancel.it.test.ts:~120-140`.
- Success order: `insertReview` (`:351`) → `insertFindings` (`:362`) →
  `markReviewed` (`:367`) → `completeAgentRun('done')` (`:376`, terminal) →
  `saveRunTrace` (`:437`) → `runBus.complete` (`:438`). Failure:
  `completeAgentRun` → `saveRunTrace` → `complete`, each `.catch(() => undefined)`.
- The trace is written after the run is terminal; on cancel the bus completes
  before the trace is saved → a real "ended, trace pending" window.

## Q3. Data assembly for a MultiAgentRun read

- `agent_runs.id` = `reviews.run_id` (plain uuid, no FK, no index;
  `schema/reviews.ts:28`); `deleteAgentRun` deletes reviews explicitly
  (`run.repo.ts:72-92`). `findings.review_id` → reviews, cascade, indexed.
- Reusable: `reviewRepo.reviewsForPull` (2 queries, JS filter;
  `review.repo.ts:58-74`); `listRunsForPull` → `RunSummary` with status, error,
  duration, tokens, grounding, score, blockers, cost, left-joined agent name
  (`run.repo.ts:40-70`); `activeRunsForPull`. Nothing loads by multi-agent run
  id or filters reviews by `run_id`.
- `multi_agent_runs`: `id`, `workspace_id`, `pr_id`, `ran_at`
  (`schema/runs.ts:91-100`); no link from `agent_runs`; unused.
- Contract gaps (`contracts/observability.ts`): `AgentColumnFinding` has only
  id, severity, category, title, file, start_line, kind (`:23-31`);
  `AgentColumn.status` lacks `cancelled` (`:42`); `ConflictTake.note` required;
  `Conflict` has one `line`; `MultiAgentRun` has no estimate or group fields.
- `FindingRecord = Finding.extend({review_id, accepted_at, dismissed_at})`
  (`review-api.ts:21-25`); `Finding` has `end_line`, `rationale`, `suggestion`,
  `confidence` (`findings.ts:59-74`) — all in the `findings` table. `FindingCard`
  and `TurnIntoEvalCase` take a whole `FindingRecord` → least-work shape for
  columns.

## Q4. Agent deletion and versions

- `agent_runs.agent_id` → `agents.id` `onDelete: 'set null'` (`schema/runs.ts:24`);
  `reviews.agent_id` no FK (dangles). Listing gives `agent_name: null` after
  deletion (`run.repo.ts:46-54`).
- The trace persists `config.agent` (name), `config.version`, provider, model
  (`run-executor.ts:393-401`; `trace.ts:126-133`). `agent_runs` keeps provider
  and model only. `agent_versions` cascades on agent delete
  (`schema/agents.ts:47-60`).
- So a "Deleted agent" column has provider/model from the row; name/version only
  from the trace, if written.

## Q5. Contracts: server vs client copy

- `diff -rq`: `observability.ts`, `findings.ts`, `review-api.ts`, `index.ts`
  identical; `platform.ts` and `trace.ts` differ in comments only;
  `adapters.ts`, `eval-ci.ts`, `productionize.ts` differ in substance (not
  touched by this feature).
- Client hooks import types only (`client/src/lib/hooks/reviews.ts:9-16`,
  `hooks/trace.ts:10`); guarded by `src/lib/shared-type-only-imports.test.ts`.
- The existing `POST /pulls/:id/review` has no `body` schema and parses
  `RunRequest.parse(req.body ?? {})` in the handler (`routes.ts:33`) — the
  bodyless-POST pattern the security gotcha warns about.

## Q6. Client reuse

- `RunTraceDrawer` props `runId, agentName?, prNumber?, findings?, running?,
  onClose` (`RunTraceDrawer.tsx:19-29`); no PR context or route params. The PR
  page parses `?trace=` (`page.tsx:76`), opens the drawer without `running`
  (`:243-251`), writes the param via `router.replace` (`:~88-95`).
- Trace pending: the Trace tab uses `useRunTrace(runId, !stillRunning)` and shows
  `tracePending` only while running (`RunTraceDrawer.tsx:92-95`); `useRunTrace`
  has `retry: false`, no polling → an ended run without a trace shows "noTrace"
  and never re-fetches. AC-54 needs a drawer change.
- `useRunEvents(runIds)`: one merged event array and a single `running` flag;
  one `EventSource` per id; `running` false only when all close; `notify.error`
  per error event (`hooks/reviews.ts:191-239`). It cannot give per-run status.
- Query keys: `["run-trace", runId]`, `["pr-runs", prId]` (4 s polling while
  running), `["pr-active-runs", prId]`, `["reviews", prId]`.
  `useRefreshOnRunsSettled` invalidates on active count → 0 (`:172-184`);
  `useFindingAction` invalidates `["reviews", prId]` only when `prId` passed
  (`:157-159`).
- `FindingCard` props `f: FindingRecord, onAction, repo, headSha, pending`;
  imports `TurnIntoEvalCase`, `forgeBlobUrl`. `FindingsPanel` wires
  `useFindingAction` and window j/k/a/d keydown handlers.
- `RunReviewDropdown` uses `useAgents`, `useRunReview`, `useRouter`; takes
  `prId`; vendored `DropdownItemDef` has no checkbox row → the multi-select
  picker needs a different component.
- `RunStatus`: pure SSE log component (`runIds`, `onDone`).
- Placement: `client/AGENTS.md` / `docs/ui-architecture.md` §2 —
  `_components/<Name>/` is "used by exactly one route"; cross-route components go
  in `src/components/<kebab>/`. Precedent for cross-route relative imports
  exists (`app/skills/[id]/.../StatsTab.tsx:20`,
  `app/agents/[id]/.../SkillsTab.tsx:19`) but conflicts with the written rule.
- `activeKeyFor` already maps `/multi-agent` (`components/app-shell/helpers.ts:28`).

## Q7. Test infrastructure

- `MockLLMProvider` (`server/src/adapters/mocks.ts:72-`): same fixture, no
  delay, no per-call failure.
- `server/test/helpers/llm-stubs.ts`: `ThrowingLLMProvider`, `DeferredLLMProvider`
  (pending until `release`/`fail`, `pendingCount`, rejects on abort),
  `ScriptedLLMProvider` (picks a `Review` by system-prompt substring). Together
  they can prove concurrency (`pendingCount ≥ 2` before release) and per-agent
  failure isolation; no ready per-agent failure combinator.
- `test/run-cancel.it.test.ts`: inline provider + `POST /runs/:id/cancel` —
  template for a per-agent cancel test.
- `isolatedTestConfig()`; `waitForPrRuns(db, prId, {expected, timeoutMs})` returns
  silently on timeout, does not wait for traces.
- Existing `.it`: `reviews.it.test.ts` (`:164` map-reduce + grounding, `:276`
  SSE, `:302` run-all), `run-cancel`, `run-cost`, `review-repo-rules`,
  `intent-review`. No unit test of `ReviewRunExecutor` found.
- Rate limit: per-route `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }`
  (`reviews/routes.ts:29`; same in `intent`, `brief`, `eval` routes); the plugin
  is registered only when `nodeEnv !== 'test'` (`app.ts:103-105`).

## Q8. Trace content, cost, estimate

- `RunTrace.stats`: `duration_ms`, `tokens_in`, `tokens_out`, `findings`,
  `grounding` (string like `"3/4 passed"`), nullish `cost_usd`, `cost_source`
  (`trace.ts:97-110`). `TraceBody` renders them (`TraceBody.tsx:62-67`).
- Per-finding grounding decisions are NOT persisted in the trace: the engine
  returns `dropped` (finding + reason) (`reviewer-core/src/grounding.ts`,
  `review/run.ts:526`) and logs "grounding dropped …" (`run.ts:486-488`); only
  the summary string and log lines are stored. AC-57's grounding-gate detail is
  the summary string unless a trace field is added.
- Cost: written by `completeAgentRun` (`run-executor.ts:346,376-391`) and into
  `trace.stats` (`:402-410`); failed/cancelled → `null`. Null once any call
  can't be priced (`reviewer-core/src/review/run.ts:243,534`;
  `adapters/llm/pricing.ts:37-41`; `price-book.ts:34-39`).
- Estimates: `agent_runs_agent_idx` on `agent_id`; no composite index; no
  median/percentile query exists. Closest pattern: `GET /skills/:id/stats`
  folding rows in JS (`skills/repository.ts:207-324`). Simplest mirror: one query
  over `agent_runs` (workspace, `status='done'`, agent ids, `ran_at desc`), top 5
  per agent and median in JS. Latest review summary per agent needs `reviews`,
  which has no `agent_id` index.

## Could not establish

- Whether `FindingCard` can hide Learn/Reply (read to line 80 only).
- `vendor/ui/nav.ts` past line 50 and the NAV key `activeKeyFor` expects.
- Client test patterns for SSE hooks.
- Concurrency safety of the tokenizer and the Anthropic/OpenAI adapters.
- `agent_versions` write/read path.
- Existing unit tests of `ReviewRunExecutor`.
- `GET /agents` shape for `enabled` and last-verdict data.
- Installed `p-queue` on disk (`server/node_modules` absent).
- Runtime concurrency behaviour (all race conclusions from reading code).
