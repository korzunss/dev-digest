# evals/ — `@devdigest/evals`

Harness evals for the Claude Code setup (skills, agents, the `CLAUDE.md` workflow):
vitest + the Claude Agent SDK. Package manager: **pnpm**.

**First step of any task here**: `evals/` has no `insights/`; its lessons live in the
root `INSIGHTS.md`. Run `grep '^### ' ../INSIGHTS.md`, then open the evals entries
that bear on the task (see Gotchas).

## Commands

- No model: `pnpm typecheck` · `pnpm eval:quality` · `pnpm vitest run src/records/stats.test.ts`.
- Model (Claude Code subscription by default; `EVAL_BACKEND=openrouter` → `README.md`):
  `pnpm eval:skills` · `pnpm eval:agents` · `pnpm eval:workflow` · `pnpm eval` (everything).
- Measuring: `pnpm eval:repeat` · `pnpm eval:delta` · `pnpm eval:compare` ·
  `pnpm eval:benchmark` · `pnpm eval:scaffold`.
- LiteLLM proxy (OpenRouter backend): `pnpm proxy:up` · `pnpm proxy:down` · `pnpm proxy:wait`.

## Which eval after which change

Root `AGENTS.md` → *Harness evals*, and `README.md` → *Which change → which run*.

## Layout

See `README.md` → *Module layout* and *Case layout*. `results/` is gitignored:
committed evidence goes in `docs/` (`docs/results-2026-10.md`, `docs/benchmarks/`).

## Safety

Model sessions run under `bypassPermissions`. `agentTask` removes nine tools by name through
`disallowedTools` (see `src/config.ts`); other SDK built-ins and MCP are not denied. `workflowTask` runs in a throwaway worktree
and fails on a change to the real repo. Prove isolation with `git status --porcelain`
before vs after, never with `trace.tools`. Revert anything an eval session wrote.
`agents/*/fixtures/**` and `skills/*/fixtures/**` are do-not-touch (root `AGENTS.md`).

## Gotchas

Root `INSIGHTS.md` entries, all 2026-10-11:

- "no Bash/Write/Edit in `trace.tools` does not prove an agent eval left the repo alone"
- "`allowedTools` and a PreToolUse deny hook do not keep an SDK workflow eval read-only"
- "a Claude Code background command dies at 2 h, and `eval:benchmark -n 5` can take longer"
- "an eval record's outcome falls back to "the session did not error" unless the case passes `passed`"
- "a doc-routing eval question must be unanswerable from the always-loaded docs"

Also: vitest filters match by substring; `eval:repeat` works around it in
`src/repeat.ts` (`resolveEvalPatterns`).

## Read on demand

- Usage, case format, safety → `README.md`
- Evidence → `docs/results-2026-10.md`, `docs/benchmarks/`; stats design → `docs/eval-stats-upgrade.md`
- Plans → `../docs/plans/31-harness-evals-ci.md`, `32-evals-coverage.md`, `33-evals-follow-ups.md`
