# Idea brief: Contain and cut output-cap runaways in map-reduce reviews
Status: chosen (Opt1)
Save as: docs/ideas/05-truncated-chunk-runaways.md

## Problem as understood
On a 142-file map-reduce review, one file's call runs away to the 32k output cap. That one file throws away every other file's findings, after more than 2.5 minutes and ~32k billed tokens that produce nothing. After the change, a user who starts such a review gets the other files' findings, plus a visible "partial: K files not reviewed" marker. A runaway costs less, or at worst no more, than today.
**Decision drivers:** (1) results survive one bad file; (2) a partial run never looks clean, so no `approve`/100 from skipped files; (3) money and time burned per runaway; (4) contract and complexity footprint, with `reviewer-core` kept pure.
**Appetite (assumption):** at most +1 extra LLM call per runaway chunk. One reviewer-core + server change, with no shared/client contract change unless a visible marker can't be done any other way.

## Already in the repo
- Plan 08 A1 pass 1 lists A (skip), B (retry), C (retry+skip), D (no change), and the sub-decisions A1b–A1g. It recommends C + R1 + T2 + S1 + P2 + K1 — `docs/plans/08-llm-call-reliability.md` → *Amendment A1*.
- `reasoning.effort` showed no consistent effect on deepseek-v4-flash, and `reasoning.max_tokens` is not a hard budget on this model — plan 08 → *Experiment → D6*, *Research → pass 2* Q1.
- Streaming was put out of scope until a prototype exists (usage arrives only in the final chunk, and idle or reasoning chunks may be hidden by the SDK). A non-streaming abort is billed in full, while a streaming abort stops upstream generation on DeepSeek — plan 08 → *Research → pass 2* Q3/Q4.
- Token-budgeted batching of files is an open idea — `docs/ideas/02-cheaper-review-runs.md` Opt5.

## Options (at most 5 total, status quo included)
- Opt1 — Retry the same model with a re-roll, then skip with an honest partial marker · Opt2 — Retry on a fallback model, then skip · Opt3 — Status quo · Opt4 — Stream and abort a runaway early · Opt5 — Retry with a smaller input (by hunk / slimmer prompt), then skip

Opt1, Opt2, Opt4 and Opt5 all need the same **containment floor** to meet driver 1–2: a final failure skips the chunk; single-pass or all-chunks-skipped still fails; a marker appears in the visible summary; skipped usage is counted. They differ in how they attack the runaway itself. Dropped as an option: a per-request reasoning budget, already refuted by plan 08's probe and research. A lower cap for per-file chunks (successful files used 1–6k tokens) is a parameter of any option, not an option of its own.

### Opt1 — Same-model re-roll, then skip
- **Value:** closest to plan 08 A1 = C. It reuses `callWithDeadline`'s retry and the price-balanced retry routing, so a stochastic runaway on another provider probably completes.
- **Packages / contract / migration:** reviewer-core + server constants; none.
- **Per-run LLM cost:** +~32k output tokens per runaway chunk if the retry also runs away, ≤ +6k if it succeeds (inference).
- **Risk:** at `temperature: 0` the runaway may be prompt-driven, not provider-driven, in which case the retry doubles the waste every time.
- **Kill criterion:** replays of the runaway prompt truncate again on most providers.

### Opt2 — Fallback model for the retry
- **Value:** the retry goes to a different model, either a non-reasoning one or a reasoning-off variant. That makes a second runaway unlikely and the retry cheap, and the file still gets findings.
- **Packages / contract / migration:** reviewer-core + server config (a fallback model id). If the fallback is configured per agent, that is a column, a migration and UI.
- **Per-run LLM cost:** a few k output tokens on the fallback per runaway (inference).
- **Risk:** findings on that file come from a different model (different quality and price, and possibly no strict-schema endpoint). The run is mixed-model, which complicates cost and eval comparisons.
- **Kill criterion:** no suitable strict-JSON non-reasoning model exists on OpenRouter, or its findings on the file are mostly ungrounded.

### Opt3 — Status quo (label: status quo)
- **Value:** no work. The cap keeps bounding the 105k / 71-min runaway.
- **Packages / contract / migration:** none.
- **Per-run LLM cost:** today's: a runaway burns 32k tokens and loses the whole run (inference).
- **Risk:** large PRs (map-reduce exists for them) fail as often as any single file runs away; the user re-runs and pays again.
- **Kill criterion:** n/a. It loses if runaways recur on real PRs.

### Opt4 — Streaming with an early runaway abort
- **Value:** the only option that cuts waste per runaway. Once reasoning passes a budget, the stream is cancelled and upstream generation stops. This saves most of the 32k tokens and minutes. Idle-gap detection would also attack the ~15% stall rate.
- **Packages / contract / migration:** reviewer-core adapter and call path. The provider port likely changes (shared adapters + client mirror). It still needs the containment floor.
- **Per-run LLM cost:** saves roughly (32k − budget) per runaway, if cancellation works (inference).
- **Risk:** unverified in four places: reasoning deltas visible to the SDK, strict JSON over a stream, usage lost on an aborted stream (breaks plan 13's counting), and a budget that clips legitimate long reviews (one success needed 15k tokens).
- **Kill criterion:** an aborted stream reports no usage and still bills, or no reasoning progress is observable.

### Opt5 — Smaller input on retry
- **Value:** if runaways come from large or test-heavy files or a heavy prompt, the retry splits the file by hunk or drops optional prompt slots (skills, memory), so each call is smaller.
- **Packages / contract / migration:** reviewer-core only; none.
- **Per-run LLM cost:** about one extra call's worth, split across hunks (inference).
- **Risk:** the probe found stalls were not size-driven, and nothing yet shows runaways are. Splitting loses cross-hunk context, and hunk findings still have to pass grounding.
- **Kill criterion:** runaway files are no larger than the median chunk.

## Comparison
| Option | Results survive | Waste per runaway | Contract/migration | LLM cost/run | Purity | No-go | Confidence |
|---|---|---|---|---|---|---|---|
| Opt1 | yes (floor) | same or 2× | none | +0–32k tok | kept | — | medium (inference) |
| Opt2 | yes (floor) | ~1× + small | none / column if per-agent | +few k tok | kept | mixed-model run | medium-low (inference) |
| Opt3 | no | 1×, whole run lost | none | baseline | kept | fails the goal | high it stays broken |
| Opt4 | yes (floor) | ≪1× | likely port change | −~20k tok | kept (SDK via injected provider) | prototype first | low (inference) |
| Opt5 | yes (floor) | ~1× | none | +~1 call | kept | size link unproven | low (inference) |

## Recommendation
**Opt1 — go**, with the retry gated on the experiment below. The containment floor, including the false-clean guard and a marker in the summary (A1e = P2), delivers the primary outcome on its own and is needed by every non-status-quo option. Opt1 adds the cheapest retry on paths that already exist. If the experiment shows runaways repeat on re-roll, keep the floor and either drop the retry (A1a = A) or switch the retry to Opt2. Opt4 is the right follow-up for "waste less", but only after a streaming prototype. What would change it: replays of the runaway prompt truncating again on most providers.

## Cheapest experiment
**Riskiest assumption:** a deepseek-v4-flash runaway at `temperature: 0` is stochastic per provider and call, not determined by the prompt, so a re-roll usually completes.
**Try:** replay the stored prompt of PR #13's `mcp-server/test/conventions.test.ts` chunk 5× with the retry routing and the 32k cap, recording served-by, finish reason and output tokens — **cost:** ≤5 × 32k output tokens, about an hour of work.
**Success signal:** ≤2/5 hit `length` · **Kill signal:** ≥4/5 hit `length`, in which case drop the same-model retry.

## Questions that change the choice
- Q1: does the runaway repeat on replay? → if yes, A (skip only), or Opt2 if Q2 is also yes.
- Q2: is there a strict-JSON, non-reasoning (or reasoning-off) model on OpenRouter that the user accepts for a fallback? → flips toward Opt2.
- Q3: is "waste less" a hard requirement for this change, not a follow-up? → flips toward Opt4 (prototype first).
- Q4: are runaway chunks markedly larger than successful ones? → flips the retry toward Opt5.

## Facts needed (for researcher)
- Is the full prompt of PR #13's failed `conventions.test.ts` chunk recoverable (run traces or log), so it can be replayed? Or does a re-run have to rebuild it?
- Across stored `agent_runs` / traces, how often did a call hit `finish_reason: length` or the cap, per agent and model, and how big were those diffs versus successful chunks?
- Do the stored runs show the same file or prompt running away twice, on the same or a different served-by provider?
- Does any successful review chunk's output exceed ~12k tokens? This sets a floor for an Opt4 budget or a lower per-file cap.
- Does OpenRouter's `models` fallback array (or any routing field) fall back on `finish_reason: length`, or only on errors?
- Which OpenRouter models support strict `json_schema` with no reasoning, and what are their prices next to deepseek-v4-flash?
- When the openai SDK streams deepseek-v4-flash via OpenRouter, are reasoning deltas and their token counts visible to the caller, and does an aborted stream report any usage?
- Does `reduceReviews` / the verdict path give a partial run any way to avoid `approve` other than the summary note (for example, capping the verdict when a chunk is skipped)?

## Choice recorded
**Chosen: Opt1** (plan 08 A1a = C) on top of the containment floor; user, 2026-10-01: "давай спробуємо усе за рекомендаціями". Leads to plan 08 Amendment A1. Produced on 2026-10-01 for the reopened plan 08 (Amendment A1). The cheapest experiment ran (user-approved; results in plan 08 → *A1 live probe*): 0/5 `length` on re-roll, which meets the success signal, so Opt1's retry is justified. Reasoning-off (an Opt2-like retry) gave 0 findings 5/5 and is rejected.
