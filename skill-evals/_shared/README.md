# Skill evals — shared convention and runner

The evals ship **with each skill**, so they travel with it when it is copied or packaged:

```
.claude/skills/<skill>/evals/
├── eval.md                 # task, output format, scoring, threshold (what the CI runner reads)
├── expected-findings.json  # answer key; never shown to the agent under test
├── evals.json              # optional: the same cases in skill-creator format, for manual A/B
└── fixtures/<case>/        # input files, without hints about the seeded issues
```

This folder (`skill-evals/` at the repo root) holds only what every skill shares: this
convention and the runner. To add an eval for a skill, create its `evals/` folder. Nothing
is registered centrally. Run results go to `skill-evals/<skill>/iteration-N/`, and
`.gitignore` keeps them out of git.

## Runner (TODO: `run-evals.ts`)

For each `.claude/skills/*/evals/eval.md`:

1. **Copy the inputs.** Copy each case's fixture folder to a neutral temp path. Give the
   agent a copy of the skill **without** `evals/`, so it can't read the answer key.
2. **Spawn the agent.** Run it headless with the task from `eval.md`, filling in
   `{{fixture}}` and `{{repo}}`.
3. **Score.** Parse the `findings` block and score it against `expected-findings.json`,
   using the matching rules in `eval.md`.
4. **Gate.** Fail the job when recall is below `recall_threshold` or a `must_not_flag`
   entry is hit. Print recall, precision and rule accuracy per case.

The intended trigger is a CI job on changes to `.claude/skills/**`, so that an edit to a
skill's `SKILL.md` or reference files that lowers recall is caught.

## Rules for a fixture

- **No hints.** No comment, name or file name in a fixture may say what is wrong. The
  answer key is `expected-findings.json` and nothing else.
- **Include correct code too,** and list it under `must_not_flag`, so that false positives
  on correct wiring are measured, not just recall.
- **Avoid ignored folder names.** Don't name a fixture folder after a root `.gitignore`
  pattern (`clones/`, `build/`, `out/`, `coverage/`, `dist/`), or git drops it silently.
- **Keep the key in step.** After editing a fixture, re-check every `lines` entry in the
  key. A shifted line is a silent recall drop.

## Manual A/B (skill-creator)

`evals.json` runs through the `skill-creator` plugin: one with-skill and one no-skill run
per case, graded against its `expectations`, then `scripts.aggregate_benchmark` and
`eval-viewer/generate_review.py` over `skill-evals/<skill>/iteration-N/`. Each run goes in
`<eval-dir>/<config>/run-1/`, because the aggregator only reads `run-*` folders.
