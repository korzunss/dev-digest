# Development Plan: Mentor review follow-ups (MCP `get_findings` PR picture, blast decl-file filter in one place)
Status: in-progress
Save as: docs/plans/19-mentor-review-followups.md
Spec: none

## Goal & acceptance criteria
Two follow-ups to plan 18 from mentor feedback: (a) MCP `get_findings` returns the whole PR review picture in one call — every agent's latest review with nested findings plus a top-level `total_findings`; (b) the "declaring file is never its own caller" rule lives only in the `repoIntel.getBlastRadius` facade (both paths), and `toBlastRadius` becomes pure grouping.
- AC1: `get_findings` without `agent`/`run_id` returns `{ repo, pr, total_findings, reviews }`, `reviews` = latest review of every agent, sorted by agent name; `repo`/`pr` echo the caller's input.
- AC2: `total_findings` = sum of each review's `total` (after dismissed + `min_severity` filtering, before the 20-per-review cap).
- AC3: `agent` and `run_id` narrow `reviews` and return the same shape; the `{status:'running', run_id}` and error paths are unchanged; `run_agent_on_pr` is unchanged.
- AC4: the `get_findings` description is the D4 text verbatim; the footprint test (`test/server.test.ts`) stays green.
- AC5: the fallback (ripgrep) blast path drops a reference whose file declares **any** changed symbol of the same name — same rule as the index path (`declFilesByName`).
- AC6: `toBlastRadius` drops no caller; it only groups, attributes facts, ranks, sorts and summarises.

## Decisions needed
None open — see *Decisions recorded*.

## Decisions recorded
User, 2026-10-03: "погоджуюсь з твоїми пропозиціями" (on the main session's proposal for the mentor's two remarks after plan 18).
- **D1:** `get_findings` returns `{ repo, pr, total_findings, reviews: ConciseReview[] }` via a new pure `prFindings()`; reviews sorted by agent name; `agent`/`run_id` stay narrowing filters with the same shape; `run_agent_on_pr` unchanged.
- **D2:** `total_findings` = sum of per-review `total` (after dismissed + `min_severity`, before the 20 cap).
- **D3:** no `by_severity` counts.
- **D4:** new tool description: "Get the whole review picture of a pull request in one call: the latest review of every agent with its findings, plus total_findings. Read-only. Pass agent or run_id only to narrow it."
- **D5:** the fallback blast path excludes every declaring file of the name, like the index path; `toBlastRadius` becomes pure grouping.
- **D6:** `repo`/`pr` echo caller input, not model text; the `cut()` rule still covers model strings.
- Planner assumptions pending approval: review order `localeCompare` asc, no-agent last, ties by `run_id` (S1); `get_findings` tool tests live in `mcp-server/test/tools-run.test.ts`.
- **Approval (user, 2026-10-03):** "затверджую". Approved as written, including the planner assumptions above.

## Prerequisites
None.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S3 | mcp-server (core → tool → docs) | — (may run in parallel with G2: different package, no shared file) | new export `prFindings`, `PrFindings` from `src/core/findings.ts` |
| G2 | S4–S5 | server (repo-intel facade → blast helper) | — (parallel with G1) | none — `toBlastRadius` signature unchanged |

## Steps

### S1 — Add the pure `prFindings()` aggregate to mcp-server core
- **Files:** `mcp-server/src/core/findings.ts` (modify) · `mcp-server/test/findings.test.ts` (modify)
- **Change:** export
  `interface PrFindings { repo: string; pr: number; total_findings: number; reviews: ConciseReview[] }` and
  `function prFindings(input: { repo: string; pr: number }, reviews: ReviewRecord[], opts: { minSeverity?: Severity } = {}): PrFindings`.
  It maps every given review through the existing `conciseReview(rv, opts)`, sorts the result by `agent` ascending with `localeCompare`, `agent === null` last, ties by `run_id` ascending (`null` last) (assumption — D1 fixes "by agent name" only), sets `total_findings = sum(review.total)` (D2), and copies `input.repo` / `input.pr` unchanged (D6). It does **not** call `latestReviews` — selection stays with the caller. `latestReviews`, `conciseReview`, `ConciseReview`, `FINDINGS_CAP` stay as they are. Update the `latestReviews` docstring only if needed; add a one-line docstring on `prFindings` ("whole PR picture: concise reviews sorted by agent, `total_findings` = sum of per-review `total`, before the cap").
- **Layer / why here:** `core/` is the pure layer (`mcp-server/AGENTS.md` → Layering); the aggregate is a pure transform over `ReviewRecord[]`.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:** `core/findings.ts` imports only `import type` from `@devdigest/shared` and `./text.js` — no `tools/`, `http/`, SDK, `fetch`, `process.env`; `PrFindings` is a named exported interface, no `any`; no new model-written field is added without `cut()` (the new fields are caller input + a number — D6); sort on a copy, never mutate the input array.
- **Known gotchas:** cap every model-written string → [mcp-server INSIGHTS 2026-09-29](../../mcp-server/INSIGHTS.md#2026-09-29--cap-every-model-written-string-before-it-reaches-the-agent-not-just-rationale) (unchanged: strings still pass through `conciseReview`/`toConcise`).
- **Done when:** `cd mcp-server && pnpm typecheck` · `pnpm test -- findings` — new `describe('prFindings')` asserts: (1) three reviews with agent names `Security`, `Bugs`, `null` come back ordered `Bugs`, `Security`, `null`; (2) with 25 WARNING findings in one review and 2 in another, `total_findings === 27` while the first review has `returned === FINDINGS_CAP`; (3) a dismissed finding and, with `minSeverity: 'CRITICAL'`, a WARNING finding are not counted in `total_findings`; (4) `repo`/`pr` equal the input; (5) empty input → `{ total_findings: 0, reviews: [] }`.

### S2 — Return the PR picture from the `get_findings` tool
- **Files:** `mcp-server/src/tools/get-findings.ts` (modify) · `mcp-server/test/tools-run.test.ts` (modify)
- **Change:** in the success branch (`get-findings.ts:45-51`) replace `ok({ reviews: … })` with `ok(prFindings({ repo, pr }, reviews, min_severity !== undefined ? { minSeverity: min_severity } : {}))`; import `prFindings` instead of `conciseReview` (keep `latestReviews`, `SEVERITIES`). Keep the `reviews.length > 0` guard, the `run_id` status branch and every `fail(...)` exactly as they are. Replace the `description` with the D4 text verbatim:
  `Get the whole review picture of a pull request in one call: the latest review of every agent with its findings, plus total_findings. Read-only. Pass agent or run_id only to narrow it.` (183 chars). Input schema unchanged.
- **Layer / why here:** tool = transport adapter; it resolves, selects (`latestReviews`) and serialises, no aggregation logic (that is S1's core function).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** `tools/` never imports `http/` or `fetch`; `zod` stays imported from `zod/v3`; the tool stays GET-only (no new `api` call); `repo`/`pr` passed to `prFindings` are the validated tool arguments, not values read from the API.
- **Known gotchas:** `zod/v3` import → [mcp-server INSIGHTS 2026-09-29](../../mcp-server/INSIGHTS.md#2026-09-29--plain-import--z--from-zod-fails-typecheck-against-the-mcp-sdk-use-zodv3) (do not "tidy" the import).
- **Done when:** `cd mcp-server && pnpm typecheck` · `pnpm test` all green, including `test/server.test.ts` (description ≤200 chars, footprint ≤6,000) · in `tools-run.test.ts` `describe('get_findings')`: the first test is extended to assert the body has `repo: 'acme/web'`, `pr: 7`, `total_findings` equal to the sum of `reviews[].total`, and that two agents (`makeReview({ agent_id: 'a2', agent_name: 'Bugs', id: 'r2' })` + default `Security`) come back as `['Bugs', 'Security']`; a new test asserts `agent: 'Security'` narrows to one review in the same shape (top-level `total_findings` present); the existing running/unknown-run test stays unchanged and green.

### S3 — Document the new `get_findings` output
- **Files:** `mcp-server/README.md` (modify) · `mcp-server/AGENTS.md` (modify)
- **Change:** README Tools table row `get_findings` (line 23), *Returns* → `{repo, pr, total_findings, reviews[]}` — latest review per agent (sorted by name), each `{verdict, findings[]}` ≤20 by severity + `total`; `agent`/`run_id` narrow it`. `AGENTS.md` Map line `src/core/findings.ts   latestReviews · conciseReview (sort, cap 20, truncate)` → add `· prFindings (PR picture, total_findings)`.
- **Layer / why here:** package docs; `AGENTS.md` is the symlink target of `mcp-server/CLAUDE.md`, so edit `AGENTS.md`, never `CLAUDE.md`.
- **Skills to apply:** none
- **Practices:** edit only the one row / one map line; do not touch `docs/plans/06-mcp-server.md` (historical record).
- **Known gotchas:** Markdown wrap breaks a phrase grep → root `INSIGHTS.md` "2026-09-28 — a Done-when `grep` for a phrase fails when Markdown wraps that phrase across two lines" — keep `total_findings` and `prFindings` on one line each.
- **Done when:** `grep -n 'total_findings' mcp-server/README.md` hits the `get_findings` row · `grep -n 'prFindings' mcp-server/AGENTS.md` hits the Map line.

### S4 — Align the fallback blast path to the index path's declaring-files rule
- **Files:** `server/src/modules/repo-intel/service.ts` (modify) · `server/test/repo-intel-blast.test.ts` (modify)
- **Change:** in `fallbackBlast` (`service.ts:236`), after `changedSymbols` is built (`:265-273`), build `const declFilesByName = new Map<string, Set<string>>()` from `changedSymbols` (name → set of `file`), the same shape as `tryPersistentBlast` (`:359-375`). Replace `if (r.fromPath === sym.file) continue; // skip the decl's own file` (`:290`) with `if (declFilesByName.get(sym.name)?.has(r.fromPath)) continue; // any declaring file of this name is not a caller` — keep it before the `isBlastTestPath` check and the per-symbol cap. Nothing else in the fallback changes.
- **Layer / why here:** the facade owns caller selection on both paths (`blast/service.ts:26-29` docstring: "The facade owns traversal and limits"); repo-intel is the recorded indexer exception in `onion-architecture`.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** no new import from `modules/blast` into `repo-intel` (inward edges only); no shared helper extracted across the two paths (two lines, keep local); `BlastResult` shape unchanged.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `pnpm exec vitest run repo-intel-blast` — new test in `describe('… test files and call sites (D11/D12)')`, modelled on "fallback path drops test paths…" (`:241`): `config.repoIntelEnabled: false`, `codeIndex.symbols` → `[sym('src/a.ts','foo'), sym('src/b.ts','foo')]`, `references` → `[{fromPath:'src/b.ts', line:5}, {fromPath:'src/a.ts', line:9}, {fromPath:'src/c.ts', line:10}]`, `getBlastRadius('r', ['src/a.ts','src/b.ts'])` → `callers.map(c => c.file)` equals `['src/c.ts']` (this test fails on the old `=== sym.file` rule); the existing fallback test and the index-path test at `:106` stay green.

### S5 — Make `toBlastRadius` pure grouping
- **Files:** `server/src/modules/blast/helpers.ts` (modify) · `server/test/blast-helpers.test.ts` (modify)
- **Change:** in `toBlastRadius` remove the `declFiles` set and `rows.filter(...)` (`helpers.ts:29-32`) and the now-dead `if (callers.length === 0) continue;` (`:33`); use `rows` directly for `callers`, `endpoints_affected`, `crons_affected`. Extend the docstring (`:17`): "Pure grouping of the facade's flat `BlastResult` into the contract; caller selection (declaring files, tests, caps) is the facade's job — nothing is dropped here." Test file: remove the `self` row (`src/a.ts`, `:17`) from the `result()` fixture; replace the test "drops a caller living in the declaring file" (`:47-50`) with "keeps every caller it is given" — pass a fixture whose `alpha` callers include `{ file: 'src/a.ts', … }` and assert the `alpha` group contains both `src/r1.ts` and `src/a.ts` and the summary counts 2 callers for it.
- **Layer / why here:** pure transform in the blast module's helpers; selection moved to S4's facade.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** `helpers.ts` keeps only `import type` from `@devdigest/shared` and `../repo-intel/types.js` (no runtime import of `repo-intel/constants.js` — plan 18 F1); return shape and sort order unchanged.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `pnpm exec vitest run blast repo-intel --exclude '**/*.it.test.ts'` green (summary test still `'2 changed symbols · 3 callers · 1 endpoints · 1 crons'`, "omits symbols without callers" still green) · with Postgres up `pnpm exec vitest run blast.it` green (it asserts the declaring file is absent through the index path) · `grep -n 'declFiles' server/src/modules/blast/helpers.ts` returns nothing.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `mcp-server/test/findings.test.ts` | unit | `prFindings` order, `total_findings` before cap, filters, echo | S1 |
| `mcp-server/test/tools-run.test.ts` | unit | `get_findings` shape, ordering, `agent` narrowing, running path unchanged | S2 |
| `mcp-server/test/server.test.ts` | unit | description/footprint budget (unchanged file, must stay green) | S2 |
| `server/test/repo-intel-blast.test.ts` | unit | fallback excludes every declaring file of a name | S4 |
| `server/test/blast-helpers.test.ts` | unit | helper drops nothing | S5 |
| `server/test/blast.it.test.ts` | integration | end-to-end decl-file exclusion still holds (unchanged file) | S5 |

## Migrations & contracts
None. No `@devdigest/shared` change: `PrFindings` is an mcp-server-local type; `BlastResult`/`BlastRadius` are unchanged.

## Out of scope
- `run_agent_on_pr` output, `by_severity` counts (D3), any `cut()` change, the `get_findings` input schema, `.claude/settings.json` allowlist (tool name and side effects unchanged).
- Any change to `tryPersistentBlast`, `isBlastTestPath`, caps or depth; `blast/service.ts` logic.
- Editing `docs/plans/06-mcp-server.md` or `docs/plans/18-blast-radius.md`.

<!-- implementer-brief:end -->

## Context applied
- `mcp-server/insights/gotchas.md` → "cut() every model-written string" — S1 keeps all model strings inside `conciseReview`; new fields are caller input (D6).
- `mcp-server/insights/gotchas.md` → "`zod/v3` in tools" — S2 practice.
- `mcp-server/AGENTS.md` → footprint budget (descriptions ≤200, total ≤6,000) — S2 Done when; layering → S1 placement.
- `server/insights/gotchas.md` — no item bears on S4/S5.
- root `INSIGHTS.md` → "2026-09-29 — a skill listed on a step where it has nothing to do…" — `zod` is not listed (no step writes a Zod schema); `security` only on S1 (output field review).
- root `INSIGHTS.md` → "2026-09-28 — Done-when grep across wrapped Markdown" — S3.
- `docs/plans/18-blast-radius.md` S-step at :112 ("drop (defensively)…") — the origin of the duplicated filter removed in S5.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| engineering-insights | preload | Method step 1 | — |
| onion-architecture | preload | S1, S2, S4, S5 | — |
| typescript-expert | on demand (S1) | S1, S2, S4, S5 | — |
| security | on demand (S1) | S1 | — |
| zod | on demand (check) | — | no step writes or changes a Zod schema |
| fastify-best-practices | on demand (check) | — | no route/plugin change |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| mcp-server | `src/core/findings.ts` | core (pure) | changed (new export) |
| mcp-server | `src/tools/get-findings.ts` | tool / transport | changed |
| mcp-server | `README.md`, `AGENTS.md` | docs | changed |
| server | `src/modules/repo-intel/service.ts` (`fallbackBlast`) | indexer facade | changed |
| server | `src/modules/blast/helpers.ts` | pure helper | changed |

## Design notes
- **Why fallback first (S4 before S5).** Today the fallback skips only `r.fromPath === sym.file`, and the helper's per-name `declFiles` filter covered the gap. Removing the helper filter first would let `b.ts` appear as a caller of `foo` declared in `a.ts` when both `a.ts` and `b.ts` declare a changed `foo`. Within G2 the order is fixed; the S4 test fails on the old code, the S5 change is then behaviour-neutral for both paths.
- **Why `prFindings` takes already-selected reviews.** `latestReviews` keeps its `agentId`/`runId` selection and stays tested as is; `prFindings` is the shaping step. That keeps D1's "agent/run_id narrow, same shape" a property of the tool, with no new branching in core.
- **Ordering.** The Map-insertion order of `latestReviews` is non-deterministic across API orderings; sorting in `prFindings` (not in `latestReviews`) keeps `latestReviews`' existing test semantics.

## Risks & open questions
- **Footprint budget.** The new description is 183 chars vs ~168 today (+~15). The ≤6,000 total in `test/server.test.ts:31` was not measured while planning; S2's Done when runs it. If it fails, the fix is a wording change to D4 → user decision, not an implementer call.
- **Test-file name in the brief.** The caller cited `mcp-server/test/tools-read.test.ts` for `get_findings`; the `get_findings` tool tests actually live in `mcp-server/test/tools-run.test.ts:58-92` (`tools-read.test.ts` registers only `list_agents`, `get_conventions`, `get_blast_radius`). The plan uses `tools-run.test.ts`.
- **Doc vs code:** `docs/plans/06-mcp-server.md:299` contract (`{reviews:[…]}`) is superseded by this plan; left untouched as a historical record.
- No external research needed.

## Handed off
- architecture-reviewer: S4 — confirm both facade paths now share the same declaring-files rule; S5 — helper has no selection logic left.
- security review: none needed — no trust boundary change; S1 adds only caller-echoed `repo`/`pr` (Zod-validated ≤200 chars / positive int) and a number.

## Insights to record
- None.

## Red-flags check
- [x] Every AC maps to at least one step or test (AC1–AC3 → S1/S2, AC4 → S2, AC5 → S4, AC6 → S5)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create` (no new files)
- [x] Every assumption is marked; product choices are in *Decisions needed* (null-agent/tie ordering marked assumption)
- [x] Groups end type-checking; parallel groups share no file
- [x] No group under 3 files / ~80 lines that could merge with a neighbour (G2 is 4 files, ~50 lines, but cannot merge with G1 — different package)
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1: n/a (single pass)
- [x] Every step's *Skills to apply* is complete (the implementer reads only those)

## Handoffs → G1
Implementer (2026-10-03): S1–S3 done. New exports `prFindings`, `PrFindings` in `mcp-server/src/core/findings.ts`. Deviation (trivial): extra test reviews got distinct `run_id`s. Verified: `pnpm typecheck` ✅, `pnpm test` ✅ (10 files, 64 tests, incl. `server.test.ts` footprint).

| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1, S2 | |
| `engineering-insights` | preload | — | no new insight |
| `typescript-expert` | no | — | not read; no `any`, named exported interface |
| `security` | no | — | not read; `repo`/`pr` echo the validated tool arguments |

## Handoffs → G2
Implementer (2026-10-03): S4–S5 done; the declaring-file rule now lives only in the repo-intel facade (index + fallback). Verified: `pnpm typecheck` ✅, unit suite ✅ (540 passed). Not run: `blast.it` (Postgres down) — main session runs the full `.it` suite.

| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S4, S5 | |
| `typescript-expert` | on demand (partial read) | S4, S5 | |

## Verification log
- 2026-10-03, main session: full server `.it` suite after G1+G2 — `pnpm exec vitest run '.it.test'` → 23 files, 157 tests passed (incl. `blast.it.test.ts`).
- 2026-10-03, plan-verifier full pass: incomplete — 47 met · 2 partial (S5, T5) · 2 missing (SK1, SK2) · 2 not-verifiable (R3: plan file first staged after implementation; R4: no Test Report / break checks).
- main-session fix: S5/T5 — "keeps every caller it is given" now also asserts `summary` contains `4 callers` (`server/test/blast-helpers.test.ts`); `vitest run blast-helpers` ✅.

## Handoffs → G1 (fix mode SK1, SK2)
Implementer (2026-10-03): skills read, code re-checked against them, no change needed. `pnpm typecheck` ✅, `vitest run test/findings.test.ts test/tools-run.test.ts` ✅ (18 tests).

| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `typescript-expert` | on demand (SK1, SK2) | S1, S2 | |
| `security` | on demand (SK1) | S1 | |
| `onion-architecture` | preload | S1, S2 | |
| `engineering-insights` | preload | — | no new insight |
- 2026-10-03, plan-verifier delta (S5, T5, SK1, SK2): **complete — needs sign-off** — 51 met · 0 partial · 0 missing · 2 not-verifiable (R3, R4). Note: S5's "summary counts 2 callers for it" is not literal — the summary is global; the group count is asserted by the files `toEqual`, the global one by `4 callers`.
- 2026-10-03, test-writer (R4): every new/changed test fails under a targeted mutation, 3/3 stable runs, production shasums restored — `findings.ts` (`total`→`returned`, null-last flip, run_id tie-break removed), `tools-run` (`total_findings` key renamed), `repo-intel/service.ts` (fallback back to `r.fromPath === sym.file`), `blast/helpers.ts` (declFiles filter reinstated). Added test: `findings.test.ts` › "breaks agent ties by run_id". R4 → met; R3 awaits user sign-off.
