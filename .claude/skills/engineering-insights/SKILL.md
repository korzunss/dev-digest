---
name: engineering-insights
description: "Reads and writes the per-package INSIGHTS.md files of this repo — the accumulated session knowledge. Use it at the START of any task, before planning or editing, to load what previous sessions learned about the module in question; and again at the END, to append a non-obvious finding. Trigger on: a symptom that took real effort to explain, an approach abandoned, a repo convention or dependency quirk discovered, a wrap-up request. Covers routing a finding to the right INSIGHTS.md, the fixed section layout, the duplicate check, and the quality gate that keeps entries specific."
---

# Engineering Insights

`INSIGHTS.md` is what previous sessions left for this one. **Read it before the
work, write to it after.** Append-only: add entries, never rewrite or delete.

See `entry-quality.md` for the entry template, good/bad pairs from this repo, and
the pruning rules.

## Step 0 — Read, before anything else

As soon as the user's request names a module or a file — and **before** planning,
searching, or editing — read in full:

1. the `INSIGHTS.md` of the package the work lands in (routing table in Step 2),
2. the root `INSIGHTS.md`.

If the request touches two packages, read both files. Then state in one or two
lines the entries that bear on this task, or say plainly that none do. Naming
them is the proof the file was actually read; treat them as high-confidence
guidance unless the code says otherwise.

## When to capture

- **As you go** — the moment something costs real effort: code that looks correct
  and behaves otherwise, an approach abandoned, a dependency quirk, a convention
  discovered only by reading the code.
- **Wrap-up** — at the end of a task that involved a problem, a decision, or a
  discovery.

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

**Writing nothing is a correct outcome.** Most sessions produce no entry. If the
session turned up nothing that clears the gate, say "no new insight" and stop —
do not manufacture one to show the skill ran, and do not add a Session Note that
only restates the task.

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

## Step 4 — Check the file before writing to it

Never append blind. Re-read the target file (if Step 0 was skipped, read it now)
and `grep` it for the subject and for the names in the evidence.

- **Already there in substance → write nothing.** Same lesson in different words
  is still the same lesson. Say it's already recorded and point at the entry.
- Related and still true, but the new finding adds something → extend that entry
  rather than adding a near-copy beside it.
- Related but now wrong → leave it, append a **correction with today's date**
  naming what changed. Never edit history.
- Nothing related → append.

## Step 5 — Append without touching anything else

**Never use Write on an `INSIGHTS.md`.** Write replaces the whole file, and one
truncated response loses every entry in it. Use Edit — an exact-string
replacement that fails loudly instead of silently clobbering.

Entries go newest-first **within** their section, so the insertion point is the
section heading. Two cases, both anchored on text that is unique in the file:

*Empty section* — replace the placeholder, and only the placeholder:

```
old: ## What Doesn't Work\n\n_Nothing yet._
new: ## What Doesn't Work\n\n### 2026-09-17 — …\n**Symptom:** …
```

*Section that already has entries* — anchor on the heading plus the first line of
the current newest entry, and put the new one above it. Never paste the older
entry's body into `new_string`; keep the anchor to its `###` title line:

```
old: ## Recurring Errors & Fixes\n\n### 2026-09-17 — flows 02/04/05 fail locally
new: ## Recurring Errors & Fixes\n\n### 2026-09-20 — …\n**Symptom:** …\n\n### 2026-09-17 — flows 02/04/05 fail locally
```

The entry itself:

```md
### YYYY-MM-DD — short title, as a symptom or an imperative
**Symptom:** what was observed.
**Cause:** why it happened.
**Rule:** what to do from now on. Omit if there's nothing to generalize.
**Evidence:** `path/to/file.ts:42` · command · error string
```

Then **verify the append was additive.** Count before you edit and after:

```sh
grep -c '^### ' <file>   # must go up by exactly 1
wc -l < <file>           # must go up, never down
git diff --numstat -- <file>   # deletions: 0, or 1 if you dropped a placeholder
```

If a count moved the wrong way, something was overwritten: restore the file
(`git checkout -- <file>`, or `git diff` to see what vanished and put it back)
and redo the edit with a narrower anchor. Report it — a silent re-append on top
of a damaged file is worse than the original mistake.

Editing an existing entry is allowed in exactly one place: Step 4's "extend".
Even then you add lines to it — you never delete or reword what is already there.

## Step 6 — Promote a standing rule

When an entry has been hit a third time, or has hardened into a rule everyone
must follow, add a **one-line** version under `Gotchas` in that package's
`CLAUDE.md` and leave the full write-up in `INSIGHTS.md`. That keeps `CLAUDE.md`
short without losing the reasoning.

## The two halves are not optional in the same way

Step 0 runs on **every** task in a package — the cost of reading is a few hundred
tokens, the cost of skipping it is repeating a solved problem. Steps 1–6 run only
when the session produced something that clears the gate, which is the minority
of sessions.
