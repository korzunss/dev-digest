# Development Plan: Deterministic map-reduce review summary
Status: in-progress
Save as: docs/plans/17-map-reduce-summary.md
Spec: none

## Goal & acceptance criteria
In map-reduce mode, `review.summary` is today the model summaries of every chunk joined with spaces (`reviewer-core/src/review/reduce.ts:53`). On PR #13 (171 files) that gave ~170 contradictory paragraphs, which also describe findings that grounding later dropped. This plan makes two changes:
- In map-reduce mode, the engine computes the summary from the FINAL findings, after `groundFindings` and `applyScopeFilter` (`run.ts:427-445`).
- In both modes, it derives the verdict from those same findings.

There is no extra LLM call and no contract, server or client change. The plan 08 prefix `Partial review: K of M files not reviewed …` (`run.ts:457`) stays.

- AC1: In a map-reduce run, `review.summary` is exactly one line made by `summarizeFindings`. It holds no model text. It counts only the final findings, so a finding that grounding or the scope filter dropped never appears in it.
- AC2: A map-reduce run with skipped chunks still starts with `Partial review: K of M files not reviewed …`, followed by the computed line.
- AC3: In a single-pass run, `review.summary` is the model's own summary, unchanged (D3-A).
- AC4: In both modes, `review.verdict` = `verdictFromFindings(final findings, { partial })`:
  - any CRITICAL → `request_changes`;
  - otherwise, any finding → `comment`;
  - otherwise → `approve`;
  - but `approve` on a partial run becomes `comment` (D6).

  The model's `verdict` and `reduceReviews`' worst-verdict result are ignored.
- AC5: `reduceReviews` keeps its exported behaviour (`index.ts:37`), and `score` stays `scoreFromFindings(final)`.
- AC6: `reviewer-core/docs/pipeline.md` and `docs/agent-prompts/README.md` describe the new summary and verdict, and every `src/review/run.ts:N` / `src/review/reduce.ts:N` citation in `pipeline.md` points at the code as it is after S2.

## Decisions needed
| # | Decision | Options | Recommendation | Steps affected |
|---|---|---|---|---|
| D6 | Verdict of a partial map-reduce run (skipped chunks > 0) that has no surviving CRITICAL/WARNING/SUGGESTION | A: `comment`: never `approve` when files went unreviewed · B: plain mapping (`approve`) | A. An `approve` banner over "Partial review: 12 of 171 files not reviewed" claims a clean PR nobody fully read. Idea 05 left this exact question open (`docs/ideas/05-truncated-chunk-runaways.md:87`). The steps below are written for A; under B, S1 drops the `partial` option and the K1 test asserts `approve`. | S1, S2 |

D1–D5 are resolved; see *Decisions recorded*.

## Decisions recorded
User, 2026-10-01: "D5-B, решта за рекомендаціями".
- **D1-A, N=3:** the summary is one line of plain text. It gives files and chunks reviewed, final findings counted by severity, and the top 3 CRITICAL titles with `file:line`, then `+k more`. No Markdown, no line breaks.
- **D2-A:** a new pure helper, called in `run.ts` after grounding and the scope filter. `reduceReviews` stays unchanged (it is public API); `run.ts` overrides its summary.
- **D3-A:** single-pass keeps the model's own summary.
- **D4-A:** map-reduce keeps no model summary text; the run trace still has every chunk's raw output.
- **D5-B:** the verdict is derived from the final findings instead of the worst chunk verdict. This applies in both single-pass and map-reduce, so it is a visible behaviour change; the mapping is pass 2's to define.
- **D6-A:** a partial map-reduce run with no findings left gets `comment`, never `approve`.
- **Approval (user, 2026-10-01):** "D6-A, так, затверджую". The plan is approved as written.

## Prerequisites
- Docker running: the server `.it` regression tests in S2's Done-when start Postgres via testcontainers (`server/AGENTS.md:11,34`).

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S3 | reviewer-core (engine core) + docs | — | Last group. New internal symbols: `verdictFromFindings` (`src/review/reduce.ts`), `summarizeFindings` (`src/review/summary.ts`). No change to `src/index.ts`. |

## Steps
### S1 — Add `verdictFromFindings` and `summarizeFindings` (pure helpers)
- **Files:**
  - `reviewer-core/src/review/reduce.ts` (modify)
  - `reviewer-core/src/review/summary.ts` (create)
  - `reviewer-core/test/summary.test.ts` (create)
- **Change:**
  - In `reduce.ts`, below `scoreFromFindings` (`:27-30`), add `export function verdictFromFindings(findings: Finding[], opts: { partial?: boolean } = {}): Verdict`:
    - any `CRITICAL` → `'request_changes'`;
    - otherwise, `findings.length > 0` → `'comment'`;
    - otherwise → `opts.partial ? 'comment' : 'approve'` (D6-A).

    The doc comment cites the prompt convention it mirrors (`server/src/db/seed-prompts.ts:96-104`, `docs/agent-prompts/README.md:127-131`) and the `toReviewPayload` event under the default `failOn: 'critical'` (`src/output/to-review.ts:154-160`). `reduceReviews` and `VERDICT_RANK` are not touched.
  - Create `summary.ts` with `export function summarizeFindings(findings: Finding[], scope: { files: number; chunks: number }): string` and two constants, `SUMMARY_TOP_CRITICAL = 3` and `SUMMARY_TITLE_MAX = 80` (assumption: 80 characters).
    - Output, all on one line: `Reviewed <files> file(s) in <chunks> chunk(s): <X> finding(s) (<c> critical · <w> warning · <s> suggestion).` With zero findings: `Reviewed <files> file(s) in <chunks> chunk(s): no findings.`
    - When `c > 0`, append ` Critical: <title> (<file>:<start_line>); <title> (<file>:<start_line>); <title> (<file>:<start_line>)`, then ` +<k> more` when `c > 3`, then a final `.`.
    - CRITICALs are listed in input order. Use singular forms for 1 (`1 file`, `1 chunk`, `1 finding`).
    - Each title has its whitespace runs (including `\n`) collapsed to one space, is trimmed, and is cut to `SUMMARY_TITLE_MAX` characters with a trailing `…`.
- **Layer / why here:** Core (`reviewer-core`). This is pure domain logic over findings, the same as `scoreFromFindings` (onion decision step 5). The summary helper gets its own file because it is not part of the reduce step (D2-A).
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:**
  - Import only `Finding` / `Verdict` types from `@devdigest/shared`. No I/O, no `process.env`, no new dependency.
  - Return type `Verdict` (`server/src/vendor/shared/contracts/findings.ts:38-39`), not a widened `string`.
  - Severity counting uses a `Record<Finding['severity'], number>` initialised to 0, like `severityCounts` (`to-review.ts:68-72`). Do not import that file's private helper.
  - Model-produced titles are untrusted text. Collapse whitespace and cap the length so a title cannot inject line breaks or flood the banner. No HTML escaping (React escapes the `<p>`).
- **Known gotchas:** Findings vanish because the grounding gate did its job; the helpers count only what they are given. [reviewer-core/INSIGHTS.md#2026-09-17](../../reviewer-core/INSIGHTS.md#2026-09-17--findings-vanish-between-the-model-response-and-the-stored-review). Purity: no `fetch`/`process.env` [#2026-09-26](../../reviewer-core/INSIGHTS.md#2026-09-26--fetch-in-srcllmopenrouterts-is-the-one-allowed-io-an-import-only-purity-check-misses-it).
- **Done when:** `cd reviewer-core && npm run typecheck && npm test`. `summary.test.ts` asserts:
  - (a) the mapping for each case: CRITICAL, WARNING only, SUGGESTION only, empty, and empty + `partial` → `comment`;
  - (b) the exact string for 0 findings, for mixed severities without a CRITICAL, and for 5 CRITICALs (shows 3, then `+2 more`);
  - (c) a title containing `\n` and 200 characters comes out on one line, capped at 80 + `…`;
  - (d) the singular forms.

### S2 — Wire the verdict and summary into `reviewPullRequest`
- **Files:**
  - `reviewer-core/src/review/run.ts` (modify)
  - `reviewer-core/test/run.test.ts` (modify)
  - `reviewer-core/test/run-reliability.test.ts` (modify)
- **Change:** In the return block (`run.ts:450-461`):
  - `verdict: verdictFromFindings(finalFindings, { partial: skipped.length > 0 })` in both modes.
  - `summary`:
    - `mode === 'map-reduce'`: `summarizeFindings(finalFindings, { files: reviewedFiles, chunks: chunks.length - skipped.length })`, where `reviewedFiles` is the number of distinct paths in the chunks that produced a partial (equal to `chunks.length - skipped.length` today, since one chunk = one file).
    - Single-pass: `merged.summary` (D3-A).
    - When `skipped.length > 0`, keep the `Partial review: …: <paths>.` prefix byte-for-byte and append ` ` + the computed line in place of `merged.summary`.
  - Update the `ReviewOutcome.review` doc comment (`run.ts:170`) to say that verdict, score and the map-reduce summary are derived from the final findings.
  - Import `verdictFromFindings` beside `scoreFromFindings` (`run.ts:16`).
  - The `Reduced to … verdict=` event (`run.ts:420-423`) is renamed to `model verdict=` (assumption: a log-text change only, so the trace does not imply that verdict is final).
- **Layer / why here:** Core. `run.ts` is the only place that has the final findings and the skip count. `reduceReviews` runs before grounding (`:410` vs `:427`), so it stays as it is (D2-A).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:**
  - No new `ReviewInput` field and no new export from `src/index.ts`.
  - `merged.verdict` and `merged.summary` must no longer be able to reach the map-reduce `review`.
  - `raw` (`run.ts:469`) keeps every chunk's output untouched (D4-A).
  - Tests go through `reviewPullRequest` from `../src/index.js`, as the existing ones do.
- **Known gotchas:** A truncated chunk is skipped after one re-roll (plan 08 A1). The partial prefix and the D6 verdict both key off `skipped.length` [#2026-10-01](../../reviewer-core/INSIGHTS.md#2026-10-01--a-deepseek-v4-flash-output-cap-runaway-is-a-re-roll-not-the-prompt-reasoning-off-fixes-it-by-finding-nothing). The 2026-09-17 grounding entry also applies (as in S1).
- **Done when:** `cd reviewer-core && npm run typecheck && npm test`, with these tests:
  - `run.test.ts`:
    - (a) The existing single-pass test (`:46`) also asserts `verdict === 'request_changes'` (the CRITICAL at line 11 survives) and `summary === 'secret key committed'`.
    - (b) A new single-pass test: the model returns `verdict: 'request_changes'` with only the line-999 finding. Assert `verdict === 'approve'`.
    - (c) A new map-reduce test (`strategy: 'map-reduce'`, multi-file diff as in `:333`, each chunk's model summary `'MODEL TEXT'`). Assert the summary has no `'MODEL TEXT'`, starts with `Reviewed `, and does not contain the dropped finding's title.
  - `run-reliability.test.ts`: K1 (`:147-158`) keeps the `startsWith('Partial review: 1 of 3')` assertion, and adds `summary` contains `Reviewed 2 files in 2 chunks: no findings.` and `verdict === 'comment'` (the model said `approve`; D6-A).
  - Server regression, unchanged files: `cd server && pnpm exec vitest run test/reviews.it.test.ts test/intent-review.it.test.ts` stays green (`reviews.it.test.ts:194` expects `request_changes`, which is still right: one grounded CRITICAL).

### S3 — Update the pipeline and prompt-convention docs
- **Files:**
  - `reviewer-core/docs/pipeline.md` (modify)
  - `docs/agent-prompts/README.md` (modify)
- **Change:**
  - `pipeline.md`:
    - Rewrite the reduce paragraph (`:149-155`): `reduceReviews` still joins summaries and takes the worst verdict, but `reviewPullRequest` overrides both.
    - Extend the partial-review paragraph (`:144-147`) with the computed line after the prefix.
    - Add a `### Verdict and summary` subsection after *Score*: the mapping, D6, the map-reduce summary format, and single-pass keeping the model summary.
    - Fix the return-shape sentence (`:183-184`).
    - Change the mermaid `REDUCE` node (`:373`) so it no longer says the result's verdict is the worst verdict, and add the post-grounding verdict/summary step to the diagram.
    - Re-point EVERY `src/review/run.ts:N` and `src/review/reduce.ts:N` citation to the post-S2 line numbers. Many are already stale, e.g. `:144` cites `372-374` for code at `405-408`, and `:159` cites `208` for `groundFindings`.
  - `docs/agent-prompts/README.md`:
    - Replace the "`verdict` is currently passed through from the model" bullet (`:149-151`) and the `verdict` table row (around `:158`) with "recomputed from grounded findings (`verdictFromFindings`)".
    - Keep section 2 (`:127-131`): the prompts still ask for a verdict, because the `Review` schema requires one.
- **Layer / why here:** Docs only. The code wins, so these follow S2.
- **Skills to apply:** `mermaid-diagram`
- **Practices:**
  - The mermaid block must still parse: node ids unchanged, `<br/>` labels in the existing style.
  - Every citation is `path:line` that you opened after S2.
- **Known gotchas:** A Done-when `grep` for a phrase fails when Markdown wraps it across lines (root `INSIGHTS.md` 2026-09-28), so the checks below use short tokens.
- **Done when:**
  - `rg -n 'passed through|space-joined' reviewer-core/docs/pipeline.md docs/agent-prompts/README.md` → no match.
  - `rg -n 'verdictFromFindings' reviewer-core/docs/pipeline.md docs/agent-prompts/README.md` → ≥1 match each.
  - For every `rg -o 'src/review/(run|reduce)\.ts:[0-9]+' reviewer-core/docs/pipeline.md` hit, `sed -n` on that line shows the symbol the sentence names.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `reviewer-core/test/summary.test.ts` (create) | unit | verdict mapping incl. D6, summary format, title sanitising, singular forms | S1 |
| `reviewer-core/test/run.test.ts` | unit | single-pass keeps the model summary and gets the computed verdict; a grounded-out CRITICAL no longer yields `request_changes`; the map-reduce summary has no model text or dropped titles | S2 |
| `reviewer-core/test/run-reliability.test.ts` | unit | partial prefix kept, computed line appended, partial + 0 findings → `comment` | S2 |
| `server/test/reviews.it.test.ts`, `server/test/intent-review.it.test.ts` | integration | regression, no edit: persisted verdict for a grounded CRITICAL is still `request_changes` | S2 |

The audit of tests that assert a model-given verdict (D5-B):
- Only `server/test/reviews.it.test.ts:194` asserts on an engine-produced verdict, and it still holds.
- `mcp-server/test/tools-run.test.ts:28` reads a fake API (`mcp-server/test/fakes.ts:110`).
- `e2e/specs/04-pr-findings.flow.json:16` reads seeded rows (`server/src/db/seed.ts:148`).
- `reviewer-core/test/to-review.test.ts` tests the event, not `verdict`.

None of those three needs a change.

## Migrations & contracts
None. `Review`/`Verdict` are unchanged, and the client and server code are untouched.

## Out of scope
- Do not change `reduceReviews`, `VERDICT_RANK`, `toReviewPayload`, `countBlockers`, or `src/index.ts` exports.
- Do not change the reviewer prompts (`server/src/db/seed-prompts.ts`, `docs/agent-prompts/*-reviewer.md`); they keep asking for a verdict.
- Do not edit the stale comment `server/src/modules/reviews/run-executor.ts:58` ("take the worst verdict / mean score"); it is listed under Risks.
- No client i18n of the summary, and no change to `VerdictBanner`.
- Do not derive the verdict from the agent's `ci_fail_on`.

<!-- implementer-brief:end -->

## Context applied
- `reviewer-core/insights/gotchas.md` → "Missing findings mean the grounding gate did its job". This is why the summary and verdict are computed after grounding and the scope filter (S1, S2).
- `reviewer-core/insights/gotchas.md` → "only I/O … `fetch` in openrouter". The S1 purity practice.
- `reviewer-core/insights/gotchas.md` → "truncated chunk … re-roll once, then skip". The partial prefix and D6 (S2).
- Root `INSIGHTS.md` → "a Done-when `grep` for a phrase fails when Markdown wraps" (S3 checks).
- Root `INSIGHTS.md` → "a skill listed on a step where it has nothing to do". This is why `zod` is not on any step.
- `docs/ideas/05-truncated-chunk-runaways.md:87`: the open question that becomes D6.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | — | planning only; wrap-up is the main session's |
| `onion-architecture` | preload | S1, S2 | |
| `typescript-expert` | on demand (S1) | S1, S2 | |
| `security` | on demand (S1) | S1 | |
| `mermaid-diagram` | on demand (S3) | S3 | |
| `zod` | not loaded | — | no schema is defined or parsed in these steps |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| reviewer-core | `src/review/reduce.ts` | core | changed (+`verdictFromFindings`) |
| reviewer-core | `src/review/summary.ts` | core | new |
| reviewer-core | `src/review/run.ts` | core | changed |
| reviewer-core | `test/summary.test.ts`, `test/run.test.ts`, `test/run-reliability.test.ts` | tests | new / changed |
| docs | `reviewer-core/docs/pipeline.md`, `docs/agent-prompts/README.md` | docs | changed |

## Design notes
- **Verdict mapping.** It mirrors two existing rules:
  - the prompt contract every built-in reviewer is given (`seed-prompts.ts:96-104`: request_changes ⇔ ≥1 CRITICAL; comment ⇔ only WARNING/SUGGESTION; approve ⇔ empty);
  - `toReviewPayload`'s event under the default `failOn: 'critical'` (`to-review.ts:154-160`).

  So the banner, the CI event and the prompt convention now agree. It is deliberately independent of the agent's `ci_fail_on`: the engine does not receive that field (`ReviewInput`), and blockers stay a separate UI signal (`run-executor.ts:376`).
- **Why the summary differs per mode (D3-A).** One model call gives one coherent text, while N calls do not. Single-pass can still describe a finding grounding dropped; that is accepted.
- **Pass-1 options**, now resolved. D1:
  - A: counts + top-N CRITICAL titles;
  - B: counts only;
  - C: top-N of any severity.

  D2: helper in `run.ts` vs. inside `reduceReviews` (the latter is pre-grounding). D3: keep the model summary / compute it everywhere / prefix the counts. D4: no model text / the most-critical chunk's text / trace only. D5: verdict untouched / derived.

## Risks & open questions
- D6 is open; the plan is written for the recommendation.
- Visible behaviour change (D5-B). Single-pass reviews whose model verdict disagreed with the grounded findings will now show a different banner, e.g. a model `request_changes` whose only CRITICAL was dropped now shows `approve`. Older stored reviews are not rewritten.
- `ci_fail_on: 'warning'` agents can show a `comment` verdict next to a non-zero blockers badge. This disagreement already exists today and is out of scope.
- The summary is English and is not localized (the same as the `Partial review` prefix).
- Doc/code disagreements found:
  - Many `run.ts` line citations in `reviewer-core/docs/pipeline.md` are stale (fixed in S3).
  - `docs/agent-prompts/README.md:149` cites `run.ts:208` for the verdict pass-through.
  - `server/src/modules/reviews/run-executor.ts:58` still says "take the worst verdict / mean score" (out of scope here; a candidate trivial fix).
- No external research needed.

## Handed off
- architecture-reviewer: `src/review/summary.ts` as a new core file vs. folding it into `reduce.ts`; the `partial` option on `verdictFromFindings`.
- security review: model-controlled finding titles now flow into `review.summary` (sanitised in S1, rendered escaped by React). No trust boundary is otherwise touched.

## Insights to record
- `reviewer-core/INSIGHTS.md` · Codebase Patterns — the verdict is now derived from the final findings (`verdictFromFindings`), and a model `verdict` is ignored like its `score` (`run.ts` after S2). Record only if the implementer confirms that no other reader relied on the model verdict.

## Red-flags check
- [x] Every AC maps to at least one step or test (AC1/2 → S2, K1, map-reduce test; AC3/4 → S1, S2; AC5 → S2 practices; AC6 → S3)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; product choices are in *Decisions needed* (D6)
- [x] Groups end type-checking; parallel groups share no file (one group)
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1: n/a (pass 2)
- [x] Every step's *Skills to apply* is complete

## Handoffs → verification (from G1)
From the G1 implementer run (2026-10-01): S1–S3 done.
- Trivial deviations:
  - a local copy of `TWO_FILE_DIFF` in the new `run.test.ts` describe;
  - `pipeline.md:55` reworded from "passed through" to "goes through" for the Done-when grep;
  - extra citations re-pointed, e.g. `llm-call.ts:131`.
- For review:
  - `summary.ts` and `verdictFromFindings` are pure, with only `@devdigest/shared` type imports; `index.ts` is unchanged.
  - Model-written titles reach `review.summary` with whitespace collapsed and a cap of 80 characters; React escapes them.
  - D5-B: a single-pass `request_changes` whose findings were all grounded out becomes `approve`.
- Out of plan: `docs/agent-prompts/README.md:127-131` still says "The model owns `verdict`".
- Checks:
  - reviewer-core typecheck ✅, test 12 files / 184 ✅ (172 → 184; counted with `it(` against HEAD: `run.test` +2, `summary.test` +10);
  - server typecheck ✅, unit 467 ✅;
  - `reviews.it` + `intent-review.it` 10 ✅;
  - doc greps ✅.
- Not verified: the mermaid diagram was not rendered (no render tool).

### Skills (G1)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload, full | S1, S2 | |
| `typescript-expert` | 431/431 | S1, S2 | |
| `security` | 268/268 | S1 | |
| `mermaid-diagram` | 280/280 | S3 | not rendered |
| `engineering-insights` | preload, full | Step 0 | no wrap-up |

## Verification log
- 2026-10-01, plan-verifier full pass: **complete — needs sign-off** (53/54).
  - R3 is met: from index to worktree, only the handoff section below the marker was added.
  - R4 is not-verifiable: no test-writer run.
  - All 33 `run.ts` / `reduce.ts` citations in `pipeline.md` were checked line by line.
- architecture-reviewer: **PASS**, no findings. reviewer-core stays pure, verdict/summary/score come after grounding, and `index.ts` is unchanged.
- security-reviewer: **PASS**, no findings. Titles render as JSX text; a partial run never approves; the model's verdict no longer reaches the result. Pre-existing, out of scope: `to-review.ts:156-158` sends GitHub `APPROVE` for 0 findings without checking `partial`, so the banner can say `comment` while GitHub gets `APPROVE`.
- Open (doc, outside S3's instruction to keep section 2): `docs/agent-prompts/README.md:127` still says "The model owns `verdict`".
- main-session fix: doc — `docs/agent-prompts/README.md` section 2 now says the engine derives the stored `verdict` from the grounded findings, and the model is told the same mapping. This is a small plan change approved by the user ("речення виправ").
- **Finding recorded, not scheduled** (user: "to-review додай у знахідки, окремо не роби"). `reviewer-core/src/output/to-review.ts:156-158`: `toReviewPayload` derives the GitHub event from `findings.length` only, with no `partial` input. A partial map-reduce run with 0 surviving findings shows `comment` in the banner but would be posted to GitHub as `APPROVE`. The doc comment in `reduce.ts` claims the verdict "mirrors the `toReviewPayload` event", which is false for that case. Posting is a human action, so this is defense in depth, not an exploit.
- test-writer (2026-10-02): **R4 is now verifiable.**
  - New tests: +12 (`summary.test.ts` +8, `run.test.ts` +4); reviewer-core 184 → 196 ✅.
  - Break checks, each reverted and checked by shasum:
    - partial → `approve`;
    - `>` → `>=` on `+k more`;
    - verdict taken from `merged.verdict`;
    - map-reduce summary off;
    - prefix renamed.
    Every one turned the named tests red; each was 3/3 stable.
  - `git diff HEAD -- reviewer-core/src` is empty. No production defects.
  - Not covered by a break check: the title-cleaning tests; `cleanTitle` was not mutated.
