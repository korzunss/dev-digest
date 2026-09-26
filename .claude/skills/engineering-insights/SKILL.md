---
name: engineering-insights
description: "Reads and writes the per-package INSIGHTS.md files of this repo — the accumulated session knowledge — and keeps each package's insights/gotchas.md (the current rules distilled from it) in step. Use it at the START of any task, before planning or editing, to load what previous sessions learned about the module in question; and again at the END, to append a non-obvious finding. Trigger on: a symptom that took real effort to explain, an approach abandoned, a repo convention or dependency quirk discovered, a wrap-up request. Covers routing a finding to the right INSIGHTS.md, the fixed section layout, the duplicate check, the quality gate that keeps entries specific, and updating gotchas.md."
---

# Engineering Insights

`INSIGHTS.md` is what previous sessions left for this one. **Read it before the
work, write to it after.** Append-only: add entries, never rewrite or delete.

See `entry-quality.md` for the entry template, good/bad pairs from this repo, the
gotchas item format, and the pruning rules.

## Three files, three jobs

| File | What it is | How it changes |
|---|---|---|
| `<pkg>/INSIGHTS.md` (+ root `INSIGHTS.md`) | **The log.** Full write-ups: symptom → cause → rule → evidence | Append-only (Step 5). Never rewritten |
| `<pkg>/insights/gotchas.md` | **The current rules.** One item per rule still in force, grouped by topic, each linking to its log entry | Edited in place (Step 5b): items are added, corrected, removed |
| `<pkg>/AGENTS.md` → `Gotchas` | **The every-session minimum.** A few one-liners loaded into every session | Promotion only (Step 6) |

A rule flows one way: log → gotchas → `AGENTS.md`. Nothing appears in
`gotchas.md` without a log entry behind it, and nothing is promoted to
`AGENTS.md` without being in `gotchas.md` first. There is no root `gotchas.md`:
cross-package rules stay in the root `INSIGHTS.md`.

## Step 0 — Read, before anything else

As soon as the user's request names a module or a file — and **before** planning,
searching, or editing — read, in this order:

1. `insights/gotchas.md` of the package the work lands in (routing table in
   Step 2) — the short list of rules in force;
2. that package's `INSIGHTS.md`, in full — the reasoning and the history;
3. the root `INSIGHTS.md`, in full.

If the request touches two packages, read both packages' files. Then state in one or two
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

Never write: a replay of what you did, a restatement of `AGENTS.md`, a generic
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
cross-package finding — root. The same row also names the `insights/gotchas.md`
that Step 5b updates (`client/insights/gotchas.md`, …); a root entry has none.

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

## Step 5b — Bring `insights/gotchas.md` in step

Run this after every append to a **package** `INSIGHTS.md` whose entry carries a
`**Rule:**` line, and after every dated correction. (Root entries have no
gotchas file — skip.) Item format and topics: `entry-quality.md` → *The gotchas
file*.

- **New rule** → add one item under its topic heading, linking to the new entry.
- **Correction of an older entry** → edit the item that links to the old entry:
  reword the rule to what holds now and point the link at the correction. Never
  keep two items that contradict each other.
- **Rule no longer holds** (the correction says so) → delete the item. The
  history stays in `INSIGHTS.md`; that is what the log is for.
- **Already covered** by an item → leave it, or tighten its wording.

Then update the `Last reconciled with ../INSIGHTS.md:` date at the top. Unlike
`INSIGHTS.md`, this file *is* edited in place — use Edit anchored on the item or
the heading, never Write over the whole file. If the file does not exist yet,
create it from the template in `entry-quality.md`.

## Step 6 — Promote a standing rule

When a rule has been hit a third time, or has hardened into something everyone
must follow, add a **one-line** version under `Gotchas` in that package's
`AGENTS.md`. The rule must already be an item in `insights/gotchas.md`; the full
write-up stays in `INSIGHTS.md`. That keeps `AGENTS.md` short without losing the
reasoning.

## The two halves are not optional in the same way

Step 0 runs on **every** task in a package — the cost of reading is a few hundred
tokens, the cost of skipping it is repeating a solved problem. Steps 1–6 (with
5b) run only when the session produced something that clears the gate, which is
the minority of sessions.
