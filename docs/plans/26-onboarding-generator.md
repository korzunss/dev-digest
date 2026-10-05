# Development Plan: Onboarding Tour generator
Status: in-progress
Save as: docs/plans/26-onboarding-generator.md
Spec: specs/009-onboarding-generator.md
Execution: multi-agent

## Spec traceability
Test ids (TS = server, TC = client) are defined in *Tests*.
| Spec AC | Covered by |
|---|---|
| AC-1 | S14 · TC1 |
| AC-2 | S14 · TC1 |
| AC-3 | S14, S16 · TC1, TC2 |
| AC-4 | S2, S3, S5, S11 · TS3, TS6 |
| AC-5 | S3, S6, S10, S18 · TS2, TC6 |
| AC-6 | S3, S6, S10, S18 · TS2, TC6 |
| AC-7 | S6, S17 · TS2, TC10 |
| AC-8 | S3, S6, S17 · TS2, TC2, TC10 |
| AC-9 | S9, S11 · TS6 |
| AC-10 | S4, S5, S9 · TS3, TS5 |
| AC-11 | S4, S10, S19 · TS4, TC9 |
| AC-12 | S11, S12, S13 · TS6, TC2 |
| AC-13 | S11, S12, S13, S16 · TS6, TC2 |
| AC-14 | S10 · TS4 |
| AC-15 | S6, S10, S19 · TS4, TC9 |
| AC-16 | S10 · TS4 |
| AC-17 | S10, S17 · TS4, TC7 |
| AC-18 | S6, S11, S16 · TS2, TS6, TC2 |
| AC-19 | S11, S13, S16 · TS6, TC2 |
| AC-20 | S7, S11, S16 · TS6, TC2 |
| AC-21 | S6, S7, S11, S16 · TS2, TS6, TC2 |
| AC-22 | S6, S11, S16 · TS2, TS6, TC2 |
| AC-23 | S2, S3, S6, S16 · TS2, TS6, TC3 |
| AC-24 | S6, S11, S16 · TS6, TC2 |
| AC-25 | S7, S11 · TS6 |
| AC-26 | S11, S16 · TS6, TC3 |
| AC-27 | S11, S16 · TS6, TC2 |
| AC-28 | S16 · TC4 |
| AC-29 | S16 · TC5 |
| AC-30 | S19 · TC8 |
| AC-31 | S6, S18 · TC6 |
| AC-32 | S16 · TC3 |
| AC-33 | S5, S9 · TS5 |
| AC-34 | S10, S17, S19 · TS4, TC7, TC9 |
| AC-35 | S1, S9, S17 · TS4, TC7 |
| AC-36 | S11, S16 · TS6, TC3 |
| AC-37 | S6, S15, S17 · TS2, TC10 |

## Decisions needed
None open — see *Decisions recorded*.

## Decisions recorded
2026-10-05, user (main session):
- TQ1–TQ5 defaults accepted (TQ5: designs copied to `docs/plans/assets/26/onboarding-tour-{1,2}.png`).
- D1–D11: recommended options (D1 A, D2 A, D3 A, D4 A, D5 A, D6 A, D7 A, D8 A, D9 B, D10 A, D11 A). D12: multi-agent.
- GAP1: a failed clone offers Re-clone via `POST /repos/:id/refresh`. GAP2: coverage M = source files of indexed languages (JS/TS universe); a partial caused by parse/graph errors shows its reason. GAP3: First tasks shows the 1–2 tasks that survived grounding with a note "only N tasks could be tied to files"; zero → "not available" with cause (AC-37). GAP4: skeleton reading-path / critical-path rows show a deterministic reason computed from the graph (rank, importer count, chain). → spec-creator, SPEC-09 re-approved before pass 2.

## Prerequisites
- SPEC-09 as amended 2026-10-05 (AC-5, 6, 11, 15, 16, 21, 23, 34). Designs: `docs/plans/assets/26/onboarding-tour-{1,2}.png`. Review: `docs/plans/assets/26/cross-model-review.md` (all items applied).
- No new dependency. Docker only for T1's `.it` file (skips via `dockerAvailable()`, `server/test/helpers/pg.ts`).

## Step groups
Sequential. Each group's commit gate: typecheck + unit suite (`--exclude '**/*.it.test.ts'` on the server). The implementer writes no AC tests (D9 B); it fixes tests it breaks and writes S8 (D10 A).
| Group | Steps | Package / layer | Runs after | Handoff | Commit subject |
|---|---|---|---|---|---|
| G1 | S1 | shared + mirror | — | tour schemas; old `Onboarding*` gone | `feat(shared): onboarding tour contract (SPEC-09)` |
| G2 | S2–S3 | server repo-intel | G1 | 3 new facade reads | `feat(repo-intel): graph, endpoint and coverage reads for the onboarding tour` |
| G3 | S4–S8 | server onboarding core | G2 | facts, helpers, repository, LLM schema | `feat(onboarding): deterministic facts, skeleton and repository` |
| G4 | S9–S12 | server LLM + API | G3 | `GET /repos/:id/onboarding`, `POST …/onboarding/generate` (always 200) | `feat(onboarding): one structured LLM call, grounding and the tour API` |
| T1 | test-writer | server tests + test helpers | G4 | TS2–TS6, `helpers/llm-stubs.ts`, `helpers/temp-clone.ts` | `test(onboarding): server acceptance tests from SPEC-09` |
| G5 | S13–S16 | client data, shell, page | T1 | hooks, page frame, i18n | `feat(client): onboarding tour page, hooks and sidebar entry` |
| G6 | S17–S19 | client sections | G5 | section components | `feat(client): onboarding tour sections` |
| T2 | test-writer | client tests | G6 | TC1–TC10 | `test(client): onboarding tour acceptance tests from SPEC-09` |

## Steps
Server `M/` = `server/src/modules/onboarding/`; client `P/` = `client/src/app/repos/[repoId]/onboarding-tour/`.

### S1 — Replace the `Onboarding` contract with the tour contract and mirror it  [Contract]
- **ACs:** AC-5, 6, 11, 13, 18–27, 35, 36, 37 (shape)
- **Files:** `server/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/contracts/knowledge.ts`, `server/test/contracts.test.ts` (all modify)
- **Change:** delete knowledge.ts:28-48 (old block); add Design notes → *Contract* as a new section placed **after** `export type Provider` (server :370, client :368), between `// ---- Onboarding tour ----` and `// ---- end Onboarding tour ----`. Contracts test (:138-148): import and title use `OnboardingTour`, parse a minimal tour.
- **Layer / why here:** ports; shared first, targeted mirror.
- **Skills to apply:** `onion-architecture`, `zod`, `typescript-expert`
- **Practices:** schema + `z.infer` type together; `z.enum` for fixed sets; `.nullable()` for always-sent keys; no new import in knowledge.ts (`Provider` is declared above the block — X1); hand-copy only this block.
- **Known gotchas:** vendored copies drift and `TS2719` after a contract change — root INSIGHTS 2026-09-17 (both entries); a `const` used above its declaration is a TDZ crash at import.
- **Done when:** `cd server && pnpm typecheck` · `cd client && pnpm typecheck` · `cd server && pnpm exec vitest run contracts` · `diff <(sed -n '/^\/\/ ---- Onboarding tour ----/,/^\/\/ ---- end Onboarding tour ----/p' server/src/vendor/shared/contracts/knowledge.ts) <(sed -n '/^\/\/ ---- Onboarding tour ----/,/^\/\/ ---- end Onboarding tour ----/p' client/src/vendor/shared/contracts/knowledge.ts)` prints nothing · `git diff --stat client/src/vendor` lists only `knowledge.ts`.

### S2 — Repo-intel repository: importers, edge count, endpoint facts, raw stats
- **ACs:** AC-4, 5, 6, 8, 23
- **Files:** `server/src/modules/repo-intel/repository.ts` (modify)
- **Change:** add `countImporters(repoId, paths)` (`file_edges` grouped by `to_file`), `countEdges(repoId)`, `getEndpointFacts(repoId, limit)` (`file_facts` with non-empty `endpoints`), `getIndexStats(repoId)` (`repo_index_state.stats` or null); `getRankedPaths` (:463-473) gains secondary `orderBy(filePath)` (X13).
- **Layer / why here:** repository owns `db/schema`.
- **Skills to apply:** `onion-architecture`, `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`
- **Practices:** typed `select({...})`; empty `paths` ⇒ `[]` (as :442-448); no migration.
- **Known gotchas:** FK columns carry no index — server gotchas *DB & migrations* (`file_edges` has `(repoId, toFile)`).
- **Done when:** `cd server && pnpm typecheck`.

### S3 — Repo-intel facade: graph stats, endpoints, coverage; junk-free critical roots
- **ACs:** AC-4, 5, 6, 8, 23
- **Files:** `server/src/modules/repo-intel/types.ts`, `server/src/modules/repo-intel/service.ts` (modify)
- **Change:** add and implement `getFileGraphStats`, `getEndpoints`, `getIndexCoverage` (Design notes → *Facade reads*); `getCriticalPaths` (service.ts:786-829) filters junk from the ranked list **before** taking the `CRITICAL_PATH_ROOTS` roots, and skips junk hops (Y7).
- **Layer / why here:** facade via `container.repoIntel`; order on `file_rank.rank` = `pagerank*(1+hotness)` (D6, db/schema/repo-intel.ts:96-98).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** flag off ⇒ `[]`/nulls (service.ts:768); never throw; only `walkClone` added from `pipeline/`.
- **Known gotchas:** missing row = synthesised `degraded/no_data` (service.ts:194-211); incremental runs drop `totalCandidates` and double-count `filesIndexed` (pipeline/incremental.ts:244-258).
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run repo-intel indexer`.

### S4 — Onboarding constants and types
- **ACs:** AC-5, 6, 10, 11
- **Files:** `M/constants.ts`, `M/types.ts` (create)
- **Change:** Design notes → *Constants*; `CloneFacts`, `OnboardingFacts`; `OnboardingLlmOutput` (Design notes → *LLM schema*).
- **Layer / why here:** module config/types.
- **Skills to apply:** `onion-architecture`, `zod`, `typescript-expert`
- **Practices:** LLM schema flat — no `.min/.max`, `.regex`, unions, `.nullable()`, `.optional()` (R3); counts enforced in S10.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck`.

### S5 — Deterministic clone facts
- **ACs:** AC-4, 7, 10, 33
- **Files:** `M/facts.ts` (create)
- **Change:** `collectCloneFacts(cloneDir): Promise<CloneFacts>` per Design notes → *Clone facts*.
- **Layer / why here:** clone read beside its consumer, like `conventions/samples.ts:16-19`.
- **Skills to apply:** `onion-architecture`, `security`, `typescript-expert`, `zod`
- **Practices:** `readdir({withFileTypes: true})`, skip symlinked files **and** dirs; `realpath` containment (both sides resolved); size cap; never under `.git/`; `JSON.parse` in try then `safeParse`; ENOENT/EACCES ⇒ empty facts; caps before return.
- **Known gotchas:** committed symlink → `.git/config` (forge PAT) and realpath must resolve both sides — server gotchas *Security* (INSIGHTS 2026-10-05, 2026-09-22).
- **Done when:** `cd server && pnpm typecheck`.

### S6 — Pure helpers
- **ACs:** AC-5, 6, 7, 8, 15, 18, 21, 22, 23, 24, 31, 37
- **Files:** `M/helpers.ts` (create)
- **Change:** the functions in Design notes → *Helpers*.
- **Layer / why here:** pure logic.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** no I/O, `now` passed in; skeleton reasons are data, worded by client i18n (GAP4); error classes imported from `@devdigest/reviewer-core` and `platform/errors.js` (X11).
- **Known gotchas:** `JUNK_PATH_PATTERNS` misses root `test/` and generated dirs (repo-intel/service.ts:839-854) — don't reuse it.
- **Done when:** `cd server && pnpm typecheck`.

### S7 — Onboarding repository
- **ACs:** AC-20, 21, 25
- **Files:** `M/repository.ts` (create)
- **Change:** `getRepo(ws, repoId)`; `getLatestCloneJob(repoId)` (`jobs` kind `CLONE_JOB_KIND` from `../repos/constants.js` (X21), `payload->>'repoId'`, newest `scheduled_at`; D8); `getTour(repoId)`; `upsertTour(repoId, json)` (`onConflictDoUpdate` on `repo_id`, `generated_at = now()`, AC-25).
- **Layer / why here:** the module's only `db/schema` file.
- **Skills to apply:** `onion-architecture`, `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`
- **Practices:** workspace-scoped `getRepo`; jsonb filter with a bound `sql` parameter.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck`.

### S8 — Architecture-invariant test (D10)
- **ACs:** none (invariants, D10 A)
- **Files:** `server/test/onboarding-architecture.test.ts` (create)
- **Change:** assert Design notes → *Invariants* on the parsed imports of every `M/*.ts`.
- **Layer / why here:** unit; no depcruise gate (root INSIGHTS 2026-09-26).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** match parsed `import … from '…'` specifiers, not substrings.
- **Known gotchas:** `rg` edge checks catch comments — root INSIGHTS 2026-09-27.
- **Done when:** `cd server && pnpm exec vitest run onboarding-architecture` · `cd server && pnpm typecheck`.

### S9 — Prompt rewrite and bounded messages
- **ACs:** AC-9, 10, 33, 35
- **Files:** `server/src/prompts/onboarding.system.md` (modify) · `M/prompt.ts` (create)
- **Change:** prompt per Design notes → *Prompt* (only `{{language}}`; no `{{sections}}` — Y11); `buildOnboardingMessages(facts)` = `renderPrompt('onboarding.system.md', {language})` (platform/prompts.ts:40) + user `wrapUntrusted('onboarding-facts', JSON.stringify(boundedFacts))`.
- **Layer / why here:** module prompt, like `conventions/prompt.ts`.
- **Skills to apply:** `onion-architecture`, `security`, `typescript-expert`, `mermaid-diagram`
- **Practices:** repo-derived strings only inside the untrusted block; no file contents (AC-10).
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `grep -q 'untrusted' server/src/prompts/onboarding.system.md`.

### S10 — Grounding of the model output
- **ACs:** AC-5, 6, 11, 14, 15, 16, 17, 34, 35
- **Files:** `M/grounding.ts` (create)
- **Change:** `groundTour(output, ctx)` per Design notes → *Grounding* (command allowlist per AC-16, image stripping per AC-34).
- **Layer / why here:** pure, like `conventions/grounding.ts`.
- **Skills to apply:** `onion-architecture`, `security`, `typescript-expert`
- **Practices:** no I/O; deterministic order for path rows; allowlist, never denylist.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck`.

### S11 — Onboarding service
- **ACs:** AC-4, 9, 12, 13, 18, 19, 20, 21, 22, 24, 25, 26, 27, 36
- **Files:** `M/service.ts` (create)
- **Change:** `getView`, `generate` per Design notes → *Service*; one `completeStructured` with `maxRetries: 0, temperature: 0, requireParameters: true, timeoutMs, maxTokens, signal: AbortSignal.timeout(timeoutMs)` (TQ1, X3).
- **Layer / why here:** application; everything via `container.*`.
- **Skills to apply:** `onion-architecture`, `security`, `typescript-expert`, `zod`
- **Practices:** guard check-and-add before the first `await` (X5); no SDK/adapter import; `resolveFeatureModel` the only cross-module service import; never a 500 except 404 (X19); stored messages capped, no keys; `safeParse` the stored row.
- **Known gotchas:** only `signal` aborts an OpenRouter call; `withTimeout` does not abort — server gotchas *Git & diffs*; LAN-reachable routes — server gotchas *Security*.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run onboarding-architecture`.

### S12 — Routes and module registration
- **ACs:** AC-12, 13, 20
- **Files:** `M/routes.ts` (create) · `server/src/modules/index.ts` (modify: one import, one entry)
- **Change:** one service per plugin. `GET /repos/:id/onboarding` → view or `NotFoundError`. `POST /repos/:id/onboarding/generate` (`rateLimit` 10/min) → **200 + view in every case** (X2); "did not start" is visible in `view.generating` / `view.clone.state`.
- **Layer / why here:** transport.
- **Skills to apply:** `onion-architecture`, `fastify-best-practices`, `zod`, `typescript-expert`
- **Practices:** `IdParams` + `getContext` as `conventions/routes.ts:64-75`; no logic/DB/SDK; no body schema.
- **Known gotchas:** a body schema on a body-less POST gives 422 (conventions/routes.ts:36-41).
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`.

### S13 — Client hooks
- **ACs:** AC-12, 13, 19
- **Files:** `client/src/lib/hooks/onboarding.ts` (create)
- **Change:** `useOnboardingTour(repoId)` (key `["onboarding-tour", repoId]`, poll 2 s only while `generating`); `useGenerateOnboardingTour()` → `setQueryData` with the returned view (always 200, X2; `api.ts:43-57` throws on non-2xx). Reuse `useRefreshRepo` (hooks/core.ts:81), `useResyncRepoIntel` (hooks/repo-intel.ts:40).
- **Layer / why here:** data layer.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`
- **Practices:** one hook per endpoint; the query never POSTs.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm typecheck`.

### S14 — Sidebar entry and active-item fix
- **ACs:** AC-1, 2, 3
- **Files:** `client/src/vendor/ui/nav.ts` (modify: one item) · `client/src/components/app-shell/helpers.ts` (modify)
- **Change:** WORKSPACE, between `pulls` and `context`: `{ key: "onboarding-tour", label: "Onboarding Tour", icon: "Workflow", href: "/repos/:repoId/onboarding-tour" }` + the `// Signed-off exception (spec 009) …` comment used for `context`. `activeKeyFor` (helpers.ts:29): `includes("/onboarding")` → `includes("/onboarding-tour")`.
- **Layer / why here:** shell; sanctioned vendored edit (SPEC-09).
- **Skills to apply:** `frontend-architecture`, `typescript-expert`
- **Practices:** no other `vendor/**` line changes.
- **Known gotchas:** nav.ts edit is disposable — client gotchas *UI*, INSIGHTS 2026-09-22.
- **Done when:** `cd client && pnpm typecheck` · `grep -q 'onboarding-tour' client/src/vendor/ui/nav.ts` · `git diff --stat client/src/vendor` lists only `nav.ts` (Y15).

### S15 — i18n namespace `onboarding`
- **ACs:** AC-11, 18, 20–23, 26, 27, 30, 32, 36, 37
- **Files:** `client/messages/en/onboarding.json` (modify: replace stale keys)
- **Change:** exactly this key tree (Y10), copy in Design notes → *Copy*: `title`, `onThisPage`, `sections.{architecture,criticalPaths,runLocally,readingPath,firstTasks}`, `actions.{generate,regenerate,generating,shareLink,linkCopied,open,copy,copied,copyFailed,reclone,resync,settingsModels}`, `header.{willUse,subtitle,coverage,stale}`, `partialCause.{file_cap,parse_errors,graph_failed,soft_budget}`, `indexStatus.{full,partial,degraded,failed}`, `indexReason.{no_data,no_clone,index_failed,other}`, `clone.{none,cloning,failed}`, `failure.{no_key,no_model,timeout,invalid_output,provider_error}`, `unavailable.{language_not_indexed,index_failed,model_failed}`, `reasons.{rankImporters,headsChain}`, `tasks.{onlyN,generateFirst}`, `commands.none`.
- **Layer / why here:** next-intl messages.
- **Skills to apply:** `frontend-architecture`
- **Practices:** ICU placeholders; one key per distinct UI state; server codes map to keys, unknown codes fall back to `.other` (X20).
- **Known gotchas:** copy reused across two states ⇒ "multiple elements" — client gotchas *Tests*.
- **Done when:** `jq -e '.sections.firstTasks and .failure.timeout and .unavailable.model_failed' client/messages/en/onboarding.json`.

### S16 — Tour page, header, state gate, "On this page", collapsible sections
- **ACs:** AC-3, 13, 18–24, 26, 27, 28, 29, 32, 36
- **Files:** `P/page.tsx`, `P/constants.ts`, `P/styles.ts`, `P/helpers.ts` (create) · `P/_components/{TourHeader,TourStateGate,OnThisPage,TourSection}/` (create: `<Name>.tsx`, `index.ts`, `styles.ts` where styled; `OnThisPage/useActiveSection.ts`)
- **Change:** per Design notes → *Page*; sections are titled `TourSection` frames until S19.
- **Layer / why here:** route + `_components/`; observer logic in a hook.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`
- **Practices:** thin page; derive in render; ≤200 lines per component; copy via `useTranslations("onboarding")`; `satisfies CSSProperties` literals; a11y per *Page* (X16).
- **Known gotchas:** TS2742, border longhand — client gotchas *UI*.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm test`.

### S17 — Mermaid box style, Architecture section, "not available" note
- **ACs:** AC-7, 8, 17, 34, 35, 37
- **Files:** `client/src/components/mermaid-diagram/MermaidDiagram.tsx` (modify) · `P/_components/ArchitectureSection/`, `P/_components/UnavailableNote/` (create: `<Name>.tsx`, `index.ts`)
- **Change:** `MermaidDiagram` gains `variant?: "default" | "boxes"`; `"boxes"` uses `theme: "base"` + `themeVariables` (dark fill, rounded borders, mono font), keeps `strict` and the `parse(…, {suppressErrors: true})` → render-nothing path (R2). `ArchitectureSection`: vendored `Markdown` body, stack chips, structure list, `MermaidDiagram variant="boxes"` only for a non-null diagram. `UnavailableNote({availability})`: cause + mapped `reason`; Re-sync for `index_failed`, `/settings/models` link for `model_failed`.
- **Layer / why here:** shared component + colocated components.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `security`, `mermaid-diagram`
- **Practices:** default Mermaid behaviour unchanged; no `dangerouslySetInnerHTML`; LLM text only through `Markdown`.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm typecheck`.

### S18 — File rows: Critical paths and Guided reading path
- **ACs:** AC-5, 6, 31
- **Files:** `P/_components/FileRowList/` (create: `.tsx`, `index.ts`, `styles.ts`) · `P/_components/ReadingPath/` (create: `.tsx`, `index.ts`)
- **Change:** row = path + reason (LLM text, else i18n `reasons.*` from `rank_position`/`importers`/`chain`) + Open link `forgeBlobUrl(repo, built_sha, path)` (lib/forge-urls.ts:58) in a new tab. `ReadingPath`: numbered, same fallback.
- **Layer / why here:** colocated components.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `typescript-expert`, `security`
- **Practices:** `rel="noopener noreferrer"`; Open hidden only when `built_sha` is null; `aria-label` on Open; server order kept.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm typecheck`.

### S19 — Run commands, First tasks, and the five bodies wired
- **ACs:** AC-11, 15, 30, 34
- **Files:** `P/_components/RunCommands/` (create: `.tsx`, `index.ts`, `styles.ts`), `P/_components/FirstTasks/` (create: `.tsx`, `index.ts`) · `P/page.tsx` (modify)
- **Change:** `RunCommands`: numbered rows, copy ⇒ `navigator.clipboard.writeText(command)` + `Copied` toast; empty ⇒ `commands.none`. `FirstTasks`: title, Markdown body, file chips; 1–2 ⇒ `tasks.onlyN`. Page renders each body, or `UnavailableNote` from `availability`.
- **Layer / why here:** colocated components.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`
- **Practices:** copy exactly `command`; clipboard failure ⇒ `copyFailed` toast; icon buttons carry `aria-label`.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm test` · `cd client && pnpm build`.

## Tests
`test-writer` writes TS2–TS6 (T1) and TC1–TC10 (T2) from SPEC-09's ACs (D9 B); briefs in Design notes → *T1 brief*, *T2 brief*. Unit tier except TS6.
| Id | Test file | Covers | Step |
|---|---|---|---|
| TS1 | `server/test/onboarding-architecture.test.ts` | invariants | S8 |
| TS2 | `server/test/onboarding-helpers.test.ts` | AC-5, 6, 7, 8, 18, 21, 22, 23, 37 | T1 |
| TS3 | `server/test/onboarding-facts.test.ts` | AC-4, 10 | T1 |
| TS4 | `server/test/onboarding-grounding.test.ts` | AC-11, 14–17, 34, 35 | T1 |
| TS5 | `server/test/onboarding-prompt.test.ts` | AC-10, 33 | T1 |
| TS6 | `server/test/onboarding.it.test.ts` (integration) | AC-4, 9, 12, 13, 18–27, 36 | T1 |
| TC1 | `client/src/components/app-shell/helpers.test.ts` (create) | AC-1, 2, 3 | T2 |
| TC2 | `P/page.test.tsx` | AC-3, 8, 12, 13, 18–22, 24, 27 | T2 |
| TC3 | `TourHeader.test.tsx` | AC-23, 26, 32, 36 | T2 |
| TC4 | `OnThisPage.test.tsx` | AC-28 | T2 |
| TC5 | `TourSection.test.tsx` | AC-29 | T2 |
| TC6 | `FileRowList.test.tsx` | AC-5, 6, 31 | T2 |
| TC7 | `ArchitectureSection.test.tsx` | AC-17, 34, 35 | T2 |
| TC8 | `RunCommands.test.tsx` | AC-30 | T2 |
| TC9 | `FirstTasks.test.tsx` | AC-11, 15, 34 | T2 |
| TC10 | `UnavailableNote.test.tsx` | AC-7, 8, 37 | T2 |
TC3–TC10 sit beside their component in `P/_components/<Name>/`. T1 also creates `server/test/helpers/llm-stubs.ts` and `server/test/helpers/temp-clone.ts` (+ fixture writer).

## Migrations & contracts
- No migration (D2): everything new lives in `onboarding.json` (`db/schema/context.ts:120-126`, cascade exists).
- Contract: S1 replaces `Onboarding`/`OnboardingSection`/`OnboardingLink` with the tour schemas, placed after `Provider`, mirrored in the client copy.

## Out of scope
- `reviewer-core`, `mcp-server`, PR reviews, `client/src/app/onboarding/**`, `JUNK_PATH_PATTERNS`, `repo-intel/pipeline/**`, hotness, `MockLLMProvider` itself.
- JobRunner, a new error class, migrations, dependencies, Copy-as-Markdown, public routes, promoting relative-time helpers or the existing local `TempCloneGitClient` copies.

<!-- implementer-brief:end -->

## Design notes
Steps point here; these are binding details, not alternatives.

### Contract
New section after `export type Provider` (knowledge.ts), fenced by `// ---- Onboarding tour ----` / `// ---- end Onboarding tour ----`:
- `OnboardingUnavailableCause = z.enum(['language_not_indexed','index_failed','model_failed'])`
- `OnboardingAvailability {available: boolean, cause: cause|null, reason: string|null}` (`reason` is a code, mapped by client i18n)
- `OnboardingFileRow {path, reason: string|null, rank_position: int|null, importers: int|null, chain: string[]}`
- `OnboardingCommand {command, note: string|null}` · `OnboardingTask {title, body, files: string[]}` · `OnboardingModel {provider: Provider, model: string}`
- `OnboardingTour {source: 'llm'|'skeleton', built_sha: string|null, generated_at: string|null, index_files: int, model: OnboardingModel|null, architecture {availability, body, diagram: string|null, stack: string[], structure: string[]}, critical_paths {availability, rows}, run_locally {availability, commands}, reading_path {availability, steps}, first_tasks {availability, tasks}}` — only `architecture` has a diagram (AC-35).
- `OnboardingTourView {repo_id, clone {state: 'none'|'cloning'|'ready'|'failed', error: string|null}, index {status: 'full'|'partial'|'degraded'|'failed', reason: string|null, files_indexed: int, source_files_total: int|null, coverage_partial: boolean, partial_cause: 'file_cap'|'parse_errors'|'graph_failed'|'soft_budget'|null, last_indexed_sha: string}, model: OnboardingModel, generating: boolean, stale: boolean, last_failure {reason: 'no_key'|'no_model'|'timeout'|'invalid_output'|'provider_error', message, at}|null, stored: boolean, tour: OnboardingTour}`

### Facade reads
- `getFileGraphStats(repoId, paths)` → `{path, rank, rankPosition (1-based over all ranked files), importers}[]`.
- `getEndpoints(repoId, limit)` → `{path, endpoints: string[]}[]`.
- `getIndexCoverage(repoId)` → `{sourceFilesTotal: number|null, partialCause, edgeCount}`. Total: persisted `stats.totalCandidates` when present and `stats.incremental` is not true (X17); else `clonePath` null ⇒ null; else `walkClone(clonePath).stats.totalCandidates` (JS/TS universe, GAP2). Cause: `bounded > 0` or `filesIndexed + filesSkipped < total` ⇒ `file_cap`; `graphFailed` ⇒ `graph_failed`; non-empty `parseDegraded` ⇒ `parse_errors`; `softBudgetReached` (verified in `pipeline/full.ts` stats, Y14) ⇒ `soft_budget`. `edgeCount` = `countEdges` (Y8).

### Constants
`READING_PATH_MAX 10`, `CRITICAL_ROWS_MAX 6`, `FIRST_TASKS_MAX 5`, `TOP_FILES_FETCH 50`, `ENDPOINTS_MAX 40`, `STRUCTURE_MAX 40`, `SCRIPTS_MAX 40`, `SCRIPT_COMMAND_MAX 200` (X18), `PACKAGE_DIRS_MAX 10`, `MANIFEST_MAX_BYTES 256 KiB`, `ERROR_TEXT_MAX 300`, `ONBOARDING_LLM_TIMEOUT_MS 90_000` (assumption), `ONBOARDING_MAX_TOKENS 4_000` (assumption), `ONBOARDING_SCHEMA_NAME 'onboarding_tour'`, `ONBOARDING_LANGUAGE 'English'` (TQ4), `PM_BUILTINS ['install','i','ci']`, stack lookup tables.

### LLM schema
`z.object({ architecture: z.object({ body: z.string(), diagram: z.string() }), critical_paths: z.array(z.object({ path: z.string(), reason: z.string() })), run_locally: z.array(z.object({ command: z.string(), note: z.string() })), reading_path: z.array(z.object({ path: z.string(), reason: z.string() })), first_tasks: z.array(z.object({ title: z.string(), body: z.string(), files: z.array(z.string()) })) })`. Empty string = no diagram / no note.

### Clone facts
Reads only: the root listing (non-dot, non-symlink entries, dirs suffixed `/`, no `node_modules`, ≤`STRUCTURE_MAX`); root `package.json` and `<dir>/package.json` for ≤`PACKAGE_DIRS_MAX` first-level real dirs (scripts `{dir, name, command}` with `command` capped at `SCRIPT_COMMAND_MAX`, dependency names → stack); lockfile → `packageManager` (`pnpm-lock.yaml` pnpm, `yarn.lock` yarn, `bun.lockb`/`bun.lock` bun, else npm; a `packageManager` field wins); presence of `go.mod`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `Gemfile`, `pom.xml`, `build.gradle`, `Dockerfile` → stack; first of `.env.example`/`.env.sample`; first of `docker-compose.yml`/`docker-compose.yaml`/`compose.yaml`/`compose.yml`. Every read path is `realpath`-contained in the realpath of `cloneDir`. Only names, script commands and dependency names leave the function.

### Helpers
- `normalisePath(p)`: `\` → `/`, strip leading `./` and `/` (X8).
- `isReadingPathCandidate(path)` (D4): exclude `.test.`, `.spec.`, `.d.ts`, `*.config.*`, `vitest.*`, `jest.*`, eslint, prettier, `tsconfig`, `*.generated.*`, `*.gen.*`, `*.min.js`, and any segment (root included) `test`, `tests`, `__tests__`, `__mocks__`, `__fixtures__`, `migrations`, `dist`, `build`, `out`, `.next`, `coverage`, `generated`.
- `pickReadingPath(ranked, stats)` → ≤10 candidate rows, rank order, `reason: null`. `flattenCriticalPaths(chains, stats)` → ≤6 distinct files in chain order that pass `isReadingPathCandidate` (Y7), each with its `chain` (D5).
- `hasGraph(coverage)` = `edgeCount > 0`; `hasIndex(index)` = `files_indexed > 0` (Y8, X8).
- `indexAvailability(index, coverage)`: `sourceFilesTotal === 0` ⇒ `language_not_indexed` (AC-7); status `degraded`/`failed` or `!hasGraph` ⇒ `index_failed`, `reason` = state reason, degradedReason or `no_edges` (AC-8).
- `coverageView(index, coverage)` (X7): `files_indexed = min(filesIndexed, total)` when total known; `coverage_partial = total > 0 ∧ (files_indexed < total ∨ cause != null)`; total 0 ⇒ no N-of-M (AC-7 wording instead).
- `deterministicCommands(facts)`: `<pm> install`; `cp <envExample> .env`; `docker compose up -d`; `<pm> run dev` (else `start`) per package dir (`cd <dir> && …`), only for scripts that exist.
- `buildSkeleton(input)`: `source: 'skeleton'`, `built_sha = lastIndexedSha || currentHead || null` (X9), architecture from stack + structure, no diagram; first tasks unavailable with `cause: 'model_failed'` when a failure is given (AC-18), else `cause: null` (AC-24).
- `sanitizeJobError(text)` (X6): first line only; replace any `//<userinfo>@` with `//***@`; replace tokens matching `ghp_|gho_|ghs_|github_pat_|glpat-` + `[A-Za-z0-9_-]+` with `***`; cap `ERROR_TEXT_MAX`.
- `classifyGenerationError(err)` (X11): `ConfigError` ⇒ `no_key`; `status === 404` or a model-not-found message ⇒ `no_model` (assumption); `LlmDeadlineError`, `LlmConnectionError`, `TimeoutError`, `AbortError`/`TimeoutError` DOMException name ⇒ `timeout`; `LlmOutputInvalidError`, `LlmOutputTruncatedError`, `ZodError`, `ExternalServiceError` whose message matches `/schema validation/` ⇒ `invalid_output`; else `provider_error`.

### Invariants
For `M/*.ts`: no `src/adapters/**`; `drizzle-orm` and `db/schema` only in `repository.ts`; no `repo-intel/pipeline` or `repo-intel/repository`; cross-module imports only `../settings/feature-models.js`, `../repos/constants.js` (X21) and `../_shared/*`; `@devdigest/reviewer-core` allowed (error classes, `wrapUntrusted`); no `openai`/`@anthropic-ai/sdk`; `fastify` only in `routes.ts`.

### Prompt
Five sections of the LLM schema in spec order; diagram only in `architecture` (`flowchart LR`, quoted one-line labels, `classDef`/`style` allowed, empty string when none); reasons only for the given reading-path and critical-path files; commands only in the AC-16 forms over given scripts/dirs; 3–5 first tasks each citing given files; no images; untrusted-block and Markdown-only rules kept; the only placeholder is `{{language}}`. `boundedFacts` = repo name, stack, structure, scripts, endpoints, reading candidates, critical rows, coverage — no file contents.

### Grounding
`ctx = {indexed: Set<string>, hasIndex, indexCause, readingRows, criticalRows, scriptsByDir, packageDirs, envExample, composeFile, deterministicCommands}`; all LLM paths go through `normalisePath`.
- Reading/critical rows keep the deterministic rows and order; an LLM reason attaches by path; other LLM paths drop (AC-5, 6, 14).
- First tasks: drop refs not in `indexed`; drop a task with none (AC-15); keep ≤5; 0 left ⇒ unavailable with `indexCause` when `!hasIndex`, else `model_failed`; 1–2 kept (AC-11).
- Commands (AC-16, X4): split on `&&`, trim; keep a command only if **every** part is one of `cd <packageDir>`, `<pm> install|i|ci`, `<pm> run <script>` / `<pm> <script>` (script in the current dir's scripts), `cp <envExample> .env`, `docker compose up` / `docker compose up -d` (compose file found); `<pm>` ∈ npm, pnpm, yarn, bun. Nothing left ⇒ `deterministicCommands`.
- Text (AC-34, X15): strip `![alt](url)` and reference images `![alt][ref]` from every body.
- Diagram (AC-17): trim, strip ``` fences, keep only if it starts with `flowchart` or `graph`, else null.

### Service
State: `generating: Set<repoId>`, `lastFailure: Map<repoId, Failure>`, coverage cache keyed `clonePath + lastIndexedSha`, skipped when the sha is empty (X17).
- `getView(ws, id)`: repo (404 if none); clone = `clonePath` ⇒ `ready`, else latest clone job `queued|running` ⇒ `cloning`, `failed` ⇒ `failed` + `sanitizeJobError`, else `none`; index = `getIndexState` + `getIndexCoverage` → `coverageView`; model = `resolveFeatureModel(container, ws, 'onboarding')` (AC-36); stored tour via `OnboardingTour.safeParse` (bad row = none); else `buildSkeleton`; `stale` = stored ∧ both shas non-empty ∧ differ (AC-27). No LLM call (AC-12). Any facts/facade error inside `getView` degrades to the skeleton with `index_failed`; only "repo not found" is not a 200 (X19).
- Facts: `collectCloneFacts(git.clonePathFor(ref))`, `getTopFilesByRank(id, 50)` → `isReadingPathCandidate`, `getCriticalPaths`, `getFileGraphStats`, `getEndpoints(id, 40)`; `builtSha` captured here, before any LLM call (X12).
- `generate(ws, id, log)` → view, always 200 (X2): synchronously, before any `await`, return the current view if `generating.has(id)` else `generating.add(id)` (X5); then load the repo (release + 404 if none); clone ≠ `ready` ⇒ release and return the view (AC-20); `container.llm(provider)`; one `completeStructured` (S11) with `signal: AbortSignal.timeout(ONBOARDING_LLM_TIMEOUT_MS)` (X3); index set = `getFileRank(id, citedPaths)` paths; `upsertTour({source: 'llm', built_sha: builtSha, generated_at, index_files, model})`; clear failure. Error ⇒ `classifyGenerationError`, store in `lastFailure`, stored row untouched (AC-19). `finally` releases the guard (the call has settled or been aborted by then). Log model/tokens/cost in the message string.

### Page
`page.tsx` follows `context/page.tsx`: `useRepoNotFound`/`RepoNotFound`, `Skeleton`, `ErrorState`+retry; crumb `[{label: repo.full_name}, {label: t("title")}]` (AC-3).
- `TourStateGate`: `none`/`cloning` ⇒ `EmptyState`, no Generate (AC-20); `failed` ⇒ `ErrorState` + Re-clone via `useRefreshRepo` (AC-21).
- `TourHeader`: subtitle (AC-26) or coverage form + partial cause when `coverage_partial` (AC-23); status badge + mapped reason when not `full` (AC-22); stale banner + Regenerate (AC-27); failure banner (AC-18/19); Generate/Regenerate disabled while `generating` or pending (AC-13) with `provider · model` (AC-36); Share link copies `${origin}/repos/${repoId}/onboarding-tour` + `linkCopied` toast via `useToast` (AC-32).
- `OnThisPage`: `<nav aria-label>`; click ⇒ `scrollIntoView`; `useActiveSection(ids)` with `IntersectionObserver` set up and disconnected in one effect; active item `aria-current="true"` (AC-28).
- `TourSection({id, icon, title, children})`: toggle button with `aria-expanded`, `aria-controls`, `aria-label`; `useState(true)`, never persisted (AC-29).
- `P/helpers.ts`: `tourAge(iso, locale, now)` with `Intl.RelativeTimeFormat` like `ConventionsHeader/helpers.ts:28-45`, `coverageLabel`, `shareUrl`, `reasonKey(code)` (X20).

### Copy
`title` "Onboarding for {repo}"; section titles (spec order); "On this page"; Generate / Regenerate / Generating…; `header.willUse` "Will use {provider} · {model}"; `header.subtitle` "Generated from index of {count} files · last refreshed {age}"; `header.coverage` "indexed {n} of {m} source files · partial"; `header.stale` "Index moved since this tour was built"; `tasks.onlyN` "only {count} tasks could be tied to files"; `tasks.generateFirst` "Generate the tour to get first tasks"; `commands.none` "no run scripts found"; `reasons.rankImporters` "rank #{rank} · imported by {count} files"; `reasons.headsChain` "heads the chain {chain}"; `actions.copied` "Copied"; `actions.linkCopied` "Link copied"; cause, status, clone and failure labels in plain English.

### T1 brief
- `server/test/helpers/llm-stubs.ts` (create, Y3): `ThrowingLLMProvider(err)`; `DeferredLLMProvider` (`completeStructured` returns a promise released by `release(data)`, rejects when `req.signal` aborts); both record `calls` and `lastRequest`.
- `server/test/helpers/temp-clone.ts` (create, Y5): `TempCloneGitClient(root)` (as the local copies in `conventions.it.test.ts:40-47`) and `writeOnboardingFixture(dir, opts)`: `package.json` scripts `dev`/`build`/`test`, `pnpm-lock.yaml`, `.env.example`, `docker-compose.yml`, `server/package.json`, N `src/*.ts` files (known count for AC-23), optional symlinked file and dir, optional zero-JS/TS variant.
- TS6 seeds (Y4), via `RepoIntelRepository` writes as `blast.it.test.ts`: repo row with `clonePath` → fixture dir; `file_rank`/`file_edges`/`file_facts`; `repo_index_state` per case — full; partial with `bounded`, `parseDegraded`, `graphFailed`; degraded; failed; `lastIndexedSha` ≠ stored `built_sha` (stale, AC-27); `jobs` clone rows queued (AC-20) and failed with `https://x-access-token:ghp_abc@…` (AC-21, sanitized); zero-JS/TS repo (AC-7). Per AC: 9 one stub call with `maxRetries: 0` and a `signal`; 12 GET makes 0 calls; 13 `DeferredLLMProvider` + two POSTs ⇒ 1 call, second view `generating: true`; 18 `no_key` (no `llm` override, `overrides.secrets` empty), `no_model` (`Throwing` 404), `timeout` (`LlmDeadlineError`), `invalid_output` (`LlmOutputInvalidError`), `provider_error` (`Error`); 19 failure after a stored tour leaves it unchanged; 23–26 counts and `generated_at`; 36 model in view.
- Every `.it` test uses `isolatedTestConfig()` and the `dockerAvailable()` skip.

### T2 brief
Render with the real `NextIntlClientProvider` and `messages/en/onboarding.json`, assert English strings (Y10); mock `fetch`, `fireEvent` only; stub `IntersectionObserver` and `navigator.clipboard`. TC1 asserts `NAV` WORKSPACE order `pulls, onboarding-tour, context` and the label (Y9), and `activeKeyFor("/onboarding") === ""`. TC2 drives AC-13 with a pending POST.

### Data flow
GET → repo + clone job → index state/coverage → stored tour or skeleton → view. POST → guard → facts (+ `builtSha`) → messages → one `completeStructured` → `groundTour` → `upsertTour` → view. The LLM never orders paths and never adds a command outside the allowlist.

### Requirements review (pass 1)
TQ1 `maxRetries: 0`; TQ2 `generated_at`; TQ3 `lastIndexedSha` else HEAD; TQ4 English; TQ5 designs in `docs/plans/assets/26/` — accepted. GAP1–4 closed by the SPEC-09 amendment. REC1 → D1, REC2 → D4, REC3 → D5.

## Context applied
- `server/insights/gotchas.md` → *Security* (LAN-reachable; symlink to `.git/config`; realpath both sides) — S5, S11; *Tests* (hermetic `.it`) — TS6; *Git & diffs* (`withTimeout` doesn't abort) — S11.
- `client/insights/gotchas.md` → *UI* (nav.ts exception, TS2742, border longhand) — S14, S16; *Tests* (`fireEvent`, copy reuse) and *Tooling* (`pnpm exec vitest run`, no `[repoId]` filter) — T2.
- Root `INSIGHTS.md` → vendored `shared` drift — S1; depcruise gate not real — S8; `rg` edge checks catch comments — S8.
- SPEC-09 (amended), `research-009-onboarding.md`, `ext-research-26.md`, `assets/26/cross-model-review.md`, designs — all steps.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | Context applied | — |
| `onion-architecture` | preload | S1–S12 | — |
| `zod` | on demand (S1) | S1, S4, S5, S11, S12 | — |
| `typescript-expert` | on demand (S1) | S1–S14, S16–S19 | — |
| `drizzle-orm-patterns` | on demand (S2) | S2, S7 | — |
| `postgresql-table-design` | on demand (S2) | S2, S7 | — |
| `security` | on demand (S5) | S5, S9, S10, S11, S17, S18 | — |
| `fastify-best-practices` | on demand (S12) | S12 | — |
| `mermaid-diagram` | on demand (S9) | S9, S17 | — |
| `frontend-architecture` | on demand (S13) | S13–S19 | — |
| `react-best-practices` | on demand (S13) | S13, S16–S19 | — |
| `next-best-practices` | on demand (S13) | S13, S16, S17, S19 | — |
| `react-testing-library` | on demand (T2) | T2 (test-writer) | binds no implementer step |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `contracts/knowledge.ts` (server + client copy) | ports | changed |
| server | `modules/repo-intel/{repository,types,service}.ts` | infra / facade | changed |
| server | `modules/onboarding/*`, `prompts/onboarding.system.md`, `modules/index.ts` | app / transport / infra | new / changed |
| server | `test/helpers/{llm-stubs,temp-clone}.ts` | test helpers | new |
| client | `lib/hooks/onboarding.ts`, `app/repos/[repoId]/onboarding-tour/**` | data / route | new |
| client | `vendor/ui/nav.ts`, `components/app-shell/helpers.ts`, `components/mermaid-diagram/MermaidDiagram.tsx`, `messages/en/onboarding.json` | shell / shared / i18n | changed |

## Risks & open questions
- **AC-9 "one call" is one HTTP request only on OpenRouter** (R1). `maxRetries: 0` bounds Zod reprompts; OpenRouter (default) has SDK `maxRetries: 0` and no `withRetry`. On OpenAI/Anthropic, SDK retries × `withRetry` can resend a *failed* request up to 12 times — one logical call (TQ1).
- **Abort coverage** (X3): all three providers forward `req.signal` to the SDK request (`openai.ts:99,114`, `anthropic.ts:102,123`, OpenRouter per R1), so releasing the guard after the abort cannot leave a paid request running. `withRetry` may still start a retry before the abort fires; `throwIfAborted` stops the next attempt.
- **Command allowlist** (X4, AC-16) will drop legitimate but unusual commands (`make`, `just`); the deterministic list covers that.
- **Strict json_schema** (R3): flat schema; counts enforced in grounding.
- **Mermaid look** (R2): `themeVariables` need `theme: "base"`; pixel parity not guaranteed.
- **Coverage**: persisted `totalCandidates` when the last run was full, else one walk per `clonePath + sha` (cached); incremental runs may double-count `filesIndexed`, shown as `min(N, M)` (X7).
- **`no_model` detection** relies on a 404/model-not-found error (assumption): `FeatureModelChoice.model` is `min(1)`, so an empty model never reaches the service.
- **Single API instance**: the guard and `last_failure` are in memory (`app.ts:70-85`); a restart forgets `last_failure`.
- **Clone-job lookup** filters `jobs` by `payload->>'repoId'` without an index.
- **Assumptions**: 90 s timeout, 4,000 max tokens, `language_not_indexed` ⇔ zero JS/TS files.
- **Doc vs code**: `onboarding.system.md` and `messages/en/onboarding.json` describe an older section list; S9 and S15 rewrite both.

## Handed off
- architecture-reviewer: S3 facade additions, S6 imports from `@devdigest/reviewer-core`, S7 import of `repos/constants.js`, S11's `resolveFeatureModel`, S8 invariant list.
- security review: S5 clone reads (symlinks, realpath, size caps), S9 untrusted wrapping, S10 command allowlist and image stripping, S6 `sanitizeJobError`, the LAN-reachable paid POST (rate limit, guard), S17/S18 Markdown-only rendering and `target="_blank"` links.

## Insights to record
- client/INSIGHTS.md · Codebase Patterns — a third relative-time helper appears (`pulls/helpers.ts:11`, `ConventionsHeader/helpers.ts:28`, `P/helpers.ts`); candidate for `lib/`.
- server/INSIGHTS.md · Codebase Patterns — incremental index runs overwrite `repo_index_state.stats` and drop `totalCandidates` (`pipeline/incremental.ts:244-258`); coverage must come from the last full run or a fresh walk.
- server/INSIGHTS.md · Tests — `MockLLMProvider` cannot throw or delay; use `test/helpers/llm-stubs.ts` (after T1).

## Red-flags check
- [x] Every AC maps to at least one step or test (no-spec plans) — n/a, spec plan
- [x] Every spec AC-n has a row in *Spec traceability* with a step or test
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; technical choices are in *Decisions needed*, product gaps are GAPn
- [x] Groups end type-checking; parallel groups share no file (none parallel)
- [x] No group under 3 files / ~80 lines that could merge with a neighbour (G1 is the contract commit: 3 files)
- [ ] The brief above the marker is under ~20,000 characters — ~23,900 after the review round (S17→S16 and S18→S19 merged; the review's added rules outweighed the savings)
- [x] Pass 1 — n/a (pass 2)
- [x] Execution mode per the D4 rule — multi-agent (contract change, 3 packages, 19 steps)
- [x] Every step's *Skills to apply* is complete
- [x] `bash .claude/skills/sdd/scripts/sdd.sh plan-lint <plan>` prints `plan-lint: ok`

## Handoffs → G1

### Handoff to the next group
- New exports from `@devdigest/shared` (server + client): `OnboardingUnavailableCause`, `OnboardingAvailability`, `OnboardingFileRow`, `OnboardingCommand`, `OnboardingTask`, `OnboardingModel`, `OnboardingTour`, `OnboardingTourView` (schema + type each), fenced by `// ---- Onboarding tour ----` … `// ---- end Onboarding tour ----` after `Provider`.
- Removed `Onboarding`, `OnboardingSection`, `OnboardingLink` (no other users).
- `contracts.test.ts` case renamed `Conformance / OnboardingTour / EvalRun / MemoryItem`.
- Deviation (trivial): `server/src/vendor/shared/index.ts:7` header comment still says "Onboarding" (vendor path, not in S1 Files).
- Review note: `last_failure.message` and `clone.error` are plain strings — S11 must cap and sanitise.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S1 | |
| zod | full | S1 | |
| typescript-expert | full | S1 | |
| engineering-insights | preload | Step 0 | no insight |

## Handoffs → G2

### Handoff to the next group
- `RepoIntel` facade gains: `getFileGraphStats(repoId, paths)` → `{path, rank, rankPosition (1-based, tie-break by path), importers}[]` (unranked omitted); `getEndpoints(repoId, limit)` → `{path, endpoints[]}[]`; `getIndexCoverage(repoId)` → `{sourceFilesTotal|null, partialCause, edgeCount}`. All return []/nulls with the flag off, never throw. Types `FileGraphStat`, `IndexPartialCause`, `IndexCoverage` in `repo-intel/types.ts`.
- Repository: `countImporters`, `countEdges`, `getEndpointFacts`, `getIndexStats`; `getRankedPaths` adds `asc(filePath)` tie-break.
- `getIndexCoverage`: persisted `stats.totalCandidates` unless the last run was incremental, else `walkClone(clonePath)`; partialCause order file_cap → graph_failed → parse_errors → soft_budget.
- `getCriticalPaths` filters junk roots before picking `CRITICAL_PATH_ROOTS`; JUNK_PATH_PATTERNS still misses root `test/` and generated dirs — S6 keeps its own filter.
- Architecture: service imports `./pipeline/walk.js` (the one sanctioned pipeline import).

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S2, S3 | |
| drizzle-orm-patterns | full | S2 | |
| postgresql-table-design | full | S2 | no schema change |
| typescript-expert | full | S2, S3 | |

## Handoffs → G3

### Handoff to the next group
- `server/src/modules/onboarding/`: `constants.ts` (incl. `ONBOARDING_LLM_TIMEOUT_MS`, `ONBOARDING_MAX_TOKENS`, `ONBOARDING_SCHEMA_NAME`, `ONBOARDING_LANGUAGE`, package-manager/lockfile/stack/env/compose tables), `types.ts` (`ScriptFact`, `CloneFacts`, `EndpointFact`, `OnboardingFacts`, flat zod `OnboardingLlmOutput`), `facts.ts` (`collectCloneFacts(cloneDir)` never throws; `emptyFacts()`), `helpers.ts` (`normalisePath`, `isReadingPathCandidate`, `pickReadingPath`, `flattenCriticalPaths`, `hasGraph`, `hasIndex`, `indexAvailability`, `coverageView`, `deterministicCommands`, `buildSkeleton`, `sanitizeJobError`, `classifyGenerationError`), `repository.ts` (`getRepo`, `getLatestCloneJob`, `getTour`, `upsertTour`).
- Skeleton reasons are data (rank position, importers, chain) rendered by the client via i18n keys `reasons.*`; reading rows carry `reason: null` until the model fills text.
- G4 supplies `generated_at` and `built_sha`; `modules/index.ts` untouched (S12).
- Deviations: S8 invariant test also allows the type-only import `../repo-intel/types.js` (helpers.ts) — not in the plan's allow-list; `collectCloneFacts` also returns `hasRootManifest`, `packageDirs`.
- Process note: skill texts were truncated by the tool (54.8 KB); the agent read only their start.
- Not verified: repository.ts beyond typecheck (covered by TS6 in T1).

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S4–S8 | |
| zod | on demand (start only) | S4, S5 | |
| typescript-expert | on demand (start only) | S4–S8 | |
| security | on demand (start only) | S5 | |
| drizzle-orm-patterns | on demand (start only) | S7 | |
| postgresql-table-design | on demand (start only) | S7 | no schema change |

## Verification log
- 2026-10-05 agent: spec-p1 ab3c02452b7a30152 spec-creator 2026-10-05T13:44:31Z
- 2026-10-05 agent: spec-p2 ab3c02452b7a30152 spec-creator 2026-10-05T13:49:39Z
- 2026-10-05 agent: research ab4a6b8445e35c707 researcher 2026-10-05T14:17:50Z
- 2026-10-05 agent: plan-p1 a58215717b9fa11e8 implementation-planner 2026-10-05T14:22:41Z
- 2026-10-05 decisions recorded (TQ1-5, D1-D12, GAP1-4 answers); GAP1-4 → spec-creator
- 2026-10-05 agent: spec-p2 ab3c02452b7a30152 spec-creator 2026-10-05T14:28:55Z
- 2026-10-05 GAP1-4 closed; SPEC-09 re-approved
- 2026-10-05 agent: ext-research a58802eeef9cba865 researcher 2026-10-05T14:30:02Z
- 2026-10-05 agent: plan-p2 a58215717b9fa11e8 implementation-planner 2026-10-05T14:43:50Z
- 2026-10-05 cross-model review (Sonnet 5.5, Plan agent a51de7462c423c724): approve with changes — 1 BLOCKER (Y1 TDZ: OnboardingModel uses Provider before knowledge.ts:369), HIGH Y2-Y6, MEDIUM Y7-Y13, LOW Y14-Y16
- 2026-10-05 cross-model review (Fable 5.1, Plan agent aacdcdb898be6b87c): approve with changes — HIGH X1 (TDZ, = Y1), X2 (409 body unreachable, = Y6), X3 (no abort signal: guard clears while the paid request runs), X4 (commands need an allowlist — injected 'curl|sh' would be copyable); MEDIUM X5-X12; LOW X13-X21
- 2026-10-05 user: apply all cross-model findings (must + should + LOW), X2 = POST returns 200 with the view; X4 tightens SPEC-09 AC-16 (command allowlist) via spec-creator; review saved at docs/plans/assets/26/cross-model-review.md
- 2026-10-05 agent: spec-p2 ab3c02452b7a30152 spec-creator 2026-10-05T14:55:40Z
- 2026-10-05 SPEC-09 AC-16/AC-34 tightened (X4/X15) and re-approved per the user's 'apply all' decision
- 2026-10-05 agent: plan-p2 a58215717b9fa11e8 implementation-planner 2026-10-05T14:59:49Z
- 2026-10-05 plan approved by user (cross-model review applied)
- 2026-10-05 plan-stage commit 0cfeffe (by user); spec-stage commit 6e0cfce
- 2026-10-05 agent: implement a5448f7b6cfbe1c37 implementer 2026-10-05T15:08:53Z
- 2026-10-05 implement G1: done (S1; server+client typecheck ok; contracts 9 passed; blocks identical; server unit 583, client 410)
- 2026-10-05 G1 committed by user: 6388fc9
- 2026-10-05 agent: implement ac502db00f6aaa371 implementer 2026-10-05T15:12:15Z
- 2026-10-05 implement G2: done (S2-S3; typecheck ok; repo-intel/indexer 56; server unit 583)
- 2026-10-05 G2 committed by user: 1c81974
- 2026-10-05 agent: implement a338b1776fc348e92 implementer 2026-10-05T15:17:46Z
- 2026-10-05 implement G3: done (S4-S8; typecheck ok; server unit 590; onboarding-architecture 7)
