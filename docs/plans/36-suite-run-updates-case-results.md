# Development Plan: An agent suite run updates each case's last result
Status: done
Save as: docs/plans/36-suite-run-updates-case-results.md
Spec: none (bug fix — restores spec 011 AC-19 / AC-20 for agent suite runs)
Execution: single-agent

## Goal & acceptance criteria
An agent suite run ("Run all evals" / `POST /agents/:id/eval-runs`) stores every case
result in `eval_case_results` but never writes `eval_suite_cases.last_result`, so the
agent Evals tab rows and the "N / M passing" pill keep results from older single-case
runs while the metric cards show the suite run. After this fix each case's
`last_result` is the result of the latest suite run that ran it, written in the same
transaction as the result row.

- AC1: After an agent suite run completes, every case of that agent has `last_result`
  equal to the result the run recorded for it (`GET /eval-runs/:id` → `results[].result`
  with that `case_id`), overwriting an older value.
- AC2: The number of cases whose `last_result.status` is `passed` equals the run's
  `cases_passed` (what the client's `passingCount` counts, AC-20).
- AC3: A case deleted mid-run still yields a result row with `case_id = null` and a
  `completed` run (the existing PR2 test stays green); the surviving case gets its
  `last_result`.

## Decisions needed
None.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S2 | server: eval repository + `.it` test | — | none (last group) |

## Steps
### S1 — Write `last_result` inside `writeCaseResult`'s transaction
- **Files:** `server/src/modules/eval/repository/pipeline.repo.ts` (modify)
- **Change:** in `private async writeCaseResult(runId, r)` (`pipeline.repo.ts:198-214`),
  after the `tx.insert(t.evalCaseResults)` and inside the same `this.db.transaction`
  callback, add: when `r.caseId !== null`,
  `await tx.update(t.evalSuiteCases).set({ lastResult: r.result }).where(eq(t.evalSuiteCases.id, r.caseId))`.
  Do not touch `updatedAt` (same as `setLastResult`, `pipeline.repo.ts:166-171`, which
  sets only `lastResult`). Update the JSDoc of `recordCaseResult` (`:183`) to say it also
  stores the result as the case's last result. Leave `recordCaseResult`'s FK fallback
  (`:184-196`) unchanged: on a deleted case the insert raises the FK violation, the whole
  transaction rolls back, and the retry with `caseId: null` skips the update.
  `pipeline-service.ts` `executeSuite` (`:461`) is **not** changed.
- **Layer / why here:** infrastructure (repository) — the write must be atomic with the
  result insert, and only the repository may touch `db/schema`/Drizzle. A second
  `setLastResult` call from the service would be a separate statement that throws
  outside the FK fallback when the case was deleted.
- **Skills to apply:** `onion-architecture`, `drizzle-orm-patterns`, `typescript-expert`
- **Practices:** the update uses `tx`, never `this.db`, so it commits or rolls back with
  the insert; the guard is `r.caseId !== null` (no update with a null id); the service
  gains no Drizzle import and no new repository call; filter by id only — the id comes
  from the run's own `listCases` rows of that workspace.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` exits 0 ·
  `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` passes.

### S2 — Prove it in the suite-run integration test
- **Files:** `server/test/eval-pipeline-runs.it.test.ts` (modify)
- **Change:**
  1. Add a new `it('sets each case\'s last_result to the suite run\'s result, so the passing count follows it (AC-19, AC-20)')`
     directly after the test that sets `run2` (`:104-117`), before the AC-75 test.
     It reads `GET /eval-runs/${run2}` and `GET /agents/${agentId}/eval-cases`, and asserts:
     every case has a non-null `last_result` that `toEqual`s the run's `results[]`
     entry whose `case_id` is that case's id; the count of cases with
     `last_result.status === 'passed'` equals the run's `cases_passed`
     (= `EXPECTED_NEW.passed`). Since `run1` already ran these cases with the old
     prompt, this also proves the newer run overwrote the older result.
  2. In the PR2 test (`:263-293`), after the existing assertions, fetch
     `GET /agents/${id}/eval-cases` and assert the surviving case (`cases[1]`) has a
     `last_result` equal to its row's `result` (`rows.find(r => r.caseId === cases[1].id)`),
     and the list no longer contains the victim.
- **Layer / why here:** test (`.it` — the bug is the DB write; needs Postgres).
- **Skills to apply:** `typescript-expert`
- **Practices:** reuse the file's helpers (`json`, `getRun`, the shared `agentId`/`run2`
  state) — no new app or fixture; assert through the HTTP DTOs (`last_result`,
  `results[].case_id`), not the raw table, for AC1/AC2; poll nothing new (the run is
  already terminal when `run2` is set).
- **Known gotchas:** `.it` tests all skip with "Expected Reaper to map exposed port 8080"
  → rerun with `TESTCONTAINERS_RYUK_DISABLED=true`
  ([server/INSIGHTS.md](../../server/INSIGHTS.md#2026-10-05--it-tests-all-skip-with-expected-reaper-to-map-exposed-port-8080)).
- **Done when:** `cd server && pnpm exec vitest run test/eval-pipeline-runs.it.test.ts`
  passes with 0 skipped, including the new AC-19/AC-20 test and the PR2 test ·
  `cd server && pnpm typecheck` exits 0.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `server/test/eval-pipeline-runs.it.test.ts` (new `it` after run2) | integration | AC1, AC2 | S2 |
| `server/test/eval-pipeline-runs.it.test.ts` (PR2 test, extended) | integration | AC3 | S2 |

## Migrations & contracts
None. `eval_suite_cases.last_result` already exists (`server/src/db/schema/eval.ts:84`);
no contract field changes.

## Out of scope
- `pipeline-service.ts` and `skill-suite-service.ts` (the skill path already sets
  `last_result`, `skill-suite-service.ts:244`; single runs via `setLastResult`,
  `pipeline-service.ts:357`).
- Any client change — the agent EvalsTab already refetches cases when a run finishes.
- Back-filling `last_result` from past suite runs.

<!-- implementer-brief:end -->

## Context applied
- `server/insights/gotchas.md` → Tests: "`.it` tests all skip with Expected Reaper…" — S2 Done-when.
- `server/insights/gotchas.md` → DB: row types / `db/schema` confined to repositories — why S1 stays in the repository (no service change).
- No `INSIGHTS.md` heading (server or root) bears on this bug beyond the above.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | Context applied | — |
| `onion-architecture` | preload | S1 | — |
| `drizzle-orm-patterns` | on demand (S1) | S1 | — |
| `typescript-expert` | on demand (S1, S2) | S1, S2 | — |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| server | `src/modules/eval/repository/pipeline.repo.ts` | infrastructure | changed |
| server | `test/eval-pipeline-runs.it.test.ts` | test | changed |

## Design notes
- **Why the repository, not the service.** `executeSuite` (`pipeline-service.ts:457-468`)
  calls `recordCaseResult` per case. Adding `setLastResult` after it in the service would
  work for live cases, but it is a second statement outside the transaction; and
  `recordCaseResult`'s FK fallback (`pipeline.repo.ts:184-196`) only covers the insert.
  Inside `writeCaseResult`, a deleted case fails the insert first, the transaction rolls
  back, and the retry has `caseId: null`, so it never updates. An UPDATE on a missing id
  affects 0 rows and does not throw, so a delete racing between insert and update is
  harmless too.
- **Client already refreshes.** `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.tsx:55-60`
  invalidates `["eval-cases", agent.id]` and `["eval-detail", agent.id]` when the watched
  run leaves `running`; the pill is `passingCount(list)` (`client/src/components/eval-suite/helpers.ts:4-5`,
  counts `last_result?.status === "passed"`). So the server fix alone makes the rows and
  pill match the cards.

## Risks & open questions
- A case edited mid-run: `updateCase` clears `last_result` (`pipeline.repo.ts:147-155`),
  then the in-flight run writes the result for the pre-edit input back. The skill path
  (`skill-suite-service.ts:244`) behaves the same today; accepted as-is, not a regression.
- "Run all evals" via `/eval/run-all` uses the same `executeSuite`, so it is covered by
  the same change (not separately tested).
- None for the researcher.

## Handed off
- architecture-reviewer: none needed (repository-internal change).
- security review: none — no trust boundary touched.

## Insights to record
- None.

## Red-flags check
- [x] Every AC maps to at least one step or test (no-spec plans)
- [x] Every spec AC-n has a row in *Spec traceability* with a step or test — n/a (no spec)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; technical choices are in *Decisions needed*, product gaps are GAPn
- [x] Groups end type-checking; parallel groups share no file
- [x] No group under 3 files / ~80 lines that could merge with a neighbour — single group, single-agent
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1: n/a (single pass: trivial bug fix)
- [x] Execution mode recommended per the D4 rule (or single pass: single-agent)
- [x] Every step's *Skills to apply* is complete (the implementer reads only those)
- [x] `bash .claude/skills/sdd/scripts/sdd.sh plan-lint <plan>` prints `plan-lint: ok`

## Verification log
- 2026-10-12 approved by the user ("Так …", while believing the fix was already live — it was not; told them); status -> in-progress; implementer run `all`
- 2026-10-12 implement all: S1 (writeCaseResult sets last_result in the same transaction when caseId != null), S2 (AC-19/20 .it test + PR2 extension); server typecheck ok, runs.it 16, unit 920. Main session: diff read (7 lines in pipeline.repo.ts), full server .it suite 35 files / 307 passed

- 2026-10-12 plan-verifier full pass: incomplete — 22/25 met; gaps SK1, SK2 (typescript-expert not read), R4 not-verifiable (no break-check proof)
- 2026-10-12 main session break check (R4): guard `if (r.caseId !== null)` -> `if (false && …)` in pipeline.repo.ts → the AC-19/20 test and the PR2 test failed (2 failed / 14 passed); file restored, shasum identical, 16 passed. Fix mode for SK1/SK2 started

- 2026-10-12 verification delta (SK1, SK2, R4): complete — 25/25 met; status -> done

## Handoffs → all
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1 | |
| `drizzle-orm-patterns` | on demand (frontmatter only) | S1 | plain `tx.update` |
| `typescript-expert` | not read | — | implementer did not open SKILL.md |

## Handoffs → fix-1
- SK1/SK2: `typescript-expert` read; S1/S2 re-checked, no issue, no code change (typecheck 0, runs.it 16 stand).

| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1 | |
| `drizzle-orm-patterns` | on demand | S1 | |
| `typescript-expert` | on demand | S1, S2 | |
