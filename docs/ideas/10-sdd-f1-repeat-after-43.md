# Idea brief: Stop the F1 repeat after plan 43, by executing 09 Opt1 with one amendment
Status: open
Save as: docs/ideas/10-sdd-f1-repeat-after-43.md

## Problem as understood
After plan 43, `flags` printed `repeat: F1 plans=24,26,28,34,42,43`. This time the F1 came from two stages: implement (1.56M vs a median of 0.53M, 6 runs) and tests (0.87M vs a median of 0.37M, **1 run**). F3 did not fire. The outcome we want: after the next plan, a `repeat:` line appears only when the same stage was again too expensive for its size, and it points at one cause that can be fixed. Brief 09 already recommends fixing the measurement (go Opt1). This brief checks that recommendation against plan 43 and does not repeat it.
**Decision drivers:** (1) a flag means real waste, not plan size · (2) no added LLM call or stage · (3) at most one small tooling plan · (4) 09 is updated, not replaced by a parallel recommendation.
**Appetite (assumption):** 0 added per-run LLM cost. One tooling plan inside the `sdd-engineering` skill.

## Already in the repo
- `docs/ideas/08-sdd-repeat-flags.md`: open, go Opt3 (fix the meter + F3). `docs/ideas/09-sdd-repeat-flags-after-42.md`: open, go Opt1 (per-run or per-step normalisation, `repeat:` keyed on flag + stage, F3 parser). Neither was acted on, and neither's 30-minute hand-recompute experiment was run. 09 effectively replaces 08.
- **Plan 43 confirms 09's riskiest assumption for implement.** 1557691 / 6 runs ≈ 0.26M per run. That is inside 09's per-run range of 0.23–0.37M (plans 28/34/42) and below the 0.53M median, which is a median of per-plan *totals*. So implement is flagged for its run count, not for an expensive run. (The figures are from the 43 retro §2; the per-run math is inference.)
- **Plan 43 contradicts 09 on tests.** tests ran **once** at 0.87M (cache hit 97.1%). Per-run normalisation does not change it at all. Plan 42 tests was also F1 (1.25M vs 0.33M). Either tests scales with plan size (43 had 196 verification items and ACs up to AC-49), or it is real waste. 09's "per run" alone would leave tests firing, so the "or per step" part of 09 Opt1 is required, not optional.
- **09's second guess is not supported:** "most remaining F1 is spec-p2" does not hold. spec-p2 was not flagged in 43 (0.40M, despite one spec-creator resumed across 3 gates).
- **F3:** the prompt workaround (the header pinned in every implementer prompt) kept `handback-check` green on all 6 groups (43 retro §3). The cause is confirmed, but the fix still lives in prompts, not the parser. Root `INSIGHTS.md` 2026-10-19 records the same symptom.
- 09 Opt3 (a hard budget on the implement brief) loses its case: implement per run is already normal. The brief was ~22k chars in 43 vs ~29k in 42, and per run went from ≈0.35M to ≈0.26M. That is a weak hint, one data point (inference).

## Options (at most 5 total, status quo included)
- Opt1 — Execute 09 Opt1 with one amendment: normalise by plan size (steps/ACs) for stages that run once, by run count for implement; key `repeat:` on flag + stage; F3 parser.
- Opt2 — Status quo: keep the prompt workaround for F3, answer each `repeat:` with a retro, run brainstormer again after each plan.
- Opt3 — Cut test-writer cost at the source: limit how many turns and how much context one test-writer run carries on large plans.

### Opt2 — Status quo (prompt workaround + retro per repeat)
- **Value:** no work. F3 is already quiet as long as the main session remembers to pin the header.
- **Packages / contract / migration:** none.
- **Per-run LLM cost:** 0 added (inference).
- **Risk:** F1 has now fired on 6 of the recorded plans. Three briefs (08, 09, 10) have been opened for the same line and no plan has come of them. The flag is already ignored.
- **Kill criterion:** fails because a flag that fires on every plan gets no action, which is already happening.

### Opt1 — 09 Opt1, amended for single-run stages
- **Value:** implement stops flagging plans for having many groups (plan 43 shows this). tests is judged against plan size, so its line remains only if it is high for its size. A remaining `repeat:` names one stage. F3 no longer depends on how the prompt is worded.
- **Packages / contract / migration:** `sdd-engineering` scripts and selftest only. No contract, no migration.
- **Per-run LLM cost:** 0 (inference).
- **Risk:** the choice of size unit (steps, ACs, verification items) decides whether tests is called waste. A lenient unit hides real cost.
- **Kill criterion:** after normalising by size, tests in 42 and 43 is still above the threshold. The cost is then real, so Opt3.

### Opt3 — Bound test-writer cost at the source
- **Value:** goes after the one stage that per-run normalisation cannot explain. A 97.1% cache hit on 0.87M weighted suggests one long transcript re-reading its context turn after turn, not one large read (inference).
- **Packages / contract / migration:** test-writer prompt and workflow text. No contract.
- **Per-run LLM cost:** lower on tests for large plans. A split may add first-turn overhead (inference).
- **Risk:** a split test-writer loses the whole-plan view (Proof table, cross-group ACs), and the verifier finds more gaps.
- **Kill criterion:** fails because tests scales linearly with plan size, so the cost is the work itself.

## Comparison
| Option | Flag = real waste | No added LLM/stage | Contract/migration | LLM cost/run | Purity | No-go | Confidence |
|---|---|---|---|---|---|---|---|
| Opt2 | no | yes | none | 0 | n/a | — | high that nothing changes |
| Opt1 | yes (if the size unit is right) | yes | none | 0 | n/a | — | high for implement + F3, med for tests (inference) |
| Opt3 | partly (tests only) | yes, unless it splits into more runs | none | lower on tests (inference) | n/a | — | low-med (inference) |

## Recommendation
**Opt1 — go. In practice: execute 09 Opt1, with one amendment.** Plan 43 confirms 09 for implement: 0.26M per run is normal, and the flag measured 6 groups. It also confirms the F3 cause, since the pinned header fixed it. What 43 adds: tests is a single-run stage, so it needs a size-based normaliser, and "per run" alone leaves it firing. 09's guess that spec-p2 would be what remains is not supported by 43. Brief 08 should be closed in favour of 09 + this amendment. What would change it: tests is still high after normalising by size in both 42 and 43. Then Opt3 is the next step, and only for tests.

## Cheapest experiment
**Riskiest assumption:** tests' weighted tokens scale with plan size (steps or ACs), so per unit of size, plans 42 and 43 fall inside the threshold set by the 8 plans in the median.
**Try:** by hand, from the existing `.sdd/usage.jsonl`, compute tests weighted tokens ÷ step count (and ÷ AC count) for every plan that has a tests stage. Do the same for implement ÷ runs, as 09 already asked. **Cost:** ~30 min, no model.
**Success signal:** 42 and 43 tests per step sit inside the threshold, and implement per run does too. · **Kill signal:** tests per step for 42/43 is still above the threshold → Opt3 for tests. The meter fix (Opt1) still ships for implement and F3.

## Questions that change the choice
- Q1 (carried over from 09): should `repeat:` mean "the same stage again" or "some stage again"? → If "some stage", keying on the stage is pointless and F1 stays noisy by design, so Opt2 for F1 and only the F3 parser from Opt1.
- Q2: is the pinned-header prompt workaround an acceptable permanent fix for F3? → If yes, Opt1 drops the parser part and becomes F1-only. The choice of option does not change, only its scope.

## Facts needed (for researcher)
- What does F1 compare in `flags.mjs` (per-plan stage total vs the median of totals?), what is the threshold, and what is `F1_MIN_OTHER_PLANS`?
- Does the `repeat:` loop match on flag id only, or on id + stage?
- tests weighted tokens, run count, step count and AC count for every plan in the tests median (8 plans), plus 42 and 43.
- Implement weighted tokens per run for every plan in the implement median (12 plans).
- How many turns did plan 43's test-writer run take, and what share of its weighted total is cache reads × 0.1 vs output × 5?
- Was the pinned `| Step / gap |` header written into `stages.md` or the implementer prompt text, or is it typed by the main session each time?
- Which header strings does `cmd_handback_check` accept today?
