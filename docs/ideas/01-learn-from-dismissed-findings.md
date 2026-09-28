# Idea brief: Learn from dismissed findings
Status: open
Save as: docs/ideas/01-learn-from-dismissed-findings.md

## Problem as understood
A reviewer keeps raising findings the user already dismissed on earlier PRs of the same repo, so triage repeats itself and the tool stops being trusted. The observable outcome: on the next review of that repo, findings the user already rejected either don't come back, or come back visibly marked "similar to one you dismissed".
**Decision drivers:** (1) cuts repeated noise without silently hiding true positives · (2) the user can see and undo it · (3) low cost per run and small contract/migration surface · (4) does not collide with L07 "Persistent memory".
**Appetite (assumption):** at most +10% per-run LLM cost; one plan's worth of effort, not a lesson-sized feature.

## Already in the repo
- Dismiss/Accept on findings and the `dismissed_at` column already exist. Dismissed findings are excluded from counts — `specs/002-severity-findings-counter.md`, `specs/007-smart-diff.md`.
- ACCEPT RATE = accepted ÷ (accepted + dismissed) per skill, shown as correlation only — `specs/003-skills.md`.
- Accepted/rejected convention decisions survive a re-scan. "Embedding conventions into `memory`" is explicitly out of scope — `specs/004-conventions-extractor.md`.
- "Persistent memory" is on the L07 roadmap, not built — `README.md`, *What you build in the course*.

## Options
- Opt1: prompt memory — recent dismissals of the repo are passed into the review prompt as "previously rejected".
- Opt2: capture a dismissal reason and show dismissal stats per agent; nothing is fed back automatically.
- Opt3: status quo — dismiss only hides; people read ACCEPT RATE and edit prompts or skills by hand.
- Opt4: deterministic match with no LLM call — each new finding is compared with past dismissals (fingerprint or pgvector similarity), then marked or down-ranked, never deleted.
- Opt5: turn dismissals into a proposed "review exceptions" skill that a person must accept, the way the conventions extractor works.

### Opt1 — Prompt memory of dismissals
- **Value:** the model can generalise ("this repo doesn't care about X") beyond exact repeats.
- **Packages / contract / migration:** a new review-input field in shared; the server gathers the dismissals; the prompt builder changes. Probably no migration.
- **Per-run LLM cost:** +1–4k input tokens per run, which grows with history (inference).
- **Risk:** silent suppression. When the model drops a true positive, nothing on screen shows it. The prompt also grows with every dismissal.
- **Kill criterion:** reviewers stopped raising real issues that sat near old dismissals, and no one could tell.
- **Purity:** kept only if the dismissals arrive as plain data in the input. `reviewer-core` must not query for them itself.
- **No-go:** dismissals carry no reason, or the L07 memory design is going to replace this.
- **Confidence:** medium (inference)

### Opt2 — Dismissal reason and stats
- **Value:** turns an ambiguous signal into a labelled one (false positive / won't fix / out of scope). Every other option needs this to be trustworthy.
- **Packages / contract / migration:** a finding contract field, a migration, and a UI control on Dismiss.
- **Per-run LLM cost:** 0 (inference)
- **Risk:** users skip the reason picker, so the data stays sparse.
- **Kill criterion:** under ~30% of dismissals get a reason.
- **Purity:** n/a
- **No-go:** the goal is to reduce noise now, not to measure it.
- **Confidence:** high that it works as described; low that it removes noise by itself (inference)

### Opt3 — Status quo
- **Value:** zero cost. ACCEPT RATE already points people at noisy skills, and a person fixes the prompt.
- **Packages / contract / migration:** none.
- **Per-run LLM cost:** 0 (inference)
- **Risk:** repeated noise goes on, and the feedback loop depends on someone reading the stats.
- **Kill criterion:** n/a
- **Purity:** n/a
- **No-go:** measured repeat noise is high (see the experiment below).
- **Confidence:** high (inference)

### Opt4 — Deterministic match against past dismissals
- **Value:** repeats are flagged "similar to dismissed #…" and sorted down, and the user can bring them back with one click. Everything happens after the LLM, so nothing is hidden inside the model.
- **Packages / contract / migration:** a finding contract flag or a link to the matching dismissal; probably an embedding or fingerprint column (migration); UI marker and filter.
- **Per-run LLM cost:** 0 LLM tokens; embedding cost is small if embeddings are used (inference).
- **Risk:** matching quality. Line and wording drift break exact fingerprints, and embedding thresholds over-match.
- **Kill criterion:** too many false matches, so users stop trusting the marker.
- **Purity:** kept if the matching is a pure function over data passed in, or lives in the server. `reviewer-core` does no DB lookup.
- **No-go:** most real repeats are paraphrased, not near-duplicates.
- **Confidence:** medium (inference)

### Opt5 — Turn dismissals into a skill a person approves
- **Value:** reuses Skills plus the preview-then-accept flow. The result is readable and editable, and its effect shows up in ACCEPT RATE.
- **Packages / contract / migration:** a new extraction job, reusing the skill `source` pattern; a small migration or none.
- **Per-run LLM cost:** 0 per review run; one LLM call per extraction, plus the skill's tokens in the prompt (inference).
- **Risk:** needs enough dismissals per repo to find patterns, and overlaps heavily with the conventions extractor.
- **Kill criterion:** proposed skills are vague ("avoid nitpicks") and get rejected.
- **Purity:** n/a (the skill enters as ordinary prompt input)
- **No-go:** dismissal volume per repo is low.
- **Confidence:** low–medium (inference)

## Comparison
| Option | Cuts repeat noise | Visible/reversible | Contract/migration | LLM cost/run | Purity | Confidence |
|---|---|---|---|---|---|---|
| Opt1 | yes, fuzzy | no | contract | +1–4k tokens | at risk | medium |
| Opt2 | no (enabler) | yes | contract + mig | 0 | n/a | high |
| Opt3 | no | n/a | none | 0 | n/a | high |
| Opt4 | yes, near-dupes | yes | contract + mig | ~0 | kept | medium |
| Opt5 | partly | yes (human gate) | small | skill tokens | n/a | low–med |

## Recommendation
**Opt4 — needs-clarification.** It is the only option that cuts repeats while keeping every suppression visible and undoable, and it costs no LLM tokens. It stays open for two reasons: nobody has measured whether repeats are frequent, and L07 "Persistent memory" may own this area. What would change it: if dismissals are rare or mostly one-offs → **kill** (Opt3). If the L07 memory design already covers finding feedback → fold this into L07.

## Cheapest experiment
**Riskiest assumption:** a meaningful share of new findings closely resembles findings the user already dismissed on the same repo.
**Try:** run a one-off query over existing review data: for each dismissed finding, look for later findings on the same repo with the same file and category and a close title or embedding. **Cost:** about half a day, no product change.
**Success signal:** at least 15% of findings in later runs match an earlier dismissal, and a hand check of 20 matches finds most of them are real repeats. **Kill signal:** under 5% match, or most matches are different issues.

## Questions that change the choice
- Q1: What does "dismiss" mean to users — "wrong" or "not now"? → if mostly "not now", learning from it is unsafe; do Opt2 first.
- Q2: Is this meant to be the L07 "Persistent memory" feature? → if yes, this brief feeds that lesson's design, and Opt1 is back in play inside it.
- Q3: Should suppression be per repo or per agent? → if per agent and style-driven, Opt5 (a skill) fits better than Opt4.

## Facts needed (for researcher)
- Does a dismissal store anything beyond `dismissed_at` (reason, user, the run it happened in)?
- How many findings are dismissed per repo in current or seed data, and how many later findings share the same file and category?
- Do findings already carry a stable identity (category, rule id, normalised title) or an embedding that could act as a fingerprint?
- Is pgvector already used for any per-finding or per-snippet embedding, and which embedding model and cost?
- Does the review input contract in shared already take extra context lists (repo map, intent, skills) that a dismissal list could follow?
- Is there any design note or stub for L07 "Persistent memory"?

## Choice recorded
Pending — saved from smoke test T2 of plan 03; the user decides whether to pursue, drop or delete it.
