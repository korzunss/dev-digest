# server/ — `@devdigest/api`

Fastify 5 + Drizzle/Postgres. Every feature is a self-contained plugin under
`src/modules/<name>/`. Package manager: **pnpm**.

## Commands

`pnpm dev` (:3001) · `pnpm typecheck` · `pnpm db:generate|db:migrate|db:seed`
Tests split by filename:
- unit (no Docker): `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- integration (needs Docker): `pnpm exec vitest run .it.test`
- both: `pnpm test`

## Map

```
src/modules/<name>/   routes.ts · service.ts · repository.ts — one feature, one plugin
src/adapters/         ports: llm · github + gitlab (one ForgeClient) · git ·
                      astgrep · codeindex · embedder · secrets · tokenizer ·
                      depgraph · auth  (+ mocks.ts)
src/platform/         container.ts (DI) · config.ts (env) · errors.ts · sse.ts
src/db/               schema/ · migrations/
src/prompts/          built-in agent system prompts
```

## Conventions (non-default)

- **Schema-first routes.** A route declares Zod `params`/`body` from
  `@devdigest/shared` via `fastify-type-provider-zod`; that one definition drives
  both validation (422 before the handler) and response serialization. Handlers
  do **not** call `Schema.parse(req.body)`.
- **Adapters only through the DI container** (`platform/container.ts`) — never
  `new` them inside a service, or tests can't swap in `adapters/mocks.ts`.
- **`*.it.test.ts` = needs a real Postgres** (testcontainers, `test/helpers/pg.ts`).
  Any DB-backed test must carry that suffix or the CI split silently misses it.
- **Plugins register before modules** so module plugins inherit helmet, cors,
  rate-limit, SSE, and the shared error handler.
- Modules are registered statically in `src/modules/index.ts` — one import plus
  one `app.register` each.

## Gotchas

- **Secrets never touch the DB or `AppConfig`.** They live in
  `~/.devdigest/secrets.json` (mode 0600) with `process.env` as fallback; the one
  read chokepoint is `adapters/secrets/local.ts`. `GITHUB_TOKEN` is canonical,
  `GITHUB_PAT` is a fallback. GitLab adds `GITLAB_TOKEN`, with an
  instance-scoped `GITLAB_TOKEN@<host>` tried first (stored-file only).
- **One forge port, resolved per repo.** `container.forge(repo)` picks GitHub or
  GitLab from the repo row — never `new` an adapter, and never assume github.com
  (`repos.api_base` may carry a self-managed origin *plus a path prefix*).
- **An HTTP adapter without an SDK must throw an error carrying `status`**, or
  `withRetry` silently never retries: `fetch` does not throw on 4xx/5xx and
  `defaultIsRetryable` classifies by `err.status`.
- **GitLab diff retrieval is version-gated.** `/changes` below 15.7, paginated
  `/diffs` at and above it. Walk every page — stopping at page 1 silently
  reviews only the first N files of a large MR.
- **The DB schema already contains every table**, including ones no starter code
  writes to. An empty table is expected, not a bug.
- **A FK column is not indexed.** Filtering on one (`WHERE child.parent_id = …`)
  scans the table until you add an `index(...)` to the schema callback yourself.
- The server boots fine with **zero** API keys — `loadConfig` marks every secret
  optional, and keys can arrive at runtime via Settings.

## Read on demand

- Route map, DI diagram, env table, review-context notes → `README.md`
- The repo indexer → `src/modules/repo-intel/README.md`
- Deep topics (indexing, migrations, performance) → `docs/README.md`
- Feature specs — read the spec before implementing the feature → `specs/README.md`
- Solved bugs and surprises → `INSIGHTS.md`
