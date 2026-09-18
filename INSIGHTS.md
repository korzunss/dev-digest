# Insights — repo-wide

An append-only log of things that cost someone time. Package-local findings go in
that package's `INSIGHTS.md`; this file is for what crosses package boundaries —
two or more packages, the `shared` contracts, `scripts/`, Docker, CI.

**How to use it.** Write an entry when a symptom took more than a few minutes to
explain — especially when the code looks correct and behaves otherwise. The
`engineering-insights` skill routes a finding to the right file, picks the
section, and enforces the quality gate; run it at the end of a task, or write the
entry by hand in the same format.

**Sections.** Every `INSIGHTS.md` in this repo carries the same seven, in the same
order. Entries go newest-first **within** their section.

| Section | What belongs there |
|---|---|
| What Works | An approach that succeeded and should be reused here |
| What Doesn't Work | A dead end or antipattern — the most valuable section |
| Codebase Patterns | A convention or architectural decision, with the reason |
| Tool & Library Notes | A quirk of a dependency, CLI, or the local toolchain |
| Recurring Errors & Fixes | A symptom that will be seen again, and its fix |
| Session Notes | Dated wrap-up: what changed and what it taught |
| Open Questions | Left unresolved, phrased so someone can pick it up |

**Entry format.**

```md
### YYYY-MM-DD — short title in the imperative or as a symptom
**Symptom:** what you actually observed.
**Cause:** why it happened.
**Rule:** what to do from now on. Omit if there's nothing to generalize.
**Evidence:** `path/to/file.ts:42` · command · error string
```

**Append-only.** Never rewrite or delete an entry. An entry that has gone stale
gets a new, dated correction naming what changed.

**Promotion.** When an entry hardens into a standing rule, promote a **one-line**
version into the `Gotchas` section of the relevant `CLAUDE.md` and leave the full
write-up here. That keeps `CLAUDE.md` short without losing the reasoning.

---

## What Works

_Nothing yet._

## What Doesn't Work

### 2026-09-17 — the two vendored `shared` copies are not actually in sync

**Symptom:** on a clean checkout, `diff -r server/src/vendor/shared
client/src/vendor/shared` returns a long diff. The client copy has no
`'openrouter'` in the provider enums (`eval-ci.ts`, `productionize.ts`,
`knowledge.ts`), no `AgentManifest`, no `sessionId` on `StructuredRequest`, and
several adapter methods missing.
**Cause:** the copies drifted over past features. `CLAUDE.md`'s "keep them in
sync" reads like a statement of fact, but it is an instruction about *your own*
change — it was never true of the files as a whole.
**Rule:** mirror the specific edit into the client copy by hand (or a targeted
script that replaces exact strings). Never `cp`/`cp -r` the server's `shared`
over the client's: that drags in server-only contracts and provider ids the
client deliberately doesn't have, turning a one-field change into an unreviewed
bulk rewrite. Verify with a `diff` scoped to the fields you touched, never with
whole-file equality — that check is red today and will stay red.
**Evidence:** `diff -r server/src/vendor/shared client/src/vendor/shared` ·
`client/src/vendor/shared/adapters.ts` → `LLMProvider.id` is
`'openai' | 'anthropic'` where the server's is `… | 'openrouter'`

## Codebase Patterns

### 2026-09-17 — searches return duplicate hits from `server/clones/`

**Symptom:** grep and file searches surface two or three copies of the same
file, some of them stale.
**Cause:** `server/clones/` holds checkouts of every imported repo, and one of
the imported repos is DevDigest itself — so the tree contains full copies of this
codebase.
**Rule:** exclude `server/clones/**` from every search. Never edit a file under
that path; it's runtime data, and the next resync overwrites it.
**Evidence:** `CLAUDE.md` → "Do not touch"; `.gitignore` → `clones/`

## Tool & Library Notes

_Nothing yet._

## Recurring Errors & Fixes

### 2026-09-17 — `TS2719: Two different types with this name exist` after adding a contract field

**Symptom:** adding a required field to a Zod contract in `shared` makes
`pnpm typecheck` fail in a *test* file with `TS2719: Type '{…}' is not assignable
to type '{…}'. Two different types with this name exist, but they are unrelated.`
The message points at a fixture factory and suggests a duplicated type or a
broken path alias — both wrong.
**Cause:** the factory is `function run(o: Partial<T>): T { return { ...defaults,
...o } }`. The new key exists only in the `Partial`, so the spread types it
`X | undefined` while the return type demands `X | null`. The follow-up line is
the real one: `Types of property 'cost_usd' are incompatible … 'undefined' is not
assignable to type 'number | null'`.
**Rule:** when TS2719 names a fixture factory right after a contract change, add
the new key to the factory's defaults literal. Don't go looking for a second copy
of the type or a tsconfig `paths` problem.
**Evidence:** `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx:16`

## Session Notes

_Nothing yet._

## Open Questions

_Nothing yet._
