---
name: engineering-insights
description: "Captures non-obvious engineering findings into the per-package INSIGHTS.md files of this repo. Use when a symptom took real effort to explain, when an approach failed or was abandoned, when a repo convention or dependency quirk surfaces, and as a wrap-up at the end of any non-trivial task. Covers routing a finding to the right INSIGHTS.md, the fixed section layout, the duplicate check, and the quality gate that keeps entries specific."
---

# Engineering Insights

Turn what this session actually learned into an entry in the right `INSIGHTS.md`.
**Append-only:** add entries, never rewrite or delete existing ones.

See `entry-quality.md` for the entry template, good/bad pairs from this repo, and
the pruning rules.

## When to capture

- **As you go** — the moment something costs real effort: code that looks correct
  and behaves otherwise, an approach abandoned, a dependency quirk, a convention
  discovered only by reading the code.
- **Wrap-up** — at the end of any task that involved a problem, a decision, or a
  discovery. Trivial edits get nothing.

Neither trigger is guaranteed to fire on its own — if the user asks for a wrap-up,
or a session ends with something worth recording, run this skill explicitly.

## Step 1 — Apply the gate

An entry is written **only if all three hold**:

1. **Non-obvious.** If anyone reading the code would already know it, don't write it.
2. **Evidenced.** It cites `file:line`, an error string, or a command — not a memory.
3. **Actionable cold.** A future agent reads it and knows what to do, without
   re-investigating.

Never write: a replay of what you did, a restatement of `CLAUDE.md`, a generic
best practice, or an entry whose rule is "be careful".

## Step 2 — Route it to one file

The target follows the files the task touched — check with `git diff --name-only`
(plus `git status`), not from memory.

| Touched | Target |
|---|---|
| only `client/**` | `client/INSIGHTS.md` |
| only `server/**` | `server/INSIGHTS.md` |
| only `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| only `e2e/**` | `e2e/INSIGHTS.md` |
| two or more packages, `*/src/vendor/shared`, `scripts/`, `docker-compose.yml`, CI | `INSIGHTS.md` (repo root) |

One finding goes in **one** file. If it feels like it belongs in two, it's a
cross-package finding — root.

Never read or write anything under `server/clones/**`: it holds checkouts of
imported repos, including a copy of this one.

## Step 3 — Pick the section

Each file carries these seven, in this order:

| Section | What belongs there |
|---|---|
| What Works | An approach that succeeded and should be reused here |
| What Doesn't Work | A dead end or antipattern — **the highest-value section, don't skip it** |
| Codebase Patterns | A convention or architectural decision, with the reason |
| Tool & Library Notes | A quirk of a dependency, CLI, or the local toolchain |
| Recurring Errors & Fixes | A symptom that will be seen again, and its fix |
| Session Notes | Dated wrap-up: what changed and what it taught, 2–4 lines |
| Open Questions | Something left unresolved, phrased so it can be picked up |

## Step 4 — Check for a duplicate first

`grep` the target file for the subject before appending.

- Nothing related → append.
- Related and still true → extend that entry instead of adding a near-copy.
- Related but now wrong → leave it, append a **correction with today's date**
  naming what changed. Never edit history.

## Step 5 — Append

Newest first **within the section**. Drop the `_Nothing yet._` placeholder when
you fill an empty section. Template and worked examples: `entry-quality.md`.

```md
### YYYY-MM-DD — short title, as a symptom or an imperative
**Symptom:** what was observed.
**Cause:** why it happened.
**Rule:** what to do from now on. Omit if there's nothing to generalize.
**Evidence:** `path/to/file.ts:42` · command · error string
```

## Step 6 — Promote a standing rule

When an entry has been hit a third time, or has hardened into a rule everyone
must follow, add a **one-line** version under `Gotchas` in that package's
`CLAUDE.md` and leave the full write-up in `INSIGHTS.md`. That keeps `CLAUDE.md`
short without losing the reasoning.

## Reading, not just writing

Before working in a package, read its `INSIGHTS.md` plus the root one, and state
the two or three entries relevant to the task at hand. Treat them as
high-confidence guidance unless the code says otherwise.
