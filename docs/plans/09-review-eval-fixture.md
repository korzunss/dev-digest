# Development Plan: Review eval fixture — recall, precision and duplicates per reviewer agent
Status: done
Save as: docs/plans/09-review-eval-fixture.md
Spec: none

## Goal & acceptance criteria
`cd server && pnpm eval:review` scores the latest completed run of each of the five reviewer agents on PR #12 (`korzunss/dev-digest`, `L04_test_mcp` → `L04`, head `3b8ea1e1a9d665bd3ac1d973fd9e9c423b4ab50c`, 12 planted issues). It makes no LLM call, prints recall, precision and cross-agent duplicates per agent, and stores one `eval_runs` row per agent for plan 10 to compare against.
- AC1: the 12 planted issues and one acceptable extra live in a checked-in JSON fixture. The fixture is validated by a Zod schema and records the owning lane, the file with its line range(s), the allowed categories and the keywords of each issue.
- AC2: a finding matches an issue only when all of these hold: same `file`, line range overlapping an issue range widened by ±`line_tolerance` (3), `category` in the issue's allowed set, and at least one keyword (case-insensitive substring) in `title + rationale`. A finding matches at most one issue; ties go to the most keyword hits, then the smallest line distance, then fixture order.
- AC3: the metrics follow D4:
  - recall per agent = its own-lane planted issues found ÷ its lane size, or `n/a` when the lane is empty;
  - precision = findings matching any planted issue or acceptable extra ÷ all its findings, or `n/a` with 0 findings;
  - duplicates = the planted issues matched by more than 1 agent;
  - suite recall = planted issues found by any agent ÷ 12.
- AC4: runs are chosen as follows:
  - Default: the latest `agent_runs` row with `status='done'` per agent on the fixture PR.
  - `--run <id>` (repeatable) overrides the default per agent.
  - An agent with no run is reported `no run` and gets no `eval_runs` row.
  - Each run's findings are read through `reviews.run_id`.
- AC5: each run upserts one `eval_cases` row per agent (`owner_kind='agent'`, `owner_id` = the agent resolved by name, `name` = fixture id, `expected_output` = that lane's issues + extras). Re-running never duplicates a case. Each scored agent gets a new `eval_runs` row with `recall`, `precision`, `duration_ms`/`cost_usd` copied from the run, and the per-issue detail + duplicates in `actual_output`.
- AC6: with no migration and no change to `reviewer-core/**`, the run executor or any route, `pnpm typecheck` and both test tiers pass.

## Decisions needed
D1–D6 resolved — see *Decisions recorded*. Pass 2 surfaced three smaller choices that D1–D6 do not settle; the steps are written with the recommendation:

| # | Decision | Options | Recommendation | Steps affected |
|---|---|---|---|---|
| D7 | What goes in `eval_runs.citation_accuracy` (nullable, no D4 definition) | A: matched findings whose range overlaps the issue range with **zero** tolerance ÷ matched findings, `null` when nothing matched · B: always `null` | A: it tells a finding on the right line apart from a keyword hit 3 lines away, at no extra cost | S2, S4 |
| D8 | What goes in `eval_runs.pass` | A: `null`, no threshold until plan 10 sets a baseline · B: `recall === 1` · C: a recall/precision threshold chosen now | A: any threshold picked now is arbitrary; plan 10 compares numbers | S4 |
| D9 | The stored PR head differs from the fixture's `head_sha` | A: abort, exit 1, write nothing · B: warn and score anyway | A: runs record no head SHA (`agent_runs` has none, `runs.ts:19-45`), so a moved head silently invalidates every expected line range | S4 |

## Decisions recorded
User, 2026-09-30: "09 — усі за рекомендацією" — every recommendation accepted.

| # | Choice |
|---|---|
| D1 | A — score only: reviews run as today (UI/MCP); the eval scores the latest completed run per agent on PR #12, or given run ids |
| D2 | C — checked-in JSON is the source of truth, upserted into `eval_cases` as one row per agent holding its lane (D5=A) |
| D3 | B — same file + line overlap within ±N + category in the issue's allowed set + ≥1 keyword in title/rationale; a finding matches at most one issue |
| D4 | A — recall = own-lane issues found ÷ lane size; precision = findings matching any planted issue or a listed acceptable extra ÷ all findings; duplicates = planted issues found by >1 agent; plus suite-wide recall |
| D5 | A — one `eval_runs` row per agent + a stdout table |
| D6 | A — manual server script (`pnpm eval:review`); makes no LLM call |

User, 2026-09-30 (after pass 2): "усі пропозиції підтримую" — D7–D9 recommendations accepted.

| # | Choice |
|---|---|
| D7 | A — `citation_accuracy` = share of matched findings whose lines overlap the issue with zero tolerance; `null` when nothing matched |
| D8 | A — `pass` stays `null` until plan 10 sets a baseline |
| D9 | A — PR head ≠ fixture `head_sha` → abort, exit 1, write nothing |

## Prerequisites
No new dependencies. The manual run (Tests → *Manual*) needs local Postgres with PR #12 imported and reviewed by the five agents.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S2 | server `modules/eval` — fixture schema, fixture data, pure scoring (+ unit tests) | — | Exports from `fixture.ts`: `ReviewEvalFixture`, `EvalIssue`, `Lane`. Exports from `helpers.ts`: `matchFinding`, `scoreSuite`, `formatReport`, types `EvalFindingInput`, `AgentScore`, `SuiteScore` |
| G2 | S3–S5 | server `modules/eval` — repository, service, CLI + `package.json` script (+ `.it` test) | G1 | Last group: report the manual-run result for PR #12 |

G1 is 5 files and G2 is 5 files, and they run strictly in sequence because G2 imports G1's types.

## Steps
### S1 — Define the fixture schema and write the PR #12 fixture
- **Files:** `server/src/modules/eval/fixture.ts` (create) · `server/src/modules/eval/fixtures/pr-export-planted.json` (create) · `server/test/eval-fixture.test.ts` (create)
- **Change:**
  - **The schema, in `fixture.ts`:** Zod schemas + `z.infer` types.
    - `Lane = z.enum(['general','security','performance','test_quality','api_contract'])`.
    - `EvalLocation = { file, start_line, end_line }`: ints ≥1, with a `refine` that `end_line ≥ start_line` and a `path`.
    - `EvalIssue = { id, lane: Lane, title, locations: EvalLocation[] (min 1), categories: FindingCategory[] (min 1, from @devdigest/shared), keywords: string[] (min 1, lower-case) }`.
    - `ReviewEvalFixture = { id, repo ('owner/name'), pr (int), head_sha (40-hex regex), line_tolerance (int ≥0), lanes: Record<Lane, string /* agent name */>, issues: EvalIssue[], acceptable_extras: EvalIssue[] }`, `.strict()`, with a `superRefine` requiring unique ids across issues and extras.
    - `parseFixture(raw: unknown): ReviewEvalFixture` uses `safeParse` and throws one `Error` listing every issue path.
  - **The data, in the JSON:** `id: "pr-export-planted-v1"`, `repo: "korzunss/dev-digest"`, `pr: 12`, `head_sha: "3b8ea1e1a9d665bd3ac1d973fd9e9c423b4ab50c"`, `line_tolerance: 3`, and `lanes` = General/Security/Performance/Test Quality/API Contract Reviewer, the exact names from `server/src/db/seed.ts:186-230`. The line ranges were read from `git show L04_test_mcp:<file>`. `R` = `server/src/modules/pr-export/routes.ts`, `H` = `…/helpers.ts`, `T` = `server/test/pr-export-helpers.test.ts`:

    | id | lane | locations | categories | keywords (assumption — tune only here) |
    |---|---|---|---|---|
    | sql-injection | security | R 23-26 | security, bug | injection, sql.raw, raw sql |
    | ssrf-webhook | security | R 55-62 | security | ssrf, server-side request, arbitrary url, user-supplied url, fetch |
    | hardcoded-key | security | R 12-13 | security | hardcoded, hard-coded, signing key, secret |
    | no-authz | security | R 18-20, R 55-56 | security | auth, workspace, access control, tenant, idor |
    | key-in-log | security | R 57 | security | log |
    | n-plus-one | performance | R 29-38 | perf | n+1, n + 1, per pr, per-pr, in a loop, each pr |
    | deep-clone | performance | R 44 | perf | json.parse, json.stringify, deep clone, deep-clone, clone |
    | paginate-off-by-one | general | H 12-15 | bug | off-by-one, off by one, paginat, page |
    | risk-else-if | general | H 18-25 | bug | else, critical, double, 11 |
    | average-nan | general | H 29-31 | bug | nan, empty, divide, division, zero |
    | empty-catch | general | R 50-52 | bug, style | catch, swallow, silent, error |
    | tests-cannot-fail | test_quality | T 5-16 | test | cannot fail, tobedefined, weak, vacuous, assert, tautolog |

    `acceptable_extras`: `missing-zod-schemas`, lane `api_contract`, R 18-20 + R 55-56, categories bug/style/security, keywords zod, schema, validat.
- **Layer / why here:** module-local data + schema. It is not an API contract, so nothing goes into `vendor/shared`.
- **Skills to apply:** `zod`, `typescript-expert`
- **Practices:** types come from `z.infer` only. `safeParse` reports every issue (`parse-handle-all-issues`, `parse-never-trust-json`). `FindingCategory` is imported, not re-declared. No `any`.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck`. `eval-fixture.test.ts` asserts that:
  - the checked-in JSON parses;
  - it has 12 issues, with 5 security, 2 performance, 4 general and 1 test_quality;
  - every lane maps to a distinct agent name;
  - a duplicate id is rejected;
  - `end_line < start_line` is rejected with its path.

### S2 — Pure matcher and scorer
- **Files:** `server/src/modules/eval/helpers.ts` (create) · `server/test/eval-helpers.test.ts` (create)
- **Change:**
  - **Types:** `EvalFindingInput = { id, file, start_line, end_line, category, title, rationale }`. `AgentRunInput = { agentName, lane, runId, durationMs, costUsd, findings: EvalFindingInput[] }`.
  - **Functions:**
    - `matchFinding(f, candidates, tolerance): { issueId, exact: boolean } | null` implements AC2. `exact` = overlap with zero tolerance, for D7.
    - `scoreSuite(fixture, runs: AgentRunInput[]): SuiteScore`. It matches every finding against `issues ∪ acceptable_extras` and returns:
      - per agent, an `AgentScore { agentName, lane, runId, recall: number|null, precision: number|null, citationAccuracy: number|null, laneFound: string[], laneMissed: string[], offLane: string[], extras: string[], unmatched: finding ids[], findingsCount, durationMs, costUsd }`;
      - `duplicates: { issueId, agents: string[] }[]`, for issues matched by more than 1 agent;
      - `suiteRecall`;
      - `missedBySuite: string[]`.
    - `formatReport(s: SuiteScore): string` renders a fixed-width table with one row per agent (recall `x/y`, precision, findings, matched, off-lane, unmatched, cost, duration), then the duplicates and missed lines.
  - **Metric rules (D4):** an extra-issue match counts for precision only, never for recall or duplicates. The API Contract lane has no planted issues, so its recall is `null`.
- **Layer / why here:** pure domain logic in the module's `helpers.ts` (architecture.md §2: no DB, no network, no `this`). It does not go in `reviewer-core`, because it scores stored runs and is not part of the review engine.
- **Skills to apply:** `typescript-expert`
- **Practices:** no imports from `drizzle-orm`, `db/**`, `platform/**` or `node:fs`. Functions are total over empty inputs (0 findings, 0 runs), so there is no `NaN`. The output is ordered deterministically (fixture order, then agent order from `lanes`).
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `pnpm exec vitest run test/eval-helpers.test.ts` asserts:
  - a finding at ±3 lines matches;
  - a finding at ±4 lines does not;
  - a wrong category does not match;
  - no keyword means no match;
  - adjacent SQLi and hard-coded-key findings resolve to the right issue;
  - one finding never matches two issues;
  - recall/precision on a hand-built 3-agent case;
  - duplicates list only cross-agent matches;
  - an empty lane gives `recall: null`;
  - 0 findings give `precision: null`;
  - `citationAccuracy` follows D7.

### S3 — Eval repository
- **Files:** `server/src/modules/eval/repository.ts` (create)
- **Change:** `export class EvalRepository { constructor(private db: Db) }` with:
  - `findWorkspaceByName(name)`;
  - `findPull(workspaceId, repoFullName, number)`, which joins `repos` (`full_name`, `provider='github'`) to `pull_requests` and returns `{ id, headSha }`;
  - `findAgentsByName(workspaceId, names[])`, returning `{ id, name }[]`;
  - `latestDoneRuns(prId, agentIds[])`, returning the newest `status='done'` row per agent (`ranAt` desc), with `id, agentId, durationMs, costUsd`;
  - `getRuns(runIds[])`, returning the same shape plus `prId, status`;
  - `findingsForRuns(runIds[])`, which joins `reviews` (`run_id IN …`, `kind='review'`) to `findings` and returns `runId, id, file, startLine, endLine, category, title, rationale`;
  - `upsertEvalCase({ workspaceId, ownerId, name, inputMeta, expectedOutput })`, which selects by `(workspace_id, owner_kind='agent', owner_id, name)`, then updates or inserts, and returns `id`;
  - `insertEvalRun({ caseId, actualOutput, pass, recall, precision, citationAccuracy, durationMs, costUsd })`, returning `id`.
- **Layer / why here:** infrastructure. Only a repository touches `db/schema` + `drizzle-orm` (onion decision framework step 2). The module does not import `reviews/repository.ts`, because that would be a cross-module edge.
- **Skills to apply:** `onion-architecture`, `drizzle-orm-patterns`, `typescript-expert`
- **Practices:** every query uses the Drizzle builders (`eq`, `and`, `inArray`, `desc`), with no `sql.raw`. It returns plain rows, not query builders. It uses `inArray` over the ≤5 run ids, so there are no per-run queries. It imports nothing from `modules/**` other than its own module.
- **Known gotchas:** `server/insights/gotchas.md` → *A foreign-key column carries no index of its own*. `reviews.run_id` has no index (`schema/reviews.ts:18-38`), so filter by `pr_id` as well (`reviews_pr_idx`), and do not add an index or migration.
- **Done when:** `cd server && pnpm typecheck` · `grep -nE "^import .*(modules/(reviews|agents|pulls)|platform/container)" server/src/modules/eval/repository.ts` returns nothing · covered by S5's `.it` test.

### S4 — Eval service
- **Files:** `server/src/modules/eval/service.ts` (create)
- **Change:** `export interface EvalServiceDeps { repo: EvalRepository }` and `export class EvalService { constructor(private deps: EvalServiceDeps) }`, following the `IntentService` deps shape (`modules/intent/service.ts:95`). Its method `scoreReviewFixture(fixture, { workspaceName, runIds? }): Promise<SuiteScore & { evalRunIds: string[]; noRun: string[] }>` works in this order:
  1. It resolves the workspace, then the PR. A missing workspace or PR throws `Error('fixture PR korzunss/dev-digest#12 not found in workspace …')`.
  2. It compares `pull.headSha` to `fixture.head_sha`. A mismatch throws before any write (D9-A).
  3. It resolves the agents by the names in `lanes`. A missing agent means that lane is reported under `noRun`. If a name matches several agents, it takes the first by `id` and adds a warning line to the report (assumption).
  4. It picks the runs: `runIds` given → `getRuns`, and every run must have `prId` = the fixture PR, `status='done'`, and an agent in `lanes`, otherwise it throws with the offending id. Other agents fall back to `latestDoneRuns`.
  5. It loads the findings, maps them to `EvalFindingInput`, and calls `scoreSuite`.
  6. For each scored agent it calls `upsertEvalCase` (`inputMeta = { repo, pr, head_sha }`, `expectedOutput = { lane, issues: laneIssues, acceptable_extras: laneExtras, line_tolerance }`) and `insertEvalRun`:
     - `pass: null` (D8-A);
     - `citationAccuracy` per D7-A;
     - `actualOutput = { run_id, recall, precision, lane_found, lane_missed, off_lane, extras, unmatched, duplicates: <entries involving this agent>, suite_recall }`.
- **Layer / why here:** application layer, orchestration only. It reaches the DB through the injected repository and does no SQL and no file I/O.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** no `drizzle-orm`, `db/schema`, `node:fs`, `fastify` or adapter imports. There is no LLM or container access (D6: no LLM call). Every precondition throws before the first write, so there is no half-written eval.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `grep -nE "^import .*(drizzle-orm|db/schema|node:fs|fastify|adapters/)" server/src/modules/eval/service.ts server/src/modules/eval/helpers.ts` returns nothing · covered by S5's `.it` test.

### S5 — CLI entry, package script, integration test
- **Files:** `server/src/modules/eval/cli.ts` (create) · `server/package.json` (modify: add `"eval:review": "tsx src/modules/eval/cli.ts"`) · `server/test/eval.it.test.ts` (create)
- **Change:** `cli.ts` is the module's transport, in place of a `routes.ts`, and the composition root for this one entrypoint (same shape as `db/backfill-run-cost.ts:67-95`). It works as follows:
  - It loads `dotenv/config` and parses `--fixture <path>` (default `fixtures/pr-export-planted.json`, resolved from `import.meta.url`), `--workspace <name>` (default `'default'`, from `seed.ts` `DEFAULT_WORKSPACE_NAME`) and repeatable `--run <uuid>` with `node:util` `parseArgs` (`strict: true`).
  - It checks each `--run` against `z.string().uuid()`.
  - It reads the file (`readFile`) → `JSON.parse` → `parseFixture`.
  - It builds `createDb(process.env.DATABASE_URL)` → `new EvalService({ repo: new EvalRepository(db) })` and calls `scoreReviewFixture`.
  - It prints `formatReport` plus the stored `eval_runs` ids and exits 0. On any error it prints `✗ eval failed: <message>` and exits 1.
  - It always calls `close()`.
  - The guard `if (import.meta.url === \`file://${process.argv[1]}\`)` is kept so the test can import without running it.
  - The module is **not** registered in `modules/index.ts`.
- **Layer / why here:** transport and composition for a manual tool (D6-A). It sits in the module rather than in `db/`, because `db/` is infrastructure and must not import a feature module.
- **Skills to apply:** `onion-architecture`, `zod`, `security`, `typescript-expert`
- **Practices:** CLI input is validated at the boundary (`parseArgs strict`, the `--run` uuid schema via `safeParse`, `parseFixture`). It prints no `DATABASE_URL` and no connection string, even on error, only the error message. It makes no network or LLM call. It exports a `main(argv)` function so the entry guard stays one line.
- **Known gotchas:** `server/insights/gotchas.md` → *A hermetic `.it` test must not be able to reach a real API key*. The test builds no app and no container, so no LLM can be resolved; keep it that way. `MockGitHubClient` lists exactly one PR, and here that is fine: the test targets the seeded PR #482 with its own in-test fixture.
- **Done when:** `cd server && pnpm typecheck` · `pnpm exec vitest run test/eval.it.test.ts` (Postgres/Docker up) asserts, against `seed()` data (seeded repo + PR #482 + the five seeded agents) with an in-test fixture pointing at that PR and its `head_sha`:
  - the newest `done` run is picked over an older `done` and a newer `failed` one;
  - `--run`-style ids override it;
  - one `eval_cases` row per scored agent, and a second call adds `eval_runs` rows but no new `eval_cases` rows;
  - `recall`, `precision`, `duration_ms` and `cost_usd` are persisted as computed;
  - a `head_sha` mismatch throws and leaves `eval_runs` empty;
  - an agent with no run appears in `noRun` with no row.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `server/test/eval-fixture.test.ts` | unit | fixture schema + checked-in data invariants (AC1) | S1 |
| `server/test/eval-helpers.test.ts` | unit | matching rule, tie-break, metrics, duplicates, D7 (AC2, AC3) | S2 |
| `server/test/eval.it.test.ts` | integration (`.it`) | run selection, case upsert, run rows, head guard (AC4, AC5, D9) | S5 |
| Manual: `cd server && pnpm eval:review` on the dev DB | manual (needs sign-off) | the 2026-09-30 runs of PR #12 score roughly suite recall 10/12, with key-in-log and deep-clone missed, and duplicates include sql-injection (4 agents) | S5 |

## Migrations & contracts
None. `eval_cases`/`eval_runs` already have every column used (`schema/eval.ts:7-37`). No `vendor/shared` edit, because the fixture schema is module-local. No `db:generate`.

## Out of scope
- Starting reviews or any LLM call from the eval (D1-A, D6-A); CI wiring; routes, MCP tools, client UI (Evals tab stays a placeholder).
- `reviewer-core/**` (in particular `src/llm/**` and `src/review/run.ts`), `server/src/modules/reviews/**`, the run executor — plan 08 is changing them.
- Agent prompts, skills or models (plan 10); editing PR #12 or merging `L04_test_mcp`.
- Recording a head SHA on `agent_runs`, indexing `reviews.run_id`, or any migration.
- `vendor/**`, `modules/index.ts`.

<!-- implementer-brief:end -->

## Context applied
- `server/insights/gotchas.md` → *A foreign-key column carries no index of its own*: this is why S3 filters `reviews` by `pr_id` as well as `run_id`, and plans no index.
- `server/insights/gotchas.md` → *A hermetic `.it` test must not be able to reach a real API key*: S5's test builds no container/app.
- `server/insights/gotchas.md` → *`MockGitHubClient` lists exactly one PR*: S5 uses the seeded PR #482 rather than inserting PR #12.
- Root `INSIGHTS.md` → "a skill listed on a step where it has nothing to do…": `zod` only on S1 and S5, the two steps that write a Zod schema; `drizzle-orm-patterns` only on S3; `fastify-best-practices` nowhere, because there is no route.
- Root `INSIGHTS.md` → "the onion skill's `depcruise` gate … not real" and "`rg` edge checks catch comments": the Done-when layering checks are `grep -nE "^import …"` on import lines.
- `server/docs/architecture.md` §1–2: the module anatomy and the deps-injected service shape (`IntentService`).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| engineering-insights | preload | — | planning only; insights candidates listed below |
| onion-architecture | preload | S3, S4, S5 | — |
| zod | on demand (S1) | S1, S5 | — |
| drizzle-orm-patterns | on demand (S3) | S3 | — |
| typescript-expert | on demand (S1) | S1, S2, S3, S4, S5 | — |
| security | on demand (S5) | S5 | — |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| server | `src/modules/eval/fixture.ts`, `fixtures/pr-export-planted.json` | domain data + schema | new |
| server | `src/modules/eval/helpers.ts` | pure domain | new |
| server | `src/modules/eval/repository.ts` | infrastructure | new |
| server | `src/modules/eval/service.ts` | application | new |
| server | `src/modules/eval/cli.ts`, `package.json` script | transport / composition | new / changed |
| server | `test/eval-fixture.test.ts`, `test/eval-helpers.test.ts`, `test/eval.it.test.ts` | tests | new |

## Design notes
- **Confirmed repo facts** (the three pass-1 asked for):
  - Seeded agent names: `General Reviewer`, `Security Reviewer`, `Performance Reviewer`, `Test Quality Reviewer`, `API Contract Reviewer` (`server/src/db/seed.ts:186-230`). `agents.name` is per workspace, and nothing guarantees it is unique, so if a name matches more than one agent the repository takes the first by `id`. This is an assumption; see Risks.
  - `agent_runs.duration_ms` is at `runs.ts:29` and `cost_usd` at `runs.ts:34` (null = unknown, keep null). `status` is `'running'|'done'|'failed'|'cancelled'` (`reviews/repository/run.repo.ts:118-150`).
  - Findings are reached through `reviews.run_id` (`schema/reviews.ts:26-28`), then `findings.review_id` (`reviews_pr_idx` and `findings_review_idx` exist). The reviews module has no "findings by run" method; the eval gets its own repository query rather than a cross-module import.
- **Why the CLI builds its own service instead of using the container:** the eval needs only `db`. Building `Container` would pull in `loadConfig` and secrets for nothing. `EvalServiceDeps` keeps the service injectable, the same way `IntentService` is.
- **`actual_output` vs the `EvalRun` contract:** the shared `EvalRun` (`knowledge.ts:58-68`) is shaped for trace-based evals (`traces_passed`, `per_trace`). No route reads `eval_runs` today, so the plan stores the module's own JSON shape. A future eval route would map it to `EvalRunRecord`.
- **Pass-1 options (D1–D6), summarised:** D1 was score-only vs run-then-score vs hermetic stored diff. D2 was JSON vs DB-only vs JSON→DB. D3 was lines-only vs lines+category+keywords vs an LLM judge. D4 was precision against any planted issue vs in-lane only. D5 was `eval_runs` vs a JSON file vs stdout. D6 was script vs route/MCP vs CI. The chosen options are in *Decisions recorded*.

## Risks & open questions
- **Keyword lists are tuning data, not truth.** The first manual run may show a real finding rejected for lack of a keyword, or a wrong adjacent match. Fixes are edits to the JSON only, reviewed in the PR; do not loosen the rule in code.
- **Head pinning is at PR level only:** runs record no head SHA, so if PR #12 is ever force-pushed back to the same SHA after an interim head, the old runs are indistinguishable. Mitigation: the PR is frozen by convention (never merged, never updated).
- **Duplicate agent names in a workspace** (a user-created copy named "Security Reviewer") would make name resolution ambiguous. The plan takes the first by `id` and prints a warning line (assumption). A stricter behaviour is a later decision.
- **Security note:** the fixture code intentionally contains a hard-coded key, SSRF and SQLi on the `L04_test_mcp` branch only. None of that code is copied into this plan's files; the fixture JSON only cites line numbers.
## Handed off
- architecture-reviewer: `cli.ts` as the module's transport and composition root (no container); `eval` module has no `routes.ts` and is not registered; repository query that joins `reviews`→`findings` owned by another module's tables.
- security review: the CLI reads a file path and uuids from argv (local only, no network); error output must not include `DATABASE_URL`.

## Insights to record
- None yet. The first manual run may produce one (e.g. how stable LLM line citations are against a ±3 tolerance). If so, record it in `server/INSIGHTS.md`.

## Red-flags check
- [x] Every AC maps to at least one step or test (AC1 S1 · AC2–3 S2 · AC4–5 S3–S5 · AC6 all Done-whens)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; product choices are in *Decisions needed* (D7–D9)
- [x] Groups end type-checking; no parallel groups
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1 check n/a (pass 2)
- [x] Every step's *Skills to apply* is complete (the implementer reads only those)

## Handoffs → G2
From the G1 implementer run (2026-09-30, status done; S1–S2 done). Trivial deviations: S1 fixture paths keep the repo-relative `server/...` prefix; S2 `formatReport`/`scoreSuite` order agents (and duplicate lists) by the `lanes` key order (general, security, performance, test_quality, api_contract).
- `server/src/modules/eval/fixture.ts`: Zod schemas + types `Lane`, `EvalLocation`, `EvalIssue`, `ReviewEvalFixture`; `parseFixture(raw: unknown)` throws one `Error` listing every issue path.
- `server/src/modules/eval/helpers.ts`: `matchFinding(f, candidates, tolerance) → {issueId, exact} | null`, `scoreSuite(fixture, runs: AgentRunInput[]) → SuiteScore`, `formatReport(s)`; types `EvalFindingInput`, `AgentRunInput`, `AgentScore`, `SuiteScore`, `FindingMatch`.
- `AgentRunInput = { agentName, lane, runId, durationMs: number|null, costUsd: number|null, findings }` — the service supplies `lane`/`agentName` from `fixture.lanes`; map `agent_runs.duration_ms`/`cost_usd` to `number | null`.
- `AgentScore` is camelCase incl. `citationAccuracy` (D7); `SuiteScore` has `agents`, `duplicates`, `suiteRecall`, `missedBySuite`. Imports use `./x.js` (as `modules/intent`). Lane→agent names match `db/seed.ts`.
- Checks: eval unit tests pass; server typecheck; server unit 33 files / 385.

### Skills (G1)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S2 (pure helpers, no I/O imports) | |
| `zod` | on demand | S1 | |
| `typescript-expert` | on demand | S1, S2 | |

## Handoffs → verification (after G2)
From the G2 implementer run (2026-09-30, status done; S3–S5 done). Trivial deviations: S4 returns `warnings: string[]` (ambiguous agent name), printed by the CLI; S3 `findingsForRuns(prId, runIds)` also filters `reviews.pr_id`; S4 casts a stored category outside `FindingCategory` (→ unmatched).
- Files: `server/src/modules/eval/{repository,service,cli}.ts`, `server/package.json` (`eval:review`), `server/test/eval.it.test.ts`.
- For review: `cli.ts` is the transport + composition root (no container, no `routes.ts`); the repository joins `reviews` → `findings` (owned by another module). CLI argv (`--fixture`, `--workspace`, `--run`) parsed strict, run ids uuid-checked; errors print the message only.
- Manual run (dev DB, PR #12, head matched): 5 `eval_runs` rows written. Recall General 1/4, Security 3/5, Performance 0/2, Test Quality 1/1, API Contract n/a; **suite 7/12** (plan expected ~10/12). Missed: key-in-log, n-plus-one, deep-clone, average-nan, empty-catch.
- **Main-session diagnosis of the gap:** two of the five "misses" were real findings the matcher rejected — `n-plus-one`: Performance cited `routes.ts:24-35` (overlaps 29-38) but labelled it `bug`, fixture allows only `perf`; `empty-catch`: General cited `routes.ts:42-44`, the real `catch` is line 50 (fixture 50-52) — outside ±3. Model line citations on a new file drift by 2–8 lines (SQLi cited 17/20/22 vs real 24), and grounding can't catch it because a new file is one hunk covering every line. True suite recall ≈ 9/12.
- Checks: server typecheck; `eval.it.test.ts` 4; server unit 385.

### Skills (G2)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S3, S4, S5 | |
| `drizzle-orm-patterns` | on demand | S3 | |
| `zod` | on demand | S5 | |
| `typescript-expert` | on demand | S3–S5 | |
| `security` | on demand | S5 | |

## Verification log
### Wave 1 (2026-09-30)
- Full `.it` suite (main session, once after the last group of plans 08+09): 18 files / 121 tests, exit 0 (incl. `eval.it.test.ts` 4).
- security-reviewer (plans 08+09): PASS — no findings.
- plan-verifier: **complete — needs sign-off** — 77/80 met, no gaps. Needs sign-off: T4 (manual run 7/12 vs expected ~10/12; user's choice pending), R3 (plan file untracked — no baseline), R4 (no test-writer run). Handoff: `cli.ts:7` imports `DEFAULT_WORKSPACE_NAME` from `db/seed.ts` (for architecture review).
- architecture-reviewer (plans 08+09): PASS. Non-blocking for this plan: **F1 HIGH** `server/src/modules/eval/cli.ts:36` reads `process.env.DATABASE_URL` outside the chokepoints (fix: `loadConfig().databaseUrl` from `platform/config.ts`, or list the CLI as a chokepoint in `server/AGENTS.md`); **F2 MEDIUM** `modules/eval/` is a CLI-only module (no `routes.ts`) and takes the name `modules/index.ts:26` reserves for a future `eval` route module (doc or plan decision, no code change). Hand-offs checked and cleared: engine timers, size guard, `RunBus` controller, CLI as composition root, repository join.

### Wave 1 — user decisions (2026-09-30)
User: "по eval — варіант B".
- **CH1 (approved plan change to S1/S2, T4 gap):** the line tolerance becomes a field of the fixture instead of a constant in `helpers.ts` — `lineTolerance` in `server/src/modules/eval/fixtures/pr-export-planted.json` (schema in `fixture.ts`), set to **8** for this fixture (observed model line drift on a new file: 2–8 lines); `matchFinding`/`scoreSuite` take it from the fixture. Perf-lane issues (`n-plus-one`, `deep-clone`) also accept category `bug` (agents label N+1 as `bug`). The rest of D3 (same file, category in the allowed set, ≥1 keyword, one issue per finding) is unchanged. Done-when: unit tests cover a tolerance read from the fixture; re-run `pnpm eval:review` on the dev DB → `n-plus-one` and `empty-catch` now matched (expected suite recall ≈ 9/12; still missed: key-in-log, deep-clone, average-nan).
- R3, R4, F1, F2 and the plan 08 `pipeline.md` citations: not decided yet.

### Wave 1 — fix mode (2026-09-30)
Implementer fix mode, CH1 done. The tolerance was **already a fixture field** (`line_tolerance`, snake_case, read by `scoreSuite` at `helpers.ts:106`) — the main-session diagnosis wrongly called it a code constant; CH1 therefore needed no code change: `line_tolerance` 3 → 8 and `bug` added to the categories of `n-plus-one` and `deep-clone` in `pr-export-planted.json`, plus a new tolerance unit test in `server/test/eval-helpers.test.ts`. Field name kept as `line_tolerance` (the plan text said `lineTolerance`).
Checks: `eval-helpers` + `eval-fixture` 14 tests; server typecheck. Re-run `pnpm eval:review` (dev DB): **suite recall 9/12 (75%)** — General 2/4, Security 4/5, Performance 1/2, Test Quality 1/1, API Contract n/a; missed key-in-log, deep-clone, average-nan. 5 new `eval_runs` rows (the 5 rows of the earlier 7/12 run remain).

#### Skills (fix mode)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | CH1 | no layer change |

### Sign-off (2026-09-30)
User: "R3 підтверджую, R4 приймаю, F1 виправ, F2 відкласти".
- R3 signed off: after approval only the main session and the planner edited this plan file.
- R4 accepted: no test-writer run for this plan.
- F1 → main-session fix (`cli.ts` reads the DB URL via `loadConfig()` instead of `process.env`).
- F2 deferred to a later plan (CLI-only `modules/eval/` vs the future `eval` route module).

### Main-session fix + T4 re-run (2026-09-30)
- **main-session fix: F1** — `server/src/modules/eval/cli.ts`: `const url = loadConfig().databaseUrl;` (import from `../../platform/config.js`) replaces the direct `process.env.DATABASE_URL` read + manual check (`EnvSchema` validates it). `grep process.env src/modules/eval` → no matches.
- Checks: server typecheck exit 0; `eval-helpers` + `eval-fixture` + `eval.it` 18 tests; `pnpm eval:review` (dev DB, runs through the new `loadConfig` path) → **suite recall 75% (9/12)**, missed key-in-log / deep-clone / average-nan; duplicates sql-injection ×4, ssrf-webhook ×3, hardcoded-key ×2, paginate-off-by-one ×3 — matches the fix-mode run (T4 re-confirmed independently).
- Observation for plan 10: Test Quality precision shows 29% only because its lane has one planted issue — its other real test-gap findings count as unmatched; the fixture needs `acceptable_extras` (or more test-lane issues) before precision is compared across agents.
- Plan-text reconciliation note: CH1 names the field `lineTolerance`, the code uses `line_tolerance`; the S1 data line's `3` and the T4 row's "≈10/12" are superseded by CH1 (8 and ≈9/12).
- Correction (delta after F1): "`EnvSchema` validates it" above is wrong — `config.ts:16-18` gives `DATABASE_URL` a default (`postgres://devdigest:devdigest@localhost:5432/devdigest`). With F1 the CLI no longer fails on an unset URL; it falls back to the same local default the API server uses. plan-verifier (delta after F1): complete — needs sign-off, 83/86; only T4 open.

### Final (2026-09-30)
User: "давай закриємо план 9" — T4 accepted: manual `pnpm eval:review` = **9/12 (75%)** is the baseline for plan 10. Verification complete — needs sign-off, all items signed off (R3, R4, T4). Status → `done`. F2 deferred; plan-10 ideas recorded in root `INSIGHTS.md` → Open Questions (2026-09-30).
