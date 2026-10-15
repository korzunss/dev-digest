# Test Report — pr-self-review fix rounds 2 and 3 (PR2-*, PR3-*) of plan 40

Saved by the main session from the `test-writer` hand-back, 2026-10-15 (closes R4 and PR2-C1 for the fix rounds).

**Status:** done. R4 and PR2-C1 proved. No production defects.

## Tests written
| File | Tier | Kind | Result |
|---|---|---|---|
| `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.test.tsx` (+3) | unit | behaviour / focus (PR2-C1: focusout outside closes; inside/trigger/null relatedTarget stays open; focus returns to the trigger once not busy) | 11 passed |
| `client/src/components/run-trace-drawer/RunTraceDrawer.pending.test.tsx` (+1) | unit | timeout belongs to the deadline it fired for (PR2-H1) | 8 passed |
| `client/src/app/repos/[repoId]/pulls/[number]/page.test.tsx` (new) | unit | drawer remounts when `?trace=` changes (PR3-C1) | 2 passed |
| `client/src/app/repos/[repoId]/multi-agent/_components/status-color.test.ts` (new) | unit | unknown status → neutral pair (PR2-C3) | 2 passed |

## Proof
Shasum before the mutation; identical after the revert in every row.

| Subject (shasum) | Mutation | Failing test | Result |
|---|---|---|---|
| `components/run-trace-drawer/RunTraceDrawer.tsx` (`387a1bcc…`) | `stillRunning = running && liveRunning` | PR2-H1 "run ends > 30 s after mount"; PR3-C2 "stream closes while the parent says running" | both fail |
| same | `timedOut = … expiredDeadline !== null` (no deadline tie) | "timeout belongs to the deadline it fired for" (new) | fails |
| `pulls/[number]/page.tsx` (`4fa8226a…`) | remove `key={traceRunId}` | `page.test.tsx` (PR3-C1) | fails |
| `RunReviewDropdown.tsx` (`a9ccaf51…`) | Escape → `setPosition(null)` | PR3-C3 Escape test | fails |
| same | focusout no longer closes | "closes when focus moves to an element outside…" | fails |
| same | focusout guard removed | "stays open while focus moves inside…" | fails |
| same | restore effect without `busy` guard | "returns focus to the trigger after closing for a start…"; PR3-C3 | both fail |
| `multi-agent/[runId]/_components/TabsView/TabsView.tsx` (`dbf3fc90…`) | ref focus replaced by a lookup that finds nothing | TabsView Arrow-key test (PR2-C2) | fails |
| `multi-agent/_components/status-color.ts` (`fc3529af…`) | default returns `undefined` | status-color fallback test | fails |
| `server/src/modules/reviews/multi-agent.service.ts` (`985e4639…`) | `failRunningRunsOfMultiRun` call removed | PR2-S1 `.it`; PR3-S2 `.it` | both fail |
| same | raw `err.message` stored | PR2-S1 `.it` (PR3-S1) | fails |
| same | delete-group catch swallows without log | PR2-S2 `.it` | fails |
| same | one try instead of two | PR3-S2 `.it` | fails |

Gaps found and closed during the proof: the PR2-H1 deadline tie (the dropped-tie mutation passed all 14 earlier drawer tests) and PR3-C1 (no test existed).
Limits: PR2-C2 mutation makes the lookup find nothing rather than reinstating `getElementById`; real browser Tab order around the portal is simulated with `focusOut` + `relatedTarget`; `page.test.tsx` stubs children and hooks (proves the `key` wiring only).

## Stability
Client set 3/3 green; drawer tests 3× after the final revert; `multi-agent-fixes.it.test.ts` 5 passed after the final revert (`TESTCONTAINERS_RYUK_DISABLED=true`).

## Changed paths
Only the four test files above; all subjects restored (shasums match).
