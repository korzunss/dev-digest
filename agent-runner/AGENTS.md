# agent-runner/ — `@devdigest/agent-runner`

The review runner that "Export to CI" ships into a user's repository: it reads the
PR event, loads the exported manifest/skills/memory, calls `reviewer-core` and
posts the result. Built to **one file**, `dist/index.js`, which the server embeds
in the export. Package manager: **npm** (not pnpm).

**First step of any task here:** read the root `INSIGHTS.md` entries on the vendored
`shared` copies and on `reviewer-core` changes, and name the ones that bear on it.

## Commands

`npm run typecheck` · `npm test` (vitest, hermetic) · `npm run build` (esbuild →
`dist/index.js`, header `// devdigest-agent-runner v<version> sha256:<body sha>`).

## Map

```
src/core.ts   pure: parseEvent · shouldSkip · loadManifest · buildResult · exitCode · postPlan
src/io.ts     I/O edge: fs, git (argv arrays, SHAs validated), stdout
src/main.ts   run(env, deps): event -> skip -> manifest -> diff -> review -> post -> result
scripts/build.mjs   deterministic bundle + version/sha256 header
dist/index.js       COMMITTED build output
```

## Conventions (non-default)

- **Commit `dist/` after every build.** The server serves the committed file and
  `agent-runner.yml` fails when a rebuild differs from it. Change the version in
  `package.json` when behaviour changes.
- **`reviewer-core` stays pure.** All I/O (files, git, GitHub `fetch`) lives here, in `io.ts` / `main.ts`.
- **Contracts come from `@devdigest/shared`** (path alias to `../server/src/vendor/shared`);
  never redefine `AgentManifest` or `CiResultArtifact`.
- **No secret reaches output.** Everything printed passes the redactor in `main.ts`;
  `buildResult` has no key/token input. The test in `test/main.test.ts` pins this.
- **Config comes from the base checkout only** (`DEVDIGEST_CONFIG_DIR`); the head
  checkout (`DEVDIGEST_WORKDIR`) is data to diff, never code or config to trust.
- **zod/openai resolve from this package's `node_modules`** (tsconfig `paths`, vitest alias,
  esbuild `alias`); otherwise the shared contracts and the engine get separate zod copies.
