# Development Plan: Review diffs against the PR base commit SHA
Status: done
Save as: docs/plans/07-review-diff-base-sha.md
Spec: none

## Goal & acceptance criteria
The review diff must equal the PR's real diff. Today `loadDiff` (`server/src/modules/reviews/diff-loader.ts:20`) diffs `pull.base`, a branch **name** (`octokit.ts:57,99`, `gitlab/mappers.ts:158`), in a stale shallow clone; PR #8 reviewed 343 files instead of 74.
- AC1: `pull_requests.base_sha` is written from GitHub `base.sha` on list sync, poll, the stats backfill and the detail refresh; GitLab fills it from `diff_refs.base_sha` where the single MR is fetched (D7).
- AC2: With `base_sha` set, a review diffs `base_sha...head_sha` via the new `GitClient.diffCommits` (fetches missing SHAs, deepens up to a cap until a merge-base exists); the branch name is never used then.
- AC3: `diffCommits` failing, timing out or returning 0 files → the `pr_files` reconstruction; `base_sha = NULL` → `pr_files`; no `pr_files` patches either → legacy `pull.base...head` diff with a warning line in the run log (D4).
- AC4: When `pr_files` is fresh (`files_head_sha = head_sha`, D8) and complete (row count = `files_count`), a git diff containing a path outside `pr_files` is replaced by `pr_files`, and the run log says so (D5).
- AC5: The run log's diff line names the source: `Diff ready — N changed file(s) (source: <git base...head | PR file list | legacy branch diff>); …`.
- AC6: Intent file summaries (`intent/service.ts:195`) use `diffCommits` when `base_sha` is set (D6).
- AC7: `diffCommits` rejects any SHA that is not 40 or 64 lowercase hex before running git.

## Decisions needed
New in pass 2 (D1–D6 resolved, see *Decisions recorded*):

| # | Decision | Options | Recommendation | Steps affected |
|---|---|---|---|---|
| D7 | GitLab's MR list has no `diff_refs` (Research Q2), so a GitLab list sync can't fill `base_sha` | A: list sync keeps the stored `base_sha` while `head_sha` is unchanged and NULLs it when the head moved; detail refresh + stats backfill (single-MR fetch) fill it · B: GitLab `listPullRequests` GETs every MR (N calls per sync, `gitlab/rest.ts:187-193`) · C: fetch the MR at review start (network on the review path) | A — GitLab `pr_files` come from paginated `/diffs` (`gitlab/rest.ts:196-206`), so NULL → `pr_files` is already correct; NULL on head change avoids a stale merge-base after a rebase | S3, S4 |
| D8 | Only the detail refresh rewrites `pr_files`, but list sync moves `head_sha`, so D5 could swap a correct git diff for stale `pr_files` | A: nullable `pull_requests.files_head_sha` set when `pr_files` are rewritten; D5 runs only when it equals `head_sha` · B: no guard · C: drop D5 | A — one more nullable column in the same migration | S2, S4, S6 |

## Decisions recorded
User, 2026-09-29: "усі за рекомендацією" — every recommendation accepted.

| # | Choice |
|---|---|
| D1 | A — optional `base_sha` on `PrMeta` (shared + client mirror), filled by both forge adapters, nullable `pull_requests.base_sha` |
| D2 | A — refresh `base_sha` (and `base`) on every PR save: both list syncs and the detail refresh |
| D3 | A — git-adapter method fetches head + base SHAs to a bounded depth, then `base...head`; any error → `pr_files` |
| D4 | A — NULL `base_sha` → `pr_files`; if empty, legacy branch-name diff with a run-log warning |
| D5 | B — when `pr_files` is complete (count = `files_count`), a git diff with a path outside `pr_files` switches to `pr_files` and logs a line |
| D6 | A — `intent/service.ts` switches too, via a shared helper |

User, 2026-09-29 (after pass 2): "обидва за рекомендацією" — D7 and D8 recommendations accepted.

| # | Choice |
|---|---|
| D7 | A — GitLab list sync keeps the stored `base_sha` while `head_sha` is unchanged, NULLs it when the head moved; detail refresh + stats backfill (single-MR fetch) fill it |
| D8 | A — nullable `pull_requests.files_head_sha`, set whenever `pr_files` are rewritten; D5 runs only when it equals `head_sha` |

## Prerequisites
- Postgres up for `.it` tests; `git` ≥ 2.28 wherever the server and unit tests run (Research Q3).

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S4 | shared contract + client mirror, server schema/migration, forge adapters, PR-save routes | — | `PrMeta.base_sha?: string \| null`; `PullRow.baseSha`, `PullRow.filesHeadSha` (`string \| null`); migration file name; `MockForgeClient` default PR/detail now carry `base_sha` |
| G2 | S5–S7 | server git port + adapter, reviews diff selection, intent | G1 | `GitClient.diffCommits(repo, base, head)`; `loadDiff(git, repo, pull, repoRef): Promise<LoadedDiff>`; `MockGitClient` options `diffCommitsError`, `diffCommitsCalls` |

G1 and G2 both touch `server/src/adapters/mocks.ts`, so they run one after the other, never in parallel.

## Steps

### S1 — Add `base_sha` to `PrMeta`  [Contract]
- **Files:** `server/src/vendor/shared/contracts/platform.ts` (modify) · `client/src/vendor/shared/contracts/platform.ts` (modify — targeted mirror) · `server/test/contracts.test.ts` (modify)
- **Change:** in `PrMeta` (server `platform.ts:199`, client `:186`) add `base_sha: z.string().nullish(),` after `head_sha`, commented "PR base commit; absent on the GitLab list payload". `PrDetail` inherits it. `contracts.test.ts`: `PrMeta.parse` accepts `base_sha` absent, `null`, and 40-hex.
- **Layer / why here:** contracts change in `shared` first; this is the only step allowed to edit vendor files for `PrMeta`.
- **Skills to apply:** `onion-architecture`, `zod`, `typescript-expert`, `security`. Client skills don't apply: the only client file is a vendored Zod contract.
- **Practices:** optional + nullable (`nullish`), so every existing producer and client fixture still compiles; edit the exact lines by hand, **never** copy the folder; no other client file changes.
- **Known gotchas:** root `INSIGHTS.md` → "the two vendored `shared` copies are not actually in sync" (mirror the edit, don't copy) · "`TS2719` … after adding a contract field" (only for required keys; `nullish` avoids it).
- **Done when:** `cd server && pnpm typecheck` · `cd client && pnpm typecheck` · `cd server && pnpm exec vitest run test/contracts.test.ts` green · `git diff --stat -- client/src/vendor` shows only `contracts/platform.ts`.

### S2 — Add `base_sha` + `files_head_sha` columns and generate the migration
- **Files:** `server/src/db/schema/pulls.ts` (modify) · `server/src/db/migrations/**` (generated by the command only)
- **Change:** in `pullRequests` add `baseSha: text('base_sha'),` after `headSha`, and `filesHeadSha: text('files_head_sha'),` after `lastReviewedSha` (D8-A — drop it if D8 ≠ A). Both nullable, no default, no index (nothing filters on them). Then `cd server && pnpm db:generate`. (The `makePull` fixture gets the fields in S7; tests aren't type-checked, since `tsconfig.json` includes only `src/**`.)
- **Layer / why here:** schema is infrastructure; `PullRow = typeof t.pullRequests.$inferSelect` (`db/rows.ts:19`) picks the fields up everywhere.
- **Skills to apply:** `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`, `security`
- **Practices:** `camelCase` TS / `snake_case` SQL; `text` not `varchar`; a nullable column with no backfill (existing rows stay NULL → D4 fallback); never hand-write or edit the generated SQL; never run `db:migrate` from the step.
- **Known gotchas:** `server/insights/gotchas.md` → DB & migrations: "`pnpm db:generate` can hang…" (additions only, so a single run is safe) · "Migrations are never applied on boot".
- **Done when:** `cd server && pnpm typecheck` · `pnpm db:generate` produced exactly one new `server/src/db/migrations/0019_*.sql` with two `ADD COLUMN` statements and nothing else.

### S3 — Fill `base_sha` in the forge adapters and mocks
- **Files:** `server/src/adapters/github/octokit.ts` (modify) · `server/src/adapters/gitlab/mappers.ts` (modify) · `server/src/adapters/mocks.ts` (modify) · `server/test/gitlab-adapter.test.ts` (modify)
- **Change:** `octokit.ts` list mapping (`:52-66`) and `getPullRequest` mapping (`:94-108`): add `base_sha: pr.base.sha` (Research Q1: present on list items). `mappers.ts` `mapMrToPrMeta` (`:152`): add `base_sha: mr.diff_refs?.base_sha ?? null` (list payload → null, single MR → merge-base; `getPullRequest` spreads `mapMrToPrMeta`, `rest.ts:220`). `MockForgeClient` default list PR (`mocks.ts:171-185`) and default detail (`:191`): add `base_sha: 'b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0'` (assumption: a 40-hex fixture). Tests in `gitlab-adapter.test.ts` under "mappers — MR state and diff stats": `mapMrToPrMeta` maps `diff_refs.base_sha`, and returns `null` when `diff_refs` is absent or null.
- **Layer / why here:** adapters translate vendor payloads into the `PrMeta` port shape; no service sees `pr.base.sha`.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:** mapping only, no I/O added; GitLab mapper stays pure; don't touch `base`/`head_sha` mapping.
- **Known gotchas:** `server/insights/gotchas.md` → Tests: "`MockGitHubClient` lists exactly one hard-coded PR" (the default fixture changes for every test that uses it; only additive).
- **Done when:** `cd server && pnpm typecheck` · `pnpm exec vitest run test/gitlab-adapter.test.ts` green.

### S4 — Persist `base_sha` (and `base`, `head_sha`, `files_head_sha`) on every PR save
- **Files:** `server/src/modules/polling/routes.ts` (modify) · `server/src/modules/pulls/routes.ts` (modify) · `server/test/pull-base-sha.it.test.ts` (create)
- **Change:**
  - List upserts: `polling/routes.ts:33-57` and `pulls/routes.ts:59-83`. In `.values` add `baseSha: pr.base_sha ?? null`. In the `onConflictDoUpdate.set` add `base: pr.base` and `baseSha: sql\`coalesce(excluded.base_sha, case when ${t.pullRequests.headSha} = excluded.head_sha then ${t.pullRequests.baseSha} end)\`` (D7-A: keep the stored SHA while the head is unchanged, NULL once it moved). Import `sql` from `drizzle-orm`. Same expression in both files, each with a one-line comment naming D7.
  - Stats backfill `pulls/routes.ts:106-118`: `.set` also `base: detail.base, headSha: detail.head_sha, baseSha: detail.base_sha ?? null`. Do **not** set `filesHeadSha` here: no `pr_files` are written.
  - Detail refresh `pulls/routes.ts:276-286`: `.set` also `base: detail.base, headSha: detail.head_sha, baseSha: detail.base_sha ?? null, filesHeadSha: detail.head_sha` (D8-A).
  - Responses: list mapping (`pulls/routes.ts` ≈`:210-220`) and offline detail fallback (`:295-310`): add `base_sha: r.baseSha` / `base_sha: pr.baseSha`.
- **Layer / why here:** these writes already live in the routes (known onion drift); extend them in place.
- **Skills to apply:** `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `typescript-expert`, `security`
- **Practices:** Drizzle `sql` template with column interpolation, no string concatenation; no new route, no schema/params change; no new network call on any path (D2-A).
- **Known gotchas:** Tests: "`MockGitHubClient` lists exactly one hard-coded PR" (pass `{ pulls: [...] }`).
- **Done when:** `cd server && pnpm typecheck` · `pnpm exec vitest run test/pull-base-sha.it.test.ts test/pulls-comments.it.test.ts` green. The new test (pattern of `pulls-comments.it.test.ts`: `startPg`, `buildApp({ overrides: { forge } })`) asserts:
  1. list sync persists `base_sha`;
  2. a re-sync with `base_sha` absent and the same head keeps it;
  3. absent + new head → NULL;
  4. `POST /repos/:id/poll` persists it;
  5. `GET /pulls/:id` sets `base_sha`, `head_sha`, `files_head_sha` from `detail`.

  Give the fixture PRs non-zero `additions` so the stats backfill doesn't run and overwrite (1)–(3).

### S5 — `GitClient.diffCommits`: fetch, deepen to a merge-base, diff  [Contract — port]
- **Files:** `server/src/vendor/shared/adapters.ts` (modify — `GitClient` only, **no** client mirror: the client copy's `GitClient` already lacks `sync`/`diffNameOnly`) · `server/src/adapters/git/simple-git.ts` (modify) · `server/src/adapters/mocks.ts` (modify) · `server/test/simple-git-diff-commits.test.ts` (create)
- **Change:**
  - Port (after `diff`, `adapters.ts:269`): `diffCommits(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff>;` with a doc comment: both are commit SHAs, fetched if missing, clone deepened until a merge-base exists, then `base...head`; throws when no merge-base is found within the cap.
  - `SimpleGitClient.diffCommits`:
    1. validate both SHAs against `/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/` → `throw new Error('diffCommits: invalid sha …')`;
    2. for each SHA missing locally (`raw(['cat-file','-e', `${sha}^{commit}`])` throws) → one `raw(['fetch','--depth=1','origin', ...missing])`;
    3. loop up to `MERGE_BASE_MAX_ROUNDS` (4, assumption): `raw(['merge-base', base, head])`; on failure `raw(['fetch', `--deepen=${MERGE_BASE_DEEPEN}`, 'origin', head, base])` (50, assumption);
    4. no merge-base after the cap → `throw new Error('diffCommits: no merge base …')`;
    5. `parseUnifiedDiff(await g.diff([`${base}...${head}`]))`.

    Constants sit next to `RESYNC_FETCH_DEPTH` (`simple-git.ts:20`), with comments citing Research Q3.
  - `MockGitClient`: add `diffCommits(repo, base, head)` that records `{ base, head }` in a public `diffCommitsCalls` array, throws `opts.diffCommitsError` when set, else returns the same parse as `diff()`. Add `diffCommitsError?: Error` to `MockGitOptions`.
- **Layer / why here:** a git operation is an external call, so it goes behind the `GitClient` port, implemented in the adapter, mocked in `mocks.ts` (onion "canonical move"). This one method is the "shared helper" of D6: both consumers call it, so no cross-module import.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `zod`, `security`
- **Practices:** argv arrays only (no shell); validate before the first git call, like `readFileAt` (`simple-git.ts:141-153`), so a value starting with `-` can never become a git option; no provider-specific refs (GitLab fetch-by-SHA failure falls back upstream to `pr_files`); no vendor name in the port doc.
- **Known gotchas:** none in `server/insights/gotchas.md`; Research Q3: git < 2.28 silently two-dot-diffs on a missing merge-base (Prerequisites).
- **Done when:** `cd server && pnpm typecheck` · `pnpm exec vitest run test/simple-git-diff-commits.test.ts test/adapters.test.ts` green. The new test builds a temp origin repo (`mkdtemp`, `git config uploadpack.allowAnySHA1InWant true`, local `user.name/email`): `main` c1–c5 where c3–c5 add `main-only-*.ts`, and `feature` branched at c2 adding `feature.ts`. It clones `--depth 1 file://…` into `<cloneDir>/acme/demo`, then asserts:
  - (a) `diffCommits(c5, featureTip)` returns exactly `['feature.ts']`;
  - (b) `'--upload-pack=x'` and a 39-char SHA reject with `invalid sha`;
  - (c) an orphan-commit head rejects with `no merge base`.

### S6 — Choose the review diff source (`loadDiff`) and log it
- **Files:** `server/src/modules/reviews/diff-loader.ts` (modify) · `server/src/modules/reviews/helpers.ts` (modify) · `server/src/modules/reviews/constants.ts` (modify) · `server/src/modules/reviews/run-executor.ts` (modify) · `server/test/diff-loader.test.ts` (create) · `server/test/reviews-helpers.test.ts` (modify)
- **Change:**
  - `helpers.ts` (pure): `prFilesAreFresh(pull: Pick<PullRow,'headSha'|'filesHeadSha'|'filesCount'>, prFiles: {path:string}[]): boolean` = `filesHeadSha === headSha && prFiles.length > 0 && prFiles.length === filesCount`, and `pathsOutsidePrFiles(diff: UnifiedDiff, prFiles: {path:string}[]): string[]`.
  - `constants.ts`: `DIFF_COMMITS_TIMEOUT_MS = 90_000` (assumption).
  - `diff-loader.ts`: new signature `loadDiff(git: Pick<GitClient,'diff'|'diffCommits'>, repo: Pick<ReviewRepository,'getPrFiles'>, pull: PullRow, repoRef: RepoRef): Promise<LoadedDiff>`, with `LoadedDiff = { diff: UnifiedDiff; source: 'git' | 'pr_files' | 'legacy_branch'; note: string | null }`. Order:
    1. load `pr_files` once;
    2. if `pull.baseSha`: `withTimeout(git.diffCommits(repoRef, pull.baseSha, pull.headSha), DIFF_COMMITS_TIMEOUT_MS)`. With >0 files: if `prFilesAreFresh` and `pathsOutsidePrFiles` is non-empty → `pr_files` with note `git diff had N file(s) outside the PR file list — using the PR file list`; else `git`. On error or 0 files → note `base…head diff unavailable (<error message>)` and continue;
    3. `pr_files` with a patch → `pr_files`;
    4. else `git.diff(repoRef, pull.base, pull.headSha)` → `legacy_branch` with note `no base SHA and no PR file patches — using the legacy branch diff (may include unrelated changes)`. The same applies when `baseSha` is set but everything else failed (assumption).

    `diffFromPrFiles(files: { path: string; patch: string | null }[])` takes rows instead of re-querying. Drop the `db/schema` import and the unused `workspaceId`/`repoRow` params.
  - `run-executor.ts:118-128`: call `loadDiff(this.container.git, this.repo, pull, { owner: repo.owner, name: repo.name })`. Log `note` via `runLog.info` when non-null, and change the diff line to `Diff ready — ${n} changed file(s) (source: ${label}); starting …`, where label is `git base...head` / `PR file list` / `legacy branch diff`.
- **Layer / why here:** source selection is review orchestration (application); the comparison is pure and goes in `helpers.ts`; git stays behind the port.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `zod`, `security`
- **Practices:** `loadDiff` depends on the narrow `Pick<GitClient,…>` (testable without a container, like `IntentServiceDeps`); no SDK import; notes carry no file contents or secrets; `withTimeout` from `platform/resilience.ts`.
- **Known gotchas:** Run log: "In `runLog.info(msg, data)` only `msg` is persisted" (source and counts go in the message string).
- **Done when:** `cd server && pnpm typecheck` · `pnpm exec vitest run test/diff-loader.test.ts test/reviews-helpers.test.ts` green. With `MockGitClient` and a fake `getPrFiles`, `diff-loader.test.ts` asserts:
  - `diffCommits` is called with `baseSha`, never `pull.base`;
  - git success → `git`;
  - fresh + complete `pr_files` with an extra git path → `pr_files` + note;
  - stale `filesHeadSha`, or count ≠ `filesCount` → `git`;
  - `diffCommitsError` → `pr_files`;
  - `baseSha` null → `pr_files`;
  - null and no patches → `legacy_branch` + note.

  `pnpm exec vitest run test/reviews.it.test.ts` still green.

### S7 — Intent file summaries use `diffCommits`
- **Files:** `server/src/modules/intent/service.ts` (modify) · `server/test/intent-service.test.ts` (modify)
- **Change:** `IntentServiceDeps.git` (`service.ts:50`) becomes `Pick<GitClient, 'diff' | 'diffCommits' | 'fetchPullHead' | 'readFileAt'>`. At `:195`: `pull.baseSha ? this.deps.git.diffCommits(ref, pull.baseSha, pull.headSha) : this.deps.git.diff(ref, pull.base, pull.headSha)`, keeping the existing `try/catch → []`. Test: `makePull` defaults add `baseSha: null, filesHeadSha: null`; `makeGit` gets `diffCommits: vi.fn(async () => EMPTY_DIFF)`; plus one test: empty `pr_files` and `baseSha` set → `diffCommits` called with it, `diff` not called.
- **Layer / why here:** application service through its injected port; the container passes `this.git` (`container.ts:165`), which now implements the method.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `zod`, `security`
- **Practices:** no import from `modules/reviews/**`; deps stay fakes-only in the test.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `pnpm exec vitest run test/intent-service.test.ts` green · `pnpm exec vitest run --exclude '**/*.it.test.ts'` green.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `server/test/contracts.test.ts` | unit | `PrMeta.base_sha` nullish | S1 |
| `server/test/gitlab-adapter.test.ts` | unit | `mapMrToPrMeta` → `base_sha` / null | S3 |
| `server/test/pull-base-sha.it.test.ts` (create) | integration | AC1, D7 keep/clear, D8 `files_head_sha` | S4 |
| `server/test/simple-git-diff-commits.test.ts` (create) | unit (real `git`, temp dirs) | AC2, AC7, no-merge-base | S5 |
| `server/test/diff-loader.test.ts` (create) | unit | AC2–AC4 selection, notes | S6 |
| `server/test/reviews-helpers.test.ts` | unit | `prFilesAreFresh`, `pathsOutsidePrFiles` | S6 |
| `server/test/intent-service.test.ts` | unit | AC6 | S7 |
| `server/test/reviews.it.test.ts` (existing) | integration | executor still persists a review | S6 |

## Migrations & contracts
- `cd server && pnpm db:generate` after S2 → one migration adding `pull_requests.base_sha`, `pull_requests.files_head_sha`. The main session applies it (`pnpm db:migrate`); existing rows stay NULL.
- Contract: `PrMeta.base_sha` (server + targeted client mirror) in S1; port `GitClient.diffCommits` (server copy only) in S5.

## Out of scope
- `REVIEW_STRATEGY` on large diffs; stale local `main`; `sync()`/`fetchPullHead`; GitLab MR-ref fetching; moving upserts into a repository; `listFiles` pagination; client UI for `base_sha`; other `client/src/vendor/**` edits; backfilling existing rows.

<!-- implementer-brief:end -->

## Context applied
- `server/insights/gotchas.md` → "`db:generate` can hang…", "never applied on boot" → S2 · "`MockGitHubClient` lists exactly one PR" → S3, S4 · "`runLog.info` only `msg`" → S6 · "nullable column in a unique index" → S4 (not indexed).
- root `INSIGHTS.md` → "vendored `shared` copies not in sync", "`TS2719` after a contract field" → S1, S5 (no client port mirror).
- `.claude/skills/onion-architecture` → drift list (routes touching `db/schema`, `reviews/diff-loader`) → S4 extends in place; S6 removes diff-loader's schema import.
- Research → pass 2 (below) → S3 (Q1, Q2), S5 (Q3 fetch/deepen loop, git ≥ 2.28), D7.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| engineering-insights | preload | Method step 1 | |
| onion-architecture | preload | S1, S3–S7 | |
| drizzle-orm-patterns | on demand (S2) | S2, S4 | |
| postgresql-table-design | on demand (S2) | S2 | |
| zod | on demand (S1) | S1–S7 | |
| typescript-expert | on demand (S1) | S1–S7 | |
| security | on demand (S5) | S1–S7 (S5: argv/SHA validation) | |
| fastify-best-practices | on demand (S4) | S4 | |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `contracts/platform.ts` (`PrMeta`), `adapters.ts` (`GitClient`) | Ports | changed |
| client | `src/vendor/shared/contracts/platform.ts` | vendored contract | changed (mirror) |
| server | `db/schema/pulls.ts` + migration | Infrastructure | changed / new |
| server | `adapters/github/octokit.ts`, `adapters/gitlab/mappers.ts`, `adapters/git/simple-git.ts`, `adapters/mocks.ts` | Infrastructure | changed |
| server | `modules/polling/routes.ts`, `modules/pulls/routes.ts` | Transport | changed |
| server | `modules/reviews/{diff-loader,helpers,constants,run-executor}.ts` | Application | changed |
| server | `modules/intent/service.ts` | Application | changed |

## Design notes
- **Why the merge-base loop is in the adapter, not in `loadDiff`.** Fetch, merge-base and diff are git plumbing. One port method lets reviews and intent share it (D6-A) without a cross-module import.
- **Why clearing on head change (D7-A) applies to GitHub too.** GitHub always supplies `base_sha` on the list, so `coalesce` takes the new value; the `case` branch only matters for GitLab list syncs.
- **Pass-1 option prose (D1–D6)**:
  - D1-B (a separate forge method at review time) was rejected: it puts network on the review path.
  - D2-B (refetch the PR at review start) was rejected for the same reason.
  - D3-B (no fetch) keeps failing on shallow clones; D3-C (`pr_files` first) is capped at 100 files on GitHub.
  - D4-B/C either reintroduce the bug or fail runs that `pr_files` can serve.
  - D5-A would have missed PR #8; D5-C logs but still reviews the wrong diff.
  - D6-B leaves the intent classifier on the branch-name diff.

## Risks & open questions
- GitHub `base.sha` is a base-tip snapshot whose refresh on base moves is undocumented (Q4). The three-dot diff computes the merge-base locally, so a stale tip still yields the PR's own changes unless the PR merged the base into itself. Parity is proven only on PR #8.
- `withTimeout` does not kill the git subprocess: a hung fetch keeps running after the fallback. Low impact (read-only mirror), but worth knowing.
- `fetch --depth=1 <sha>` / `--deepen` rewrite `.git/shallow`. A concurrent `sync()` from the indexer may hit `shallow.lock`; the error falls back to `pr_files`.
- The unit test in S5 needs a `git` binary on CI runners, and `uploadpack.allowAnySHA1InWant` on the temp origin for fetch-by-SHA over `file://`.
- `pr_files` from GitHub stop at 100 files (single `listFiles` page), so D5 is skipped and the `pr_files` fallback is truncated on large PRs (existing behaviour).
- The detail refresh and backfill now also update `head_sha`, which feeds `deriveReviewStatus` (`pulls/status.ts`). That is more correct, but a visible status change is possible.
- Doc vs code: the onion skill's `depcruise` gate is not real (root `INSIGHTS.md` 2026-09-26), so no depcruise command in any Done-when.

## Handed off
- architecture-reviewer: S5 port shape (`diffCommits` vs extending `diff`); S4 SQL expression duplicated in two routes; S6 `loadDiff` signature change.
- security review: S5 argv built from forge-supplied SHAs (validation, no shell, `--`-style option injection); S4 raw `sql` fragment (column interpolation only, no input).

## Insights to record
- `server/INSIGHTS.md` · What Doesn't Work — `git diff <branch>...<head>` in the shallow clones reviews unrelated history; use the PR's base SHA plus a merge-base deepen loop (`diff-loader.ts:20`, PR #8 343 vs 74 files) — after implementation.
- `server/INSIGHTS.md` · Tool & Library Notes — GitLab MR list has no `diff_refs`; `base_sha` only on the single MR (`gitlab/mappers.ts:152`) — after verification.

## Red-flags check
- [x] Every AC maps to at least one step or test (AC1 S3/S4, AC2 S5/S6, AC3–AC5 S6, AC6 S7, AC7 S5)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; product choices are in *Decisions needed* (D7, D8)
- [x] Groups end type-checking; G1/G2 are sequential (shared `mocks.ts`)
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1: n/a (pass 2)
- [x] Every step's *Skills to apply* is complete (the implementer reads only those)

## Handoffs → G2
From the G1 implementer run (2026-09-29, status done; S1–S4 done; one trivial deviation in S3: `base_sha: null` added to the existing GitLab list-payload `toEqual`).

- Contract: `PrMeta.base_sha?: string | null` in the server and client copies (client: targeted mirror, only `contracts/platform.ts` changed under `client/src/vendor`).
- Schema: `PullRow.baseSha: string | null`, `PullRow.filesHeadSha: string | null`.
- Migration `server/src/db/migrations/0019_wild_sauron.sql` (two `ADD COLUMN`s) — generated, **not applied**; the main session runs `db:migrate`.
- Mocks: `MockForgeClient` default list PR and detail carry `base_sha: 'b0b0…b0'` (40 chars).
- `makePull` fixtures not updated (per plan); S7 adds `baseSha`/`filesHeadSha` to the intent test's `makePull`.
- `pulls/routes.ts` backfill writes `headSha`/`base`/`baseSha` to the DB but not to the in-memory `r` row, so that list response can show SHAs one sync behind.
- For review: D7 `coalesce(excluded.base_sha, case … end)` duplicated in `polling/routes.ts` and `pulls/routes.ts` (planned); the raw `sql` fragment interpolates columns only.

### Skills (G1)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S3, S4 | |
| `engineering-insights` | preload | | no insight written (Step 0 only) |
| `zod` | on demand | S1 | |
| `typescript-expert` | on demand | S1–S4 | |
| `security` | on demand | S1–S4 | |
| `drizzle-orm-patterns` | on demand | S2, S4 | |
| `postgresql-table-design` | on demand | S2 | |
| `fastify-best-practices` | on demand | S4 | |

## Handoffs → verification (after G2)
From the G2 implementer run (2026-09-29, status done; S5–S7 done). Trivial deviations: S5 `hasMergeBase` checks for non-empty output (simple-git `raw(['merge-base',…])` resolves empty on exit 1, no throw); S6 note text for a 0-file git result is `base...head diff unavailable (git diff returned 0 files)`.
- New port method `GitClient.diffCommits` (server copy only, no client mirror); `loadDiff(git, repo, pull, repoRef)`; `run-executor.ts` passes `this.container.git`.
- `SimpleGitClient.diffCommits` validates both SHAs against `/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/` before any git call; argv only, no shell.
- Migration 0019 still not applied to the dev DB.

### Skills (G2)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S5–S7 | |
| `engineering-insights` | preload | | no insight written here |
| `typescript-expert` | on demand | S5–S7 | |
| `zod` | on demand | S5–S7 | no schema changes in G2; SHA regex validation only |
| `security` | on demand | S5 (argv, SHA validation) | |

## Research → pass 2 (external, 2026-09-29)
Researcher report (docs-sourced) + main-session empirical check on korzunss/dev-digest (git 2.54, GitHub over SSH).
- **Q1** GitHub `pulls.list` items carry `base.sha` + `head.sha` (required in the list schema) — high confidence; no per-PR `pulls.get` needed.
- **Q2** GitLab `diff_refs` is **only on the single-MR endpoint**, not the list (medium-high, from doc examples). `diff_refs` is empty right after MR creation (filled async). `base_sha` = merge-base, `start_sha` = target tip, `head_sha` = source tip. ⇒ D2-A for GitLab needs a per-MR GET or can only fill on the detail refresh — if that changes D2, raise it as a new decision.
- **Q3** Empirical (GitHub): `git fetch --depth=1 origin <sha>` works for both base and head SHAs; `git fetch --depth=1 origin pull/8/head` works on a merged PR. With both at depth 1, `git diff base...head` → `fatal: …: no merge base`, **exit 128** (git ≥ 2.28 fails loudly; < 2.28 silently fell back to a two-dot diff). A `git fetch --deepen=10 origin <head> <base>` loop + `git merge-base` found the merge-base in round 2 and the diff then matched GitHub exactly (74 files, +8 693/−256). No bounded fetch form *guarantees* a merge-base; cap the loop, then fall back to `pr_files` (D3-A). GitLab fetch-by-SHA not established — keep the `refs/merge-requests/<n>/head` ref fetch as the fallback path.
- **Q4** GitHub `base.sha` is a base-branch tip snapshot, **not** the merge-base (sources conflict on whether it refreshes on base moves; docs silent). Compute the merge-base locally via `...`; refresh both SHAs on every sync (D2). Parity with "Files changed" for merged/force-pushed PRs is not established beyond the PR #8 check.

## Verification log
Plan 05 carry-over checks (`docs/plans/05-decisions-first-planning.md` → *Carry-over checks*) — filled by the main session:

| Check | Result | Evidence |
|---|---|---|
| T2/T3 — pass-1 draft within cap; pass 2 resumes it | pass 1 ok; pass 2 ok (resumed the same planner) | pass 1: ~3,350 B above the marker, ends `Steps: pending decisions`, index row `draft (decisions)` (2026-09-29) |
| T4 — planner / implementer `subagent_tokens` with the 2-skill preload (baseline 66.8k / 193k) | planner pass 1: 53.7k (−20% vs 66.8k); implementer G1: 70.1k, G2: 76.6k (vs 193k baseline) | planner pass 1 `subagent_tokens` 53,651, 10 tool uses; pass 2 (resume) reported 126,934, 42 tool uses — the harness figure for a resumed run; not split from pass 1; implementer G1 `subagent_tokens` 70,082, 21 tool uses; G2 76,598, 16 tool uses |
| T5 — plan-verifier emits `SK` items and flags a *Skills to apply* skill missing from *Applied in* | ok | plan-verifier 2026-09-29 emitted SK1–SK7; flagged SK1–SK4, SK6, SK7 missing (cross-cutting skills recorded against one step only) |

### Wave 1 (2026-09-29)
- Full `.it` suite (main session): 16 files, 115 tests, exit 0.
- architecture-reviewer: PASS — F1 HIGH non-blocking (D7 SQL duplicated in two routes; route→DB drift; fix needs a repository file → follow-up plan).
- security-reviewer: PASS — no findings. Manual check (git stderr leaking the credentialed `origin` URL into the run-log note): main session tested git 2.54 against a fake-credential remote — `unable to access` errors print the URL without credentials (0 leaks, `--depth=1 <sha>` and `--deepen`).
- plan-verifier: incomplete — 77/85 met; gaps SK1–SK4, SK6, SK7; needs sign-off R3 (plan file untracked), R4 (no test-writer run). Handoff: `diff-loader.ts:57-63` legacy note says "no base SHA" when a base SHA exists and drops the diffCommits error note.

### Wave 1 — user decisions (2026-09-29)
User: "1 fix mode, 2b, R3 підтверджую, R4 приймаю".
- SK1–SK4, SK6, SK7 → implementer fix mode.
- **CH1 (approved plan change to S6 step 4):** when `pull.baseSha` is set, `loadDiff` never falls back to the legacy branch-name diff. If `diffCommits` fails/returns 0 files and `pr_files` has no patches, it throws an error whose message keeps the `base...head diff unavailable (…)` reason; `run-executor` already fails the run with "Failed to load PR diff: …". The legacy path stays only for `baseSha` NULL (D4), and its note no longer claims "no base SHA" unless that is true. Unit test in `server/test/diff-loader.test.ts` covers the throw. Goes to fix mode with the SK gaps (2 files → above the main-session trivial-fix limit).
- R3 signed off: only the main session and the planner (its two passes) edited the plan file.
- R4 accepted: no test-writer run for this plan.
- F1 (architecture) → follow-up plan, not this one.

### Wave 1 — fix mode (2026-09-29)
Implementer fix mode: CH1 done (`server/src/modules/reviews/diff-loader.ts`, `server/test/diff-loader.test.ts`; new unit test "throws with the reason when baseSha is set and neither git nor pr_files work"). SK1–SK4, SK6, SK7: skills re-read in full (after a main-session send-back — the first pass read 60 lines and recorded them against CH1 only), named steps re-checked, no violations, no code change.
Checks: `diff-loader.test.ts` 7 pass · `pnpm typecheck` server exit 0 · unit 31 files / 372 pass (implementer) · related `.it` (main session): `pull-base-sha`, `reviews`, `intent`, `pulls-comments` — 4 files / 22 pass.

#### Skills (fix mode)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1 (contract in `shared` first, mirrored; no layer crossing); also S3–S7, CH1 | |
| `zod` | on demand, full | S1 (`base_sha: z.string().nullish()`) | S2 (Drizzle `text` columns), S3 (adapter mapping only), S4 (no route/params schema changed) — no Zod schema written |
| `security` | on demand, full | S6 (note/error carry only the git reason; fail-closed via CH1), S7 (SHAs hex-validated in the adapter before any git call, argv, no shell), S4 (`sql` interpolates columns only) | |
| `typescript-expert` | on demand | CH1, S1–S7 | |

### Wave 1 — delta verification (2026-09-29)
plan-verifier (delta): incomplete — 81/86 met. Closed: SK1, SK6, SK7, CH1 (throw at `diff-loader.ts:60-62` precedes the legacy call; test `diff-loader.test.ts:74-79`). Open: SK2, SK3, SK4 — `zod` listed under *Not used — reason* for S2–S4 (no Zod schema in those steps); the check reads *Applied in* only. No unplanned changes since wave 1. Needs sign-off: none open.

### Wave 1 — plan change CH2 (2026-09-29)
User: "a, прибирай zod з S2–S4". `zod` removed from *Skills to apply* of S2, S3, S4 (no Zod schema is written in those steps; the implementer recorded it under *Not used — reason*). Closes SK2–SK4 by plan change; no code change.

### Final (2026-09-29)
plan-verifier (delta after CH2): **complete** — 86/86 met; no gaps, no sign-off open, no unplanned changes. Status → `done`.

### Post-done gap (2026-09-30, pr-self-review)
Found by `/pr-self-review` on branch L04 (HIGH, items 2–3) and confirmed against the code. The user approved the fix ("так, виправь"). Status `done` → `in-progress`.

- **SR2 — a retargeted GitLab MR keeps the old target's `base_sha`** (S4). The D7 upsert expression `coalesce(excluded.base_sha, case when pull_requests.head_sha = excluded.head_sha then pull_requests.base_sha end)` (`server/src/modules/pulls/routes.ts:84`, `server/src/modules/polling/routes.ts:57`) keeps the stored SHA whenever the head is unchanged, even though the same statement overwrites `base`. The GitLab list payload has no `diff_refs` (`gitlab/mappers.ts:160-161`), so `excluded.base_sha` is NULL. After a retarget with no new push, `base` is the new branch but `base_sha` still points into the old one. `diffCommits` then diffs against the wrong base, and `prFilesAreFresh` can't tell, because `files_head_sha` still equals `head_sha`. GitHub is unaffected: `octokit.ts:59,102` always sends `base_sha`.
  - **Fix:** in both routes, keep the stored SHA only when the head **and** the base branch are unchanged: `case when ${t.pullRequests.headSha} = excluded.head_sha and ${t.pullRequests.base} = excluded.base then ${t.pullRequests.baseSha} end`. Update both D7 comments to match. Stay within the two route files: extracting a shared helper would need a new file outside S4, so it is out of scope here.
  - **Done when:** `cd server && pnpm typecheck && pnpm vitest run test/pull-base-sha.it.test.ts`. `pull-base-sha.it.test.ts` gains a case for each route: a stored row with `base_sha` set is re-synced with the same `head_sha`, a different `base` and a NULL `base_sha` → `base_sha` becomes NULL. The existing "same head, same base → kept" case stays green.
- **SR2 implementer (fix mode, 2026-09-30):** done. Files: `server/src/modules/pulls/routes.ts`, `server/src/modules/polling/routes.ts` (the CASE also requires `base = excluded.base`; D7 comments updated), `server/test/pull-base-sha.it.test.ts` (+2 retarget cases, one per route). Checks: server typecheck ✅, `pull-base-sha.it` 7/7 ✅. Main-session review: correct, because `ON CONFLICT … DO UPDATE SET` expressions read the old row, so `pull_requests.base` is the pre-update branch.
- **Full server suite (main session, 2026-09-30, after SR2 and plan 06's SR7–SR9):** `cd server && pnpm test` → 52 files / 512 tests, exit 0, including all 18 `.it` files (`pull-base-sha.it` 7).
- **plan-verifier (delta, SR2):** complete: 7/7 delta items met, no gaps, no unplanned changes, nothing to sign off. Handoff: the stale header comment in `server/test/pull-base-sha.it.test.ts:1-4`.
- **main-session fix: SR2-doc**: the `pull-base-sha.it.test.ts` header comment now names the base-branch condition (comment-only, 1 file in S4). Done-when re-run: `pull-base-sha.it` 7/7 ✅.
- Status `in-progress` → `done`.

### Post-done main-session fix (2026-10-01)
- **main-session fix: DL1** (`server/src/modules/reviews/diff-loader.ts`, an S6 file, +2 lines). With no base SHA, no `pr_files` patches, and a failed legacy branch diff, `loadDiff` returned an empty diff, but its run-log note claimed "using the legacy branch diff". The note now says the legacy diff failed and that an empty diff is reviewed; behaviour is otherwise unchanged. This was found by the DevDigest General Reviewer run on PR #13 (2026-10-01) and confirmed by the main session. Server typecheck ✅; `diff-loader` tests ✅. Not yet seen by a plan-verifier run.
