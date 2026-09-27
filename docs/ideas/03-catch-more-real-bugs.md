# Idea brief: Reviewers catch more real bugs, fewer style-only findings
Status: open
Save as: docs/ideas/03-catch-more-real-bugs.md

## Problem as understood
Reviews in the studio return findings that are mostly style or nitpicks, while real defects (wrong logic, null/edge cases, broken error paths, race conditions, contract breaks) get missed or buried. What should change on screen: on a PR with a real bug, the bug appears as a grounded WARNING/CRITICAL that names a concrete failure, and style-only findings no longer outnumber it.
**Decision drivers:** (1) more real defects caught, and a way to show it without the L06 eval pipeline · (2) per-run LLM cost, which must not undo idea 02 · (3) contract/migration surface and `reviewer-core` purity · (4) effort and reversibility.
**Appetite (assumption):** at most +25% per-run LLM cost, and one plan's worth of work, not a lesson-sized feature.

## Already in the repo
- The prompt checklist already requires "analyze along the execution path; state the mechanism", "precision over volume" and an anti-inflation rule. Prompts are versioned in `agent_versions`. — `docs/agent-prompts/README.md`
- The review input already has *Callers of changed symbols*, the repo skeleton, project context and memory sections. — `docs/agent-prompts/README.md`
- Intent layer: the PR intent is injected into the review. — `specs/006-intent-layer.md`
- Severity filter on findings (L01), and a grounding gate that drops findings on lines that don't exist. — `README.md`, `specs/002-…`
- Specialised prompts already exist: security, performance, test-quality, api-contract. — `docs/agent-prompts/`
- Idea 02 (cost cuts, go Opt1) says there are no evals yet to prove recall. Its Opt4 (cheap-model triage) was deferred to L06. — `docs/ideas/README.md`
- Roadmap, not built yet: L04 Blast Radius, L06 Eval pipeline, L07 Multi-agent review. — `README.md`

## Options
- Opt1 — defect-first prompt rewrite (prompt-only, no code) · Opt2 — wider code context for each changed hunk · Opt3 — status quo · Opt4 — each finding must carry a failure scenario, enforced by a deterministic gate · Opt5 — find-then-verify: a second LLM pass that tries to confirm each candidate bug

### Opt1 — Defect-first prompt rewrite
- **Value:** the built-in reviewers hunt named defect classes in priority order (logic, null/edge, error paths, concurrency, state, contract). Style is at most SUGGESTION, or left out when a linter would catch it. Every finding states the input that triggers it and the wrong result.
- **Packages / contract / migration:** agent prompt text and seed data only. No contract, no migration.
- **Per-run LLM cost:** about +0–300 input tokens (inference).
- **Risk:** the checklist already asks for this, so the gain may be small. Models can obey the wording and still miss bugs they can't see.
- **Kill criterion:** it failed because the missed bugs were never visible in the input the model got.

### Opt2 — Wider code context around changes
- **Value:** the model sees the whole enclosing function and the definitions of the symbols the diff calls, not just the hunk lines. Many real bugs are only visible there: a changed contract, an unchecked return, a lock taken elsewhere.
- **Packages / contract / migration:** the server gathers context from the clone and `repo-intel`, and it reaches the review as a new input section (a contract field in shared). No migration.
- **Per-run LLM cost:** +20–60% input tokens, depending on PR shape (inference).
- **Risk:** extra context dilutes attention and adds cost. It overlaps L04 Blast Radius. Purity holds only if `reviewer-core` receives the context as plain data and never reads the clone itself.
- **Kill criterion:** it failed because the extra context raised cost without changing which bugs were found.

### Opt3 — Status quo
- **Value:** no cost. Users can already hide low severities (L01) and edit or version prompts by hand.
- **Packages / contract / migration:** none.
- **Per-run LLM cost:** 0 (inference).
- **Risk:** reviews keep reading as a linter, and trust drops.
- **Kill criterion:** n/a

### Opt4 — Failure-scenario gate
- **Value:** the findings schema gets a required "failure scenario" (trigger → wrong outcome). A deterministic rule after the LLM demotes any finding without a concrete scenario to SUGGESTION. The schema forces the model to reason about how the code breaks, and the rule stops style findings from taking blocker slots.
- **Packages / contract / migration:** a contract field in shared, a UI line on the finding card, a pure rule in the engine. A migration if the field is persisted.
- **Per-run LLM cost:** about +10% output tokens (inference).
- **Risk:** it mostly raises precision, not recall. It filters toward bugs but doesn't find new ones, and models can invent plausible scenarios.
- **Kill criterion:** it failed because the scenarios were boilerplate and the demotion hit real bugs.

### Opt5 — Find-then-verify pass
- **Value:** the first pass is told to cast wide for suspected defects. A second pass takes each suspect and tries to confirm or refute it against the code. Only confirmed bugs are kept at WARNING or higher.
- **Packages / contract / migration:** a new pipeline stage in the engine and a run-trace entry. The contract may get a "verified" flag.
- **Per-run LLM cost:** +60–120% (inference). That breaks the appetite and runs against idea 02.
- **Risk:** cost. It overlaps L07 multi-agent review, and without L06 evals nobody can prove it is better.
- **Kill criterion:** it failed because verification agreed with nearly every candidate, so it cost double and filtered nothing.

## Comparison
| Option | Real-bug recall | Provable w/o evals | Contract/migration | LLM cost/run | Purity | No-go | Confidence |
|---|---|---|---|---|---|---|---|
| Opt1 | small–medium | yes, cheap A/B | none | ~0 | kept | misses are context-bound | medium |
| Opt2 | medium–high | yes, cheap A/B | contract | +20–60% | at risk (clone access) | L04 owns this | medium |
| Opt3 | none | n/a | none | 0 | kept | style share is high | high |
| Opt4 | low (precision gain) | partly | contract (+mig) | ~+10% | kept | scenarios are boilerplate | medium |
| Opt5 | medium | no | contract + stage | +60–120% | kept | cost ceiling | low–medium |

## Recommendation
**Opt1 — needs-clarification.** Opt1 is the cheapest and fully reversible (prompts are versioned), and it needs no contract change. It should go first unless the missed bugs are invisible in what the model receives. In that case the answer is Opt2. Opt4 and Opt5 raise precision more than recall; they belong after L06 evals exist. What would change it: if most missed bugs need code outside the hunk to see, pick **Opt2**. If the real complaint is "bugs are buried under nitpicks" rather than "bugs are missed", pick **Opt4**.

## Cheapest experiment
**Riskiest assumption:** the bugs reviewers miss are visible within the diff and the context the model already gets, so steering alone can surface them.
**Try:** take about 10 fix commits from an imported repo's history. Revert each fix into a synthetic PR, run the current General reviewer, then run a defect-first prompt variant. For every miss, mark whether the bug can be seen from the hunk plus the existing context. **Cost:** about 1 day, a few dollars of LLM spend.
**Success signal:** the variant catches at least 3 more of the 10 bugs, and most misses are visible in the input. · **Kill signal:** most misses need code outside the hunk (switch to Opt2), or neither prompt catches any more bugs.

## Questions that change the choice
- Q1: Are bugs missed entirely, or found but buried under style findings? → if buried, Opt4 (plus the existing severity filter).
- Q2: Is L04 Blast Radius meant to own "context beyond the hunk"? → if yes, Opt2 folds into L04 and Opt1 stands alone.
- Q3: Is a per-run cost rise above ~25% acceptable? → if yes, Opt5 becomes viable after L06.

## Facts needed (for researcher)
- What does the seeded General reviewer prompt say today about defect classes and style? Does it already demand a failure mechanism?
- In existing runs or seed data, what share of findings is style or naming versus logic or correctness? Do findings carry a category field?
- For each file or hunk, does the engine send only the hunk lines, or the whole file or enclosing function?
- What exactly does *Callers of changed symbols* contain? Callers only, or also callee definitions? How many tokens does it add on a typical run?
- Can `repo-intel` return a symbol's full definition span (start and end lines) from the index?
- Is the Intent layer output used to focus the reviewer (for example, "bugfix PR → check the fix is complete")?
- Does the findings contract have room for a free-text rationale or mechanism field today?
- Is there a design note or stub for L04 Blast Radius or L06 evals that defines their scope?

## Choice recorded
Pending — saved from the post-V1/V2 T2 smoke re-run of plan 03; the user decides whether to pursue it.
