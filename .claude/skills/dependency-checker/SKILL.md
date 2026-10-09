---
name: dependency-checker
description: "Audits the npm dependencies of every DevDigest package (client, server, reviewer-core, mcp-server, e2e, evals) and how the packages depend on each other, then writes one structured report: a Mermaid component graph, size breakdown (installed / closure / exclusive MB, by category), and findings ranked P0/P1/P2/Info with a concrete fix and the right pnpm/npm command for each. Deterministic scripts (scripts/collect.mjs → scripts/render.mjs) produce every number; the model verifies and prioritizes. Use whenever someone asks what our dependencies are, which packages are heavy or bloated, about node_modules size, unused / undeclared / duplicated / outdated / vulnerable packages, version drift (e.g. different zod versions across packages), vendored shared-copy drift, the internal dependency graph between packages, or wants a dependency cleanup plan — even if they do not say 'dependency check'. Not for import-layering rules inside one package (use onion-architecture) or reviewing code for security bugs (use security-reviewer)."
version: "1.0.0"
---

# Dependency checker

Produces **one report** a developer can act on: what each package depends on, how much it
weighs, how the packages connect, and what to fix first. The split of work is the point of
the skill:

- **Scripts own the facts.** `collect.mjs` reads manifests, lock files, the installed
  `node_modules` tree, `tsconfig` `paths` and every import, and writes `deps.json`;
  `render.mjs` turns it into the report. Sizes, versions, counts and tiers are computed,
  never estimated — a hand-written number cannot be reproduced and erodes trust in every
  other line (the onion skill's invented `depcruise` baseline is the cautionary tale, root
  `INSIGHTS.md` 2026-09-26).
- **You own the judgement.** Verify the findings that matter, adjust a tier with a written
  reason, and write the Top actions a developer will actually do.

## Workflow

Run from the repo root. Each step says what to do when it fails.

1. **Collect.**
   `node .claude/skills/dependency-checker/scripts/collect.mjs`
   Add `--online` only when the user asked about vulnerabilities or outdated versions (or
   agreed to network access): it runs `pnpm|npm outdated` and `audit` per package.
   Output: `.devdigest/cache/deps.json` (gitignored) and a one-line tier count.
   If a package reports `not-installed`, say so and ask before running an install —
   sizes for that package are missing until then.
2. **Render.**
   `node .claude/skills/dependency-checker/scripts/render.mjs`
   Output: `docs/reports/dependencies/<YYYY-MM-DD>.md` with all five sections filled.
   If that file already carries verification notes, render refuses (exit 2). Render to a
   scratch path, diff everything above `### Top actions`; if the facts match, keep the
   existing report, otherwise re-render with `--force` and redo steps 3–4.
3. **Verify** every P0 and P1 finding and every `unused-*` candidate before you recommend
   it. Open the evidence it cites (`file:line`, the `package.json` entry) and look for uses
   the scanner cannot see: a dynamic `import()` with a computed name, a plugin loaded by a
   framework from config, a CLI run through `npx` outside `package.json`. Then, under the
   finding, add one of:
   - `Verified: <what you checked>` — keeps the tier;
   - `Tier changed: P2 → P1 — <reason>` — at most one step, reason grounded in this repo;
   - `Dismissed: <reason>` — false positive; keep the block so ids stay stable.
4. **Write the model parts** of the report — only these:
   - **Top actions** (replace the default list under `## Summary` → `### Top actions`):
     3–5 items, highest tier first. Merge findings that share one fix (four
     `duplicate-versions` caused by one old tool = one action). Each item: tier, finding
     ids, the package and dependency by name, the action, and the command.
   - **Advice refinements** where repo knowledge beats the generic template. Example:
     `CLAUDE.md` says contracts change in `server/src/vendor/shared` first and
     `client/src/vendor/shared` is the copy, so a `vendored-copy-drift` fix re-copies
     server → client, never the reverse.
   Do not edit numbers, tables or diagrams by hand. If one looks wrong, fix the script and
   re-render, and mention it.
5. **Reply in chat** with the summary format below and the report path.

## Report contract

`render.mjs` emits exactly these sections in this order. Keep the names: tools and readers
navigate by them.

```
# Dependency report — <date>
> commit · branch · mode (offline/online)

## Scope                     packages analysed, manager, lock file, counts, how to read the numbers
## Dependency graph
### Components               Mermaid flowchart: packages + internal edges
### Heaviest and shared external dependencies   Mermaid flowchart: package → top deps, drift in red
## Size breakdown
### Per package              direct, unique installed, installed MB, prod-closure MB
### Heaviest direct dependencies (top 15 by closure)
### By category              table + Mermaid pie
### Full inventory           <details> per package: every direct dep with usage evidence
## Findings & Priorities
### Backlog                  one table: ID · Tier · Rule · Where · Effort · Action
### P0 / ### P1 / ### P2 / ### Info   one block per finding: What · Evidence · Advice · Command · Effort
## Summary
### Key numbers
### Top actions              3–5, highest tier first   ← written by you
```

**Internal vs external dependencies are different things — keep them apart.** External
ones are npm packages in `package.json`. Internal ones are edges between our own packages,
and this repo is *not* a workspace (no `workspace:*`, no shared `node_modules`):

| Internal edge | Seen as | Example here |
|---|---|---|
| alias | `tsconfig` `paths` pointing into another package | `server` → `reviewer-core` via `@devdigest/reviewer-core` |
| vendored copy | same-named `src/vendor/<x>` in two packages | `server/src/vendor/shared` ↔ `client/src/vendor/shared` |
| relative import | `../../other-pkg/src/...` bypassing any alias | flagged: couples folder layouts |
| runtime | HTTP / browser call, declared in `references/runtime-edges.json` and re-checked | `client` → `server` :3001 |

## Priority tiers

| Tier | Meaning | Typical rules |
|---|---|---|
| **P0** | Fix now: security exposure, or an install that is broken or not reproducible | `vulnerability-high`, `lockfile-conflict` |
| **P1** | Fix this iteration: works today by accident, or breaks on the next install/upgrade | `undeclared-runtime-import`, `dev-dep-in-runtime-code`, `cross-package-relative-import`, `vendored-copy-drift`, `version-drift-major`, `loose-range`, `lockfile-missing`, `unused-dependency-heavy` |
| **P2** | Backlog: hygiene with a measurable payoff (MB, install time, clarity) | `unused-dependency`, `tooling-in-prod`, `contract-lib-drift`, `duplicate-versions`, `outdated-major`, `deprecated`, `undeclared-test-import`, `cross-package-relative-import-test` |
| **Info** | Fact worth knowing, no action required | `heavy-dependency`, `version-drift-minor`, `not-installed`, `unresolved-specifier` |

Ranking inside a tier: smaller effort and bigger payoff first. Effort is S (one command),
M (a few files or one investigation) or L (a migration). Heavy alone is never a problem:
`next` at 280 MB is Info. A heavy dependency that nobody uses is P1.

## Rules that keep the report trustworthy

- **Every number comes from `deps.json`** (or from data the user pasted, labelled "as
  provided"). When a value is missing, write `n/a`; do not estimate.
- **"Unused" is a candidate, not a verdict.** Removing, moving or upgrading a dependency is
  a recommendation for the user to confirm. Never run `remove`/`add`/`install`/`update`
  yourself unless the user asks for that change.
- **Commands use the package's own manager**: `client/`, `server/`, `mcp-server/`,
  `evals/` → pnpm; `reviewer-core/`, `e2e/` → npm. The other manager writes a second,
  conflicting lock file that nothing in CI catches.
- **Never hand-edit lock files or `*/src/vendor/**`.** Advice for vendored drift is "re-copy
  from upstream", not "edit the copy".
- **Name the thing.** Every finding and action names the package, the dependency and,
  where there is one, the file:line — "consider trimming dependencies" helps nobody.
- `server/clones/**` holds checkouts of other repos; the scanner skips it, and so should
  any manual search you run.

## Chat summary format

Keep it short — the report has the detail:

```
Dependency report → docs/reports/dependencies/<date>.md  (<mode> · commit <sha>)
<N> packages · <N> direct deps · <size> installed (<largest package> <size> largest)
P0 <n> · P1 <n> · P2 <n> · Info <n>

Top actions
1. [<tier>] <ids> — <action naming package + dependency> : `<command>`
2. …
Not checked: <what this run could not see, e.g. vulnerabilities/outdated without --online>
```

Every `<…>` comes from this run's `deps.json` (or the pasted data) — never from an example
in this file.

## When the data is given to you instead

Sometimes there are no scripts to run — the user pastes manifests, sizes and grep results,
or the task runs without tools. Produce the **same five sections with the same names**:

1. `## Scope` — the packages the data covers, what it does not cover, and one sentence
   saying they are standalone packages (own `package.json` and `node_modules` each), not a
   workspace, linked only by aliases, vendored copies and relative imports.
2. `## Dependency graph` — a Mermaid **`flowchart`** (not `graph`), one node per package,
   internal edges (aliases, relative imports, vendored copies) and the shared external
   dependencies, version on each edge. Start it exactly like this:

   ````
   ```mermaid
   flowchart LR
     server["server"] -->|"alias @x/shared"| shared["server/src/vendor/shared"]
     server ==>|"relative import"| reviewer_core["reviewer-core"]
     server -->|"zod 3.23.8"| zod(["zod"])
   ```
   ````
3. `## Size breakdown` — a table of the sizes you were given (dependency, package, size),
   heaviest first; `n/a` where none was given.
4. `## Findings & Priorities` — `### P0`, `### P1`, `### P2`, `### Info`, each finding naming
   package, dependency and file, with the fix and the command in that package's manager.
   Use the rule ids from the tier table: a relative import into another package's internals
   is `cross-package-relative-import` (P1); a dependency with no import anywhere is
   `unused-dependency` (P2, or `unused-dependency-heavy` P1 when it is ≥ 5 MB in prod); the
   same library at different versions across packages is drift — call it drift and count
   the packages and distinct versions. Classify by semver position: **major** = the first
   number differs (`3.x` vs `4.x`) → `version-drift-major` (P1); **minor** = same major,
   second number differs (`3.22.4` vs `3.23.8`) → `contract-lib-drift` (P2) for
   `zod`/`typescript`, `version-drift-minor` (Info) otherwise; patch-only → not reported.
   Commands follow the manager map above (it holds even when the data does not name a lock
   file); never describe the packages as linked through a workspace.
5. `## Summary` — key numbers counted from the data (packages *in the data*, not in this
   file's examples; a total size only as an exact sum of the given sizes, labelled "sum of
   provided sizes", never `~`), then 3–5 actions ordered by tier, each to be confirmed by the
   user.

## Files

| File | What it is |
|---|---|
| `scripts/collect.mjs` | Facts → `deps.json`. Rule table (`RULES`), categories, thresholds at the top |
| `scripts/render.mjs` | `deps.json` → report. Advice templates and effort per rule |
| `scripts/selftest.mjs` | Builds a synthetic 3-package repo with 13 seeded issues and 8 traps; run after changing either script |
| `references/runtime-edges.json` | HTTP/browser edges imports cannot show, each with an evidence file the collector re-checks |
| `README.md` | How each number is computed, known blind spots, how to add a rule |
