# Eval: onion-architecture skill

Regression test for the `onion-architecture` skill's detection quality. It checks that an
agent using the skill finds the violations seeded in `fixtures/`, names the right rule, and
leaves the correct wiring alone.

## Cases

Each case is a draft change, laid out at the paths it would have in this repo. The drafts
lean on the real code around them (`platform/container.ts`, `@devdigest/shared`,
`mcp-server/src/core/ports.ts`).

| Case | Draft | Seeded |
|---|---|---|
| `case-1-review-digest` | new `server/src/modules/review-digest/` module | 3 |
| `case-2-review-notifications` | reviewer-core prompt template + a Slack notifier port, adapter and wiring (`changes-to-existing-files.diff`) | 3 |
| `case-3-mcp-review-score` | a new `mcp-server` tool (`changes-to-existing-files.diff`) | 3 |
| `case-4-hotspots` | new `hotspots` module, a git adapter and wiring. It also touches the documented exceptions (`repo-intel` → `adapters/astgrep`, a type-only `RepoIntel` port import), which must **not** be flagged | 3 |
| `case-5-check-annotations` | a new port, adapter, repository and service for check-run annotations. The issues are subtle: a leaked query builder, SDK types in a service, and wiring with no override or mock | 3 |
| `case-6-release-notes` | new `release-notes` module, a tag reader and a notes writer, with wiring. A tunable added to `config.ts` but still read from `process.env`, and two adapters that duplicate an existing client (git, the Anthropic API) | 3 |
| `case-7-weekly-report` | a larger draft (11 files + diff): a `weekly-report` module, two new `modules/_shared` helpers, a shared contract, a report adapter and wiring. Most leaks sit one hop away from the module: behind `modules/_shared`, a re-export in `@devdigest/shared`, a dynamic `import()`, and a type re-export | 5 |
| `case-8-review-forecast` | a new `review-forecast` module that reuses `brief`'s dependency ports (`BriefBlastPort`, `BriefLogger`, `TokenCounter`) from `brief/types.ts` in three files, next to an allowed provider-type import from `repo-intel/types.ts` and one plain cross-module constant import as a control | 4 |

No fixture file contains a comment or a name that hints at the planted issue. The answer
key lives only in `expected-findings.json`, which the agent under test must never see.

## Task given to the agent under test

One run per case. `{{fixture}}` is the case folder and `{{repo}}` is the repo root.

> Invoke the `onion-architecture` skill. Then read every file under `{{fixture}}`, which is
> a draft change laid out at its paths in the repo at `{{repo}}`. A `.diff` file holds edits to
> existing files. Report every onion-architecture violation in a fenced block tagged
> `findings`, one per line, as `file:line — rule — description`. `file` is relative to
> `{{fixture}}`, and for a `.diff` the line is the line in the `.diff` file. `rule` is one
> id from the list below. Be exhaustive, and do not fix anything.

Rule ids:

- server: `core-is-pure`, `services-depend-on-ports`, `routes-are-thin`,
  `db-confined-to-repositories`, `no-cross-module-internals`, `adapters-dont-know-modules`,
  `no-circular`, `ports-are-vendor-neutral`, `repositories-return-rows`,
  `adapter-needs-mock-and-override`, `env-at-chokepoints`, `one-adapter-per-system`, `no-foreign-consumer-ports`
- mcp-server: `mcp-core-is-pure` (no `process.env`, `fetch`, timers, or `http/`/`tools/`
  imports in `core/`), `mcp-transport-uses-injected-api` (no `http/`, `fetch` or
  `process.env` in `tools/` or `server.ts`), `mcp-adapter-boundary` (`http/` never imports
  `tools/` or `server.ts`)

A no-skill baseline gets the same task without the first sentence, and must not read
`.claude/skills/`.

## Scoring

Only lines inside the `findings` block are scored. They are compared with
`expected-findings.json`:

- **Match.** A reported line matches a seeded finding when the file is the same and its
  line is within `line_tolerance` (3) of any of that finding's `lines`, or of an
  `alt_locations` entry (the same issue seen from its other end). An alt location may set its
  own `tolerance` (0 when it sits next to another finding's lines). Each seeded finding can be
  matched once.
- **Recall** = matched seeded findings / all seeded findings, pooled over all cases
  (27 in total).
- **Rule accuracy** = matched lines whose `rule` equals the expected rule / matched lines.
  This is reported but does not gate.
- **Precision** = matched lines / all reported lines. A line on a file the key doesn't
  mention (a typo, naming, a code smell) still counts against it. Keep the block to
  layering violations.
- **False positive on correct wiring.** A reported line within `must_not_flag_tolerance`
  (1) of a `must_not_flag` entry **fails the case**, whatever the recall.
- **Pass threshold:** recall ≥ `recall_threshold` (0.9), which allows at most 2 of the 27
  seeded findings to be missed, and no `must_not_flag` hit.

`evals.json` holds the same cases in skill-creator format for manual with- and
without-skill comparisons. It adds checks that a line-matching score cannot express, such as
"does not report a `depcruise` result it never obtained".

## Running

See [`/skill-evals/_shared/README.md`](../../../../skill-evals/_shared/README.md) for the
generic runner and the layout of the result folders.
