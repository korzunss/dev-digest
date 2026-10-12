# External research R1 — Stryker for `server/` (plan 34)

Researcher run, 2026-10-12. Confidence: medium (versions from primary data; sandbox/alias behaviour inferred, not run).

## Answer
- `@stryker-mutator/core@10.0.0` + `@stryker-mutator/vitest-runner@10.0.0` (same version; runner pins core exactly). Runner peer `vitest >=2.0.0`; installed vitest 2.1.9 (`server/package.json` `^2.1.8`). Node `>=22`.
- `@stryker-mutator/typescript-checker` is optional — not needed.
- Runner options: `vitest.configFile`, `vitest.dir`, `vitest.related` (default true: mutant runs pass `relatedFiles`, so only tests importing the mutated file run). It sets no include/exclude, always uses `perTest` coverage, no browser mode.
- Sandbox: Stryker copies the project to `.stryker-tmp`; `server/vitest.config.ts` aliases `@devdigest/reviewer-core` to `path.resolve(__dirname, '../reviewer-core/src')`, which from the sandbox likely points at a missing dir (inference). Workarounds: `"inPlace": true` (mutates real files, backs up and restores; run on a clean tree) or a dedicated mutation vitest config with an absolute alias.
- Open issue #6243: default `symlinkNodeModules` can make Vite refuse symlinked paths (reported for `test.projects` monorepos; may not apply).
- Reports default to `reports/`; sandbox `.stryker-tmp/`. Neither is in `.gitignore`.

## Suggested setup
- Install (main session): `cd server && pnpm add -D @stryker-mutator/core@10.0.0 @stryker-mutator/vitest-runner@10.0.0`.
- `server/vitest.mutation.config.ts`: spread the base config, `test.include: ['src/modules/eval/**/*.test.ts']`, `exclude: ['**/*.it.test.ts']`.
- `server/stryker.config.json`:
```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "testRunner": "vitest",
  "plugins": ["@stryker-mutator/vitest-runner"],
  "mutate": ["src/modules/eval/pipeline-scoring.ts"],
  "vitest": { "configFile": "vitest.mutation.config.ts", "related": true },
  "inPlace": true,
  "reporters": ["clear-text", "progress", "html", "json"],
  "htmlReporter": { "fileName": "reports/mutation/mutation.html" },
  "jsonReporter": { "fileName": "reports/mutation/mutation.json" },
  "concurrency": 2
}
```
- Run: `cd server && pnpm exec stryker run`. Gitignore `.stryker-tmp/` and `server/reports/`.

## Not established
- Whether the sandbox actually breaks the alias and whether `inPlace` fixes it (needs a trial run).
- The 10.0.0 tag's peer range (read from master).

## Sources
stryker-js `packages/vitest-runner/package.json` and `src/vitest-test-runner.ts` (master); stryker-mutator.io docs: vitest-runner, configuration, troubleshooting, typescript-checker, config-file; GitHub issue stryker-mutator/stryker-js#6243; npm registry metadata (modified 2026-08-14).
