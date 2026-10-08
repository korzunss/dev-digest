# Repo research — SPEC-10 PR Brief (plan 28)

Researcher run, 2026-10-06, repo mode. Condensed by the main session; evidence paths kept.

## Spec tensions found (need a planner decision)
1. **"Exactly one call" vs re-ask (AC-3 vs AC-7).** Adapters re-ask on Zod failure by default (`maxRetries ?? 2` → up to 3 round trips; `reviewer-core/src/llm/openrouter.ts:66-175`, `server/src/adapters/llm/openai.ts:90-144`). Onboarding passes `maxRetries:0` for its "one call" AC. OpenAI adapter also wraps transport errors in `withRetry`.
2. **AC-9 "run-log message text".** Only `run-executor` builds a `RunLogger` (bound to an `agent_runs` id). Intent/onboarding log one pino info line (`intent: classified (... tokens_in=, cost=, duration_ms=)`, `onboarding: provider/model tokens a/b cost c`). No `agent_runs`/`run_traces` for non-review features.
3. **`pr_brief`** is `{pr_id PK → pull_requests.id cascade, json jsonb not null}` (`server/src/db/schema/reviews.ts:95-100`); no `generated_at` column → keep it in JSON (no migration). PK allows `onConflictDoUpdate` upsert (precedent `onboarding/repository.ts:70-76`). Nothing reads/writes it today.
4. **Navigation.** No scroll-to-file/line, no DOM ids on `FileCard`/`CodeLine`; group open state (`SmartDiffGroup.tsx`) and file open state (`FileCard.tsx:44`) are local `useState`. Existing target pattern: `ReviewRunAccordion` `targetRunId` + `targetNonce` + `scrollIntoView` on id `review-run-<runId>`.

## Q1 LLM call
- `StructuredRequest`/`StructuredResult` in `server/src/vendor/shared/adapters.ts`: request `model, schema, schemaName, messages, temperature, maxTokens, timeoutMs, maxRetries, sessionId, requireParameters, routing, signal, onUsage`; result `data, model, tokensIn, tokensOut, costUsd, costSource?, servedBy?, raw, attempts`.
- `finish_reason==='length'` → `LlmOutputTruncatedError`, no re-ask.
- Onboarding call: `maxRetries:0, temperature:0, maxTokens:4000, timeoutMs 90s, requireParameters, signal: AbortSignal.timeout`. Intent: `maxRetries:1`.
- `resolveFeatureModel(container, ws, id)` (`settings/feature-models.ts:51-57`); `risk_brief` default `openai`/`gpt-4.1` (`vendor/shared/contracts/platform.ts:69-75`).
- Missing key: `container.llm(id)` throws `ConfigError` (`platform/container.ts:278-310`, HTTP 500 `config_error`). Onboarding maps it to `'no_key'` via `classifyGenerationError` (`onboarding/helpers.ts:294`).
- Test of call count: `MockLLMProvider.calls` (`onboarding.it.test.ts:295`).

## Q2 Tokenizer
`Tokenizer { count(text) }` (`server/src/adapters/tokenizer/index.ts`), `TiktokenTokenizer` cl100k_base with `ceil(chars/4)` fallback; `container.tokenizer` (`container.ts:160-163`), overridable via `overrides.tokenizer`. One encoder for all providers (approximate for non-OpenAI). No existing "trim groups to N tokens" helper.

## Q3 Inputs
- (a) Intent: `IntentService.get(ws, prId)` → `{intent|null, pr_head_sha}`; staleness `staleness(record, pull)` in `intent/helpers.ts:~236` (`head_moved` / `description_changed`), derived at read time, no model call.
- (b) Blast: `BlastService.getBlast(ws, prId, log)` (`container.blast`, `container.ts:190`), computed per request from the repo index, no LLM/forge call; degraded ripgrep fallback with `degraded`+`reason`. Callers carry `file`, `line`.
- (c) Files: `pr_files {id, prId, path, additions, deletions, patch}` (`db/schema/pulls.ts:38-47`); `patch` may be null. `headersFromPatch(patch)` pure helper in `intent/helpers.ts:201` (not shared). `pr_files` refreshed only by `GET /pulls/:id` (delete+insert) when forge reachable.
- (d) Smart Diff: `SmartDiffService.get(ws, prId)` (`container.smartDiff`), deterministic, no LLM.
- (e) Description: `pull_requests.body` (`db/schema/pulls.ts:28`). Linked issue: intent does `extractIntentLinks(body, …)` then `forge(ref).getIssue(...)` under `withTimeout(SOURCE_TIMEOUT_MS)` with `classifyFailure()`; stored intent keeps only refs, not the body → brief must fetch (network) or mark missing.
- (f) Latest review: `reviews` (`db/schema/reviews.ts:18-39`, `kind, verdict, summary, score, model, createdAt`) + `findings` (`:41-65`, `file, startLine, endLine, severity, title, dismissedAt`); rows inserted only on success (`run-executor.ts:351`). `SmartDiffRepository.latestReviewFindings` does the lookup but returns only `file, startLine, dismissedAt`.
- (g) Attached docs: `AgentsRepository.listContextDocs(agentId)` (`agents/repository.ts:280`), `inheritedContextDocs(agentId)` (`:301`), merge `mergeContextPaths` (`reviews/helpers.ts:122`), read `container.context.readDocsForRun(repo, paths)` (`context/service.ts:168`) → `{docs, skipped}`; `MAX_DOC_BYTES` 512 KB. Glue private in `run-executor.ts:522 buildContextDocs`. `agents.enabled` column exists (`db/schema/agents.ts:41`); a list-enabled-agents helper not verified.

## Q4 Head SHA
`pull_requests.head_sha` (`db/schema/pulls.ts:20`), updated by polling upsert, `GET /pulls/:id`, list backfill. Intent stores its own `head_sha` and derives `stale` server-side on GET.

## Q5 Concurrency / sync
Onboarding: in-process `Set` guard, check-and-add before first `await`, `finally` delete; tests `onboarding.it.test.ts:378` (two presses one call), `:401` (released after failure). Intent: no lock, only route rate limit 10/min. Both POSTs are synchronous (await the call, return 200). Onboarding POST always 200 with view + failure reason (client `api.post` throws on non-2xx).

## Q7 Client
- Tabs: `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` — `tab = search.get("tab") ?? "overview"`, `setParam` via `router.replace`; ids `overview`, `findings`, `diff`. Multi-key `setParams` exists.
- `OverviewTab.tsx` props `{prId, prHeadSha, prBody, repo}`; columns with `IntentCard` (`usePrIntent`, key `["pr-intent", prId]`) and `BlastRadiusCard` (`useBlastRadius(prId, headSha)`, `lib/hooks/blast.ts:12`), then Description.
- `VerdictBanner.tsx` props `{verdict, summary, score, findingsCount, blockers, agentName?}`, used only in `ReviewRunAccordion.tsx:165`. Data: `usePrReviews(prId)` (`lib/hooks/reviews.ts:51`, `GET /pulls/:id/reviews`, `ReviewRecord` in `vendor/shared/contracts/review-api.ts:29`).
- `DiffTab.tsx`: order `smart` (default)/`original`; `SmartDiffGroup` per role (docs/boilerplate collapsed, `DiffTab/constants.ts`); `DiffViewer` → `FileCard` (auto-expand ≤ `AUTO_EXPAND_MAX_LINES`) → `CodeLine` (plain div, `ln.newNo ?? ln.oldNo`).

## Q8 Module conventions
- Register in `server/src/modules/index.ts`. DI: lazy getters with narrow `*ServiceDeps` (`intent`, `smartDiff`, `blast`, `context`, `container.ts:173-205`) or onboarding style (`new OnboardingService(app.container)`).
- Route conventions (`intent/routes.ts`): `params: IdParams`, response schema, `getContext`, `NotFoundError`, `config.rateLimit {max:10, timeWindow:'1 minute'}` on paid POST; a POST with no body must not declare a body schema (422).
- `.it` pattern: `server/test/intent.it.test.ts` — `startPg()`, `seed(db)`, `buildApp({config: isolatedTestConfig(), db, overrides: {git, llm: {openai: new MockLLMProvider(...)}}})`; mock all resolvable providers (default `risk_brief` = openai). Onboarding `.it` covers one call (`:295`), double press (`:378`), no key (`:441`), failed regenerate keeps row (`:467`), regenerate replaces (`:485`).

## Not established
Per-provider tokenizer accuracy; Anthropic adapter re-ask; blast latency on large repos; a list-enabled-agents helper; whether the brief should refresh `pr_files` via the forge first; client unit-test conventions for OverviewTab; GitLab `getIssue`.
