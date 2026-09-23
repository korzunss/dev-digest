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
that package's `AGENTS.md`, which loads automatically when you work in its folder.

## Conventions (non-default)

- **Package managers differ.** `client/` and `server/` use **pnpm**;
  `reviewer-core/` and `e2e/` use **npm**. Use the one matching the lockfile.
- **Contracts change in `shared` first** (`server/src/vendor/shared`), then in the
  consumers. `client/src/vendor/shared` is a vendored copy — keep them in sync.
- **`reviewer-core` stays pure** — no db, github, or fs imports. That purity is
  what makes it mock-testable; breaking it breaks the whole test strategy.
- **Migrations are never applied on boot.** Run `cd server && pnpm db:migrate`.

## Naming

- Files and folders are `kebab-case` (`price-book.ts`, `repo-intel/`,
  `run-cost-badge/`). React component *files* are the exception — see
  `client/AGENTS.md`, which also covers the two folder cases the client uses.
- **Tests carry their tier in the filename.** `<topic>.test.ts` = unit ·
  `<topic>.it.test.ts` = integration (needs Postgres). The `.it` suffix is what
  the CI split greps on — misname it and the test runs in the wrong job.
- Server module = `src/modules/<kebab>/` with `routes.ts` · `service.ts` ·
  `repository.ts` beside optional `helpers.ts` / `constants.ts`.
- **DB names split by layer:** `camelCase` in TypeScript, `snake_case` in SQL —
  `workspaceId: uuid('workspace_id')`. Indexes are `<table>_<scope>_idx`.
- e2e flows are `specs/NN-name.flow.json`; the number is the run order, not decor
  (`e2e/AGENTS.md`).

## Session protocol

- **First step of any task**, before planning, searching or editing: read the
  `INSIGHTS.md` of the package the request concerns, plus the root one, and name
  the entries that bear on the task (or say none do). They are accumulated session
  knowledge — treat them as high-confidence guidance unless the code says otherwise.
- **When wrapping up**, run the `engineering-insights` skill: re-read that file,
  and append only what is genuinely new and non-obvious. If the session produced
  nothing that qualifies, or the lesson is already recorded there, write nothing
  and say so — an empty wrap-up is the normal case, padding the file is the failure.

## Do not touch

- `*/src/vendor/**` — vendored code, changed upstream, not edited by hand.
- `server/src/db/migrations/**` — generated; add via `pnpm db:generate`.
- `server/clones/**` — runtime checkouts of imported repos. **Exclude it from
  every search/grep**: it contains full copies of other repos (and of this one),
  so matches there are noise.
- `**/.env` — local secrets.
- **Lock files — never hand-edit.** They are generated and carry integrity
  hashes. Change `package.json`, then reinstall with that package's own manager
  (`client/`+`server/` → pnpm, `reviewer-core/`+`e2e/` → npm). Running the other
  manager leaves a second, conflicting lock file next to the real one — nothing
  in CI or `.gitignore` catches that.
- `skills-lock.json` — generated; holds a sha256 `computedHash` per external
  skill. Editing it by hand invalidates the hash.
- `*/CLAUDE.md` — a committed symlink to the sibling `AGENTS.md`, kept for tools
  that only look for the old name. Edit the target; replacing a link with a copy
  is how the two silently drift apart.

## Read on demand

- Architecture and the end-to-end review flow → `README.md`
- Test strategy, unit/integration split, CI path filters → `TESTING.md`
- Built-in agent prompts → `docs/README.md`
- Cross-package feature specs → `specs/README.md`
- Hard-won gotchas: cross-package → `INSIGHTS.md`, package-local → `<pkg>/INSIGHTS.md`
