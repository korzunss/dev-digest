# Development Plan: Blast Radius (PR impact map, Prior PRs, MCP tool)
Status: done
Save as: docs/plans/18-blast-radius.md
Spec: none

## Goal & acceptance criteria
Ship Blast Radius end to end: a new `modules/blast` API over the existing repo index, the Overview-tab map with Prior PRs, and a working MCP `get_blast_radius`.
- AC1: `GET /pulls/:id/blast` returns a contract-valid `BlastRadius`; `getBlastRadius` is called exactly once per request; no LLM is reached.
- AC2: callers are grouped per changed symbol (`downstream`), ≤ `MAX_CALLERS_PER_SYMBOL` per symbol, traversal to `BFS_DEPTH` (2), declaring file never among its own callers; endpoints/crons per group come from the callers' `factsByFile`; groups sorted by the declaring file's `file_rank` desc.
- AC3: `degraded` + `reason` (`flag_off` / `index_failed` / `no_data` / …) reach the UI and the MCP output; `limits` carries the two constants.
- AC4: a request served from the index logs one `info` line saying it read the persistent index with no AST/graph rebuild (fallback logs a different line).
- AC5: Overview tab shows the summary row (symbols, callers, endpoints, crons), a collapsible tree per symbol with `file:line` forge-blob links, endpoints and crons listed separately, a Tree/Graph toggle with an SVG graph, an empty state, a degraded badge with the reason and a resync button.
- AC6: `GET /pulls/:id/history` returns `PrHistory` (merged PRs touching the changed files, from GitHub; GitLab → `status: 'unsupported'`; forge failure → `status: 'unavailable'`), cached per `(prId, headSha)`; the Overview tab shows it.
- AC7: MCP `get_blast_radius` returns the same map (strings through `cut()`), a resolution error for an unknown PR, `readOnlyHint: true`.
- AC8: a demo runbook shows how to get ≥2 real callers and ≥1 endpoint on a real indexed repo.

## Decisions needed
None open — see *Decisions recorded*. (The pass-1 options table is kept below the marker under *Design notes → Pass-1 options*.)

## Decisions recorded
User, 2026-10-02: "всі рекомендовані".
- **D1-A:** extend `BlastRadius` in place (`degraded`, `reason` with `DegradedReason` moved to shared, `rank` per downstream, `depth` per caller, `limits`).
- **D2-A:** fix the facade: per-symbol cap, depth 2, declaring-file exclusion, real degraded reasons.
- **D3-B:** sort symbols by the declaring file's `file_rank`.
- **D4-B:** new `ForgeClient` method; GitHub implemented, GitLab returns empty + "unsupported".
- **D5-A:** separate `GET /pulls/:id/history` with its own hook and an in-process TTL cache per `(prId, headSha)`.
- **D6-A:** hand-rolled SVG graph.
- **D7-A:** real indexed repo + runbook; tests use an `.it` fixture.
- **D8-A:** MCP returns the same `BlastRadius` JSON, strings through `cut()`, no Prior PRs.
- Research questions 3 and 4 are dropped (D4-B, D6-A).
- **Approval (user, 2026-10-02):** "затверджено". Approved as written, including the planner's pass-2 assumptions (`BlastCaller.via`, downstream only for symbols with callers, grouping by name, history caps 10/5/20 + 10-min TTL/200 entries, `PrHistory.status`, `notes` = '') and the ~33k brief size.

## Prerequisites
- Postgres up (Docker) for `server` `.it` tests (G3).
- No new dependencies.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S2 | shared contract (+client mirror) + server forge adapters | — | `DegradedReason`, new `BlastRadius`/`PrHistory` fields, `MergedPrTouching`, `MergedPrLookup`, `ForgeClient.listMergedPullsTouching`; `MockForgeOptions.mergedPulls` |
| G2 | S3–S4 | server repo-intel (repository + facade) | G1 | `BlastResult` new fields (`source`, `indexStatus`, symbol `rank`, caller `depth`/`via`); `RepoIntelRepository.getFileRanks` |
| G3 | S5–S8 | server `modules/blast` (helpers → repository → service → routes/DI) | G2 | routes `GET /pulls/:id/blast`, `GET /pulls/:id/history`; `container.blast` |
| G4 | S9–S12 | client data layer, i18n, Blast tree card, Prior PRs card, Overview wiring | G3 | hooks `useBlastRadius`, `usePrHistory`; `BlastRadiusCard` props |
| G5 | S13 | client Graph view + Tree/Graph toggle | G4 | — |
| G6 | S14–S16 | mcp-server tool + demo runbook | G3 (may run in parallel with G4/G5 — no shared file) | — |

## Steps

### S1 — Extend blast/history contracts and add the forge port method  [Contract]
- **Files:** `server/src/vendor/shared/contracts/brief.ts` (modify), `server/src/vendor/shared/adapters.ts` (modify), `client/src/vendor/shared/contracts/brief.ts` (modify, same edit), `client/src/vendor/shared/adapters.ts` (modify, same `ForgeClient` edit only)
- **Change:** in `brief.ts` (`// ---- Blast radius ----`, lines 62–90; `PrHistory`, 110–123):
  - add `DegradedReason = z.enum(['flag_off','index_failed','index_partial','repo_too_large','no_data'])` + type;
  - `ChangedSymbol` + `rank: z.number()` (declaring file's `file_rank`, 0 when degraded);
  - `BlastCaller` + `depth: z.number().int().min(1)`, `via: z.string().nullable()` (depth-1 caller name a depth-2 caller reaches through; `null` at depth 1) (assumption — needed for graph edges);
  - `DownstreamImpact` + `rank: z.number()`;
  - `BlastRadius` + `degraded: z.boolean()`, `reason: DegradedReason.nullable()`, `limits: z.object({ callers_per_symbol: z.number().int(), depth: z.number().int() })`;
  - `PrHistory` + `status: z.enum(['ok','unsupported','unavailable'])`.
  In `adapters.ts` (port, next to `ForgeClient`, server :221): `interface MergedPrTouching { number; title; author; merged_at: string; paths: string[] }`, `interface MergedPrLookup { supported: boolean; items: MergedPrTouching[] }`, and on `ForgeClient`: `listMergedPullsTouching(repo: RepoRef, paths: string[], opts: { excludeNumber: number; commitsPerPath: number; limit: number }): Promise<MergedPrLookup>` with a one-line doc (no vendor name). Mirror into the client copy (`ForgeClient` at client `adapters.ts:175`) by hand.
- **Layer / why here:** contracts and ports live in `@devdigest/shared`; contract-first (CLAUDE.md).
- **Skills to apply:** `onion-architecture`, `zod`, `typescript-expert`
- **Practices:** `z.infer` types exported beside each schema; enums via `z.enum`, nullable (not optional) for `reason`/`via`; port names speak the app's language (no `github`/`octokit` in names); never `cp` the shared folder.
- **Known gotchas:** vendored copies drift — mirror the specific edit only → [root INSIGHTS 2026-09-17](../../INSIGHTS.md); TS2719 in fixture factories after a new required field → [root INSIGHTS 2026-09-17 TS2719](../../INSIGHTS.md).
- **Done when:** `diff <(sed -n '/---- Blast radius ----/,/---- Smart Diff ----/p' server/src/vendor/shared/contracts/brief.ts) <(sed -n '/---- Blast radius ----/,/---- Smart Diff ----/p' client/src/vendor/shared/contracts/brief.ts)` is empty · `cd client && pnpm typecheck` green · server typecheck is expected red **only** on the three `ForgeClient` implementers until S2 (same group).

### S2 — Implement `listMergedPullsTouching` in the forge adapters
- **Files:** `server/src/adapters/github/merged-prs.ts` (create), `server/src/adapters/github/octokit.ts` (modify), `server/src/adapters/gitlab/rest.ts` (modify), `server/src/adapters/mocks.ts` (modify), `server/test/github-merged-prs.test.ts` (create)
- **Change:** `merged-prs.ts` exports pure `collectMergedPrs(paths, io: { listCommits(path): Promise<string[]>; prsForCommit(sha): Promise<{number,title,author,merged_at:string|null}[]> }, opts)` implementing the research algorithm: per path → commit SHAs (concurrency 4, chunked `Promise.allSettled`, no new dep); unique SHA → paths map; per SHA → associated PRs (concurrency 4); keep `merged_at != null && number !== excludeNumber`; dedupe by number, union paths; `paths` sorted; sort `merged_at` desc; slice `limit`. A rejected call with `status` 404/409 counts as empty; other per-path failures are skipped; if **every** `listCommits` call rejected, rethrow the first error. Missing author → `'unknown'`. `OctokitGitHubClient.listMergedPullsTouching` wires `io` to `this.octokit.rest.repos.listCommits({owner, repo, path, per_page: commitsPerPath})` and `this.octokit.rest.repos.listPullRequestsAssociatedWithCommit({owner, repo, commit_sha, per_page: 5})`, each wrapped in `withRetry(() => withTimeout(..., TIMEOUT))`, returns `{ supported: true, items }`. GitLab returns `{ supported: false, items: [] }` with no HTTP call. `MockForgeClient`: new `MockForgeOptions.mergedPulls?: MergedPrTouching[]` → `{ supported: true, items: (mergedPulls ?? []).filter(p => p.number !== opts.excludeNumber).slice(0, opts.limit) }`.
- **Layer / why here:** external HTTP → adapter behind the port; the pure algorithm sits beside its only adapter so it is unit-testable without Octokit.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:** adapter imports only the port types + SDK; no `modules/**` import; every SDK call inside `withRetry(withTimeout)`; no token or response body in logs/errors; concurrency bounded (≤4 in flight) to stay under GitHub's secondary limit.
- **Known gotchas:** `withRetry` classifies by numeric `status` — Octokit errors carry it, keep it → [server gotchas → Tooling](../../server/insights/gotchas.md); `MockGitHubClient` is `MockForgeClient` and lists one PR → [server gotchas → Tests](../../server/insights/gotchas.md).
- **Done when:** `cd server && pnpm typecheck` green · `pnpm exec vitest run github-merged-prs` — asserts dedupe across two paths into one item with both `paths`, unmerged and `excludeNumber` PRs dropped, `merged_at` desc order, `limit` applied, 404 → empty, all-paths-failed → throws.

### S3 — Index reads for depth-2, self-file exclusion and symbol rank
- **Files:** `server/src/modules/repo-intel/repository.ts` (modify), `server/src/modules/repo-intel/types.ts` (modify)
- **Change:** `getResolvedCallers` (repository.ts:503) also selects `declFile: t.references.declFile`; `ResolvedCallerRow` (:126) gains `declFile: string`. New `getFileRanks(repoId, paths): Promise<{ path: string; rank: number }[]>` (same shape as `getFileRankFor`, selects `t.fileRank.rank`). In `types.ts`: replace the local `DegradedReason` union (:27) with `import type { DegradedReason } from '@devdigest/shared'` + `export type { DegradedReason }`; `BlastChangedSymbol` + `rank: number`; `BlastCallerRow` + `depth: number`, `via: string | null`; `BlastResult` + `source: 'index' | 'fallback'`, `indexStatus?: IndexStatus`.
- **Layer / why here:** DB queries live only in the repository; facade types stay server-local.
- **Skills to apply:** `onion-architecture`, `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`
- **Practices:** repository returns plain rows, no query builders; `inArray` guards with early `[]` on empty input (existing pattern); no schema change, no migration.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` green after S4 (S3 alone breaks the facade's `BlastResult` literals — S3+S4 are one group).

### S4 — Fix the blast facade: per-symbol cap, depth 2, self-file exclusion, real reasons, source flag
- **Files:** `server/src/modules/repo-intel/service.ts` (modify), `server/test/repo-intel-blast.test.ts` (create), `server/test/repo-intel-facade-degraded.test.ts` (modify only if its stub repo needs the new methods)
- **Change:** `getBlastRadius` (:220): flag off → fallback with `reason: 'flag_off'`; `tryPersistentBlast` (:315) returns `BlastResult | { unavailable: DegradedReason }`: no state → `no_data`, `failed` → `index_failed`, `degraded` → `state.degradedReason ?? 'no_data'`; the fallback carries that reason. Persistent path: drop depth-1 rows where `fromPath === declFile`; then for `d = 2..BFS_DEPTH` run `getResolvedCallers(prevCallerFiles, prevEnclosingNames)` (only enclosing names that came from symbol rows, not the file-basename fallback), map each row back to the root changed symbol(s) via the previous level's `(file, symbol)`, drop rows whose `fromPath === declFile`, whose `fromPath` is the root's declaring file, or already present for that root; `via` = the previous-level caller symbol. Per root symbol: sort `depth` asc then `rank` desc, slice `MAX_CALLERS_PER_SYMBOL` — remove the global slice (:386). `getFileFacts` over all caller files of all depths. `changedSymbols[].rank` from `getFileRanks(changedFiles)` (0 when missing). Return `source: 'index'`, `indexStatus: state.status`. Fallback path: `rank: 0`, `depth: 1`, `via: null`, apply the per-symbol cap, build `factsByFile[file] = { endpoints: extractEndpoints(content), crons: [] }` from the clone reads it already does, `source: 'fallback'`.
- **Layer / why here:** D2-A — the facade owns traversal and limits; `getBlastRadius` has no other caller (grep).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** limits come only from `constants.ts` (`MAX_CALLERS_PER_SYMBOL`, `BFS_DEPTH`); the persistent path never touches `codeIndex`, `readClone` or astgrep parsing; no new adapter import.
- **Known gotchas:** none in gotchas.md; see Risks → `resolveReferences` semantics.
- **Done when:** `cd server && pnpm typecheck` green · `pnpm exec vitest run repo-intel-blast repo-intel-facade-degraded` — new test (patched-repo pattern of `repo-intel-facade-degraded.test.ts:19-39`, `codeIndex` stubs that throw) asserts: 25 callers of A + 3 of B → 20 + 3; a depth-2 caller has `depth: 2` and `via`; a caller in the declaring file is excluded; `source === 'index'` and `codeIndex` untouched; flag off → `flag_off`; state `failed` → `index_failed`; no state → `no_data`; symbol `rank` from `getFileRanks`.

### S5 — Pure mapper `BlastResult → BlastRadius` and module constants
- **Files:** `server/src/modules/blast/helpers.ts` (create), `server/src/modules/blast/constants.ts` (create), `server/test/blast-helpers.test.ts` (create)
- **Change:** `toBlastRadius(result: BlastResult): BlastRadius` — group `callers` by `viaSymbol`; drop (defensively) any caller whose `file` equals a declaring file of that symbol; per group `endpoints_affected`/`crons_affected` = sorted union of `factsByFile[caller.file]` (missing → `[]`); `rank` = max `rank` of `changedSymbols` with that name; only symbols with ≥1 caller get a `downstream` entry (assumption); sort `downstream` by `rank` desc then `symbol` asc; callers map `symbol → name`; `limits = { callers_per_symbol: MAX_CALLERS_PER_SYMBOL, depth: BFS_DEPTH }` imported from `../repo-intel/constants.js`; `degraded = result.degraded ?? false`, `reason = result.reason ?? null`; `summary = buildBlastSummary(...)` → `"<S> changed symbols · <C> callers · <E> endpoints · <K> crons"` (+ `" · degraded: <reason>"`). `constants.ts`: `HISTORY_MAX_PATHS = 10`, `HISTORY_COMMITS_PER_PATH = 5`, `HISTORY_LIMIT = 20`, `HISTORY_TTL_MS = 10 * 60_000`, `HISTORY_CACHE_MAX = 200` (assumptions).
- **Layer / why here:** pure transform, module `helpers.ts` (smart-diff pattern).
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `zod`
- **Practices:** no I/O, no LLM import; return type is the shared `BlastRadius` type; the importing of `repo-intel/constants.ts` is a known cross-module edge already tolerated (`repos/service.ts`) — import constants only, nothing else from `repo-intel/`.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `pnpm exec vitest run blast-helpers` — asserts flat callers of 2 symbols → 2 groups; endpoints/crons attributed only to the group whose callers' files have them; crons separate from endpoints; declaring-file caller dropped; sort by rank; `limits` equal the constants; summary digits; `BlastRadius.parse(out)` succeeds; degraded/reason passed through.

### S6 — Blast repository
- **Files:** `server/src/modules/blast/repository.ts` (create)
- **Change:** `BlastRepository { getPull(workspaceId, prId): Promise<{ pull: PullRow; repo: RepoRow } | undefined>` (copy of `intent/repository.ts:51-63`), `getPrFilePaths(prId): Promise<string[]>` (select `t.prFiles.path`) `}`.
- **Layer / why here:** only the repository touches `db/schema`.
- **Skills to apply:** `onion-architecture`, `drizzle-orm-patterns`, `typescript-expert`
- **Practices:** workspace scoping in the `where`; select only needed columns for files.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck`.

### S7 — Blast service (map + history with cache + log line)
- **Files:** `server/src/modules/blast/service.ts` (create), `server/test/blast-service.test.ts` (create)
- **Change:** `BlastServiceDeps { repo: Pick<BlastRepository,'getPull'|'getPrFilePaths'>; repoIntel: Pick<RepoIntel,'getBlastRadius'>; forge: (ref: RepoRef) => Promise<Pick<ForgeClient,'listMergedPullsTouching'>>; now?: () => number }`, `interface BlastLogger { info(obj: object, msg: string): void; warn(obj: object, msg: string): void }`.
  - `getBlast(workspaceId, prId, log)`: pull missing → `undefined`; `paths = getPrFilePaths`; **one** `repoIntel.getBlastRadius(pull.repoId, paths)`; log: index → `info({prId, symbols, callers}, 'blast: read persistent repo index (status=<s>) — no AST/import-graph rebuild')`; fallback → `info({prId, reason}, 'blast: index unavailable (<reason>) — degraded ripgrep fallback')`; return `toBlastRadius(result)`.
  - `getHistory(workspaceId, prId, log)`: pull missing → `undefined`; cache key `${prId}:${pull.headSha}`, TTL `HISTORY_TTL_MS`, Map capped at `HISTORY_CACHE_MAX` (evict oldest); paths sorted, sliced to `HISTORY_MAX_PATHS`, empty → `{ status:'ok', history: [] }`; `forge(toRepoRef(repo))` then `listMergedPullsTouching(ref, paths, { excludeNumber: pull.number, commitsPerPath: HISTORY_COMMITS_PER_PATH, limit: HISTORY_LIMIT })`; `!supported` → `{ status:'unsupported', history: [] }` (cached); items → `PrHistoryItem { pr_number, title, author, merged_at, files_overlap: paths, notes: '' }` (`notes` deterministic empty — no LLM, copy is client-side i18n) (cached); any throw (incl. missing-token `ConfigError`) → `log.warn({ prId, err: err.message }, 'pr history unavailable')`, `{ status:'unavailable', history: [] }`, not cached.
- **Layer / why here:** application orchestration; adapters reached only through injected deps (D10-A narrow-deps precedent, `intent/service.ts:56`).
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:** no `src/adapters/**` import; no Drizzle import; `toRepoRef` from `platform/forge-resolve.js`; log no tokens, no PR body; nothing hard-coded that exists in `constants.ts`.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `pnpm exec vitest run blast-service` — fake deps assert: `getBlastRadius` called exactly once; the index log message contains `no AST/import-graph rebuild`; fallback logs the other line; history second call within TTL hits the cache (forge called once), new `headSha` misses; `supported:false` → `unsupported`; forge throw → `unavailable` and next call retries; current PR excluded via `excludeNumber`.

### S8 — Routes, DI and module registration
- **Files:** `server/src/modules/blast/routes.ts` (create), `server/src/modules/index.ts` (modify), `server/src/platform/container.ts` (modify), `server/test/blast.it.test.ts` (create)
- **Change:** routes: `GET /pulls/:id/blast` `{ params: IdParams, response: { 200: BlastRadius } }` and `GET /pulls/:id/history` `{ params: IdParams, response: { 200: PrHistory } }`; handler = `getContext` → service → `undefined` ⇒ `throw new NotFoundError('Pull request not found')`; pass `req.log`. Container: `private _blast?: BlastService` + getter `blast` building `new BlastService({ repo: new BlastRepository(this.db), repoIntel: this.repoIntel, forge: (ref) => this.forge(ref) })` (smart-diff getter pattern, container.ts:174). Register `blast` in `modules/index.ts`. IT: seed a repo + PR + `pr_files` (smart-diff.it pattern), build an index with `RepoIntelRepository` (`insertSymbols`, `insertReferences`, `replaceEdges`, `resolveReferences({reset:true})`, `replaceFileRank`, `replaceFileFacts`, `upsertIndexState({status:'full', indexerVersion: INDEXER_VERSION, …})`) for a shared helper `src/lib/money.ts#formatMoney` called from 2 route files (one exposing `GET /invoices` in file facts, one with a cron) and one depth-2 caller; app built with `isolatedTestConfig()` and `overrides.forge = new MockForgeClient({ mergedPulls: [...] })`.
- **Layer / why here:** transport + composition root.
- **Skills to apply:** `onion-architecture`, `fastify-best-practices`, `zod`, `typescript-expert`, `security`
- **Practices:** schema-first route, no `parse` in the handler; response validated by the contract; no logic in the handler; routes import only own service, `_shared`, contracts, `platform/errors`.
- **Known gotchas:** hermetic `.it` via `isolatedTestConfig()` → [server gotchas → Tests](../../server/insights/gotchas.md); routes are LAN-reachable — `/history` triggers outbound GitHub calls, bounded by caps + cache → [server gotchas → Security](../../server/insights/gotchas.md).
- **Done when:** `cd server && pnpm typecheck` · `pnpm exec vitest run blast.it` (Postgres up) asserts: 200 with ≥2 callers and ≥1 endpoint under `formatMoney`, cron in `crons_affected` not `endpoints_affected`, depth-2 caller with `via`, declaring file absent, `degraded:false`, `limits` = constants; unknown uuid → 404; repo without index → `degraded:true`, `reason:'no_data'`; `/history` returns the mock PR with `status:'ok'` and excludes the PR's own number.

### S9 — Client hooks
- **Files:** `client/src/lib/hooks/blast.ts` (create), `client/src/lib/hooks/index.ts` (modify)
- **Change:** `useBlastRadius(prId, headSha)` → `useQuery({ queryKey: ["pr-blast", prId, headSha], queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`), enabled: !!prId })`; `usePrHistory(prId, headSha)` → key `["pr-history", prId, headSha]`, `/pulls/${prId}/history`, `staleTime: 10 * 60_000`. Add `export * from "./blast"` to the barrel.
- **Layer / why here:** one hook per endpoint (client AGENTS).
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`
- **Practices:** `"use client"`; types `import type` from `@devdigest/shared`; no fetch outside `api`.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm typecheck`.

### S10 — i18n keys
- **Files:** `client/messages/en/blast.json` (modify)
- **Change:** keep existing keys; add `title` ("Blast radius"), `loading`, `loadError`, `empty` ("No callers found for the changed symbols."), `topN` ("top {count}"), `depth2` ("via {name}"), `endpoints`, `crons`, `expand`, `collapse`, `degraded.badge`, `degraded.reason.{flag_off,index_failed,index_partial,repo_too_large,no_data}`, `degraded.resync`, `degraded.resyncing`, `degraded.resyncError`, `history.title` ("Prior PRs touching these files"), `history.empty`, `history.unsupported`, `history.unavailable`, `history.overlap` ("{count} overlapping file(s)"), `history.loadError`, `graph.legend`. `brief.json` is not used.
- **Layer / why here:** copy lives in the feature namespace.
- **Skills to apply:** none (JSON only)
- **Practices:** valid JSON; ICU placeholders match usage.
- **Known gotchas:** reused copy across two states trips `getByText` → [client gotchas → Tests](../../client/insights/gotchas.md) — keep empty/degraded/unavailable strings distinct.
- **Done when:** `jq . client/messages/en/blast.json` succeeds.

### S11 — BlastRadiusCard (summary, tree, empty, degraded + resync) and PriorPrsCard
- **Files:** `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/` (create): `BlastRadiusCard.tsx`, `BlastSummary.tsx`, `BlastTree.tsx`, `BlastDegradedNotice.tsx`, `useBlastResync.ts`, `helpers.ts`, `styles.ts`, `index.ts`, `BlastRadiusCard.test.tsx`; `.../_components/PriorPrsCard/` (create): `PriorPrsCard.tsx`, `styles.ts`, `index.ts`, `PriorPrsCard.test.tsx`
- **Change:** `BlastRadiusCard({ prId, headSha, repo: Repo | null })` uses `useBlastRadius`; states: loading, error, `downstream.length === 0` → `t("noDownstream", { count })` + `t("empty")`. `BlastSummary`: counts from `helpers.blastStats(data)` (symbols = `changed_symbols.length`, unique callers, unique endpoints, unique crons) with `stat.*` labels. `BlastTree`: one collapsible node per `downstream` entry (already rank-sorted; button with `aria-expanded`, first open), callers as `<a href={forgeBlobUrl(repo, headSha, file, line)}>file:line</a>` + name (+ `t("depth2",{name: via})` when `depth === 2`), `t("topN",{count: limits.callers_per_symbol})` when `callers.length >= limits.callers_per_symbol`; endpoints list then crons list, separately labelled. `BlastDegradedNotice`: badge + `t("degraded.reason."+reason)` + resync button; `useBlastResync(repoId, prId)` composes `useResyncRepoIntel` + `useRepoIntelStatus(repoId, polling)`; when `updatedAt` advances past the value captured at click, stop polling and `invalidateQueries({ queryKey: ["pr-blast", prId] })`. `PriorPrsCard({ prId, headSha, repo })` uses `usePrHistory`; `status` `unsupported`/`unavailable` → own messages; items: `#n` linked via `forgePrUrl`, title, author, `merged_at` date, `t("history.overlap",{count})`.
- **Layer / why here:** colocated feature components (`_components/PascalCase/`); stateful sync in a colocated hook.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`, `security`
- **Practices:** components ≤200 lines, pure render, derived counts computed (no `useState` for them); the only `useEffect` is the index-state watch in `useBlastResync`; no hard-coded `20`/`2`; links `target="_blank" rel="noreferrer"`; PR/repo strings rendered as text only (no `dangerouslySetInnerHTML`); tests render inside `NextIntlClientProvider` with `blast.json`, mock `@/lib/hooks/blast` and `@/lib/hooks/repo-intel` submodules.
- **Known gotchas:** `fireEvent` not user-event; `vi.mock` of a barrel needs `importActual`; `styles.ts` entries each `satisfies CSSProperties`, no spread base; four-side border longhands → [client gotchas](../../client/insights/gotchas.md).
- **Done when:** `cd client && pnpm typecheck` · `pnpm exec vitest run BlastRadiusCard PriorPrsCard` — asserts: summary numbers; collapse toggles caller list; a caller link `href` equals `forgeBlobUrl(...)` with `#L<line>`; crons render under the crons label, not endpoints; empty state; degraded badge with reason text and resync click calls the mutation; history ok/unsupported/unavailable states.

### S12 — Wire the cards into the Overview tab
- **Files:** `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` (modify), `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` (modify)
- **Change:** `OverviewTabProps` + `repo: Repo | null`; render `<section>` with `SectionLabel` `t("title")` (blast namespace) + `<BlastRadiusCard>`, then a section with `<PriorPrsCard>`, after the Intent card. `page.tsx:160` passes `repo={repo}`.
- **Layer / why here:** page stays thin; tab composes cards.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`
- **Practices:** no data fetching in `OverviewTab` itself; import `Repo` type via `@/lib/types` or `@devdigest/shared`.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm typecheck` · `pnpm test` green.

### S13 — Graph view and Tree/Graph toggle
- **Files:** `.../_components/BlastRadiusCard/BlastGraph.tsx` (create), `.../BlastRadiusCard/graph-layout.ts` (create), `.../BlastRadiusCard/graph-layout.test.ts` (create), `.../BlastRadiusCard/BlastRadiusCard.tsx` (modify), `.../BlastRadiusCard/styles.ts` (modify), `.../BlastRadiusCard/BlastRadiusCard.test.tsx` (modify)
- **Change:** `graphLayout(data: BlastRadius)` → `{ nodes: {id, kind:'symbol'|'caller'|'endpoint'|'cron', label, x, y, depth?}[], edges: {from,to}[], width, height }` — columns: changed symbols | depth-1 callers | depth-2 callers | endpoints, crons (crons below endpoints, separate kind); edge depth-2 → its `via` caller, depth-1 → symbol, endpoint/cron → the callers whose files carry them (from the group). `BlastGraph` renders an `<svg role="img" aria-label={t("graph.ariaLabel")}>` with `<line>`/`<text>`; empty → `t("graph.empty")`. Toggle: two buttons `t("view.tree")`/`t("view.graph")` with `aria-pressed`, local `useState<'tree'|'graph'>('tree')`.
- **Layer / why here:** D6-A hand-rolled SVG; layout is a pure helper.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** layout pure and tested; no new dependency; deterministic coordinates; colors via CSS variables.
- **Known gotchas:** `satisfies CSSProperties`, border longhands → [client gotchas → UI](../../client/insights/gotchas.md).
- **Done when:** `cd client && pnpm typecheck` · `pnpm exec vitest run graph-layout BlastRadiusCard` — layout: node per symbol/caller/endpoint/cron, cron nodes kind `cron`, depth-2 edge targets its `via`; card: clicking Graph shows the SVG, Tree restores the list.

### S14 — MCP port, HTTP client and fake
- **Files:** `mcp-server/src/core/ports.ts` (modify), `mcp-server/src/http/client.ts` (modify), `mcp-server/test/fakes.ts` (modify)
- **Change:** `DevDigestApi.getBlast(pullId: string): Promise<BlastRadius>`; http: `getBlast: (pullId) => request('GET', `/pulls/${id(pullId)}/blast`)`; fake: `data.blast` (default: a small `BlastRadius`) + `calls.push(\`getBlast(${pullId})\`)`.
- **Layer / why here:** port in `core/`, I/O only in `http/`.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** `import type` for `BlastRadius`; core stays pure.
- **Known gotchas:** `import type` for shared contracts → [mcp gotchas → Contracts](../../mcp-server/insights/gotchas.md).
- **Done when:** `cd mcp-server && pnpm typecheck`.

### S15 — `get_blast_radius` tool over the route
- **Files:** `mcp-server/src/core/blast.ts` (create), `mcp-server/src/tools/get-blast-radius.ts` (modify), `mcp-server/src/tools/messages.ts` (modify), `mcp-server/src/server.ts` (modify), `mcp-server/test/blast.test.ts` (create), `mcp-server/test/tools-read.test.ts` (modify), `mcp-server/test/server.test.ts` (modify), `mcp-server/README.md` (modify, tool row)
- **Change:** `core/blast.ts`: `conciseBlast(b: BlastRadius, cap: (s: string) => string): BlastRadius` — same keys as the contract, every string (`summary`, symbol names/files/kinds, caller name/file/via, endpoints, crons) passed through `cap`. `messages.ts`: export `cut`; replace `BLAST_TEXT` with `blastDegradedHint(reason)` ("Index not built (<reason>): impact is UNKNOWN beyond what is listed — resync the repo in DevDigest, then retry."). Tool: `registerGetBlastRadius(server, deps)`, description ≤200 chars ("Map what a PR's changes affect: changed symbols, their callers (file:line), HTTP endpoints and crons, from the repo index. Call before judging a PR's risk or review scope."), same input schema, `READ_ONLY`; handler `guard` → `resolveRepo` → `resolvePull` (failure → `resolutionText`) → `deps.api.getBlast(pullId)` → `ok(degraded ? { ...concise, hint } : concise)`. `server.ts:28` passes `deps`; tests updated for the new signature; `/pulls/p1/blast` added to the GET-only pin routes (`server.test.ts:44-52`).
- **Layer / why here:** tool = thin adapter over the core helper.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `zod`, `security`
- **Practices:** `zod/v3` in tools; `import type` for contracts; output via `ok()` compact JSON; every PR/repo-written string through `cut()`; `readOnlyHint: true`; footprint test (≤6,000 chars) stays green.
- **Known gotchas:** `zod/v3`; `cut()` every model/PR-written string; keep calls under the 60 s client timeout (single GET, 10 s HTTP timeout) → [mcp gotchas](../../mcp-server/insights/gotchas.md).
- **Done when:** `cd mcp-server && pnpm typecheck && pnpm test` — `blast.test.ts` asserts a 500-char file name is cut to 200+`…` and keys equal the contract's; `tools-read.test.ts` asserts unknown PR → `isError` listing recent PRs, success → `getBlast(p…)` called once and JSON parses to the map, degraded → `hint` present; GET-only pin includes the tool.

### S16 — Demo runbook
- **Files:** `docs/demo/blast-radius.md` (create)
- **Change:** steps: import a GitHub repo you own in the studio; `POST /repos/:id/resync` (or the button) and wait for `/repos/:id/index-state` = `full`; push a branch that edits one exported helper used by ≥2 files, at least one of which defines an HTTP route; open the PR, open it in DevDigest; expected Overview: ≥2 callers, ≥1 endpoint, Graph toggle; server log shows the `blast: read persistent repo index … no AST/import-graph rebuild` line; MCP check `get_blast_radius {repo, pr}`; troubleshooting for `degraded` (reasons) and `history.unsupported` on GitLab.
- **Layer / why here:** D7-A — real data, no seed change.
- **Skills to apply:** none (Markdown only)
- **Practices:** commands that exist (`./scripts/dev.sh`, routes above); no secrets in examples.
- **Known gotchas:** none.
- **Done when:** file exists and every route it names is registered (`rg -n "'/pulls/:id/blast'|'/pulls/:id/history'|'/repos/:id/resync'" server/src/modules`).

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `server/test/github-merged-prs.test.ts` | unit | prior-PR algorithm | S2 |
| `server/test/repo-intel-blast.test.ts` | unit | per-symbol cap, depth 2, self-file, reasons, no reparse | S4 |
| `server/test/blast-helpers.test.ts` | unit | flat → grouped mapping, crons apart, limits, summary | S5 |
| `server/test/blast-service.test.ts` | unit | one facade call, log line, history cache/status | S7 |
| `server/test/blast.it.test.ts` | integration | routes end to end over a seeded index, 404, degraded | S8 |
| `.../BlastRadiusCard/BlastRadiusCard.test.tsx` | unit (jsdom) | summary, tree, links, empty, degraded+resync, toggle | S11, S13 |
| `.../PriorPrsCard/PriorPrsCard.test.tsx` | unit (jsdom) | history states | S11 |
| `.../BlastRadiusCard/graph-layout.test.ts` | unit | graph nodes/edges | S13 |
| `mcp-server/test/blast.test.ts`, `tools-read.test.ts`, `server.test.ts` | unit | tool output, errors, GET-only | S15 |

## Migrations & contracts
No migration (no schema change). Contracts: `brief.ts` (`DegradedReason`, `ChangedSymbol.rank`, `BlastCaller.depth/via`, `DownstreamImpact.rank`, `BlastRadius.degraded/reason/limits`, `PrHistory.status`) and `adapters.ts` (`MergedPrTouching`, `MergedPrLookup`, `ForgeClient.listMergedPullsTouching`) — S1, mirrored into `client/src/vendor/shared`.

## Out of scope
- GitLab prior-PR lookup (D4-B), GraphQL optimisation, persisting history in the DB.
- Any LLM call, any seed/fixture change to `server/src/db/seed.ts` (D7-A), e2e flows.
- Other `getBlastRadius`-adjacent facade methods (`getCriticalPaths` etc.), re-indexing logic, `client/src/vendor/**` beyond the S1 mirror.
- The PR description and demo video (user).

<!-- implementer-brief:end -->

## Context applied
- `INSIGHTS.md` → "the two vendored `shared` copies are not actually in sync" — S1 mirrors by hand, scoped diff.
- `INSIGHTS.md` → "TS2719 … after adding a contract field" — S1 gotcha.
- `INSIGHTS.md` → "the onion skill's `depcruise` gate … not real" — no `depcruise` in Done-when.
- `server/insights/gotchas.md` → hermetic `.it`, `MockForgeClient` one PR, LAN-reachable routes, `withRetry` needs numeric status — S2, S8.
- `client/insights/gotchas.md` → fireEvent, `importActual`, `satisfies CSSProperties`, border longhands, distinct copy — S10, S11, S13.
- `mcp-server/insights/gotchas.md` → `zod/v3`, `import type`, `cut()`, 60 s — S14, S15.
- Research `scratchpad/18-blast-research.md` and `18-blast-external-research.md` — facade facts and the REST algorithm (S2, S4).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S1–S8, S14, S15 | |
| engineering-insights | preload | Context applied | |
| zod | on demand (S1) | S1, S5, S8, S15 | |
| typescript-expert | on demand (S1) | all code steps | |
| security | on demand (S2) | S2, S7, S8, S11, S15 | |
| drizzle-orm-patterns | on demand (S3) | S3, S6 | |
| postgresql-table-design | on demand (S3) | S3 | no table change; read-only queries |
| fastify-best-practices | on demand (S8) | S8 | |
| frontend-architecture | on demand (S9) | S9, S11–S13 | |
| react-best-practices | on demand (S9) | S9, S11–S13 | |
| next-best-practices | on demand (S9) | S9, S11–S13 | |
| react-testing-library | on demand (S11) | S11, S13 | |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `contracts/brief.ts`, `adapters.ts` (both copies) | ports | changed |
| server | `adapters/github/{octokit,merged-prs}.ts`, `adapters/gitlab/rest.ts`, `adapters/mocks.ts` | infrastructure | changed / new |
| server | `modules/repo-intel/{repository,types,service}.ts` | infra / application | changed |
| server | `modules/blast/{helpers,constants,repository,service,routes}.ts` | all | new |
| server | `modules/index.ts`, `platform/container.ts` | composition | changed |
| client | `lib/hooks/{blast,index}.ts`, `messages/en/blast.json` | data / i18n | new / changed |
| client | `_components/{BlastRadiusCard,PriorPrsCard}/`, `OverviewTab`, `page.tsx` | UI | new / changed |
| mcp-server | `core/{ports,blast}.ts`, `http/client.ts`, `tools/{get-blast-radius,messages}.ts`, `server.ts`, tests, README | all | changed / new |
| docs | `docs/demo/blast-radius.md` | docs | new |

## Design notes
- **Data flow:** page → `OverviewTab` → `BlastRadiusCard` → `useBlastRadius` → `GET /pulls/:id/blast` → `BlastService.getBlast` → `repoIntel.getBlastRadius` (index reads: symbols, resolved references ×2 levels, file_rank, file_facts) → `toBlastRadius`. History: `PriorPrsCard` → `usePrHistory` → `/history` → `BlastService.getHistory` → `ForgeClient.listMergedPullsTouching` (cached).
- **Grouping key** is the symbol *name* (`viaSymbol`); two changed files declaring the same name merge into one group whose `rank` is the max (assumption).
- **`notes`** is always `''`: no LLM; "N overlapping files" is rendered client-side from `files_overlap`.
- **`limits.depth`** always reports `BFS_DEPTH`; on the fallback path traversal is depth 1, which the degraded badge already signals.
- **Pass-1 options** (D1–D8, recorded above): D1 A in-place vs B wrapper; D2 A facade fix vs B map-only; D3 A max caller rank vs B declaring-file rank; D4 A GitHub+GitLab vs B GitHub-only vs C git log; D5 A separate route vs B field; D6 A SVG vs B reactflow; D7 A real repo vs B seed vs C both; D8 A same JSON vs B text.

## Risks & open questions
- `resolveReferences` (repository.ts:400) — the S8 IT fixture assumes it fills `references.decl_file` from `edges` + `symbols`; if it needs more, the test may set `decl_file` with a direct `db.update(t.references)` (test-only).
- GitHub `listPullRequestsAssociatedWithCommit` semantics for squash/rebase merges and forks are unverified empirically (external research: medium confidence); renames are not followed.
- Up to ~60 GitHub calls per uncached `/history` request; LAN-reachable route; mitigated by caps, concurrency 4 and the TTL cache.
- `via`, `DownstreamImpact` only for symbols with callers, and the cache caps are assumptions, not recorded decisions.
- Docs vs code: `repo-intel/service.ts` header (:1-18) still says blast is "always degraded" (T1) — the code has a persistent path; `repo-intel/README.md:41` names L04. Not edited by this plan.

## Handed off
- architecture-reviewer: the `blast/helpers.ts → repo-intel/constants.ts` edge (S5); facade traversal in `repo-intel/service.ts` (S4); narrow deps in `BlastService` (S7).
- security review: new outbound GitHub calls in `adapters/github/merged-prs.ts` + `octokit.ts` (S2) triggered by a LAN-reachable GET (S8); PR/repo-written strings in MCP output (`cut()`, S15) and in the client (S11, rendered as text).

## Insights to record
- None yet — candidates after implementation: whether `listPullRequestsAssociatedWithCommit` misses squash-merged PRs (server).

## Red-flags check
- [x] Every AC maps to at least one step or test (AC1 S7/S8 · AC2 S4/S5 · AC3 S1/S5/S11/S15 · AC4 S7 · AC5 S11–S13 · AC6 S2/S7/S11 · AC7 S15 · AC8 S16)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; product choices are in *Decisions recorded*
- [x] Groups end type-checking; parallel groups share no file (G6 ∥ G4/G5)
- [x] No group under 3 files / ~80 lines that could merge with a neighbour (G5 is 6 files)
- [ ] The brief above the marker is under ~20,000 characters — **fails: ~33,000** (16 steps over 4 packages). Each implementer run reads one group (≈5–9k of steps); trimming further would drop step detail the implementer needs. The main session decides whether to accept it or split the plan (e.g. MCP + runbook G6 into its own plan).
- [x] Pass 1: n/a (pass 2)
- [x] Every step's *Skills to apply* is complete

## Handoffs → G2
From G1 (implementer, 2026-10-02):
- `brief.ts` (both copies): `DegradedReason` enum; `ChangedSymbol.rank`; `BlastCaller.depth` (int ≥1) + `via: string | null`; `DownstreamImpact.rank`; `BlastRadius.degraded`, `reason: DegradedReason | null`, `limits {callers_per_symbol, depth}`; `PrHistory.status: ok|unsupported|unavailable`.
- `adapters.ts`: `MergedPrTouching {number,title,author,merged_at,paths}`, `MergedPrLookup {supported, items}`, `ForgeClient.listMergedPullsTouching(repo, paths, {excludeNumber, commitsPerPath, limit})`.
- `MockForgeOptions.mergedPulls?` (mock drops `excludeNumber`, applies `limit`); `adapters/github/merged-prs.ts` exports `collectMergedPrs` (concurrency 4, `withRetry(withTimeout)`, no logging).
- Any code building a `BlastRadius`/`PrHistory` literal needs the new keys.
- Deviation: `server/test/contracts.test.ts` fixture got the new required fields (file not in any step's Files; test-only).

Skills (G1): onion-architecture S1,S2 · zod S1 · typescript-expert S1,S2 · security S2.
Verification (main session): server unit suite 42 files / 501 passed; server + client typecheck green; client 355 passed.

## Handoffs → G3
From G2 (implementer, 2026-10-02):
- `BlastResult` (`repo-intel/types.ts`): required `source: 'index' | 'fallback'`, optional `indexStatus?: IndexStatus`; `DegradedReason` re-exported from `@devdigest/shared`.
- `BlastChangedSymbol.rank` = declaring file's `file_rank.rank` (0 on fallback). `BlastCallerRow.depth` + `via: string | null`; `viaSymbol` = root changed symbol name.
- `callers` grouped by changed symbol, sorted depth asc then rank desc, capped per `viaSymbol` at `MAX_CALLERS_PER_SYMBOL`.
- `factsByFile` also set on fallback (`crons: []`), covers every caller file of every depth, before the cap.
- New `RepoIntelRepository.getFileRanks(repoId, paths)`; `ResolvedCallerRow.declFile: string | null` (null rows skipped).
- `getBlastRadius` never throws; flag off → `flag_off`, empty files → `no_data`, no state/`failed`/`degraded` → degraded with real reason; `partial` stays on the persistent path.
- Fixtures: any fake `BlastResult`/`RepoIntel` in G3 tests needs `source` and the new row fields.
- Review note: depth-2 traversal in `tryPersistentBlast`; `service.ts` header comment (1–18) still says "always degraded" (out of plan).

Skills (G2): onion-architecture S3,S4 · drizzle-orm-patterns S3 · postgresql-table-design S3 (no schema change) · typescript-expert S3,S4.
Verification: server typecheck ✅; unit suite 43 files / 508 passed.

## Handoffs → G4, G6
From G3 (implementer, 2026-10-02):
- Routes: `GET /pulls/:id/blast` → `BlastRadius`; `GET /pulls/:id/history` → `PrHistory`; both 404 for an unknown PR.
- `container.blast` = `BlastService` with `getBlast(workspaceId, prId, log)` / `getHistory(workspaceId, prId, log)`; history cache is per service instance (container singleton).
- `modules/blast/constants.ts`: `HISTORY_*` (10 paths / 5 commits per path / 20 items / 10-min TTL / 200 entries). `toBlastRadius`, `buildBlastSummary` exported from `modules/blast/helpers.ts`.
- Summary string: `"<S> changed symbols · <C> callers · <E> endpoints · <K> crons"` (+ `" · degraded: <reason>"`); counts are unique callers/endpoints/crons across downstream groups. `notes` always `''`.
- Review notes: `blast/helpers.ts` imports `repo-intel/constants.js` (planned edge); `/history` failures are not cached, so a failing forge is retried every request (bounded by forge timeouts).

Skills (G3): onion-architecture S5–S8 · engineering-insights step 0 read only · fastify-best-practices S8 · zod S5,S8 · drizzle-orm-patterns S6 · typescript-expert S5–S8 · security S7,S8.
Verification: server typecheck ✅; unit 45 files / 521 passed; `blast.it` 4 passed; related repo-intel + smart-diff.it 35 passed.

## Handoffs → G6 report (parallel with G4)
From G6 (implementer, 2026-10-02):
- S14: `DevDigestApi.getBlast` in `core/ports.ts`, `http/client.ts`, `test/fakes.ts` (`makeBlast`, `data.blast`).
- S15: new `core/blast.ts` (`conciseBlast`, every repo/PR-written string via `cut()`; `reason` is an enum, uncapped); `tools/get-blast-radius.ts` (single GET `/pulls/:id/blast`, `readOnlyHint`); `messages.ts`, `server.ts`, `README.md`; tests `blast.test.ts` (+new), `tools-read.test.ts`, `server.test.ts` (extra `seen.length >= 5` in the GET-only pin).
- S16: `docs/demo/blast-radius.md` runbook (not exercised live).
- Deviation: `blast.test.ts` checks keys against a hard-coded list — mcp-server tests cannot runtime-import `@devdigest/shared` (type-only).
- Not verified: live MCP run against an indexed repo; `.claude/settings.json` allowlist not re-reviewed.

Skills (G6): onion-architecture S14,S15 · engineering-insights step 0 only · typescript-expert S14,S15 (skimmed) · zod S15 (file not opened; `zod/v3` per gotcha) · security S15 (first 60 lines read).
Verification: mcp-server typecheck ✅; tests 10 files / 53 passed.

## Handoffs → G5
From G4 (implementer, 2026-10-02):
- Hooks `client/src/lib/hooks/blast.ts` (barrel-exported): `useBlastRadius(prId, headSha)` key `["pr-blast", prId, headSha]`; `usePrHistory(prId, headSha)` key `["pr-history", prId, headSha]`, `staleTime` 10 min.
- `BlastRadiusCard({ prId, headSha, repo: Repo | null })` in `.../_components/BlastRadiusCard/` composes `BlastDegradedNotice`, `BlastSummary`, `BlastTree` (~55 lines; room for the toggle). First tree node open by default; `BlastTree` stores per-symbol overrides only. `PriorPrsCard/` beside it.
- G5 modifies `BlastRadiusCard.tsx`, `styles.ts` (entries `satisfies CSSProperties`: `card`, `muted`, `node`, `link`, `subLabel`, `listItem`, …), `BlastRadiusCard.test.tsx`.
- i18n `view.tree`, `view.graph`, `graph.empty`, `graph.ariaLabel`, `graph.legend` exist; add no keys unless needed. `loading` key exists but is unused (Skeleton renders instead).
- Card tests mock `@/lib/hooks/blast` and `@/lib/hooks/repo-intel` at submodule level and wrap in `QueryClientProvider`.
- Review notes: links `target="_blank" rel="noreferrer"`, all repo/PR strings render as text; `useBlastResync` holds the only `useEffect` (watches `updatedAt`, invalidates `["pr-blast", prId]`); `OverviewTab` takes a `repo` prop passed by `page.tsx`.

Skills (G4): onion-architecture — (client-only) · engineering-insights step 0 · frontend-architecture S9,S11,S12 · react-best-practices S9,S11,S12 · next-best-practices S9,S11,S12 · react-testing-library S11 · typescript-expert S9,S11,S12 · security S11.
Verification: client typecheck ✅; 44 files / 361 passed; `blast.json` valid JSON.

## Handoffs → review (after G5)
From G5 (implementer, 2026-10-02):
- S13 files (in `BlastRadiusCard/`): `graph-layout.ts` (+new, pure), `graph-layout.test.ts` (+new), `BlastGraph.tsx` (+new, renders only), `BlastRadiusCard.tsx`, `styles.ts`, `BlastRadiusCard.test.tsx`.
- Deviations: endpoints/crons link to the group's depth-1 callers (or the symbol when none), since the contract carries them per group, not per caller file; node ids scoped by symbol, so a shared caller appears once per symbol.
- Security: strings render as SVG `<text>` children; no `dangerouslySetInnerHTML`; graph has no links.

Skills (G5): onion-architecture — (client-only) · frontend-architecture, react-best-practices, next-best-practices, react-testing-library, typescript-expert S13 (SKILL.md head only) · security not opened (not named by S13).
Verification: client typecheck ✅; 45 files / 364 passed.

## Verification log
- 2026-10-02 full pass (plan-verifier): incomplete — 105/107 met; SK14 partial; R4 not-verifiable (no Test Report). Security review: PASS, no SF. Architecture review: PASS, F1 (HIGH, non-blocking).
- 2026-10-02 fix mode (implementer) F1, SK14: `BlastResult.limits {callersPerSymbol, depth}` (required) set from `BLAST_LIMITS` in `repo-intel/service.ts` on all paths; `toBlastRadius` copies it; runtime import of `repo-intel/constants.js` removed from `blast/helpers.ts`; fixtures in `blast-helpers.test.ts`, `blast-service.test.ts`. SK14: `zod` skill read, S15 re-checked, no change needed. Skills: onion-architecture F1 · zod SK14. Verification: server + mcp-server typecheck ✅; `vitest run blast repo-intel` 8 files / 48 passed (incl. `.it`); mcp-server 53 passed.
- 2026-10-02 delta (plan-verifier): complete — needs sign-off; 106/107 met, F1 + SK14 closed; R4 not-verifiable (no test-writer run). Note: S5 *Change* text still says limits are imported from `repo-intel/constants.js` — superseded by F1 (copied from `BlastResult.limits`).
- main-session fix: V1 — `BLAST_LIMITS` moved above the `PHANTOM_GLOBALS_ALLOWLIST` doc comment in `repo-intel/service.ts` (comment had landed on the wrong symbol); S4 Done-when re-run: server typecheck ✅, blast tests green.

## Test Report (test-writer, 2026-10-02)
Added: depth-2 bound (`repo-intel-blast.test.ts`); non-UUID 422, other-workspace 404, forge-throws → 200 `unavailable` without error/token in body (`blast.it.test.ts`); MCP `cut()` on every free-text field, degraded/reason/limits + null `via` pass-through (`mcp-server/test/blast.test.ts`), unknown repo + oversized summary (`tools-read.test.ts`); card hides notice when not degraded, shows the passed reason's copy (`BlastRadiusCard.test.tsx`).

### Proof
| Subject · mutation (temporary, reverted) | Caught by |
|---|---|
| `blast/helpers.ts` declaring-file filter always true | "drops a caller living in the declaring file" |
| `blast/helpers.ts` rank sort flipped | "groups flat callers … sorted by rank desc" |
| `blast/helpers.ts` crons read from endpoints | "attributes endpoints and crons only to the group…" |
| `blast/helpers.ts` limits swapped | "reports limits from the constants…" |
| `blast/helpers.ts` degraded hard-coded false | "passes degraded and reason through" + .it "degrades with no_data…" |
| `repo-intel/service.ts` root declaring-file skip removed | "traverses to depth 2 with `via`, excludes the declaring file…" |
| `repo-intel/service.ts` per-symbol cap → global | "caps callers per changed symbol, not globally" |
| `repo-intel/service.ts` BFS depth 1 / bound 3 | "traverses to depth 2…" / new "does not report callers beyond depth 2" (survived before the test) |
| `blast/repository.ts` workspace filter removed | new "404s for a pull request that belongs to another workspace" |
| `blast/service.ts` catch rethrows | unit "reports unavailable on a forge failure…" + new .it forge test |
| `blast/routes.ts` history 404 guard removed | .it "404s for an unknown pull request" |
| `mcp-server/src/core/blast.ts` via/crons caps removed | "caps every free-text field…" |
| `mcp-server/src/tools/get-blast-radius.ts` unknown-PR guard removed | "is an error listing recent PRs for an unknown PR…" |
| `BlastRadiusCard.tsx` `data.degraded &&` → `true &&` | new "hides the degraded notice…" |
| `BlastDegradedNotice.tsx` reason copy fixed | new "shows the copy for the reason passed through" |

Reverts: `shasum -c` OK for 8 subject files. Exception: `blast/repository.ts` (untracked) had no recorded baseline; main session re-read it — workspace-scoped `getPull` + `getPrFilePaths` intact, the other-workspace test passes.
Coverage gaps left: history cache eviction, `HISTORY_MAX_PATHS` truncation, `.it` depth-2 with a symbol declared in two files.
Main-session full run after test-writer: server unit 45 files / 522 passed; `.it` 23 files / 157 passed; client 45 files / 366 passed.
- 2026-10-02 delta (plan-verifier): complete — 107/107 met; R4 and V1 met. Status set to done by the main session.
