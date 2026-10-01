# Idea brief: Fewer false CRITICALs from the built-in reviewers, measured honestly
Status: chosen (Opt2 + Opt1)
Save as: docs/ideas/06-fewer-false-criticals.md

## Problem as understood
A PR author in the studio sees few CRITICALs, and each one they see holds up against the code. Real defects are still caught. Today General Reviewer on PR #13 raised 15 CRITICALs and none held. 3 broke repo rules the agent never saw. 2 needed a fact from another file. 2 flagged recorded plan decisions as bugs. Overall about 4 of 45 findings were real. Earlier, on PR #12, agents also reported issues outside their own lane.
**Decision drivers:** (1) false-CRITICAL rate down, recall on PR #12 not down · (2) measurable with `pnpm eval:review` over 3–5 runs per variant on 2 fixtures · (3) per-run LLM cost (idea 02) · (4) contract/migration surface and `reviewer-core` purity.
**Appetite (assumption):** at most +25% per-run LLM cost on a large map-reduce PR (idea 03's ceiling), and one plan's worth of work.

## Already in the repo
- Eval harness: recall, precision and duplicates per agent on PR #12 (12 planted issues). It makes no LLM call and has no severity metric. — `docs/plans/09-review-eval-fixture.md` (done), `docs/plans/12-…` (done)
- Plan 10 ideas: lane boundaries, lane checklists, dropping off-topic skills, a stronger model, a shared severity table, dedup. The measuring rule needs 3–5 runs per variant and a second fixture. — root `INSIGHTS.md` 2026-09-30
- Idea 03 (needs-clarification): defect-first prompt, wider context, a failure-scenario gate, find-then-verify. — `docs/ideas/03-catch-more-real-bugs.md`
- Idea 02 (go Opt1): prompt caching of the stable prefix. Its appetite says "no new LLM call". — `docs/ideas/02-cheaper-review-runs.md`
- Skills are attached to agents (spec 003, active). A conventions extractor exists only as a draft spec (spec 004). The intent layer passes the PR's intent to the review. — `specs/README.md`
- The plan 10 slot in `docs/plans/README.md` is unused.

## Options
- Opt1 — Precision prompt package (prompt/seed only) · Opt2 — Ground every chunk: path-scoped repo rules, PR decisions and a list of the PR's changed files · Opt3 — Status quo · Opt4 — Deterministic gates after the LLM · Opt5 — Refute pass on CRITICALs only

### Opt1 — Precision prompt package
- **Value:** puts INSIGHTS ideas 1, 2, 3 and 5 into prompts. Each prompt states its lane boundaries and that an empty review is fine. A shared severity table says CRITICAL means a demonstrated failure on the main path. Off-topic skills are dropped from General Reviewer.
- **Packages / contract / migration:** agent prompts and seed data only. Prompts are versioned.
- **Per-run LLM cost:** about 0, maybe lower because fewer skills means less input (inference).
- **Risk:** it fixes behaviour, not knowledge. None of the 7 explained PR #13 failures was caused by an instruction the model ignored.
- **Kill criterion:** duplicates fall on PR #12, but false CRITICALs on PR #13 stay roughly the same.

### Opt2 — Ground every chunk
- **Value:** each map-reduce chunk gets three things as plain data: the repo rules for the paths it touches (gotchas/AGENTS-style text), the PR's stated decisions (description or linked plan), and a short list of all the files the PR changes (path, role, key symbols). This targets all three PR #13 causes with no new LLM call.
- **Packages / contract / migration:** the server gathers the data. A new input section reaches the engine, likely a shared contract field. No migration expected.
- **Per-run LLM cost:** +1–4k input tokens per chunk. Uncached, that is +15–40% input on a 142-file run. Mostly cached if idea 02 Opt1 lands (inference).
- **Risk:** more text dilutes attention, which plan 10 idea 3 warns about. The list of changed files may be too thin to rule out "undefined" or "missing dedupe" claims. Purity holds only if the engine receives text and never reads the clone.
- **Kill criterion:** the rules are present in the trace, yet the same false CRITICALs come back.

### Opt3 — Status quo
- **Value:** no cost. Users can filter by severity and edit prompts.
- **Packages / contract / migration:** none · **Per-run LLM cost:** 0 (inference)
- **Risk:** false CRITICALs block PRs, and users learn to ignore CRITICAL.
- **Kill criterion:** n/a

### Opt4 — Deterministic gates after the LLM
- **Value:** three rules, no extra LLM call. A CRITICAL with no failure scenario (trigger → wrong result) is demoted. A CRITICAL that claims a symbol is undefined or mistyped is demoted when an external signal (the PR's CI typecheck status, or a typecheck run) proves the head clean. Agents' findings are merged by file, lines and category.
- **Packages / contract / migration:** a failure-scenario field in shared plus a UI line, and pure rules in the engine. A migration if the field is persisted.
- **Per-run LLM cost:** about +5–10% output (inference).
- **Risk:** running a typecheck on an imported clone executes untrusted toolchains, which crosses a trust boundary. The CI-status route depends on the repo having CI. The rules can catch only about 1 of the 7 explained failure types. Models write scenarios that sound plausible.
- **Kill criterion:** few false CRITICALs match a deterministic pattern, so most get through.

### Opt5 — Refute pass on CRITICALs only
- **Value:** each CRITICAL goes to a second LLM call that sees the whole cited file, the files that reference the cited symbol, the repo rules and the PR decisions. The call is told to refute the finding. If it refutes it, the finding is demoted, not deleted. This is the only option that brings in cross-file evidence on demand.
- **Packages / contract / migration:** a new engine stage that gets its context as data, a trace entry, and probably a "verified/demoted" flag in the contract.
- **Per-run LLM cost:** grows with the number of CRITICALs. About +10–25% on PR #13, +50% or more on a small PR that has a CRITICAL. Needs a cap (inference).
- **Risk:** cost. It breaks idea 02's "no new call". The verifier may side with the first pass, or demote real CRITICALs, which costs recall.
- **Kill criterion:** it refutes under half of the known-false CRITICALs, or demotes a planted real one.

## Comparison
| Option | False-CRITICAL cut | Eval-measurable | Contract/migration | LLM cost/run | Purity | No-go | Confidence |
|---|---|---|---|---|---|---|---|
| Opt1 | low on PR #13, medium on lane overlap | yes, recall + duplicates | none | ~0 | kept | knowledge, not behaviour, failed | medium |
| Opt2 | medium–high (rules + decisions) | yes, needs a severity metric | 1 input field | +15–40% uncached | kept if data-only | dilution | medium |
| Opt3 | none | baseline | none | 0 | kept | 0/15 CRITICALs held | high |
| Opt4 | low (~1 of 7 types) | yes | field (+mig) | ~+5–10% | kept; typecheck at risk | trust boundary | low–medium |
| Opt5 | high | yes, needs a severity metric | stage + flag | +10–25%, uncapped on small PRs | kept if data-only | cost ceiling | medium |

## Recommendation
**Opt2 — go**, on one condition: before any variant is compared, there must be a second fixture (PR #13, its CRITICALs labelled true/false) and a false-CRITICAL metric. The new evidence shows missing knowledge, not ignored instructions. Opt2 gives the model that knowledge without a new call, and it fits idea 02's caching. Opt1 is a cheap, independent arm for the lane-overlap problem. Model strength (plan 10 idea 4) is a setting to test as an extra arm, not an option. What would change it: if CRITICALs that need cross-file facts are still wrong with the rules present → **Opt5**, capped.

## Cheapest experiment
**Riskiest assumption:** with the relevant rules and plan decisions in the input, the model stops raising those false CRITICALs, and the extra text does not drown them out.
**Try:** no code. Attach a temporary skill to General Reviewer that holds the gotchas behind the PR #13 false CRITICALs, put the plan decisions in the PR description, and re-run the PR #13 files that carried false CRITICALs (not all 142), 3 times. — **cost:** about half a day, a few dollars.
**Success signal:** most rule- and decision-caused false CRITICALs disappear, and PR #12 recall stays within noise. · **Kill signal:** they come back in most runs even with the rules present.

## Questions that change the choice
- Q1: Is a bounded extra call per CRITICAL acceptable, despite idea 02's "no new call"? → flips to Opt5 if yes and the experiment shows mostly cross-file failures.
- Q2: Is the target "fewer findings that block a PR", with WARNING noise acceptable? → if yes, Opt4's demotion-only rules get stronger.
- Q3: Do imported repos usually have CI typecheck status on the PR? → if yes, Opt4's typecheck gate becomes safe.

## Facts needed (for researcher)
- Can the eval harness score severity (for example, false CRITICALs per run) and a fixture made of "known-false" findings without a schema change?
- What does a map-reduce chunk receive today: PR description or intent, skills, repo map, other files' paths or symbols?
- Do skills reach every map-reduce chunk call, or only the single-call path? Can a skill be scoped to paths?
- How many input tokens did the PR #13 General run use per chunk, and in total, and what did it cost?
- Does the studio store anything like repo rules or gotchas per repo (conventions table, the spec 004 extractor)?
- Does the server have the PR's CI check status from GitHub, or any typecheck signal for the head?
- Do the findings in the contract have a free-text failure or mechanism field today?
- Did idea 02 Opt1 (prompt caching) ship, and does the default model cache through OpenRouter?

## Choice recorded
User, 2026-10-01: "Opt2 + Opt1, Q1 — так з лімітом, Q2 — так, Q3 — не знаю; експеримент робимо".
- **Chosen: Opt2** (ground every chunk: path-scoped repo rules, PR decisions, the list of changed files) **+ Opt1** (precision prompt package) as an independent arm.
- **Q1 → yes, with a cap:** a bounded extra call per CRITICAL is acceptable later. Opt5 is recorded as the conditional next step if cross-file false CRITICALs persist after Opt2; it is not part of plan 10.
- **Q2 → yes:** the target is fewer false blocking findings; WARNING noise is acceptable.
- **Q3 → unknown:** Opt4's typecheck gate stays out.
- **The cheapest experiment runs first.** Produced on 2026-10-01 from the PR #13 General Reviewer run (`9e448f64-…`; main-session triage: 0/15 CRITICALs held, ~4/45 findings real). Leads to plan 10.

## Facts established (repo research, 2026-10-01)
Main-session note; the brief above is unchanged.
- **Every slot reaches every map-reduce chunk.** `promptParts` is assembled per chunk with only `diff` swapped (`reviewer-core/src/review/run.ts:225-235,295`), so any Opt2 text is paid ×chunks (PR #13: 142; prefix ≈4.5k tokens/chunk ≈ 63% of the 1.02M input; run cost $0.162).
- The **`memory` slot** exists in `PromptParts`/`ReviewInput` but the server never fills it (`run-executor.ts:267-304`). It is a contract-free home for repo rules and decisions.
- **Skills cannot be path-scoped** (`db/schema/skills.ts`), so per-package rules need a per-chunk filter in the engine.
- The accepted-conventions → skill path is live: `dev-digest-conventions` (source `extracted`) was in the PR #13 run, and the false CRITICALs happened anyway. The gap is gotchas and plan decisions, not conventions.
- **Eval has no severity**, and the fixture is `.strict()` with no "known-false" list. Minimal extension inside `server/src/modules/eval/`: severity in `findingsForRuns`/`EvalFindingInput`, optional `false_positives` in the fixture, a `falseCriticals` metric in `actualOutput`. No contract or migration.
- **No CI-status source** in `ForgeClient`, so Opt4's typecheck gate has no data.
- **Prompt caching did not ship** (no `cache_control` or cached-token handling); idea 02 is still open.
- **Findings have no failure/mechanism field** (only `rationale`).

## Cheapest experiment — result (2026-10-01, main session, user-approved)
Replay of the 13 PR #13 files that carried false CRITICALs, ×3 each, `deepseek-v4-flash`, production routing. Base prompt = the run's stored system prompt + its 4 skills + the task line + the file diff. The grounded arm adds a `memory` section with:
- that package's `AGENTS.md` and `insights/gotchas.md` (automatic);
- a main-session-written digest of plan decisions plus "CI typecheck passes on head" (hand-written, so an upper bound);
- the list of the PR's 142 changed files.
The script is in the session scratchpad and not committed.

| | base | grounded |
|---|---|---|
| CRITICAL (39 answers) | **24** | **1** (a false "zod version" on `package.json`, 1/3 runs) |
| WARNING | 10 | 4 |
| `length` / errors | 0 / 0 | 0 / 0 |
| avg input / output tokens | 3.5k / 3.7k | 7.9k / 3.7k |
| cost (39 calls) | $0.0446 | $0.0510 (**+14%**) |

The base arm reproduced the same false classes as the real run (`zod/v3` import, `inputSchema` not `z.object`, undefined `logger`, `loadDiff` signature, unique index vs duplicates, `ok(undefined)`).
- **Success signal met for false CRITICALs.**
- **Not yet established:**
  - which part did it: package rules (automatic) vs the hand-written decisions and "typecheck passes" line (no automatic source, since there is no CI status);
  - **recall on PR #12**, i.e. that grounding doesn't suppress real defects. This is required by the success signal before Opt2 counts as proven.

## Ablation and recall — result (2026-10-01, main session, user-approved, ~$0.09)
- **Ablation (PR #13, 13 files ×3), "auto" grounding** (package `AGENTS.md` + `insights/gotchas.md` + changed-file list, no hand-written decisions): **CRITICAL 24 → 6** (decisions included: 1). Gone: the whole `zod/v3` / `registerTool` / `inputSchema` class. Left:
  - undefined `logger` ×2 (needs a "code compiles" signal);
  - unique index "without migration" ×2 (needs the cross-file link to migration 0020);
  - `pnpm-workspace.yaml` keys ×1;
  - `gap()` off-by-one ×1 (unverified).
- **Recall (PR #12 planted files, ×8 per arm, scored with the plan 09 `matchFinding`).**
  - base: 6, 7, 7, 3, 7, 8, 8, 6, mean **6.5**/12.
  - auto: 6, 6, 3, 6, 5, 6, 4, 6, mean **5.25**/12 (≈ −19%; single-run noise is large).
  - Per issue: **`no-authz` base 5/8 → auto 1/8**; `hardcoded-key` 4/8 → 2/8.
  - Likely cause: the injected `server/insights/gotchas.md` / `AGENTS.md` describe "no auth by design (local-first)", and the model treated a planted missing-authz bug as by design.
- **Implications for the plan:**
  - Repo-rule grounding needs an explicit trusted rule that rules/decisions explain conventions and APIs but never make a security or correctness defect acceptable (the task line already says this for PR text, not for injected rules).
  - It also needs content selection (technical gotchas, not "by design" policy prose), plus a recall gate on PR #12 with multiple runs.
  - The residual cross-file false CRITICALs point to Opt5 (capped; Q1 = yes) as the follow-up.
