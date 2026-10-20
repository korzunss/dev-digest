# Plan 42 — workflow retro (Agent Performance dashboard and per-agent Stats tab)

Date: 2026-10-19 · Execution: multi-agent · Sources: `docs/plans/42-agent-performance.md`, `sdd.sh usage-scan` / `flags` / `cost` (run 2026-10-19), `docs/plans/assets/agent-performance/research.md`

## 1. What happened
| Phase | Rounds | Outcome |
|---|---|---|
| Spec | pass 1 + pass 2 + 2 correction rounds (SG2/SG4; GAP1–3 + TQ4) | approved twice, then `implemented` (Verification log `agent: spec-p1/spec-p2`, spec Changelog) |
| Research | 1 | `research.md`, 8 questions answered (log `agent: research`) |
| Plan | pass 1 + pass 2 | approved first time; D9 added in pass 2 (log `plan approved; plan-approved tree`) |
| Implement | G1–G5, one run each | all done (log `implement G1` … `implement G5`) |
| Tests | 1 test-writer run | AC-22/AC-28/AC-4 gaps closed, break-checked (log `tests:`) |
| M1 design review | 1 round | DG1–DG5 fixed in one fix run, DG6 follow-up (log `M1 design review`, `fix DG1-DG5`) |
| Review | verifier ×3 (full + 2 deltas), architecture ×1, security ×1 | 160/161 complete; both reviewers PASS (log `review-1`, `review-3`, `architecture-reviewer`, `security-reviewer`) |
| Close | — | plan `done`, spec `implemented`, docs, insights, self-review PASS (log `close:`, `docs:`, `insights:`, `self-review:`) |

## 2. Cost
```
| Stage | Runs | Agents | Weighted tokens | Share | Cache hit | Busy |
|---|---:|---:|---:|---:|---:|---:|
| implement | 5 | 5 | 1743674 | 21.1% | 94.2% | 18m19s |
| review | 3 | 3 | 1698586 | 20.5% | 94.6% | 59m07s |
| tests | 1 | 1 | 1247560 | 15.1% | 97.7% | 8m11s |
| plan-p2 | 1 | 1 | 1050590 | 12.7% | 96.4% | 11m40s |
| fix-loop | 2 | 2 | 787650 | 9.5% | 86.5% | 36m36s |
| spec-p2 | 1 | 1 | 602139 | 7.3% | 76.9% | 101m55s |
| docs | 1 | 1 | 408281 | 4.9% | 92.6% | 2m43s |
| research | 1 | 1 | 350302 | 4.2% | 95.2% | 2m54s |
| plan-p1 | 1 | 1 | 212518 | 2.6% | 92.2% | 2m37s |
| spec-p1 | 1 | 1 | 173300 | 2.1% | 88.9% | 1m35s |
cost: total 8274598 weighted tokens, 17 runs, 15 agents
cost: window 279m32s
cost: busy 205m30s, parallelism 1.21
cost: critical path spec-p2 101m55s
cost: unattributed 0 runs, 0 agents, 0 weighted tokens (sessions 1, untimed 0 not counted)
cost: main-session tokens not included
```
```
flag: F1 plan=42 stage=implement weighted_tokens=input+1.25*cache_creation+0.1*cache_read+5*output 1743674 median=435208 over 11 plans
flag: F1 plan=42 stage=spec-p2 weighted_tokens=input+1.25*cache_creation+0.1*cache_read+5*output 602139 median=279527 over 5 plans
flag: F1 plan=42 stage=tests weighted_tokens=input+1.25*cache_creation+0.1*cache_read+5*output 1247560 median=333091 over 7 plans
flag: F3 plan=42 handback unknown x1
repeat: F1 plans=24,26,28,34,42
repeat: F3 plans=28,34,42
```
Main-session tokens are not included. Busy time and the critical path are first-to-last timestamp spans, so they are an upper bound, not working time. `spec-p2` 101m55s is mostly user think-time across three gates (log `retro-fact: spec-creator was resumed across 3 user gates`).

## 3. What worked
- Mockups copied to `docs/plans/assets/agent-performance/` and named in every UI prompt. No implementer reported a missing design, unlike plan 40 (prompts G4/G5; root INSIGHTS 2026-10-15).
- One service shared by both screens made AC-22 parity hold by construction. M1 showed identical figures on the dashboard row, the Stats tab and the card (log `M1 design review`).
- Naming the `| Step / gap |` header in the prompt fixed `handback-check` for G2–G5 after G1 (log `handback: unknown G1`, then `implement G2` …).
- The perf `.it` test settled D5 (no index) with a measurement, 201 ms over 200k rows, instead of a guess (log `implement G2`).
- Live screenshots (M1) caught DG1, a layout defect that 830 green jsdom tests missed (log `retro-fact: M1 screenshots found DG1`).

## 4. What did not work
1. **Verifier bookkeeping round-trips.** 14 of 18 open items after the first verifier pass were SK rows: Skills tables with free-text *Applied in*. That took 2 extra delta passes and one fix run (review stage 20.5%, fix-loop 9.5%). Tag: mechanical (log `retro-fact: plan-verifier needed 3 passes`).
2. **Over-budget brief.** The plan-p2 brief was about 29k characters against a 20k budget, and all five implement runs read it. The implement stage is flagged F1 at 4× the median. Tag: judgement (log `retro-fact: plan-p2 brief was ~29k chars`).
3. **Spec gaps found only by the planner.** GAP1–3 (paging vs the request cap, sub-cent precision, expanded-row View) sent an approved spec back to draft for a correction round. The spec-p2 F1 flag includes these resumes. Tag: spec gap (log `spec 015 re-approved after GAP1-3 + TQ4`).
4. **Handback-check false "unknown".** The G1 report was complete, but its table header was `| Step |`, so the check logged "unknown". This is F3, a repeat across plans 28, 34 and 42. Tag: mechanical (log `handback: unknown G1`).
5. **UI quality issues found only at self-review.** Three HIGH findings (a frozen history window, a stale PeriodControl draft, the ARIA row structure) were missed by the implementers, the test-writer and the architecture reviewer, and are now follow-ups. Tag: judgement (log `retro-fact: pr-self-review UI pass found 3 HIGH`).

| Checklist | Finding | Source |
|---|---|---|
| duplicated context | the ~29k brief re-read by 5 implement runs. Cache hit is 94.2%, so the cost is mostly cache reads | `cost` implement row; `retro-fact: plan-p2 brief` |
| rework / round-trips | 2 spec re-approvals; 3 verifier passes; 2 fix runs | spec Changelog; log `review-1`, `review-3`, `fix` lines |
| scope drift | after spec approval the user added the Stats tab (B1), deltas (B8) and the card line (TQ4). All went through spec corrections before the plan was approved; nothing was added after plan approval | spec Changelog; log `decisions recorded` |
| failure taxonomy | mechanical 2 · judgement 2 · spec gap 1 · environment 0 (the first `pnpm test` testcontainers flake is not a workflow failure) | items 1–5 |

## 5. Proposed corrections
| # | Change | Where | Expected effect | Targets |
|---|---|---|---|---|
| P1 | Implementer report template: the *Applied in* column must hold step ids only (`S3, S4`), and a skill with no job on a step goes in *Not used — reason* for that step | `.claude/agents/implementer.md` (report template) | closes SK items in the first verifier pass | 1 |
| P2 | `handback-check` should accept `\| Step \|` as well as `\| Step / gap \|`, or the implementer template should fix the header | `.claude/skills/sdd-engineering/scripts/sdd.sh` `cmd_handback_check` | removes the F3 repeat | 4 |
| P3 | `plan-lint` fails (not just warns) when the brief above the marker exceeds ~20k characters | `.claude/skills/sdd-engineering/scripts/sdd.sh` `plan-lint` | smaller brief per implement run | 2 |
| P4 | spec-creator pass 2 checklist: for each NFR cap (request count, precision), check that every AC that lists or pages data fits inside it | `.claude/agents/spec-creator.md` | GAP-type holes caught before approval | 3 |
| P5 | A UI-group Done-when includes a short React-rules self-check (derived state, re-sync of draft state, ARIA roles), or the UI analyzer from `pr-self-review` runs after the last UI group | `.claude/agents/implementer.md` or `.claude/skills/sdd-engineering/stages.md` `implement` | HIGH UI issues found before review | 5 |

## 6. Open items
- `repeat: F1 plans=24,26,28,34,42` and `repeat: F3 plans=28,34,42`: the hand-over asks whether to run `brainstormer` on them.
- Follow-ups already filed: DG6 icons; the Most-active small-sample test; self-review H1–H3 and the MEDIUM batch.
- Insight candidate for `engineering-insights` (not written here): jsdom gives green tests over a zero-width legend label, so a screenshot step is the only guard for layout defects.
