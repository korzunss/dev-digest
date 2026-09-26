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
  `insights/gotchas.md` and `INSIGHTS.md` of the package the request concerns,
  plus the root `INSIGHTS.md`, and name the entries that bear on the task (or say
  none do). They are accumulated session knowledge — treat them as
  high-confidence guidance unless the code says otherwise.
- **When wrapping up**, run the `engineering-insights` skill: re-read that file,
  and append only what is genuinely new and non-obvious; the skill then brings
  the package's `insights/gotchas.md` in step. If the session produced
  nothing that qualifies, or the lesson is already recorded there, write nothing
  and say so — an empty wrap-up is the normal case, padding the file is the failure.

## Plan → implement → verify

- The `planner` is read-only and returns a plan with `Status: draft`. The **main
  session** saves it at once as `docs/plans/NN-kebab-name.md` (the plan's
  `Save as:`) and adds its row to `docs/plans/README.md`.
- The user's answers to *Decisions needed* and any corrections are written
  **into that file**, not left in the conversation. A correction is not an
  approval.
- Only after the user's explicit, final approval does the main session set
  `Status: approved`. Nothing is implemented from a `draft`.
- `implementer` gets the plan **path** plus one step group per run (`G1`, then
  `G2`, …), and the status moves to `in-progress`. It runs only the integration
  tests related to its group; after the last group the main session runs the
  full `.it` suite once, then hands the same path — and that run's result — to
  `plan-verifier`. The status becomes `done` after a `complete` verification,
  or after `complete — needs sign-off` once the user has accepted the listed
  unverified items; never on its own.
- Gaps from the verifier or the architecture reviewer go back to `implementer`
  in **fix mode** (plan path + gap ids). A gap that needs a file outside the
  plan's steps is a plan change: the plan returns to `draft` and needs the
  user's approval again.

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
  (the log) and `<pkg>/insights/gotchas.md` (the rules in force)
- Package deep-dives → `server/docs/architecture.md`, `client/docs/ui-architecture.md`,
  `reviewer-core/docs/pipeline.md`, `e2e/docs/flows.md`
- Approved Development Plans → `docs/plans/README.md`
