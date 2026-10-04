# docs/ideas/ — Idea briefs

An idea brief answers **whether** and **what** — is this worth building at all,
and which of several substantively different approaches. That is narrower than
a spec (**what and why**, once building is decided) and narrower still than a
Development Plan (**how**, once one approach is chosen).

| | `docs/ideas/` | `specs/` | `docs/plans/` |
|---|---|---|---|
| Answers | *whether* / *what* — is it worth it, which approach | *what* and *why* | *how* |
| Written by | the `brainstormer` agent (brief), saved by the main session | the `spec-creator` agent | the `planner` agent |
| Lifetime | a record of one comparison, kept even when killed | describes the feature for as long as it exists | a record of one piece of work |

An idea brief never lists implementation steps. Once an option is chosen, the
`spec-creator` (then the `planner`) reads the brief and turns the chosen option into a spec and a plan. After the spec is approved the main session asks whether to run research (default yes); the spec becomes `implemented` when its plan becomes `done` (a `complete` verification, or `complete — needs sign-off` once the user has accepted the listed items) (see `AGENTS.md`).

## Naming

`NN-kebab-name.md` — `NN` is the next free two-digit number in this folder,
found with `Glob`. The number is the order briefs were created in, nothing more.

## Save rule

The `brainstormer` agent is read-only: it returns a brief, it saves nothing.
Right after every run — **including a `kill` verdict** — the main session:

1. saves the brief **verbatim** to `docs/ideas/NN-kebab-name.md`;
2. adds only a `Status:` line and a `## Choice recorded` section — nothing else
   in the brief's text changes;
3. adds the brief's row to the *Index* below.

Killed ideas stay indexed on purpose: the `brainstormer`'s grounding read
checks this index, so a killed idea is not proposed again without a reason to
revisit it.

A correction round re-runs the `brainstormer` with the saved brief's path; it
returns only the changed sections, which the main session applies to the same
file — never a new one.

## Lifecycle

```md
# Idea brief: <title>
Status: open
Save as: docs/ideas/NN-kebab-name.md
```

| Status | Meaning |
|---|---|
| `open` | Saved, not yet acted on. |
| `chosen: OptN → plan NN` / `chosen: OptN → spec NNN` | An option was picked and it led to a Development Plan or a spec. |
| `killed` | The brief's own verdict was `kill` — the status quo wins. |
| `dropped` | Nobody is pursuing it, for a reason unrelated to the brief's verdict (one line why). |

`## Choice recorded` (added by the main session) says which status applies and
why, in one or two lines.

## Index

| Idea | Status | Verdict | Led to |
|------|--------|---------|--------|
| [01-learn-from-dismissed-findings](01-learn-from-dismissed-findings.md) | open | needs-clarification (Opt4) | — |
| [02-cheaper-review-runs](02-cheaper-review-runs.md) | open | go (Opt1) | — |
| [03-catch-more-real-bugs](03-catch-more-real-bugs.md) | open | needs-clarification (Opt1) | — |
| [04-count-failed-llm-attempt-usage](04-count-failed-llm-attempt-usage.md) | chosen | go (Opt3) | [plan 13](../plans/13-count-failed-llm-attempt-usage.md) |
| [05-truncated-chunk-runaways](05-truncated-chunk-runaways.md) | chosen | go (Opt1) | [plan 08](../plans/08-llm-call-reliability.md) Amendment A1 |
| [06-fewer-false-criticals](06-fewer-false-criticals.md) | chosen | go (Opt2) + Opt1 | [plan 10](../plans/10-agent-precision.md) |
