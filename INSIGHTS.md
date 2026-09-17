# Insights — repo-wide

An append-only log of things that cost someone time. Newest first. Package-local
findings go in that package's `INSIGHTS.md`; this file is for what crosses
package boundaries.

**How to use it.** Write an entry when a symptom took more than a few minutes to
explain — especially when the code looks correct and behaves otherwise. When an
entry hardens into a standing rule, promote a **one-line** version of it into the
`Gotchas` section of the relevant `CLAUDE.md` and leave the full write-up here.
That keeps `CLAUDE.md` short without losing the reasoning.

**Entry format.**

```md
## YYYY-MM-DD — short title in the imperative or as a symptom
**Symptom:** what you actually observed.
**Cause:** why it happened.
**Rule:** what to do from now on. Omit if there's nothing to generalize.
```

---

## 2026-09-17 — searches return duplicate hits from `server/clones/`

**Symptom:** grep and file searches surface two or three copies of the same
file, some of them stale.
**Cause:** `server/clones/` holds checkouts of every imported repo, and one of
the imported repos is DevDigest itself — so the tree contains full copies of this
codebase.
**Rule:** exclude `server/clones/**` from every search. Never edit a file under
that path; it's runtime data, and the next resync overwrites it.
