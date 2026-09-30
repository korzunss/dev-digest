# Development Plan: Stop git when a review's `diffCommits` times out or is cancelled
Status: done
Save as: docs/plans/11-diff-commits-cancellation.md
Spec: none

## Goal & acceptance criteria
`withTimeout` (`platform/resilience.ts:13-24`) is only a `Promise.race`. When `loadDiff`'s 90 s budget (`reviews/diff-loader.ts:34`, `reviews/constants.ts:16`) runs out, `SimpleGitClient.diffCommits` (`adapters/git/simple-git.ts:115-146`) keeps fetching and deepening in the shared clone. After this plan, git is really stopped, git operations that write to one clone never overlap, and the review still falls back to `pr_files`.
- AC1: When `loadDiff`'s deadline expires, the `signal` passed to `diffCommits` is aborted, so simple-git kills the running git child. `loadDiff` then falls back to `pr_files` with the note `base...head diff unavailable (timed out after 90 s — git stopped)`.
- AC2: When **every** run in the batch is cancelled while the diff loads, git is aborted and the note reads `base...head diff unavailable (all runs cancelled — git stopped)`. Cancelling only some of the runs does not abort git (D3-B).
- AC3: `clone`, `fetchPullHead`, `sync` and `diffCommits` on the same clone path never run at the same time. Time spent waiting for the lock counts toward the caller's deadline. A waiter whose signal aborts leaves the queue at once, without running, and without letting its successor overlap the current holder (D2-B).
- AC4: Every simple-git instance the adapter creates has `timeout: { block: 300_000 }`. A block timeout surfaces as `git stalled — no output for 300 s, stopped`, never as the raw plugin error (D1-C).
- AC5: In `intent/service.ts`, the `diffCommits` call (`:197`) runs under a 90 s signal, and `fetchPullHead` (`:278`) runs under a signal (10 s, plus the review-budget abort) instead of a `withTimeout` race (D4-B).
- AC6: On a timeout or cancel, `loadDiff` also emits a pino `warn` `{ owner, name, prId, elapsedMs, reason: 'timeout' | 'cancelled' }` with the message `diffCommits stopped` (D5-A).

## Decisions needed
None open — see *Decisions recorded*. The pass-1 options are below the marker, under *Design notes → Pass-1 options*.

## Decisions recorded
User, 2026-09-30: "D1-C, D2-B, з усіма іншими погоджуюсь". Full plan approved by the user on 2026-09-30 ("так, затверджую"). Status approved → in-progress (G1).
- **D1 → C:** the `signal` on `GitClient.diffCommits` (A) **plus** an adapter-level `timeout: { block }` as a per-command backstop for every git call (B). The `block` value and its semantics depend on research Q2.
- **D2 → B** (against the recommendation): an in-process per-clone-path mutex in `SimpleGitClient` around the operations that mutate the clone. The user accepted the trade-off that a review can wait behind `repo-intel` `sync`. Pass 2 must decide whether time spent waiting for the lock counts toward the caller's deadline, and whether an aborted signal releases a waiter.
- **D3 → B:** git is aborted only when every run in the batch is cancelled.
- **D4 → B:** also `intent/service.ts:197` (`diffCommits`) and `:278` (`fetchPullHead`, which gets the same optional `signal`).
- **D5 → A:** the run-log message names the cause ("timed out after 90 s — git stopped" / "cancelled"), plus a pino `warn` with repo and elapsed ms.

**Pass-2 resolutions (planner):**
- **Lock wait counts toward the deadline.** The caller's signal is a total budget. A review queued behind a long `sync` times out and falls back to `pr_files`, which is correct and bounded. Otherwise, a 90 s budget would start only once the lock was free, and the review could hang for as long as a `sync` or clone lasts.
- **An aborted signal releases a waiter.** It rejects with `signal.reason` and never runs its body. The lock queue stays chained on the *holder*, so the next waiter still waits for the running git (S2 algorithm).
- **`block = 300_000` ms** (assumption A1 — see *Design notes → block value*).

## Prerequisites
None. No new dependencies; simple-git 3.36.0 is already installed.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S3 | shared port + server adapters (`adapters/git`) | — | `GitClient.diffCommits(repo, base, head, signal?)` and `fetchPullHead(repo, n, signal?)`. `KeyedMutex` in `adapters/git/clone-lock.ts`. Exported `GIT_BLOCK_TIMEOUT_MS` and `toGitStopError` in `simple-git.ts`. After an abort the adapter rethrows `signal.reason` as-is. |
| G2 | S4–S6 | server platform (`sse.ts`) + application (`reviews`, `intent`) | G1 | — |

## Steps
### S1 — Add an optional `signal` to `diffCommits` and `fetchPullHead`  [Contract]
- **Files:** `server/src/vendor/shared/adapters.ts` (modify — `GitClient` only) · `client/src/vendor/shared/adapters.ts` (modify — the `fetchPullHead` line of `GitClient` only, `:218`; F1 → A)
- **Change:** `fetchPullHead(repo: RepoRef, n: number, signal?: AbortSignal): Promise<void>;` (`:272`) and `diffCommits(repo: RepoRef, base: string, head: string, signal?: AbortSignal): Promise<UnifiedDiff>;` (`:288`). Extend both doc comments:
  - aborting `signal` stops the running git process;
  - the call rejects with `signal.reason`;
  - time spent waiting for the clone's lock counts toward the signal.
- **Client mirror: methods in both copies only.** Mirror a signature change into the client copy only for methods that exist in both copies.
  - `fetchPullHead` exists in both (`client/src/vendor/shared/adapters.ts:218`). Apply the identical signature there, as a targeted edit of that one line; the doc comment is optional.
  - `diffCommits` does not exist in the client's `GitClient` (`:216-232`), so do not add it; the same applies to `sync`/`diffNameOnly`, as in plan 07 S5.
  - Copy nothing else, and never the whole folder.
- **Layer / why here:** ports. The contract comes first, and a parameter-only change keeps `MockGitClient` (`adapters/mocks.ts:308,327`) compiling unchanged, because a method with fewer parameters is still assignable.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** the port names no vendor (no "simple-git" in the doc comment). `signal` is the last, optional parameter.
- **Known gotchas:** root `INSIGHTS.md` → "the two vendored `shared` copies are not actually in sync": do not copy the folder.
- **Done when:**
  - `cd server && pnpm typecheck` · `cd client && pnpm typecheck`
  - `diff <(grep -n 'fetchPullHead(' server/src/vendor/shared/adapters.ts | sed 's/^[0-9]*://;s/^ *//') <(grep -n 'fetchPullHead(' client/src/vendor/shared/adapters.ts | sed 's/^[0-9]*://;s/^ *//')` prints nothing (the two signatures match).
  - `git diff --name-only -- client/` lists only `client/src/vendor/shared/adapters.ts`, and `git diff -- client/src/vendor/shared/adapters.ts` touches only the `fetchPullHead` line (plus an optional doc comment).
  - `grep -n 'diffCommits' client/src/vendor/shared/adapters.ts` prints nothing.

### S2 — `KeyedMutex`: a per-key FIFO lock that honours an abort signal
- **Files:** `server/src/adapters/git/clone-lock.ts` (create) · `server/test/clone-lock.test.ts` (create)
- **Change:** `export class KeyedMutex { run<T>(key: string, signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> }`. Algorithm:
  1. `signal?.throwIfAborted()`.
  2. `prev = tails.get(key) ?? Promise.resolve()`; create `mine` plus its `release`; `tail = prev.then(() => mine)`; `tails.set(key, tail)`; then `void tail.then(() => { if (tails.get(key) === tail) tails.delete(key); })`. The map entry is deleted only after `tail` settles, so a waiter that aborted never lets a newcomer overlap the running holder.
  3. `await` whichever settles first: `prev`, or the signal's `abort` event, which rejects with `signal.reason`. Remove the listener in both cases.
  4. Run `await fn()`; in `finally`, call `release()`.
- **Layer / why here:** infrastructure (`adapters/git`). The lock guards a filesystem resource that only the adapter knows about (`clonePathFor`). Services never see it.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** no imports from `modules/**` or `simple-git` (pure). Explicit return types. No `any`: `signal.reason` is `unknown` and is rethrown as-is.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm exec vitest run test/clone-lock.test.ts` passes and asserts:
  - (a) same key → second `fn` starts only after the first settles;
  - (b) different keys run concurrently;
  - (c) waiter B aborts while A holds → B rejects with its reason and never runs, and C (queued after B) still starts only after A settles;
  - (d) the lock is released when `fn` throws;
  - (e) a pre-aborted signal rejects without running `fn`.

### S3 — `SimpleGitClient`: abort signal, `block` backstop, clone lock, stop-error mapping
- **Files:** `server/src/adapters/git/simple-git.ts` (modify) · `server/test/simple-git-diff-commits.test.ts` (modify)
- **Change:**
  - `export const GIT_BLOCK_TIMEOUT_MS = 300_000;` with a comment: an inactivity timer, not a deadline; above the longest silent phase (see *Design notes*).
  - `private git(repo, signal?)` becomes `simpleGit({ baseDir: this.clonePathFor(repo), timeout: { block: GIT_BLOCK_TIMEOUT_MS }, ...(signal ? { abort: signal } : {}) })`. The same options apply to the two `simpleGit(dest)` / `simpleGit(this.cloneDir)` calls in `clone` (`:69,:78`) through one private factory `gitAt(baseDir, signal?)`.
  - `private locks = new KeyedMutex()`. Wrap the **whole** body of `clone` (key `dest`), `fetchPullHead`, `sync` and `diffCommits` (key `clonePathFor(repo)`) in `this.locks.run(key, signal, …)`. In `diffCommits`, SHA validation stays first, before the lock. Read-only methods (`diff`, `diffNameOnly`, `blame`, `log`, `readFile`, `readFileAt`, `currentHead`) are not locked.
  - `export function toGitStopError(err: unknown, signal?: AbortSignal): unknown`:
    - `signal?.aborted` → return `signal.reason`;
    - `(err as { plugin?: unknown }).plugin === 'timeout'` → return `new Error(\`git stalled — no output for ${GIT_BLOCK_TIMEOUT_MS / 1000} s, stopped\`)`;
    - otherwise → `err`.
    - Each locked body is `try { … } catch (err) { throw toGitStopError(err, signal); }`.
    - Detect the plugin by duck typing, without importing `GitPluginError`: whether the package root exports it is not established.
  - `fetchPullHead(repo, n, signal?)` and `diffCommits(repo, base, head, signal?)` pass `signal` into `this.git(repo, signal)`.
- **Layer / why here:** infrastructure. Process control is an adapter concern, and the port only says "stop".
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:**
  - SHA validation (`COMMIT_SHA_RE`) still runs before any git call or lock;
  - no new shell execution (simple-git spawns with argv);
  - the stall error carries no URL (clone URLs may embed a token, `repos/service.ts:55`);
  - never `withTimeout`/`Promise.race` inside a locked body: the lock must be held until the simple-git task itself settles.
- **Known gotchas:** `server/insights/gotchas.md` → Git & diffs, "simple-git `merge-base` resolves `''`" ([link](../../server/INSIGHTS.md#2026-09-29--simple-git-rawmerge-base-a-b-resolves-empty-instead-of-throwing-when-there-is-no-merge-base)): keep the empty-output test and the `hasMergeBase` `catch → false`. Inside that `catch`, a stop error must propagate: rethrow when `signal?.aborted`, or when `plugin === 'timeout'`.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/simple-git-diff-commits.test.ts` passes, with the existing three cases plus new ones asserting:
  - (a) a pre-aborted signal rejects with that exact `reason`;
  - (b) `AbortSignal.timeout(1)` on a SHA pair that needs fetching rejects, or succeeds if git is faster. Either way, afterwards neither `.git/shallow.lock` nor `.git/index.lock` exists, and a follow-up `diffCommits` succeeds;
  - (c) two concurrent `diffCommits` on the same repo both return `['feature.ts']`;
  - (d) `toGitStopError({ plugin: 'timeout' })` → the stall message; `toGitStopError(x, abortedSignal)` → `abortedSignal.reason`; `toGitStopError(plainErr)` → `plainErr`.

### S4 — `RunBus.signalForAll(runIds)`: aborts once every run is cancelled
- **Files:** `server/src/platform/sse.ts` (modify) · `server/test/run-bus.test.ts` (modify)
- **Change:** `signalForAll(runIds: string[]): AbortSignal`. Take `signals = runIds.map((id) => this.signalFor(id))` and create an `AbortController`:
  - it aborts with `new Error('All runs cancelled')` when `runIds.length > 0 && signals.every((s) => s.aborted)`;
  - the condition is checked immediately and on each signal's `abort` event (`{ once: true }`);
  - with an empty list it never aborts.
- **Layer / why here:** platform. `RunBus` owns the per-run controllers (plan 08 S7), so the batch view belongs beside them.
- **Skills to apply:** `typescript-expert`
- **Practices:** explicit return type; no import from `modules/**`.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm exec vitest run test/run-bus.test.ts` passes and asserts:
  - cancelling 1 of 2 runs → not aborted; cancelling both → aborted;
  - all runs already cancelled → aborted at creation;
  - `[]` → never aborted.

### S5 — `loadDiff` passes one signal (deadline + batch cancel) and names the cause
- **Files:** `server/src/modules/reviews/diff-loader.ts` (modify) · `server/src/modules/reviews/run-executor.ts` (modify) · `server/test/diff-loader.test.ts` (modify)
- **Change:**
  - `loadDiff(git, repo, pull, repoRef, opts: LoadDiffOptions = {})` with `interface LoadDiffOptions { signal?: AbortSignal; timeoutMs?: number; logger?: { warn: (obj: unknown, msg?: string) => void } }`. Define the logger type locally: importing `Logger` from `run-executor.ts` would create a cycle.
  - Replace `withTimeout(...)` (`:34-37`):
    - `const deadline = AbortSignal.timeout(opts.timeoutMs ?? DIFF_COMMITS_TIMEOUT_MS)`;
    - `const signal = opts.signal ? AbortSignal.any([deadline, opts.signal]) : deadline`;
    - `git.diffCommits(repoRef, pull.baseSha, pull.headSha, signal)`;
    - `const started = Date.now()` before the call.
  - In the `catch`, classify by **the signals, not the error**:
    - `deadline.aborted` → note `base...head diff unavailable (timed out after ${Math.round(ms / 1000)} s — git stopped)`, reason `'timeout'`;
    - else `opts.signal?.aborted` → `base...head diff unavailable (all runs cancelled — git stopped)`, reason `'cancelled'`;
    - else today's message. For the first two, `opts.logger?.warn({ owner: repoRef.owner, name: repoRef.name, prId: pull.id, elapsedMs: Date.now() - started, reason }, 'diffCommits stopped')`.
    - Drop the `withTimeout` import.
  - `run-executor.ts:130`: `loadDiff(this.container.git, this.repo, pull, { owner: repo.owner, name: repo.name }, { signal: this.container.runBus.signalForAll(jobs.map((j) => j.runId)), logger })`.
- **Layer / why here:** application (reviews module). The deadline and the batch-cancel policy are review decisions. The service reaches git only through the port.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:**
  - no `simple-git` import in `modules/**`;
  - the run-log note (message only) and the pino payload carry no URL, token or diff content;
  - keep the `pr_files` fallback and the `throw` when both are empty (`:57-62`) unchanged.
- **Known gotchas:**
  - `server/insights/gotchas.md` → Run log, "only `msg` is persisted" ([link](../../server/INSIGHTS.md#2026-09-26--runloginfomsg-data-only-msg-reaches-the-stored-run-log)): the cause must be in the note string itself.
  - Git & diffs, "never diff by branch name" ([link](../../server/INSIGHTS.md#2026-09-29--a-review-diff-by-base-branch-name-reviews-unrelated-commits-silently)): with `baseSha` set, a stopped git still falls back to `pr_files`, never to `git.diff`.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/diff-loader.test.ts` passes, with new cases using a fake `diffCommits` that rejects with `signal.reason` on abort:
  - (a) `timeoutMs: 20` → source `pr_files`, note contains `timed out after 0 s — git stopped` (`Math.round(20/1000)` = 0), the fake's signal is aborted, and `warn` is called with `reason: 'timeout'`;
  - (b) an already-aborted `opts.signal` → note contains `all runs cancelled — git stopped` and `reason: 'cancelled'`;
  - (c) a plain rejection → today's note, and `warn` is not called.
- **Integration:** `cd server && pnpm exec vitest run test/reviews.it.test.ts test/run-cancel.it.test.ts` (Postgres up).

### S6 — Intent: `diffCommits` and `fetchPullHead` under signals
- **Files:** `server/src/modules/intent/service.ts` (modify) · `server/src/modules/intent/constants.ts` (modify) · `server/test/intent-service.test.ts` (modify)
- **Change:**
  - `constants.ts`: `export const GIT_DIFF_TIMEOUT_MS = 90_000;`, with a comment saying it matches the review's `DIFF_COMMITS_TIMEOUT_MS` (assumption: same budget; the constant is duplicated to avoid a cross-module import).
  - `fileSummaries(pull, repo, diff?, signal?)`: the `diffCommits` call (`:197`) passes `signal ? AbortSignal.any([signal, AbortSignal.timeout(GIT_DIFF_TIMEOUT_MS)]) : AbortSignal.timeout(GIT_DIFF_TIMEOUT_MS)`. `runClassification` (`:221`) passes its `signal`. The legacy `diff` branch is unchanged.
  - `:278`: replace `withTimeout(this.deps.git.fetchPullHead(repoRef, pull.number), SOURCE_TIMEOUT_MS)` with `this.deps.git.fetchPullHead(repoRef, pull.number, <same any() shape with SOURCE_TIMEOUT_MS>)`, keeping `.catch(() => undefined)`. `withTimeout` stays imported: other calls still use it.
- **Layer / why here:** application (intent module), reached through the port.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** the `ensureForReview` abort (`:162`) must now reach git through the same `signal`. Behaviour on failure is unchanged: `fileSummaries` still returns `[]`, and the doc fetch stays best-effort.
- **Known gotchas:** `intent-service.test.ts:377` asserts `toHaveBeenCalledWith(expect.anything(), 'b'.repeat(40), pull.headSha)`. With the new argument it fails unless `expect.any(AbortSignal)` is appended.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/intent-service.test.ts` passes, with `:377` updated and a new assertion that `fetchPullHead` receives an `AbortSignal` as its 3rd argument.
- **Integration:** `cd server && pnpm exec vitest run test/intent-review.it.test.ts test/intent.it.test.ts`.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `server/test/clone-lock.test.ts` (create) | unit | AC3 | S2 |
| `server/test/simple-git-diff-commits.test.ts` | unit (real git, temp dirs) | AC1, AC3, AC4 | S3 |
| `server/test/run-bus.test.ts` | unit | AC2 | S4 |
| `server/test/diff-loader.test.ts` | unit | AC1, AC2, AC6 | S5 |
| `server/test/intent-service.test.ts` | unit | AC5 | S6 |
| `reviews.it.test.ts`, `run-cancel.it.test.ts`, `intent-review.it.test.ts`, `intent.it.test.ts` | integration | regression | S5, S6 |

## Migrations & contracts
- **Contract:** S1 changes `GitClient` in `server/src/vendor/shared/adapters.ts`, with a targeted client mirror of `fetchPullHead` only (the one changed method present in both copies). `diffCommits` is not mirrored because the client's `GitClient` lacks it.
- **Migrations:** None.

## Out of scope
- `JobRunner`'s own `withTimeout` race (`platform/jobs.ts:67`), which can orphan a clone or sync the same way. A follow-up; the lock now at least keeps that orphan from overlapping other writes to the same clone.
- Locking the read-only git methods, adding `--progress`, or deleting stale `*.lock` files.
- Any client, reviewer-core or mcp-server change.
- Changing `DIFF_COMMITS_TIMEOUT_MS`, `SOURCE_TIMEOUT_MS` or `INTENT_REVIEW_BUDGET_MS`.

<!-- implementer-brief:end -->

## Context applied
- `server/insights/gotchas.md` → Git & diffs (both items) → S3 (keep the empty-merge-base check), S5 (no fallback to the branch diff).
- `server/insights/gotchas.md` → Run log → S5: the cause goes in the note string.
- Root `INSIGHTS.md` → "the two vendored `shared` copies are not actually in sync" → S1: no folder copy; mirror only methods present in both copies (`fetchPullHead`).
- Root `INSIGHTS.md` → "a skill listed on a step where it has nothing to do…" → `zod` and `fastify-best-practices` are listed on no step (no schema, no route).
- Root `INSIGHTS.md` → "the onion skill's `depcruise` gate … not real" → no `depcruise` Done-when.
- `docs/plans/07-review-diff-base-sha.md` S5/S6 → the port change is server-only; the `loadDiff` fallback order is kept.
- `docs/plans/08-llm-call-reliability.md` S7 → `RunBus.signalFor` is the basis for S4.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1, S2, S3, S5, S6 | — |
| `engineering-insights` | preload | — | read-only at planning; the wrap-up belongs to the main session |
| `typescript-expert` | on demand (S1–S6) | S1–S6 | — |
| `security` | on demand (S3, S5) | S3, S5 | — |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| server (shared) | `src/vendor/shared/adapters.ts` | ports | changed |
| client (shared mirror) | `src/vendor/shared/adapters.ts` — `GitClient.fetchPullHead` only (S1, F1 → A) | ports (vendored copy) | changed |
| server | `src/adapters/git/clone-lock.ts` | infrastructure | new |
| server | `src/adapters/git/simple-git.ts` | infrastructure | changed |
| server | `src/platform/sse.ts` | platform | changed |
| server | `src/modules/reviews/diff-loader.ts`, `run-executor.ts` | application | changed |
| server | `src/modules/intent/service.ts`, `constants.ts` | application | changed |

## Design notes
- **block value.** Research Q2: `block` is an **inactivity** timer, re-armed on every stdout/stderr chunk; git prints no progress on a piped stderr without `--progress`.
  - So on a fetch, the whole receive plus `index-pack` phase is silent. A depth-1 clone (`repos/constants.ts:10`) or a `--depth 50` resync of a large repo can plausibly stay silent for minutes.
  - The backstop exists only to kill a git that is truly hung (a dead remote, a stuck helper). The real bound on `diffCommits` stays the 90 s signal. 300 s is above that and above `JobRunner`'s 120 s, so the backstop never fires before either of the real budgets.
  - 120 s was rejected: a silent large clone would be killed where today it completes.
- **Why classify by signal in `loadDiff`.** A rejection can come from the simple-git abort plugin (`GitPluginError`), from the lock waiter (`signal.reason`), or from `throwIfAborted`. The adapter normalises all three to `signal.reason`. Still, `deadline.aborted` / `opts.signal.aborted` is the one check that cannot be misread.
- **Why the mutex is held until the task settles.** The research says the abort sends SIGINT and git removes its `*.lock` tempfiles on SIGINT. Releasing the lock before the killed child exits could let the next fetch meet `shallow.lock`.
- **Pass-1 options** (for the record):
  - D1: A signal · B block · C both.
  - D2: A follow-up · B per-path mutex.
  - D3: A no · B all cancelled · C any.
  - D4: A `loadDiff` only · B plus intent `:197`/`:278`.
  - D5: A named cause plus warn · B generic.
  - Recorded choices are above.

### Research → pass 2 (external, 2026-09-30)
Source: simple-git 3.36.0 `server/node_modules/simple-git/dist/cjs/index.js` (primary); git `master` source for Q3. No experiment was run.
- **Q1:** `abort` → `spawned.kill("SIGINT")`, no escalation (`:1951-1956`). The rejection is `GitPluginError` with `.plugin === 'abort'` (`:1163-1171`), and a plain git failure has no `.plugin`. A fatal error purges that instance's queue (`:1806-1812`). Each instance serializes its own tasks (`:1768-1789`). This adapter creates a new `simpleGit()` per call (`simple-git.ts:51-52`), so there is no cross-call serialization today.
- **Q2:** `timeout.block` is an **inactivity** timer, re-armed on every stdout/stderr chunk (`:1503-1535`). It uses the same SIGINT kill, with `.plugin === 'timeout'`. It is a stall detector, not a deadline. A silent phase (negotiation, `index-pack`) longer than `block` gets killed, and git prints no progress on a piped stderr unless `--progress` is passed.
- **Q3 (medium confidence):** git removes `*.lock` tempfiles on SIGINT/SIGTERM (`tempfile.c`, `sigchain.c`), but not on SIGKILL. `index-pack` and `git-remote-https` are not registered for `clean_on_exit`, so they likely exit via SIGPIPE/EOF (not tested).
- **Q4:** an already-aborted signal is rejected in `spawn.before`, and nothing is spawned (`:1174-1180`).
- **Not established:** the installed `git --version`; on-disk lock state after SIGINT; whether `GitPluginError` is in the package-root typings.
- **Implications for pass 2:** map `GitPluginError` `abort`/`timeout` to the caller's timeout/cancel, never to a git failure. Hold the D2 mutex until the killed child's `close` event has resolved the task, so the next fetch doesn't start while a lock still exists. Choose `block` well above the longest silent phase, because it is not the 90 s total budget.
- **Main-session check after pass 2 (2026-09-30), which answers the first item under *Risks*:** the task settles only after the child exits, not at `kill()`. `kill()` only records `rejection` and sends SIGINT (`dist/cjs/index.js:1937-1943`). `done(...)` runs from the `close` hook (`:1928-1935`), which `completionDetectionPlugin` calls after the child's `close` event, or 50 ms after `exit` (`:1232-1290`). So a lock held until the task settles covers the direct `git` process's own lockfile cleanup. Installed git (dev machine): `2.54.0 (Apple Git-157)`.

## Risks & open questions
- **Does the task promise settle at the child's `close`, or earlier?** The research implies `close`. If simple-git rejects at `kill()` time, the lock is released while git is still exiting. S3 test (b) checks for leftover lock files, but a fast local repo may not reproduce the race. Mitigation: that test, plus a follow-up if lock files are ever seen.
- **SIGINT does not escalate.** A git that ignores SIGINT keeps running and keeps the lock: the lock is held until the task settles, which it won't. Every later caller on that clone then times out and falls back. The result is bounded but degraded; no escalation is planned.
- **Whether helpers exit with their parent** (`index-pack`, `git-remote-https`) is untested (research Q3, medium confidence).
- **The `abort` option typing.** `abort: AbortSignal` is present in the simple-git typings (`grep` hit at line 50 of a `.d.ts`). The exact spread shape is proven only by `pnpm typecheck` in S3.
- **Reviews now wait behind `sync` and clone** (D2-B trade-off, accepted). A long resync turns reviews of that repo into `pr_files` reviews.
- **The 300 s `block` could kill a legitimately silent clone** of a very large repo, where today it would finish. Accepted, as assumption A1. Adding `--progress` is the alternative if it happens.
- **`JobRunner`'s race** (`jobs.ts:67`) still orphans clone and sync jobs. Out of scope.

## Handed off
- architecture-reviewer: `KeyedMutex` placement in `adapters/git`; `RunBus.signalForAll` in platform; the duplicated 90 s constant in intent (S6).
- security review: process control and kill semantics in `simple-git.ts`; no clone URL (which may carry a token) in stall errors or logs; SHA validation stays before the lock.

## Insights to record
- `server/INSIGHTS.md` · Tool & Library Notes — simple-git `timeout.block` is an inactivity timer, not a deadline, and `abort` sends SIGINT with no escalation (simple-git 3.36.0 `dist/cjs/index.js:1503-1535,1951-1956`). To be confirmed by the implementation.

## Red-flags check
- [x] Every AC maps to at least one step or test (AC1 S3/S5, AC2 S4/S5, AC3 S2/S3, AC4 S3, AC5 S6, AC6 S5)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; product choices are in *Decisions recorded*
- [x] Groups end type-checking; G1 and G2 are sequential
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [x] The brief above the marker is under ~20,000 characters
- [x] Every step's *Skills to apply* is complete

## Handoffs → G2
From the G1 implementer run (2026-09-30, status done; S1–S3 done). Trivial deviations: S3 also rethrows a stop error from the `cat-file -e` probe (an abort there is not "commit missing"); S2's aborted waiter chains `void prev.then(release)` so its tail still resolves after the holder; `clone`/`sync` call `locks.run(key, undefined, …)`.
- Files: `server/src/vendor/shared/adapters.ts` (S1), `server/src/adapters/git/clone-lock.ts` + `server/test/clone-lock.test.ts` (S2, new), `server/src/adapters/git/simple-git.ts` + `server/test/simple-git-diff-commits.test.ts` (S3).
- For G2: `GitClient.diffCommits(repo, base, head, signal?)` and `fetchPullHead(repo, n, signal?)`. On abort the adapter rethrows `signal.reason` as-is, so the caller tells timeout from cancel by which signal fired. Lock wait counts toward the signal. `GIT_BLOCK_TIMEOUT_MS` and `toGitStopError` are exported from `simple-git.ts`. `MockGitClient` compiles unchanged.
- Checks: server typecheck ✅; `clone-lock` + `simple-git-diff-commits` 14 ✅; server unit 35 files / 400 ✅; `git diff --name-only -- client/` empty.
- Main-session review: mutex ordering is correct (the chain never rejects; an aborted waiter hands on only after the holder settles); no locked method re-enters another locked method on the same key.

### Skills (G1)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1, S2, S3 | |
| `typescript-expert` | on demand | S1, S2, S3 | |
| `security` | on demand | S3 | |

## Handoffs → verification (after G2)
From the G2 implementer run (2026-09-30, status done; S4–S6 done). Trivial deviations: S6 adds a module-level `withDeadline(signal, ms)` helper at the end of `intent/service.ts` in place of the inline `AbortSignal.any` shape; S5 wraps the `loadDiff` call in `run-executor.ts` across lines.
- Files: `server/src/platform/sse.ts` + `server/test/run-bus.test.ts` (S4); `server/src/modules/reviews/diff-loader.ts`, `run-executor.ts` + `server/test/diff-loader.test.ts` (S5); `server/src/modules/intent/service.ts`, `intent/constants.ts` + `server/test/intent-service.test.ts` (S6).
- For review: `RunBus.signalForAll` (platform) gives `loadDiff` the batch-cancel signal. `GIT_DIFF_TIMEOUT_MS` in `intent/constants.ts` deliberately duplicates the review constant. The `diffCommits stopped` warn payload is `owner, name, prId, elapsedMs, reason`, with no URL or token.
- Checks: server typecheck ✅; targeted units 24 ✅; server unit 35 files / 407 ✅; `reviews.it`, `run-cancel.it`, `intent-review.it`, `intent.it` 19 ✅.

### Skills (G2)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S5, S6 | |
| `typescript-expert` | on demand | S4, S5, S6 | |
| `security` | on demand | S5 | |

## Verification log
### Wave 1 (2026-09-30)
- Full server suite (main session, once after the last group): `cd server && pnpm typecheck` ✅; `pnpm test` → 53 files / 530 tests, exit 0, including all 18 `.it` files.
- security-reviewer (plan 11): PASS, no findings. Pre-existing (not caused by this change, not decided): `diff-loader.ts:69` puts a non-stop git error's `.message` into the run-log note, and a `git fetch origin` failure could name a token-bearing remote URL (`repos/service.ts:55`); `clone(url, dest, args)` passes `url` without `--` (argv unchanged). Handoff: the stale `simple-git.ts` line anchors in the `devdigest-appsec` skill.
- architecture-reviewer (plan 11): PASS. `KeyedMutex` placement, `RunBus.signalForAll` and the duplicated `GIT_DIFF_TIMEOUT_MS` are all cleared. **F1 (HIGH, downgraded from CRITICAL by the skeptic pass):** S1 changes `fetchPullHead` in the server's shared copy only, but that method also exists in `client/src/vendor/shared/adapters.ts:218`, so the two copies now differ. S1's "no client mirror" reasoning covers `diffCommits` only. The fix needs a file outside the plan's steps, so it is a plan change pending the user's decision.
- plan-verifier (Wave 1): **incomplete**: 61/66 met, 3 partial, 2 not-verifiable. Gaps (fix mode, S3 files):
  - **AC4:** the unlocked methods that now carry the `block` timer (`simple-git.ts` `currentHead` :157, `diff` :161, `diffNameOnly` :226, `blame` :234, `log` :239, `readFileAt` :272) still surface the raw `plugin: 'timeout'` error. They need `toGitStopError`.
  - **D6/T2:** S3 test (b) runs on SHAs the first case already fetched in the shared clone (`simple-git-diff-commits.test.ts:59` vs `:80-81`), so it never exercises kill-during-fetch. It needs its own clone or fresh commits.
  Needs sign-off: R3 (plan file untracked), R4 (no test-writer run).

### Sign-off and plan change (2026-09-30)
User: "F1-A, R3 підтверджую, R4 приймаю".
- R3 signed off: after approval only the main session edited this plan file (Status, Decisions recorded, handoffs, Verification log); the planner and implementers did not.
- R4 accepted: no test-writer run for this plan.
- **F1 → A (plan change):** add `signal?: AbortSignal` to `fetchPullHead` in `client/src/vendor/shared/adapters.ts` (a targeted mirror of S1). That file is outside every step's *Files*, so the plan goes back to `draft` until the user approves the amended S1. The fix-mode gaps AC4 and D6/T2 wait for that approval and then run in one pass with F1.
- **Amended plan approved** by the user on 2026-09-30 ("так, затверджую"): S1 now carries the client `fetchPullHead` mirror (F1 → A), plus a client row in *Affected modules*. Status draft → approved → in-progress (fix mode: F1, AC4, D6/T2).
- **Fix mode F1, AC4, D6/T2 (2026-09-30):** implementer done. F1 is correct: the client `fetchPullHead` signature matches the server's. AC4 is correct: `toGitStopError` now wraps `currentHead`, `diff`, `diffNameOnly`, `blame`, `log` and `readFileAt`. Checks: server and client typecheck ✅, server unit 407 ✅. Skills note: the implementer did not read `typescript-expert`, `zod` or `security` for these edits; this is recorded as a process deviation.
- **Main-session review: D6/T2 still partial.** The new test uses its own clone, but `AbortSignal.timeout(1)` very likely fires before or during `cat-file`, not during the fetch, and `.catch(() => undefined)` never asserts that the call was aborted. The test is sent back to fix mode with a deterministic recipe. A shell check confirmed that `git config remote.origin.uploadpack "sh -c 'sleep 3; exec git-upload-pack \"\$@\"' --"` on the fresh clone makes `git fetch` take 3 s over `file://`.
- **Fix mode D6/T2, second pass (2026-09-30):** implementer done. Test (b) now uses its own fresh clone and `remote.origin.uploadpack = 'sleep 3 #'`. It asserts that `diffCommits(…, AbortSignal.timeout(500))` rejects with `signal.reason` in under 2500 ms, that no `shallow.lock`/`index.lock` is left, and that a follow-up succeeds. 3 × 9/9 stable; server typecheck ✅. Deviation (material, accepted): the main session's `sh -c 'sleep 3; exec git-upload-pack …'` recipe hung the test, because `git fetch` did not exit on SIGINT with that wrapper.
- **Main-session check of that SIGINT finding:**
  - `file://` with the `sh -c` wrapper: reproduced, git did not exit 6 s after SIGINT. `git-upload-pack` was left over and was killed by hand.
  - Real HTTPS remote (`https://github.com/git/git.git`, `fetch --deepen=5000`): SIGINT → `exit null SIGINT` 8 ms after the signal, `close` at the same time, no lock files, no leftover `git-remote-https`/`index-pack`.
  - Conclusion: the ignored SIGINT is specific to a local transport run through a shell, not to the forge HTTPS path the product uses. The *Risks* bullet "SIGINT does not escalate" stands as accepted, now with this evidence.
- Full server suite after fix mode (main session): typecheck ✅ (server + client); `pnpm test` 53 files / 530 tests, exit 0, incl. all 18 `.it` files.
- plan-verifier (delta after fix mode): **complete — needs sign-off**: 64/66 met, no gaps, no unplanned changes. The two not-verifiable items, R3 and R4, were signed off / accepted by the user on 2026-09-30. Handoff applied by the main session: the index row now names the client `fetchPullHead` mirror.

### Final (2026-09-30)
Verification complete — needs sign-off. The user signed off R3 and accepted R4. Status → `done`. Open follow-ups (not decided):
- `JobRunner`'s timeout race (`platform/jobs.ts:67`) still orphans clone/sync jobs;
- the pre-existing git error `.message` in the `loadDiff` run-log note could carry a token-bearing remote URL (`diff-loader.ts:69`);
- `clone(url, dest, args)` passes `url` without `--`;
- the stale `simple-git.ts` line anchors in the `devdigest-appsec` skill.
