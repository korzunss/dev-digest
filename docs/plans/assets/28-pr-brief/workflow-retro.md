# Plan 28 — workflow retro (PR Brief, SPEC-10)

Date: 2026-10-07 · Execution: multi-agent (G1–G7) · Sources: `docs/plans/28-pr-brief.md` (*Decisions recorded*, *Step groups*, *Follow-ups*, *Verification log*), `sdd.sh usage-scan` / `flags` / `cost` (re-run 2026-10-07, after plans 29/30 shifted the medians), `cost-report.md`, `cross-model-review.md`, `plan-verifier-report.md` (first 12 lines each). Written with `/workflow-retro` (plan 29); replaces the hand-written retro of `8b64d6f`.

## 1. What happened

| Phase | Rounds | Outcome |
|---|---|---|
| Spec | spec-p1 → spec-p2, re-approved 4× (GAP1–3; X3/X7/X11; AC-46..50; round 3) | AC-1..50 (log 2026-10-06 "spec 010 re-approved" ×4) |
| Research | 1 run | 3.6 % of tokens (`cost` research row) |
| Plan | plan-p1 → plan-p2, approved 3× (initial, G5/G6, G7) | 7 groups G1–G7 (*Step groups*) |
| Cross-model plan review | Sonnet 5.5 (Y1–12) ∥ Fable 5.1 (X1–15) | all fixes but Y11 applied before approval (*Decisions recorded*, cross-model line) |
| Implementation | 7 groups, 3 fix-loops | `cost` implement 7 runs, fix-loop 3 runs |
| Verification | review-1 … review-9 (plan-verifier, architecture, security) | final: review-9 complete 17/17, AC-1..50 met (log "review-9") |
| Pre-PR | self-review ×3 | PASS, 0 critical; SR1 HIGH fixed (log "fix-loop 2: SR1 done") |
| Post-done | design round (G5/G6), round 3 (G7), empty-state fix, English-prompt change | 3 reopenings after a `complete` verification (log "design-conformance round", "user round 3", 2026-10-07 "main-session change") |

## 2. Cost

```
cost: plan=28 weighted_tokens=input+1.25*cache_creation+0.1*cache_read+5*output
| Stage | Runs | Agents | Weighted tokens | Share | Cache hit | Busy |
|---|---:|---:|---:|---:|---:|---:|
| plan-p2 | 1 | 1 | 3132030 | 30.1% | 93.9% | 385m52s |
| review | 10 | 10 | 1674848 | 16.1% | 92.4% | 13m30s |
| implement | 7 | 7 | 1578935 | 15.2% | 92.3% | 40m34s |
| self-review | 8 | 8 | 1107717 | 10.6% | 83.6% | 2m15s |
| spec-p2 | 1 | 1 | 716699 | 6.9% | 73.3% | 397m06s |
| tests | 2 | 2 | 614420 | 5.9% | 93.9% | 4m48s |
| plan-approve | 2 | 2 | 539283 | 5.2% | 88.8% | 7m59s |
| research | 1 | 1 | 373313 | 3.6% | 94.0% | 2m23s |
| docs | 2 | 2 | 228162 | 2.2% | 84.2% | 1m54s |
| fix-loop | 3 | 3 | 200927 | 1.9% | 87.1% | 2m43s |
| spec-p1 | 1 | 1 | 135579 | 1.3% | 81.6% | 1m15s |
| plan-p1 | 1 | 1 | 111431 | 1.1% | 85.7% | 1m52s |
cost: total 10413344 weighted tokens, 39 runs, 37 agents
cost: window 428m18s
cost: busy 408m41s, parallelism 2.14
cost: critical path spec-p2 397m06s
cost: unattributed 0 runs, 0 agents, 0 weighted tokens (sessions 1, untimed 0 not counted)
cost: main-session tokens not included
```

```
flag: F1 plan=28 stage=implement … 1578935 median=435208 over 7 plans
flag: F1 plan=28 stage=plan-p2 … 3132030 median=739898 over 6 plans
flag: F1 plan=28 stage=review … 1674848 median=646826 over 6 plans
flag: F1 plan=28 stage=spec-p2 … 716699 median=279527 over 3 plans
flag: F3 plan=28 handback unknown x1
repeat: F1 plans=24,26,28
```

Main-session tokens are not included. The busy times of `plan-p2` (385m52s) and `spec-p2` (397m06s), and so the critical path and the parallelism figure, are spans of agents resumed across the whole day: an upper bound that counts idle time, not working time. The hand-written retro's `repeat: F1 plans=24,25,26,28` is superseded by the line above; `review` became F1 once plans 29/30 lowered its median.

## 3. What worked

- Cross-model review before code caught issues no test would have caught at that stage, for 5.2 % of tokens (`cost` plan-approve; `cross-model-review.md` Y1 HIGH).
- plan-verifier caught ACs that a green suite hid: T3/T6/T10 partial at review-1, S20/AC-30 bullets and T13 at review-5 (log "review-1", "review-5 delta").
- Delta verification + fix mode stayed cheap: fix-loop 1.9 %, three loops (`cost` fix-loop row).
- Decisions closed in one round each: TQ1–5 defaults, D1–D7 option A (*Decisions recorded*, first lines).
- G2 ∥ G3 ran in parallel with no file overlap (*Step groups* note "G2 and G3 share no package or file").

## 4. What did not work

1. **Design conformance found after `done` — the largest loss.** Two reopenings (G5/G6, G7) and a main-session empty-state fix, each a full spec → plan → approve → implement → verify cycle: 2 extra spec re-approvals, 2 plan re-approvals, review-5 … review-9 (log "design-conformance round", "user round 3", "main-session fix (user request, post-done)"). Tag: spec gap.
2. **One resumed planner carried every round.** `plan-p2` is 30.1 % of all tokens (3132030 weighted, median 739898); `spec-p2` 716699 vs median 279527; `review` 1674848 vs median 646826 over 10 runs (`flags` F1 lines, `cost`). Tag: judgement.
3. **Live-environment gaps.** First Generate click → `no_key` (`risk_brief` default provider differs); "Could not generate the brief" needed the user's server log (log 2026-10-07 "retro-fact: live check"). Tag: environment.
4. **Main-session process slips.** test-writer skipped for G5–G7, self-review analyzers logged late, same-family cross-model reviewers (log 2026-10-07 "retro-fact: process"); a 2-file, 2-package change done in the main session (log 2026-10-07 "main-session change"). Tag: judgement.
5. **Tooling friction.** G1 hand-back header mismatch → `handback: unknown` (F3; log "G1 handback 'unknown'"); read-only reviewers cannot run `sdd.sh delta` (*Follow-ups* "sdd.sh delta writes a tree object"). Tag: mechanical.

| Checklist | Finding | Source |
|---|---|---|
| duplicated context | the plan brief re-read by 7 implementer and 10 review runs; one planner resumed for 4 rounds at 93.9 % cache hit, yet 30.1 % share | `cost` plan-p2, implement, review rows |
| rework / round-trips | 4 spec re-approvals, 3 plan approvals, 3 fix-loops, 3 post-`done` reopenings | Verification log |
| scope drift | AC-46..50 and AC-13/22/46/47 amendments; G5–G7 added after `done` | log "spec 010 re-approved (design conformance…)", "(round 3…)" |
| failure taxonomy | mechanical 1 · judgement 2 · environment 1 · spec gap 1 | items 1–5 |

## 5. Proposed corrections

| # | Change | Where | Expected effect | Targets |
|---|---|---|---|---|
| P1 | Live UI check (screenshots vs `--designs`) after the last UI group, before plan-verifier | `.claude/skills/sdd/stages.md`, `plan-verifier` prompt | catches layout gaps before `done` | 1 |
| P2 | Design → AC map in the spec: one row per design region (banner, columns, cards, order) | `spec-creator` template | no loose layout ACs | 1 |
| P3 | A post-`done` round is a new plan, not new groups on the old one | `CLAUDE.md` → *Plan → implement → verify* | smaller brief, fresh context | 1, 2 |
| P4 | Resume an agent only from pass 1 to pass 2; later rounds start fresh with the file path | `CLAUDE.md`, `.claude/skills/sdd/SKILL.md` | cuts the F1 repeat on plan-p2/spec-p2 | 2 |
| P5 | test-writer after every implementation wave, with an AC → `file:line` map | `.claude/skills/sdd/stages.md` | ACs pinned before verification | 4 |
| P6 | `sdd.sh delta --ro` (no object writes) and `handback-check` accepting `\| Step \|` | `.claude/skills/sdd/scripts/sdd.sh` + selftest | removes F3 and the repeated delta workaround | 5 |
| P7 | Cross-family plan review through the OpenRouter adapter (GPT / Gemini) | new plan (`scripts/`) | meets the "different model family" rule | 4 |
| P8 | `risk_brief` default → `openrouter`; show the failure class (`invalid_output` / `timeout` / `provider`) in the UI | new plan (spec 010 amendment) | no dead ends on first use | 3 |

## 6. Open items

- `repeat: F1 plans=24,26,28` — `/sdd` §5 offers a `brainstormer` run on it; not run (P4 is the candidate answer).
- English guarantee layer 2 (*Follow-ups* 2026-10-07) and SR2–SR10 remain open.
- Insight candidate for `engineering-insights`: `sdd.sh cost` busy spans include idle time of resumed agents — already a plan-29 follow-up and a template note, so likely no entry.
