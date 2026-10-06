# Development Plan: DevDigest review fixes for PR #16 (R1–R4)
Status: done
Execution: multi-agent
Save as: docs/plans/27-devdigest-review-fixes.md
Spec: none (reviewer follow-ups — DevDigest review of PR #16, triaged and user-approved 2026-10-06; behaviour stays within SPEC-08 / SPEC-09)

## Goal & acceptance criteria
Fix the four real findings of the DevDigest review of PR #16; no user-visible behaviour change beyond SPEC-08 / SPEC-09.
- AC1 (R1): on the Project Context page, a Save and a Reset of the search roots can never be in flight at the same time, so a stale response cannot overwrite the roots cache; a page test proves it.
- AC2 (R2): `GET /repos/:id/onboarding` with a stored tour does not run the reading-path / critical-path / endpoint / clone-fact reads; it still returns the same `index`, `clone`, `model`, `stale` and `tour` as today (AC-25, AC-27 tests stay green).
- AC3 (R3): `OnThisPage.test.tsx` restores `Element.prototype.scrollIntoView` after each test.
- AC4 (R4): `sdd.sh` rejects plan/spec path arguments outside their allowed folders (absolute, `..`, leading `-`) and git ref arguments that are not trees, exiting 2 without touching files; `flags.mjs` rejects a bad `--root`/`--plan` and treats non-finite or negative usage numbers as 0; `selftest.sh` covers each case and prints `selftest: ok`.

## Decisions needed
None open — see *Decisions recorded*.

## Decisions recorded
2026-10-06, user (main session):
- Requirements-review defaults accepted (R2 stored-tour-first, R3 restore scrollIntoView, R4 ref validation via `git rev-parse --verify`).
- D1 A (pending guard in onSave/onReset + page test) · D2 A (validate plan/spec targets, refs, `--root`/`--plan`, finite non-negative numbers; handoff source stays free) · D3 multi-agent.
- Commits: the user commits; the implementer runs groups without pausing, and the main session prepares one commit per group at the end.

## Prerequisites
- Docker running for G2's `.it` tests (testcontainers Postgres).
- No new dependencies.

## Step groups
| Group | Steps | Package / layer | Runs after | Suggested commit subject | Handoff to the next group |
|---|---|---|---|---|---|
| G1 | S1–S2 | client (Project Context page, onboarding-tour test) | — | `fix(client): serialize context roots Save/Reset; restore scrollIntoView in OnThisPage test` | none — no exports or signatures change |
| G2 | S3 | server (`modules/onboarding` service + `.it` test) | — | `perf(onboarding): skip skeleton reads when a stored tour exists` | none — `getView` signature unchanged; `collect` gains a private `indexOf` helper |
| G3 | S4–S5 | tooling (`.claude/skills/sdd/scripts`) | — | `fix(sdd): validate path, ref and usage arguments in sdd.sh and flags.mjs` | none |

Groups share no file and touch different packages, so they may run in parallel; each ends green on its own Done-when (one commit per group). G2 has 2 files, below the merge threshold, but there is no same-package neighbour to merge with.

## Steps
### S1 — Guard the roots Save/Reset handlers against overlap (AC1)
- **Files:** `client/src/app/repos/[repoId]/context/page.tsx` (modify), `client/src/app/repos/[repoId]/context/page.test.tsx` (modify)
- **Change:** In `ProjectContextPage`, add `const rootsBusy = React.useRef(false)`. In the `onSave` and `onReset` props passed to `ContextRootsEditor` (`page.tsx:144-151`): return immediately when `rootsBusy.current || setRoots.isPending || resetRoots.isPending`; otherwise set `rootsBusy.current = true`, keep the existing `.reset()` of the other mutation (it clears the other's error for `rootsError`, `page.tsx:64-66`), and call `mutate(vars, { onSettled: () => { rootsBusy.current = false; } })`. The ref is what closes the window: the handler's `isPending` is from the last render and is stale for a second activation in the same tick (see Design notes → R1). Hooks in `client/src/lib/hooks/context.ts` stay unchanged (D1 A). Test in `page.test.tsx` (new `it`, `routeGets(CUSTOM_ROOTS)` so Reset is enabled): `put` returns a promise that stays pending; inside one `act(() => { saveButton.click(); resetButton.click(); })` activate both; assert `put` called once and `del` not called; then resolve `put` and assert the editor shows the saved roots. (assumption) two native clicks inside one `act` reach both handlers before a re-render; if the Reset button is already disabled at the second click, keep the test as a sequential "Reset is disabled and sends no DELETE while Save is pending" and log a *Deviation*.
- **Layer / why here:** page = container component that owns the mutations (`frontend-architecture`: state colocated with its only consumer); the editor stays presentational.
- **Skills to apply:** `react-best-practices`, `frontend-architecture`, `next-best-practices`, `react-testing-library`, `typescript-expert`, `security`
- **Practices:** the guard lives in the event handlers, not in a `useEffect`; the ref is not rendered and not used to derive UI (`disabled` still comes from `isPending`); no new `useState`; the test mocks only the `api` edge already stubbed in the file, asserts what is sent (`put`/`del` calls) and shown, uses `fireEvent`/native `click`, never `userEvent`.
- **Known gotchas:** no `user-event` — [client INSIGHTS 2026-09-18](../../client/INSIGHTS.md#2026-09-18--there-is-no-testing-libraryuser-event-here-use-fireevent); vitest filter with `[repoId]` matches nothing — [client INSIGHTS 2026-10-05](../../client/INSIGHTS.md#2026-10-05--a-vitest-path-filter-containing-repoid-matches-no-files-even-escaped); replace-all PUT editor must not render before load (already satisfied, keep it) — [client INSIGHTS 2026-10-05](../../client/INSIGHTS.md#2026-10-05--a-list-editor-backed-by-a-replace-all-put-rendered-before-its-data-loads-wipes-the-stored-list-on-the-first-click)
- **Done when:** `cd client && pnpm typecheck` passes · `cd client && pnpm exec vitest run context/page` passes, including the new overlap test (one `put`, no `del`).

### S2 — Restore `scrollIntoView` after each OnThisPage test (AC3)
- **Files:** `client/src/app/repos/[repoId]/onboarding-tour/_components/OnThisPage/OnThisPage.test.tsx` (modify)
- **Change:** at module scope capture `const originalScrollIntoView = Element.prototype.scrollIntoView;` (undefined in jsdom). In `afterEach` (`OnThisPage.test.tsx:50-55`), restore it: if the original was undefined, `delete (Element.prototype as Partial<Element>).scrollIntoView`, else assign it back. Keep `scrollIntoView.mockReset()`.
- **Layer / why here:** test hygiene, colocated test file.
- **Skills to apply:** `react-testing-library`, `typescript-expert`
- **Practices:** no global left mutated after the file; no `any` cast (use `Partial<Element>` or an equivalent typed cast); assertions unchanged.
- **Known gotchas:** vitest filter with `[repoId]` — use the bracket-free `OnThisPage` filter — [client INSIGHTS 2026-10-05](../../client/INSIGHTS.md#2026-10-05--a-vitest-path-filter-containing-repoid-matches-no-files-even-escaped)
- **Done when:** `cd client && pnpm typecheck` passes · `cd client && pnpm exec vitest run OnThisPage` passes · `cd client && pnpm test` passes (full client suite, proves no cross-file leak).

### S3 — Compute only the index view in `getView` when a stored tour exists (AC2)
- **Files:** `server/src/modules/onboarding/service.ts` (modify), `server/test/onboarding.it.test.ts` (modify)
- **Change:** In `OnboardingService`: extract from `collect` (`service.ts:339-372`) a private `indexOf(repo): Promise<{ index: IndexView; coverage: Pick<IndexCoverage, 'sourceFilesTotal' | 'edgeCount'> }>` that runs `getIndexState` + `coverageFor` + `coverageView`; `collect` calls it and keeps the rest unchanged. In `getView` (`service.ts:99-162`): move `const stored = await this.storedTour(repoId).catch(() => null)` before the reads; when `stored !== null`, call only `indexOf(repo)` (`.catch` → `{ index: NO_INDEX, coverage: { sourceFilesTotal: null, edgeCount: 0 } }`) and set `tour = stored`; otherwise run `collect` and `buildSkeleton` exactly as today. `stale`, `index`, `clone`, `model`, `last_failure`, `generating`, `stored` are computed as today from the same values. `generate`/`runGeneration` unchanged. Test in `onboarding.it.test.ts` (new `it`, next to the AC-27 tests): insert repo, `seedIndex`, `makeApp(goodStubs())`, `generate`; then `vi.spyOn(app.container.repoIntel, …)` on `getTopFilesByRank`, `getCriticalPaths`, `getFileGraphStats`, `getEndpoints` and on `getIndexState`; `getView`; assert the four skeleton reads were not called, `getIndexState` was, `view.stored === true`, `view.tour` equals the generated tour, `view.stale === false`.
- **Layer / why here:** application layer (service orchestration); the reads stay behind the `container.repoIntel` facade, no new import.
- **Skills to apply:** `onion-architecture`, `fastify-best-practices`, `zod`, `typescript-expert`, `security`
- **Practices:** the service still reaches repo-intel only via `container.repoIntel` and the DB only via `OnboardingRepository`; no route change; every side read keeps its typed fallback (a GET never 500s, `service.ts:103-104`); no new export; the test is hermetic (`isolatedTestConfig()`, `MockSecretsProvider({})`, as `makeApp` already does).
- **Known gotchas:** `.it` tests all skip on "Expected Reaper…" — rerun with `TESTCONTAINERS_RYUK_DISABLED=true` — [server INSIGHTS 2026-10-05](../../server/INSIGHTS.md#2026-10-05--it-tests-all-skip-with-expected-reaper-to-map-exposed-port-8080); hermetic `.it` tests — [server INSIGHTS 2026-09-26](../../server/INSIGHTS.md#2026-09-26--it-tests-read-the-developers-real-secrets-and-make-live-llm-calls)
- **Done when:** `cd server && pnpm typecheck` passes · `cd server && pnpm exec vitest run onboarding.it.test onboarding-view-resilience` passes with no skipped suite, including the new spy test and the existing AC-25 / AC-27 tests · `cd server && pnpm exec vitest run onboarding-architecture` passes.

### S4 — Validate path and ref arguments in `sdd.sh` (AC4)
- **Files:** `.claude/skills/sdd/scripts/sdd.sh` (modify), `.claude/skills/sdd/scripts/selftest.sh` (modify)
- **Change:** Add helpers next to `need_file` (`sdd.sh:55`): `need_plan_path` — accept only `docs/plans/<NN>-<name>.md` with no further `/`, reject empty, absolute (`/…`), any `..`, leading `-`; `need_spec_path` — accept only `specs/<file>.md` or `<pkg>/specs/<file>.md` (one segment `<pkg>`, no further `/`), same rejections; `need_tree` — reject empty or leading `-`, then require `git rev-parse --verify --quiet "$1^{tree}" >/dev/null`. All three `die` (exit 2) before any file is read or written. Apply: `cmd_set_status` (`need_plan_path` for `plan`, `need_spec_path` for `spec`, before `need_file`), `cmd_handoff` (plan arg only — the source `[file|-]` stays free, D2 A), `cmd_log`, `cmd_follow_up`, `cmd_handback_check --log <plan>`, `cmd_brief_diff` (`need_plan_path "$1"`, `need_tree "$2"`), `cmd_delta` (`need_tree` on `$1` and on `$2` when given). In `selftest.sh`, add cases after the existing set-status / handoff / delta / brief-diff blocks: each of `/abs/docs/plans/01-x.md`, `docs/plans/../01-x.md`, `-x`, `docs/plans/sub/01-x.md`, `README.md` for `set-status plan`, `log`, `follow-up`, `handoff`; `specs/../x.md` and `a/b/specs/x.md` for `set-status spec`; `--output=x` and `nosuchref` for `delta` and `brief-diff` — each `eq … "2" "$(rc_of …)"` and the plan/index files unchanged (compare `cat` before/after, as the existing case at `selftest.sh:94-96` does).
- **Layer / why here:** tooling entry point; validation at the boundary where arguments enter.
- **Skills to apply:** `security`
- **Practices:** BSD/macOS-safe shell (no GNU-only flags, no in-place `sed`, `set -euo pipefail` kept); `case` patterns, no `eval`; validate before `need_file`; every rejection exits 2 via `die`; quote every expansion; the handoff source path is not restricted.
- **Known gotchas:** a heredoc script containing `EOF` heredocs ran in the real repo — keep selftest work inside its throwaway repo — root [INSIGHTS 2026-10-05](../../INSIGHTS.md) ("writing a script through a heredoc that itself contains `EOF` heredocs ran its body in the real repo")
- **Done when:** `bash -n .claude/skills/sdd/scripts/sdd.sh` exits 0 · `bash .claude/skills/sdd/scripts/selftest.sh` exits 0, prints `selftest: ok` last, and includes the new rejection cases · `bash .claude/skills/sdd/scripts/sdd.sh plan-lint docs/plans/27-devdigest-review-fixes.md` prints `plan-lint: ok`.

### S5 — Validate `flags.mjs` arguments and usage numbers (AC4)
- **Files:** `.claude/skills/sdd/scripts/flags.mjs` (modify), `.claude/skills/sdd/scripts/selftest.sh` (modify)
- **Change:** After the argument loop (`flags.mjs:9-22`): `--root` must exist and be a directory (`fs.statSync(root).isDirectory()` in a try; else usage error, exit 2); `--plan` must be relative, contain no `..` segment, and match `^docs/plans/\d+-[^/]+\.md$` (else `flags: plan must be docs/plans/NN-*.md`, exit 2). Add `const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };` and use it in `weighted` (`flags.mjs:38-43`) instead of `+r.x || 0`. In `selftest.sh` flags block (`selftest.sh:402-441`): `sdd flags /abs/docs/plans/04-d.md` and `sdd flags docs/plans/../plans/04-d.md` exit 2; a fixture row with `input` `1e999` and one with `-5` (via `fx_row`) leaves the existing F1 output line unchanged and no output line contains `Infinity` or `NaN`.
- **Layer / why here:** tooling script; boundary validation of CLI args and file-sourced numbers.
- **Skills to apply:** `security` (plan change 2026-10-06: `typescript-expert` dropped — `flags.mjs` is plain ESM JavaScript)
- **Practices:** plain Node ESM, no new dependency; exit code 2 for bad args (as today, `flags.mjs:16-22`); numbers sanitised at the one place they are read; `sdd.sh` `cmd_flags` unchanged (it already passes `--root` and `--plan`).
- **Known gotchas:** none
- **Done when:** `node --check .claude/skills/sdd/scripts/flags.mjs` exits 0 · `bash .claude/skills/sdd/scripts/selftest.sh` exits 0 and prints `selftest: ok` last, including the new flags cases.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `client/src/app/repos/[repoId]/context/page.test.tsx` | unit (RTL) | AC1 overlap guard | S1 |
| `client/src/app/repos/[repoId]/onboarding-tour/_components/OnThisPage/OnThisPage.test.tsx` | unit (RTL) | AC3 restore | S2 |
| `server/test/onboarding.it.test.ts` | integration | AC2 stored GET skips skeleton reads; AC-25/AC-27 unchanged | S3 |
| `.claude/skills/sdd/scripts/selftest.sh` | script selftest | AC4 rejections, number sanitising | S4, S5 |

## Migrations & contracts
None.

## Out of scope
- Any change to `client/src/lib/hooks/context.ts` (D1 A) or `ContextRootsEditor`.
- Restricting the `handoff` source file argument (D2 A); validating `state`, `agent`, `usage-scan` or other subcommands' arguments.
- `runGeneration` / `generate` read order; the contract `OnboardingTourView`.
- Everything under *Follow-ups*.
- `sdd` SKILL.md / docs edits.

<!-- implementer-brief:end -->

## Context applied
- `client/insights/gotchas.md` → no `user-event`; `[repoId]` vitest filter; replace-all PUT editor — S1, S2.
- `server/insights/gotchas.md` → Ryuk skip; hermetic `.it` — S3.
- root `INSIGHTS.md` → heredoc-in-real-repo entry — S4.
- `client/src/vendor/ui/primitives/Button.tsx:71` → `loading` disables the button — basis of REC1 / D1.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| engineering-insights | preload | — | planning only (gotchas read) |
| onion-architecture | preload | S3 | |
| react-best-practices | on demand (S1) | S1 | |
| frontend-architecture | on demand (S1) | S1 | |
| react-testing-library | on demand (S1, S2) | S1, S2 | |
| fastify-best-practices | on demand (S3) | S3 | |
| typescript-expert | on demand | S2, S3 | |
| security | on demand | S1, S3, S4, S5 | |
| next-best-practices | per implementer table (client/src) | S1 | no Next-specific change |
| zod | per implementer table (server) | S3 | no schema change |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| client | `app/repos/[repoId]/context/page.tsx` | page (container) | changed |
| client | `onboarding-tour/_components/OnThisPage/OnThisPage.test.tsx` | test | changed |
| server | `modules/onboarding/service.ts` | application | changed |
| tooling | `.claude/skills/sdd/scripts/{sdd.sh,flags.mjs,selftest.sh}` | scripts | changed |

## Design notes
- **R1.** Both buttons already disable while either mutation is pending (`page.tsx:146` → `ContextRootsEditor.tsx:57,60`; vendored `Button` `disabled || loading`, `Button.tsx:71`). The residual window is a second activation before React re-renders; in that window the handler closure's `isPending` is stale too, so the guard needs a ref set synchronously in the handler. D1 B (sequence guard in the hooks) was rejected as unnecessary once overlap is impossible.
- **R2.** With a stored tour, the view needs only `index` (state + coverage — coverage already cached per `clonePath|sha`, `service.ts:323-337`), `clone`, `model` and `stale` (from `index.last_indexed_sha`). Clone facts, `currentHead`, ranked/critical paths, graph stats and endpoints feed only `buildSkeleton`.
- **R4.** NaN was already mapped to 0 (`+r.input || 0`); the gap is `Infinity` and negatives. The handoff source is usually an absolute scratchpad path, hence D2 A.

## Risks & open questions
- S1 test relies on two native clicks inside one `act` reaching both handlers (assumption); fallback recorded in S1.
- S3: `generate()` returns `getView`, so after this change its returned view also takes the stored path — values are identical (stored tour present, same index read); AC-25/AC-27 tests cover it.
- S4: a plan or spec path given with a `./` prefix will now be rejected; all callers in SKILL.md and selftest use `docs/plans/…` / `specs/…` forms (checked `selftest.sh`, `SKILL.md:42-71`).
- Mode check: 3 packages, 5 steps, no migration/contract/trust boundary → multi-agent, consistent with D3.

## Handed off
- architecture-reviewer: S3 `getView` read split (service-only, facade reads).
- security review: S4/S5 argument validation in `sdd.sh` / `flags.mjs` (local tooling, no trust boundary).

## Insights to record
- None.

## Red-flags check
- [x] Every AC maps to at least one step or test (no-spec plans)
- [x] Every spec AC-n has a row in *Spec traceability* with a step or test — n/a (no spec)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; technical choices are in *Decisions needed*, product gaps are GAPn
- [x] Groups end type-checking; parallel groups share no file
- [x] No group under 3 files / ~80 lines that could merge with a neighbour (G2 has no same-package neighbour)
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1: n/a (pass 2)
- [x] Execution mode recommended per the D4 rule
- [x] Every step's *Skills to apply* is complete
- [x] `bash .claude/skills/sdd/scripts/sdd.sh plan-lint <plan>` prints `plan-lint: ok`

## Follow-ups
- Test Quality gaps: empty globs submit in ContextRootsEditor; `truncated=true` in ContextDocList; null tokens rendering; `<img>` without src / empty alt in stripMarkdownImages tests; listing fetch failure on the Project Context page; DocPreview colocated test coverage of all states; formatSync/sumTokens unit tests.
- Performance: sequential read+tokenise in context listing (cold cache), `jobs.payload->>'repoId'` without an index, walkClone fallback after incremental runs, sequential readDocsForRun (already tracked in plans 25/26).
- DevDigest product: map-reduce reviewers lack cross-file context and produce mostly false CRITICALs on large PRs (e.g. "missing migration" when it is in the PR) — give each map call the PR file list/summary, or verify CRITICALs in the reduce step.

## Handoffs → G2

### Handoff → G2 (S3)
- `OnboardingService.getView` reads `storedTour` first; with a stored tour it runs only the new private `indexOf(repo)` (getIndexState + cached coverage + coverageView), else `collect` + `buildSkeleton` as before. `generate`/`runGeneration` untouched.
- New `.it` spy test (AC-27 describe): with a stored tour, getTopFilesByRank/getCriticalPaths/getFileGraphStats/getEndpoints are not called, getIndexState is.
- Deviation (trivial): `indexOf` returns full `IndexCoverage`.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S3 | |
| typescript-expert | on demand | S3 | |
| security | on demand | S3 | no new input |
| fastify-best-practices | on demand | S3 | no route change |
| zod | on demand | S3 | no schema change |

## Handoffs → G1

### Handoff → G1 (S1–S2)
- S1: `context/page.tsx` adds a `rootsBusy` ref + `settleRoots`; `onSave`/`onReset` return early while the ref or either mutation's `isPending` is set, otherwise set the ref, keep the other mutation's `.reset()`, and `mutate(vars, { onSettled: settleRoots })`. New page test: Save + Reset in one `act` → one `put`, no `del` (asserted with `waitFor`); guard removal makes it fail.
- S2: `OnThisPage.test.tsx` restores the original `Element.prototype.scrollIntoView` in `afterEach`.
- Process note: several skills read only partly (react-best-practices 60 lines, react-testing-library 50, typescript-expert/security headers).

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| react-best-practices | partial (60 lines) | S1 | |
| frontend-architecture | on demand | S1 | |
| next-best-practices | not opened beyond the page | S1 | |
| react-testing-library | partial (50 lines) | S1, S2 | |
| typescript-expert | header only | S1, S2 | |
| security | header only | S1 | no trust boundary |

## Handoffs → G3

### Handoff → G3 (S4–S5)
- `sdd.sh`: `need_plan_path` (docs/plans/NN-*.md, no abs/../leading -), `need_spec_path`, `need_tree` (`git rev-parse --verify --quiet "$1^{tree}"` after rejecting a leading `-`), `bad_path`; applied to set-status, handoff (plan arg only; source free), log, follow-up, handback-check --log, brief-diff, delta.
- `flags.mjs`: `--root` must be a directory, `--plan` must match `docs/plans/NN-*.md`; `num()` maps non-finite/negative usage numbers to 0.
- `selftest.sh`: 35 new rejection/sanitising cases; 142 ok, `selftest: ok`.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| security | on demand | S4, S5 | |
| typescript-expert | not loaded | — | flags.mjs is plain ESM |
| onion-architecture | preload | — | tooling, no layers |

## Verification log
- 2026-10-06 agent: plan-p1 adb0a12238380d09d implementation-planner 2026-10-06T08:38:00Z
- 2026-10-06 decisions recorded: defaults, D1 A, D2 A, D3 multi-agent
- 2026-10-06 agent: plan-p2 adb0a12238380d09d implementation-planner 2026-10-06T08:42:10Z
- 2026-10-06 plan approved by user; G1-G3 run in parallel (disjoint packages/files), no pauses; user commits at the end
- 2026-10-06 agent: implement ab036c879690c375e implementer 2026-10-06T08:43:26Z
- 2026-10-06 implement G2: done (S3; typecheck ok; onboarding.it + resilience 45 passed; architecture 30)
- 2026-10-06 agent: implement a84b4f12b46e09919 implementer 2026-10-06T08:43:46Z
- 2026-10-06 implement G1: done (S1-S2; client typecheck ok; context/page 9, OnThisPage 3, client 489)
- 2026-10-06 agent: implement ad8bae7893fecbc7d implementer 2026-10-06T08:44:00Z
- 2026-10-06 implement G3: done (S4-S5; selftest ok 142)
- 2026-10-06 it-suite: server  Test Files  82 passed (82)       Tests  1006 passed (1006) ; client       Tests  489 passed (489)
- 2026-10-06 agent: review a482b384a217c05fe plan-verifier 2026-10-06T08:46:14Z
- 2026-10-06 plan-verifier: 50/54 met; main session closed D11 (plan-lint ok) and R3 (brief-diff vs plan-approved exit 0); SK5 open; user: run test-writer for R4
- 2026-10-06 agent: tests a8ec621bfe48bf5ad test-writer 2026-10-06T08:50:21Z
- 2026-10-06 test-writer: AC1 x2, AC2 x2, AC3, AC4 (handback-check --log, flags.mjs) tests; main-session fix: test-writer's break-check revert left service.ts:128 joined onto one line — restored byte-identical to wave-1; full runs: server 1008, client 493, selftest ok
- 2026-10-06 plan change (user-approved): typescript-expert dropped from S5 (SK5 closed); R4 closed by test-writer; AC4 break check not run (permission classifier refused weakening sdd.sh) — accepted gap
