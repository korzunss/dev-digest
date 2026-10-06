# Development Plan: PR Brief (risk brief)
Status: done
Save as: docs/plans/28-pr-brief.md
Execution: multi-agent
Spec: specs/010-pr-brief.md

## Spec traceability
| Spec AC | Covered by |
|---|---|
| AC-1 | S14, T11 |
| AC-2 | S13, T10 |
| AC-3 | S7, T6, T7 |
| AC-4 | S7, S9, S13, T10 |
| AC-5 | S7, T6, T7 |
| AC-6 | S5, S7, S13, T7, T10 |
| AC-7 | S7, S13, T6, T7, T10 |
| AC-8 | S7, S13, T6, T7, T10 |
| AC-9 | S7, T6 |
| AC-10 | S3, T2 |
| AC-11 | S3, T3 |
| AC-12 | S3, T3 |
| AC-13 | S3, S13, S22, S23, T3, T10, T15 |
| AC-14 | S7, T6 |
| AC-15 | S7, T6 |
| AC-16 | S7, T6 |
| AC-17 | S7, T6 |
| AC-18 | S7, T6 |
| AC-19 | S5, S7, T6, T7 |
| AC-20 | S7, T6 |
| AC-21 | S6, S7, T5, T6 |
| AC-22 | S13, S20, S21, S22, S23, T10, T15 |
| AC-23 | S4, T4 |
| AC-24 | S2, S4, T1, T4 |
| AC-25 | S4, T4 |
| AC-26 | S4, T4 |
| AC-27 | S4, S13, T4, T10 |
| AC-28 | S13, S20, T10 |
| AC-29 | S13, T10 |
| AC-30 | S13, S18, S20, T10 |
| AC-31 | S13, T10 |
| AC-32 | S13, S19, S20, T10, T13 |
| AC-33 | S13, S20, T10 |
| AC-34 | S13, S14, T10, T11 |
| AC-35 | S12, S13 (verdict banner exempt) |
| AC-36 | S10, S11, S14, T8, T9 |
| AC-37 | S10, S11, S14, T8, T9 |
| AC-38 | S13, T10 |
| AC-39 | S10, T8 |
| AC-40 | S7, S8, T7 |
| AC-41 | S1, S7, T7 |
| AC-42 | S7, S13, T7, T10 |
| AC-43 | S8, S9, T7, T10 |
| AC-44 | S3, S7, T3, T6 |
| AC-45 | S1, S3, S7, S13, T3, T6, T7, T10 |
| AC-46 | S21, S23, S24, T10, T14 (reversed in G7; S19/S20 placement superseded) |
| AC-47 | S20, S23, T10 |
| AC-48 | S17, S18, S19, S20, T12, T13, T10 |
| AC-49 | S15, S16, T6, T7 |
| AC-50 | S17, S20, T12, T10 |

## Decisions needed
None open — see *Decisions recorded*.

## Decisions recorded
User answers, 2026-10-06 (main session):
- TQ1–TQ5: defaults accepted — `head_sha`/`generated_at`/`model` live in `pr_brief.json` (no migration, upsert by `pr_id`); linked issue fetched live like intent, failure → `missing`; stored `pr_files` used without refresh; over budget → trim items from the end within a group, each cut recorded as `truncated: <input>`; GET returns `generating: boolean`.
- GAP1–GAP3: close per REC1–REC3 via spec-creator — `maxRetries: 0` (a validation failure is a failure; AC-7 reworded); AC-9 = one pino line `brief: <provider>/<model> tokens a/b cost c duration_ms d`; "latest review" = newest `kind='review'` row from any agent, non-dismissed findings only.
- REC4 (reuse `AgentsRepository.listEnabled`) and REC5 (POST rate limit 10/min): accepted.
- D1–D7: option A each.
- D8: multi-agent.
- Pass-2 risks (user, 2026-10-06): reuse `VerdictBanner` as-is with its `prReview` labels — AC-35 to be clarified in the spec as covering the PR Brief's own blocks only; planner assumptions accepted — still over 8,000 tokens after all trims → `failed` with no model call, model-call timeout 90 s, output cap 2,000 tokens.
- Cross-model review: Sonnet 5.5 + Fable 5.1, read-only, before plan approval (plan 26 precedent).
- Cross-model review (`docs/plans/assets/28-pr-brief/cross-model-review.md`), user 2026-10-06: apply all plan fixes Y1–Y10, Y12, X1, X2, X4–X6, X8–X13, X15 (Y11 no change); Y6/X5 combined — target applies on first render and once per new nonce (per-instance ref). X3: cap blast arrays at collection and add changed symbols to AC-12's trim order after callers, cut recorded as `truncated: blast_radius`, budget failure gets its own log reason [spec]. X7: AC-35 amended to exempt the reused verdict banner [spec]. X11: a fixed schema reserve is subtracted from the 8,000 budget [spec]. X14: Intent/Blast columns render inside the PR Brief block (design 22); AC-34 unchanged.
- Planner assumptions after the cross-model round (user, 2026-10-06): blast caps 30 changed symbols / 20 endpoints / 20 crons; 800-token schema reserve; PR description cut by binary search on length — accepted.
- Design conformance (user, 2026-10-06, after a live check vs designs 22/36/37): summary inside the verdict banner; both costs under PR SCORE — "Review" (latest review run) and "Brief" (the brief call, stored as `usage`); Risk areas inside the Intent card; Review focus as a full-width card. Run through the pipeline (spec amendment → G5/G6), not as a direct edit.

## Prerequisites
Docker for the `.it` tier. No new dependencies.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S4 | shared contract + client mirror · server `_shared` + `brief` pure helpers | — | new exports of S1–S4 and their signatures |
| G2 | S5–S8 | server repository · intent · brief service · routes/DI | G1 | `PrBriefView` as served, `failure` values |
| G3 | S9–S11 | client hooks · `diff-viewer` · DiffTab | G1 | `usePrBrief`/`useGeneratePrBrief`; `DiffTarget` + `target` props |
| G4 | S12–S14 | client i18n · PrBriefBlock · OverviewTab + page | G3 | — |
| G5 | S15–S16 | design conformance: shared contract (+ mirror) · brief service usage | G4 | `BriefUsage`, `PrBrief.usage?` |
| G6 | S17–S20 | design conformance: client format helper · i18n · banner/card slots · PrBriefBlock layout | G5 | — |
| G7 | S21–S24 | coverage round (client only): i18n · CoverageBlock · Risk-areas card · IntentCard slot removal | G6 | — |

G2 and G3 share no package or file and may run in parallel after G1. G5/G6 implement the design-conformance amendment (spec 010 Changelog, designs 22/36/37); G1–G4 are done. `…` below = `client/src/app/repos/[repoId]/pulls/[number]/_components`.

## Steps

### S1 — Reshape the PR Brief contract and mirror it  [Contract]
- **Files:** `server/src/vendor/shared/contracts/brief.ts` (modify) · `client/src/vendor/shared/contracts/brief.ts` (modify, same edit)
- **Change:** add `BriefInput`, `BriefInputStatus`, `BriefMissingInput`, `ReviewFocusItem`, `BriefModel`, `PrBriefModelOutput`, `BriefFailureReason` (incl. `over_budget`), `PrBriefView`; replace `PrBrief` — Design notes → *Contract*. `Risk`/`Risks` unchanged.
- **Layer / why here:** ports; shared first, then the targeted mirror (`CLAUDE.md`).
- **Skills to apply:** `zod`, `typescript-expert`, `onion-architecture`
- **Practices:** schema + `z.infer` type under one name; `.nullable()` for absent values, `.optional()` only on the 3 legacy fields; no refinements in `PrBriefModelOutput`; mirror edits this one file only.
- **Known gotchas:** root `INSIGHTS.md` "the two vendored `shared` copies are not actually in sync"; "a reviewer-core input-type change breaks server tests…" (run the server unit suite).
- **Done when:** `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` prints nothing · `cd server && pnpm typecheck` · `cd client && pnpm typecheck`

### S2 — Move hunk-header and context-path helpers to `_shared`
- **Files:** `server/src/modules/_shared/diff-hunks.ts` (create) · `server/src/modules/_shared/context-paths.ts` (create) · `server/src/modules/intent/helpers.ts` (modify) · `server/src/modules/reviews/helpers.ts` (modify) · `server/test/diff-hunks.test.ts` (create)
- **Change:** move `headersFromPatch` + `HUNK_HEADER_RE` (`intent/helpers.ts:196-212`) to `diff-hunks.ts`; add `LineRange` and `changedLineRanges(patch)` (`+c,d` → `{c, c+d-1}`, `d` default 1, `d=0` → none). Move `mergeContextPaths` (`reviews/helpers.ts:118-124`) to `context-paths.ts`. Old files re-export.
- **Layer / why here:** D3-A/D4-A — pure helpers for two modules, no module→module edge.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** pure, no I/O; callers and tests unchanged.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/diff-hunks.test.ts test/intent-helpers.test.ts test/context-merge.test.ts` passes (T1: `+10,3`→`[{10,12}]`, `+5,0`→`[]`, `+7`→`[{7,7}]`, null→`[]`)

### S3 — Brief types, prompt, blast caps and token budget (pure)
- **Files:** `server/src/modules/brief/constants.ts` · `server/src/modules/brief/types.ts` · `server/src/modules/brief/prompt.ts` · `server/src/modules/brief/budget.ts` · `server/test/brief-prompt.test.ts` · `server/test/brief-budget.test.ts` (all create)
- **Change:** constants, `BriefFacts`, the structural dep interfaces (X6), `buildBriefMessages`, `capBlast`, `fitToBudget` with schema reserve, `BriefBudgetError` — Design notes → *Facts & budget*, *Dep interfaces*.
- **Layer / why here:** pure module logic.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:** facts hold hunk ranges only — no patch bodies, finding rationale or suggestion (AC-10); untrusted text framed as data; tokenizer injected; `types.ts` imports types only (shared contracts, `db/rows`, `./repository.js`), never a service class.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/brief-prompt.test.ts test/brief-budget.test.ts` passes (T2, T3 — Design notes → *Unit cases*)

### S4 — Output grounding and error classification (pure)
- **Files:** `server/src/modules/brief/grounding.ts` (create) · `server/src/modules/brief/helpers.ts` (create) · `server/test/brief-grounding.test.ts` (create)
- **Change:** `normaliseRef`, `groundBrief(output, ctx)`, `groundingContext(files, blast)`, `classifyBriefError(err) → 'no_key'|'over_budget'|'failed'` — Design notes → *Grounding*.
- **Layer / why here:** pure validation of untrusted model output.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `zod`, `security`
- **Practices:** model paths/lines never trusted; normalised paths must still be members of the allowed set; invented items dropped silently.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/brief-grounding.test.ts` passes (T4) · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` passes

### S5 — Brief repository
- **Files:** `server/src/modules/brief/repository.ts` (create)
- **Change:** `BriefRepository(db)` + `export type BriefRepoRow`: `getPull(ws, prId) → {pull, repo}` (as `intent/repository.ts:51-61`); `getPrFiles(prId)` (path, additions, deletions, patch); `latestReview(prId) → {verdict, score, findings: {file, startLine, severity, title}[]}|undefined` — newest `kind='review'`, `dismissedAt IS NULL` (as `smart-diff/repository.ts:39-54`); `getBrief(prId)`; `upsertBrief(prId, json)` via `onConflictDoUpdate` (as `onboarding/repository.ts:70-77`).
- **Layer / why here:** infrastructure — the only brief file using `db/schema`/`drizzle-orm`.
- **Skills to apply:** `drizzle-orm-patterns`, `onion-architecture`, `typescript-expert`
- **Practices:** select only listed columns (never `rationale`/`suggestion`); scope through the PR row; no migration.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` (behaviour in T7)

### S6 — `IntentService.readLinkedIssues`
- **Files:** `server/src/modules/intent/service.ts` (modify) · `server/test/intent-service.test.ts` (modify)
- **Change:** extract link extraction + the issue loop (`intent/service.ts:233-284`, forge-unreachable branch included) into public `readLinkedIssues(pull, repo, signal?) → {issues: {ref,title,body}[], failed: {ref, reason}[], links}`; `runClassification` reuses `links` for its docs/external loops and maps the rest into its arrays unchanged.
- **Layer / why here:** application; brief reaches it via the container (onion rule 6).
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:** classification behaviour unchanged; reasons stay the three classes, never `err.message`.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/intent-service.test.ts test/intent.it.test.ts` passes (T5: 404 issue → `failed: [{ref, reason:'not_found'}]`; forge factory rejects → every issue `reason:'unreachable'`)

### S7 — BriefService
- **Files:** `server/src/modules/brief/service.ts` (create) · `server/test/brief-service.test.ts` (create)
- **Change:** `BriefService(deps: BriefServiceDeps)` with `getView` and `generate(ws, prId, log: BriefLogger)` — Design notes → *Generation flow*.
- **Layer / why here:** application orchestration; deps are structural interfaces from `types.ts` (D2-A, X6).
- **Skills to apply:** `onion-architecture`, `fastify-best-practices`, `zod`, `typescript-expert`, `security`
- **Practices:** no drizzle, adapter or other-module service import; `safeParse` stored JSON; guard added before the first `await`; `maxRetries: 0`; `timeoutMs` = signal deadline = `BRIEF_LLM_TIMEOUT_MS`; no content in logs; `head_sha` captured before the call.
- **Known gotchas:** `server/insights/gotchas.md` → Run log (only `msg` is kept — put model/tokens/cost/duration in the message).
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/brief-service.test.ts` passes (T6 — Design notes → *Unit cases*)

### S8 — Routes, DI getter, registration
- **Files:** `server/src/modules/brief/routes.ts` (create) · `server/src/platform/container.ts` (modify) · `server/src/modules/index.ts` (modify) · `server/test/brief.it.test.ts` (create)
- **Change:** `GET` and `POST /pulls/:id/brief` → `PrBriefView` (404 only for unknown PR; POST rate limit `{max:10, timeWindow:'1 minute'}`, no body schema, passes `req.log`), both via `app.container.brief`. Memoised `get brief() { return (this._brief ??= new BriefService({...})) }` (as `get intent`, `container.ts:173-183`) — deps in Design notes → *Dep interfaces*. Register `brief` in `modules/index.ts`.
- **Layer / why here:** transport + composition root (only place knowing concrete services).
- **Skills to apply:** `fastify-best-practices`, `onion-architecture`, `zod`, `typescript-expert`, `security`
- **Practices:** `params: IdParams`, `response: {200: PrBriefView}`, no `parse` in handlers; `getContext`; GET never calls the model; one `BriefService` per app (it holds the guard).
- **Known gotchas:** `server/insights/gotchas.md` → Security (LAN-reachable routes); Tests (hermetic `.it`: `isolatedTestConfig()` + `overrides.secrets: new MockSecretsProvider({})` + a mock under every provider; `MockGitHubClient` has one PR).
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/brief.it.test.ts test/intent.it.test.ts` passes (T7 — Design notes → *Integration cases*) · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` passes

### S9 — Brief data hooks
- **Files:** `client/src/lib/hooks/brief.ts` (create) · `client/src/lib/hooks/index.ts` (modify)
- **Change:** key `["pr-brief", prId]`; `usePrBrief` (GET, `enabled: !!prId`, `refetchInterval` 2000 ms while `generating`); `useGeneratePrBrief` (POST; `onSuccess` → `setQueryData`; `onError` → `invalidateQueries` on the key) — pattern `lib/hooks/onboarding.ts`; barrel export.
- **Layer / why here:** client data layer, one hook per endpoint.
- **Skills to apply:** `react-best-practices`, `frontend-architecture`, `next-best-practices`, `typescript-expert`
- **Practices:** only `lib/api.ts` fetches; the query never POSTs (AC-43).
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm typecheck`

### S10 — Navigation target in the diff viewer
- **Files:** `client/src/components/diff-viewer/target.ts` (create) · `client/src/components/diff-viewer/index.ts` · `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx` · `client/src/components/diff-viewer/FileCard/FileCard.tsx` · `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` · `client/src/components/diff-viewer/styles.ts` · `client/src/components/diff-viewer/FileCard/FileCard.test.tsx` (modify)
- **Change:** `DiffTarget {path, line: number|null, nonce}`, `TARGET_HIGHLIGHT_MS = 2000` (assumption). `DiffViewer` → matching `FileCard` (opens; `targetNonce` to the `CodeLine` with `newNo === line`, else scrolls + highlights its header) → `CodeLine` scrolls its row (`block:"center"`), highlights briefly. Design notes → *Target apply rule*.
- **Layer / why here:** shared diff chrome used by both diff orders.
- **Skills to apply:** `react-best-practices`, `frontend-architecture`, `typescript-expert`, `react-testing-library`
- **Practices:** effects only for scroll/timer, with cleanup; new props optional.
- **Known gotchas:** jsdom has no `scrollIntoView` — stub and restore (`OnThisPage.test.tsx:42-60`); `client/insights/gotchas.md` → Tests (`fireEvent`), UI (`styles.ts` literals with `satisfies CSSProperties`).
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run FileCard` passes (T8)

### S11 — DiffTab accepts a target
- **Files:** `…/DiffTab/DiffTab.tsx` · `…/DiffTab/_components/SmartDiffGroup/SmartDiffGroup.tsx` · `…/DiffTab/DiffTab.test.tsx` (all modify)
- **Change:** `DiffTab` prop `target?: DiffTarget|null` → to `DiffViewer` (original order, error fallback) and to the `SmartDiffGroup` containing `target.path`; the group opens per the *Target apply rule* (collapsed roles included) and forwards it.
- **Layer / why here:** colocated feature component.
- **Skills to apply:** `react-best-practices`, `frontend-architecture`, `next-best-practices`, `typescript-expert`, `react-testing-library`
- **Practices:** same rule as S10; no new DiffTab state.
- **Known gotchas:** `client/insights/gotchas.md` → Tooling (a `[repoId]` vitest filter matches nothing), Tests (`vi.mock` + `importActual`).
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run DiffTab` passes (T9)

### S12 — `brief` namespace copy
- **Files:** `client/messages/en/brief.json` (modify)
- **Change:** add the `prBrief` object — keys in Design notes → *Copy*. Existing keys untouched (`intentCard.title` stays "PR Brief"; top-level `noRisks` reused for AC-27). Before S13 because its tests load this file.
- **Layer / why here:** i18n, `brief` namespace (AC-35).
- **Skills to apply:** `next-best-practices`, `frontend-architecture`
- **Practices:** valid JSON, ICU placeholders.
- **Known gotchas:** none.
- **Done when:** `jq -e '([.prBrief | .. | strings] | length) == 29 and .intentCard.title == "PR Brief" and (.noRisks | type == "string")' client/messages/en/brief.json` (29 = every *Copy* key)

### S13 — PrBriefBlock component
- **Files:** `…/PrBriefBlock/PrBriefBlock.tsx` · `index.ts` · `helpers.ts` · `constants.ts` · `styles.ts` · `PrBriefBlock.test.tsx` · `_components/RiskList/RiskList.tsx` · `_components/FocusList/FocusList.tsx` (all create, under `…/PrBriefBlock/`)
- **Change:** props `{prId, prHeadSha, repo, diffPaths: string[], onOpenInDiff(path, line|null)}`; one section holding the brief content and the existing `IntentCard`/`BlastRadiusCard` columns (X14) — Design notes → *Block UI*.
- **Layer / why here:** colocated feature component (D6-A callback, D7-A plain text).
- **Skills to apply:** `react-best-practices`, `frontend-architecture`, `next-best-practices`, `typescript-expert`, `security`, `react-testing-library`
- **Practices:** model text only as text nodes, no Markdown/`dangerouslySetInnerHTML` (AC-31); hooks from `@/lib/hooks/brief` and `@/lib/hooks/reviews`, not the barrel; ≤200 lines per component; severity by icon shape + `aria-label`; `<button>` controls; copy from `brief` (banner keeps `prReview`, AC-35).
- **Known gotchas:** `client/insights/gotchas.md` → Tests (`fireEvent`, `importActual`, multiple matches on reused copy), UI (`styles.ts`).
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run PrBriefBlock` passes (T10)

### S14 — Overview layout and page wiring
- **Files:** `…/OverviewTab/OverviewTab.tsx` · `…/OverviewTab/OverviewTab.test.tsx` · `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` (all modify)
- **Change:** `OverviewTab` gets `diffPaths`, `onOpenInDiff`; renders `PrBriefBlock` (now holding the Intent/Blast columns) then the description. `page.tsx`: `diffTarget` state; `openInDiff` sets `{path, line, nonce: prev+1}` + `setTab("diff")`; manual `onSetTab` clears it; passes `diffPaths={pr.files.map((f) => f.path)}`, `target={diffTarget}`. Test (T11): PR Brief heading precedes Intent, both cards inside its section; providers `{brief, blast, prReview}`; hooks mocked with `importActual`.
- **Layer / why here:** thin page; state lifted only to the tabs' common parent.
- **Skills to apply:** `react-best-practices`, `frontend-architecture`, `next-best-practices`, `typescript-expert`, `react-testing-library`
- **Practices:** no derived state; the page's Suspense boundary stays.
- **Known gotchas:** `client/insights/gotchas.md` → Tests (`importActual`).
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm test` passes

### S15 — Store the brief call's usage in the contract  [Contract]
- **Files:** `server/src/vendor/shared/contracts/brief.ts` (modify) · `client/src/vendor/shared/contracts/brief.ts` (modify, same edit)
- **Change:** `import { CostSource } from './trace.js'`; add `BriefUsage = z.object({tokens_in: z.number().int().nullable(), tokens_out: z.number().int().nullable(), cost_usd: z.number().nullable(), cost_source: CostSource.nullable()})` + type; `PrBrief` gains `usage: BriefUsage.optional()` (rows stored before G5 have none and must still parse).
- **Layer / why here:** ports; shared first, targeted mirror.
- **Skills to apply:** `zod`, `typescript-expert`, `onion-architecture`
- **Practices:** `.optional()` only for the legacy-row case, `.nullable()` per value (AC-49); no other contract edits.
- **Known gotchas:** root `INSIGHTS.md` "the two vendored `shared` copies are not actually in sync".
- **Done when:** `diff server/src/vendor/shared/contracts/brief.ts client/src/vendor/shared/contracts/brief.ts` prints nothing · `cd server && pnpm typecheck` · `cd client && pnpm typecheck`

### S16 — BriefService writes usage
- **Files:** `server/src/modules/brief/service.ts` (modify) · `server/test/brief-service.test.ts` (modify) · `server/test/brief.it.test.ts` (modify)
- **Change:** the stored `PrBrief` (`service.ts:180-189`) adds `usage: {tokens_in: result.tokensIn ?? null, tokens_out: result.tokensOut ?? null, cost_usd: result.costUsd ?? null, cost_source: result.costSource ?? null}`.
- **Layer / why here:** application; the values already arrive from `completeStructured`.
- **Skills to apply:** `onion-architecture`, `zod`, `typescript-expert`
- **Practices:** no new reads or calls; the AC-9 log line unchanged.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/brief-service.test.ts test/brief.it.test.ts` passes (T6: upsert payload carries `usage`, and a null `costUsd` stays null; T7: GET after POST returns `brief.usage` with numbers; a stored current-shape row without `usage` still returns a non-null brief) · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` passes

### S17 — Compact token-flow formatter
- **Files:** `client/src/lib/format-cost.ts` (modify) · `client/src/lib/format-cost.test.ts` (modify)
- **Change:** add `formatTokenFlow(tokensIn, tokensOut): string` → `"8.2K→1.3K"`; each side `<1000` as an integer, `≥1000` one-decimal `K`, `≥1e6` one-decimal `M` (assumption, matches design 22); a null side → `"—"` (AC-50).
- **Layer / why here:** the one place cost/tokens become strings (`format-cost.ts` header).
- **Skills to apply:** `typescript-expert`, `frontend-architecture`
- **Practices:** pure function; `formatCostUsd` reused unchanged for the USD part.
- **Known gotchas:** `client/insights/gotchas.md` → Tooling (`pnpm exec vitest run <pattern>`).
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run format-cost` passes (T12: `8200,1300`→`8.2K→1.3K`, `950,null`→`950→—`, `1_500_000,20`→`1.5M→20`)

### S18 — Copy for cost lines and the focus card
- **Files:** `client/messages/en/brief.json` (modify)
- **Change:** `prBrief.reviewFocus` becomes "Review focus — read these first" (count moves to a badge); add `prBrief.focusCount` "{count} items", `prBrief.cost.review` "Review", `prBrief.cost.brief` "Brief".
- **Layer / why here:** i18n, `brief` namespace (AC-35).
- **Skills to apply:** `next-best-practices`, `frontend-architecture`
- **Practices:** valid JSON; existing keys otherwise untouched.
- **Known gotchas:** none.
- **Done when:** `jq -e '([.prBrief | .. | strings] | length) == 32 and .prBrief.cost.brief == "Brief" and .intentCard.title == "PR Brief"' client/messages/en/brief.json`

### S19 — Slots in VerdictBanner and IntentCard
- **Files:** `…/VerdictBanner/VerdictBanner.tsx` · `…/VerdictBanner/styles.ts` · `…/VerdictBanner/VerdictBanner.test.tsx` · `…/IntentCard/IntentCard.tsx` · `…/IntentCard/styles.ts` · `…/IntentCard/IntentCard.test.tsx` (all modify)
- **Change:** `VerdictBanner` gains optional `scoreFooter?: React.ReactNode`, rendered under the PR score in the score column (rendered there even when `score` is null). `IntentCard` gains optional `children?: React.ReactNode`, rendered after a divider below the card body (after the scope lists and their metadata, before the Re-classify footer), in every state — Design notes → *Design conformance (G5–G6)*.
- **Layer / why here:** colocated feature components; slots keep brief logic out of them (composition, not a brief import).
- **Skills to apply:** `react-best-practices`, `frontend-architecture`, `typescript-expert`, `react-testing-library`
- **Practices:** props optional — `ReviewRunAccordion` and existing tests unaffected; no divider when no children; `styles.ts` literal entries.
- **Known gotchas:** `client/insights/gotchas.md` → UI (`styles.ts` literals with `satisfies CSSProperties`), Tests (`fireEvent`).
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run VerdictBanner IntentCard` passes (T13: slot content rendered in the score column; T14: children rendered after a separator, absent → no separator)

### S20 — Recompose PrBriefBlock to the designs
- **Files:** `…/PrBriefBlock/PrBriefBlock.tsx` · `…/PrBriefBlock/helpers.ts` · `…/PrBriefBlock/styles.ts` · `…/PrBriefBlock/PrBriefBlock.test.tsx` · `…/PrBriefBlock/_components/RiskList/RiskList.tsx` · `…/PrBriefBlock/_components/FocusList/FocusList.tsx` (modify) · `…/PrBriefBlock/_components/CostLines/CostLines.tsx` · `…/PrBriefBlock/_components/CostLines/index.ts` (create)
- **Change:** layout per Design notes → *Design conformance (G5–G6)*: banner carries `summary={brief.summary}` and `scoreFooter={<CostLines …/>}` (AC-32, AC-48); no review → summary at the top with only the Brief line (AC-33); notes under the summary (AC-22); `RiskList` as compact cards passed as `IntentCard` children (AC-28, AC-46); `FocusList` as a full-width card below the columns with heading + count badge and a bulleted list (AC-30, AC-47). Review usage from `usePrRuns(prId)` matched on `review.run_id`.
- **Layer / why here:** colocated feature component.
- **Skills to apply:** `react-best-practices`, `frontend-architecture`, `next-best-practices`, `typescript-expert`, `security`, `react-testing-library`
- **Practices:** model text stays plain text nodes (AC-31); hooks from `@/lib/hooks/brief` and `@/lib/hooks/reviews`, not the barrel; ≤200 lines per component; chevron button with `aria-expanded` + `aria-label`; no derived state.
- **Known gotchas:** `client/insights/gotchas.md` → Tests (`importActual`, multiple matches on reused copy), UI (`styles.ts`).
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run PrBriefBlock OverviewTab` passes (T10 cases in Design notes) · `cd client && pnpm test` passes

### S21 — Coverage and risk-card copy
- **Files:** `client/messages/en/brief.json` (modify)
- **Change:** add `prBrief.coverage.{title, explanation, showRefs, hideRefs}`, `prBrief.coverage.chip.{missing,partial,truncated,stale}`, `prBrief.coverage.reason.{13 codes}` (ICU with `{count}`) and `prBrief.riskCount` — exact strings in Design notes → *Coverage round (G7)*. Existing keys untouched.
- **Layer / why here:** i18n, `brief` namespace (AC-35).
- **Skills to apply:** `next-best-practices`, `frontend-architecture`
- **Practices:** valid JSON; ICU plurals for counted reasons.
- **Known gotchas:** none.
- **Done when:** `jq -e '([.prBrief | .. | strings] | length) == 54 and .prBrief.coverage.title == "Brief built without full data" and .prBrief.coverage.reason.no_data != null' client/messages/en/brief.json`

### S22 — CoverageBlock subcomponent
- **Files:** `…/PrBriefBlock/_components/CoverageBlock/CoverageBlock.tsx` · `…/CoverageBlock/index.ts` · `…/CoverageBlock/helpers.ts` · `…/CoverageBlock/helpers.test.ts` (all create, under `…/PrBriefBlock/_components/`)
- **Change:** `groupCoverage(items: BriefMissingInput[]) → CoverageRow[]` and `CoverageBlock({items})` (title, explanation, one row per group: status chip, input name, known reason, refs collapsed behind a toggle; `null` when `items` is empty) — Design notes → *Coverage round (G7)*.
- **Layer / why here:** colocated sub-component of the block (one consumer); grouping is a pure helper beside it.
- **Skills to apply:** `react-best-practices`, `frontend-architecture`, `typescript-expert`, `security`, `react-testing-library`
- **Practices:** pure `groupCoverage`, no derived state in `useState` (only the per-row open flag); refs and reasons as text nodes; unknown reason codes show no reason (never raw strings); toggle is a `<button>` with `aria-expanded`; `styles.ts` literals.
- **Known gotchas:** `client/insights/gotchas.md` → UI (`styles.ts`), Tooling (`pnpm exec vitest run <pattern>`).
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run CoverageBlock` passes (T15)

### S23 — Risk areas as their own card; coverage under the summary
- **Files:** `…/PrBriefBlock/PrBriefBlock.tsx` · `…/PrBriefBlock/helpers.ts` · `…/PrBriefBlock/styles.ts` · `…/PrBriefBlock/_components/RiskList/RiskList.tsx` · `…/PrBriefBlock/PrBriefBlock.test.tsx` (all modify)
- **Change:** replace the `missing_inputs` notes (`PrBriefBlock.tsx:146-155`) with `<CoverageBlock items={brief.missing_inputs} />` under the summary (stale note of AC-42 stays separate); drop `noteKey` and the unused `notes` style. Stop passing `RiskList` as `IntentCard` children; render it after the columns and before `FocusList`. `RiskList` becomes a card in the `FocusList` frame (`s.focusCard`, heading with `AlertTriangle` icon + count `Badge` with `riskCount` label). Update T10 per Design notes.
- **Layer / why here:** colocated feature component.
- **Skills to apply:** `react-best-practices`, `frontend-architecture`, `next-best-practices`, `typescript-expert`, `security`, `react-testing-library`
- **Practices:** model text stays plain text (AC-31); ≤200 lines per component; no new hooks; G4–G6 test cases kept, only their layout queries adjusted.
- **Known gotchas:** `client/insights/gotchas.md` → Tests (`importActual`, multiple matches on reused copy).
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run PrBriefBlock OverviewTab` passes (T10)

### S24 — Remove the unused IntentCard children slot
- **Files:** `…/IntentCard/IntentCard.tsx` · `…/IntentCard/styles.ts` · `…/IntentCard/IntentCard.test.tsx` (all modify)
- **Change:** remove the `children` prop, its divider block (`IntentCard.tsx:127`) and the `slot` style; remove the "children slot" test (`IntentCard.test.tsx:106-120`) and the `children` param of its render helper.
- **Layer / why here:** after S23 the slot has no consumer; a prop nobody passes is a premature abstraction (react-best-practices) and T14 would keep testing dead API. Re-adding it later is one small edit.
- **Skills to apply:** `react-best-practices`, `frontend-architecture`, `typescript-expert`, `react-testing-library`
- **Practices:** no other IntentCard behaviour changes.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run IntentCard` passes · `cd client && pnpm test` passes

## Tests
| Id | Test file | Tier | Covers | Step |
|---|---|---|---|---|
| T1 | `server/test/diff-hunks.test.ts` | unit | AC-24 ranges | S2 |
| T2 | `server/test/brief-prompt.test.ts` | unit | AC-10 | S3 |
| T3 | `server/test/brief-budget.test.ts` | unit | AC-11..13, 44, 45 | S3 |
| T4 | `server/test/brief-grounding.test.ts` | unit | AC-23..27 | S4 |
| T5 | `server/test/intent-service.test.ts` | unit | AC-21 issue failures | S6 |
| T6 | `server/test/brief-service.test.ts` | unit | AC-3, 5, 7–9, 14–21, 44, 45 | S7 |
| T7 | `server/test/brief.it.test.ts` | integration | AC-3, 5–8, 19, 40–43, 45 | S8 |
| T8 | `client/src/components/diff-viewer/FileCard/FileCard.test.tsx` | unit (jsdom) | AC-36, 37, 39 | S10 |
| T9 | `…/DiffTab/DiffTab.test.tsx` | unit (jsdom) | AC-36, 37 | S11 |
| T10 | `…/PrBriefBlock/PrBriefBlock.test.tsx` | unit (jsdom) | AC-2, 4, 6–8, 13, 22, 27–34, 38, 42, 43, 45 | S13 |
| T11 | `…/OverviewTab/OverviewTab.test.tsx` | unit (jsdom) | AC-1, 34 | S14 |
| T12 | `client/src/lib/format-cost.test.ts` | unit | AC-48, 50 (`formatTokenFlow`) | S17 |
| T13 | `…/VerdictBanner/VerdictBanner.test.tsx` | unit (jsdom) | AC-32, 48 slot | S19 |
| T14 | `…/IntentCard/IntentCard.test.tsx` | unit (jsdom) | AC-46 slot (S19); slot test removed in S24 | S19, S24 |
| T15 | `…/PrBriefBlock/_components/CoverageBlock/helpers.test.ts` | unit | AC-13, 22 grouping | S22 |

G5/G6 extend T6, T7 (AC-49; S16) and T10 (AC-22, 28, 30, 32, 33, 46–48, 50; S20). G7 extends T10 (AC-13, 22, 46, 47; S23).

## Migrations & contracts
No migration (TQ1). Contract `brief.ts` reshaped in S1 and extended in S15 (`usage`), each mirrored in the same step.

## Out of scope
- PR history in the brief, MCP tool, auto-regeneration, intent classification during generation.
- Changes to `reviewer-core`, `mcp-server`, `e2e`, `run-executor.ts` behaviour, the Intent/Blast cards' internals beyond the S19 slots and their S24 removal, `RunCostBadge`, `pr_files` refresh.
- `server/src/db/migrations/**`, other `*/src/vendor/**`, lock files, `.env`.
- Moving onboarding's `classifyGenerationError`.

<!-- implementer-brief:end -->

## Design notes

### Contract (S1)
- `BriefInput = z.enum(['intent','blast_radius','review_findings','linked_issue','attached_specs','pr_description','changed_files'])`
- `BriefInputStatus = z.enum(['missing','partial','truncated','stale'])`
- `BriefMissingInput = z.object({input: BriefInput, status: BriefInputStatus, ref: z.string().nullable(), reason: z.string().nullable()})`
- `ReviewFocusItem = z.object({file: z.string(), line: z.number().int(), reason: z.string()})`
- `BriefModel = z.object({provider: z.string(), model: z.string()})`
- `PrBriefModelOutput = z.object({summary: z.string(), risks: z.array(Risk), review_focus: z.array(ReviewFocusItem)})`
- `PrBrief = z.object({summary, risks: Risks, review_focus: z.array(ReviewFocusItem), missing_inputs: z.array(BriefMissingInput), head_sha: z.string(), generated_at: z.string(), model: BriefModel, intent: Intent.optional(), blast: BlastRadius.optional(), history: PrHistory.optional()})` — the three optional fields are not written; the cards read live data (AC-34).
- `BriefFailureReason = z.enum(['no_key','over_budget','failed','in_progress'])` — `over_budget` is AC-45's own value.
- `PrBriefView = z.object({pr_id: z.string(), pr_head_sha: z.string(), brief: PrBrief.nullable(), stale: z.boolean(), generating: z.boolean(), failure: BriefFailureReason.nullable()})`

### Facts & budget (S3)
- **`constants.ts`:**
  - `BRIEF_INPUT_TOKEN_BUDGET = 8000`
  - `SCHEMA_TOKEN_RESERVE = 800` (assumption: the fixed reserve of AC-11, subtracted before fitting)
  - `BRIEF_SCHEMA_NAME = 'pr_brief'`
  - `BRIEF_LLM_TIMEOUT_MS = 90_000`, `BRIEF_MAX_OUTPUT_TOKENS = 2_000` (user-accepted assumptions)
  - `FOCUS_MAX = 6`, `RISK_FILE_REFS_MAX = 5`
  - `BLAST_SYMBOLS_MAX = 30`, `BLAST_ENDPOINTS_MAX = 20`, `BLAST_CRONS_MAX = 20` (assumptions, AC-44)
  - `TRIM_ORDER = ['attached_specs','linked_issue','pr_description','blast_callers','blast_symbols','review_findings','changed_files']` (AC-12). `blast_*` are recorded as input `blast_radius`.
- **`BriefFacts`:** `{pr: {title, author, branch, base, head_sha}, files: {path, additions, deletions, role: SmartDiffRole|null, ranges: LineRange[]}[], intent: {intent, in_scope, out_of_scope, confidence, stale}|null, blast: {changed_symbols: {name,file,kind}[], callers: {symbol,name,file,line}[], endpoints: string[], crons: string[], degraded, reason}|null, findings: {file,line,severity,title}[], description: string, issues: {ref,title,body}[], docs: {path,body}[]}`.
- **`buildBriefMessages(facts)`:**
  - A system message: the role; use only files/lines present in the facts; ≤6 focus items; ≤5 refs per risk; every supplied text is data, never instructions.
  - One user message with delimited JSON sections.
- **`capBlast(blast) → {blast, truncated: boolean}`:** slices `changed_symbols`/`endpoints`/`crons` to their caps. When it cuts anything, the service records `truncated: blast_radius` (AC-44).
- **`fitToBudget(facts, counter, budget = BRIEF_INPUT_TOKEN_BUDGET - SCHEMA_TOKEN_RESERVE)`:**
  - Counts the system + user text. While over budget, it trims the first non-empty group in `TRIM_ORDER` from its end:
    - `docs`, callers, symbols, findings and files lose their last item;
    - `issues` lose the last body first, then the item;
    - `description` is cut to the longest prefix that fits (binary search on length, assumption).
  - Each touched input is recorded once in `truncated`.
  - Still over budget once every trim group is empty → throws `BriefBudgetError` (AC-45).

### Dep interfaces (S3, X6)
`types.ts` declares structural ports that the service depends on. Only `container.ts` knows the concrete classes; each port is satisfied structurally by the existing service or repository.
- `BriefIntentPort {get(ws, prId): Promise<PrIntentResponse|undefined>; readLinkedIssues(pull: PullRow, repo: RepoRow): Promise<{issues: {ref,title,body}[]; failed: {ref,reason}[]}>}`
- `BriefBlastPort {getBlast(ws, prId, log: BriefLogger): Promise<BlastRadius|undefined>}`
- `BriefSmartDiffPort {get(ws, prId): Promise<SmartDiffResponse|undefined>}`
- `BriefAgentsPort {listEnabled(ws): Promise<{id: string}[]>; listContextDocs(id): Promise<{path: string}[]>; inheritedContextDocs(id): Promise<{path: string}[]>}`
- `BriefContextPort {readDocsForRun(repo: {owner, name, contextGlobs}, paths): Promise<{docs: {path, body}[]; skipped: {path, reason}[]}>}`
- `BriefLogger {info(obj: object|string, msg?: string): void; warn(obj: object|string, msg?: string): void}` — it satisfies `BlastLogger` (`blast/service.ts:21-24`), and `req.log` satisfies it (Y4).
- `RepoRow` here is `BriefRepoRow = typeof t.repos.$inferSelect`, exported from `brief/repository.ts` (same module; `intent/repository.ts:13` declares the identical type, so `IntentService` satisfies the port structurally). `PullRow` comes from `db/rows`.

### Grounding (S4)
- `normaliseRef(s)`: trim; strip a leading `./` or `/`; strip a trailing `:<digits>` (X10). The result must still be a member of the allowed set.
- `ctx = {diffFiles: Map<path, LineRange[]>, blastFiles: Set<path>, callerLines: Map<path, Set<number>>}`, built from all PR files and the full blast result (not the trimmed prompt copy).
- Risk refs: keep normalised refs in `diffFiles ∪ blastFiles`, dedupe, cap 5; drop a risk with no ref left.
- Focus: keep an item when its normalised file is allowed, `line > 0`, and the line is inside one of the file's ranges or in its caller lines. Dedupe on `file:line`, keep the model's order, cap 6.
- `classifyBriefError`: `ConfigError` → `no_key`; `BriefBudgetError` → `over_budget`; anything else → `failed`.

### Generation flow (S7)
- **`getView(ws, prId, failure = null)`:** `PrBrief.safeParse(stored)` (a failure → `brief: null`); `stale = brief.head_sha !== pull.headSha`; `generating = set.has(prId)`.
- **`generate(ws, prId, log)`, guard:** if `set.has(prId)`, return the view with `failure: 'in_progress'`. Otherwise add `prId` before the first `await` and delete it in `finally`.
- **Setup:** `getPull` → `resolveModel(ws,'risk_brief')` → `await deps.llm(provider)`. A `ConfigError` here → `no_key`, nothing else read (AC-8).
- **Gather facts** best-effort, each in its own try/catch:
  - intent via `intent.get`: null → `intent missing`; stale → `intent stale`; never classify.
  - blast via `getBlast(ws, prId, log)`: throws or undefined → `blast_radius missing`; `degraded` → `partial` with the `reason`; then `capBlast` (cut → `truncated`).
  - smart-diff roles.
  - `latestReview`: none → `review_findings missing`.
  - `readLinkedIssues`: each failure → `linked_issue missing` with `ref`/`reason`.
  - docs: `listEnabled` → per agent `listContextDocs` + `inheritedContextDocs` → `mergeContextPaths` → `readDocsForRun`. No paths → `attached_specs missing`; each skipped doc → `attached_specs missing` with `ref`.
- **Fit:** `fitToBudget` (trims → `truncated`). A `BriefBudgetError` → `over_budget` with no model call (AC-45).
- **Call:** one `completeStructured({model, schema: PrBriefModelOutput, schemaName, messages, temperature: 0, maxTokens: BRIEF_MAX_OUTPUT_TOKENS, timeoutMs: BRIEF_LLM_TIMEOUT_MS, maxRetries: 0, requireParameters: true, signal: AbortSignal.timeout(BRIEF_LLM_TIMEOUT_MS)})`. `timeoutMs` is explicit so the adapter's `withTimeout` default (60 s) cannot release the guard while the call still runs; invariant: signal deadline ≤ `timeoutMs` (X1).
- **Success:** `log.info(`brief: ${provider}/${result.model} tokens ${tokensIn}/${tokensOut} cost ${costUsd ?? 'n/a'} duration_ms ${d}`)` → `groundBrief` → `upsertBrief({…, head_sha (captured before the call), generated_at, model})`.
- **Any throw:** `classifyBriefError`, then `log.warn(`brief: failed reason=${reason} err=${errName}`)` with no message text and no data object (X8). The stored row is untouched, and the view carries that `failure`.

### Unit cases (T2, T3, T6)
- **T2:** a fixture patch body line and a finding rationale appear in no message.
- **T3:**
  - trim order including symbols after callers; item-from-end removal;
  - the `truncated` list;
  - final count ≤ 8000 − reserve;
  - `capBlast` cuts and flags;
  - `BriefBudgetError` when nothing is left to trim.
- **T6 (fakes):**
  - one call with `maxRetries: 0`, the `risk_brief` model, `timeoutMs === BRIEF_LLM_TIMEOUT_MS` and a `signal` (AC-3, X1);
  - two concurrent `generate` → one call (AC-5);
  - `ConfigError` → `no_key`, 0 calls, no upsert (AC-8);
  - the call throws → no upsert, `failed`, and the warn line matches `^brief: failed reason=\w+ err=\w+$` (AC-7, X8);
  - an untrimmable input → `over_budget`, 0 calls, no upsert (AC-45);
  - exactly one info line matching `^brief: \S+/\S+ tokens \d+/\d+ cost \S+ duration_ms \d+$` (AC-9);
  - each AC-14..21 `missing_inputs` entry;
  - capped blast → `truncated: blast_radius` (AC-44).

### Integration cases (T7)
- **Setup:**
  - Every `buildApp` passes `config: isolatedTestConfig()` and `overrides.secrets: new MockSecretsProvider({})` (X2).
  - LLM stubs go under every provider via `llmUnderEveryProvider`. The default stub is `MockLLMProvider` with `structuredBySchema: {pr_brief: FIXTURE}`, where `FIXTURE` is a valid `PrBriefModelOutput` whose focus lines fall inside the seeded patches' ranges (Y2).
  - Seeds by direct `db.insert` after `seed(db)`: `pr_files` rows with real `@@` patches; one `reviews` row `kind='review'` with one live and one dismissed finding; an old-shape `pr_brief` row for its own case.
- **Cases:**
  - GET before any generation → `brief: null`, 0 model calls (AC-43).
  - POST → stored, 1 structured call, at least one focus item survives grounding (AC-3, AC-6).
  - A later GET returns the stored brief with 0 new calls (AC-40), including `head_sha`, `generated_at` and `model` (AC-41).
  - `head_sha` updated in the DB → `stale: true` (AC-42).
  - Two parallel POSTs with `DeferredLLMProvider` → 1 call; then `release(FIXTURE)` (AC-5).
  - No llm override, empty secrets (pattern `onboarding.it.test.ts:441`) → `failure: 'no_key'`, 0 calls (AC-8).
  - AC-7: generate once with the good stubs, then a second `buildApp` over the same Postgres with `ThrowingLLMProvider` under every provider → `failure: 'failed'`, stored row unchanged (Y1).
  - The dismissed finding's title is absent from the request messages (AC-19).
  - The brief's `missing_inputs` holds `blast_radius` as `missing` or `partial` (the index is unseeded; Y12).
  - A seeded description of ~40,000 tokens → `truncated: pr_description` with a successful call (the AC-45 path itself is unit-tested in T3/T6).
  - An old-shape stored JSON → `brief: null`.
  - Unknown PR → 404.

### Target apply rule (S10, S11; Y5, Y6, X5)
- `SmartDiffGroup`, `FileCard` and `CodeLine` each hold `const applied = useRef<number | null>(null)`, empty on mount.
- An effect with deps `[target?.nonce, target?.path, <readiness: lines/files present>]` runs on mount and on change. When the target matches this instance and `target.nonce !== applied.current`, it opens / scrolls / highlights and sets `applied.current = target.nonce`.
- So a component that mounts with the target already present (tab switch, smart diff loaded after mount, line rendered after open) applies it once. A re-render with the same nonce does nothing, and a new nonce applies again.
- **T8:** mount with the target set → file open, row highlighted, `scrollIntoView` called once; re-render with the same nonce → no second call; new nonce → called again; `line: null` → header.
- **T9:** mount with a target in the collapsed `docs` group → group and file open.

### Copy (S12)
`prBrief` keys:
- `title` "PR Brief", `generate` "Generate brief", `refresh` "Refresh"
- `error` "Could not generate the brief.", `retry` "Try again"
- `noKey` "No model or API key is configured for Risk Brief.", `openSettings` "Open model settings"
- `overBudget` "This PR's inputs are too large for the brief's token budget."
- `stale` "PR has new commits"
- `riskAreas` "Risk areas", `reviewFocus` "Review focus ({count})", `noFocus` "No review focus items."
- `notInDiff` "File not in this PR's diff"
- `expandRisk` "Show details", `collapseRisk` "Hide details"
- `severity.{high,medium,low}` "High/Medium/Low severity"
- `inputs.{intent,blast_radius,review_findings,linked_issue,attached_specs,pr_description,changed_files}` → "intent", "blast radius", "review findings", "linked issue", "attached specs", "PR description", "changed-file list"
- `status.{missing:"{input} missing", partial:"{input} partial", truncated:"truncated: {input}", stale:"{input} stale"}`

### Block UI (S13)
- One `<section>` titled "PR Brief" (`prBrief.title`) holds, in order:
  1. the brief content area;
  2. the existing `IntentCard` and `BlastRadiusCard` columns, moved from `OverviewTab` with its `styles.ts` `columns` entry. These are always rendered with live data, brief or not (AC-34, X14).
- Hooks: `usePrBrief`, `useGeneratePrBrief` (from `@/lib/hooks/brief`) and `usePrReviews` (from `@/lib/hooks/reviews`). The latest review is the first `kind === "review"` record (`helpers.latestReview`, same rule as `DiffTab/helpers.ts:71-73`).
- Content area states:
  - GET loading → `Skeleton`.
  - Mutation pending or `view.generating` → skeleton, Generate/Refresh disabled (AC-4).
  - No brief → Generate (AC-2).
  - `failure` `no_key` → message + `Link` to `/settings/models` (AC-8).
  - `over_budget` → `overBudget` message, distinct from the model error (AC-45).
  - `failed` or a mutation error → error + retry (AC-7).
- With a brief:
  - `VerdictBanner` (`../VerdictBanner`, `summary={null}`, `findingsCount`/`blockers` as in `ReviewRunAccordion.tsx:63-64`), only when a latest review exists (AC-32/33);
  - the summary as plain text;
  - stale (`view.stale || brief.head_sha !== prHeadSha`, so a refreshed PR head shows at once; X4) → note + Refresh (AC-42);
  - the `missing_inputs` notes (AC-13/15/17/22/44);
  - `RiskList`: title, first ref, `AlertOctagon`/`AlertTriangle`/`Info` icon with an `aria-label`, and an expand button (`aria-expanded`) showing the explanation and all refs (AC-28/29);
  - `FocusList`: an `<ol>` under a heading with the count; items are buttons reading `file:line — reason` (AC-30);
  - empty states (AC-27).
- A path not in `diffPaths` → `notInDiff` in a `role="status"` line, and `onOpenInDiff` is not called (AC-38).
- T10 test providers: `{brief, blast, prReview}`.
- T10 also covers:
  - `![x](http://e/x.png) <img src=x>` in the summary renders as literal text with no `img` element (AC-31);
  - rendering never calls the mutation (AC-43);
  - the stale note appears when `prHeadSha` differs from `brief.head_sha` even with `view.stale: false`;
  - the `over_budget` message differs from the `failed` one;
  - the Intent and Blast cards render inside the section when no brief exists.

### Design conformance (G5–G6)
Source: spec 010 Changelog, 2026-10-06 design-conformance entry (AC-22, 28, 30, 32, 33 changed; AC-46..50 new) and designs 22/36/37 (session images, not in the repo).

**Block structure** (top to bottom), inside the existing "PR Brief" section:

1. **Banner area.**
   - With a latest review: `VerdictBanner` with `summary={brief.summary}` (AC-32). Its `scoreFooter` is `<CostLines review={…} brief={brief.usage} />` (AC-48).
   - Without one: a summary card with `brief.summary` and `<CostLines review={null} brief={brief.usage} />` beside it (AC-33).
   - Below it, inside the brief area: stale note, `missing_inputs` notes (AC-22), alerts, and the not-in-diff `role="status"` line.
2. **Columns.** `IntentCard` with `<RiskList …/>` as children (AC-46), shown only when a brief exists; `BlastRadiusCard` unchanged.
3. **`FocusList`.** A full-width card below the columns (AC-47), shown only when a brief exists.

**`CostLines`** (props `review: {cost_usd, cost_source, tokens_in, tokens_out} | null`, `brief: BriefUsage | null | undefined`):
- One line per present source. Each line: a label (`prBrief.cost.review` / `prBrief.cost.brief`), then `formatCostUsd(cost_usd, cost_source)`, then `formatTokenFlow(tokens_in, tokens_out)`, in `mono tnum`.
- A missing source omits its line (AC-50):
  - Review: no latest review → no line. A latest review whose `run_id` matches no `usePrRuns` row → line with "—" values (the source exists, its usage is unknown).
  - Brief: `brief.usage` absent (a pre-G5 row) → no line. Null values inside it → "—".
- `helpers.reviewUsage(review, runs)` returns the matching `RunSummary` usage or nulls.

**`RiskList`** (AC-28):
- Each risk is a compact bordered card: severity icon (colour and shape as today), title, first ref as a monospace button, and a chevron icon button (`aria-expanded`, `aria-label` from `expandRisk`/`collapseRisk`).
- Expanded: explanation + all refs (AC-29).
- Heading "Risk areas" with the `AlertTriangle` icon, as in design 22.

**`FocusList`** (AC-30):
- Heading `prBrief.reviewFocus` plus a count `Badge` (`aria-label` `focusCount`).
- A `<ul>` of rows: the `file:line` monospace button, then ` — reason` as plain text. The order is unchanged (AC-26).

**`IntentCard` slot placement:** the slot renders after the body (scope lists, confidence/stale badges, sources). That satisfies "after a divider below the in-scope and out-of-scope lists" while keeping intent metadata with the intent.

**T10 additions:**
- the summary text sits inside the banner (`within` the banner region);
- the Review and Brief cost lines show `$`, `8.2K→1.3K`-style values;
- a review whose run has null usage shows "—";
- no review → only the Brief line;
- a brief without `usage` → no Brief line;
- "Risk areas" renders inside the Intent card;
- the focus card heading has a count badge and a `<ul>` list;
- the chevron toggles `aria-expanded`.

Mocks: `usePrRuns` from `@/lib/hooks/reviews` with `importActual`.

### Coverage round (G7)
Source: spec 010 Changelog "coverage round" entry (AC-13, AC-22, AC-46 reversed, AC-47).

**Block order** inside the PR Brief section:
1. banner area (or summary card), then the stale note (AC-42), then `CoverageBlock` (AC-22), then alerts and the not-in-diff status;
2. the Intent and Blast columns — the Intent card holds no Risk areas;
3. the Risk areas card (AC-46);
4. the Review focus card (AC-47).

**`groupCoverage`:**
- Groups by `input + status`, keeping first-seen order.
- `CoverageRow = {input, status, refs: string[], reason: KnownReason | null, count}`.
- `refs` are the non-null refs, deduped; `count = refs.length`, or 1 when there are none.
- `reason` is the shared code when every entry in the group carries the same code and that code is in `KNOWN_REASONS`; otherwise null.

**`KNOWN_REASONS`** (13 codes):
- blast `DegradedReason`: `flag_off`, `index_failed`, `index_partial`, `repo_too_large`, `no_data`;
- linked-issue `classifyFailure`: `not_found`, `unreachable`, `too_large`;
- `ContextSkipReason`: `missing`, `outside_search_roots`, `outside_clone` (its `too_large` shares the key);
- intent `stale_reason`: `head_moved`, `description_changed`.

**`CoverageBlock` row:**
- A chip — a `Badge` with `coverage.chip.<status>`; colours: missing `var(--crit)`, partial and stale `var(--warn)`, truncated `var(--text-muted)`.
- The input name (`inputs.<input>`).
- When `reason` is set, ` — ` plus `coverage.reason.<code>` with `{count}`.
- When `refs.length > 0`, a `showRefs`/`hideRefs` toggle (`aria-expanded`) revealing the refs as a monospace list.
- The block has an `aria-label` of its title.

**Copy (S21)** under `prBrief.coverage`:
- `title` "Brief built without full data"
- `explanation` "Some inputs were missing or cut, so the risks and focus below may be incomplete."
- `showRefs` "Show {count, plural, one {# item} other {# items}}", `hideRefs` "Hide"
- `chip.{missing:"missing", partial:"partial", truncated:"truncated", stale:"stale"}`
- `reason`:
  - `flag_off` "blast radius disabled"
  - `index_failed` "repo index failed"
  - `index_partial` "repo index incomplete"
  - `repo_too_large` "repo too large to index"
  - `no_data` "repo not indexed"
  - `not_found` "{count, plural, one {# issue} other {# issues}} not found"
  - `unreachable` "forge unreachable"
  - `too_large` "too large to read"
  - `missing` "{count, plural, one {# file} other {# files}} not found in this repo"
  - `outside_search_roots` "outside the context roots"
  - `outside_clone` "outside the repo"
  - `head_moved` "PR has new commits since classification"
  - `description_changed` "description changed since classification"

Plus `prBrief.riskCount` "{count, plural, one {# risk} other {# risks}}". That is 22 new strings, 54 `prBrief` strings in total.

**T15 (`groupCoverage`):**
- three `attached_specs`/`missing`/`missing` entries → one row, count 3, reason `missing`;
- a mixed-reason group → reason null;
- an unknown code → null;
- a ref-less `truncated` → count 1;
- an empty list → `[]`.

**T10 additions (S23):**
- no `missing_inputs` → no "Brief built without full data";
- grouped specs row text "attached specs — 3 files not found in this repo", with refs hidden until the toggle is pressed;
- blast `partial` + `no_data` → "repo not indexed" with a "partial" chip;
- a `truncated` row (AC-13);
- an intent `stale` row;
- "Risk areas" is absent `within` the Intent card, and its card follows the columns and precedes the Review focus card (`compareDocumentPosition`), with a count badge.

All G4–G6 T10 cases are kept: AC-2, 4, 7, 8, 27–33, 38, 42, 43, 45, 48, 50.

**Slot decision (S24):** remove the IntentCard `children` slot rather than keep it unused — see S24 *Layer / why here*.

### Pass-1 review (resolved)
TQ1–TQ5, GAP1–GAP3, REC1–REC5 and D1–D8 are as recorded in *Decisions recorded*.
- D1-A: sync POST, in-process guard, always 200.
- D2-A: narrow deps, typed as structural ports (X6).
- D3-A: `_shared/diff-hunks.ts`.
- D4-A: the brief collects the docs itself; `mergeContextPaths` moves to `_shared/context-paths.ts`.
- D5-A: typed contract.
- D6-A: a page-level target with a nonce.
- D7-A: plain text.
- D8: multi-agent.

`readLinkedIssues` lives on `IntentService` because the link extraction and `classifyFailure` are intent internals. The brief has its own error classifier because onboarding's is module-private and wider than needed.

The cross-model review (`docs/plans/assets/28-pr-brief/cross-model-review.md`) was applied in correction round 1.

## Context applied
- `docs/plans/assets/28-pr-brief/research.md` → Q1–Q8 facts and paths (S5–S9).
- `docs/plans/assets/28-pr-brief/cross-model-review.md` → correction round 1 (Y1–Y10, Y12, X1–X6, X8–X15).
- `server/insights/gotchas.md` → Run log, Security, Tests → S7, S8.
- `client/insights/gotchas.md` → Tests, UI, Tooling → S10–S14.
- root `INSIGHTS.md` → "the two vendored `shared` copies are not actually in sync" (S1); "a reviewer-core input-type change breaks server tests that `pnpm typecheck` never sees" (server unit suite in S4/S8).
- `server/docs/architecture.md` §2–3 (`_shared`, DI getters) → S2, S8; `client/docs/ui-architecture.md` §6 → client tests.
- `onboarding/service.ts:98-185, 228-284` → S7; `ReviewRunAccordion.tsx:51-59` → S10/S11.
- G5/G6: spec 010 design-conformance Changelog entry and designs 22/36/37; `VerdictBanner.tsx:26-58` (summary prop, score column), `IntentCard.tsx:92-137` (card frame, footer), `PrBriefBlock.tsx` as implemented by G4, `brief/service.ts:180-189` (stored brief), `StructuredResult` usage fields (`adapters.ts:119-123`), `RunSummary` usage (`contracts/trace.ts:150-173`) served by `usePrRuns` (`lib/hooks/reviews.ts:39-47`), `lib/format-cost.ts` (`formatCostUsd`, no compact token formatter yet).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1–S8 | |
| `engineering-insights` | preload | Context applied | |
| `zod` | on demand (S1) | S1, S4, S7, S8 | |
| `typescript-expert` | on demand (S1) | S1–S11, S13, S14 | |
| `fastify-best-practices` | on demand (S7) | S7, S8 | |
| `drizzle-orm-patterns` | on demand (S5) | S5 | |
| `security` | on demand (S3) | S3, S4, S6–S8, S13 | |
| `frontend-architecture` | on demand (S9) | S9–S14 | |
| `react-best-practices` | on demand (S9) | S9–S11, S13, S14 | |
| `next-best-practices` | on demand (S9) | S9, S11–S14 | |
| `react-testing-library` | on demand (S10) | S10, S11, S13, S14 | |

G5/G6: `zod`, `typescript-expert`, `onion-architecture` → S15, S16; `frontend-architecture` → S17–S20; `next-best-practices` → S18, S20; `react-best-practices`, `react-testing-library` → S19, S20; `security` → S20.
G7: `next-best-practices`, `frontend-architecture` → S21–S24; `react-best-practices`, `typescript-expert`, `react-testing-library` → S22–S24; `security` → S22, S23.

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `contracts/brief.ts` (both copies) | ports | changed |
| server | `modules/_shared/diff-hunks.ts`, `context-paths.ts` | helpers | new |
| server | `modules/brief/*` | full module | new |
| server | `modules/intent/service.ts`, `intent/helpers.ts`, `reviews/helpers.ts` | application / helpers | changed |
| server | `platform/container.ts`, `modules/index.ts` | composition root | changed |
| client | `lib/hooks/brief.ts`, `lib/hooks/index.ts` | data layer | new / changed |
| client | `components/diff-viewer/*` | shared chrome | changed |
| client | PR route `DiffTab`, `SmartDiffGroup`, `OverviewTab`, `PrBriefBlock`, `page.tsx` | feature UI | changed / new |
| client | `messages/en/brief.json` | i18n | changed |
| client (G6) | `lib/format-cost.ts`; PR route `VerdictBanner`, `IntentCard` (slots); `PrBriefBlock/_components/CostLines` | helper · feature UI | changed / new |
| client (G7) | `PrBriefBlock` (+ new `_components/CoverageBlock`), `RiskList`, `IntentCard` (slot removed), `messages/en/brief.json` | feature UI · i18n | changed / new |

## Risks & open questions
- **G5/G6 assumptions.** The `K`/`M` token format, the IntentCard slot placed after the whole body (sources included), and the Review line showing "—" when the review's run is missing from `/pulls/:id/runs`. All three are read from designs 22/36/37 and AC-50; none needs a product decision.
- **G7 reverses part of G6.** AC-46's Risk-areas placement inside the Intent card (S19/S20) is reversed by S23/S24. The plan-verifier should check AC-46 against S23/S24 and T10, not against the G6 handoff. The reason copy for the 13 codes is my wording (assumption); unknown codes show no reason by design.
- **G4 behaviour under the new layout.** S20 restructures what T10/T11 assert. G4's verified behaviour (AC-2, 4, 7, 8, 31, 38, 42, 43) must keep passing in the rewritten T10, and the plan-verifier re-checks those items.
- **Tokenizer accuracy (AC-11).** Tokens are counted with one encoder (`cl100k_base`, or chars/4) for every provider, and `SCHEMA_TOKEN_RESERVE` is a fixed estimate of the `response_format` schema cost (X11). For some models the real input may differ slightly from the count.
- **Unconfirmed defaults (assumptions):** the blast caps (30/20/20), the 800-token schema reserve, and the binary-search cut of the description. The verifier checks them only against the plan.
- **Hidden transport retries (X9).** The SDK's own retries (up to 2) stack under `withRetry` (up to 3), and `attempts` does not show them. A transport retry resends the identical request, which spec 010 allows ("Transport retries" edge case), but the cost of one generation can exceed a single round trip.
- **LAN-triggered paid calls (X15).** Any LAN peer can trigger up to ~10 paid calls per minute, each on a different PR (the guard is per PR, the rate limit per client). This is the same stance as intent's classify POST; accepted.
- **Intent regression risk.** S6 touches intent classification. It is guarded by `intent-service.test.ts`, `intent.it.test.ts` and `intent-review.it.test.ts` (the last one runs in the main session's full `.it` pass).
- **Single API instance.** The in-process guard assumes one API instance, as onboarding does (`onboarding/service.ts:46-52`).

## Handed off
- architecture-reviewer: `_shared` moves + re-exports (S2), `IntentService.readLinkedIssues` (S6), structural dep ports (S3/S7), memoised container getter (S8).
- security review: paid LAN-reachable `POST /pulls/:id/brief` (rate limit + guard + explicit timeout), untrusted text into the prompt (S3) and the UI (S13), the forge issue fetch (S6), content-free success and failure logs (S7).
- G5/G6: no new trust boundary (stored usage is server-computed numbers; model text stays plain text in S20); architecture-reviewer may glance at the S19 slot props.
- G7: client only, no new trust boundary; refs in the coverage rows are repo paths and issue refs rendered as text (S22).

## Insights to record
None.

## Red-flags check
- [x] Every spec AC-n (AC-1..45) has a row in *Spec traceability*
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Assumptions marked; no open product gaps
- [x] Groups end type-checking; G2/G3 share no file
- [x] No group under 3 files / ~80 lines
- [x] Brief above the marker under ~20,000 characters
- [x] Execution mode multi-agent per rule
- [x] Every step's *Skills to apply* is complete
- [x] `sdd.sh plan-lint` prints `plan-lint: ok`

## Handoffs → G1

## Steps
| Step | Status | Files changed |
|---|---|---|
| S1 | done | both `vendor/shared/contracts/brief.ts` copies (same edit) |
| S2 | done | `_shared/diff-hunks.ts` (new), `_shared/context-paths.ts` (new), `intent/helpers.ts`, `reviews/helpers.ts`, `test/diff-hunks.test.ts` (new) |
| S3 | done | `brief/{constants,types,prompt,budget}.ts` (new), `test/brief-prompt.test.ts`, `test/brief-budget.test.ts` (new) |
| S4 | done | `brief/{grounding,helpers}.ts` (new), `test/brief-grounding.test.ts` (new) |

Deviations (trivial): `types.ts` declares `BriefRepoRow = typeof t.repos.$inferSelect` itself (S5 repository should re-export it from `./types.js`); `buildBriefMessages` is sync with an inline system prompt; `LineRange` is `{start, end}`.

Handoff (paths under `server/src/modules/`):
- Contract: `BriefInput`, `BriefInputStatus`, `BriefMissingInput {input,status,ref|null,reason|null}`, `ReviewFocusItem`, `BriefModel`, `PrBriefModelOutput`, `BriefFailureReason` (`no_key|over_budget|failed|in_progress`), `PrBriefView`; `PrBrief = {summary, risks: Risks, review_focus, missing_inputs, head_sha, generated_at, model, intent?, blast?, history?}`.
- `_shared/diff-hunks.ts`: `LineRange`, `changedLineRanges(patch)`, `headersFromPatch` (re-exported by `intent/helpers.ts`). `_shared/context-paths.ts`: `mergeContextPaths` (re-exported by `reviews/helpers.ts`).
- `brief/types.ts`: `BriefFacts`, `BriefFileFact`, `BriefBlastFacts`, `FitResult`, `TokenCounter`, `BriefRepoRow`, `BriefLogger`; ports `BriefIntentPort`, `BriefBlastPort`, `BriefSmartDiffPort`, `BriefAgentsPort`, `BriefContextPort`.
- `brief/constants.ts`: `BRIEF_INPUT_TOKEN_BUDGET`, `SCHEMA_TOKEN_RESERVE`, `BRIEF_SCHEMA_NAME`, `BRIEF_LLM_TIMEOUT_MS`, `BRIEF_MAX_OUTPUT_TOKENS`, `FOCUS_MAX`, `RISK_FILE_REFS_MAX`, `BLAST_*_MAX`, `TRIM_ORDER`, `TRIM_GROUP_INPUT`.
- `brief/prompt.ts`: `buildBriefMessages(facts): ChatMessage[]`.
- `brief/budget.ts`: `fitToBudget(facts, counter, budget?) → {facts, truncated}`; `capBlast(BriefBlastFacts) → {blast, truncated}` (service maps `BlastRadius` → facts first); `BriefBudgetError`.
- `brief/grounding.ts`: `normaliseRef`, `groundingContext(files, blast)`, `groundBrief(output, ctx) → {summary, risks: Risk[], review_focus}` (service wraps as `{risks}`).
- `brief/helpers.ts`: `classifyBriefError(err) → no_key|over_budget|failed`.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1–S4 | |
| `engineering-insights` | preload | not applied | read only; no insight to record |
| `zod` | on demand | S1, S4 | |
| `typescript-expert` | on demand | S1–S4 | |
| `security` | on demand | S3, S4 | |

Verification: brief.ts copies identical; server + client typecheck ok; server unit suite 58 files / 796 tests ok.

## Handoffs → G3

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S9 | done | `client/src/lib/hooks/brief.ts` (new), `client/src/lib/hooks/index.ts` |
| S10 | done | `client/src/components/diff-viewer/target.ts` (new), `index.ts`, `DiffViewer/DiffViewer.tsx`, `FileCard/FileCard.tsx`, `CodeLine/CodeLine.tsx`, `styles.ts`, `FileCard/FileCard.test.tsx` |
| S11 | done | `.../DiffTab/DiffTab.tsx`, `.../DiffTab/_components/SmartDiffGroup/SmartDiffGroup.tsx`, `.../DiffTab/DiffTab.test.tsx` |

Deviations (trivial): `fileHeaderFor(highlighted)` added to `styles.ts` (outline highlight; `s.fileHeader` left unused); `index.ts` also exports `TARGET_HIGHLIGHT_MS` and `DiffTarget`; a file closed and reopened by hand remounts `CodeLine` and re-applies the same nonce once.

Handoff:
- `client/src/lib/hooks/brief.ts`: `usePrBrief(prId): UseQueryResult<PrBriefView>` polls every 2 s while `generating`; `useGeneratePrBrief()` mutation (prId) — success writes the response into `["pr-brief", prId]`, error invalidates it. Exported from `@/lib/hooks` and importable as `@/lib/hooks/brief`.
- `@/components/diff-viewer` exports `DiffTarget {path, line: number|null, nonce}` and `TARGET_HIGHLIGHT_MS`.
- Optional `target?: DiffTarget | null` on `DiffViewer`, `FileCard`, `DiffTab`; `SmartDiffGroup` takes it, `DiffTab` passes it only to the group containing `target.path`.
- S14 must pass `target={diffTarget}` to `DiffTab`.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `react-best-practices` | on demand | S9–S11 | |
| `frontend-architecture` | on demand | S9–S11 | |
| `next-best-practices` | on demand | S9, S11 | |
| `typescript-expert` | on demand | S9–S11 | |
| `react-testing-library` | on demand | S10, S11 (tests) | |
| `onion-architecture`, `engineering-insights` | preload | not applied | server-only and wrap-up skills |

Verification: client typecheck ok; `vitest run FileCard DiffTab` 36 passed; client suite 67 files / 497 tests ok.

## Handoffs → G2

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S5 | done | `server/src/modules/brief/repository.ts` (new) |
| S6 | done | `server/src/modules/intent/service.ts`, `server/test/intent-service.test.ts` (T5) |
| S7 | done | `server/src/modules/brief/service.ts` (new), `server/test/brief-service.test.ts` (new, T6, 13 tests) |
| S8 | done | `server/src/modules/brief/routes.ts` (new), `server/src/platform/container.ts`, `server/src/modules/index.ts`, `server/test/brief.it.test.ts` (new, T7, 11 tests) |

Deviations (trivial): `repository.ts` re-exports `BriefRepoRow` from `types.ts`; `readLinkedIssues` also returns `outcomes` (per-link ok/failed, link order) so `runClassification` keeps `sources` order; `BriefService` takes an optional `now?: () => Date` dep for `generated_at`.

Handoff: `PrBriefView` per contract, `failure` = `no_key|over_budget|failed|in_progress|null`. GET/POST `/pulls/:id/brief` 404 only for an unknown PR; POST rate-limited 10/min; failed generation → 200 with `failure` and the stored brief unchanged; `generating` true while in flight; `stale` = stored `head_sha` ≠ PR head; old-shape row → `brief: null`.
Review notes: `container.brief` wires `agentsRepo`, `intent`, `blast`, `smartDiff`, `context` into structural ports; `BriefService` imports only `_shared` helpers; `IntentService.readLinkedIssues` now public; warn log `brief: failed reason=… err=<name>` only.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S5–S8 | |
| `engineering-insights` | preload | not applied | no new insight |
| `drizzle-orm-patterns` | on demand | S5 | |
| `fastify-best-practices` | on demand | S7, S8 | |
| `zod` | on demand | S7, S8 | |
| `typescript-expert` | on demand | S5–S8 | |
| `security` | on demand | S6–S8 | |

Verification: server typecheck ok; intent-service 11, brief-service 13 passed; brief.it + intent.it 18 passed; server unit suite 59 files / 812 tests ok.

## Handoffs → G4

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S12 | done | `client/messages/en/brief.json` |
| S13 | done | `…/_components/PrBriefBlock/` (new): `PrBriefBlock.tsx`, `index.ts`, `helpers.ts`, `constants.ts`, `styles.ts`, `PrBriefBlock.test.tsx`, `_components/RiskList/{RiskList.tsx,index.ts}`, `_components/FocusList/{FocusList.tsx,index.ts}` |
| S14 | done | `…/OverviewTab/OverviewTab.tsx`, `…/OverviewTab/OverviewTab.test.tsx`, `…/OverviewTab/styles.ts`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` |

Deviations (trivial): `index.ts` barrels for RiskList/FocusList; risk refs and focus items are buttons sharing one open handler (risk ref → `line: null`; path not in diff → `notInDiff` `role="status"`, no navigation); Generate/Refresh always in the header, "Try again" only in the failed alert, failed regenerate keeps the stored brief visible; `columns` moved from OverviewTab `styles.ts` into `PrBriefBlock/styles.ts`; old "no PR Brief" OverviewTab test rewritten as T11.
Review notes: `PrBriefBlock` owns the Intent/Blast cards; `page.tsx` holds `diffTarget`, `openInDiff` bumps the nonce and switches to the diff tab, `onSetTab` clears it; hooks imported from `@/lib/hooks/brief` and `@/lib/hooks/reviews`; model text rendered as plain text nodes (test: `![x](…) <img src=x>` renders literally).
Not verified by the implementer: end-to-end against the real server (G2 was running in parallel).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `react-best-practices` | on demand | S13, S14 | |
| `frontend-architecture` | on demand | S12–S14 | |
| `next-best-practices` | on demand | S12–S14 | |
| `typescript-expert` | on demand | S13, S14 | |
| `security` | on demand | S13 | |
| `react-testing-library` | on demand | S13, S14 tests | |
| `onion-architecture`, `engineering-insights` | preload | not applied | server-only and wrap-up skills |

Verification: `jq` 29 `prBrief` keys ok; client typecheck ok; PrBriefBlock + OverviewTab 8 passed; client suite 68 files / 504 tests ok.

## Follow-ups
- 2026-10-06 readLinkedIssues throw path + AC-2 header-button reading: see fix-loop 1 (H1); AC-2 accepted as met by plan-verifier
- 2026-10-06 SR2 (MEDIUM) brief/service.ts:308 — per-agent context-doc lookups run 2N sequential queries; use Promise.all or a batched repository method
- 2026-10-06 SR3 (MEDIUM) brief/routes.ts:33 — optional global concurrency cap on generate() beyond per-IP 10/min + per-PR guard (accepted risk, plan Risks X15)
- 2026-10-06 SR4 (LOW) brief/service.ts:203 — pr_files read twice per generation; reuse gathered files for grounding
- 2026-10-06 SR5 (LOW) intent/service.ts:215 — readLinkedIssues returns overlapping shapes; name a LinkedIssueOutcome type
- 2026-10-06 SR6 (LOW) PrBriefBlock.tsx — notInDiff notice not cleared on Refresh; no_key and generic error alerts can show together; verdict 'as Verdict' cast
- 2026-10-06 SR7 (LOW) CodeLine.tsx:43 highlight timer not restarted on repeat click; lib/hooks/brief.ts:23 unbounded polling while generating; page.tsx diffPaths not memoised
- 2026-10-06 sdd.sh delta writes a tree object (make_tree), so a read-only plan-verifier cannot run it — add a read-only variant or pass name-status in the prompt
- 2026-10-06 SR9: add format-cost.test.ts cases for 999_950 → 1.0M, 999.5 → 1.0K and a negative value (fix applied in main session without a test change)
- 2026-10-06 SR10 (MEDIUM, no change) PrBriefBlock open handler not memoised; notInDiff notice cleared only by a later successful open
- 2026-10-06 prBrief.status.{missing,partial,truncated,stale} keys in brief.json have no consumer after S23 (coverage block uses prBrief.coverage.*)
- 2026-10-06 designs 22/37 show Risk areas inside the Intent card; AC-46 reversed by the user (round 3) — keep the designs as historical reference only
- 2026-10-06 pr-self-review full branch 2026-10-06: PASS, 0 critical. HIGH follow-ups filed in plan 26 (onboarding SAFE_SCRIPT_RE leading -/.) and plan 25 (DocPreview remote images); pre-existing vendored contract drift (client knowledge/platform/trace lack AgentVersion*) — re-sync in a separate change. MEDIUM: context.list sequential token reads; repo-intel getIndexCoverage clone re-walk; MermaidDiagram global initialize race; AgentEditor nested ternary; ReadingPath pass-through

## Handoffs → G5

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S15 [Contract] | done | `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts` |
| S16 | done | `server/src/modules/brief/service.ts`, `server/test/brief-service.test.ts`, `server/test/brief.it.test.ts` |

Handoff: both `brief.ts` copies export `BriefUsage {tokens_in, tokens_out, cost_usd, cost_source}` (all nullable) and `PrBrief.usage?: BriefUsage` (optional for pre-G5 rows). `BriefService` stores `usage` on every generation. No client fixtures need to change.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S15, S16 | |
| `zod` | on demand | S15 | |
| `typescript-expert` | on demand | S15, S16 | |

Verification: brief.ts copies identical; server + client typecheck ok; brief-service 20, brief.it 15, server unit 824 passed.

## Handoffs → G6

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S17 | done | `client/src/lib/format-cost.ts` (`formatTokenFlow`), `client/src/lib/format-cost.test.ts` (T12) |
| S18 | done | `client/messages/en/brief.json` (`reviewFocus` reworded; `focusCount`, `cost.review`, `cost.brief`; 32 keys) |
| S19 | done | `…/VerdictBanner/{VerdictBanner.tsx,styles.ts,VerdictBanner.test.tsx}`, `…/IntentCard/{IntentCard.tsx,styles.ts,IntentCard.test.tsx}` (T13, T14) |
| S20 | done | `…/PrBriefBlock/{PrBriefBlock.tsx,helpers.ts,styles.ts,PrBriefBlock.test.tsx}`, `_components/RiskList/RiskList.tsx`, `_components/FocusList/FocusList.tsx`, `_components/CostLines/{CostLines.tsx,index.ts}` (new) |

Deviations (trivial): `OverviewTab.test.tsx` (an S14 file) gained a `usePrRuns` mock; FocusList count badge wrapped in `<span role="note" aria-label>` (vendored `Badge` has no aria-label), chevron is a rotated `ChevronDown`; `s.card` lost border/padding (banner and summary carry their own frames), obsolete `orderedList`/`iconButton` removed; RiskList/FocusList gated on `shown` so they hide while loading/busy/error (AC-4).
Review notes: `CostLines` takes `UsageValues` (alias of `BriefUsage`) from `PrBriefBlock/helpers.ts`; VerdictBanner/IntentCard slots import nothing from the brief module; model text still text nodes only. Layout compared to designs only through tests, not in a browser.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `typescript-expert` | on demand | S17, S19, S20 | |
| `frontend-architecture` | on demand | S17–S20 | |
| `next-best-practices` | on demand | S18, S20 | |
| `react-best-practices` | on demand | S19, S20 | |
| `security` | on demand | S20 | |
| `react-testing-library` | on demand | S19, S20 | |
| `onion-architecture`, `engineering-insights` | preload | not applied | server-only and wrap-up skills |

Verification: jq 32 keys ok; format-cost 11, VerdictBanner+IntentCard 11, PrBriefBlock+OverviewTab 19 passed; client typecheck ok; client suite 69 files / 522 tests.

## Handoffs → fix-3

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S20-change / SP-AC-30 | done | `…/PrBriefBlock/_components/FocusList/FocusList.tsx`, `…/PrBriefBlock/styles.ts` (`focusItem`, `focusBullet`), `…/PrBriefBlock/PrBriefBlock.test.tsx` |
| T13 | done | `…/VerdictBanner/VerdictBanner.test.tsx` |
| SK16 | done | none |

Each focus `li` is a flex row with an aria-hidden `▸` span (`data-testid="focus-bullet"`, `var(--accent-text)`) before the `file:line` button; the test asserts it per item. VerdictBanner test asserts `scoreFooter` shares the "PR SCORE" parent and follows it (`compareDocumentPosition`). Mutation check: both new assertions failed against broken code, restored.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `zod` | re-read on demand (SK16) | S16 (G5: `BriefUsage` usage stored from the result, parsed by `PrBrief`) | |
| `react-testing-library` | on demand | S19, S20 tests | |

Verification: PrBriefBlock + VerdictBanner 20 passed; client typecheck ok.

## Handoffs → G7

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S21 | done | `client/messages/en/brief.json` (22 new strings; `prBrief` 54) |
| S22 | done | `…/PrBriefBlock/_components/CoverageBlock/{CoverageBlock.tsx,index.ts,helpers.ts,helpers.test.ts}` (new) |
| S23 | done | `…/PrBriefBlock/{PrBriefBlock.tsx,helpers.ts,styles.ts,PrBriefBlock.test.tsx}`, `_components/RiskList/RiskList.tsx` |
| S24 | done | `…/IntentCard/{IntentCard.tsx,styles.ts,IntentCard.test.tsx}` |

Deviations (trivial): CoverageBlock styles live in `PrBriefBlock/styles.ts` (S23 file); `groupCoverage` adjusted for `noUncheckedIndexedAccess`; IntentCard kept an unused `import React`.
UI: CoverageBlock under the summary and stale note, nothing when `missing_inputs` is empty; Risk areas card uses the `focusCard` frame with an AlertTriangle heading and `riskCount` badge, rendered after the columns and before FocusList; IntentCard takes no children; `noteKey`/`notes` removed. Layout checked through tests only, not in a browser.
T10: keeps empty state, `▸` bullets, G4–G6 cases; asserts Risk areas absent from the Intent card and placed after Blast radius / before Review focus (`compareDocumentPosition`), "1 risk" badge; coverage cases (none, grouped specs "3 files not found in this repo" with toggle, partial + "repo not indexed", stale intent, truncated).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `next-best-practices`, `frontend-architecture` | on demand | S21–S24 | |
| `react-best-practices`, `typescript-expert`, `react-testing-library` | on demand | S22–S24 | |
| `security` | on demand | S22, S23 | |
| `onion-architecture`, `engineering-insights` | preload | not applied | server-only and wrap-up skills |

Verification: jq 54 ok; PrBriefBlock/OverviewTab/IntentCard/CoverageBlock 33 passed; client typecheck ok; client suite 70 files / 527.

## Verification log
- 2026-10-06 agent: spec-p1 a1432527c058905c4 spec-creator 2026-10-06T11:07:44Z
- 2026-10-06 agent: spec-p2 a1432527c058905c4 spec-creator 2026-10-06T11:11:59Z
- 2026-10-06 agent: research a9a746c1cca7a7c15 researcher 2026-10-06T11:16:19Z
- 2026-10-06 agent: plan-p1 a108c93edf4d19650 implementation-planner 2026-10-06T11:18:56Z
- 2026-10-06 decisions recorded: TQ1-5 defaults, GAP1-3 per REC1-3, D1-D7 A, D8 multi-agent
- 2026-10-06 agent: spec-p2 a1432527c058905c4 spec-creator 2026-10-06T11:21:39Z
- 2026-10-06 spec 010 re-approved after GAP1-3 closed
- 2026-10-06 agent: plan-p2 a108c93edf4d19650 implementation-planner 2026-10-06T11:34:24Z
- 2026-10-06 agent: plan-approve a52d7b0d93e410ea6 general-purpose 2026-10-06T11:44:14Z
- 2026-10-06 agent: plan-approve a731bdc216f767280 general-purpose 2026-10-06T11:50:14Z
- 2026-10-06 cross-model review (Sonnet 5.5 Y1-12, Fable 5.1 X1-15) triaged; spec back to draft for X3/X7/X11
- 2026-10-06 agent: spec-p2 a1432527c058905c4 spec-creator 2026-10-06T11:52:43Z
- 2026-10-06 spec 010 re-approved after X3/X7/X11 (AC-44, AC-45 added)
- 2026-10-06 agent: plan-p2 a108c93edf4d19650 implementation-planner 2026-10-06T11:58:51Z
- 2026-10-06 plan approved by user
- 2026-10-06 agent: implement a87ec07189bbfe7fc implementer 2026-10-06T12:04:06Z
- 2026-10-06 handback: unknown G1
- 2026-10-06 G1 done (S1-S4); server+client typecheck ok, server unit 796 passed
- 2026-10-06 G1 handback 'unknown' is a header mismatch (report used '| Step |', checker wants '| Step / gap |'); main session read the diff: files match S1-S4, typecheck + brief unit tests re-run green
- 2026-10-06 agent: implement ab0d6f32c2434c578 implementer 2026-10-06T12:08:08Z
- 2026-10-06 G3 done (S9-S11); client typecheck ok, client suite 497 passed
- 2026-10-06 agent: implement ab26268c8ef2a7fc5 implementer 2026-10-06T12:08:22Z
- 2026-10-06 G2 done (S5-S8); server typecheck ok, unit 812 passed, brief.it+intent.it 18 passed
- 2026-10-06 agent: implement aa6fde79461c8f92d implementer 2026-10-06T12:10:36Z
- 2026-10-06 G4 done (S12-S14); client typecheck ok, client suite 504 passed
- 2026-10-06 agent: tests a41ecb172f3f3a197 test-writer 2026-10-06T12:14:07Z
- 2026-10-06 test-writer: T1-T11 present and green; 14 trust-boundary/negative cases added, 6 break checks reverted (shasum ok)
- 2026-10-06 it-suite (main session): server .it 29 files / 246 tests passed; client suite 69 files / 510 passed
- 2026-10-06 agent: review a99e9d32fab69d639 architecture-reviewer 2026-10-06T12:16:22Z
- 2026-10-06 agent: review aaa1210e9759f3090 security-reviewer 2026-10-06T12:16:31Z
- 2026-10-06 agent: review ad29968867fe0f3e4 plan-verifier 2026-10-06T12:18:51Z
- 2026-10-06 review-1: plan-verifier incomplete (154/158; partial T3, T6, T10; R4 not-verifiable); architecture PASS (F1 non-blocking); security PASS (no findings)
- 2026-10-06 R4 evidence (test-writer Proof): break checks on brief/grounding.ts (allowed-file guard), brief/repository.ts (workspaceId filter in getPull), brief/service.ts (inFlight.delete on success only; rationale leaked into title), PrBriefBlock.tsx (diffPaths.includes guard), lib/hooks/brief.ts (refetchInterval always) - each failed its target tests and was restored, shasum matched the pre-mutation hash
- 2026-10-06 agent: fix-loop a39b05c211ae1ed21 implementer 2026-10-06T12:20:20Z
- 2026-10-06 fix-loop 1: T3, T6, T10, F1, H1, SEC1 done (implementer); server unit 822, client src/app/repos 267 passed
- 2026-10-06 main session: brief.it + intent.it re-run after fix-loop 1 green
- 2026-10-06 agent: review ad33629a29fe16d87 plan-verifier 2026-10-06T12:22:23Z
- 2026-10-06 review-2 (delta): plan-verifier complete — 158/158 met, no gaps, no sign-off items
- 2026-10-06 agent: docs a98c066f2911f2fee doc-writer 2026-10-06T12:23:42Z
- 2026-10-06 docs: docs/pr-brief.md + docs/README.md row (doc-writer)
- 2026-10-06 insights: server/INSIGHTS.md (type-only db/schema import edge) + gotchas item; root INSIGHTS.md (test rows' Covers vs assertions)
- 2026-10-06 metrics: usage-scan + flags (F3 x1, 0 repeats); cost report in docs/plans/assets/28-pr-brief/cost-report.md
- 2026-10-06 self-review: PASS (0 critical, 1 HIGH budget.ts:107 O(n^2) trim, 2 MEDIUM, 9 LOW); typecheck + server unit 822 + client 513
- 2026-10-06 self-review HIGH SR1 (budget.ts:107 O(n^2) trim) sent to fix mode by user decision
- 2026-10-06 agent: fix-loop a5c3392ccf2f5f1c2 implementer 2026-10-06T12:28:26Z
- 2026-10-06 fix-loop 2: SR1 done; main session: server unit 823 passed, brief.it green
- 2026-10-06 agent: review aa0ee52bfc21aa7b3 plan-verifier 2026-10-06T12:30:11Z
- 2026-10-06 review-4 (delta after SR1): plan-verifier complete — 158/158, AC-11/12/13/44/45 re-checked
- 2026-10-06 self-review state refreshed after SR1: PASS, 0 critical, 0 high
- 2026-10-06 main-session fix (user request, post-done): PR Brief empty state — PrBriefBlock.tsx shows brief.unavailable + unavailableHint (previously unused root keys, hint reworded) while no brief and no failure; test added to PrBriefBlock.test.tsx (break check: fails without the block); 3 files (S12/S13), over the 1-file trivial threshold — done in main session at the user's direct request; client typecheck ok, client suite 514 passed
- 2026-10-06 design-conformance round (user, after live check vs designs 22/36/37): summary inside VerdictBanner; review-run cost + brief-generation cost under PR SCORE; Risk areas inside the Intent card; Review focus as a full-width card below the columns. Spec and plan back to draft
- 2026-10-06 agent: spec-p2 a1432527c058905c4 spec-creator 2026-10-06T17:03:21Z
- 2026-10-06 spec 010 re-approved (design conformance, AC-46..50)
- 2026-10-06 agent: plan-p2 a108c93edf4d19650 implementation-planner 2026-10-06T17:07:37Z
- 2026-10-06 plan re-approved with G5/G6 (planner assumptions accepted: K/M token format, Risk areas after the Intent card body, Review line '—' when the run is missing)
- 2026-10-06 agent: implement ab4d2fc3e67b8a9c2 implementer 2026-10-06T17:09:41Z
- 2026-10-06 G5 done (S15-S16); typecheck ok, server unit 824, brief.it 15
- 2026-10-06 agent: implement af9a364e1c334cfa5 implementer 2026-10-06T17:12:27Z
- 2026-10-06 G6 done (S17-S20); client typecheck ok, client suite 522 passed
- 2026-10-06 it-suite after G5/G6 (main session): see result line
- 2026-10-06 it-suite after G5/G6: server .it 29 files / 247 tests passed; client 522 passed
- 2026-10-06 agent: review aa387e8232b6bbb38 architecture-reviewer 2026-10-06T17:14:13Z
- 2026-10-06 review-5: architecture-reviewer PASS on G5/G6 (no findings)
- 2026-10-06 agent: review a5e22323cb485347d plan-verifier 2026-10-06T17:15:56Z
- 2026-10-06 review-5 delta: plan-verifier incomplete (partial S20/AC-30 bullets, T13 placement; missing SK16; D16c needs main run)
- 2026-10-06 D16c (main session): server unit suite 59 files / 824 passed
- 2026-10-06 agent: fix-loop aa8f8762e9ae7a040 implementer 2026-10-06T17:16:55Z
- 2026-10-06 fix-loop 3 done (S20/AC-30 bullets, T13 placement, SK16); client suite re-run
- 2026-10-06 agent: review a38c86743bb113f31 plan-verifier 2026-10-06T17:18:14Z
- 2026-10-06 review-6 (delta after fix-3): plan-verifier complete — no gaps, no sign-off items; AC-1..50 met
- 2026-10-06 insights: root INSIGHTS checkpoint entry extended (read-only reviewers cannot run sdd.sh delta; recipe)
- 2026-10-06 agent: self-review a2d5072aa8eb66a80 general-purpose 2026-10-06T17:19:24Z
- 2026-10-06 self-review G5/G6: PASS (0 critical, 3 MEDIUM)
- 2026-10-06 main-session fix: SR8 FocusList.tsx re-indent (S20, formatting only)
- 2026-10-06 main-session fix: SR9 format-cost.ts compactTokens rounds at display precision before choosing the unit (999_950 → 1.0M, 999.5 → 1.0K) and clamps negatives (S17, 5 lines); client typecheck ok, client suite re-run
- 2026-10-06 user round 3 (live check): (1) restyle the missing-inputs notes as a titled coverage block with grouped rows and status chips; (2) Risk areas move out of the Intent card into a full-width card on the Review focus level. Spec and plan back to draft
- 2026-10-06 agent: spec-p2 a1432527c058905c4 spec-creator 2026-10-06T17:47:44Z
- 2026-10-06 spec 010 re-approved (round 3: AC-13, AC-22, AC-46, AC-47)
- 2026-10-06 agent: plan-p2 a108c93edf4d19650 implementation-planner 2026-10-06T17:50:22Z
- 2026-10-06 plan re-approved with G7 (reason wording assumption accepted)
- 2026-10-06 agent: implement ae7df45097a299290 implementer 2026-10-06T17:52:31Z
- 2026-10-06 G7 done (S21-S24); main session: client typecheck ok, client suite 70 files / 527 passed (server untouched since review-6: unit 824, .it 247)
- 2026-10-06 agent: review a76e1807ba79bb77a plan-verifier 2026-10-06T17:55:09Z
- 2026-10-06 review-7 (delta after G7): plan-verifier complete — 46/46 delta items, AC-1..50 met, no gaps, no sign-off
- 2026-10-06 agent: self-review af320ae269c3df3b1 general-purpose 2026-10-06T18:11:05Z
- 2026-10-06 agent: self-review a5146dd8f58f84662 general-purpose 2026-10-06T18:11:05Z
- 2026-10-06 agent: self-review a250de5bc86fd5d37 general-purpose 2026-10-06T18:11:06Z
- 2026-10-06 agent: self-review a988daa8b8ffed5d4 general-purpose 2026-10-06T18:11:06Z
- 2026-10-06 agent: self-review a3539d9c3c414068a general-purpose 2026-10-06T18:11:06Z
- 2026-10-06 agent: self-review a57b004540459fdba general-purpose 2026-10-06T18:11:06Z
- 2026-10-06 agent: self-review a35742bd40aa5cf02 general-purpose 2026-10-06T18:11:06Z
- 2026-10-06 closing process gaps (user): test-writer for G5-G7, doc-writer refresh of docs/pr-brief.md, self-review analyzers logged for the cost report
- 2026-10-06 agent: docs ae98f998acc0a11c2 doc-writer 2026-10-06T18:12:26Z
- 2026-10-06 docs: docs/pr-brief.md refreshed for G5-G7 (usage, cost lines, coverage block, card layout, binary-search budget, attached-specs setup); docs/README.md row updated
- 2026-10-06 agent: tests ad1a8064905a4a479 test-writer 2026-10-06T18:13:07Z
- 2026-10-06 test-writer G5-G7: AC→assertion map for AC-13/22/28/30/32/33/46-50; 7+1+1+2 cases added (PrBriefBlock, VerdictBanner, CoverageBlock helpers, format-cost incl. SR9 regression); Proof: 6 break checks (format-cost rounding + clamp, CoverageBlock isKnown, VerdictBanner summary, CostLines null-only dash, CostLines conditional Brief line) failed their targets and were restored (shasum ok), 3/3 stable
- 2026-10-06 agent: review aa82150b9427d5bc1 plan-verifier 2026-10-06T18:14:58Z
- 2026-10-06 review-9 (delta after test-writer + doc-writer): plan-verifier complete — 17/17, only tests/docs changed, AC-13/22/28/30/32/33/46-50 pinned, R4 Proof present. Removed log line: duplicate 'agent: self-review a2d5072aa8eb66a80' (main-session dedupe, intentional)
- 2026-10-06 workflow retro written: docs/plans/assets/28-pr-brief/workflow-retro.md (main session; proposals P1-P9)
