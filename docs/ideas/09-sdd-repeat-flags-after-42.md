# Idea brief: Stop the F1 / F3 repeat flags in /sdd-engineering (after plan 42)
Status: open
Save as: docs/ideas/09-sdd-repeat-flags-after-42.md

## Problem as understood
After plan 42, `flags` again printed `repeat: F1 plans=24,26,28,34,42` and `repeat: F3 plans=28,34,42`. The outcome we want: after the next plan, a `repeat:` line shows up only when something really was wasted again, and each line points at one fixable cause.
**Decision drivers:** (1) a flag means real waste, not plan size or a parser miss · (2) no added LLM call or stage · (3) at most one small tooling plan · (4) the cause also gets fixed, not only the signal hidden.
**Appetite (assumption):** 0 added per-run LLM cost; one tooling plan inside the `sdd-engineering` skill plus agent-prompt text.

## Already in the repo
- `docs/ideas/08-sdd-repeat-flags.md`: open, go Opt3 (fix the measurement plus F3). Not acted on, and its 30-minute experiment was never run.
- The F3 fix has been proposed three times and never planned: plan 28 retro P6, plan 34 retro P1, and plan 42 retro P2. The template already says `| Step / gap |`, but the reports write `| Step |` anyway.
- New in plan 42: naming the header in the implementer prompt fixed `handback-check` for G2–G5 (42 retro §3). So a prompt-only workaround is shown to work.
- Plan 42 F1: implement 1.74M vs a median of 0.44M over 5 runs (≈0.35M per run). Tests 1.25M vs 0.33M. spec-p2 0.60M vs 0.28M, from one spec-creator resumed across 3 user gates (`retro-fact`). The plan-p2 brief was ~29k characters against a ~20k budget, and every group read it (P3).
- Implement is F1 in plans 28, 34 and 42. spec-p2 is F1 in 28 and 42. The median is a per-plan *stage total*, so implement grows with the group count (28: 7 runs, 34: 10, 42: 5). Per run, implement was about 0.23–0.37M, which is below the median total (inference from the retro figures).
- Plan 28 P4 (resume an agent only from pass 1 to pass 2) has not been adopted, and spec-p2 repeated in 42.

## Options (at most 5 total, status quo included)
- Opt1 — Honest measurement: F1 compares per run (or per step), `repeat:` keys on flag + stage, and F3 accepts both headers.
- Opt2 — Status quo: write a retro for each repeat, and pin the header in prompts by hand as in plan 42.
- Opt3 — Hard context budget: `plan-lint` *fails* when the brief is over budget, and each implement run gets only its own group's slice.
- Opt4 — Fresh-context rounds: no agent is resumed after pass 2. Correction rounds start fresh from the file path.

### Opt1 — Honest measurement (+ F3 parser)
- **Value:** F3 goes away for good. F1 stops flagging plans for being large. A remaining `repeat:` line names one stage that was costly again.
- **Packages / contract / migration:** `sdd-engineering` scripts and selftest only. No contract, no migration.
- **Per-run LLM cost:** 0 (inference).
- **Risk:** a per-run baseline is too lenient and hides the real waste in plan 42 (the 29k brief read 5×, the resumed spec-creator).
- **Kill criterion:** after normalising, implement or spec-p2 is still above the threshold per run, so the waste is real and this only hid it.

### Opt2 — Status quo (retro per repeat, header pinned in prompts)
- **Value:** no work. The plan-42 prompt workaround already stops F3 after G1.
- **Packages / contract / migration:** none.
- **Per-run LLM cost:** 0 added (inference).
- **Risk:** G1 keeps missing it, every plan logs F1 and F3, and people learn to ignore `repeat:`.
- **Kill criterion:** fails because a flag that fires on every plan gets no action, which is already the case (3 proposals, 0 plans).

### Opt3 — Hard context budget for implement runs
- **Value:** cuts the bytes each implement run actually reads. It goes after the cause of the implement F1 (the brief re-read by every group), not the measurement.
- **Packages / contract / migration:** planner prompt, `plan-lint`, and how the implementer loads the plan. No contract.
- **Per-run LLM cost:** lower per implement run. How much depends on cache share, since cache reads are weighted 0.1 (inference).
- **Risk:** a group loses cross-cutting context (Risks, AC map) and the verifier finds more gaps. A failing lint also adds a planner round.
- **Kill criterion:** fails because most implement input is cache reads, so a smaller brief barely moves weighted tokens.

### Opt4 — Fresh-context correction rounds
- **Value:** stops a resumed spec-creator or planner from dragging its whole transcript through user gates. Targets spec-p2 (28, 42) and plan-p2 (28).
- **Packages / contract / migration:** workflow text in the skill and root `CLAUDE.md`.
- **Per-run LLM cost:** lower on correction rounds, a little higher on each fresh first turn (inference).
- **Risk:** a fresh agent re-derives earlier decisions and drifts away from them.
- **Kill criterion:** fails because the extra spec-p2 tokens come from the round content, not from carried transcript.

## Comparison
| Option | Flag = real waste | No added LLM/stage | Contract/migration | LLM cost/run | Purity | No-go | Confidence |
|---|---|---|---|---|---|---|---|
| Opt1 | yes | yes | none | 0 | n/a | — | high for F3, med for F1 (inference) |
| Opt2 | no | yes | none | 0 | n/a | — | high that nothing changes |
| Opt3 | partly (implement only) | yes | none | lower (inference) | n/a | — | low-med (inference) |
| Opt4 | partly (spec-p2/plan-p2) | yes | none | lower on rounds | n/a | — | med (inference) |

## Recommendation
**Opt1 — go.** F3 is mechanical. It has been proposed three times, and the plan-42 workaround shows the header is the whole cause. The implement F1 is a per-plan total set against a median of totals: per run it sits below that median, so most of the repeat measures plan size. Fix the meter first. It costs 0 tokens, and then whatever `repeat:` lines remain show where Opt3 or Opt4 really pays off. What would change it: if spec-p2 or implement is still above the threshold per run after normalising, the next step is Opt4 (spec-p2) or Opt3 (implement).

## Cheapest experiment
**Riskiest assumption:** after normalising per run, plans 28/34/42 implement fall within the threshold, and most of the remaining F1 is spec-p2 from resumed agents.
**Try:** recompute weighted tokens per run (implement, tests, spec-p2) for plans 24–42 by hand from the existing `.sdd/usage.jsonl`, with no model. **Cost:** ~30 min.
**Success signal:** implement and tests fall within the threshold per run, and only spec-p2 (resumed) stays high. · **Kill signal:** implement is still above the threshold per run, so the brief size is real waste → Opt3.

## Questions that change the choice
- Q1: Should `repeat:` mean "the same stage was expensive again" or "some stage was expensive again"? → If "some stage", keying on the stage is pointless and F1 stays noisy by design (Opt2 for F1, with Opt1 only for F3).
- Q2: Do cache-read tokens count as real cost to you? → If yes, Opt3 has more upside and could go alongside Opt1. If no, Opt3 drops out.

## Facts needed (for researcher)
- In `sdd.sh` / `flags.mjs`: what exactly does F1 compare (a per-plan stage total vs the median of other plans' totals?), what is the threshold, and what is `F1_MIN_OTHER_PLANS`?
- Does the `repeat:` loop match on flag id only, or on id + stage?
- Which header strings does `cmd_handback_check` accept, and does anything else (plan-verifier, other subcommands) parse `| Step / gap |`?
- Per-run weighted tokens for implement and tests in plans 24/26/28/34/42, plus each plan's group and run counts.
- What share of implement input in plans 28/34/42 was cache reads?
- How does `usage-scan` split one resumed agent across stages (spec-p1/spec-p2 sharing an agentId in plan 34; the spec-creator resumed 3× in plan 42)?
- Which F1 stages fired for plans 24 and 26? Their Verification logs give only counts.
- Did plan 42's "name the header in the prompt" workaround land in `stages.md` or the implementer prompt text, or was it one-off?
