# Plan 43 — workflow retro (Agent Stats tab breakdown panels + Skill Stats period control)

Date: 2026-10-20 · Execution: multi-agent · Sources: `docs/plans/43-agent-stats-breakdown.md`, `sdd.sh usage-scan` / `flags` / `cost` (run 2026-10-20), `docs/plans/assets/agent-stats-breakdown/research.md`

## 1. What happened
| Phase | Rounds | Outcome |
|---|---|---|
| Spec | pass 1 + pass 2 + 2 correction rounds (GAP1; Skill Stats period B8–B11) | approved three times, then `implemented` (spec Changelog; log `spec 016 re-approved …`) |
| Research | 1 | `research.md`, 8 questions answered (log `agent: research`) |
| Plan | pass 1 + pass 2 + 1 correction round (G5/G6) | approved, then re-approved twice for plan changes G6-F1 and SK7/SK17 (log `plan approved`, `plan change G6-F1`, `plan change SK7/SK17`) |
| Implement | G1–G6, one run each; G2∥G3 and G4∥G5 in parallel | all done (log `implement G1` … `implement G6`) |
| Tests | 1 test-writer run | gaps closed, Proof table in the plan; blocked once on a revert slip (log `tests:`, `main-session fix: TW-revert`) |
| M1 design review | 1 round | DG1, DG2 fixed in one fix run (log `M1 design review`, `fix DG1 DG2`) |
| Review | verifier ×2 (full + delta), architecture ×1, security ×1 | 196/196 complete; both reviewers PASS (log `review-1`, `review-2 (delta)`) |
| Close | — | plan `done`, spec `implemented`, docs, insights, self-review PASS (log `close:`, `docs:`, `insights:`, `self-review:`) |

## 2. Cost
```
| Stage | Runs | Agents | Weighted tokens | Share | Cache hit | Busy |
|---|---:|---:|---:|---:|---:|---:|
| plan-p2 | 1 | 1 | 1584250 | 23.4% | 96.2% | 28m34s |
| implement | 6 | 6 | 1557691 | 23.0% | 93.8% | 11m43s |
| review | 3 | 3 | 1123707 | 16.6% | 92.9% | 23m27s |
| tests | 1 | 1 | 871532 | 12.9% | 97.1% | 6m19s |
| docs | 1 | 1 | 488242 | 7.2% | 94.4% | 3m07s |
| spec-p2 | 1 | 1 | 401848 | 5.9% | 83.9% | 44m35s |
| fix-loop | 3 | 3 | 233983 | 3.5% | 83.7% | 2m01s |
| research | 1 | 1 | 222225 | 3.3% | 91.3% | 2m25s |
| plan-p1 | 1 | 1 | 174064 | 2.6% | 85.8% | 2m31s |
| spec-p1 | 1 | 1 | 103454 | 1.5% | 80.4% | 1m08s |
cost: total 6760995 weighted tokens, 19 runs, 17 agents
cost: window 140m53s
cost: busy 99m59s, parallelism 1.33
cost: critical path spec-p2 44m35s
cost: unattributed 0 runs, 0 agents, 0 weighted tokens (sessions 1, untimed 0 not counted)
cost: main-session tokens not included
```
```
flag: F1 plan=43 stage=implement weighted_tokens=input+1.25*cache_creation+0.1*cache_read+5*output 1557691 median=526740 over 12 plans
flag: F1 plan=43 stage=tests weighted_tokens=input+1.25*cache_creation+0.1*cache_read+5*output 871532 median=368196 over 8 plans
repeat: F1 plans=24,26,28,34,42,43
```
Main-session tokens are not included. Busy time and the critical path are first-to-last timestamp spans, so they are an upper bound, not working time. `spec-p2` 44m35s spans three user gates on one resumed spec-creator (log `agent: spec-p2` ×3).

## 3. What worked
- Pinning `| Step / gap | Status | Files changed |` in every implementer prompt kept `handback-check` green on all six groups, so F3 did not fire this time (log `retro-fact: naming the step-table header …`).
- Running independent groups in parallel (G2∥G3, G4∥G5) gave parallelism 1.33 with no file collision (`cost: busy … parallelism 1.33`; log `implement G2`, `implement G3`).
- Checking the runner bundle at HEAD before G1 removed the "stale `dist`" risk the planner raised, so the contract step's Done-when proved only this plan's effect (log `runner baseline: …`).
- Live screenshots again caught layout defects (DG1, DG2) that the jsdom suite missed (log `retro-fact: M1 live screenshots …`).
- Reviewers converged in one iteration: architecture and security PASS on the first wave, verifier complete on its first delta (log `review-1`, `review-2 (delta)`).

## 4. What did not work
1. **Scope added after plan pass 2.** The Skill → Stats period control arrived after the full plan was written, costing a spec correction round, a planner correction round and two new groups; `plan-p2` is the largest stage at 23.4%. Tag: scope drift (log `user correction: add the period control …`; `retro-fact: the user added Skill → Stats period scope …`).
2. **Tests outside every step's Files broke.** G4's new request broke two `app/agent-performance/*` suites that no step listed; found only by G6's full client run, costing a plan change and a fix run. Tag: judgement (log `plan change G6-F1`; `retro-fact: two tests outside every step's Files …`).
3. **Skills listed on steps with nothing to do (SK7/SK17).** Same pattern as plan 42 P3; cost a review gap, a plan change and a re-approval. Tag: mechanical (log `plan change SK7/SK17`; `retro-fact: SK7/SK17 …`).
4. **Implementer skipped on-demand skills (G5).** Required a resume to read them, with no code change. Tag: judgement (log `implement G5: … skills read after the fact on request`).
5. **Spec gap found only by the planner (GAP1).** An approved spec went back to draft once. Tag: spec gap (log `retro-fact: GAP1 …`).
6. **Test-writer revert slip.** A break-check revert dropped a newline; the shasum guard caught it and blocked the run. Tag: mechanical (log `main-session fix: TW-revert`).

| Checklist | Finding | Source |
|---|---|---|
| duplicated context | implement F1 again (1.56M vs median 0.53M) over 6 runs reading one ~22k-char brief; cache hit 93.8%, so mostly cache reads | `cost` implement row; `flag: F1 … stage=implement` |
| rework / round-trips | 3 spec approvals; 3 plan approvals; 1 review iteration; 3 fix runs (G6-F1, DG1/DG2, review-1) | spec Changelog; log `plan change …`, `review iteration 1`, `fix …` |
| scope drift | Skill → Stats period (AC-42…AC-49, G5/G6) added after plan pass 2, before approval; nothing added after approval except plan changes for tests and skills | log `user correction: …`; `plan change …` |
| failure taxonomy | mechanical 2 · judgement 2 · spec gap 1 · scope drift 1 · environment 0 | items 1–6 |

## 5. Proposed corrections
| # | Change | Where | Expected effect | Targets |
|---|---|---|---|---|
| P1 | Planner pass 2: list a skill on a step only when the step has code it governs (React/Next only on files with components or Next conventions, `zod` only where a schema is declared); `plan-lint` warns when a `.ts` file with no JSX carries a React/Next skill | `.claude/agents/implementation-planner.md`; `.claude/skills/sdd-engineering/scripts/sdd.sh` `plan-lint` | no SK gaps that only a plan change can close | 3 |
| P2 | Planner: for a step that adds a request to a component, add every test file that mounts it (`rg -l "<Component>" --glob '*.test.tsx'`) to *Files*, and make "full `pnpm test`" part of the last UI group's Done-when | `.claude/agents/implementation-planner.md` | no out-of-plan test breakage at the end | 2 |
| P3 | Implementer report template: a skill row may not say "not read"; the hand-back is incomplete until every on-demand skill for its steps was read | `.claude/agents/implementer.md` | no resume just to read skills | 4 |
| P4 | Test-writer: revert a mutation by restoring the saved file copy (or `git stash`-style snapshot), not by a reverse Edit | `.claude/agents/test-writer.md` | no revert slips | 6 |
| P5 | Before plan pass 2, the main session asks once whether adjacent screens in the mockups (here Skill → Stats) are in scope | `.claude/skills/sdd-engineering/stages.md` `plan-decisions` | scope settled before the full plan is written | 1 |

## 6. Open items
- `repeat: F1 plans=24,26,28,34,42,43`: the hand-over asks whether to run `brainstormer` on it. Idea briefs 08 and 09 already cover this repeat and are open.
- Follow-ups already filed: SR-H1 (ICU-rejected tz → 500), act warnings, `setPeriod` duplication, PV-I1, PV-H1, the 9 self-review MEDIUM.
