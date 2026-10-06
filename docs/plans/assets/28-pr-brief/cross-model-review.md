# Plan 28 — cross-model review (2026-10-06)

Two independent read-only reviews of `docs/plans/28-pr-brief.md` against SPEC-10, run on models other than the planner's (Opus 5.5):
Sonnet 5.5 (executability, ids Y*) and Fable 5.1 (design, security, coverage, ids X*).

## Sonnet 5.5 — executability (verdict: approve with changes; fix Y1, Y2, Y3, Y5 before approval)

Verified correct: line refs `intent/helpers.ts:196-212`, `reviews/helpers.ts:118-124`; both `brief.ts` copies identical, no other copy; no new contract name collides; all container getters named exist; `prBrief` keyed by `pr_id`; every Done-when test file exists; `DeferredLLMProvider`, `ThrowingLLMProvider`, `llmUnderEveryProvider`, `isolatedTestConfig` exist. G1→G2 and G1→G3 build green independently; G4 depends only on G3 and S1.

| Id | Sev | Step | Issue | Fix |
|---|---|---|---|---|
| Y1 | HIGH | S8/T7 | AC-7 case "throwing provider after success → old row kept" has no feasible seed: `ThrowingLLMProvider` fixed, `MockLLMProvider` can't fail, stubs installed once at `buildApp`. | Second `buildApp` over the same pg with throwing stubs, or a flippable stub in `llm-stubs.ts`. |
| Y2 | HIGH | S8/T7 | `MockLLMProvider` falls back to `{}` (`mocks.ts:114-118`) → fails `PrBriefModelOutput`; seeds unspecified (pr_files with patches, review with dismissed finding, old-shape row, head_sha change); fixture ranges must match seeded patches. | T7 seed note: valid `structured`/`structuredBySchema['pr_brief']` fixture passing grounding + direct `db.insert` seeds; `DeferredLLMProvider.release(data)` uses the same fixture. |
| Y3 | MED | S8 | In-process guard on `BriefService` resets if the getter doesn't memoize or the route news it up. | `return (this._brief ??= new BriefService({...}))` like `get intent` (`container.ts:174`); routes use `app.container.brief`. |
| Y4 | MED | S7 | `getBlast(ws, prId, log)` needs a required logger (`blast/service.ts:40-44`). | Say so; type the log param in `BriefServiceDeps`/`generate`. |
| Y5 | MED | S10/S11 | DiffTab/SmartDiffGroup/FileCard mount already carrying the target (tab switch, smartDiff loading, CodeLine after open) — nonce-change-only effects miss it. | Effect runs when the nonce is set or changes, including first render; T8/T9 render with target present and assert open + `scrollIntoView`. |
| Y6 | MED | S11 | Re-render with the same nonce must not re-force open/highlight; `DiffViewer` keys cards by index. | Apply only when nonce differs from last applied (ref); test it. |
| Y7 | MED | S13/S14 | `VerdictBanner` uses `useTranslations("prReview")`; tests provide only `{brief, blast}`; hook mocks need exact module paths. | Test providers include `prReview`; `PrBriefBlock` imports from `@/lib/hooks/brief` and `@/lib/hooks/reviews`, not the barrel. |
| Y8 | LOW | S10 | `…viewer` ellipsis ambiguous (header defines `…` as the PR `_components` dir). | Full paths in S10 Files. |
| Y9 | LOW | S12 | Done-when `jq` checks one key of ~25; `intentCard.title = "PR Brief"` already exists. | `jq` over all *Copy* keys; cross-check `intentCard.title`. |
| Y10 | LOW | S4/S8 | Unit-suite command relies on a header alias. | Literal command in Done-when (optional). |
| Y11 | LOW | S5 | `getPrFiles`/`latestReview` duplicate smart-diff repo; brief filters `dismissedAt IS NULL` deliberately. | No change. |
| Y12 | LOW | S7/S8 | No-key case needs no llm override + empty secrets (`onboarding.it.test.ts:441`); unindexed blast may or may not throw. | T7 asserts `blast_radius` is `missing` or `partial`. |

## Fable 5.1 — design, security, coverage (verdict: approve with changes; X1, X2 before implementation; X7 (+X3/X14) need spec-creator)

Coverage: AC-1..43 each have a step and test; no diff/finding bodies reach the prompt; grounding (`+c,d` → `[c, c+d-1]`, `d=0` → none) correct; untrusted text JSON-delimited server-side and rendered as text nodes; old-shape cache → `null` and SHA capture before the call correct; layering sound apart from X6.

| Id | Sev | Step | Issue | Fix |
|---|---|---|---|---|
| X1 | HIGH | S7 | Guard released while paid call still runs: adapters `withTimeout(..., req.timeoutMs ?? 60_000)` (`openai.ts:15,98-118`, `anthropic.ts:16,101-125`) only stops waiting; signal is 90 s → a 30 s window for a second paid call. | Pass `timeoutMs: BRIEF_LLM_TIMEOUT_MS` explicitly; invariant `signal deadline ≤ timeoutMs`; T6 asserts both. |
| X2 | MED | S7/S8 | No-key `.it` can hit a real key: `LocalSecretsProvider` falls back to `process.env` (`adapters/secrets/local.ts:21`). | Every `buildApp` in `brief.it.test.ts` passes `overrides.secrets: new MockSecretsProvider({})`. |
| X3 | MED | S3 [spec] | Budget unsatisfiable: `changed_symbols`, endpoints, crons, intent never trimmed → permanent `failed`. | Cap blast arrays at collection, record `truncated: blast_radius`; distinct reason/log for `BriefBudgetError`. |
| X4 | MED | S9/S13 | AC-42 stale note lags: query key `["pr-brief", prId]`, nothing refetches after `usePullDetail` refreshes `head_sha`. | Client compares `brief.head_sha !== prHeadSha` (or key by headSha); T10 covers it. |
| X5 | MED | S10/S11 | Target must apply on mount (conditional tab render, smart diff resolves after mount). | Effect deps `[target?.nonce, target?.path]`, match on every run; T8/T9 mount with target set. |
| X6 | MED | S7 | Five new cross-module type edges via `Pick<…Service>`; depcruise counts type imports. | Structural dep interfaces in `brief/types.ts` over shared contract types; only the container knows concrete services. |
| X7 | MED | S13 [spec] | AC-35 not met and spec not amended (`VerdictBanner` uses `prReview`). | spec-creator amends AC-35 + Changelog before approval. |
| X8 | LOW | S7 | Failure path may log `err` with raw model output / tokens. | Log `brief: failed reason=<…> err=<err.name>` only. |
| X9 | LOW | S7 | Transport retries stack (SDK 2 × `withRetry` 3); `attempts` doesn't show them. | Note in Risks. |
| X10 | LOW | S4 | Exact-string path match drops `./a`, `/a`, `a:12`. | Normalise before matching; still require membership. |
| X11 | LOW | S3 | `response_format` schema tokens not counted. | Fixed schema reserve subtracted from the budget; note in Risks. |
| X12 | LOW | S6 | `readLinkedIssues` must keep the forge-unreachable branch and `links.docs`. | Return `{issues, failed, links}`; T5 adds unreachable-forge case. |
| X13 | LOW | S9 | Mutation network error leaves query untouched. | `onError` invalidates `["pr-brief", prId]`. |
| X14 | LOW | S14 [spec] | AC-34 says cards "inside" the brief layout; S14 renders them below. | Wrap columns inside the block's section, or reword AC-34. |
| X15 | LOW | S7/S8 | LAN peer can trigger ~10 paid calls/min across PRs; same stance as intent classify. | Accept; record in Risks. |

## Reconciliation (main session)
- Y5 = X5. Y6 (ref of last applied nonce) and X5 (no previous-nonce ref) conflict; combined: a per-instance ref initialised empty on mount, so the target applies on first render and once per new nonce, never again on a plain re-render.
- Y7 overlaps X7 (labels namespace) on the test side only.

## Decisions (user, 2026-10-06)
All plan fixes applied except Y11 (no change). X3 cap + trim order [spec]; X7 AC-35 amended [spec]; X11 fixed schema reserve [spec]; X14 cards inside the block, AC-34 unchanged.
