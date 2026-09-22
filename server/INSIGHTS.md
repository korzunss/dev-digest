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

### 2026-09-22 — a `realpath` containment check must resolve BOTH sides, or it fails closed

**Symptom:** a symlink guard that reads as obviously correct — `realpath()` the
requested file, then check it is still under the clone directory — refuses
*every* document as soon as the clone directory is a temp dir, which is exactly
how an integration test builds one (`mkdtemp(path.join(tmpdir(), …))`).
**Cause:** on macOS `os.tmpdir()` is `/var/folders/…` and `/var` is a symlink to
`/private/var`. `realpath()` of a file inside the fixture therefore returns
`/private/var/folders/…` while the un-resolved `cloneDir` string is still
`/var/folders/…`. The boundary check is comparing two different spellings of the
same directory, so it rejects — and the failure looks like the guard catching a
real escape rather than like a path-normalisation bug.
**Rule:** whenever you check "is this resolved path still inside the allowed
root", call `realpath` on the **root** as well as on the target, then compare on
the separator boundary (`p === root || p.startsWith(root + sep)`) — never a bare
`startsWith` on the raw strings, which accepts the sibling
`/clones/acme/payments-api-evil`. Holds in production too: `config.cloneDir` is
operator-supplied and may itself sit behind a symlink.
**Evidence:** `server/src/modules/context/service.ts` → `getDoc()` resolves
`realDir` *and* `realTarget` before `isInsideDir` ·
`server/src/modules/context/helpers.ts` → `isInsideDir` ·
`server/test/context.it.test.ts` → `specs/leak.md -> /etc/hosts` expects 422

### 2026-09-21 — a Drizzle `text(..., { enum })` column has NO constraint in SQL

**Symptom:** adding `'imported_file'` to `skills.source` looked like it needed a
migration — the column is declared with an `enum` list, so the obvious assumption
is a `CHECK` or a Postgres enum type that has to be altered. `pnpm db:generate`
produced nothing for it.
**Cause:** `text(name, { enum: [...] })` is a **TypeScript-level** narrowing only.
The generated DDL is a plain `"source" text NOT NULL` — Drizzle emits no `CHECK`
and no `CREATE TYPE`. This repo uses that form for every enum-ish column
(`provider`, `strategy`, `ci_fail_on`, `type`, `source`, `cost_source`); there is
not one `pgEnum` in the schema.
**Rule:** adding a value to one of these enums is a **code-only** change — edit
the `@devdigest/shared` contract and the schema literal, mirror the contract into
the client copy, done. Don't write a migration for it, and don't expect
`db:generate` to produce one. The flip side is that the database will happily
store a value your TypeScript forbids, so an old row with a retired value still
reads back: keep DTO mappers total (`row.source as SkillSource`) rather than
switching exhaustively over the enum and throwing on the default.
**Evidence:** `server/src/db/schema/skills.ts` (declared enum) vs
`server/src/db/migrations/0000_init.sql:322` → `"source" text NOT NULL` ·
`0013_complex_thundra.sql` contains only the two new indexes

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

### 2026-09-21 — `waitForPrRuns` returns before the run trace exists

**Symptom:** an integration test reads `GET /runs/:id/trace` right after
`waitForPrRuns(db, prId, { expected: 1 })` and gets
`TypeError: Cannot read properties of undefined (reading 'skills')`. It passes
every time when the file is run alone (`vitest run skills-in-prompt`) and fails
when the whole `.it.test` lane runs — which reads as flakiness in the feature
rather than in the wait.
**Cause:** `waitForPrRuns` polls `agent_runs` until the row reaches a terminal
status, and the executor writes the trace document **after** that:
`completeAgentRun(...)` then `saveRunTrace(runId, trace)` several statements
later. So "the run is done" and "the trace is readable" are two different
moments, and the gap only widens when nine containers compete for the machine.
Worse, `waitForPrRuns` returns the rows on timeout instead of throwing, so a wait
that gave up looks identical to one that succeeded.
**Rule:** never read `run_traces` straight after `waitForPrRuns`. Poll for the
document itself — retry `GET /runs/:id/trace` until it is 200 **and**
`prompt_assembly` is present, then throw on timeout so a genuine failure is not
reported as a missing field. The same applies to anything else the executor
persists after `completeAgentRun`.
**Evidence:** `server/src/modules/reviews/run-executor.ts` → `completeAgentRun`
precedes `saveRunTrace` · `server/test/helpers/runs.ts:31` (returns on timeout) ·
`server/test/skills-in-prompt.it.test.ts` → the `readTrace` poll helper

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
