# dependency-checker — how it works

`SKILL.md` is what the agent reads. This file is for whoever maintains the scripts.

## Pipeline

```
collect.mjs ──► .devdigest/cache/deps.json ──► render.mjs ──► docs/reports/dependencies/<date>.md
 (facts + rule tiers)                           (tables, diagrams,      (+ model: verification
                                                 advice, commands)        notes, Top actions)
```

Node ≥ 22, no dependencies of its own: both scripts use only Node built-ins, so they run
from any package's state without an install. Offline by default; `--online` adds
`outdated` + `audit` per package, using that package's manager.

| Flag | Script | Effect |
|---|---|---|
| `--root <dir>` | both | repo root (default: cwd) |
| `--out <file>` | both | output path |
| `--in <file>` | render | `deps.json` to read |
| `--force` | render | overwrite a report that already has model-written notes |
| `--online` | collect | run `outdated` and `audit` (network) |
| `--packages a,b` | collect | limit to some top-level packages |

## How each number is computed

| Number | Method |
|---|---|
| package list | top-level folders with a `package.json` (skips `node_modules`, `clones`, dot-folders) |
| manager | from the lock file name; two lock files → `lockfile-conflict` |
| installed version | `package.json` of the realpath that Node resolution finds from the package dir |
| tree | walk `dependencies` + `optionalDependencies` of each installed package, resolved the way Node does (works for npm nesting and pnpm `.pnpm/<id>/node_modules` symlinks). Peers are not walked: the consumer pays for them |
| own size | sum of file sizes in the package folder, excluding nested `node_modules` and symlinks (apparent bytes, not disk blocks — pnpm hard-links from its store) |
| closure | own + every package reachable from it |
| exclusive | bytes in the closure that no other direct dependency of the same package reaches — what removing it alone would free |
| by category | each installed node counted once, under the category of the heaviest direct dep that reaches it |
| usage | regex scan of `.ts/.tsx/.js/.mjs/.cjs/.css` and `tsconfig*.json` for `from`, `import()`, `require()`, CSS `@import/@plugin`, triple-slash types; then script binaries, string literals equal to the name, `@types/<x>` targets, and "peer of an installed dep" |
| internal edges | `tsconfig` `paths` resolving into another package; relative imports that land on a real file in another package; same-named `src/vendor/<x>` folders (compared by sha1 per file); runtime edges from `references/runtime-edges.json`, each re-checked against its evidence file |
| drift | same dependency in several packages: `major` / `minor` / `patch` by installed version. Patch-only differences are ignored |

## Known blind spots

- **Dynamic names** (`import(\`./x/${name}\`)`, plugins loaded by a framework from a config
  key that is not the package name) are invisible: they show up as `unused-*` candidates,
  which is why the skill makes the agent verify every unused candidate before recommending
  removal.
- **String references count as use.** `'.tsx'` in a lookup table marks `tsx` as used. The
  inventory shows `Used via: string-ref` so a reader can spot it; it errs toward keeping a
  dependency rather than recommending a wrong removal.
- **Bundle size is not measured.** Sizes are what is installed, not what reaches the
  browser. `client` bundle analysis would need `next build`.
- **Unresolvable bare specifiers** (text inside test fixtures and template strings) are
  collected into one `unresolved-specifier` Info finding per package rather than reported
  as undeclared imports.

## Adding or changing a rule

1. Add the rule id and its default tier to `RULES` in `collect.mjs` and emit it from
   `packageFindings` (or a cross-package function next to it).
2. Add its advice text and command to `advice()` and its effort to `EFFORT` in `render.mjs`.
3. Seed one instance (and a trap that must not fire) in `scripts/selftest.mjs` and run
   `node .claude/skills/dependency-checker/scripts/selftest.mjs`.
4. Update the tier table in `SKILL.md`.

## Evals

- `scripts/selftest.mjs` — deterministic: script facts and report structure.
- `evals/skills/dependency-checker/` — LLM-judged quality cases run by the `evals/` harness
  (`cd evals && pnpm eval:skills dependency-checker`). They inline the data, so they test
  the "data given to you" path of `SKILL.md`.
