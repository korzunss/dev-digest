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

### 2026-09-23 — an optional "disambiguation" field turned into an authorisation bypass

**Symptom:** `parseRepoUrl` rejects an unknown forge host — unless the request
body names a `provider`, which reads like a harmless hint for the case the URL
cannot settle. It is not. `POST /repos` with
`{url: 'https://evil.example.net/a/b', provider: 'gitlab'}` was accepted, and
from then on the GitLab PAT went to that host: as a `PRIVATE-TOKEN` header on
every `${origin}/api/v4` call, and embedded by `withForgeToken` into
`https://oauth2:<token>@evil.example.net/a/b.git` for the clone.
**Cause:** the guard and the escape hatch were written in the same breath. The
`if (!opts.provider) throw` shape makes the *absence* of a hint the failure
condition, so supplying one satisfies the check — the host is never validated
at all. Two review findings circled this (one called it SSRF via `GITLAB_HOST`,
one called it a misconfiguration risk) and neither named it: the env var is not
the attacker-controlled input, the request body is.
**Rule:** a field that selects *among* trusted values must never be able to
*add* one. Validate the host against the allowlist first and let the hint only
disambiguate what survives; an unlisted host stays rejected however the request
is phrased. Applies to any outbound call that carries a credential — ask which
host ends up receiving the token, not whether the URL parsed. Also reject
non-http(s) schemes explicitly: `z.string().url()` passes `file:` and `ftp:`,
and `new URL('file:///x').origin` is the string `'null'`, which flows onward as
a perfectly ordinary-looking base.
**Evidence:** `server/src/modules/repos/helpers.ts` → the unknown-host branch ·
`server/test/repo-url.test.ts` → "rejects an unknown host even when the caller
names a provider" · `server/test/gitlab.it.test.ts` → `unknown_forge_host` /
`provider_mismatch`

### 2026-09-23 — a `..` guard placed after `new URL()` never fires

**Symptom:** widening `parseRepoUrl` from the old two-segment GitHub regex to
arbitrary nested GitLab group paths removed an accidental traversal guard, so an
explicit one was added — reject any path segment equal to `..`. A test asserting
`parseRepoUrl('https://gitlab.com/acme/../../etc/passwd')` throws **failed**:
nothing threw.
**Cause:** the WHATWG URL parser normalises the path itself. `new URL(...)
.pathname` for that input is already `/etc/passwd` — the `..` segments are gone
before the guard looks at them. The input does not escape anywhere; it silently
resolves to a *different, well-formed* project (`owner=etc`, `name=passwd`).
The guard is only reachable on the branch that does NOT go through `new URL`:
`stripBase()` matches a configured self-managed base against the raw string, so
`https://acme.com/gitlab/../../evil/x` does reach `cleanProjectPath` with `..`
intact.
**Rule:** when a guard sits downstream of `new URL`, verify which spellings can
actually reach it before trusting it — and keep the guard for the raw-string
branches, which is where it earns its place. Assert the *normalising* behaviour
too, so a later rewrite that drops `new URL` (e.g. moving to a regex for speed)
fails loudly instead of quietly re-opening the hole.
**Evidence:** `server/src/modules/repos/helpers.ts` → `cleanProjectPath` vs
`stripBase` · `server/test/repo-url.test.ts` → "documents that WHATWG URL
collapses '..' before the guard can see it" ·
`node -e "new URL('https://gitlab.com/acme/../../etc/passwd').pathname"` →
`/etc/passwd`

## Codebase Patterns

### 2026-09-23 — adding a NULLABLE column to a unique index silently stops deduplicating

**Symptom:** `repos` gained `api_base` (null for a hosted repo, set for a
self-managed instance) and the unique key was widened to
`(workspace_id, provider, full_name)`. An integration test then showed two
*different* self-managed GitLabs hosting `team/api` collapsing into one repo —
the second add returned 200 "already exists" instead of 201. The obvious fix,
adding `api_base` to the index, is a trap in the other direction.
**Cause:** Postgres treats NULLs as **distinct** in a unique index, so
`(ws, 'github', NULL, 'acme/api')` never conflicts with itself. Putting a
nullable column in the key would therefore have stopped deduplicating every
*hosted* repo — the null case, i.e. almost all of them — turning a narrow bug
into a wide one, and silently: a duplicate add just succeeds.
**Rule:** when a nullable column becomes part of a uniqueness rule, index
`coalesce(<col>, '')` rather than the bare column, and make the lookup query
use the **same** expression (`sql\`coalesce(${t.repos.apiBase}, '') = ${v ?? ''}\``)
— an index and a dedupe query that disagree produce a race that only shows up
under concurrency. Drizzle accepts `sql\`\`` inside `uniqueIndex(...).on(...)`,
so this stays a generated migration.
**Evidence:** `server/src/db/schema/repos.ts` → `repos_ws_forge_fullname_uq` ·
`server/src/db/migrations/0017_wild_scarlet_witch.sql` ·
`server/src/modules/repos/repository.ts` → `findByFullName` ·
`server/test/gitlab.it.test.ts` → "keeps the same full_name on two forges as two
distinct repos"

### 2026-09-23 — `withRetry` is a silent no-op for an adapter built on raw `fetch`

**Symptom:** none observed yet — found while reading `resilience.ts` to plan a
non-SDK adapter. An adapter that wraps every call in
`withRetry(() => withTimeout(...))`, exactly like `adapters/github/octokit.ts`
does, looks fully resilient and would in fact retry **nothing**: not a 429, not
a 502.
**Cause:** `defaultIsRetryable` decides from `err.status` / `err.statusCode` /
`err.response.status`. Every adapter using `withRetry` today is SDK-based
(`octokit`, `openai`, `anthropic`), and those SDKs throw error objects carrying
`status`. `fetch` does not throw on 4xx/5xx at all — it resolves with
`res.ok === false` — so a hand-rolled `request()` that does
`if (!res.ok) throw new Error(await res.text())` produces an error with no
`status` field, `defaultIsRetryable` falls through to the network-code branch,
finds no `code`, and returns false on the first attempt.
**Rule:** any adapter that talks HTTP without an SDK must throw an Error object
with a numeric `status` property (`Object.assign(new Error(msg), { status:
res.status })`) — or pass its own `opts.isRetryable`. Do not assume the
`withRetry(() => withTimeout(...))` wrapper alone buys retry behaviour; it only
does when the thrown error carries the status the predicate reads.
**Evidence:** `server/src/platform/resilience.ts:35-44` (`defaultIsRetryable`) ·
`grep -rln withRetry src/adapters/` → only `llm/anthropic.ts`, `llm/openai.ts`,
`github/octokit.ts`, all SDK-based · `specs/005-gitlab-integration.md` § "The
GitLab adapter"

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

### 2026-09-22 — `pnpm db:generate` hangs forever when one table both drops and adds a column

**Symptom:** `pnpm db:generate` produced no output at all and never exited —
killed at a 120 s timeout with a zero-byte log and no migration written. It reads
like a hung DB connection or a broken `drizzle.config.ts`, and neither is
involved: the same config generates fine before and after.
**Cause:** drizzle-kit's rename detection. When a single diff gives one table
**both** a deleted column and added ones, it cannot tell a drop+add from a
rename, so it asks — and the prompt (hanji, raw-mode TTY) renders nothing and
reads nothing when stdin is not a terminal. It waits forever, silently. Here
`conventions` lost `accepted` and gained nine columns in the same change.
**Rule:** when a schema change removes a column from a table that also gains
one, split it into **two** `db:generate` runs: first a schema variant carrying
only the deletion, then the full schema carrying only additions. Neither diff is
ambiguous, so neither prompts, and both outputs are ordinary generated
migrations — the "migrations are generated, never hand-written" rule survives
intact. Do not try to feed the prompt from a pipe or `/dev/null`; it is not
reading stdin in a way that helps. The same trap is waiting for any table rename.
**Evidence:** `src/db/migrations/0015_short_vin_gonzales.sql` (the lone
`ALTER TABLE "conventions" DROP COLUMN "accepted"`) ·
`0016_majestic_korath.sql` (the additions + `convention_scans`) ·
`drizzle.config.ts`

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
