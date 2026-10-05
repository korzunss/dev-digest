# DevDigest — repo map

Local-first AI pull-request review. Five **standalone** packages, not a workspace:
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
| `mcp-server/`              | local stdio MCP server, thin client over the API | — |
| `server/src/vendor/shared` | `@devdigest/shared` — Zod contracts        | —    |

## Commands

`./scripts/dev.sh` brings up Postgres + API + web. Per-package commands live in
that package's `AGENTS.md`, which loads automatically when you work in its folder.

## Conventions (non-default)

- **Package managers differ.** `client/` and `server/` use **pnpm**, as does `mcp-server/`;
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
  `insights/gotchas.md` of the package the request concerns and the entry
  headings of that package's `INSIGHTS.md` and the root `INSIGHTS.md`
  (`grep '^### '`). Open a full `INSIGHTS.md` entry only when a gotcha item or a
  heading bears on the task. Name the entries that bear on the task (or say none
  do). They are accumulated session knowledge — treat them as high-confidence
  guidance unless the code says otherwise.
- **When wrapping up**, run the `engineering-insights` skill: re-read that file,
  and append only what is genuinely new and non-obvious; the skill then brings
  the package's `insights/gotchas.md` in step. If the session produced
  nothing that qualifies, or the lesson is already recorded there, write nothing
  and say so — an empty wrap-up is the normal case, padding the file is the failure.

## Plan → implement → verify

- Feature work runs through `/sdd` (`.claude/skills/sdd/SKILL.md`), which follows the rules below.
- **Optional brainstorm stage** for a goal with no chosen approach: the
  read-only `brainstormer` returns an idea brief, never a plan. The main
  session saves **every** brief, `kill` included, verbatim to
  `docs/ideas/NN-kebab-name.md` plus its index row, adding only `Status:` and
  `## Choice recorded`. A correction re-runs `brainstormer` with the brief's
  path; it returns only the changed sections. *Facts needed* seed the
  researcher's ≤8 questions, and the brief's path goes to `spec-creator` first
  (for a feature), then to the `implementation-planner`.
- **Spec stage** for every feature, before research and planning: `spec-creator`
  pass 1 returns ≤8 blocking questions and writes no file; after the user
  answers, pass 2 writes the spec (`Status: draft`). The main session sets
  `approved` only on the user's explicit yes with *Open questions* empty, then
  **asks** whether to run research (default yes), then the `implementation-planner` gets the
  spec path. A bug fix, verifier/reviewer follow-up, no-behaviour-change refactor or tooling
  plan skips it with `no spec: <reason>`. When its plan becomes `done` (a `complete`
  verification, or `complete — needs sign-off` once the user has accepted the
  listed items) the main session sets the spec to `implemented`; it also keeps the spec's
  Changelog.
- Research before planning is **repo-mode only** (≤8 questions to the
  `researcher`). External research runs for the questions pass 1's *Risks &
  open questions* lists, after the user answers *Decisions needed* and before
  pass 2, as a separate researcher run.
- The `implementation-planner` writes **pass 1** for every non-trivial plan: a
  requirements review (`TQn` clarifying questions, `GAPn` spec gaps, `RECn`
  recommendations, plus an execution-mode row in *Decisions needed*) inside a
  decisions-only draft (`docs/plans/NN-kebab-name.md`, `Status: draft`, ending
  `Steps: pending decisions`) plus its index row (`draft (decisions)`), and
  returns only a summary (path, review ids, *Decisions needed*, research
  questions). It skips straight to the full plan only when the prompt says
  `single pass: <reason>`, and only for a trivial plan (≤1 package, ≤3 files),
  which gets `Execution: single-agent`. A `GAPn` and any user-visible `RECn`
  go to `spec-creator` before pass 2 (the main session sets an approved spec
  back to `draft`, writes the Changelog entry, re-approves). The main session
  records the chosen mode as the header line `Execution: <multi-agent |
  single-agent>`. **Pass 2** resumes the same implementation-planner
  (fallback: a fresh run with the plan path) once every `TQn` is answered and
  every `GAPn` closed. In both passes the implementation-planner writes no other file. Later correction rounds edit the plan file in place
  and return only the changed
  sections. The `Status:` line and *Decisions recorded* belong to the **main
  session**.
- The user's answers to *Decisions needed* and any corrections are written
  **into that file**, not left in the conversation. A correction is not an
  approval.
- Only after the user's explicit, final approval does the main session set
  `Status: approved`. Nothing is implemented from a `draft`.
- `implementer` gets the plan **path** and the status moves to `in-progress`.
  `multi-agent` (also a plan with no `Execution:` line): one step group per run
  (`G1`, then `G2`, …), then `test-writer`, with the reviewers per their rules.
  `single-agent`: one run with `all`, then `plan-verifier`, with the reviewers
  on their own triggers. It runs only the integration tests related to its
  work; after the last run the main session runs the full `.it` suite once in
  both modes, then hands the same path — and that run's result — to
  `plan-verifier`. The status becomes `done` after a `complete` verification,
  or after `complete — needs sign-off` once the user has accepted the listed
  unverified items; never on its own.
- `security-reviewer` runs, when a trust boundary is touched (or on demand
  before a PR), in a fresh context with the plan path and the diff, in
  parallel with `architecture-reviewer`; its `SF` findings go to fix mode the
  same way. Its dependency-audit item runs in the main session (needs
  network), not the agent.
- Hand-offs between groups go **into the plan**, not into prompts: the main
  session appends each implementer's *Handoff to the next group* — and its
  `## Skills` table, the `plan-verifier`'s source for the `SK` items — under
  `## Handoffs → G<n>` (`## Handoffs → all` for a `single-agent` plan) below `<!-- implementer-brief:end -->`, and the next
  prompt is just the plan path and the group. Never paste more than ~10 lines of
  one agent's report into another agent's prompt; cite gap ids and paths.
- Gaps from the verifier or either reviewer go back to `implementer`
  in **fix mode** (plan path + gap ids). A gap that needs a file outside the
  plan's steps is a plan change: the plan returns to `draft` and needs the
  user's approval again.
- **Trivial fixes skip the implementer.** A gap or approved plan change that
  touches ≤1 file and ≤10 lines, where that file is already in some step's
  *Files* and the change is not a contract, migration, vendor or lock-file edit,
  is applied by the main session. It runs that step's Done-when and logs the
  change in the plan's Verification log as `main-session fix: <id>`; the next
  plan-verifier run checks it like any other change.
- **Re-verification is a delta.** After fix mode, call `plan-verifier` in delta
  mode (previous result + open gap ids); a full pass runs once per wave of
  implementation, not after every fix.

## Do not touch

- `*/src/vendor/**` — vendored code, changed upstream, not edited by hand.
- `server/src/db/migrations/**` — generated; add via `pnpm db:generate`. The one
  hand-written kind: a data migration goes into the empty stub made by
  `pnpm db:generate --custom`, and only into that file (plan 12).
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
- Feature specs (root `specs/` cross-package, `<pkg>/specs/` single-package) → `specs/README.md`
- Hard-won gotchas: cross-package → `INSIGHTS.md`, package-local → `<pkg>/INSIGHTS.md`
  (the log) and `<pkg>/insights/gotchas.md` (the rules in force)
- Package deep-dives → `server/docs/architecture.md`, `client/docs/ui-architecture.md`,
  `reviewer-core/docs/pipeline.md`, `e2e/docs/flows.md`
- Approved Development Plans → `docs/plans/README.md`
- Idea briefs → `docs/ideas/README.md`
