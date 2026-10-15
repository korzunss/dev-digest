# Test Report — UF correction groups G9/G10 (S21–S27, AC-15a–h, AC-41a/b, T15–T19)

Saved by the main session from the `test-writer` hand-back, 2026-10-15.

**Input:** `docs/plans/40-multi-agent-review.md` (+ Handoffs → G9, → G10)
**Status:** done. Postgres was up (`devdigest-postgres`), so the `.it` file ran with `TESTCONTAINERS_RYUK_DISABLED=true`.

## Cases (T15–T19 checked against the ACs; only real gaps filled)
T15, T16, T17, T18 and T19 already cover their ACs (15a–c, 15e–h, 41a/b). The gaps were these three:

| Case | Proves | Tier | Test |
|---|---|---|---|
| Recent and latest reads poll every 3 s while a run is `running`, then stop | AC-15d. No existing test covered the hooks' `refetchInterval`; the `RecentRuns` rerender test cannot fail if polling is removed. | unit | `client/src/lib/hooks/multi-agent.test.tsx` (5 tests: poll then stop for recent, no poll when settled, no fetch without repoId, poll then stop for latest, no poll for `{run:null}`) |
| A run stamped with another workspace on this workspace's PR is not returned by `GET /pulls/:id/multi-agent` | Workspace filter of the latest-run read (the foreign-PR 404 test never reaches it, because `getPull` answers 404 first). | integration | `multi-agent-recent.it.test.ts` › "does not return a run stamped with another workspace for this workspace's PR" |
| A run stamped with another workspace on this workspace's repo is omitted by `GET /repos/:id/multi-agent-runs` | Horizontal scoping of the recent-runs read when the repo itself is ours. | integration | `multi-agent-recent.it.test.ts` › "omits a run stamped with another workspace from this workspace's repo" |

## Tests written
| File | Tier | Kind | Result |
|---|---|---|---|
| `client/src/lib/hooks/multi-agent.test.tsx` (new) | unit | behaviour (fake timers, mocked `../api`) | 5 passed |
| `server/test/multi-agent-recent.it.test.ts` (+2 tests) | integration | trust-boundary | 11 passed |

## Proof
Shasums are before mutation → after restore. All match.

| Subject | Mutation | Failing test(s) | shasum before → after | Stability |
|---|---|---|---|---|
| `server/src/modules/reviews/repository/multi-agent.repo.ts` `recentMultiAgentRunsForRepo` | dropped the `workspace_id` condition | "returns [] for a repo of another workspace"; "omits a run stamped with another workspace…" (new) | `70a703be…cfba` → `70a703be…cfba` | `.it` run once |
| same file, `latestMultiAgentRunForPull` | dropped the `workspace_id` condition | only the new "does not return a run stamped with another workspace…" fails; the old 404 test stayed green, so the gap was real | `70a703be…cfba` → `70a703be…cfba` | `.it` run once |
| `server/src/modules/reviews/multi-agent.helpers.ts` `overallStatus` (AC-15a) | `every(done ‖ cancelled)`, i.e. cancelled counts as done | helpers "derives the overall state (AC-15a)"; `.it` "derives done, partially_failed, failed and running (AC-15a)" | `1ba2da86…d31d` → `1ba2da86…d31d` | existing files |
| same file, `orderRecent` (running-first) | running rank 0 → 1 | helpers "lists running runs first…"; `.it` "lists a running run before a newer done one (AC-15b)" | `1ba2da86…d31d` → `1ba2da86…d31d` | existing files |
| `client/src/lib/hooks/multi-agent.ts` `useRecentMultiAgentRuns` (AC-15d) | `refetchInterval` returns `false` always | `multi-agent.test.tsx` › "polls while a run is running and stops once none is (AC-15d)" | `119e4d0a…1751f5` → `119e4d0a…1751f5` | 3/3 |
| `…/pulls/[number]/_components/RunHistory/RunHistory.tsx` (AC-15h) | (1) link forced off; (2) `&& r.multi_agent_run_id` dropped so null rows also link | "links a run that belongs to a multi-agent run… and not a single-agent run" fails both times | `29169656…c94dd` → `29169656…c94dd` | existing file |

## Verification
| Command | Package | Result |
|---|---|---|
| `pnpm typecheck` | client | clean |
| `pnpm exec vitest run src/lib/hooks/multi-agent.test.tsx RecentRuns LatestRunLink RunHistory TabsView ConfigureRun` | client | 6 files, 33 passed |
| `pnpm typecheck` | server | clean |
| `vitest run test/multi-agent-recent.it.test.ts test/multi-agent-helpers.test.ts test/multi-agent-contracts.test.ts` (RYUK disabled) | server | 3 files, 38 passed |

## Production defects found
None.

## Not verified
- No break check on `useLatestMultiAgentRun` polling (same file and mechanism as the recent hook, which was proved).
- No break check on TabsView (T19) or RecentRuns/LatestRunLink rendering (not in the requested set; tests unchanged).

## Changed paths
Only the two test files above. Break-check subjects are back to their recorded shasums.

## Coverage gaps left
- ConfigureRun's wiring of `useRecentMultiAgentRuns` is covered only through a mocked hook (T16); end-to-end polling on the page rests on the hook test plus the main session's live check.
