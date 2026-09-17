# DevDigest — repo map

Local-first AI pull-request review. Four **standalone** packages, not a workspace:
each has its own `package.json` + lockfile; cross-package code is shared through
tsconfig path aliases, never published modules.

## Stack

Node ≥22 · TypeScript 5 · vitest everywhere · Docker runs Postgres only.
`server/` Fastify 5 + Drizzle + Postgres/pgvector · `client/` Next 15 + React 19.

## Where things live

| `server/`                  | Fastify API, DI container, Drizzle        | :3001 |
| `client/`                  | Next.js studio                            | :3000 |
| `reviewer-core/`           | pure engine: diff → prompt → LLM → findings | —   |
| `e2e/`                     | deterministic agent-browser flows          | —    |
| `server/src/vendor/shared` | `@devdigest/shared` — Zod contracts        | —    |

## Commands

`./scripts/dev.sh` brings up Postgres + API + web. Per-package commands live in
that package's `CLAUDE.md`, which loads automatically when you work in its folder.

## Conventions (non-default)

- **Package managers differ.** `client/` and `server/` use **pnpm**;
  `reviewer-core/` and `e2e/` use **npm**. Use the one matching the lockfile.
- **Contracts change in `shared` first** (`server/src/vendor/shared`), then in the
  consumers. `client/src/vendor/shared` is a vendored copy — keep them in sync.
- **`reviewer-core` stays pure** — no db, github, or fs imports. That purity is
  what makes it mock-testable; breaking it breaks the whole test strategy.
- **Migrations are never applied on boot.** Run `cd server && pnpm db:migrate`.

## Do not touch

- `*/src/vendor/**` — vendored code, changed upstream, not edited by hand.
- `server/src/db/migrations/**` — generated; add via `pnpm db:generate`.
- `server/clones/**` — runtime checkouts of imported repos. **Exclude it from
  every search/grep**: it contains full copies of other repos (and of this one),
  so matches there are noise.
- `**/.env` — local secrets.

## Read on demand

- Architecture and the end-to-end review flow → `README.md`
- Test strategy, unit/integration split, CI path filters → `TESTING.md`
- Built-in agent prompts → `docs/README.md`
- Cross-package feature specs → `specs/README.md`
- Hard-won gotchas across the repo → `INSIGHTS.md`
