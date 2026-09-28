# Idea brief: Cheaper review runs without losing useful findings
Status: open
Save as: docs/ideas/02-cheaper-review-runs.md

## Problem as understood
Users should see a lower run cost on the cost badge, PR-list COST column and trace Stats tile for the same PR, while the review keeps the findings they would act on.
**Decision drivers:** (1) cost cut per run; (2) recall of useful findings, and whether we can prove we kept it; (3) contract/migration churn and `reviewer-core` purity; (4) effort.
**Appetite (assumption):** one plan's worth of work, no new LLM call per run, and no rise in cost for any PR shape.

## Already in the repo
- Per-run cost is stored and shown (`api` vs `estimate`). It gives a before/after baseline for free — `specs/001-run-cost-badge.md` (done)
- Map-reduce makes one LLM call per file, and each call repeats the system prompt and repo map — `specs/001` Design, "worst-wins" section
- Intent Layer adds a cheap classifier call and drops out-of-scope findings after grounding — `specs/006`, `docs/plans/01` (done)
- Smart Diff: reviewer-ordered file roles — `specs/007` (done)
- An eval pipeline (L06) and multi-agent review (L07) are on the course roadmap but not built — `README.md` lesson table
- Nothing killed or planned on cost in `docs/ideas/README.md` or `docs/plans/README.md`.

## Options
- Opt1 — provider prompt caching of the stable prefix · Opt2 — status quo · Opt3 — deterministic trimming of the input (noise files, repo-map scope) · Opt4 — cheap-model triage that escalates only risky chunks · Opt5 — pack files into token-budgeted batches instead of one call per file · Opt6 — incremental re-review of only the commits since the last reviewed head

### Opt1 — Prompt caching of the stable prefix
- **Value:** the system prompt, agent prompt and repo map are the same for every per-file call and every agent. Cached input tokens are billed at a steep discount by providers that support it. The model sees the same input, so findings can't change.
- **Packages / contract / migration:** reviewer-core prompt order plus provider request flags; maybe a cached-token field on the LLM result. No migration.
- **Per-run LLM cost:** input cost drops sharply on multi-file runs; about 0 saving on single-file runs (inference)
- **Risk:** support through OpenRouter differs by model and provider. The saving may be small if the diff, not the prefix, is most of the tokens.
- **Kill criterion:** cached-token counts stay near 0, or the prefix is a small share of input.
- **Purity:** n/a (only the request shape changes)
- **No-go:** most workspaces use models with no caching.
- **Confidence:** medium (inference)

### Opt2 — Status quo
- **Value:** no work, no risk to findings. Cost is already visible, so spend is not hidden.
- **Packages / contract / migration:** none · **Per-run LLM cost:** unchanged · **Risk:** cost grows with the Intent call and future multi-agent runs
- **Kill criterion:** users stop running reviews, or run fewer agents, because of cost.
- **Purity:** n/a · **No-go:** measured cost per PR is already a complaint · **Confidence:** high (inference)

### Opt3 — Deterministic input trimming
- **Value:** skips lockfiles, generated and vendored files, and pure renames or whitespace hunks, and cuts the repo map down to what the diff touches. Fewer tokens and fewer per-file calls, with no LLM involved.
- **Packages / contract / migration:** a server- or core-side heuristic. The run trace may need to list skipped files. No migration.
- **Per-run LLM cost:** large on noisy PRs, about 0 on clean ones (inference)
- **Risk:** a wrong skip rule silently hides a real finding, such as a malicious lockfile change or a generated file that is actually hand-edited.
- **Kill criterion:** a skipped file turns out to hold a finding a user cared about.
- **Purity:** fine if the rules take the diff as input. Main risk if they need fs reads of `.gitattributes` or the clone inside core.
- **No-go:** most PRs have no noise files.
- **Confidence:** medium (inference)

### Opt4 — Cheap-model triage, then escalate
- **Value:** a cheap model scores each chunk's risk, and only risky chunks go to the agent's model.
- **Packages / contract / migration:** a new pipeline stage, a new feature-model setting and a new trace entry.
- **Per-run LLM cost:** net saving only when most chunks are low-risk. Adds a call to every run (inference)
- **Risk:** triage misses subtle bugs, which directly breaks "without losing useful findings". There is no eval pipeline to catch it.
- **Kill criterion:** escalated-only runs miss findings the full run caught.
- **Purity:** n/a · **No-go:** before the L06 eval pipeline exists · **Confidence:** low (inference)

### Opt5 — Token-budgeted batching
- **Value:** N per-file calls become a few calls, so the prefix is paid a few times instead of N.
- **Packages / contract / migration:** changes chunking in reviewer-core and the grounding inputs per call. No contract change.
- **Per-run LLM cost:** close to Opt1's saving on many-small-file PRs (inference)
- **Risk:** larger contexts dilute attention, which lowers recall per file and changes finding line mapping.
- **Kill criterion:** findings per file drop on batched runs.
- **Purity:** n/a · **No-go:** if Opt1 already cancels the repeated-prefix cost · **Confidence:** medium-low (inference)

### Opt6 — Incremental re-review
- **Value:** a re-run after new commits reviews only the delta since the last reviewed head and carries earlier findings forward.
- **Packages / contract / migration:** server run executor, a reviewed-head record per run (likely a migration), and UI state for carried findings.
- **Per-run LLM cost:** large on re-runs, 0 on first runs (inference)
- **Risk:** carried findings go stale when their lines move, and cross-commit interactions are missed.
- **Kill criterion:** re-runs are rare in practice.
- **Purity:** n/a · **No-go:** most runs are first reviews · **Confidence:** medium (inference)

## Comparison
| Option | Cost cut | Findings risk | Contract/migration | LLM cost/run | Purity | Confidence |
|---|---|---|---|---|---|---|
| Opt1 | med-high on multi-file | none by construction | maybe 1 optional field | lower, no new call | ok | medium |
| Opt2 | none | none | none | unchanged | ok | high |
| Opt3 | high on noisy PRs | medium (silent skips) | trace field | lower | ok if diff-only | medium |
| Opt4 | uncertain | high | new stage + setting | +1 call | ok | low |
| Opt5 | med-high on multi-file | medium (dilution) | none | fewer calls | ok | medium-low |
| Opt6 | high on re-runs only | medium (stale carry) | migration | lower on re-runs | ok | medium |

## Recommendation
**Opt1 — go.** It is the only option that can't change findings, because the model sees the same input. That matters because there is no eval pipeline yet to prove recall was kept, and the stored run cost shows the saving directly. Opt3 is the natural follow-up once the cost of noise files is measured. Opt4 should wait for L06 evals. What would change it: if the token breakdown shows the diff, not the repeated prefix, is most of the input, switch to Opt3.

## Cheapest experiment
**Riskiest assumption:** the repeated prefix (system prompt + repo map) is a large share of input tokens, and the models users pick cache it through OpenRouter.
**Try:** on 3–5 real multi-file PRs, read input tokens per call from existing run traces and split them into prefix vs diff. Then send one call twice with caching enabled and read the cached-token count. **Cost:** about half a day, a few cents of LLM spend.
**Success signal:** the prefix is at least about 40% of input tokens and the second call reports cached tokens. · **Kill signal:** the prefix is under about 15%, or no cached tokens come back for the default models.

## Questions that change the choice
- Q1: Are most runs re-reviews of the same PR after new commits? → flips to Opt6 if yes.
- Q2: Is losing a low-severity finding acceptable to get a large cut? → opens Opt4/Opt5 if yes. Opt1 or Opt3 only if no.
- Q3: Do users mostly run reviews on models or providers with no prompt caching? → flips to Opt3 if yes.

## Facts needed (for researcher)
- What order are the sections of the reviewer prompt in, and is everything before the per-file diff byte-identical across calls in one run and across agents?
- How large is the repo map compared with the diff in a typical per-file call, in chars or tokens from existing run traces?
- Does the provider layer send any cache-control hints, or read cached-token usage from OpenRouter or Anthropic responses?
- Is map-reduce still strictly one call per file, and is there a threshold under which it's a single call?
- Does any path already skip lockfiles, generated or vendored files before the prompt is built?
- Does anything record the head SHA a review ran against, which Opt6 would need?
- How many LLM calls does a typical run make today, counting the Intent classifier and the General and Security agents?
- Which default models (feature-model registry and built-in agents) are used, and which of them support prompt caching via OpenRouter?

## Choice recorded
Pending — saved from the post-fix T2 regression smoke run of plan 03 (produced before V1/V2, so it has 6 options and the older field layout); the user decides whether to pursue it.
