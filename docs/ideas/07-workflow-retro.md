# Idea brief: How the spec-driven pipeline learns from itself
Status: chosen (Opt4 + Opt1, automated)
Save as: docs/ideas/07-workflow-retro.md

## Problem as understood
After each feature it should be visible what slowed `/sdd` down or made it cost too much, and those problems should turn into actual changes to agents, skills or gates — not into documents nobody acts on. Today process lessons arrive as one-off `INSIGHTS.md` entries, and token usage is never kept.
**Decision drivers:** changes actually get made · LLM cost of the learning step itself · sound evidence (one feature is a sample of one; logs are prose) · no duplication with `INSIGHTS.md` · little extra approval work or upkeep for the user.
**Appetite (assumption):** no more than ~10k tokens per feature for the learning step; build effort of one single-agent plan.

## Already in the repo
- Several observed process failures already have entries in the root `INSIGHTS.md`:
  - the "placeholder" hand-back (2026-10-04)
  - Done-when greps broken by line wraps (2026-09-28)
  - R3 unprovable because the plan file was untracked (2026-09-30)
  - the heredoc that ran in the real repo (2026-10-05)
  - a template outweighs prose rules in an agent prompt (2026-09-27)
- `/sdd` pipeline — `docs/plans/README.md` row 22 (done).
- The current proposal — `docs/plans/README.md` row 23, `draft (decisions)`. D1–D3 are fixed by the user; D4–D8 are open.
- No retro or telemetry idea in `docs/ideas/README.md`.

## Options (at most 5 total, status quo included)
- Opt1 — Friction log: one-line machine-readable events written as they happen; a script counts them; a review runs only when a threshold is crossed.
- Opt2 — Status quo: process lessons go into `INSIGHTS.md` through `engineering-insights`; plans keep their prose Verification log.
- Opt3 — Plan 23 as drafted: a model-written retro after every feature, plus usage lines, a counting script and `docs/retros/`.
- Opt4 — Turn each failure into a check: every process lesson must end in a deterministic guard (a lint, a check, a selftest case, a template change), not in a report.

### Opt1 — Friction log with threshold-triggered review
- **Value:** Data is captured at the moment of the event, not rebuilt from prose afterwards. Events: usage, hand-back rejected, correction round, fix iteration, manual status edit, incident. The numbers build up across features, which avoids judging from a sample of one. A model looks only when a counter crosses its threshold (e.g. a fix loop hitting 3 twice, or the planner over budget).
- **Packages / contract / migration:** process tooling only; no contract or migration.
- **Per-run LLM cost:** ~0 per feature; ~15–30k tokens per triggered review (inference).
- **Risk:** the event vocabulary ends up wrong, so the needed counter is missing just when it matters.
- **Kill criterion:** after ~5 features the thresholds never fired, or they fired on noise.

### Opt2 — Status quo
- **Value:** costs nothing; the strict gate already catches the real incidents (see above).
- **Packages / contract / migration:** none.
- **Per-run LLM cost:** 0 extra (inference).
- **Risk:** no token data at all, so the biggest known cost (the implementation-planner) stays unmanaged; lessons sit in `INSIGHTS.md` without anyone being responsible for fixing them.
- **Kill criterion:** the same process failure comes back after its entry was written.

### Opt3 — Per-feature model retro (plan 23)
- **Value:** a full picture after each run, plus a planner prompt ready to hand on.
- **Packages / contract / migration:** a new skill, a new `/sdd` stage, new log line types, a new docs folder; the stage-resume logic has to skip the new log lines (plan 23, TQ2).
- **Per-run LLM cost:** ~20–40k tokens per retro — about a third of a planner run (inference).
- **Risk:** proposals from one feature's prose log are guesswork; much of the prose overlaps with `INSIGHTS.md`; proposals pile up because each one needs its own plan approval.
- **Kill criterion:** after 3 retros fewer than one proposal has become a plan that reached `done`.

### Opt4 — Turn each failure into a check
- **Value:** almost every listed failure is mechanical: a placeholder hand-back, a grep broken by a wrap, a `grep -c` threshold that can be gamed, an untracked plan file, a write outside the scratch dir, manual status edits. A guard ends the problem for good; a report only describes it. The process `INSIGHTS.md` entry gains a "guard:" pointer, so nothing is duplicated. Usage lines are optional — a single counter, no retro.
- **Packages / contract / migration:** process tooling and agent templates only.
- **Per-run LLM cost:** ~0 (inference).
- **Risk:** judgement problems — planner verbosity, over-classifying in spec-creator — cannot be turned into checks and get no attention.
- **Kill criterion:** the next failures turn out to be judgement problems, not mechanical ones.

## Comparison
| Option | Actionable | Evidence quality | Duplicates INSIGHTS | Approval work / upkeep | LLM cost/run | Purity | No-go | Confidence |
|---|---|---|---|---|---|---|---|---|
| Opt1 | medium | high (counts across features) | low | low / medium | ~0 + rare review | n/a | none | medium |
| Opt2 | low | low | — | none / none | 0 | n/a | none | high (that it stays as it is) |
| Opt3 | low–medium | low (n=1, prose) | high | medium / high | 20–40k | n/a | none | low–medium |
| Opt4 | high | n/a (single incidents are enough) | none | low / low | 0 | n/a | none | medium–high |

## Recommendation
**Opt4 — go.** Every failure you observed was a single, mechanical incident. The fix that worked each time was a guard, not a retrospective (the hand-back check already exists). A per-feature retro adds 20–40k tokens to fix problems that a check fixes for free, and its sample of one cannot separate a pattern from noise. Plan 23 would be abandoned, or cut down to its usage-line logging (D2/D5) as a separate counter.
What would change it: if cutting token cost — the planner especially — is the main goal, that is Opt1's job, not Opt4's.

## Cheapest experiment
**Riskiest assumption:** most process failures can be caught by a deterministic check, rather than needing a judgement call.
**Try:** sort every process-related root `INSIGHTS.md` entry and every *Follow-ups* item in plans 18–22 into "could a check have prevented this: yes / no". No code. — **cost:** ~30 minutes, one researcher run.
**Success signal:** ≥60% are "yes" · **Kill signal:** <40% "yes" — judgement problems dominate, so Opt1 (or Opt3 at a batch cadence) wins.

## Questions that change the choice
- Q1: Is the main aim fewer repeat failures, or lower token cost per feature? → Opt1 if it's cost: only the friction log measures it.
- Q2: Are you willing to reopen D1–D3 of plan 23, which you already fixed? → Opt3 (reduced) if they stay fixed.

## Facts needed (for researcher)
- For each of: placeholder hand-back, Done-when wrap, `grep -c` threshold gaming, untracked plan / R3, heredoc writing into the real repo, manual status edits — does a deterministic guard already exist in `/sdd`'s scripts, selftest or agent templates, and where?
- Which process-related root `INSIGHTS.md` entries led to a later change in an agent, skill or script, and which are still open?
- How many manual `Status:` / index edits does one `/sdd` run still need, and at which stages?
- Do the Verification logs of plans 18–22 use consistent markers (fix iteration, delta verification, main-session fix) that a script could count?
- Where is the one-off 15-run audit page, and can its measurements be rerun from data that is still available?
- Which *Follow-ups* items in plans 18–22 are process items, not product items?

## Choice recorded
User, 2026-10-05 ("давай робити по рекомендаціям"), after the brief and an external research run (SubagentStop hooks, OTel, transcript usage):
- **Q1:** both aims — fewer repeat failures and lower token cost.
- **Chosen:** Opt4 + Opt1 without manual logging. (1) Every mechanical process lesson ends in a guard (`sdd.sh`, selftest or an agent template) and its `INSIGHTS.md` entry gains a `guard:` pointer. (2) A `SubagentStop` hook in `.claude/settings.json` (user consent given) parses the subagent transcript's `message.usage` and appends one usage row per run to a local log — the notification's `subagent_tokens` is not used (scope undocumented). (3) At the end of `/sdd` a no-LLM script prints threshold flags; a model review runs only on demand when the same flag repeats in ≥2 features.
- **Not chosen:** Opt3 (per-feature model retro) — 20–40k tokens per feature on a sample of one; Opt2 (status quo) — no token data.
- **Led to:** plan 23 reworked in place (its D1–D3 superseded).
- **Reversed in part** (user, 2026-10-07: "давай також зробемо окремий скіл"): Opt3 returns as a **manual** `/workflow-retro <plan>` skill that `/sdd` only offers at hand-over — never an every-feature auto-run. The no-LLM metrics stay its only cost source. See `docs/plans/29-workflow-retro-skill.md`.
