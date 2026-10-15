# Test Report — proof (break checks) for plan 40 multi-agent review: T2, T3, T4, T7

Saved by the main session from the `test-writer` hand-back, 2026-10-15 (closes R4).

**Input:** `docs/plans/40-multi-agent-review.md` (proof only; no new tests requested, none written)
**Status:** done. All four files fail under a targeted mutation and every subject is restored. One caveat on T7: the 30 s timer alone is redundant, see Proof.

## Cases
No new cases. These existing tests were proved:

| Case | Proves | Tier | Test |
|---|---|---|---|
| foreign-workspace multi-agent run | 404, not 200 (horizontal) | it | `multi-agent-boundaries.it.test.ts` › "answers 404 for a multi-agent run that belongs to another workspace" |
| foreign agent id or PR | 404 and no rows created | it | same file › "answers 404 for an agent or a PR of another workspace…" |
| estimates | only `status='done'` runs counted | it | same file › "estimates from the last 5 done runs only…" |
| wide finding (>10 lines) | grouped by start line only (GR1) | unit | `multi-agent-helpers.test.ts` › "groups a wide finding (>10 lines) by its start line only" |
| concurrency | ≥2 in flight, ≤4 at once, and the 5th waits | it | `review-concurrency.it.test.ts` › "runs at most 4 agents at once…" |
| trace polling | 404 → "pending" → trace once written | unit | `RunTraceDrawer.pending.test.tsx` › AC-54 |
| 30 s fallback | "No trace available yet." 30 s after the end | unit | same file › AC-54a |

## Tests written
None. All tests already existed, and every one failed under a mutation, so none needed rewriting.

## Proof
Baseline before any mutation: 19 + 5 + 3 server tests and 5 client tests, all green. Postgres was up (`devdigest-postgres`), and the `.it` runs used `TESTCONTAINERS_RYUK_DISABLED=true`.

| # | Test file | Subject · mutation | Failing test (reason) | shasum before → after | Stability |
|---|---|---|---|---|---|
| 1a | `multi-agent-boundaries.it.test.ts` | `reviews/repository/multi-agent.repo.ts` · `getMultiAgentRun` loses `eq(workspaceId)` in its `where` | "answers 404 for a multi-agent run that belongs to another workspace": `expected 200 to be 404` | `971b4fda…` → `971b4fda…` restored | 1 run, 5/5 ✅ (`.it` run once) |
| 1b | same | same file · `lastDoneRunsPerAgent` loses `eq(agentRuns.status,'done')` | "estimates from the last 5 done runs only…": `[4000,5000,6000,7000,999999]` vs `[3000,…,7000]` (a non-done run leaked in) | `971b4fda…` → `971b4fda…` restored | n/a |
| 1c | same | `agents/repository.ts` · `AgentsRepository.list` returns all agents, no workspace filter (see note) | "answers 404 for an agent or a PR of another workspace…": `expected 200 to be 404` | no sha recorded before the edit; `git hash-object` after = `4d0cc15e…` = `HEAD:` blob, file unchanged in git → restored | n/a |
| 2 | `multi-agent-helpers.test.ts` (T2) | `reviews/multi-agent.helpers.ts` · `groupEndOf` returns `endOf(f)` (old full-range behaviour) | "groups a wide finding (>10 lines) by its start line only": `expected false to be true` (18 others pass) | `222a9a67…` → `222a9a67…` restored | 3/3 ✅ (19 passed) |
| 3a | `review-concurrency.it.test.ts` (T3) | `reviews/run-executor.ts` · `PQueue({concurrency: 1})` | "runs at most 4 agents at once…" and "cancelling one run…" both time out with "timed out waiting for: 4 pending review calls" | `1f8b4944…` → `1f8b4944…` restored | 1 run, 3/3 ✅ |
| 3b | same | same file · `concurrency: 100` (no cap) | "runs at most 4 agents at once…": `expected 5 to be 4` | same, restored | n/a |
| 4a | `RunTraceDrawer.pending.test.tsx` (T7) | `client/src/lib/hooks/trace.ts` · `refetchInterval` → `false` (polling dropped) | AC-54 "shows 'pending' on a 404 right after the run ends, then the trace once written" fails | `29679a7c…` → `29679a7c…` restored | n/a |
| 4b | same | `run-trace-drawer/RunTraceDrawer.tsx` · 30 s fallback dropped: `setTimeout` made a no-op AND the `deadline > Date.now()` clause removed from `waiting` | AC-54a "falls back to 'No trace available yet.' 30 s after the end": element not found | `7b787bb4…` → `7b787bb4…` restored | 3/3 ✅ (5 passed) |

Notes:
- **1c:** the service gets its agents through `agents.list(workspaceId)`, and the scoping itself lives in `AgentsRepository.list`. The boundary is proved: a foreign agent id answers 404 because of that filter, and the test fails when it goes. No shasum was recorded before the edit; the git blob-hash comparison stands in for it (main session also confirmed `git diff -- server/src/modules/agents/repository.ts` is empty).
- **4 (weak spot):** neither fallback mutation alone fails the test (timer no-op alone: 5/5 pass; `deadline > Date.now()` clause removed alone: 5/5 pass), because after the 30 s mark the failed poll refetches re-render the component and the render-time `deadline` check shows the fallback anyway. The 30 s fallback is doubly implemented; the test guards the behaviour, not each mechanism. The timer-only mutation is judged an equivalent mutant (user-visible behaviour unchanged).

## Verification
| Command | Package | Result |
|---|---|---|
| `pnpm exec vitest run test/multi-agent-helpers.test.ts` ×3 | server | 19/19 each ✅ |
| `pnpm exec vitest run src/components/run-trace-drawer/RunTraceDrawer.pending.test.tsx` ×3 | client | 5/5 each ✅ |
| `pnpm exec vitest run test/multi-agent-boundaries.it.test.ts test/review-concurrency.it.test.ts` (post-revert) | server | 8/8 ✅ |

## Production defects found
None.

## Not verified
- Stability of the two `.it` files is a single run each.
- The `.it` break checks ran in the shared tree with nothing else running.

## Changed paths
No net edits. Temporary mutations, all reverted (shasums match, post-revert tests green): `server/src/modules/reviews/repository/multi-agent.repo.ts`, `server/src/modules/agents/repository.ts`, `server/src/modules/reviews/multi-agent.helpers.ts`, `server/src/modules/reviews/run-executor.ts`, `client/src/lib/hooks/trace.ts`, `client/src/components/run-trace-drawer/RunTraceDrawer.tsx`.

## Coverage gaps left
- T7: the 30 s timer is not isolated from the poll-driven re-render (see note 4).
