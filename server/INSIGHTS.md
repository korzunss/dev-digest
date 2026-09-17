# Insights — `@devdigest/api`

Append-only. Things that cost someone time in the server package. Repo-wide
findings go in [`../INSIGHTS.md`](../INSIGHTS.md), which carries the entry format,
the section guide and the promotion rule (a standing rule becomes one line under
`Gotchas` in `server/CLAUDE.md`). The `engineering-insights` skill writes here.

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

_Nothing yet._

## Tool & Library Notes

_Nothing yet._

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
