# Development Plan: Atomic built-in agent sync, versioned skill detach, cancellable repo-rules load
Status: in-progress
Save as: docs/plans/16-sync-atomicity-and-rules-abort.md
Spec: none

## Goal & acceptance criteria
Close three HIGH `/pr-self-review` findings on `1e43944`:
1. `pnpm agents:sync-builtin` must change General's skills and prompt all-or-nothing.
2. A skill detach must bump the agent version and write an `agent_versions` snapshot.
3. A cancelled or stalled review must stop the repo-rules `git show` calls in the shared clone.

The work is server-only, plus a `GitClient.readFileAt` contract edit mirrored to the client copy. There is no migration.

- **AC1:** `GitClient.readFileAt` takes an optional 4th parameter `signal?: AbortSignal`, in `server/src/vendor/shared/adapters.ts` and in `client/src/vendor/shared/adapters.ts`, and the two signatures are identical.
- **AC2:** `SimpleGitClient.readFileAt` gives the signal to the git process. A signal that is already aborted rejects with that signal's `reason` and spawns no git. A stopped call is mapped through `toGitStopError(err, signal)`.
- **AC3:** `loadRepoRules` accepts `opts.signal` and runs under its own deadline, `REPO_RULES_DEADLINE_MS = 10_000` (an assumption), combined with that signal. On abort it throws the abort reason and stops reading. It does not count the remaining files as `missing`. A non-abort read error still counts as `missing`, as it does today.
- **AC4:** `ReviewRunExecutor` passes the batch-cancel signal (`runBus.signalForAll(jobs…)`) into `loadRepoRules`. An abort lands in the existing catch, which logs `repo rules: skipped (load failed)`.
- **AC5:** `AgentsRepository.transaction(fn)` exists. A throw inside `fn` rolls back every write made through the repository it was given.
- **AC6:** For one agent, `syncBuiltinAgents` makes one transaction that holds the skill detach, the prompt update, the version bump and the snapshot. When only skills are detached and the prompt is already current, the version still goes up by one and the new snapshot does not list the detached skills.
- **AC7:** The existing CLI behaviour stays the same: the dry-run lines, `unchanged` for agents that need nothing, and a second sync is a no-op.

## Decisions needed
None open — see *Decisions recorded*. The pass-1 options are under *Design notes → Pass-1 options*.

## Decisions recorded
User, 2026-10-01: "усе за рекомендаціями".
- **D1-A:** add `AgentsRepository.transaction(fn)`. The detach, the prompt update, the version bump and the snapshot happen in one transaction.
- **D2-A:** only the detach path bumps the version. Versioning every skill-set write (UI) is a follow-up, not in scope.
- **D3-A:** add `signal?: AbortSignal` to `GitClient.readFileAt` in shared (server copy first, client copy mirrored). `loadRepoRules` re-throws on abort, and `run-executor` passes the batch signal.
- **D4-B:** the rules load gets its own deadline, combined with the batch signal as in `diff-loader.ts`. 10 s is an assumption.
- **D5-A:** reads stay serial; concurrency or `cat-file --batch` is out of scope.

## Prerequisites
- Docker running, for `test/agents-sync-builtin.it.test.ts` (Testcontainers Postgres).
- No new dependencies.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S4 | shared contract (+ client mirror) → server git adapter + mock → reviews `repo-rules` + executor | — | `GitClient.readFileAt(repo, ref, path, signal?)`; `loadRepoRules(git, repo, baseSha, paths, opts?: { signal?, timeoutMs? })`; new constant `REPO_RULES_DEADLINE_MS` |
| G2 | S5–S7 | server agents: repository → service → CLI | G1 (sequential: same package) | `AgentsRepository.transaction`, `update(…, opts?: { bumpVersion? })`, `AgentsService.syncBuiltin`; `detachSkillsByName` removed |

The two groups share no file, but both are in `server/`, so they run one after the other.

## Steps

### S1 — Add `signal?` to `GitClient.readFileAt` (server copy, then client mirror)  [Contract]
- **Files:**
  - `server/src/vendor/shared/adapters.ts` (modify: only the `readFileAt` declaration in `GitClient`, at `:331`, and its doc comment)
  - `client/src/vendor/shared/adapters.ts` (modify: only the `readFileAt` line, at `:244`)
- **Change:** make the declaration `readFileAt(repo: RepoRef, ref: string, path: string, signal?: AbortSignal): Promise<string>;`. In the server doc comment, add one sentence: the signal kills the git process, as for `diffCommits`. In the client copy, apply the identical signature edit to that one line; the comment edit is optional there.
- **Layer / why here:** this is the port, and contracts change in shared first. The client copy has the same method, so it gets a targeted mirror (plan 11, F1).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** keep the parameter optional and last, so existing callers compile unchanged: `intent/service.ts:292`, `eval/replay.ts:47-55` and `MockGitClient`. Make no other edit to either vendored file, and never copy the folder.
- **Known gotchas:** the root `INSIGHTS.md` entry "the two vendored `shared` copies are not actually in sync": mirror only this line.
- **Done when:**
  - `cd server && pnpm typecheck`
  - `cd client && pnpm typecheck`
  - `diff <(grep 'readFileAt(' server/src/vendor/shared/adapters.ts | sed 's/^ *//') <(grep 'readFileAt(' client/src/vendor/shared/adapters.ts | sed 's/^ *//')` prints nothing.
  - `git diff --name-only -- client/` lists only `client/src/vendor/shared/adapters.ts`.

### S2 — Pass the signal through `SimpleGitClient.readFileAt` and `MockGitClient.readFileAt`
- **Files:**
  - `server/src/adapters/git/simple-git.ts` (modify: `readFileAt`, at `:281-299`)
  - `server/src/adapters/mocks.ts` (modify: `MockGitClient.readFileAt`, at `:342`)
  - `server/test/adapters.test.ts` (modify: the `SimpleGitClient.readFileAt` and `MockGitClient.readFileAt` describe blocks)
- **Change:**
  - **`SimpleGitClient.readFileAt`:**
    - Add `signal?: AbortSignal`.
    - Keep the ref and path guards first.
    - Then call `signal?.throwIfAborted()`.
    - Run the read with `this.git(repo, signal).raw(['show', \`${ref}:${path}\`])`.
    - Map errors with `toGitStopError(err, signal)`.
    - Take no clone lock: this is a read, as it is today.
  - **`MockGitClient.readFileAt`:** take `signal?: AbortSignal` and call `signal?.throwIfAborted()` before the lookup.
- **Layer / why here:** this is infrastructure (the adapter). The only place git is spawned is where the signal must reach.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:**
  - Do not change, weaken or reorder the raw-string ref/path validation. It must still run before any git call.
  - Use `abort` through the existing `gitAt(baseDir, signal)` (`simple-git.ts:81-86`), not a new `simpleGit()` construction.
  - Do not use `withTimeout`.
- **Known gotchas:** `server/insights/gotchas.md` → Git & diffs, "Bound a git call with an `AbortSignal` passed into `GitClient`, never with `withTimeout`" ([INSIGHTS 2026-09-30](../../server/INSIGHTS.md#2026-09-30--withtimeout-does-not-stop-a-git-call-pass-an-abortsignal-to-the-adapter-and-test-the-kill-path-deterministically)).
- **Done when:** `cd server && pnpm typecheck`, and `pnpm exec vitest run test/adapters.test.ts` passes with these new cases:
  - (a) `SimpleGitClient.readFileAt(repo, 'a1b2c3d', 'docs/plan.md', AbortSignal.abort(reason))` rejects with exactly `reason`.
  - (b) A bad path with an already-aborted signal still rejects with `/invalid path/`, which shows that the guards run first.
  - (c) The mock with an already-aborted signal rejects with that reason.

### S3 — Give `loadRepoRules` a signal and its own deadline
- **Files:**
  - `server/src/modules/reviews/constants.ts` (modify: add `REPO_RULES_DEADLINE_MS` next to the other `REPO_RULES_*` constants, at `:39-46`)
  - `server/src/modules/reviews/repo-rules.ts` (modify: `loadRepoRules`, at `:86-109`)
  - `server/test/review-repo-rules.test.ts` (modify: the `loadRepoRules` describe)
- **Change:**
  - Add the constant: `/** Repo rules: deadline for the whole rule-file load (assumption: 10 s). */ export const REPO_RULES_DEADLINE_MS = 10_000;`
  - Change the signature to `loadRepoRules(git, repo, baseSha, changedPaths, opts: { signal?: AbortSignal; timeoutMs?: number } = {})`.
  - After the `!baseSha` early return:
    - Build `const deadline = AbortSignal.timeout(opts.timeoutMs ?? REPO_RULES_DEADLINE_MS)`.
    - Build `const signal = opts.signal ? AbortSignal.any([deadline, opts.signal]) : deadline`, the same shape as `diff-loader.ts:40-42`.
  - In the loop:
    - Call `signal.throwIfAborted()` before each read.
    - Pass `signal` as the 4th argument of `git.readFileAt`.
    - In the `catch`, re-throw when `signal.aborted` (throw `signal.reason`). Otherwise do `missing++` as today.
  - Update the doc comment: replace "Never throws" with "throws only when the signal or the deadline aborts; an unreadable file only bumps `missing`".
- **Layer / why here:** this is application-side orchestration in the reviews module. The deadline is wrapped where the call is made, as `loadDiff` does.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:**
  - Reads stay serial (D5-A).
  - The `git` parameter type stays `Pick<GitClient, 'readFileAt'>`.
  - The new parameter is optional, so `eval/replay.ts:50-55` (the `loadRules` dependency type) and `eval/replay-cli.ts:151` compile unchanged. Do not edit either file.
- **Known gotchas:** same AbortSignal rule as S2.
- **Done when:** `cd server && pnpm typecheck`, and `pnpm exec vitest run test/review-repo-rules.test.ts` passes with these new cases:
  - (a) A caller signal aborted after the first read: `loadRepoRules` rejects with that reason, and the fake's call count shows that no later file was read.
  - (b) An already-aborted signal: it rejects and makes 0 `readFileAt` calls.
  - (c) `timeoutMs: 1` with a fake `readFileAt` that waits for its signal to abort: it rejects, and the rejection's `name` is `'TimeoutError'`.
  - (d) The fake receives the signal as its 4th argument.
  - The existing "counts a read error instead of throwing" case still passes.

### S4 — Pass the batch signal from `ReviewRunExecutor` into `loadRepoRules`
- **Files:** `server/src/modules/reviews/run-executor.ts` (modify: the `Loading repo rules` step, at `:176-191`)
- **Change:** call `loadRepoRules(this.container.git, { owner: repo.owner, name: repo.name }, pull.baseSha, changedPaths, { signal: this.container.runBus.signalForAll(jobs.map((j) => j.runId)) })`. Keep the existing `try/catch` and its `repo rules: skipped (load failed)` line.
- **Layer / why here:** application. The executor owns the run's cancel signal (`run-executor.ts:139` does the same for `loadDiff`).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** do not change the run-log messages. Do not add a new log line that carries file content. A run-log line keeps only `msg` (`server/insights/gotchas.md` → Run log).
- **Known gotchas:** Run log, "only `msg` is persisted" ([INSIGHTS 2026-09-26](../../server/INSIGHTS.md#2026-09-26--runloginfomsg-data-only-msg-reaches-the-stored-run-log)): only relevant if a message is changed, which this step must not do.
- **Done when:**
  - `cd server && pnpm typecheck`
  - `pnpm exec vitest run --exclude '**/*.it.test.ts'` is green.
  - `pnpm exec vitest run test/run-cancel.it.test.ts test/intent-review.it.test.ts` is green.
  - `grep -n 'signalForAll' src/modules/reviews/run-executor.ts` shows two call sites (loadDiff and loadRepoRules).

### S5 — Add `AgentsRepository.transaction` and a forced version bump on `update`
- **Files:** `server/src/modules/agents/repository.ts` (modify: the constructor at `:51`, `update` at `:112-146`, and a new `transaction` method)
- **Change:**
  - Change the constructor to `constructor(private db: DbExecutor)` (import `DbExecutor` from `../../db/client.js`). `Db` is still accepted, because `Db` is a `DbExecutor` (`EvalRepository` precedent, `eval/repository.ts:47-56`).
  - Add `transaction<T>(fn: (repo: AgentsRepository) => Promise<T>): Promise<T> { return this.db.transaction((tx) => fn(new AgentsRepository(tx))); }` with a doc comment saying that a throw inside `fn` rolls back every write made through the given repository.
  - Change `update` to `update(workspaceId, id, patch, opts: { bumpVersion?: boolean } = {})`, with `configChanged = isConfigChange(existing, patch) || opts.bumpVersion === true`. Everything else stays: the version bump, then `snapshotVersion`, which reads the skill set through `this.db`, so inside a transaction it sees the new links.
- **Layer / why here:** infrastructure (repository). Transactions and queries live only in the repository.
- **Skills to apply:** `onion-architecture`, `drizzle-orm-patterns`, `typescript-expert`
- **Practices:**
  - No Drizzle import outside `repository.ts`.
  - Inside `fn`, every write goes through the repository it was given, never `this`.
  - `setSkills` itself is not changed: its delete and insert become atomic because they run inside the transaction.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck`. The behaviour is proven in S7's integration test.

### S6 — Replace `detachSkillsByName` with a transactional `AgentsService.syncBuiltin`
- **Files:** `server/src/modules/agents/service.ts` (modify: replace `detachSkillsByName`, at `:163-187`, and wrap `setSkills`, at `:151-161`)
- **Change:**
  - Add `syncBuiltin(workspaceId, agentId, input: { systemPrompt: string; detachSkillNames: readonly string[]; dryRun?: boolean }): Promise<{ detached: string[]; changed: boolean; fromVersion: number; toVersion: number } | undefined>`. It does all of this inside `this.repo.transaction(async (repo) => …)`:
    - `getById`; return `undefined` when the agent is missing.
    - `linkedSkills`, then `detached` = the linked names that are in `detachSkillNames`, in link order.
    - `promptChanged = agent.systemPrompt !== input.systemPrompt`, and `changed = detached.length > 0 || promptChanged`.
    - If `!changed`, return `{ detached, changed, fromVersion: v, toVersion: v }`.
    - If `dryRun`, return `toVersion: v + 1` without writing.
    - Otherwise, if `detached.length`, call `repo.setSkills(agentId, keptIds)` with the order kept. Then call `repo.update(workspaceId, agentId, promptChanged ? { systemPrompt: input.systemPrompt } : {}, { bumpVersion: true })`, and return `toVersion: row.version`.
  - Delete `detachSkillsByName`. Its only caller is `sync-builtin.ts:35`, which S7 rewrites.
  - In the existing `setSkills` (UI path), wrap the `this.repo.setSkills` call in `this.repo.transaction((r) => r.setSkills(agentId, skillIds))`. This makes its delete and insert atomic and adds no version bump (D2-A).
- **Layer / why here:** application (service). It orchestrates the repository calls inside one unit of work.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:**
  - The service never imports Drizzle or `db/schema`.
  - `assertSkillsInWorkspace` stays on `setSkills`. `syncBuiltin` only removes already-linked ids, so it needs no workspace check.
  - The `Agent` DTO is unchanged, and no route changes.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `grep -rn 'detachSkillsByName' src test` prints nothing (run in `server/`).

### S7 — Rewrite `syncBuiltinAgents` onto `syncBuiltin` and extend its integration test
- **Files:**
  - `server/src/modules/agents/sync-builtin.ts` (modify: `syncBuiltinAgents`, at `:18-56`, and the header comment at `:10-17`)
  - `server/test/agents-sync-builtin.it.test.ts` (modify)
- **Change:**
  - **The loop:** for each `[name, prompt]` of `BUILTIN_AGENT_PROMPTS`:
    - Keep the `skip … not found` line.
    - Call `service.syncBuiltin(workspaceId, agent.id, { systemPrompt: prompt, detachSkillNames: name === GENERAL_AGENT_NAME ? GENERAL_DETACHED_SKILLS : [], dryRun })`.
  - **The output lines, unchanged from today:**
    - `${name}: detached: a, b` when something was detached.
    - `${name}: unchanged` when `!changed`.
    - `${name}: vX → vY (dry run)` on a dry run.
    - `${name}: vX → vY` otherwise.
  - **The header comment:** state that each agent's sync is one transaction.
  - Leave `main()` untouched.
  - **New `.it` cases:**
    - (a) After the existing idempotency case, re-link one `GENERAL_DETACHED_SKILLS` skill with the prompt already current, then sync. The output contains `General Reviewer: detached:` and a `vX → vX+1` line. The version goes up by exactly 1, and the newest snapshot's `skills` does not contain the re-linked skill.
    - (b) Rollback: run `new AgentsRepository(db()).transaction(async (r) => { await r.setSkills(generalId, []); throw new Error('boom'); })`. It rejects with `boom`, and `skillNamesOf(generalId)` is unchanged.
  - The existing three cases must pass unchanged.
- **Layer / why here:** a composition-level CLI in the module (as today). It only calls the service.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:**
  - The CLI never touches the repository or Drizzle directly. Only the test may build an `AgentsRepository`.
  - The test builds its container with `isolatedTestConfig()`, as it already does.
- **Known gotchas:**
  - `server/insights/gotchas.md` → Tooling, "`loadConfig()` never fails on a missing `DATABASE_URL`" ([INSIGHTS 2026-09-30](../../server/INSIGHTS.md#2026-09-30--loadconfig-never-fails-on-a-missing-database_url-it-falls-back-to-local-postgres)): do not change `main()`'s config handling in this plan.
  - Tests → hermetic `.it` ([INSIGHTS 2026-09-26](../../server/INSIGHTS.md#2026-09-26--it-tests-read-the-developers-real-secrets-and-make-live-llm-calls)).
- **Done when:**
  - `cd server && pnpm typecheck`
  - `pnpm exec vitest run test/agents-sync-builtin.it.test.ts test/agents-versions.it.test.ts test/skills.it.test.ts` is green (Docker up).
  - `pnpm exec vitest run --exclude '**/*.it.test.ts'` is green.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `server/test/adapters.test.ts` | unit | an already-aborted signal rejects with its reason; guards still run first; the mock honours the signal | S2 (AC2) |
| `server/test/review-repo-rules.test.ts` | unit | an abort mid-load stops further reads and throws; an already-aborted signal makes no reads; the deadline (`timeoutMs`) fires with `TimeoutError`; the signal is forwarded; a non-abort error still counts as `missing` | S3 (AC3) |
| `server/test/run-cancel.it.test.ts`, `server/test/intent-review.it.test.ts` | integration | executor regression after the signal wiring (existing cases) | S4 (AC4) |
| `server/test/agents-sync-builtin.it.test.ts` | integration | a detach-only sync bumps the version and snapshots without the skill; transaction rollback; the existing dry-run, sync and idempotency cases | S5–S7 (AC5–AC7) |
| `server/test/agents-versions.it.test.ts`, `server/test/skills.it.test.ts` | integration | regression for `update` and `setSkills` (the UI path) | S5, S6 |

## Migrations & contracts
- **Migrations:** none.
- **Contract:** S1 changes `GitClient.readFileAt` in `server/src/vendor/shared/adapters.ts`, with a targeted one-line mirror in `client/src/vendor/shared/adapters.ts`.

## Out of scope
- Versioning skill-set changes made from the UI (`setSkills` / `linkSkill` / `unlinkSkill` bumping `version`): D2-A, follow-up.
- Concurrent reads or `git cat-file --batch` for repo rules (D5-A).
- Signals for the other `readFileAt` callers (`intent/service.ts:292`, `eval/replay.ts`). Do not edit `eval/replay.ts` or `eval/replay-cli.ts`.
- Any change to `docs/plans/10-agent-precision.md`, to routes, to the `Agent` DTO, or to the client beyond the S1 mirror line.
- Any migration and any `db:generate` run.

<!-- implementer-brief:end -->

## Context applied
- `server/insights/gotchas.md` → "Bound a git call with an `AbortSignal` passed into `GitClient`, never with `withTimeout`": shapes S2–S4 (D3-A).
- `server/insights/gotchas.md` → "`loadConfig()` never fails on a missing `DATABASE_URL`": S7 leaves `main()` alone.
- `server/insights/gotchas.md` → Tests, the hermetic `.it` rule: S7.
- Root `INSIGHTS.md` → "the two vendored `shared` copies are not actually in sync": S1 is a one-line targeted mirror.
- Root `INSIGHTS.md` → "a skill listed on a step where it has nothing to do…": `zod` and `fastify-best-practices` are not listed on any step (no schema, no route is written).
- Root `INSIGHTS.md` → "an untracked plan file makes R3 … unprovable": see Risks.
- `docs/plans/11-diff-commits-cancellation.md` → S1 / F1: the precedent for the signal on a port method that exists in both shared copies.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1–S7 | — |
| `engineering-insights` | preload | planning (Step 0 reads) | no step writes insights |
| `typescript-expert` | on demand (S1–S7) | S1–S7 | — |
| `drizzle-orm-patterns` | on demand (S5) | S5 | — |
| `security` | on demand (S2) | S2 | — |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared (server) | `src/vendor/shared/adapters.ts` (`GitClient.readFileAt`) | ports | changed |
| client (shared mirror) | `src/vendor/shared/adapters.ts` (`readFileAt` line only) | ports (vendored copy) | changed |
| server | `src/adapters/git/simple-git.ts`, `src/adapters/mocks.ts` | infrastructure | changed |
| server | `src/modules/reviews/repo-rules.ts`, `constants.ts`, `run-executor.ts` | application | changed |
| server | `src/modules/agents/repository.ts` | infrastructure | changed |
| server | `src/modules/agents/service.ts`, `sync-builtin.ts` | application / CLI | changed |

## Design notes

**Why one service method instead of the old detach + update sequence.** `update` bumps the version only on `isConfigChange` (`agents/helpers.ts:61`), and that function ignores skills. So a detach with an unchanged prompt never produced a snapshot: that is finding 2. `bumpVersion: true` inside the same transaction as `setSkills` fixes both findings 1 and 2. `snapshotVersion` (`repository.ts:148-166`) reads the skills through the transaction's executor, so it records the post-detach set.

**Why the deadline lives inside `loadRepoRules`.** This mirrors `loadDiff`. A side effect: the eval replay (`replay.ts:190`) also gets the 10 s bound without any edit. A replay whose rules load stalls now rejects instead of hanging (see Risks).

**Pass-1 options (resolved, kept for the record).**
- **D1:** A, a repository `transaction(fn)` with one bump. B, transactional `setSkills` only, which still leaves two commits.
- **D2:** A, detach path only. B, every skill-set write, which is visible over HTTP.
- **D3:** A, the signal goes into the port and the adapter. B, check the signal between files only; the in-flight git keeps running.
- **D4:** A, batch signal only. B, plus its own deadline.
- **D5:** A, serial. B, bounded concurrency. C, `cat-file --batch`.

- **Approval (user, 2026-10-01):** "так, затверджую, ризик 1 залишаємо". The plan is approved as written, and S6 also makes the UI `setSkills` delete + insert atomic, with no version bump.

## Risks & open questions
- **10 s deadline (assumption, D4-B).** On a very large clone, a cold `git show` for 40 files could approach 10 s. The run then continues without rules and logs `repo rules: skipped (load failed)`. Mitigation: the constant is easy to tune; the main session can watch run logs after merge.
- **Eval replay behaviour change.** `replay.ts:190` does not catch a `loadRules` rejection. Before, `loadRepoRules` never threw. Now a stalled rules load rejects the replay after 10 s. This is accepted because the file stays unchanged, as decided. Raise it if replays start failing.
- **Wrapping the UI `setSkills` in a transaction (S6) is not covered by a decision.** It is a correctness-only change with no visible behaviour (finding 1 names the non-atomic delete + insert). Drop it if the user wants strictly the CLI path.
- **`AbortSignal.any` / `AbortSignal.timeout`** need Node ≥ 20.3. The repo requires Node ≥ 22, and `diff-loader.ts` already uses both.
- **Commit the plan file.** Stage or commit it after approval, so that the verifier's R3 and delta checks can diff against it (root `INSIGHTS.md`, 2026-09-30).
- No doc and code disagreements were found.

## Handed off
- **architecture-reviewer:** `AgentsRepository` constructor widened to `DbExecutor`; service-level transaction boundary in `syncBuiltin`; removal of `detachSkillsByName`.
- **security review:** `readFileAt` validation order must remain guards → git (S2). No new input surface, no route change.

## Insights to record
- None. Candidate after implementation, only if it proves true: the `isConfigChange` path ignores skills, so any skill write without `bumpVersion` leaves stale snapshots (`agents/helpers.ts:61`, `agents/repository.ts:121`). It is relevant to the D2-B follow-up.

## Red-flags check
- [x] Every AC maps to at least one step or test (AC1 S1, AC2 S2, AC3 S3, AC4 S4, AC5 S5/S7, AC6 S6/S7, AC7 S7)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; no new files
- [x] Every assumption is marked (10 s deadline; S6 UI-path transaction wrapping is in Risks); no open product choice
- [x] Groups end type-checking; G1 and G2 are sequential (same package), share no file
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1 rule not applicable (pass 2)
- [x] Every step's *Skills to apply* is complete

## Handoffs → G2 (from G1)
From the G1 implementer run (2026-10-01): S1–S4 done, no deviations.
- `GitClient.readFileAt(repo, ref, path, signal?)` is the new signature; the server and client copies are identical.
- `loadRepoRules(git, repo, baseSha, paths, opts?: { signal?, timeoutMs? })`. `REPO_RULES_DEADLINE_MS = 10_000` is in `reviews/constants.ts`.
- `run-executor` passes `signalForAll` at `:182`. G2 touches none of these files.
- For review: in `SimpleGitClient.readFileAt` the ref and path guards still run before `signal?.throwIfAborted()` and before any git call. A test pins that order.
- Checks:
  - server and client typecheck ✅;
  - `adapters` + `review-repo-rules` 26 ✅;
  - server unit 467 ✅;
  - `run-cancel.it` + `intent-review.it` 6 ✅;
  - `diff` of the `readFileAt(` lines, server vs client: empty ✅.
- Fix mode, SK gap (main session caught it): the first report said "read in full" but only the first 150 lines of `typescript-expert` and `security` had been read. The implementer then read both to the end and re-checked S1–S4: no code delta.

### Skills (G1)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload (full) | S1–S4 | |
| `typescript-expert` | lines 1–150 in G1, 150–431 in fix mode | S1–S4 | |
| `security` | lines 1–150 in G1, 150–268 in fix mode | S2–S4 | |
| `server/insights/gotchas.md` | full | S2, S3 | |

## Handoffs → verification (from G2)
From the G2 implementer run (2026-10-01): S5–S7 done.
- Trivial deviations in S7:
  - a defensive `skip … not found` when `syncBuiltin` returns undefined;
  - "detach only, prompt current" now prints `detached:` + `vX → vX+1` instead of `unchanged` (intended, AC6).
- For review:
  - `AgentsRepository` takes `DbExecutor`; `transaction(fn)` hands `fn` a repository bound to the transaction;
  - `AgentsService.syncBuiltin` owns the transaction boundary;
  - the UI `setSkills` runs in a transaction, with no version bump (D2-A; risk 1 accepted);
  - `update` has a new `opts.bumpVersion`;
  - `detachSkillsByName` is removed.
- Checks:
  - server typecheck ✅;
  - `agents-sync-builtin.it` + `agents-versions.it` + `skills.it` 33 ✅ (2 new cases);
  - server unit 467 ✅;
  - `grep detachSkillsByName` finds nothing ✅.
- Insight candidate: `isConfigChange` ignores skills (`agents/helpers.ts:61`). Any skill write without `bumpVersion` leaves a stale snapshot; this bears on the D2-B follow-up.

### Skills (G2)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload (full) | S5–S7 | |
| `typescript-expert` | full (431 lines) | S5–S7 | |
| `drizzle-orm-patterns` | full (138 lines; `references/transactions.md` not opened) | S5 | |
| `engineering-insights` | preload | — | no insight written |

## Verification log
- 2026-10-01, plan-verifier full pass: **complete — needs sign-off**. 63/65 met, 0 gaps.
  - R3 not-verifiable. The plan was staged at approval, but the main session re-staged it after G2 with the handoffs, which overwrote the approval snapshot in the index.
  - R4 not-verifiable: no test-writer run.
- architecture-reviewer: **PASS**, no findings. The only difference between the vendored copies is a JSDoc sentence missing in the client copy; the contract line is identical.
- security-reviewer: **PASS**, no findings. The guards still run before `throwIfAborted` and git. On abort the run continues with no rules, which is fail-safe because rules only excuse findings.

## Gaps from /pr-self-review on c232505 (user: "давай виправимо медіум зауваження. Робити в рамках плану 16")
All three fall inside existing steps' *Files* (S4, S5, S6), so the plan is unchanged.
- **PSR-1 (S5/S6), MEDIUM:** `syncBuiltin` reads `agents.version` with a plain SELECT inside a READ COMMITTED transaction. A concurrent UI edit or a second sync can race: a lost update, or an `agent_versions` unique violation. Fix: lock the agent row at the start of the transaction (`SELECT … FOR UPDATE` through a repository method), or increment the version in SQL and snapshot from `.returning()`. → implementer, fix mode.
- **PSR-2 (S6), MEDIUM:** `toVersion: row?.version ?? v + 1` reports a bump that never happened.
- **PSR-3 (S4), MEDIUM:** `signalForAll` is called twice per batch, which adds a second set of abort listeners to every run signal.
- main-session fix: PSR-2 — `service.ts` throws `NotFoundError` when `update` returns no row, so the transaction rolls back the detach; `toVersion` comes from the row.
- main-session fix: PSR-3 — `run-executor.ts` computes `batchSignal` once and passes it to both `loadDiff` and `loadRepoRules`.
- Fix mode PSR-1 (implementer, 2026-10-01):
  - `AgentsRepository.lockById` (`getById` + `.for('update')`); `syncBuiltin` calls it first in its transaction.
  - New `.it` case: an outer transaction holds the lock and bumps the version. The waiting sync must read `v+1` and end at `v+2`. There are no sleeps.
  - Break check: swapping `lockById` back to `getById` makes the test fail. A `Promise.all` race version passed without the lock, so it was dropped.
  - Skills read in full: `drizzle-orm-patterns` (`SKILL.md` + `references/transactions.md`), `typescript-expert`.
  - Checks: server typecheck ✅; `agents-sync-builtin.it` + `agents-versions.it` + `skills.it` 35 ✅; server unit 467 ✅.
- Delta verification (plan-verifier, 2026-10-01): PSR-1, PSR-2 and PSR-3 are met. Result: complete — needs sign-off (64/65; R4 is not-verifiable). R3 is now met: the brief above the marker is unchanged against HEAD. Two test defects found in `server/test/agents-sync-builtin.it.test.ts`:
  - **PSR-4:** the `Promise.all` "two concurrent syncs … (row lock)" test (`:170`) is still in the file, although the fix-mode report says it was dropped. It passes without the lock, so it proves nothing. Its bare `.sort()` also compares versions as strings, so it would break once versions cross 9 → 10. Remove it.
  - **PSR-5:** the outer-transaction test (`:199`) waits a fixed 20 `setImmediate` ticks. If the sync's first query reaches Postgres only after the writer commits, the test passes even without the lock. Make it deterministic: poll `pg_locks` / `pg_stat_activity` until the sync's backend is waiting on a lock, then commit the writer.
- Fix mode PSR-4/PSR-5 (implementer, 2026-10-01): only `server/test/agents-sync-builtin.it.test.ts` changed.
  - PSR-4: the `Promise.all` test is removed.
  - PSR-5: `waitForBlockedAgentsQuery` polls `pg_stat_activity` every 5 ms for a backend with `wait_event_type = 'Lock'` on `"agents"`, with a 5 s timeout and a clear error. The writer commits only after that.
  - Break check: with `lockById` → `getById`, the row-lock test fails on the version assertion, not on the poll timeout. `service.ts` is restored to its PSR-1/2 hunks only.
  - Checks: server typecheck ✅; `agents-sync-builtin.it` 6/6 ×3 ✅; `agents-versions.it` + `skills.it` 28 ✅.
- Delta verification (plan-verifier, 2026-10-01): PSR-4 and PSR-5 are met. Result: complete — needs sign-off (64/65). Only R4 is still open: no test-writer run. The `service.ts` diff holds only the PSR-1/2 hunks, with no leftover mutation.
- test-writer (2026-10-02): **R4 is now verifiable.**
  - New: `simple-git-read-file-at.test.ts`; `review-repo-rules.test.ts` +9; `review-repo-rules.it.test.ts` +2; `agents-sync-builtin.it.test.ts` +4.
  - Break checks across `repo-rules.ts`, `simple-git.ts`, `mocks.ts`, `run-executor.ts`, `agents/service.ts`, `agents/repository.ts`: every mutation turned the named tests red, each was reverted and checked by shasum, and `git diff HEAD -- server/src` is empty.
  - Two tests fail on purpose and expose production defects in `repo-rules.ts`:
    - **TW-1:** `ruleCandidatePaths` sorts before slicing to `REPO_RULES_MAX_FILES` (`:36`), so on a wide PR the root `insights/gotchas.md` is dropped. This is the same issue as the self-review HIGH.
    - **TW-2:** the segment check splits on `/` only (`:30`), so a path like `a\..\b/c.ts` yields candidates containing `\`. It is not exploitable on POSIX git (`\` is a literal character and the file counts as missing), and `readFileAt` has no backslash guard either.
  - Both await the user's decision.
- main-session fix: TW-1, TW-2 (user: "так роби правки"). In `server/src/modules/reviews/repo-rules.ts` `ruleCandidatePaths`:
  - the root pair is emitted first and always survives the cap; the other candidates are sorted and sliced to `REPO_RULES_MAX_FILES - 2`;
  - a changed path containing `\` is skipped, like an empty, `.` or `..` segment.
  - The two failing tests now pass unchanged; `review-repo-rules.test.ts` 21 ✅ and `review-repo-rules.it.test.ts` 4 ✅.
