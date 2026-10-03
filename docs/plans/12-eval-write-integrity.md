# Development Plan: eval write integrity (one transaction, unique eval case)
Status: done
Save as: docs/plans/12-eval-write-integrity.md
Spec: none

## Goal & acceptance criteria
Close two pr-self-review HIGH findings in the eval module (plan 09). All eval
writes of one `scoreReviewFixture` call commit or roll back together. `eval_cases`
gets a real uniqueness guarantee on its natural key, and the upsert relies on it.
The existing duplicates are merged by the migration before the index is created.
- AC1: when any `eval_cases`/`eval_runs` write fails mid-loop, the call rejects and **no** row from that call remains (no case, no run, for any agent).
- AC2: `eval_cases` has a unique index `eval_cases_owner_name_idx` on `(workspace_id, owner_kind, owner_id, name)`, created by a `pnpm db:generate` migration.
- AC3: `EvalRepository.upsertEvalCase` is a single `insert … onConflictDoUpdate` on that key, with no SELECT first. Two concurrent upserts of the same key return the same id, and neither throws.
- AC4: a second eval of the same fixture reuses each agent's case: its new `eval_runs` rows point at the same `case_id`, and the `eval_cases` count is unchanged.
- AC5: before the index is created, the migration merges existing duplicates. Per key it keeps the newest case (D2), re-points the other cases' `eval_runs.case_id` to it, then deletes the others. No `eval_runs` row is lost.
- AC6: `EvalService` imports no Drizzle, and the class doc states the transactional guarantee truthfully.

## Decisions needed
| # | Decision | Options | Recommendation | Steps affected |
|---|---|---|---|---|
| D1 | How the dedupe SQL gets into a migration. CLAUDE.md "Do not touch" and `server/docs/architecture.md:226` say migrations are "generated only". | A: `pnpm db:generate --custom --name dedupe_eval_cases` makes an empty, journaled migration stub with its snapshot (drizzle-kit 0.30.6, `bin.cjs:91906` "Prepare empty migration file for custom SQL", `:34424-34426`). The implementer writes the SQL body into **that stub only**, and the DDL migration is generated separately. This is an explicit, one-file exception to "Do not touch", which the user must approve. · B: a one-shot script like `src/db/backfill-run-cost.ts`, run by hand before `db:migrate`. Nothing enforces that order, so on any DB holding duplicates `db:migrate` fails on the index. · C: put the dedupe inside the generated DDL file. This hand-edits a generated file, which is the exact thing the rule forbids. | A — it is the drizzle-kit mechanism for data migrations. The migrator runs it in the same transaction as the index (`drizzle-orm/pg-core/dialect.js:60`), so dedupe and index are atomic. The repo has no prior data migration: no `UPDATE`/`DELETE`/`DO $$` in any `migrations/*.sql`. The only precedent is the script in B. | S1, S5 |
| D2 | What "newest case" means. `eval_cases` has no timestamp column (`schema/eval.ts:7-20`). | A: the case whose latest `eval_runs.ran_at` is greatest. A case with no runs ranks last, and ties go to the highest `id`. · B: the highest `id` only. UUIDs are random, so this is effectively arbitrary. | A — the most recently used case is the one the last eval upserted. | S1 |

<!-- The user's answers are recorded by the main session under ## Decisions recorded. -->

## Decisions recorded
User, 2026-09-30: "D1-A, D2-A, у CLAUDE.md додай". Plan approved by the user on 2026-09-30 ("«так» на план 12"). Status draft → approved → in-progress (G1). Before the plan: duplicates → a (dedupe inside the migration).
- **D1 → A:** the dedupe SQL goes only into the stub made by `pnpm db:generate --custom --name dedupe_eval_cases`. The DDL index migration is generated separately.
- **D2 → A:** "newest" is the case with the latest `eval_runs.ran_at`. A case with no runs ranks last, and ties go to the highest id.
- **Root CLAUDE.md:** the main session added the `--custom`-stub exception to the "Do not touch" migrations line in `AGENTS.md`, the target of the root `CLAUDE.md` symlink. This is outside the implementer's steps.

## Prerequisites
- Docker running (Testcontainers) for the `.it` tests.
- No new dependencies.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S5 | server: db migration → schema → repository → service → docs | — | Last group. Hand the main session: the two migration tags, `DbExecutor` (exported from `src/db/client.ts`), `EvalRepository.transaction(fn)`, and the new test file. |

## Steps

### S1 — Generate the custom dedupe migration stub and write its SQL (before any schema edit)
- **Files:** `server/src/db/migrations/0020_dedupe_eval_cases.sql` (create, via the command) · `server/src/db/migrations/meta/0020_snapshot.json` (create, via the command) · `server/src/db/migrations/meta/_journal.json` (modified by the command only)
- **Change:** with `server/src/db/schema/eval.ts` still unchanged, run `cd server && pnpm db:generate --custom --name dedupe_eval_cases`. drizzle-kit copies the previous snapshot into the custom snapshot (`bin.cjs:21410-21418`), so running it first keeps the index out of 0020. Replace the stub's single comment line with the SQL in *Design notes → Dedupe SQL*: a header comment, then two statements (UPDATE `eval_runs`, then DELETE `eval_cases`). Each statement recomputes the keep-id with the same CTE, and the two are separated by `--> statement-breakpoint`.
- **Layer / why here:** DB migration. Data must be clean before S2's unique index, and the journal order (0020 before 0021) guarantees that. D1 = A.
- **Skills to apply:** `drizzle-orm-patterns`, `postgresql-table-design`
- **Practices:** use only the `--custom` stub, written by hand, and never touch a DDL-generated file. Do not edit `_journal.json` or the snapshot. SQL identifiers match `0000_init.sql:116` (`"eval_cases"`, `"case_id"`, `"ran_at"`). The dedupe is deterministic: `first_value(id) OVER (PARTITION BY workspace_id, owner_kind, owner_id, name ORDER BY last_ran DESC NULLS LAST, id DESC)` (D2 = A). The UPDATE runs before the DELETE, because `eval_runs.case_id` is `ON DELETE CASCADE` (`schema/eval.ts:24-26`) and deleting first would destroy runs. No temp tables: each statement must also run outside a transaction (S5 test).
- **Known gotchas:** keep the `--> statement-breakpoint` separator. The journal has `"breakpoints": true`, and the migrator runs each chunk as one statement. `db:generate` hangs when one diff drops and adds columns → [gotchas: DB & migrations](../../server/insights/gotchas.md#db--migrations). Not triggered here (no column changes), but if the command produces no output, stop and report.
- **Done when:** `jq -r '.entries[-1].tag' server/src/db/migrations/meta/_journal.json` prints `0020_dedupe_eval_cases`. `grep -c 'eval_cases_owner_name_idx' server/src/db/migrations/meta/0020_snapshot.json` prints `0`. The `.sql` file contains `UPDATE "eval_runs"` and `DELETE FROM "eval_cases"` and no DDL.

### S2 — Add the unique index to the schema and generate the DDL migration
- **Files:** `server/src/db/schema/eval.ts` (modify) · `server/src/db/migrations/0021_*.sql` + `meta/0021_snapshot.json` (create, via `pnpm db:generate`) · `meta/_journal.json` (modified by the command only)
- **Change:** give `evalCases` a table callback `(t) => ({ ownerNameUq: uniqueIndex('eval_cases_owner_name_idx').on(t.workspaceId, t.ownerKind, t.ownerId, t.name) })`, and import `uniqueIndex` from `drizzle-orm/pg-core`. Add a one-line comment saying it backs the `onConflictDoUpdate` in `modules/eval/repository.ts`. Then run `cd server && pnpm db:generate`.
- **Layer / why here:** schema is infrastructure. The index is the upsert's conflict target, and Postgres's `ON CONFLICT (cols)` needs a matching non-partial unique index.
- **Skills to apply:** `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`
- **Practices:** use the same callback style as `schema/pulls.ts:33` / `schema/core.ts:46` (object return, `uniqueIndex(name).on(...)`). The index name is exactly `eval_cases_owner_name_idx` (user-fixed). All four columns are `NOT NULL` (`schema/eval.ts:9-14`), so a plain column index is correct, with no `coalesce` and no `NULLS NOT DISTINCT`. The generated migration must contain only `CREATE UNIQUE INDEX "eval_cases_owner_name_idx" ON "eval_cases" …`.
- **Known gotchas:** a nullable column in a unique index stops deduplicating → [gotchas: DB & migrations](../../server/insights/gotchas.md#db--migrations). None of these columns is nullable, so this does not apply; do not add `coalesce`. Migrations are never applied on boot, so do not run `db:migrate` (same link).
- **Done when:** `cd server && pnpm typecheck` passes. The newest `0021_*.sql` has exactly one statement, the `CREATE UNIQUE INDEX` above. If it has anything else, stop and report schema drift instead of editing it. `jq -r '.entries[-2:][].tag' …/_journal.json` lists `0020_dedupe_eval_cases` first.

### S3 — Transaction-capable repository and an atomic upsert
- **Files:** `server/src/db/client.ts` (modify) · `server/src/modules/eval/repository.ts` (modify) · `server/test/eval.it.test.ts` (modify: reuse and concurrency tests only)
- **Change:**
  1. `db/client.ts`: add `export type DbExecutor = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;`, with type-only imports of `PgDatabase` from `drizzle-orm/pg-core` and `PostgresJsQueryResultHKT` from `drizzle-orm/postgres-js`. Doc comment: "a root `Db` or a transaction; what a repository that can join a transaction accepts." Both `Db` (`PostgresJsDatabase extends PgDatabase`, `driver.d.ts:6`) and the tx (`PgTransaction extends PgDatabase`, `pg-core/session.d.ts:38`) are assignable to it.
  2. `EvalRepository`: the constructor takes `DbExecutor` instead of `Db`. Add `transaction<T>(fn: (repo: EvalRepository) => Promise<T>): Promise<T>`, implemented as `this.db.transaction((tx) => fn(new EvalRepository(tx)))`. Its doc says: a throw inside `fn` rolls back every write made through the given repo.
  3. Rewrite `upsertEvalCase` as one `insert(t.evalCases).values({...ownerKind: 'agent'...}).onConflictDoUpdate({ target: [workspaceId, ownerKind, ownerId, name columns], set: { inputMeta, expectedOutput } }).returning({ id })`, then `return row!.id`. Drop the SELECT/UPDATE branch.
  4. In `eval.it.test.ts`, extend `re-running adds eval_runs rows but no new eval_cases rows`: capture the `case_id`s of the first run's `evalRunIds` and assert the rerun's rows carry the same `case_id` per agent. Add `concurrent upserts of one key return one case`: `Promise.all` of two `new EvalRepository(db).upsertEvalCase(...)` with the same key (name `eval-it-concurrent`) resolves to two equal ids, and exactly one `eval_cases` row with that name exists.
- **Layer / why here:** infrastructure. A transaction is a DB concern, so only the repository and `db/` know about `tx`. The repository hands the service a tx-bound copy of itself, which keeps the service Drizzle-free (onion decision framework, rule 2).
- **Skills to apply:** `onion-architecture`, `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`
- **Practices:** `repository.ts` stays the only eval file that imports `drizzle-orm` / `db/schema`. No leaked query builder or `tx` type in any public method signature except the constructor. `onConflictDoUpdate.target` lists the same four columns in the same order as the S2 index. `cli.ts:40-42` and the test's `new EvalRepository(db)` still compile unchanged (`Db` is assignable to `DbExecutor`). Keep the type-only imports as `import type`.
- **Known gotchas:** none of `server/insights/gotchas.md` applies. The hermetic-test rule (Tests section) doesn't bind: the eval flow makes no LLM call (`service.ts:27`).
- **Done when:** `cd server && pnpm typecheck` passes. `rg -n "select\(\{ id: t\.evalCases\.id \}\)" server/src/modules/eval/repository.ts` returns nothing. `cd server && pnpm exec vitest run test/eval.it.test.ts` passes with the two tests above.

### S4 — Run all eval writes in one transaction
- **Files:** `server/src/modules/eval/service.ts` (modify) · `server/test/eval.it.test.ts` (modify: rollback test only)
- **Change:**
  1. Wrap the write loop (`service.ts:120-158`) in `const evalRunIds = await repo.transaction(async (tx) => { … return ids; })`, and make every `upsertEvalCase` / `insertEvalRun` call inside it go through `tx`. All reads and precondition throws stay before the transaction, where they are now. Update the class doc (`:24-27`): every precondition throws before the first write, and all writes run in one transaction, so a failed eval leaves nothing half-written.
  2. Test `a failing write mid-loop leaves no rows`: `class FailSecondInsert extends EvalRepository` overrides `transaction` to call `super.transaction` with a wrapper. The wrapper replaces `insertEvalRun` on the tx repo so that the 2nd call throws `new Error('boom')`, then calls `fn(txRepo)`. Run the service with it on `{ ...fixture, id: 'eval-it-rollback' }`. Two lanes, Security and General, have done runs, so the loop reaches a 2nd insert. Assert that it rejects with `/boom/`, that 0 `eval_cases` rows are named `eval-it-rollback`, and that the `eval_runs` count equals the count before the call.
- **Layer / why here:** application. The service decides which writes form one unit, and the repository supplies the mechanism.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** `service.ts` gains no import of `drizzle-orm`, `db/*` or `postgres`. No `try/catch` around the transaction swallows the error, so the rejection propagates to the CLI. The loop order stays agent order from `suite.agents`, and concurrent evals take row locks in the same order.
- **Known gotchas:** none from `gotchas.md`. The onion `depcruise` gate does not exist here (root `INSIGHTS.md` 2026-09-26), so check edges with `rg` instead (Done when).
- **Done when:** `cd server && pnpm typecheck` passes. `rg -n "drizzle-orm|db/schema|db/client" server/src/modules/eval/service.ts` returns nothing. `cd server && pnpm exec vitest run test/eval.it.test.ts` passes. The rollback test fails if the `repo.transaction` wrapper is removed (the implementer checks this once, locally).

### S5 — Test the dedupe migration; document the transaction and custom-migration patterns
- **Files:** `server/test/eval-cases-dedupe.it.test.ts` (create) · `server/docs/architecture.md` (modify)
- **Change:**
  1. Test, gated like `eval.it.test.ts:10-16` (`dockerAvailable`/`describe.skip`). The test runs `startPg()` (all migrations, including 0020/0021) and `seed(db)`, then takes the seeded default workspace and one agent id. `DROP INDEX eval_cases_owner_name_idx`. Insert 3 cases with one key: A (run at 2026-01-01), B (runs at 2026-01-03 and 2026-01-02), C (no runs). Add one case D with a different `name` and one run. Find the `0020_dedupe_eval_cases.sql` file through `meta/_journal.json`: read the entry whose tag ends in `_dedupe_eval_cases`, resolve its path from the test with `fileURLToPath(new URL('../src/db/migrations/…', import.meta.url))`, split it on `--> statement-breakpoint`, and run each trimmed chunk with `pg.handle.sql.unsafe`. Assert that exactly one case remains for the key and that it is B, that all 3 runs of A and B now have `case_id = B`, that D and its run are untouched, and that `CREATE UNIQUE INDEX eval_cases_owner_name_idx ON eval_cases (workspace_id, owner_kind, owner_id, name)` then succeeds.
  2. `architecture.md` §1 (near the `repository.ts` bullet, `:22`): 2–4 lines on transactions. A repository that must join a transaction takes `DbExecutor` and exposes `transaction(fn)`, which hands `fn` a tx-bound copy of itself. The service calls it, and never sees Drizzle. Reference `modules/eval/repository.ts`. §7 (after `:226-229`): 2–3 lines on data migrations. They go through `pnpm db:generate --custom --name <x>`, generated **before** the schema edit whose DDL depends on them, and only that stub's body is written by hand. Reference `0020_dedupe_eval_cases.sql`.
- **Layer / why here:** test of the S1 SQL, plus documentation of the two patterns this plan introduces. The repo had neither pattern before.
- **Skills to apply:** `typescript-expert`, `postgresql-table-design`
- **Practices:** the test is read-only toward `src/db/migrations/**`. It reads files with `node:fs`, and nothing is written there. It never hard-codes the `0021_*` name. Tier is `.it`, because it needs Postgres (CLAUDE.md naming). The doc lines cite paths and do not restate skill text.
- **Known gotchas:** a test that isn't `.it` runs in the wrong CI lane (CLAUDE.md "Naming").
- **Done when:** `cd server && pnpm exec vitest run test/eval-cases-dedupe.it.test.ts test/eval.it.test.ts` passes. `cd server && pnpm typecheck` passes. `grep -n 'db:generate --custom' server/docs/architecture.md` matches. `grep -n 'DbExecutor' server/docs/architecture.md` matches.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `server/test/eval.it.test.ts` → rerun reuses `case_id` | `.it` | AC4 | S3 |
| `server/test/eval.it.test.ts` → concurrent upserts, one case | `.it` | AC2, AC3 | S3 |
| `server/test/eval.it.test.ts` → failing 2nd insert leaves no rows | `.it` | AC1 | S4 |
| `server/test/eval-cases-dedupe.it.test.ts` | `.it` | AC5, AC2 (index creatable after dedupe) | S5 |
| existing `eval.it.test.ts` cases (head guard, run selection) | `.it` | regression | S3, S4 |

## Migrations & contracts
- `0020_dedupe_eval_cases.sql`: `pnpm db:generate --custom --name dedupe_eval_cases` in S1, **before** the schema edit. Only the body is hand-written (D1).
- `0021_*.sql`: `pnpm db:generate` after S2 (the unique index). Never `db:migrate` in the implementer run.
- The migrator applies both in one transaction (`drizzle-orm/pg-core/dialect.js:60`).
- Contracts: none. `@devdigest/shared` is untouched.

## Out of scope
- An index on `eval_runs.case_id` (FK without index). The tables are tiny. Record it as a follow-up and do not add it.
- Changing `agents.name` ambiguity handling (`service.ts:60`) or any scoring logic in `helpers.ts`.
- Adding `transaction` to any other repository, or to the DI container. `modules/eval` has no container wiring; `cli.ts` is its composition root (`cli.ts:20`).
- Renaming the index to the `_uq` suffix used elsewhere. The user fixed the name.
- Any edit to `0000`–`0019` migrations, snapshots, or the journal by hand.

<!-- implementer-brief:end -->

## Context applied
- `server/insights/gotchas.md` → DB & migrations: "nullable column in a unique index". All 4 key columns are NOT NULL, so no `coalesce` (S2).
- `server/insights/gotchas.md` → "`db:generate` hangs when one diff drops and adds columns". Not triggered; S1 and S2 are separate generate runs anyway (S1, S2).
- `server/insights/gotchas.md` → "Migrations are never applied on boot". No `db:migrate` in the steps (S2).
- Root `INSIGHTS.md` → "2026-09-26 — the onion skill's `depcruise` gate … not real". `rg` edge checks in S4's Done when.
- Root `INSIGHTS.md` → "2026-09-29 — a skill listed on a step where it has nothing to do". `zod`, `fastify-best-practices` and `security` are not listed: no Zod schema, route or trust-boundary input is written.
- `docs/plans/09-review-eval-fixture.md` → AC5 ("re-running never duplicates a case") and S-service Practices ("no half-written eval"). This plan makes both true under failure and concurrency.
- `server/docs/architecture.md:226-229` → "migrations are generated only". This conflicts with a data migration, hence D1 and the S5 doc line.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | Step 0 reading | — |
| `onion-architecture` | preload | S3, S4 | — |
| `drizzle-orm-patterns` | on demand (S1–S3) | S1, S2, S3 | — |
| `postgresql-table-design` | on demand (S1–S3, S5) | S1, S2, S3, S5 | — |
| `typescript-expert` | on demand (S2–S5) | S2, S3, S4, S5 | — |
| `zod`, `fastify-best-practices`, `security` | not loaded | — | no Zod schema, route, or boundary input in this plan |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| server | `src/db/migrations/0020_dedupe_eval_cases.sql` (+ meta) | DB migration (data) | new |
| server | `src/db/migrations/0021_*.sql` (+ meta) | DB migration (DDL) | new |
| server | `src/db/schema/eval.ts` | infrastructure (schema) | changed |
| server | `src/db/client.ts` | infrastructure | changed (`DbExecutor` type) |
| server | `src/modules/eval/repository.ts` | infrastructure | changed |
| server | `src/modules/eval/service.ts` | application | changed |
| server | `test/eval.it.test.ts`, `test/eval-cases-dedupe.it.test.ts` | tests | changed / new |
| server | `docs/architecture.md` | docs | changed |

## Design notes

### Dedupe SQL (S1, D2 = A)
The CTE is recomputed in each statement, so the file needs no temp table and works both inside the migrator's transaction and statement-by-statement in the S5 test. The UPDATE moves every run onto the keep row, so when the DELETE recomputes the CTE, that row still ranks first (it now holds the latest run), and the other cases have no runs. If a key has no runs at all, `id DESC` decides the same way both times.

```sql
-- Merge duplicate eval_cases per (workspace_id, owner_kind, owner_id, name) before
-- 0021 adds the unique index. Keeps the case with the latest eval_runs.ran_at
-- (no runs ranks last, ties by id), re-points the others' eval_runs, deletes the rest.
WITH ranked AS (
  SELECT c."id",
         first_value(c."id") OVER (
           PARTITION BY c."workspace_id", c."owner_kind", c."owner_id", c."name"
           ORDER BY r.last_ran DESC NULLS LAST, c."id" DESC
         ) AS keep_id
  FROM "eval_cases" c
  LEFT JOIN (SELECT "case_id", max("ran_at") AS last_ran FROM "eval_runs" GROUP BY "case_id") r
    ON r."case_id" = c."id"
)
UPDATE "eval_runs" er SET "case_id" = ranked.keep_id
FROM ranked WHERE er."case_id" = ranked."id" AND ranked."id" <> ranked.keep_id;
--> statement-breakpoint
WITH ranked AS ( /* identical CTE */ )
DELETE FROM "eval_cases" c USING ranked
WHERE c."id" = ranked."id" AND ranked."id" <> ranked.keep_id;
```
(The implementer writes the CTE out in full in both statements. `/* identical CTE */` is shorthand for this plan only.)

### Transaction pattern (S3, S4)
`EvalRepository.transaction(fn)` → `db.transaction(tx => fn(new EvalRepository(tx)))`. This is the first `.transaction(` in `server/src`: `rg '\.transaction\(' server/src --glob '!server/clones/**'` finds none today. Alternatives rejected:
- Pass `tx` into each repository method: this leaks a Drizzle type into the service signature, which breaks onion rule 2.
- A unit-of-work port in `@devdigest/shared`: this is a contract change for one module, and too heavy now.

When calling `transaction` on a tx-bound repo, Drizzle opens a savepoint, so the pattern nests.

### Why reads stay outside the transaction
The preconditions and run selection only read. Holding a transaction open across them buys nothing for AC1 and lengthens lock time. (This is a design choice, not a product choice.)

## Risks & open questions
- **D1 waives a "Do not touch" rule** for one file. If the user rejects A, the fallback is B: a script plus a manual "run before migrate" step. In that case AC5 is no longer enforced by `db:migrate`.
- **Doc vs code:** `server/docs/architecture.md:226` says migrations are "generated only", and CLAUDE.md lists `migrations/**` as generated. After D1=A, S5 updates architecture.md. CLAUDE.md (root) is not a symlink target this plan may touch, so the main session decides whether to add a line there.
- **Schema drift:** if `pnpm db:generate` in S2 emits statements beyond the index, the snapshots and schema had already drifted. The implementer stops, and the main session decides.
- **Kept content:** the old upsert updated whichever duplicate `SELECT … LIMIT 1` returned (no ORDER BY, `repository.ts:160-164`). The kept "newest" row (D2) may therefore hold an older `expected_output`. The next eval run overwrites it through `onConflictDoUpdate`. This is acceptable, and the effect is noted.
- **Index naming:** the repo's unique indexes use `_uq` (`schema/pulls.ts:33`, `core.ts:46`, `knowledge.ts:141`), while CLAUDE.md says `<table>_<scope>_idx`. The user fixed `eval_cases_owner_name_idx`.
- No external research needed.

## Handed off
- architecture-reviewer: the `DbExecutor` type and the `repository.transaction(fn)` pattern (`db/client.ts`, `modules/eval/repository.ts`) set a precedent for other modules. Check that the service stays Drizzle-free.
- security review: none. There is no new input surface; the migration SQL takes no parameters.

## Insights to record
- `server/INSIGHTS.md` · Codebase Patterns — the first DB transaction: a repository takes `DbExecutor` and exposes `transaction(fn)` handing a tx-bound copy (`modules/eval/repository.ts`). Record after implementation.
- `server/INSIGHTS.md` · Tool & Library Notes — `pnpm db:generate --custom` copies the **previous** snapshot (`drizzle-kit/bin.cjs:21410-21418`). Generate it before the schema edit whose DDL depends on it, or run order and snapshots disagree. The migrator runs all pending migrations in one transaction (`drizzle-orm/pg-core/dialect.js:60`).

## Red-flags check
- [x] Every AC maps to at least one step or test (AC1 S4 · AC2 S2/S3 · AC3 S3 · AC4 S3 · AC5 S1/S5 · AC6 S4)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; product choices are in *Decisions needed* (D1, D2)
- [x] Groups end type-checking; parallel groups share no file (single group)
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1: n/a (single pass)
- [x] Every step's *Skills to apply* is complete (the implementer reads only those)

## Handoffs → verification (after G1)
From the G1 implementer run (2026-09-30), status **partial**:
- S2–S5 done. Files: `server/src/db/schema/eval.ts`; `migrations/0021_unique_veda.sql` plus its snapshot and journal entry (the single `CREATE UNIQUE INDEX`); `server/src/db/client.ts` (`DbExecutor`); `modules/eval/repository.ts` (`transaction(fn)`, `onConflictDoUpdate`); `modules/eval/service.ts`; `test/eval.it.test.ts`; `test/eval-cases-dedupe.it.test.ts` (new); `server/docs/architecture.md`.
- S1 partial: `pnpm db:generate --custom --name dedupe_eval_cases` created the `0020` stub, snapshot and journal entry. The auto-mode permission check then denied the implementer's write of the SQL body ("Modify Shared Resources"). The implementer did not retry by another route.
- Skills deviation: `postgresql-table-design` and `typescript-expert` were not read in full.
- Testcontainers env note: the implementer needed `TESTCONTAINERS_RYUK_DISABLED=true`; the main session's runs did not.

### Skills (G1)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S3, S4 | |
| `drizzle-orm-patterns` | on demand (head only) | S1, S2, S3 | |
| `postgresql-table-design` | not read | — | implementer skipped it (deviation) |
| `typescript-expert` | not read | — | implementer skipped it (deviation) |

## Verification log
### Wave 1 (2026-09-30)
- **Main-session fix: S1**, done on the user's explicit instruction ("План 12. Зроби сам"). The main session wrote the *Design notes → Dedupe SQL* body into `server/src/db/migrations/0020_dedupe_eval_cases.sql`, with the CTE in full in both statements and `--> statement-breakpoint` between them. Done-when: the journal's last two tags are `0020_dedupe_eval_cases`, `0021_unique_veda`; `grep -c eval_cases_owner_name_idx meta/0020_snapshot.json` prints `0`; `eval-cases-dedupe.it` 1/1 ✅; `eval.it` 6/6 ✅.
- Full server suite (main session, with plan 13's changes also in the tree): `pnpm test` gives 54 files / 533 tests, exit 0, including all `.it` files.
- plan-verifier (Wave 1): **incomplete**: 56/63 met. The code meets every AC, step, Done-when, test and migration check (7/7 `.it`, journal/snapshot chain verified with `jq -S`). The gaps are SK1–SK5 only: `postgresql-table-design` and `typescript-expert` were not read for S1–S5. These go to fix mode: read the skills, re-check each step, and change code only where a rule is violated. Needs sign-off: R3 (untracked plan file), R4 (no test-writer run). The `AGENTS.md` edit is the main session's D1 decision, as recorded.
- **Fix mode SK1–SK5 (2026-09-30):** implementer done, no code changed. It read `postgresql-table-design` and `typescript-expert` in full and re-checked every listed step/skill pair; no rule was violated (details in its report). Corrected skills table, which replaces *Skills (G1)* above for verification:

| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S3, S4 | |
| `drizzle-orm-patterns` | on demand (head only) | S1, S2, S3 | |
| `postgresql-table-design` | on demand (fix run, full) | S1, S2, S3, S5 | |
| `typescript-expert` | on demand (fix run, full) | S2, S3, S4, S5 | |
- plan-verifier (delta, SK1–SK5): **complete — needs sign-off**: 61/63 met, no gaps, no code changed since Wave 1 (checked by mtime; only plan 13's `llm-call.ts` is newer). Needs sign-off: R3, R4, both pending the user.

### Sign-off (2026-09-30)
User: "R3 підтверджую, R4 приймаю для 12 і 13".
- R3 signed off: after approval, only the main session edited this plan file (Status, Decisions recorded, handoffs, Verification log).
- R4 accepted: no test-writer run for this plan.

### Final (2026-09-30)
Verification complete — needs sign-off. The user signed off R3 and accepted R4. Status → `done`.
