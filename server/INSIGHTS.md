# Insights — `@devdigest/api`

Append-only. Things that cost someone time in the server package. Repo-wide
findings go in [`../INSIGHTS.md`](../INSIGHTS.md), which carries the entry format,
the section guide and the promotion rule (a standing rule becomes one line under
`Gotchas` in `server/AGENTS.md`). The `engineering-insights` skill writes here.

```md
### YYYY-MM-DD — short title
**Symptom:** what you observed.
**Cause:** why it happened.
**Rule:** what to do from now on.
**Evidence:** `path/to/file.ts:42` · command · error string
```

---

## What Works

_Nothing yet._

## What Doesn't Work

_Nothing yet._

## Codebase Patterns

### 2026-09-18 — a foreign-key column carries no index; every child-rows query scans

**Symptom:** a query of the form "give me the children of these parent ids"
(`WHERE child.parent_id = ANY($1)`) sequential-scans the whole child table, even
though `parent_id` is declared a foreign key and the parent side is a primary key.
**Cause:** Postgres indexes the column a FK *points at* — never the column
holding it. Drizzle's `.references()` declares the constraint, not an index, so a
schema that looks fully wired has none of these covered.
**Rule:** when you add a read path over a FK column, add the index in the same
change: an `index('<table>_<col>_idx')` in the table's callback, then
`pnpm db:generate`. This repo has now hit it three times — `agent_runs.pr_id` and
`reviews.pr_id` (both added in spec 001, retroactively), and `findings.review_id`
(spec 002). Assume any FK column you are about to filter on is unindexed and
check the schema's callback rather than the `.references()` line.
**Evidence:** `server/src/db/schema/runs.ts:44` (`agent_runs_pr_idx`) ·
`server/src/db/schema/reviews.ts:38` (`reviews_pr_idx`) ·
`server/src/db/schema/reviews.ts:40-58` — `findings.reviewId` still has no
callback at all · `specs/001-run-cost-badge.md` → "Postgres indexes the column a
foreign key POINTS AT"

## Tool & Library Notes

### 2026-09-18 — `MockGitHubClient` lists exactly one PR, so "the other PR" doesn't exist

**Symptom:** an integration test that asserts something about a *second* pull
request — a PR with no review, a PR the rollup should skip — finds nothing and
fails on a `toBeDefined()` that looks like a bug in the route.
**Cause:** `listPullRequests()` returns a single hard-coded PR (#482) unless the
caller passes `opts.pulls`, and `seed()` persists that same #482. So a repo in
an integration test has exactly one PR, and it is always the reviewed one.
**Rule:** insert the extra PR yourself with `db.insert(t.pullRequests)` (or
construct `new MockGitHubClient({ pulls: […] })`). Don't infer from a passing
list-endpoint test that several PRs were exercised — one was.
**Evidence:** `server/src/adapters/mocks.ts:162` ·
`server/src/db/seed.ts:94` · `server/test/integration.it.test.ts` → the spec-002
rollup test inserts PR #999 for exactly this reason

## Recurring Errors & Fixes

### 2026-09-17 — `relation "…" does not exist` on a fresh checkout

**Symptom:** the API boots, then every DB-backed route 500s with a missing-relation
error.
**Cause:** the server deliberately does not migrate on boot, so a fresh database
has no tables.
**Rule:** run `pnpm db:migrate` after cloning and after any pull that adds a
migration. `pnpm db:seed` afterwards is idempotent.

## Session Notes

_Nothing yet._

## Open Questions

_Nothing yet._
