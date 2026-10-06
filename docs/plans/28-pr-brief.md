# Development Plan: PR Brief (risk brief)
Status: approved
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
| AC-13 | S3, S13, T3, T10 |
| AC-14 | S7, T6 |
| AC-15 | S7, T6 |
| AC-16 | S7, T6 |
| AC-17 | S7, T6 |
| AC-18 | S7, T6 |
| AC-19 | S5, S7, T6, T7 |
| AC-20 | S7, T6 |
| AC-21 | S6, S7, T5, T6 |
| AC-22 | S13, T10 |
| AC-23 | S4, T4 |
| AC-24 | S2, S4, T1, T4 |
| AC-25 | S4, T4 |
| AC-26 | S4, T4 |
| AC-27 | S4, S13, T4, T10 |
| AC-28 | S13, T10 |
| AC-29 | S13, T10 |
| AC-30 | S13, T10 |
| AC-31 | S13, T10 |
| AC-32 | S13, T10 |
| AC-33 | S13, T10 |
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

## Prerequisites
Docker for the `.it` tier. No new dependencies.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S4 | shared contract + client mirror · server `_shared` + `brief` pure helpers | — | new exports of S1–S4 and their signatures |
| G2 | S5–S8 | server repository · intent · brief service · routes/DI | G1 | `PrBriefView` as served, `failure` values |
| G3 | S9–S11 | client hooks · `diff-viewer` · DiffTab | G1 | `usePrBrief`/`useGeneratePrBrief`; `DiffTarget` + `target` props |
| G4 | S12–S14 | client i18n · PrBriefBlock · OverviewTab + page | G3 | — |

G2 and G3 share no package or file and may run in parallel after G1. `…` below = `client/src/app/repos/[repoId]/pulls/[number]/_components`.

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

## Migrations & contracts
No migration (TQ1). Contract `brief.ts` reshaped in S1, mirrored in the same step.

## Out of scope
- PR history in the brief, MCP tool, auto-regeneration, intent classification during generation.
- Changes to `reviewer-core`, `mcp-server`, `e2e`, `run-executor.ts` behaviour, the Intent/Blast cards' internals, `pr_files` refresh.
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

## Risks & open questions
- **Tokenizer accuracy (AC-11).** Tokens are counted with one encoder (`cl100k_base`, or chars/4) for every provider, and `SCHEMA_TOKEN_RESERVE` is a fixed estimate of the `response_format` schema cost (X11). For some models the real input may differ slightly from the count.
- **Unconfirmed defaults (assumptions):** the blast caps (30/20/20), the 800-token schema reserve, and the binary-search cut of the description. The verifier checks them only against the plan.
- **Hidden transport retries (X9).** The SDK's own retries (up to 2) stack under `withRetry` (up to 3), and `attempts` does not show them. A transport retry resends the identical request, which spec 010 allows ("Transport retries" edge case), but the cost of one generation can exceed a single round trip.
- **LAN-triggered paid calls (X15).** Any LAN peer can trigger up to ~10 paid calls per minute, each on a different PR (the guard is per PR, the rate limit per client). This is the same stance as intent's classify POST; accepted.
- **Intent regression risk.** S6 touches intent classification. It is guarded by `intent-service.test.ts`, `intent.it.test.ts` and `intent-review.it.test.ts` (the last one runs in the main session's full `.it` pass).
- **Single API instance.** The in-process guard assumes one API instance, as onboarding does (`onboarding/service.ts:46-52`).

## Handed off
- architecture-reviewer: `_shared` moves + re-exports (S2), `IntentService.readLinkedIssues` (S6), structural dep ports (S3/S7), memoised container getter (S8).
- security review: paid LAN-reachable `POST /pulls/:id/brief` (rate limit + guard + explicit timeout), untrusted text into the prompt (S3) and the UI (S13), the forge issue fetch (S6), content-free success and failure logs (S7).

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
