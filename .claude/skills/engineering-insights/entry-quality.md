# Entry quality

Contents: the template · good vs bad · one example per section · keeping the
files lean.

## The template

```md
### YYYY-MM-DD — short title, as a symptom or an imperative
**Symptom:** what was observed.
**Cause:** why it happened.
**Rule:** what to do from now on. Omit if there's nothing to generalize.
**Evidence:** `path/to/file.ts:42` · command · error string
```

`Symptom` and `Evidence` are mandatory — they are what makes the entry checkable
later. `Cause` may be "working as designed". Titles are searchable: write the
words someone would `grep` for when they hit it again.

## Good vs bad

The test: **if it would be obvious to anyone reading the code, don't write it.**

| ✗ Noise | ✓ Entry |
|---|---|
| "Grounding can drop findings." | "Findings vanish between the model response and the stored review: `groundFindings()` drops any finding not citing a line present in the diff, and the score is recomputed from the survivors. Inspect `groundingSummary()` before suspecting the model or the transport. — `reviewer-core/src/grounding.ts`" |
| "Be careful with the test setup." | "A DB-backed test without the `.it.test.ts` suffix is silently skipped by the CI split (`vitest run --exclude '**/*.it.test.ts'`), so it passes locally and never runs in CI. Any test touching Postgres must carry that suffix. — `server/AGENTS.md`, `server/test/helpers/pg.ts`" |
| "Watch out for package managers." | "`npm install` in `client/` or `server/` rewrites a pnpm lockfile and breaks the next install. `client/` and `server/` are pnpm; `reviewer-core/` and `e2e/` are npm. Match the lockfile in the folder." |
| "E2E tests are flaky." | "Flows 02/04/05 pass in CI and fail locally: they follow the home redirect to the *first* repo and assume the seeded demo repo is the only one. Run `./scripts/e2e.sh` (isolated, freshly seeded). Do **not** `docker compose down -v` — that deletes `devdigest_pgdata` and every imported repo." |

What the good column has that the bad one doesn't: a symptom you can recognize,
the mechanism, a named file or command, and a decision the reader can act on.

## One example per section

- **What Works** — "Swapping an adapter in tests through `platform/container.ts`
  with `adapters/mocks.ts` beats stubbing the module: the DI container is the
  only seam the services go through."
- **What Doesn't Work** — "Keyword-scanning untrusted diff content for injection
  attempts: a denylist only ever catches one phrasing. `INJECTION_GUARD`
  appended to the system prompt is the whole defense — don't add parsing next to it."
- **Codebase Patterns** — "Contracts change in `server/src/vendor/shared` first,
  then get mirrored to `client/src/vendor/shared`. Editing the client copy alone
  typechecks and breaks at runtime."
- **Tool & Library Notes** — "`pnpm db:generate` writes both the migration and
  the journal entry; hand-editing `server/src/db/migrations/**` desyncs them."
- **Recurring Errors & Fixes** — "`relation \"…\" does not exist` on a fresh
  checkout: the server never migrates on boot. Run `pnpm db:migrate`, then
  `pnpm db:seed` (idempotent)."
- **Session Notes** — "2026-09-17 — Added the SSE progress channel to the review
  module. Learned that the shared error handler must be registered before module
  plugins or SSE errors serialize as JSON and break the stream."
- **Open Questions** — "Does the map-reduce path in `review/reduce.ts` need its
  own grounding pass, or does the single-pass gate already cover it? Unverified."

## Keeping the files lean

- **Append-only.** Corrections are new, dated entries that name what changed. The
  old entry stays — knowing a rule *used to* hold is itself information.
- **Conflicts get resolved, not accumulated.** Two entries that contradict each
  other are worse than neither: append a third that states which one holds now.
- **Promotion.** A rule everyone must follow becomes one line under `Gotchas` in
  that package's `AGENTS.md`; the full write-up stays here.
- **Size.** Past roughly 200 entries in one file, signal drops. Prune on a
  quarterly pass: drop what the code no longer permits, merge duplicates, and
  delete Session Notes whose lesson was already promoted.
- **These files are a draft under review.** They're committed and diffable on
  purpose — a wrong summary is caught in the PR, not months later.
