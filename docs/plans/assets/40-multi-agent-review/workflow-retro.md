# Plan 40 — workflow retro (Multi-Agent Review)

Date: 2026-10-15 · Execution: multi-agent · Sources: `docs/plans/40-multi-agent-review.md`, `sdd.sh usage-scan` / `flags` / `cost` (run 2026-10-15), `docs/plans/assets/40-multi-agent-review/` (research.md, test-report-proof.md, test-report-uf.md, test-report-fix-rounds.md, plan-baseline-pass2.md, plan-baseline-uf.md), `docs/retros/ledger.md`

## 1. What happened
| Phase | Rounds | Outcome |
|---|---|---|
| Spec | pass 1, pass 2, 3 correction rounds (GAP1–4, option C, UF1/UF2) | SPEC-13, 69 ACs, implemented (spec Changelog) |
| Research | 1 run, resumed once after the 40-turn limit | `assets/.../research.md` (retro-fact: researcher) |
| Plan | pass 1, pass 2, 1 correction round (G9–G10) | 27 steps in G1–G10 (*Decisions recorded*) |
| Implementation | G1–G8, then G9–G10 | Handoffs → G1…G10 |
| Design review | 1 (DG1–DG8) + 1 fix round | Verification log 2026-10-15 "DG1–DG8 fixed" |
| Verification | full ×2, delta ×7 | final "complete 15/15" (Verification log) |
| Post-done hardening | `/pr-self-review` + 3 fix rounds, 3 test-writer proof runs | Verification log "fix round 3", ledger |
| Merge | PR #31 → `L07` 12:44:36Z | retro-fact: fan-out |

## 2. Cost
`usage-scan: 45 agents, 45 rows, 45 unmatched, 3239 skipped lines` · `flags: 0 flag(s), 0 repeat(s)` · `cost: no rows for plan 40`

All 45 subagent runs are unattributed: the plan was run by hand, not via `/sdd`, so no `agent:` lines exist (retro-fact: pipeline run by hand). Main-session tokens are not in `sdd.sh` output. Per-session weighted totals for the whole fan-out are in `docs/retros/ledger.md` (A 27.7 M, B 25.9 M) — measured outside `sdd.sh`, not repeated here as plan cost.

## 3. What worked
- Spec pass 1 surfaced that "ready" parallel execution and grouping did not exist before any code (spec Changelog; `assets/.../research.md` Q1, Q3).
- Contract-first G1 with both vendored copies kept identical; no drift introduced by the fan-out (Verification log, architecture-reviewer PASS).
- Independent re-review by `/pr-self-review` caught a regression the verifier missed (retro-fact: /pr-self-review).
- Break-check Proof tables made R4 provable without user sign-off and found two untested guards (test-report-fix-rounds.md "Gaps found and closed").
- Rebuilding the R3 baseline from the planner transcript replaced a sign-off the user declined (retro-fact: user declined sign-off; plan-baseline-pass2.md).

## 4. What did not work
1. **Post-done reopenings: 3 extra waves** — option C, UF1/UF2 (G9–G10 added), `/pr-self-review` with 3 fix rounds; the largest loss of the plan (retro-fact: post-verification reopenings; retro-fact: /pr-self-review). Tag: spec gap (UF1/UF2: no AC for returning to a past run), judgement (wide-range grouping).
2. **Design built without the mockups** — G5/G6 implementers never saw the images, one design review + fix round (DG1–DG8) (retro-fact: UI implementers). Tag: mechanical.
3. **Self-inflicted regression in a fix round** — PR-C9 → PR2-H1; tests mocked `useRunEvents` live from the first render; 2 more rounds to settle the drawer contract (retro-fact: /pr-self-review). Tag: judgement.
4. **Plan paraphrase lost a spec definition** — S25 "time" vs AC-15c wall-clock; implementer and test agreed on the wrong value (retro-fact: verifier AC15C gap). Tag: mechanical.
5. **Unlogged pipeline** — no `sdd.sh` attribution, so this retro has no per-stage cost (section 2). Tag: mechanical.
6. **Skills listed but not opened** — SK3–SK6 missing after G1/G2, fixed in a separate run (Verification log 2026-10-15 "plan-verifier full pass: incomplete"). Tag: mechanical.

| Checklist | Finding | Source |
|---|---|---|
| duplicated context | the same plan file (≈38k-char brief) re-read by 15+ implementer/verifier runs; cache share n/a (no `cost` rows) | Verification log; `cost: no rows` |
| rework / round-trips | 3 spec re-approvals, 1 plan re-approval, 3 fix rounds after done, 9 verifier runs | spec Changelog; Verification log |
| scope drift | G9–G10 (7 steps, AC-15a–h, AC-41a/b) added after approval, user-requested | *Decisions recorded* 2026-10-15 |
| failure taxonomy | mechanical 4 · judgement 2 · spec gap 1 · environment 1 (eval:workflow flake on base commit) | items 1–6; retro-fact: eval:workflow |

## 5. Proposed corrections
| # | Change | Where | Expected effect | Targets |
|---|---|---|---|---|
| P1 | Pass mockup file paths to spec-creator and every UI implementer group; screenshot-compare before the verifier | `.claude/skills/sdd/SKILL.md` (UI step) | no design-fix round | 2 |
| P2 | Plan template: a step naming a spec field quotes the AC id + definition in its text and Done-when | `.claude/agents/implementation-planner.md` | no AC15C-type gaps | 4 |
| P3 | Run the pipeline through `/sdd` (or log `agent:` lines) so `sdd.sh cost` attributes runs | `.claude/skills/sdd/SKILL.md` | per-stage cost in the retro | 5 |
| P4 | Run `/pr-self-review` before plan-verifier's final pass, not after `done` | `.claude/skills/sdd/stages.md` | fewer post-done reopenings | 1, 3 |
| P5 | test-writer rule: mock a hook from its real initial value | `.claude/agents/test-writer.md` | first-render bugs caught by tests | 3 |
| P6 | Implementer hand-back check: every skill named on a step has a Skills row with that step | `sdd.sh` handback-check | no SK gaps | 6 |
| P7 | `workflow-retro` gains overlap, conflict count, human time and a `docs/retros/ledger.md` append | new plan | ledger filled by the skill, not by hand | 5 |

## 6. Open items
- Follow-ups from the plan (pre-existing): PR-page drawer without `running`/`endedAt`; single-agent start without error UI; `agent-runner` review findings; seed PR #482 has no diff; client contracts lack `'openrouter'` (`eval-ci.ts`, `productionize.ts`).
- Dev DB `drizzle.__drizzle_migrations` not yet reconciled after B's renumbering (live smoke on `L07` pending).
- Insight candidates for `engineering-insights`: "run `/pr-self-review` before the final verification" (P4); "unlogged pipelines leave `workflow-retro` without cost" (P3).
