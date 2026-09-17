# Insights — `@devdigest/e2e`

Append-only, newest first. Things that cost someone time in the browser suite.
Repo-wide findings go in [`../INSIGHTS.md`](../INSIGHTS.md), which also carries
the entry format and the promotion rule (a recurring entry becomes one line under
`Gotchas` in `e2e/CLAUDE.md`).

```md
## YYYY-MM-DD — short title
**Symptom:** what you observed.
**Cause:** why it happened.
**Rule:** what to do from now on.
```

---

## 2026-09-17 — flows 02/04/05 fail locally but pass in CI

**Symptom:** the suite is green in CI and red on a developer machine, failing on
a `wait --text` for the seeded PR.
**Cause:** those flows follow the home redirect to the *first* repo, so they
assume the seeded demo repo is the only one. CI seeds an empty database; a dev
database usually has other imported repos.
**Rule:** run `./scripts/e2e.sh` — it brings up an isolated, freshly-seeded stack
on alternate ports. Do **not** "fix" this with `docker compose down -v`: that
deletes the `devdigest_pgdata` volume and every repo and review you imported.
