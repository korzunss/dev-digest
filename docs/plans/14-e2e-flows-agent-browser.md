# Development Plan: e2e flows green on agent-browser 0.38 (plus seeded convention candidates)
Status: done
Save as: docs/plans/14-e2e-flows-agent-browser.md
Spec: none

## Goal & acceptance criteria
The `e2e web` CI job has never passed: runs #1 (PR #12) and #2/#3 (PR #13) all failed. This plan makes all 11 flows pass with agent-browser ≥ 0.38, and makes them stable. Three changes do that: fix the locators that no longer exist or never matched, add waits in front of the clicks that race the data fetch, and seed the convention candidates that flow 10 has always needed. Branch: `L04`.
- AC1: `./scripts/e2e.sh` prints `11/11 flows passed` on 3 consecutive runs (agent-browser 0.38.1).
- AC2: no `e2e/specs/*.flow.json` uses `click --text`. Every `find … click` that follows a navigation or a data fetch is preceded by a `wait` that proves its target rendered.
- AC3: `cd server && pnpm db:seed` on a fresh DB leaves 1 `done` convention scan and 3 pending candidates for `acme/payments-api`. `GET /repos/:id/conventions` serves them. Re-running `pnpm db:seed` changes nothing.
- AC4: `seed()`, the function the `.it` tests call, still writes no convention rows, so `server/test/conventions.it.test.ts` passes unchanged.
- AC5: `e2e/README.md`, `e2e/docs/flows.md` and `e2e/AGENTS.md` no longer present `click --text` as a valid command, and state that `wait --text` is case-sensitive against the rendered (CSS-transformed) text.
- AC6: `cd server && pnpm typecheck` and `cd server && pnpm test` pass.

## Decisions needed
None open — see *Decisions recorded*.

## Decisions recorded
User, 2026-09-30, fixing it on branch L04: **Q1 → B**. The conventions scan and the pending, grounded candidates for `acme/payments-api` are seeded in `server/src/db/seed.ts`, so flow 10 keeps its full scope (reject → bulk-accept → create skill → Skills Lab). This lifts the original "no client/server change" limit for the seed only. There is still no client change.
Full plan approved by the user on 2026-09-30 ("так, затверджую"). Status draft → approved → in-progress (G1).

## Prerequisites
- Docker running (for `./scripts/e2e.sh` and the `.it` test), and agent-browser 0.38.1 on PATH (`agent-browser --version`).
- `cd e2e && npm ci` if `e2e/node_modules` is missing.
- Debugging tip: `e2e/run.ts` drops agent-browser's stderr. Point `AGENT_BROWSER_BIN` at a wrapper script in the session scratchpad that runs `agent-browser "$@"` and appends stderr to a log. That shows the real error text (`✗ Element not found: …`). Do not commit the wrapper.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S3 | server: `db/` seed + tests | — | `SEED_CONVENTIONS` (3 rules, exact texts in S1) and exported `seedDemoConventions(db, workspaceId)`. The CLI `pnpm db:seed` now writes them. Candidate order on screen: C1 → C2 → C3 (by confidence) |
| G2 | S4–S6 | e2e: flows + docs | G1 (flow 10 needs the seed) | — |

## Steps

### S1 — Demo convention data, with the fingerprint recipe
- **Files:** `server/src/db/seed-conventions.ts` (create)
- **Change:** export an interface `SeedConvention { rule; category: ConventionCategory; evidencePath; evidenceLine; evidenceEndLine; evidenceSnippet; confidence }`. Export `SEED_CONVENTIONS: SeedConvention[]` with exactly these three entries (assumption: the copy is the planner's, grounded in the seeded PR's `pr_files` paths):
  - C1 `structure`, conf `0.92`, `src/config.ts` L3–3, rule `Read every tunable from process.env in src/config.ts instead of hard-coding it at the call site.`, snippet `export const RATE_LIMIT_RPM = Number(process.env.RATE_LIMIT_RPM ?? 60);`
  - C2 `api`, conf `0.85`, `src/middleware/ratelimit.ts` L41–42, rule `Answer a throttled request with 429 and a Retry-After header.`, snippet (2 lines): `reply.header('Retry-After', String(retryAfterSec));` ⏎ `return reply.code(429).send({ error: 'rate_limited' });`
  - C3 `data-access`, conf `0.74`, `src/api/users.ts` L47–47, rule `Load related rows for a list with one IN query, never one query per item.`, snippet `const posts = await db.posts.findMany({ where: { userId: { in: ids } } });`
  
  Also export `seedConventionFingerprint(rule, evidencePath)`. It is a byte-for-byte copy of the recipe in `server/src/modules/conventions/helpers.ts:37-41`: whitespace-collapse + trim + lowercase the rule, NUL separator, sha256, first 16 hex chars. A comment names that source. S3's unit test pins the two together.
- **Layer / why here:** seed data lives beside `seed-skills.ts` (same pattern: a pure data module imported by `seed.ts`). `db/**` is infrastructure and must not import `modules/**` (onion layer map), so the recipe is copied rather than imported.
- **Skills to apply:** `typescript-expert`, `onion-architecture`
- **Practices:** a pure module: no I/O, no DB import, only `node:crypto` and a type-only import of `ConventionCategory` from `@devdigest/shared`. Nothing under `src/modules/**` is imported. No rule text contains the words the flow-10 locators match (`reject`, `accept`, `select`, `create`, `confidence`, `current`, `convention`, case-insensitive). `evidenceEndLine - evidenceLine + 1` equals the snippet's line count. Confidences are distinct, so the card order is fixed.
- **Known gotchas:** none in `server/insights/gotchas.md` bear on this step.
- **Done when:** `cd server && pnpm typecheck`

### S2 — `seedDemoConventions`, called only from the CLI entrypoint
- **Files:** `server/src/db/seed.ts` (modify)
- **Change:** add `export async function seedDemoConventions(db: Db, workspaceId: string): Promise<void>`. It does three things:
  1. Looks up `acme/payments-api` in the workspace; returns if the repo is missing.
  2. Returns if **any** `convention_scans` row exists for that repo. This is the idempotency guard. It also means a dev DB that already holds a real scan, or decisions made on demo rows, is never touched.
  3. Otherwise, inside `db.transaction`, inserts one `conventionScans` row and then all `SEED_CONVENTIONS` rows in one `insert(t.conventions).values([...])`. Scan row: `status: 'done'`, `finishedAt: new Date()`, `provider: 'seed'`, `model: 'seed'` (mirrors the seeded review's `model: 'seed'`), `commitSha: 'a1b2c3d4e5f6'` (assumption: the seeded PR's `headSha`), `samplePaths` = the 3 evidence paths, `candidatesRaw` = `candidatesKept` = 3. Candidate rows: `workspaceId`, `repoId`, `scanId` = the new scan's id, the S1 fields, `status: 'pending'`, `fingerprint: seedConventionFingerprint(rule, evidencePath)`.
  
  In the CLI block (`if (import.meta.url === …)`), call `await seedDemoConventions(handle.db, r.workspaceId)` after `seed()` resolves and before the `✓ seeded` log. Do **not** call it from `seed()`. Update the header comment at `seed.ts:27-28`: conventions are seeded for the CLI only.
- **Layer / why here:** `seed()` is shared with ~19 `.it` suites. `server/test/conventions.it.test.ts:234` and `:404` assert exactly 2 convention rows for `acme/payments-api` after their own extract, so seeding inside `seed()` would break them. The CLI path is what `scripts/e2e.sh` and `e2e-web.yml` run (`pnpm db:seed`).
- **Skills to apply:** `drizzle-orm-patterns`, `typescript-expert`
- **Practices:** queries use `and(eq(…workspaceId), eq(…))`, like the rest of `seed.ts`. The scan and its candidates are written in one `db.transaction` (a scan with no candidates would render "Nothing survived the evidence gate" and block every later re-seed). `.returning()` supplies the scan id. `seed()` is not changed apart from the comment.
- **Known gotchas:** none in `server/insights/gotchas.md` apply (no schema change, no migration). Note also: `conventions` has UNIQUE `(repo_id, fingerprint)` (`schema/knowledge.ts:141`), so the 3 fingerprints must be distinct.
- **Done when:** `cd server && pnpm typecheck`. Then, against the hermetic stack started by `./scripts/e2e.sh` (or any fresh DB), `pnpm db:seed` run twice leaves `select count(*) from conventions` = 3 and `select count(*) from convention_scans` = 1. S3's `.it` test asserts the same.

### S3 — Tests for the seed
- **Files:** `server/test/seed-conventions.test.ts` (create), `server/test/seed-conventions.it.test.ts` (create)
- **Change:**
  - Unit test: for every `SEED_CONVENTIONS` entry, `seedConventionFingerprint(rule, path) === fingerprintFor(rule, path)` (import from `../src/modules/conventions/helpers.js`); `ConventionCategory.safeParse(category).success`; `0 ≤ confidence ≤ 1`; end line minus start line plus 1 equals `evidenceSnippet.split('\n').length`; fingerprints and confidences are unique; `length >= 2`; no rule matches `/reject|accept|select|create|confidence|current|convention/i`.
  - `.it` test (`startPg`, `dockerAvailable`-gated `describe` as in `conventions.it.test.ts:15-16`):
    - (a) after `seed()` alone, `conventions` has 0 rows (guards AC4);
    - (b) after `seedDemoConventions` twice: 1 scan, 3 rows, and the same ids after the second call;
    - (c) `buildApp({ config: isolatedTestConfig(), db })` → `GET /repos/:id/conventions` returns 200, `scan.status === 'done'`, 3 candidates, all `pending`, first one is C1.
- **Layer / why here:** tests sit beside the step they check. The tier is in the filename.
- **Skills to apply:** `typescript-expert`
- **Practices:** the DB-backed test carries `.it`. The unit test imports no DB. Build the config with `isolatedTestConfig()` (`server/test/helpers/config.ts:28`); there is no LLM path here, so no mock provider is needed.
- **Known gotchas:** [hermetic `.it` must not reach a real API key](../../server/INSIGHTS.md#2026-09-26--it-tests-read-the-developers-real-secrets-and-make-live-llm-calls) → use `isolatedTestConfig()`.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/seed-conventions` (both files pass) · `cd server && pnpm exec vitest run test/conventions.it.test.ts` still passes.

### S4 — Fix the flows that race the PR list, and flow 08's case
- **Files:** `e2e/specs/02-repo-pulls-detail.flow.json`, `e2e/specs/04-pr-findings.flow.json`, `e2e/specs/05-pr-diff.flow.json`, `e2e/specs/08-severity-filter.flow.json` (modify)
- **Change:**
  - In 02/04/05, between `wait --url /pulls` and `find text "Add rate limiting to public API endpoints" click`, the steps are: `wait --load networkidle` → `wait --fn "!document.body.innerText.includes('Loading pull requests')"` → `wait --text "Add rate limiting to public API endpoints"`. The loading copy comes from `client/messages/en/prReview.json:111`. Flow 02 already had the `wait --text` and still flaked, so the `--fn` guard is the fix (assumption: validated by AC1).
  - In 04 and 05, add `wait --text "Agent runs"` / `wait --text "Files changed"` before the tab click.
  - In 08, add the same not-loading `--fn` + seeded-title `wait --text` before the CRITICAL-chip click, and change `wait --text "CRITICAL only"` to `wait --text "CRITICAL ONLY"`. Reason: `filterChip` is `textTransform: "uppercase"` (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/styles.ts:64`), and the match is case-sensitive against rendered text.
  - Update any label or description that quotes the old text.
- **Layer / why here:** e2e specs only; the client is correct.
- **Skills to apply:** none (`e2e/**` has no dedicated skill — follow `e2e/AGENTS.md` and `e2e/docs/flows.md`)
- **Practices:** deterministic locators only, no `chat`. Every `find … click` is preceded by a `wait` that proves its target is on screen. JSON stays valid (`jq . <file>`). Labels describe intent, not the command.
- **Known gotchas:** [run the hermetic stack, not `npm test` against a dev DB](../../e2e/INSIGHTS.md#2026-09-17--flows-020405-fail-locally-but-pass-in-ci); never `docker compose down -v`.
- **Done when:** `jq -e . e2e/specs/*.flow.json` exits 0, and flows 02, 04, 05 and 08 pass in a `./scripts/e2e.sh` run.

### S5 — Replace `click --text` in flows 09 and 10
- **Files:** `e2e/specs/09-skills.flow.json`, `e2e/specs/10-conventions.flow.json` (modify)
- **Change:** in 0.38 the grammar is `click <css|xpath|@ref>` and `find <locator> <value> [action] [--name n] [--exact]` (`agent-browser find --help`). Each old step changes as follows; keep each label's intent:
  - 09 `secret-leakage-gate` → `find text "secret-leakage-gate" click` (SkillCard is a clickable `div`, `SkillCard.tsx:34`; the step already follows a `wait --text` for it).
  - 09 tabs `Context`, `Preview`, `Versions`, `Stats`, `Evals` → `find role button click --name "<Tab>" --exact` (vendored `Tabs` renders `<button>`s, `client/src/vendor/ui/kit/Tabs.tsx:25`).
  - 09 `Test Quality Reviewer` → add `wait --text "Test Quality Reviewer"`, then `find text "Test Quality Reviewer" click` (AgentCard `div`, `AgentCard.tsx:32`).
  - 09 `Skills` → `find role button click --name "Skills" --exact`. The sidebar "Skills" is a link (`NavItem.tsx:21`); `find text` would hit it first and leave the page.
  - 10 `Conventions` → first `wait --text "Add rate limiting to public API endpoints"` (the active repo resolved, so the nav href has a real `:repoId`), then `find role link click --name "Conventions"`.
  - 10 `Reject` → `find role button click --name "Reject" --exact` (first card = C1).
  - 10 `Select all` → `find role button click --name "Select all" --exact` (without `--exact` the case-insensitive substring would also match "Deselect all").
  - 10 first `Create skill` → `find role button click --name "Create skill" --exact` (the only such button before the modal opens).
  - 10 second `Create skill` (the footer button that writes) → `click "//*[@role='dialog']//button[normalize-space(.)='Create skill']"`. The toolbar button keeps the same name while the modal is open, and the vendored `Modal` renders `role="dialog"` (`client/src/vendor/ui/kit/Modal.tsx:26`).
  - 10 `wait --text "Confidence"` → `wait --text "CONFIDENCE"` (`confidenceLabel` is uppercase, `…/conventions/_components/ConventionCard/styles.ts:98`).
  - Rewrite flow 10's `description` PRECONDITION: the candidates now come from `pnpm db:seed` (`seedDemoConventions`, 3 pending rules), not from an external precondition.
- **Layer / why here:** e2e specs only.
- **Skills to apply:** none (see S4)
- **Practices:** as S4. Where a locator fails, run `agent-browser snapshot` against the hermetic stack to read the real role and accessible name, then switch **only** between the forms named above (`find role … --exact`, `find text … --exact`, dialog-scoped XPath); record any switch in the handoff. No `sleep`-style `wait <ms>`.
- **Known gotchas:** as S4.
- **Done when:** `rg -n '"click", "--text"' e2e/specs` prints nothing · `jq -e . e2e/specs/*.flow.json` exits 0 · flows 09 and 10 pass in a `./scripts/e2e.sh` run.

### S6 — Correct the e2e docs, then prove stability
- **Files:** `e2e/docs/flows.md`, `e2e/README.md`, `e2e/AGENTS.md` (modify)
- **Change:**
  - `flows.md` §1 (lines 48–55): the command list becomes `open`, `wait --load|--url|--text|--fn`, `find text|role|label <value> click [--name …] [--exact]`, and `click <xpath>` (only for a dialog-scoped button). Drop `click --text`, re-point the `09-skills.flow.json:10` example at a real `find role` line, and add one sentence: `wait --text` is a case-sensitive substring of the *rendered* text, so CSS `textTransform: uppercase` changes what it must say.
  - `flows.md` catalogue row for `10-conventions` (line 100) and the §6 PRECONDITION pointer (line 154): the candidates are seeded by `pnpm db:seed`.
  - `README.md:19` and `AGENTS.md:36` locator lists: add `wait --fn` and name `find … click` as the click form; no `click --text`.
- **Layer / why here:** docs describe the flows changed in S4/S5.
- **Skills to apply:** none (Markdown only)
- **Practices:** keep every greppable token unwrapped on one line. Edit `e2e/AGENTS.md`, never the `e2e/CLAUDE.md` symlink.
- **Known gotchas:** [a Done-when grep fails when Markdown wraps a phrase](../../INSIGHTS.md#2026-09-28--a-done-when-grep-for-a-phrase-fails-when-markdown-wraps-that-phrase-across-two-lines).
- **Done when:** `rg -n 'click --text' e2e/README.md e2e/docs e2e/AGENTS.md` prints nothing, and `./scripts/e2e.sh` prints `11/11 flows passed` on **3 consecutive** runs (AC1). Record the three summaries in the handoff.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `server/test/seed-conventions.test.ts` | unit | fingerprint parity with `fingerprintFor`, data shape, flow-10 word guard | S3 (AC3) |
| `server/test/seed-conventions.it.test.ts` | integration | `seed()` alone stays empty; `seedDemoConventions` idempotent; route serves the scan + 3 pending | S3 (AC3, AC4) |
| `server/test/conventions.it.test.ts` (existing, unchanged) | integration | still 2 rows after its own extract | S3 (AC4) |
| `./scripts/e2e.sh` ×3 | e2e | all 11 flows | S4–S6 (AC1, AC2) |

## Migrations & contracts
None. No schema or contract change: the existing `conventions` / `convention_scans` tables are used as-is.

## Out of scope
- Any `client/**` change, including the `textTransform` styles; the flows adapt to them.
- Calling `seedDemoConventions` from `seed()`, or editing `conventions.it.test.ts`.
- `e2e/run.ts` (for example, surfacing stderr), `scripts/e2e.sh`, and `.github/workflows/e2e-web.yml`, including pinning the agent-browser version.
- Adding retries or `wait <ms>` sleeps.

<!-- implementer-brief:end -->

## Context applied
- `e2e/insights/gotchas.md` → hermetic runner only; no `down -v` → S4–S6 Done-when.
- `server/insights/gotchas.md` → hermetic `.it` config → S3. Its DB & migrations items do not apply (no schema change).
- Root `INSIGHTS.md` → "a skill listed on a step where it has nothing to do…" → only binding skills are listed per step. → "a Done-when grep … wraps" → S6.
- `e2e/specs/10-conventions.flow.json` description → the precondition the seed never met (`server/src/db/seed.ts:27-28`).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1 | — |
| `engineering-insights` | preload | — | read-side only while planning; wrap-up belongs to the main session |
| `drizzle-orm-patterns` | on demand (S2) | S2 | — |
| `typescript-expert` | on demand (S1) | S1, S2, S3 | — |
| `postgresql-table-design` | not loaded | — | no table or index design; the seed writes existing tables |
| `zod`, `security` | not loaded | — | no Zod schema is written and no trust boundary is touched (seed is a local CLI) |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| server | `src/db/seed-conventions.ts` | infrastructure (seed data) | new |
| server | `src/db/seed.ts` | infrastructure (seed CLI) | changed |
| server | `test/seed-conventions*.ts` | tests | new |
| e2e | `specs/02,04,05,08,09,10` | flows | changed |
| e2e | `README.md`, `docs/flows.md`, `AGENTS.md` | docs | changed |

## Design notes
- **Why CLI-only seeding.** `seed()` is the shared fixture of the `.it` suites. `conventions.it.test.ts` counts rows for the same repo, and other suites may later count skills or conventions too. Putting the demo candidates behind the CLI keeps fixtures minimal while `pnpm db:seed` (dev, hermetic e2e, CI) gets the full demo.
- **Why skip-if-any-scan.** A per-fingerprint upsert would resurrect nothing, but it would add a *second* scan. The page only lists the latest scan's candidates (`repository.ts:210-222`), so the demo scan could hide a real one. Skipping whenever a scan exists never shadows real data.
- **Flow 10 arithmetic.** C1 (0.92) is the first card and is the one rejected. "Select all" accepts C2 and C3, so the modal reads "Merged from 2 accepted rules citing 2 files", and the created skill is `payments-api-conventions`.
- **Other uppercase texts checked.** The run-accordion verdict `Badge` is not transformed (`client/src/vendor/ui/primitives/Badge.tsx`: only `SeverityBadge` is, at :75), so flow 04's `request changes` stands.

## Risks & open questions
- agent-browser's exact accessible-name computation (icon SVGs inside buttons) is not confirmable from the repo. If `--exact` misses, S5 allows the fallback forms. CI installs `latest`, so a future release can change the grammar again; pinning is out of scope and is a follow-up for the user.
- Flow 02 flaked even with a `wait --text` before its click. The `--fn` not-loading guard is a reasoned fix, not a proven one. AC1's 3 runs are the evidence; if it still flakes, capture stderr with the wrapper and report rather than add sleeps.
- `pnpm db:seed` on an existing dev DB now adds 3 demo candidates to `acme/payments-api` when it has no scan. This is intended by Q1 → B, and it is harmless.
- Doc vs code: `e2e/docs/flows.md:50` lists `click --text`, which agent-browser 0.38 does not have.

## Handed off
- architecture-reviewer: `db/seed-conventions.ts` duplicates the fingerprint recipe instead of importing `modules/conventions/helpers.ts` (the onion rule); the unit test guards the drift.
- security review: none — no route, input, secret or outbound URL changes.

## Insights to record
- `e2e/INSIGHTS.md` · Tool & Library Notes: agent-browser ≥ 0.38 has no `click --text`, and `wait --text` matches rendered text case-sensitively, so CSS uppercase changes the needle (`FindingsTab/styles.ts:64`, `ConventionCard/styles.ts:98`).
- `e2e/INSIGHTS.md` · What Works: `run.ts` drops stderr; an `AGENT_BROWSER_BIN` wrapper that logs stderr exposes the real error (`e2e/run.ts:44-51`).
- `server/INSIGHTS.md` · Codebase Patterns: demo data that `.it` suites would trip on is seeded from the CLI entrypoint only (`conventions.it.test.ts:234`).

## Red-flags check
- [x] Every AC maps to at least one step or test
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; product choices are in *Decisions recorded*
- [x] Groups end type-checking; parallel groups share no file (G2 runs after G1)
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1: n/a (single pass)
- [x] Every step's *Skills to apply* is complete (the implementer reads only those)

## Handoffs → G2
From the G1 implementer run (2026-09-30, status done; S1–S3 done; no deviations).
- Files: `server/src/db/seed-conventions.ts` (new: `SEED_CONVENTIONS`, `SeedConvention`, `seedConventionFingerprint`), `server/src/db/seed.ts` (`seedDemoConventions(db, workspaceId)`, called only from the CLI block after `seed()`), `server/test/seed-conventions.test.ts`, `server/test/seed-conventions.it.test.ts` (new).
- For G2: cards render as C1 (0.92), C2 (0.85), C3 (0.74). No rule text contains any flow-10 locator word. `scripts/e2e.sh` and CI both run the `pnpm db:seed` CLI, so the candidates are present.
- Checks: server typecheck ✅; `seed-conventions` + `conventions.it` 16 ✅; server unit 36 files / 412 ✅.
- Main-session review: idempotent (it skips when any scan exists for the repo), a single transaction, and `seed()` is unchanged, so the `.it` suites' exact-count asserts hold.

### Skills (G1)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1, S2 | |
| `typescript-expert` | on demand | S1, S2, S3 | |
| `drizzle-orm-patterns` | on demand | S2 | |

## Handoffs → verification (after G2)
From the G2 implementer run (2026-09-30, status done; S4–S6 done). Trivial deviations:
- The dialog-scoped XPath needs the `xpath=` prefix in 0.38: `["click", "xpath=//*[@role='dialog']//button[normalize-space(.)='Create skill']"]`.
- The S4 guard is `wait --load networkidle` → `wait --fn "!…includes('Loading pull requests')"` → `wait --text <PR title>`. In 02 it replaces the old `wait --text`.
- The docs also note that `wait --text` is case-sensitive against the rendered text.
- Files: `e2e/specs/02,04,05,08,09,10-*.flow.json`, `e2e/docs/flows.md`, `e2e/README.md`, `e2e/AGENTS.md`.
- Checks: `jq -e .` on all flows ✅; no `"click", "--text"` left in specs or docs ✅; `./scripts/e2e.sh` 11/11 ×3 consecutive ✅ (one earlier run was 10/11 before the xpath fix).

### Skills (G2)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | — | G2 touches only e2e specs and docs |

## Verification log
### Wave 1 (2026-09-30)
- Main session, independently after the last group: `./scripts/e2e.sh` gives `11/11 flows passed` (a 4th consecutive green run); server typecheck ✅; `pnpm test` gives 56 files / 541 tests, exit 0, including all `.it` files.
- plan-verifier (Wave 1): **incomplete**: 39/48 met, 4 partial, 5 not-verifiable. Fix-mode gaps:
  - **AC2/P5:** `09-skills.flow.json:40`'s Skills-tab click follows only `wait --url "/agents/"`. It needs a wait proving the agent editor's tab strip rendered (not `wait --text "Skills"`, which the sidebar always shows).
  - **AC5:** `e2e/README.md` lacks the sentence that `wait --text` is case-sensitive against the rendered text.
  - **S6:** `e2e/docs/flows.md` citations drifted. `:57` cites `09-skills.flow.json:14` (now a blank line), and `:56` cites `02-…:8` (now `wait --fn`). `:52` lists `click <xpath>` without the `xpath=` prefix that 0.38 needs.
  Needs sign-off: AC1/D13/T4 (the 3 consecutive runs are the implementer's claim; the main session will re-run 3× after the fix), R3, R4.
- **Fix mode AC2/P5, AC5, S6 (2026-09-30):** implementer done. Changes:
  - `09-skills.flow.json`: a `wait --fn` for a `<button>` whose trimmed text is exactly `Skills`, placed before the tab click.
  - `e2e/README.md`: the case-sensitivity sentence.
  - `e2e/docs/flows.md`: citations by step content instead of `file:line`, and the documented `click xpath=<expr>`.
  - The implementer's own `./scripts/e2e.sh` run gave 11/11.
- **Main-session 3× check (AC1/D13/T4):** after the fix, `./scripts/e2e.sh` ran 3 consecutive times, each `11/11 flows passed`, exit 0, 0 FAIL.
- plan-verifier (delta after fix mode): **complete — needs sign-off**: 46/48 met, no gaps, no unplanned changes. Pending the user: R3, R4.
- **test-writer (2026-09-30, closes R4):** Test Report with a *Proof* table. Results:
  - 11 temporary mutations of `seed-conventions.ts`/`seed.ts`, each making its named test fail, then reverted.
  - Checksums restored: `seed-conventions.ts` `852a021d…`, `seed.ts` `ba4b483e…`. The main session re-checked both with `shasum`, and they match.
  - +2 `.it` tests for the skip guards (repo missing; any scan already exists) in `server/test/seed-conventions.it.test.ts`.
  - 10/10 ×3 stable; the main session re-ran 10/10.
  - Production defects: none. Coverage gap left: a repo that exists in a different workspace.

### Sign-off (2026-09-30)
User: "R3 підтверджую".
- R3 signed off: after approval, only the main session edited this plan file (Status, Decisions recorded, handoffs, Verification log).
- R4 closed by evidence: test-writer's *Proof* table (11 mutations, checksums restored), not by acceptance.

### Final (2026-09-30)
Verification complete. R3 signed off by the user, R4 proven by test-writer. Status → `done`. Open follow-ups (not decided):
- `e2e/run.ts` drops agent-browser's stderr, so a failing step shows only "Command failed";
- CI installs `agent-browser` latest, unpinned;
- a coverage gap for a same-name repo in another workspace.
