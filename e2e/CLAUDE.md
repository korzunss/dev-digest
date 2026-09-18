# e2e/ — `@devdigest/e2e`

Deterministic browser flows for the web app, driven by Vercel **agent-browser**
(a Rust + CDP CLI). No Playwright, no LLM, no API key. Package manager: **npm**.

## Commands

```sh
npm i -g agent-browser && agent-browser install   # once
./scripts/e2e.sh          # hermetic: isolated seeded stack, then teardown
cd e2e && npm test        # against a stack you already run (see gotchas)
```

## Map

```
specs/NN-name.flow.json   the flows — see the naming note below
lib/assert.ts             the stdout substring assertion
run.ts                    the runner: reads specs/*.flow.json, one shared session
```

## `specs/` here means something different

In every other package `specs/` holds written feature specifications. In `e2e/`
it holds **executable** agent-browser flows (`*.flow.json`) — the runner globs
that directory. Prose belongs in `docs/`, not here. Files that don't end in
`.flow.json` are ignored by the runner, so this file's sibling `README.md` is safe.

## Conventions (non-default)

- **Deterministic locators only** — `--url`, `--text`, `find role|text|label`.
  The AI `chat` command is never used; that's what keeps runs stable and key-free.
- **`wait` steps are the assertions.** A non-zero exit fails the step and the
  flow, so `wait --text` / `wait --url` already assert. `"assert": {…}` adds an
  optional substring check on stdout.
- **Flows target read-only seeded data** (`acme/payments-api`, PR #482, the
  seeded agents) so nothing can trigger a model call.
- `{BASE}` in a step is substituted with `E2E_BASE_URL` (default `:3000`).

## Gotchas

- **Flows 02/04/05 assume the seeded repo is the only one.** They follow the home
  redirect to the *first* repo. Your dev DB usually has more, so `npm test`
  against it fails — use the hermetic runner.
- **Never `docker compose down -v` to "reset" the dev DB** — `-v` deletes the
  `devdigest_pgdata` volume with every repo and review you imported.
- Failure screenshots land in `test-results/` (git-ignored, uploaded by CI).

## Read on demand

- Flow format, env knobs, coverage table → `README.md`
- Deep topics (runner internals, CI stack) → `docs/README.md`
- Solved bugs and surprises → `INSIGHTS.md`
