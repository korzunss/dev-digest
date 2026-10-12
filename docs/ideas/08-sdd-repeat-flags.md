# Idea brief: Stop the repeating F1 / F3 `/sdd` flags
Status: open
Save as: docs/ideas/08-sdd-repeat-flags.md

## Problem as understood
`sdd.sh flags` printed `repeat: F1 plans=24,26,28,34` and `repeat: F3 plans=28,34`. The observable outcome we want: after the next plan, the hand-over has no `repeat:` line unless something really was wasted. When a line does appear, it should point at one cause someone can act on.
**Decision drivers:** (1) the flag should mean real waste, not plan size or how tokens were counted · (2) no extra LLM calls or stages · (3) small tooling scope, ≤1 plan · (4) the main session should stop reading the diff by hand on every hand-back.
**Appetite (assumption):** zero added per-run LLM cost; one small tooling plan touching only the `sdd` skill and maybe the implementer template.

## Already in the repo
- F3: a fix was already proposed and never planned. Plan 28 retro P6 says "`handback-check` accepting `| Step |`" (`docs/plans/assets/28-pr-brief/workflow-retro.md` §5). Plan 34 logged it again as a follow-up (`docs/plans/34-eval-pipeline.md` log, "sdd tooling: handback-check greps…").
- F3 detail: the implementer template **already** says `| Step / gap |` (`.claude/agents/implementer.md` *Steps* table). The plan-mode reports drop "/ gap" anyway, every time. So the header is drifting in the model's output; the template is not wrong.
- F1: plan 28 retro P4 ("resume an agent only from pass 1 to pass 2") was the candidate answer to `repeat: F1 plans=24,26,28`. No plan row in `docs/plans/README.md` shows it was adopted.
- The `repeat:` line matches on flag id only (`flags.mjs`, the `repeats` loop). Plan 28's F1 stages were plan-p2/review/spec-p2/implement; plan 34's are implement/research/spec-p1. So one "repeat F1" line merges unrelated causes.
- Plan 34's three spec/research `agent:` lines all carry the same timestamp `08:08:16Z`. spec-p1 and spec-p2 also share one agentId (`a6b980e…`). The spec-p1 figure (0.88M vs 0.14M median) may therefore be mis-split between stages rather than real waste.
- Plan 34 is the largest so far: 9 groups and 24 steps, with 10 `implement` agent lines. Implement comes to about 0.37M per run, against a median that is a per-plan *total*.
- Idea 07-workflow-retro (chosen → plan 23) built the flags themselves. It is not a duplicate.

## Options (at most 5 total, status quo included)
- Opt1 — Per-group plan slice: each implementer run sees only the shared header plus its own group's steps.
- Opt2 — Status quo: keep the flags as they are and answer each `repeat:` with a retro.
- Opt3 — Measure honestly first: fix F3 (accept both headers), make F1 relative to run count or plan size, fix how a resumed agent's tokens are split between stages, and have `repeat:` match on flag id plus stage.
- Opt4 — Plan-size ceiling: the planner splits work over N groups into sequential plans.
- Opt5 — Fresh-context rule (P4): no agent is resumed beyond pass 1 → pass 2; later rounds start fresh from the file path.

*F3 has one sane fix, and every `go` option includes it: `handback-check` accepts `| Step |` and `| Step / gap |`, with a selftest case. Changing the template again won't help, because the template already shows the right header.*

### Opt1 — Per-group plan slice
- **Value:** fewer tokens for each implementer run on big plans, because 10 runs stop re-reading a ~900-line plan.
- **Packages / contract / migration:** `sdd` skill and the implementer's Step 0; no contract, no migration.
- **Per-run LLM cost:** lower, maybe 20–40 % less input per implement run on large plans (inference).
- **Risk:** the implementer loses cross-group context (*Risks*, *Test plan*, AC map) and misses an AC. That trades tokens for verifier gaps.
- **Kill criterion:** it would fail because input tokens are mostly cache reads (≈92 % hit, plan 28 `cost`), so cutting the plan saves little at weight 0.1.

### Opt2 — Status quo (do nothing)
- **Value:** no work. A retro already explains each repeat by hand.
- **Packages / contract / migration:** none.
- **Per-run LLM cost:** none added (inference).
- **Risk:** F3 keeps costing a diff read on every hand-back, and the F1 repeat becomes noise that people learn to ignore.
- **Kill criterion:** it fails because nobody acts on a flag that fires on every plan.

### Opt3 — Fix the measurement and F3
- **Value:** F3 disappears for good, and F1 fires only on a real outlier for each run or step. `repeat:` then means "the same stage again", which a single change can fix.
- **Packages / contract / migration:** `sdd` scripts (`flags`, `usage-scan` split, `handback-check`) and the selftest; no contract, no migration.
- **Per-run LLM cost:** 0 (inference).
- **Risk:** the new baseline is too forgiving and hides a real cost problem. Medians also move again because the history is short (4–7 plans).
- **Kill criterion:** it fails because plan 34's implement/spec-p1 are still above 2× the median after normalising. Then the waste is real and this only hid it.

### Opt4 — Plan-size ceiling
- **Value:** smaller plans, so a shorter plan for each run to read and stage totals that are easier to compare.
- **Packages / contract / migration:** the implementation-planner prompt and the root workflow text.
- **Per-run LLM cost:** about the same in total; maybe more overall, since each plan pays for its own spec/plan/review overhead (inference).
- **Risk:** cross-plan coordination, and a feature left half-shipped between plans.
- **Kill criterion:** it fails because the total tokens across the split plans exceed the single large plan.

### Opt5 — Fresh-context rule (P4)
- **Value:** stops a resumed agent dragging its whole transcript through later rounds (plan 28: plan-p2 was 30 % of all tokens).
- **Packages / contract / migration:** `sdd` SKILL/stages text and the root workflow rule.
- **Per-run LLM cost:** lower on correction rounds, slightly higher on the first turn of each fresh run (inference).
- **Risk:** a fresh agent re-derives decisions and drifts from the earlier passes.
- **Kill criterion:** it fails because plan 34's flagged stages (implement, research) involve no resumes beyond pass 1 → 2. It answers plan 28, not plan 34.

## Comparison
| Option | Flag means real waste | No added LLM/stage | Contract/migration | LLM cost/run | Purity | No-go | Confidence |
|---|---|---|---|---|---|---|---|
| Opt1 | partly (cuts real tokens) | yes | none | lower (inference) | n/a | — | low-med (inference) |
| Opt2 | no | yes | none | 0 | n/a | — | high that nothing changes |
| Opt3 | yes | yes | none | 0 | n/a | — | med-high (inference) |
| Opt4 | partly | yes | none | ≈ same / higher | n/a | — | low (inference) |
| Opt5 | partly (plan-28 kind) | yes | none | lower on rounds | n/a | — | med for 28, low for 34 (inference) |

## Recommendation
**Opt3 — go.** F3 is purely mechanical. It was already proposed twice (P6, then the plan-34 follow-up) and costs a diff read on every hand-back. F1 combines a per-plan stage *total* with a resumed agent whose tokens may be mis-split and a merge-by-id `repeat:`. We can't tell whether there is real waste until that is measured properly, and the measurement fix costs 0 LLM tokens. What would change it: if the per-run numbers for plan 34 are still above 2× the median, real cost wins and Opt1 (implement) or Opt5 (spec rounds) becomes the next brief.

## Cheapest experiment
**Riskiest assumption:** plan 34's F1 comes mostly from plan size and the resumed-agent token split, not from runs that each cost too much.
**Try:** from the existing `.sdd/usage.jsonl`, recompute by hand the weighted tokens per run for each flagged stage of plans 24/26/28/34. Also check how agent `a6b980e…` was split between spec-p1 and spec-p2 when both lines carry the same timestamp. **Cost:** ≈30 min, no model.
**Success signal:** implement per run stays within 2× the per-run median, and spec-p1 drops below 2× once the split is fixed. · **Kill signal:** implement or spec-p1 is still above 2× per run → go Opt1 / Opt5.

## Questions that change the choice
- Q1: Is `repeat:` meant to say "some stage was expensive again" or "the same stage was expensive again"? → if the first, the stage-matching part of Opt3 is dropped and a repeat on every plan is expected noise (Opt2 for F1).
- Q2: Are cache-read tokens a real cost to you, or only output and fresh input? → if cache reads don't matter, Opt1 has almost no upside; if they do, Opt1 goes up.

## Facts needed (for researcher)
- How does `usage-scan` split one resumed agent's tokens across several `agent:` lines? What happens when those lines share a timestamp (plan 34, `a6b980e…`, spec-p1/spec-p2)?
- Which stages did F1 flag for plans 24 and 26, and were they resumed agents?
- Per-run (not per-stage) weighted tokens for implement in plans 24/26/28/34, and each plan's step/group counts.
- Do the implementer's fix-mode reports use `| Step / gap |`? Do the plan-mode ones always use `| Step |` (plans 28 and 34)?
- Do other `sdd.sh` subcommands or the plan-verifier parse the `| Step / gap |` header?
- Was P4 (no resume past pass 2) adopted anywhere in `SKILL.md` / `stages.md` / root `AGENTS.md`?
- Did plan 34's research run read whole `INSIGHTS.md` files or large plan files? Where did its 0.76M come from?
- How many plans currently feed each F1 median, and does `F1_MIN_OTHER_PLANS = 3` let a stage seen in only 3 earlier plans set the baseline?

## Choice recorded
Open, 2026-10-12: brief saved after the plan-34 hand-over (user chose "both": the retro and this brief). No option chosen yet; Q1 and Q2 are for the user. Related: plan-34 retro P1 (handback-check) and P7 (unlogged agents) in `docs/plans/34-eval-pipeline.md` *Follow-ups*.
