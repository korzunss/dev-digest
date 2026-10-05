# Plan 26 — cross-model review (2026-10-05)

Two independent read-only reviews of `docs/plans/26-onboarding-generator.md` against SPEC-09, run on models other than the planner's (Opus 5.5):
Sonnet 5.5 (executability, ids Y*) and Fable 5.1 (design, security, coverage, ids X*). Both verdicts: **approve with changes**.

## Must fix before implementation
| Id | Sev | Step | Issue | Fix |
|---|---|---|---|---|
| X1 = Y1 | BLOCKER | S1 | New tour block at `knowledge.ts:28-47` uses `Provider`, declared at `:369` → TDZ at import; G1 cannot commit green. | Place the block after `Provider` (or move `Provider` up); fix the S1 Done-when ranges. |
| Y2 | HIGH | S1 | Done-when "diff of the two `sed -n` ranges" is not a runnable command; copies differ elsewhere. | Concrete `diff <(sed -n '/^\/\/ ---- Onboarding/,/^\/\/ ---- …/p' A) <(…B)` matching the moved block. |
| X2 = Y6 | HIGH | S12/S13 | Client `apiFetch` throws `ApiError` on any non-2xx (`client/src/lib/api.ts:43-57`), so the "409 with view" never reaches `onSuccess`. | Return 200 with the view and let `view.generating` / clone state carry "did not start" (or handle 409 in `onError` by invalidating the GET). Record the choice in S12/S13/TS6/TC2. |
| X3 | HIGH | S11 | OpenRouter ignores `req.timeoutMs` (constructor 90 s; only `req.signal` cancels); OpenAI/Anthropic `withTimeout` does not abort. The `finally` clears the guard while the paid request is still in flight → a second paid call and a late overwrite are possible. | Pass `signal: AbortSignal.timeout(...)` (or a service AbortController) to `completeStructured`; keep `timeoutMs`; map abort/deadline errors to `timeout`; TS6 asserts a `signal` was passed. |
| X4 | HIGH | S10/S21 | Command grounding only drops pm commands naming missing scripts; any other model-emitted command (`curl … \| sh`, `rm -rf`, `docker run evil`) survives and gets a Copy button — injected repo content becomes something the user runs. | Allowlist: keep a command only if every `&&` segment is `cd <known dir>`, `<pm> install\|i\|ci`, `<pm> run <known script>` / `<pm> <known script>`, `cp <found env example> .env`, `docker compose up [-d]` (compose file found); else drop; nothing left → deterministic commands. TS4: injected `curl … \| sh` dropped. Tighten SPEC-09 AC-16 wording accordingly. |
| Y3 | HIGH | T1/TS6 | `MockLLMProvider` cannot throw typed errors or delay → LLM-failure causes and AC-13 untestable as planned. | Test-local throwing/deferred `LLMProvider` stub (or extend `MockLLMOptions` with `throws`/`delayMs` in a named step); spell out how each of `no_key`, `no_model`, `timeout`, `invalid_output`, `provider_error` is induced. |
| Y4 | HIGH | T1/TS6 | No seed recipe for index/clone states. | blast.it-style seed: repo row with `clonePath` → mkdtemp; `file_rank`/`file_edges`/`file_facts`; `repo_index_state` for full / partial (`parseDegraded`/`graphFailed`/`bounded`) / degraded / failed; mismatched `lastIndexedSha` (stale); `jobs` rows (cloning, failed with `//user:token@` and `ghp_…`); a zero-JS/TS repo. Name a seed per AC row (AC-18…27, 36). |
| Y5 | HIGH | T1/S3/S5 | Clone facts/coverage read `git.clonePathFor(ref)`; `MockGitClient` returns a non-existent `/mock/clones/...`. | Add a shared temp-clone git stub in `server/test/helpers/` and a fixture clone (package.json scripts, lockfile, deterministic source-file count for AC-23). |

## Should fix (localized design corrections)
| Id | Sev | Step | Issue → fix |
|---|---|---|---|
| X5 | MED | S11 | Guard `has/add` must be synchronous before the first `await` (reserve slot, then validate; release on early return). |
| X6 | MED | S6 | `sanitizeJobError`: replace `//anything@` userinfo, plus token prefixes `ghp_|gho_|github_pat_|glpat-`, cap 300 chars, first stderr line; TS2 covers GitHub `x-access-token:`, GitLab `oauth2:`, bare token. |
| X7 | MED | S3/S6/S16 | Coverage edge cases: incremental double count (show `min(N,M)`), `bounded>0` with status `full` (derive partial from coverage), `source_files_total === 0` → AC-7 wording, no N-of-M line. |
| X8 | MED | S10 | First-tasks cause must branch on `hasIndex`, not on the cited-path intersection; normalise cited paths before lookup. |
| X9 | MED | S6/S20 | Skeleton sets `built_sha = lastIndexedSha || currentHead || null` so skeleton rows have Open (AC-6/31). |
| X10 | MED | S5 | Clone reads: skip symlinked dirs as well as files (`readdir withFileTypes`), realpath containment, ENOENT/EACCES → empty facts; TS3 covers a symlinked dir. |
| X11 | MED | S11 | Real error mapping: OpenAI/Anthropic schema failure is `ExternalServiceError(/schema validation/)` → `invalid_output`; OpenRouter `LlmDeadlineError`/`LlmConnectionError(timeout)` → `timeout`; `AbortError` → `timeout`; `ConfigError` → `no_key`. Import from `@devdigest/reviewer-core` (allowed by S8) (= Y12). |
| X12 | MED | S11 | Capture `builtSha` with the facts before the LLM call (re-index during a run must still mark the tour stale). |
| Y7 | MED | S3/S6 | Junk filtering contradiction: critical rows also go through the reading-path predicate; filter roots before the slice. |
| Y8 | MED | S6/S11 | Define `hasGraph` deterministically (e.g. edge count from a facade read). |
| Y9 | MED | T2/TC1 | Test AC-1: NAV WORKSPACE order `pulls, onboarding-tour, context` + label; mark `app-shell/helpers.test.ts` as create. |
| Y10 | MED | S15/T2 | List the i18n key tree in S15; T2 asserts English strings via the real `NextIntlClientProvider`. |
| Y11 | MED | S9 | Remove `{{sections}}` from the prompt; TS5 asserts no `{{` left in the rendered system message. |
| Y13 | MED | groups | Per-group commits run `--exclude '**/*.it.test.ts'`; `.it` files follow the existing Docker-skip convention. |

## Optional hardening (LOW)
X13 secondary `orderBy(filePath)` for rank ties · X14 traceability fixes (TC10 `UnavailableNote.test.tsx` for AC-7/37; drop TC8 from AC-16; deferred mock for AC-13) · X15 strip Markdown image syntax from LLM bodies (tracking pixels) · X16 a11y (`nav` landmark, `aria-current`, `aria-label` on icon buttons, `aria-controls`) · X17 use persisted `totalCandidates` when present, cache keyed by clonePath+sha, skip empty sha · X18 cap script command length; `bun.lock` · X19 fact collection inside the result path, `getView` never 500 except 404 · X20 i18n for server reason codes · X21 allow `../repos/constants.js` import instead of duplicating `CLONE_JOB_KIND` · Y14 verify `softBudgetReached` exists or drop `soft_budget` · Y15 `git diff --stat client/src/vendor` expectation · Y16 rename the contracts test title/import.
