# Plan 34 — workflow retro (Eval Pipeline)

Date: 2026-10-12 · Execution: multi-agent · Sources: `docs/plans/34-eval-pipeline.md`, `sdd.sh usage-scan` / `flags` / `cost` (run 2026-10-12), `docs/plans/assets/34-eval-pipeline/{research.md,research-stryker.md,mutation-report.md}`

## 1. What happened
| Phase | Rounds | Outcome |
|---|---|---|
| Spec | 5 spec-creator runs on one resumed agent (2 passes + 3 correction rounds) | approved twice, then `implemented` — log 2026-10-12 `retro-fact: spec-creator ran as one agent resumed 5 times`, `spec re-approved after GAP1-GAP4` |
| Research | 1 repo run (resumed after the turn limit) + 1 external run | Q1–Q8 answered, Stryker versions — `retro-fact: researcher (Q1-Q8) stopped at its 40-turn limit`, `agent: ext-research` |
| Plan | pass 1 + pass 2 | approved with every recommendation — `plan-decisions:`, `plan-approve:` |
| Implement | 9 groups, 10 implementer runs (G2 re-run after a Step 0 stop) | all done — `implement G1` … `implement G9`, `implement G2 run 1: stopped at Step 0` |
| Tests + `.it` | 1 test-writer run, full `.it` once | +4 boundary tests; 32 files / 274 passed — `tests:`, `it-suite:` |
| Review | 2 iterations + 1 post-close delta (7 reviewer runs) | arch PASS, security PASS (SF1 fixed), verifier complete — `review iteration 1 triage`, `verification after fix-loop 3` |
| Fix | 2 fix-loop runs + 4 main-session fixes | 10 + 2 gaps closed — `fix-loop 1:`, `fix-loop 3 (pr-self-review)`, `main-session fix:` ×3 |
| Close | closed, reopened after `/pr-self-review`, closed again | `close: plan done`, `reopened done -> in-progress`, `close: plan done again` |

## 2. Cost
```
cost: plan=34 weighted_tokens=input+1.25*cache_creation+0.1*cache_read+5*output
| Stage | Runs | Agents | Weighted tokens | Share | Cache hit | Busy |
|---|---:|---:|---:|---:|---:|---:|
| implement | 9 | 9 | 3753400 | 33.4% | 95.3% | 34m21s |
| review | 7 | 7 | 2171090 | 19.3% | 96.1% | 14m31s |
| plan-p2 | 1 | 1 | 1731443 | 15.4% | 97.2% | 19m29s |
| spec-p1 | 1 | 1 | 878958 | 7.8% | 79.9% | 632m02s |
| research | 1 | 1 | 762958 | 6.8% | 96.5% | 3m37s |
| fix-loop | 2 | 2 | 647324 | 5.8% | 95.8% | 6m43s |
| plan-p1 | 1 | 1 | 346744 | 3.1% | 94.3% | 3m55s |
| tests | 1 | 1 | 333091 | 3.0% | 94.1% | 2m10s |
| docs | 1 | 1 | 332735 | 3.0% | 93.1% | 2m07s |
| spec-p2 | 1 | 1 | 225219 | 2.0% | 65.9% | 0m38s |
| ext-research | 1 | 1 | 69585 | 0.6% | 79.8% | 1m21s |
cost: total 11252546 weighted tokens, 26 runs, 24 agents
cost: window 875m39s
cost: busy 720m15s, parallelism 1.02
cost: critical path spec-p1 632m02s
cost: unattributed 3 runs, 3 agents, 1248181 weighted tokens (sessions 1, untimed 0 not counted)
cost: main-session tokens not included
```
```
flag: F1 plan=34 stage=implement weighted_tokens=… 3753400 median=526740 over 8 plans
flag: F1 plan=34 stage=research weighted_tokens=… 762958 median=289735 over 4 plans
flag: F1 plan=34 stage=spec-p1 weighted_tokens=… 878958 median=135579 over 3 plans
flag: F3 plan=34 handback unknown x1
repeat: F1 plans=24,26,28,34
repeat: F3 plans=28,34
```
Main-session tokens are not included. Busy time and the critical path are first→last timestamp spans: `spec-p1` 632m is an upper bound that counts the agent's idle time between resumes (`retro-fact: spec-creator … mostly time waiting for the user's answers`), not working time.

## 3. What worked
- The draft-only plan pass 1 plus a single decisions round: the user took every recommendation in one answer, and pass 2 was approved without a correction round (`plan-decisions:`, `plan-approve:`).
- One group per run with the handoff written into the plan: the G2 implementer refused to start without `Handoffs → G1` instead of guessing (`implement G2 run 1: stopped at Step 0`), and G8 ran in parallel with G5–G7 on disjoint files (`agent: implement af2e8d9b…` / `ac67ea3d…`).
- Main-session spot checks after every group (re-run of one Done-when, diff read) — they were the only reading of the hand-backs, since `handback-check` rejected every report (`implement G1:` … `implement G7:`).
- The reviewers' complementary scopes: security found SF1 (CSRF on run-all), the verifier found the inflated mutation scope, neither overlapped (`review iteration 1 triage`).
- `pnpm verify:l06` as a single hermetic acceptance command, re-run by the main session after each fix wave (`implement G9:`, `fix-loop 1:`).

## 4. What did not work
1. **Correctness bugs reached `done` and forced a reopen** — `/pr-self-review` found PR1 (paid workers after a rejection) and PR2 (FK on mid-run case delete) after all three reviewers had passed; cost: one extra fix-loop, one verifier delta, two closes (`retro-fact: /pr-self-review … found two real HIGH correctness bugs`, `reopened done -> in-progress`). Tag: judgement (no reviewer owns runtime correctness of a fire-and-forget path).
2. **Agents ran out of turns before reporting** — the researcher (40) and the first full plan-verifier pass (60) produced no report and had to be resumed; the verifier then left 23 items for a delta (`retro-fact: researcher (Q1-Q8) stopped …`). Share: review 19.3 % + research 6.8 %. Tag: mechanical.
3. **Tests that cannot fail were accepted as done** — the G8 Done-when checked a score, not the scope (`retro-fact: the G8 implementer's Done-when checked the mutation score`); the fix-loop 3 `pool` test passed against the bug (`retro-fact: the PR1 pool() test … passed against the buggy code`). Both caught late (verifier, main-session break check). Tag: mechanical.
4. **`handback-check` never matched an implementer report** — every hand-back read as "unknown" and needed a manual diff read (`handback: unknown G1`, `implement G2: … unknown per handback-check`); `repeat: F3 plans=28,34`. Tag: mechanical.
5. **The spec needed three correction rounds after pass 2** — the mentor's EvalCaseModal requirement, SG1/4/5, and the plan's GAP1–GAP4 (`retro-fact: spec-creator ran as one agent resumed 5 times`); spec-p1 is 7.8 % with the lowest cache hit (79.9 %). Tag: spec gap.
6. **A harness eval ran concurrently with a writing agent** — `eval:workflow`'s leak check flagged doc-writer's files, costing a re-run and an A/B (`retro-fact: eval:workflow was run while doc-writer was writing`). Tag: mechanical. Plus 4 unlogged agents (`cost: unattributed 3 runs …`, `retro-fact: 4 agents ran outside any sdd stage`).

| Checklist | Finding | Source |
|---|---|---|
| duplicated context | The plan (~50 KB, brief 26 KB) was re-read by 10 implementer runs and 7 reviewer runs; cache hit stayed 93–97 %, so re-reads were cheap per run, but implement is still 33.4 % | `sdd.sh cost` implement/review rows; `plan-approve:` (brief ~26 KB accepted) |
| rework / round-trips | 3 spec corrections, 2 review iterations + 1 post-close delta, 2 fix-loops, 4 main-session fixes, 1 reopen after `done` | log lines cited in §1 and §4 |
| scope drift | none after approval — PR1/PR2 fixed inside S5/S3 files; the hook fix was outside the plan by design | `fix-loop 3 (pr-self-review)`, `main-session fix (outside the plan, harness tooling)` |
| failure taxonomy | mechanical 4 (items 2, 3, 4, 6) · judgement 1 (item 1) · spec gap 1 (item 5) · environment 0 | §4 tags |

## 5. Proposed corrections
| # | Change | Where | Expected effect | Targets |
|---|---|---|---|---|
| P1 | Make `handback-check` accept the implementer's actual table header (`\| Step \|` and `\| Gap \|` as well as `\| Step / gap \|`), with a selftest case built from a real report | `.claude/skills/sdd/scripts/sdd.sh` (`cmd_handback_check`) | F3 stops firing; hand-backs are classified automatically | 4 |
| P2 | Run `/pr-self-review` (deterministic gates + bucket analyzers) **before** `close`, as part of the `review` wave, so its correctness findings go to the normal fix loop | `.claude/skills/sdd/SKILL.md` §2 stage order, `review-loop.md` | no reopen after `done` | 1 |
| P3 | A Done-when that proves a test can fail: require "break check: <what> → red, restored sha" in the implementer's report for every new test of a bug fix, and add it to the implementer template | `.claude/agents/implementer.md` | vacuous tests caught at hand-back, not at review | 3 |
| P4 | For mutation steps, the Done-when must include the scope check `jq '.testFiles\|keys'` | `docs/plans/README.md` (plan template guidance) | inflated scores caught by the implementer | 3 |
| P5 | Give the researcher and plan-verifier a "write the report by turn N−10" rule, and split a full verifier pass over >150 items into two delta passes | `.claude/agents/researcher.md`, `.claude/agents/plan-verifier.md` | no report-less turn-limit stops | 2 |
| P6 | `sdd.sh` refuses `eval:*`-adjacent stages while a writing agent is in flight: add a `busy` lock file that `implement`/`docs`/`fix-loop` set and the main session checks before running harness evals | `.claude/skills/sdd/scripts/sdd.sh`, `stages.md` | no false sandbox leaks | 6 |
| P7 | Add stages for agents outside the pipeline (`skill-eval`, `self-review`, `brainstorm`) so `sdd.sh agent` can log them | `.claude/skills/sdd/scripts/sdd.sh` (stage list) | `unattributed` goes to 0 | 6 |
| P8 | When the user names a mentor/design source after spec pass 2, re-run spec-creator once with all new sources together instead of one round per source | `.claude/skills/sdd/stages.md` (`spec-answers`) | fewer correction rounds | 5 |

## 6. Open items
- `repeat: F1 plans=24,26,28,34` and `repeat: F3 plans=28,34` — handed to `brainstormer` this session (brief to be saved to `docs/ideas/`).
- Insight candidate for `engineering-insights`: `Promise.all` over a worker pool keeps the other workers running after one rejects (PR1) — not yet recorded (server).
- Insight candidate: a test whose assertion uses `indexOf` on an event array passes vacuously when the event never happened (PR1 test) — probably too generic for the gate.
- The 13 product follow-ups in the plan's `## Follow-ups` are unrelated to the process and are not repeated here.
