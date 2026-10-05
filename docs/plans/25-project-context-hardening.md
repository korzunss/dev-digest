# Development Plan: Project Context hardening (plan 24 follow-ups)
Status: done
Execution: multi-agent
Save as: docs/plans/25-project-context-hardening.md
Spec: none (reviewer follow-ups to plan 24 / SPEC-08 `specs/008-project-context.md`; behaviour stays within SPEC-08)

## Goal & acceptance criteria
Close plan 24's PSR-BE-H1/H2, PSR-BE-M, PSR-UI-H1/H2/H3, PSR-UI-M and "PSR1 tests" without leaving SPEC-08.
- AC1: a repeat `GET /repos/:id/context` re-reads no unchanged doc; token counts stay exact (SPEC-08 AC-7).
- AC2: the walk has no depth limit; it stops at a visited-entries cap (or the 500-doc cap) and only then reports `truncated: true`; a deep doc is both listed and readable.
- AC3: `SetContextRootsBody` is bounded in shared, mirrored to the client.
- AC4: agent/skill context paths are stored canonical (`./specs/a.md` → `specs/a.md`); a data migration canonicalises stored rows; `used_by_agents` counts them.
- AC5: a failed context PUT shows an error on the agent/skill Context tab; a failed roots load shows `ErrorState` + retry; a stale roots error clears after the other mutation succeeds.
- AC6: an agent context save invalidates only the changed paths' `['context-doc']` queries.
- AC7: PSR-UI-M cleanups land; `context-helpers.test.ts` pins 3 `**` and `/`-in-braces refusals.

## Decisions needed
None open — see *Decisions recorded*. The pass-1 requirements review and the decision options are under *Design notes* (below the marker).

## Decisions recorded
2026-10-05, user (main session):
- TQ1–TQ6: defaults accepted as written.
- D1 A · D2 A · D3 changed 2026-10-05 → drop the walk depth limit entirely; the walk is bounded only by the visited-entries cap, and `truncated` means that cap was hit · D4 B · D5 A · D6 A — the main session writes the data-migration SQL into the implementer's empty `--custom` stub (user's explicit permission) · D7 A · D8 A · D9 multi-agent.
- GAP1: AC-7 amended via `spec-creator` to "not persisted; may be cached in memory per path, mtime and size"; SPEC-08 re-approved before pass 2.
- GAP2: copy as proposed — "Could not save the attached documents. Your change was undone." under the picker on agent/skill Context tabs; "Could not load the search roots." with Retry.

## Prerequisites
- Docker/Postgres up for the `.it` tests (G1, G2, S7).
- No new dependencies (`picomatch@4.0.4` and `@types/picomatch` are already installed in `server/`).

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S4, S4b | shared + server `modules/context` | — | public `ContextService.normalisePath`; `compileDirFilter`; `TokenCountCache` |
| G2 | S5–S6 | server agents/skills services + migration stub | G1 | stub tag; new `.it` test (red until S7) |
| S7 | S7 | **main session**: migration SQL | G2 | `.it` test green |
| G3 | S8–S9 | client hooks + picker + Context tabs | G1 (may run parallel to G2/S7) | picker exports `attachedPaths`, `DEFAULT_DOC_TYPE` |
| G4 | S10–S11 | client page + trace | G3 | — |

## Steps
### S1 — Bound `SetContextRootsBody` in shared and mirror it  [Contract]
- **Files:** `server/src/vendor/shared/contracts/platform.ts` (modify), `client/src/vendor/shared/contracts/platform.ts` (modify)
- **Change:** `SetContextRootsBody = z.object({ globs: z.array(z.string().max(1024)).min(1).max(100) })` (D4 B). Same one-line edit in both copies (server line 337, client line 317). Nothing else in either file changes.
- **Layer / why here:** ports (`@devdigest/shared`); contracts change in server shared first, then a targeted mirror.
- **Skills to apply:** `zod`, `typescript-expert`, `security`
- **Practices:** bounds live on the schema, no `.parse` in handlers; the service's 20-glob / 256-char checks (`service.ts:134`, `helpers.ts:97`) stay as the user-facing messages.
- **Known gotchas:** root INSIGHTS "the two vendored `shared` copies are not actually in sync" → targeted mirror of this one line, never a folder copy.
- **Done when:** `cd server && pnpm typecheck` · `cd client && pnpm typecheck` · `diff <(grep 'const SetContextRootsBody' server/src/vendor/shared/contracts/platform.ts) <(grep 'const SetContextRootsBody' client/src/vendor/shared/contracts/platform.ts)` prints nothing.

### S2 — Walk-bound constants, directory pre-filter, glob-shape hardening, PSR1 tests
- **Files:** `server/src/modules/context/constants.ts` (modify), `server/src/modules/context/helpers.ts` (modify), `server/test/context-helpers.test.ts` (modify)
- **Change:** constants `MAX_VISITED_ENTRIES = 20_000` (TQ3) and `MAX_TOKEN_CACHE_ENTRIES = 5_000` (TQ2), each with a one-line why-comment. Helper `compileDirFilter(globs: readonly string[]): (relDir: string) => boolean` — for each glob take `picomatch.scan(glob).base`; if any base is `''` (or any glob is negated) return `() => true`; else a directory `d` may hold a match iff some base `b` has `b === d`, `b.startsWith(d + '/')` or `d.startsWith(b + '/')`. `validateRootGlob` gains two refusals:
  - **SEC1b:** refuse any glob whose `picomatch.scan(glob).negated` is `true`. This closes the `./!docs/**` bypass of the existing `startsWith('!')` check.
  - **SEC2b:** when a glob has two `**` segments, only the final (filename) segment may follow the second `**`. The default `**/{specs,docs,insights}/**/*.md` stays valid. Measured by the main session (Verification log, "review 2 triage"): `'**/*/**/' + '*/'.repeat(122) + '*.md'` took 1068 ms on `'a/'.repeat(2046) + '.x.md'`.
  Tests:
  - PSR1 pins: `validateRootGlob('a/**/b/**/c/**/x.md')` returns the `'**' segments` message (3 > `MAX_DOUBLE_STARS`); `validateRootGlob('{docs/a,specs}/x.md')` returns the `'/' inside braces` message.
  - SEC1b: `'./!docs/**/*.md'` and `'!docs/**/*.md'` are refused.
  - SEC2b: `'**/*/**/*/x.md'` and `'**/docs/**/a/b.md'` are refused; the default and `'**/*/**/*.md'` are accepted.
  - Timing: every accepted glob in the test file matches both `'a/'.repeat(2046) + '.x.md'` and `'docs/'.repeat(818) + '.x.md'` in < 50 ms each. The earlier test used only 16 long segments and missed the blow-up.
  - `compileDirFilter`: the default root admits `src/deep`; `['docs/**/*.md']` admits `docs` and `docs/a` and rejects `src`.
- **Layer / why here:** pure string decisions belong in `helpers.ts` (no I/O, `helpers.ts:6-11`).
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:** `helpers.ts` keeps no `fs` import; the filter is conservative (when unsure, admit the dir), so pruning never hides a matching doc.
- **Known gotchas:** server gotchas → Security: glob shape caps — tightened by SEC1b/SEC2b, existing caps unchanged.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/context-helpers.test.ts` passes, including the PSR1, SEC1b, SEC2b, timing and `compileDirFilter` cases.

### S3 — Token-count cache
- **Files:** `server/src/modules/context/token-cache.ts` (create), `server/test/token-cache.test.ts` (create)
- **Change:** `export const tokenCacheKey = (cloneDir: string, rel: string, mtimeMs: number, size: number) => string` (NUL-joined). `export class TokenCountCache { constructor(max = MAX_TOKEN_CACHE_ENTRIES); get(key): number | undefined; set(key, tokens): void }` on a `Map`, evicting the oldest insertion when `size > max`. Unit test: hit/miss, a changed mtime or size is a miss, eviction at `max` (construct with `max = 2`).
- **Layer / why here:** module-internal helper owned by the context service (D1 A); in-process only, never persisted (SPEC-08 AC-7 as amended).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** no I/O and no tokenizer inside the cache — it stores numbers only; no `any`.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/token-cache.test.ts` passes.

### S4 — Context service: cached counts, entry-bounded walk, `normalisePath`
- **Files:** `server/src/modules/context/service.ts` (modify), `server/src/modules/context/constants.ts` (modify), `server/test/context.it.test.ts` (modify)
- **Change:**
  - field `private tokens = new TokenCountCache()`; walk: after `stat`, key `tokenCacheKey(cloneDir, rel, info.mtimeMs, info.size)`; on a hit skip `readFile`, on a miss read, count, `set`. `getDoc` gets/sets with the same key (`res.mtime.getTime()`, `res.size`, `res.rel`) (TQ6). Pass `cloneDir` into `walk`.
  - **no depth limit** (D3 as changed): drop the `depth` parameter and the `depth > MAX_WALK_DEPTH` check (`service.ts:242`); delete `MAX_WALK_DEPTH` from `constants.ts:16` and its import (`service.ts:30`) — nothing else uses it — and rewrite the walk-bounds comment (`constants.ts:11-15`) to say the walk is bounded by entries visited, not depth. Walk state becomes `{ truncated: boolean; visited: number }`: every dirent increments `visited`; past `MAX_VISITED_ENTRIES` → `truncated = true`, return; the 500-doc cap sets `truncated` as today. `truncated` means only those two caps. A subdirectory rejected by `compileDirFilter(repo.contextGlobs)` is not descended.
  - `normalisePath(raw: string): string | null` — public, delegates to `normaliseDocPath` (D5 A).
- **Layer / why here:** application service; all fs access stays here, the guard (`readSafely`) is untouched.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`, `fastify-best-practices`
- **Practices:** `readSafely`'s guard logic (lexical check, realpath of both sides, SF1 allowlist re-check, size cap) and `getDoc`'s 404/422 mapping unchanged. The one allowed change is additive: a `mtimeMs` field on `SafeRead`, so `getDoc` and the walk build the cache key from the same `mtimeMs`; symlinks never followed (with no depth limit, this plus the visited cap is what bounds the walk — a committed symlink loop must stay unwalked); new `.it` fixtures in a **separate repo row + clone dir** (e.g. `acme/deep`) so existing `truncated: false` assertions hold; tests use `app.inject` with `overrides.tokenizer` (counting fake).
- **Known gotchas:** server gotchas → Security: realpath both sides; re-apply the allowlist to the real target (do not regress).
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run context.it.test context-read-guard` passes with new cases: (a) a second `GET /repos/:id/context` calls the counting tokenizer 0 times, and after a doc's size changes, once, with the new count; (b) a doc nested 10 folders deep under `docs/` is listed, `truncated` is `false`, and `GET …/context/doc?path=<it>` returns 200; a committed directory symlink pointing at its own parent does not change the listing; (c) `MAX_VISITED_ENTRIES + 1` files under a non-root folder give `truncated: true` with default roots and `truncated: false` with roots `['docs/**/*.md']` (pruned).

### S4b — Bound the document query `path` with the shared `ContextDocPath` (SEC3)
- **Files:** `server/src/modules/context/routes.ts` (modify), `server/test/context.it.test.ts` (modify)
- **Change:** `DocQuery` (`routes.ts:21-28`) becomes `z.object({ path: ContextDocPath })`, imported from `@devdigest/shared` (`contracts/platform.ts:341`: max 512 characters, NUL, absolute paths and `..` refused, `.md` only). Keep the shape-vs-safety comment. New `.it` case: a 513-character `?path=` gets a 4xx.
- **Layer / why here:** transport; request validation belongs on the route schema.
- **Skills to apply:** `fastify-best-practices`, `zod`, `onion-architecture`, `security`, `typescript-expert`
- **Practices:** schema-first route, no `.parse` in the handler; the service's guard stays the safety check.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run context.it.test` passes, with the 513-character case giving a 4xx. The existing "traversal or out-of-roots path with 422" (`context.it.test.ts:201`) and "missing or empty ?path=" (`:298`) cases still pass; adjust only their expected message text if the schema now rejects them first.

### S5 — Canonical context paths on write (agents, skills)
- **Files:** `server/src/modules/agents/service.ts` (modify), `server/src/modules/skills/service.ts` (modify), `server/test/agents-context.it.test.ts` (modify), `server/test/skills.it.test.ts` (modify)
- **Change:** in both `setContextLinks` (`agents/service.ts:178`, `skills/service.ts:249`) map each path through `this.container.context.normalisePath`; the first `null` → `throw new ValidationError(\`Invalid document path "${p.slice(0, 80)}"\`)` (TQ1); dedupe the canonical list keeping first position, then store. `SkillsService` keeps `private container: Container` in its constructor (today it only reads `container.db`, `skills/service.ts:74-76`). Update both docblocks ("stored verbatim" → canonical).
- **Layer / why here:** application; cross-module capability through `container.context`, not an import of `modules/context/*` (onion rule 6, D5 A).
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`, `fastify-best-practices`
- **Practices:** route bodies unchanged (`ContextPathsBody` still validates first); no Drizzle in the services; repository methods unchanged.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run agents-context.it.test skills.it.test` passes with new cases: PUT `['./specs/a.md', 'specs/a.md', 'docs//b.md']` stores and returns `['specs/a.md', 'docs/b.md']` for an agent and for a skill.

### S6 — Generate the empty data-migration stub and its test
- **Files:** `server/src/db/migrations/<NNNN>_normalise_context_paths.sql` + `meta/_journal.json` + `meta/<NNNN>_snapshot.json` (**generated only**), `server/test/context-paths-normalise.it.test.ts` (create)
- **Change:** run `cd server && pnpm db:generate --custom --name normalise_context_paths`. Do **not** write into the stub. Create the test on the `eval-cases-dedupe.it.test.ts` pattern (journal tag suffix → SQL chunks): insert for one agent and one skill `./specs/a.md` (order 0), `specs/a.md` (order 1), `docs//b.md`, `docs/./c.md`, `.\insights\d.md`; run the chunks; assert rows equal the inputs through `normaliseDocPath` (deduped), `specs/a.md` kept order 0, and a second run changes nothing.
- **Layer / why here:** infrastructure (migrations); the data fix ships as the one sanctioned hand-written migration kind.
- **Skills to apply:** `drizzle-orm-patterns`, `typescript-expert`
- **Practices:** never edit generated files; never run `db:migrate`; `.it` suffix (needs Postgres).
- **Known gotchas:** server gotchas → DB & migrations: "a data fix goes into a `pnpm db:generate --custom` stub"; root INSIGHTS 2026-09-30 "the auto-mode permission check blocks an implementer from writing a migration file" → the SQL body is S7 (main session).
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm db:generate` afterwards reports no schema changes. (The new test is expected to fail until S7.)

### S7 — Write the data-migration SQL  (main session, D6)
- **Files:** `server/src/db/migrations/<NNNN>_normalise_context_paths.sql` (the S6 stub)
- **Change:** the four statements in *Design notes → Migration SQL*, separated by `--> statement-breakpoint`.
- **Layer / why here:** migration; written by the main session with the user's recorded permission, logged as `main-session fix: S7`.
- **Skills to apply:** `postgresql-table-design`, `drizzle-orm-patterns`
- **Practices:** each statement runs outside a transaction too (no temp tables); quote `"order"`.
- **Known gotchas:** server gotchas → "data fix … `--custom` stub"; compare snapshots with `jq -S 'del(.id,.prevId)'`, not `diff`.
- **Done when:** `cd server && pnpm exec vitest run context-paths-normalise` passes · `cd server && pnpm db:migrate` succeeds on the local DB.

### S8 — Scoped `['context-doc']` invalidation
- **Files:** `client/src/lib/hooks/context.ts` (modify), `client/src/lib/hooks/agents.ts` (modify), `client/src/lib/hooks/skills.ts` (modify), `client/src/lib/hooks/core.ts` (modify — O1, already done in code), `client/src/lib/hooks/context-invalidation.test.tsx` (create)
- **Change (O1):** in `core.ts`, remove the dead `useContextFiles`; `useReindexContext` invalidates `['context-docs', repoId]` (`core.ts:122-127`).
- **Change:** in `context.ts`: `changedPaths(before: readonly string[] | undefined, after: readonly string[]): string[] | null` (symmetric difference; `null` when `before` is unknown) and `invalidateContextDocs(qc: QueryClient, paths: string[] | null)` (predicate `queryKey[0] === "context-doc"` and, unless `paths` is `null`, `paths.includes(String(queryKey[2]))`). `useSetAgentContext.onSuccess(data, {id}, ctx)`: compute from `ctx?.previous?.links` vs `data.links`, call `invalidateContextDocs`, **remove** the `['skill-context']` invalidation (`agents.ts:137`, REC2). `useSetSkillContext.onSuccess`: same call (REC1). Optimistic update/rollback unchanged.
- **Layer / why here:** client data layer (`lib/hooks`), one hook per endpoint.
- **Skills to apply:** `react-best-practices`, `frontend-architecture`, `typescript-expert`, `react-testing-library`
- **Practices:** pure helpers outside the hooks; no component changes here; test mocks `../api` only (boundary), as `skills-ordering.test.tsx` does.
- **Known gotchas:** client gotchas → Tooling: use `pnpm exec vitest run <pattern>`.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run context-invalidation skills-ordering` passes; the new test asserts: an agent save adding `b.md` invalidates `['context-doc','r1','b.md']` but not the unchanged `a.md` key; a reorder-only save invalidates nothing; a skill save invalidates its changed path; an agent save leaves `['skill-context', …]` alone.

### S9 — Picker save error, shared `attachedPaths` and `DEFAULT_DOC_TYPE`
- **Files:** `client/src/components/context-doc-picker/ContextDocPicker.tsx`, `helpers.ts`, `index.ts`, `styles.ts`, `ContextDocPicker.test.tsx` (all modify); `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.tsx`, `ContextTab.test.tsx` (modify); `client/src/app/skills/[id]/_components/SkillEditor/_components/ContextTab/ContextTab.tsx`, `helpers.ts`, `index.ts`, `ContextTab.test.tsx` (modify); `client/messages/en/context.json` (modify)
- **Change:** picker prop `saveFailed?: boolean` (D8 A) → renders `<div role="alert">{t("picker.saveFailed")}</div>` at the bottom of the picker (after the truncated note); i18n `context.picker.saveFailed` = "Could not save the attached documents. Your change was undone." (GAP2). `attachedPaths(links: readonly { path: string; order: number }[] | undefined): string[]` moves into the picker's `helpers.ts`, exported from its `index.ts` together with `DEFAULT_DOC_TYPE`; the agent tab's local copy (`ContextTab.tsx:19`) and the skill tab's (`helpers.ts:10`, re-exported in `index.ts:2`) are deleted and both tabs call `attachedPaths(context?.links)`. Both tabs pass `saveFailed={setContext.isError}`.
- **Layer / why here:** shared chrome in `src/components/` (two consumers); owners keep mutations (container/presentational split).
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** picker stays ≤ 7 props; copy only via `next-intl`; hook mocks in `ContextDocPicker.test.tsx` and the skill `ContextTab.test.tsx` spread `importActual` first; interactions via `fireEvent`.
- **Known gotchas:** client gotchas → Tests: `importActual`; `fireEvent`, no `user-event`. UI: replace-all PUT loading guard — keep the tabs' `isLoading`/`isError` early returns; TS2742 — the new `styles.ts` entry is its own literal `satisfies CSSProperties`.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run context-doc-picker AgentEditor/_components/ContextTab SkillEditor/_components/ContextTab` passes; tests assert: `attachedPaths` sorts by `order`; after a failed PUT on the agent tab and on the skill tab the alert text appears; no alert before any save.

### S10 — Project Context page: roots load state, stale error, repos loading
- **Files:** `client/src/app/repos/[repoId]/context/page.tsx`, `page.test.tsx`, `_components/ContextDocList/ContextDocList.tsx`, `_components/ContextDocList/helpers.ts` (modify); `client/messages/en/context.json` (modify)
- **Change:** read `reposLoaded` from `useActiveRepo()`; show the listing skeleton while `listing.isLoading || !reposLoaded` (no "not cloned" state before repos load). Roots section: `roots.isLoading` → `Skeleton`; `roots.isError` → `<ErrorState body={t("roots.loadError")} onRetry={() => roots.refetch()} />`; i18n `context.roots.loadError` = "Could not load the search roots." (GAP2). Starting one roots mutation resets the other: `onSave` calls `resetRoots.reset()` before `setRoots.mutate`, `onReset` calls `setRoots.reset()` before `resetRoots.mutate`. `ContextDocList.tsx` imports `DEFAULT_DOC_TYPE` from `@/components/context-doc-picker`; delete it from `ContextDocList/helpers.ts`.
- **Layer / why here:** route container (`page.tsx`) owns loading/error states; list stays presentational.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** early-return/ternary per state, no derived `useState`; the `page.test.tsx` mock of `useActiveRepo` gains `reposLoaded: true` (plus a case with `false`).
- **Known gotchas:** client gotchas → Tooling: a vitest filter containing `[repoId]` matches nothing — filter on `context/`.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run context/` passes; tests assert: a failed roots GET shows "Could not load the search roots." and Retry refetches; a failed Save followed by a successful Reset shows no error; with `reposLoaded: false` the not-cloned title is absent.

### S11 — Stable trace keys; DocPreview test mock
- **Files:** `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`, `…/RunTraceDrawer/RunTraceDrawer.test.tsx`, `client/src/components/context-doc-preview/DocPreview.test.tsx` (modify)
- **Change:** `specs_read` spans keyed by the path (unique: `readDocsForRun` dedupes, `context/service.ts:170-177`); skipped spans keyed `skipped-${sp.path}` (unique: `mergeContextPaths` dedupes, `reviews/helpers.ts:122`). Trace test: a trace with two `specs_read` and two `specs_skipped` renders all four and logs no React key warning (spy on `console.error`). Hook mocks in both test files spread `importActual` first.
- **Layer / why here:** presentational components and their tests.
- **Skills to apply:** `react-best-practices`, `react-testing-library`
- **Practices:** never an array index as `key`.
- **Known gotchas:** client gotchas → Tests: `importActual` when mocking a hooks module.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run RunTraceDrawer context-doc-preview` passes.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `context-helpers.test.ts`, `token-cache.test.ts` | unit | AC7 PSR1, filter, cache | S2, S3 |
| `context.it.test.ts` | it | AC1, AC2, SEC3 | S4, S4b |
| `agents-context.it.test.ts`, `skills.it.test.ts` | it | AC4 write | S5 |
| `context-paths-normalise.it.test.ts` | it | AC4 migration | S6, S7 |
| `context-invalidation.test.tsx` | unit | AC6 | S8 |
| picker, agent/skill `ContextTab.test.tsx` | unit | AC5, AC7 | S9 |
| `page.test.tsx`, `RunTraceDrawer.test.tsx`, `DocPreview.test.tsx` | unit | AC5, AC7 | S10, S11 |

## Migrations & contracts
- Contract: `SetContextRootsBody` bounds, server shared then client mirror (S1).
- Migration: data-only `pnpm db:generate --custom --name normalise_context_paths` (S6, implementer) + SQL body (S7, main session); no schema/DDL change. Main session runs `pnpm db:migrate` after S7.

## Out of scope
- F3/F4, the stale `run.ts:34` comment, AGENTS.md lines, the dependency audit, `.github` dot-dirs, e2e flows.
- Persisting token counts; any new depth bound (D3: none).
- Any change to `readSafely`'s guard logic (only the additive `SafeRead.mtimeMs` field is allowed, S4), to `readDocsForRun`, to repositories or to the DB schema. The only route change is S4b's `DocQuery`.

<!-- implementer-brief:end -->

## Context applied
- `server/insights/gotchas.md` → glob shape caps (S2), realpath both sides + SF1 allowlist (S4), `--custom` stub (S6, S7).
- root `INSIGHTS.md` → "auto-mode permission check blocks … migration file" (D6, S6/S7); "vendored `shared` copies not in sync" (S1).
- `client/insights/gotchas.md` → replace-all PUT loading guard (S9), `importActual` (S9, S11), `[repoId]` vitest filter (S10), TS2742 styles (S9), `fireEvent` (S9).
- `docs/plans/24-project-context.md` → `## Follow-ups` (scope); `specs/008-project-context.md` AC-5, AC-7 (amended), AC-14, edge case "very deep trees".

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S2, S3, S4, S5 | |
| engineering-insights | preload | — | read-only here; wrap-up runs after implementation |
| zod | on demand (S1) | S1 | |
| typescript-expert | on demand (S1) | S1–S6, S8–S10 | |
| security | on demand (S1) | S1, S2, S4, S5 | |
| fastify-best-practices | on demand (S4) | S4, S5 (inject tests) | |
| drizzle-orm-patterns | on demand (S6) | S6, S7 | |
| postgresql-table-design | on demand (S7) | S7 | |
| frontend-architecture | on demand (S8) | S8, S9, S10 | |
| react-best-practices | on demand (S8) | S8–S11 | |
| next-best-practices | on demand (S10) | S10 | |
| react-testing-library | on demand (S8) | S8–S11 | |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `contracts/platform.ts` (both copies) | ports | changed |
| server | `modules/context/{constants,helpers,service}.ts`, `token-cache.ts` | application | changed / new |
| server | `modules/agents/service.ts`, `modules/skills/service.ts` | application | changed |
| server | `db/migrations/<NNNN>_normalise_context_paths.sql` | infrastructure | new (data only) |
| client | `lib/hooks/{context,agents,skills}.ts` | data layer | changed |
| client | `components/context-doc-picker/`, agent/skill `ContextTab/` | components | changed |
| client | `repos/[repoId]/context/` page + `ContextDocList`, `TraceBody` | route / components | changed |

## Design notes
### Migration SQL (S7)
`norm(p)` = `regexp_replace(regexp_replace(regexp_replace(replace(p, '\', '/'), '/{2,}', '/', 'g'), '^(\./)+', ''), '/(\./)+', '/', 'g')` — backslash → `/`, collapse `//`, strip leading `./`, drop inner `/./`. This matches `normaliseDocPath` (`context/helpers.ts:39-53`) for every path `ContextDocPath` admits (no `..`, not absolute). Per table (`agent_context_docs` / `agent_id`, `skill_context_docs` / `skill_id`):
```sql
DELETE FROM "agent_context_docs" a USING "agent_context_docs" b
WHERE a."agent_id" = b."agent_id" AND a."path" <> b."path"
  AND norm(a."path") = norm(b."path")
  AND (a."order", a."path") > (b."order", b."path");
--> statement-breakpoint
UPDATE "agent_context_docs" SET "path" = norm("path") WHERE "path" <> norm("path");
```
(`norm` written out inline — no SQL function is created.) The DELETE keeps the lowest `(order, path)` row per canonical path (TQ5); order gaps stay — runs sort by `order`.

### Walk semantics
No depth limit. `truncated` = visited cap (20,000 dirents) or 500-doc cap hit; either ends the walk. Recursion depth is bounded by the visited cap, and symlinks are never followed, so no loop. `picomatch.scan(...).base` is `''` for the default root `**/{specs,docs,insights}/**/*.md`, so pruning is a no-op there and helps only roots with a literal prefix.

### Pass-1 requirements review (resolved — see *Decisions recorded*)
- TQ1 422 on an un-normalisable path · TQ2 5,000-entry cache · TQ3 20,000 visited entries · TQ4 picker folder is the home · TQ5 keep lower `order` · TQ6 `getDoc` uses the cache.
- GAP1 AC-7 amended (cache allowed) · GAP2 copy as recorded.
- REC1 skill save invalidates changed `context-doc` · REC2 agent save no longer invalidates `skill-context` (`skills/service.ts:235`) · REC3 normalise via `container.context`.
- D1 A token-cache class · D2 A cap + prefix pruning · D3 (changed 2026-10-05) no depth limit, visited cap only; `MAX_WALK_DEPTH` removed · D4 B `.max(100)` / `.max(1024)` · D5 A `container.context.normalisePath` · D6 A implementer stub, main session SQL · D7 A changed-path predicate · D8 A `saveFailed` prop · D9 multi-agent (re-checked: migration + contract, 3 packages, 11 steps — rule holds).

## Risks & open questions
- **Spec wording:** SPEC-08 AC-5 says results are "bounded by the existing walk-depth and document-count limits" (`specs/008-project-context.md:92`); with D3 there is no walk-depth limit. AC-5 needs a `spec-creator` wording change ("bounded by the visited-entries and document-count limits") before implementation; the edge case "very deep trees" also no longer truncates by depth.
- With no depth limit, a large clone whose matching docs sit after 20,000 visited entries (sorted walk order) is reported `truncated` with those docs missing; the default root cannot prune.
- Cold cache: the first listing after boot, or after a sync touches files, still reads up to 500 × 512 KB; the cache only helps repeat listings.
- The visited-cap `.it` case writes 20,001 empty files (S4c); it may add seconds to the `.it` lane.
- mtime+size key: an edit that keeps size within the same mtime tick serves a stale count (accepted by amended AC-7).
- Schema-level 422 for > 100 globs or a > 1024-char glob carries the error handler's generic message, not the service's.
- `pnpm db:generate --custom` itself ran fine for an implementer in plan 12; if the harness denies it too, the main session runs it on the user's instruction.

## Handed off
- architecture-reviewer: `agents`/`skills` services reaching `container.context` (S5); token cache placement (S3/S4).
- security review: `SetContextRootsBody` bounds (S1); negated-glob and second-`**` refusals (S2); walk caps as DoS bound (S4); `?path=` bound (S4b); path canonicalisation on write (S5); migration SQL (S7).

## Insights to record
- `server/INSIGHTS.md` · Tool & Library Notes — `picomatch.scan(g).base` is `''` for `**/…` and brace-led globs, so base-prefix pruning never prunes the default context root (`server/node_modules/picomatch/lib/scan.js:293-307`) — candidate, confirm after S4.

## Red-flags check
- [x] Every AC maps to at least one step or test (no-spec plans)
- [x] Every spec AC-n has a row in *Spec traceability* — n/a (no-spec plan)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create` (generated migration files marked generated)
- [x] Every assumption is marked; technical choices are in *Decisions needed*, product gaps are GAPn
- [x] Groups end type-checking; parallel groups share no file (G3 ∥ G2/S7: client vs server)
- [x] No group under 3 files / ~80 lines that could merge with a neighbour (S7 is a main-session step, not a run)
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1: n/a (pass 2)
- [x] Execution mode recommended per the D4 rule
- [x] Every step's *Skills to apply* is complete
- [x] `bash .claude/skills/sdd/scripts/sdd.sh plan-lint <plan>` prints `plan-lint: ok`

## Handoffs → G1

### Handoff to the next group
- `ContextService.normalisePath(raw): string | null` (public) — G2 calls `this.container.context.normalisePath`.
- `compileDirFilter` in `context/helpers.ts`; `TokenCountCache`, `tokenCacheKey` in `context/token-cache.ts`.
- `MAX_WALK_DEPTH` removed; `MAX_VISITED_ENTRIES` (20,000) and `MAX_TOKEN_CACHE_ENTRIES` (5,000) added.
- `truncated` = 500-doc cap or visited cap only. `context.it.test.ts` case (c) writes 20,001 files (~5 s).
- `SetContextRootsBody` = `z.array(z.string().max(1024)).min(1).max(100)` in both shared copies.
- Review: `compileDirFilter` admits every dir for a glob with no static base; `readSafely` unchanged.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S2, S3, S4 | |
| engineering-insights | preload | gotchas read | no insight |
| zod | full | S1 | |
| typescript-expert | full | S1–S4 | |
| security | full | S1, S2, S4 | |
| fastify-best-practices | full | S4 | no route change |

## Handoffs → G2

### Handoff → G2 (S5–S6) + S7 (main session)
- Agents and skills services canonicalise paths on write via `this.container.context.normalisePath` (skills service constructor now takes `container`); an unnormalisable path → 422 echoing ≤80 chars.
- Migration `0023_normalise_context_paths.sql` (custom, data-only): per table DELETE collisions keeping lowest `(order, path)`, then UPDATE to canonical; SQL written by the main session (S7). Applied locally.
- Test `server/test/context-paths-normalise.it.test.ts` runs the migration chunks twice (idempotent): 2/2.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S5 | |
| fastify-best-practices | full | S5 | |
| typescript-expert | full | S5, S6 | |
| security | full | S5 | |
| drizzle-orm-patterns | full | S6 | |
| postgresql-table-design | main session | S7 | |

## Handoffs → G3

### Handoff → G3 (S8–S9)
- `client/src/lib/hooks/context.ts` exports `changedPaths(before, after)` and `invalidateContextDocs(qc, paths)`; agent and skill save hooks invalidate only changed paths' `['context-doc']`; agent save no longer invalidates `['skill-context']`.
- `ContextDocPicker` gains `saveFailed` (role="alert", `context.picker.saveFailed`); `attachedPaths` and `DEFAULT_DOC_TYPE` exported from `@/components/context-doc-picker` — S10 imports `DEFAULT_DOC_TYPE` in ContextDocList and deletes its copy. S10 still adds `roots.loadError`.
- Deviations (trivial): DEFAULT_DOC_TYPE re-exported from the picker's constants.ts; alert colour `var(--crit)`.
- Process note: `typescript-expert`, `react-testing-library` read only partly.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| react-best-practices | full | S8, S9 | |
| frontend-architecture | full | S9 | |
| typescript-expert | partial | S8, S9 | not read in full |
| react-testing-library | partial (~150 lines) | S8, S9 | not read in full |

## Handoffs → G4

### Handoff → G4 (S10–S11)
- Project Context page: listing skeleton while `listing.isLoading || !reposLoaded`; roots section Skeleton/ErrorState("Could not load the search roots.")+Retry; each roots mutation resets the other's error first.
- `ContextDocList` imports `DEFAULT_DOC_TYPE` from `@/components/context-doc-picker` (copy deleted).
- TraceBody keys by path; RunTraceDrawer/DocPreview test mocks spread `importActual`.
- Deviation (trivial): the key-warning test guards regression only.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| frontend-architecture | full | S10 | |
| react-best-practices | full | S10, S11 | |
| next-best-practices | full | S10 | no RSC change |
| react-testing-library | full | S10, S11 | fireEvent per repo gotcha |
| typescript-expert | full | S10, S11 | |

## Follow-ups
- 2026-10-05 docs: server/docs/architecture.md:346 still names MAX_WALK_DEPTH (6) — refresh at the docs stage
- 2026-10-05 TraceBody.tsx:134 ToolCallRow key={i} (outside S11 scope)
- 2026-10-05 residual: with no depth limit, ~20,000 .md files on ~4 KB paths × ~8 ms worst accepted glob ≈ minutes for one listing of a hostile clone — consider a max matched-path length (needs a SPEC-08 AC-5 wording change)
- 2026-10-05 flake risk: wall-clock timing guards (< 50 ms) in context-helpers.test.ts run inside the parallel unit suite; one unexplained file-level failure seen once — consider a generous CI margin or isolating them
- 2026-10-05 PSR25-UI-H1: Project Context page — if the repos request fails, reposLoaded stays false and the document column is a skeleton forever (no error/Retry); expose repos error/pending from useActiveRepo
- 2026-10-05 PSR25-UI-M: invalidateContextDocs ignores repoId (same path in another repo refetched) — fix the comment or match queryKey[1]; RunTraceDrawer.test console.error spy not restored on failure (afterEach restoreAllMocks); dead setup line in context-invalidation.test.tsx:86; no test for the null (unknown before) invalidate-all branch
- 2026-10-05 PSR25-BE-M: 0023 SQL does not resolve inner 'x/../' like posix.normalize — legacy rows with '..' stay non-canonical (contract now refuses '..'); fix the header comment or handle '..'; duplicate canonicalise-or-422 loop in agents/skills services → ContextService.canonicalPathsOrThrow; hard < 50 ms timing asserts in context-helpers.test.ts (lines ~178/205/274) are close to the measured worst (58 ms) → loosen or best-of-N

## Handoffs → S7

### Skills — S7 (main session, closes SK7)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| drizzle-orm-patterns | SKILL.md + references/migrations.md ("Custom Migration SQL", generate → migrate, test before applying) | S7 — SQL lives in the `db:generate --custom` stub, statements split by `--> statement-breakpoint`, verified by `context-paths-normalise.it.test.ts` (fresh Postgres, run twice) before `pnpm db:migrate` | |
| postgresql-table-design | main session | S7 — PK `(owner_id, path)` respected: collisions deleted before the UPDATE, so no PK violation; `"order"` quoted | |

## Handoffs → fix-1

### Fix mode 1 — SEC1, SEC2, CK1, DOC1, SK8
- SEC1: `validateRootGlob` refuses a leading `!`; `compileDirFilter` admits all dirs when any `scan(g).negated`.
- SEC2: new `MAX_MULTI_WILDCARD_SEGMENTS = 1` (at most one segment with ≥2 wildcards); measured on a 4,093-char path; timing test: 9 accepted globs < 50 ms at 4,096 chars. Main-session probe: worst accepted shape ~8 ms per 4 KB path.
- CK1: `SafeRead.mtimeMs`; listing and `getDoc` share cache entries (.it: 1 tokenizer call).
- DOC1: `useSetSkillContext` docblock names the changed `context-doc` queries.
- SK8: `core.ts` — dead `useContextFiles` removed; `useReindexContext` now invalidates `['context-docs', repoId]`.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| security | full | SEC1, SEC2 | |
| onion-architecture | preload | CK1 | |
| frontend-architecture | SKILL.md + folder-structure.md + component-organization.md | S8 (SK8) | |

## Handoffs → fix-2

### Fix mode 2 — SEC1b, SEC2b, SEC3
- SEC1b: `validateRootGlob` refuses `startsWith('!') || picomatch.scan(glob).negated` (closes `./!`).
- SEC2b: with two `**`, only the file name may follow the second; measured 122 followers 1101 ms → refused; default 3 ms. Main-session probe of 9 accepted 2-`**` shapes on three 4 KB adversarial paths: ≤ 10 ms each.
- SEC3 (S4b): `DocQuery.path` = shared `ContextDocPath` (max 512); 513 chars → 4xx `validation_error`, 512 → reaches the guard (404).

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S2, S4b | |
| security | full | SEC1b, SEC2b, SEC3 | |
| fastify-best-practices | full | S4b | |
| zod | not read | S4b | reused shared ContextDocPath, no new schema |
| typescript-expert | not read | S2, S4b | no new type-level code |

## Handoffs → fix-3

### Fix mode 3 — SEC2c
- `globShapeProblem` refuses any segment that contains `**` but is not exactly `**` (`{**,x}.md`, `{a,**}.md`, `a**b`); braces cannot contain `/`, so brace content is always inside one checked segment.
- Timing guard gains `'a/'.repeat(2046)+'b.MD'`.
- Main-session fuzz after the fix: 970,555 random globs (22 segment atoms incl. braces/classes/extglob/negation, 9 filename atoms), 600,222 accepted, each matched against 6 adversarial 4 KB paths — worst 57.6 ms (`**/?/**/[ab]*.md`), down from 2,700+ ms.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | SEC2c | |
| security | full (earlier in run) | SEC2c | |

## Verification log
- 2026-10-05 agent: plan-p1 aee59277ae07d493b implementation-planner 2026-10-05T12:18:38Z
- 2026-10-05 decisions recorded: TQ1-6 defaults, D1-D8 (D4 B), D6 main session writes migration SQL, D9 multi-agent, GAP1 → spec-creator, GAP2 copy as proposed
- 2026-10-05 agent: spec-p2 a790b313195e53d9b spec-creator 2026-10-05T12:20:51Z
- 2026-10-05 GAP1 closed: SPEC-08 AC-7 amended and re-approved (back to approved for plan 25)
- 2026-10-05 agent: plan-p2 aee59277ae07d493b implementation-planner 2026-10-05T12:27:28Z
- 2026-10-05 user: D3 changed to 'drop depth limit, visited-entries cap only'; plan approved conditional on that change
- 2026-10-05 agent: plan-p2 aee59277ae07d493b implementation-planner 2026-10-05T12:29:36Z
- 2026-10-05 agent: spec-p2 a790b313195e53d9b spec-creator 2026-10-05T12:29:53Z
- 2026-10-05 plan approved by user (with D3: no depth limit); SPEC-08 AC-5 amended and re-approved
- 2026-10-05 agent: implement a7fa4f262e95c5538 implementer 2026-10-05T12:33:35Z
- 2026-10-05 implement G1: done (S1-S4; server+client typecheck ok; 560 unit; context.it etc 51 passed)
- 2026-10-05 agent: implement a46a4ec16dcaf9994 implementer 2026-10-05T12:35:13Z
- 2026-10-05 main-session fix: S7 — wrote 0023_normalise_context_paths.sql (DELETE collisions keeping lowest (order,path) + UPDATE to canonical, for agent_context_docs and skill_context_docs; user-permitted, D6)
- 2026-10-05 S7 Done-when: context-paths-normalise 2/2 passed (incl. idempotent second run); pnpm db:migrate applied 0023
- 2026-10-05 implement G2: done (S5-S6; agents-context + skills .it 30 passed)
- 2026-10-05 agent: implement ab7a068190add3d81 implementer 2026-10-05T12:35:55Z
- 2026-10-05 implement G3: done (S8-S9; client typecheck ok, 55 files / 406 tests)
- 2026-10-05 agent: implement a3721d6fa13b33b97 implementer 2026-10-05T12:37:06Z
- 2026-10-05 implement G4: done (S10-S11; client 55 files / 410 tests)
- 2026-10-05 after G4: server full vitest 75 files / 739 passed; client 410; reviewer-core 223; typechecks clean
- 2026-10-05 agent: tests a4a61a8c4d0ca48d8 test-writer 2026-10-05T12:40:59Z
- 2026-10-05 tests: test-writer extended 5 server test files (trust-boundary, cache, visited cap); break checks restored — main session verified the 6 subject files byte-identical to refs/sdd/25/wave-3
- 2026-10-05 it-suite: server full vitest  Test Files  75 passed (75)       Tests  757 passed (757) 
- 2026-10-05 agent: review a79a98d1c7d9d7298 architecture-reviewer 2026-10-05T12:43:07Z
- 2026-10-05 agent: review a89887a1da8848077 security-reviewer 2026-10-05T12:45:06Z
- 2026-10-05 agent: review a57dd14d7bd624a28 plan-verifier 2026-10-05T12:45:32Z
- 2026-10-05 review 1 triage: fix SEC1 (negated root '!…' passes validateRootGlob, compileDirFilter prunes by scan base → hides docs), SEC2 (allowed 2-wildcard/2-** glob costs ~250-790 ms per long path in the walk → minutes on GET listing; measured by security-reviewer), CK1 (getDoc cache key uses mtime.getTime(), walk uses mtimeMs → never shared), DOC1 (skills.ts:195 stale docblock), SK8; main session closes SK7; follow-up: server/docs/architecture.md MAX_WALK_DEPTH text, TraceBody ToolCallRow key={i}
- 2026-10-05 main-session: SK7 closed — drizzle-orm-patterns (references/migrations.md) applied to S7, recorded under Handoffs → S7
- 2026-10-05 agent: fix-loop aa611113852fab693 implementer 2026-10-05T12:50:22Z
- 2026-10-05 fix 1 done; it-suite: server  Test Files  75 passed (75)       Tests  762 passed (762) ; client       Tests  410 passed (410); main-session probe of the new glob rule: worst accepted ~8 ms per 4 KB path
- 2026-10-05 agent: review af3216e8d77f98566 plan-verifier 2026-10-05T12:53:45Z
- 2026-10-05 agent: review aa2af19cff7412220 security-reviewer 2026-10-05T12:57:27Z
- 2026-10-05 review 2 triage (user-approved plan change): accept core.ts in S8 (O1) and additive SafeRead.mtimeMs in readSafely (O3/P4); add SEC2b (with two '**', only the final segment may follow the second — main-session measured '**/*/**/'+'*/'×122+'*.md' at 1068 ms on 2046 one-char segments; '**/docs/**/'+15 segs 170 ms; default 3 ms), SEC1b (refuse scan(g).negated, './!' bypass), SEC3 (GET /context/doc ?path= uses shared ContextDocPath max 512; routes.ts added to the plan)
- 2026-10-05 agent: plan-p2 aee59277ae07d493b implementation-planner 2026-10-05T13:03:20Z
- 2026-10-05 plan re-approved (user-approved review-2 change: O1, O3/P4, SEC1b, SEC2b, S4b/SEC3)
- 2026-10-05 agent: fix-loop aabc87e09b75f1499 implementer 2026-10-05T13:05:36Z
- 2026-10-05 fix 2 done; it-suite: server  Test Files  1 failed | 74 passed (75)       Tests  767 passed (767) ; main-session probe: accepted 2-** shapes ≤10 ms on 4 KB adversarial paths
- 2026-10-05 it-suite note: first full run after fix 2 reported '1 failed | 74 passed' files with 767/767 tests passed (file-level error, output not captured); two immediate re-runs: 75/75 files, 767/767 — treated as a flake, suspect the <50 ms timing guards under parallel load
- 2026-10-05 agent: review a1f550c48927814cf plan-verifier 2026-10-05T13:10:26Z
- 2026-10-05 agent: review a8201721685110d81 security-reviewer 2026-10-05T13:11:58Z
- 2026-10-05 review 3 triage: verifier complete; security PASS but SEC2c confirmed by main-session measurement — a '**' inside braces is a slash-crossing globstar the shape cap does not count: '**/*/**/{**,x}.md', '**/a/**/{**,x}.md', '**/{**,a}/**/x.md' all ACCEPTED and take ~2.7–2.8 s on 'a/'.repeat(2046)+'b.MD' (walk shape); getDoc shape (510 chars) 5 ms. Fix iteration 3 of 3.
- 2026-10-05 agent: fix-loop aabc87e09b75f1499 implementer 2026-10-05T13:14:24Z
- 2026-10-05 fix 3 (SEC2c) done; main-session fuzz worst 57.6 ms per 4 KB adversarial path over 600,222 accepted globs; it-suite: server  Test Files  75 passed (75)       Tests  768 passed (768) ; client       Tests  410 passed (410); reviewer-core       Tests  223 passed (223)
- 2026-10-05 review iteration 3 (cap reached): fix 1 (SEC2c), plan-change 0, follow-up 0 new, sign-off 0; no CRITICAL/HIGH open; tree 875465b804a547d542226bb6831b862bf7fd70ed
- 2026-10-05 agent: review adc5b347cc6a35c9e plan-verifier 2026-10-05T13:17:45Z
- 2026-10-05 insights: server correction entry (glob shape bypasses + fuzz rule) and gotcha item updated
- 2026-10-05 self-review: PASS (0 CRITICAL; 1 HIGH + 7 MEDIUM → Follow-ups); deterministic gates: server 768, client 410, core 223, typechecks clean, contract copies in sync
- 2026-10-05 metrics: flags: 1 flag(s), 0 repeat(s)
