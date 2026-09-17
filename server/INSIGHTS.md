# Insights — `@devdigest/api`

Append-only, newest first. Things that cost someone time in the server package.
Repo-wide findings go in [`../INSIGHTS.md`](../INSIGHTS.md), which also carries
the entry format and the promotion rule (a recurring entry becomes one line under
`Gotchas` in `server/CLAUDE.md`).

```md
## YYYY-MM-DD — short title
**Symptom:** what you observed.
**Cause:** why it happened.
**Rule:** what to do from now on.
```

---

## 2026-09-17 — `relation "…" does not exist` on a fresh checkout

**Symptom:** the API boots, then every DB-backed route 500s with a missing-relation
error.
**Cause:** the server deliberately does not migrate on boot, so a fresh database
has no tables.
**Rule:** run `pnpm db:migrate` after cloning and after any pull that adds a
migration. `pnpm db:seed` afterwards is idempotent.
