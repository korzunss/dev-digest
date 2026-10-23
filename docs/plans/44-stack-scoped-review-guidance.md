# Development Plan: Stack-scoped review guidance
Status: in-progress
Save as: docs/plans/44-stack-scoped-review-guidance.md
Spec: specs/017-stack-scoped-review-guidance.md
Execution: multi-agent

## Spec traceability
| Spec AC | Covered by |
|---|---|
| AC-1, AC-4, AC-7 | S1–S3, S8 · `skill-paths.test.ts`, `skills.it.test.ts` |
| AC-2, AC-10, AC-13 | S3, S5 · `skill-paths.test.ts`, `skill-routing.test.ts` |
| AC-3 | S3, S8 · `skill-paths.test.ts` (1024-char fuzz), `skills.it.test.ts` |
| AC-5, AC-6 | S7, S8, S14 · `skills-helpers.test.ts`, `skills.it.test.ts` |
| AC-8 | S14, S15 · `applies-to.test.ts`, `SkillCard.test.tsx`, `SkillsTab.test.tsx` |
| AC-9 | S5, S9 · `skill-routing.test.ts`, `skills-in-prompt.it.test.ts` |
| AC-11, AC-12 | S4, S5 · `diff-parse.test.ts`, `skill-routing.test.ts` |
| AC-14–AC-17, AC-19–AC-24, AC-27, AC-47 | S6 · `run-grouping.test.ts` |
| AC-18, AC-18a | S5, S6, S9 · `run-grouping.test.ts`, `skills-in-prompt.it.test.ts` |
| AC-25, AC-26 | S6 · `run-reliability.test.ts` |
| AC-28, AC-29, AC-29a, AC-30 | S6, S9 · `skills-in-prompt.it.test.ts` |
| AC-30a | S9 · `agent-performance.it.test.ts` |
| AC-31, AC-32 | S16 · `RunTraceDrawer.test.tsx` |
| AC-33, AC-34 | S11 · `builtin-prompts.test.ts` |
| AC-35–AC-38, AC-36a | S11, S13 · `agents-sync-builtin.it.test.ts` |
| AC-39, AC-46 | S12 · `builtin-prompts.test.ts` (AC-46: docs) |
| AC-40, AC-41 | S10 · `eval-pipeline-runner.test.ts`, `eval-pipeline-skill-runner.test.ts` |
| AC-42 | S10, S17 · `eval-pipeline-skill-cases.it.test.ts`, skill `EvalsTab.test.tsx` |
| AC-43, AC-44 | S18 · `ExportWizard.test.tsx` (AC-44: `ci` module untouched) |
| AC-45 | S8 · `skills.it.test.ts` |

## Decisions needed
None open — see *Decisions recorded*.

## Decisions recorded
User answers, 2026-10-22:
- **TQ1–TQ5** defaults: groups reviewed serially (no new concurrency); single-pass groups may fail up to `groups − 1`, a size-guard group split per file uses `maxSkippedChunkFraction` inside it; `prompt_assembly` keeps the whole-diff assembly plus a new per-group list (files + skills); glob max 1024 chars with the PSR1 fuzz proof re-run at 1024; `run_skills` written after the engine returns (a run whose every call failed records none).
- **GAP1**: runner behaviour unchanged; `agent-runner/dist/` rebuilt and committed in a separate runner PR stacked on the feature branch, both PRs green, merged in order.
- **GAP2 (a)**: Agent Stats "Most-used skills" and "Tracked since" also mean "injected" (narrowed `run_skills`, no query change).
- **GAP3 (a)**: project-context docs inherited through a scoped skill follow that skill per group/chunk; docs attached to the agent go to every call.
- **GAP4**: built-in skill `node-typescript-review`, `source: manual`, enabled, `paths: **/*.ts, **/*.tsx, **/*.js, **/*.jsx, **/*.mjs, **/*.cjs`.
- GAP1–GAP4 sent to `spec-creator` (spec 017 back to `draft`, edited, re-approval pending).

- **D1–D6** as recommended: D1 A (caller-injected `matchesPath`, server picomatch `dot: true`; absent ⇒ every skill unscoped) · D2 A (new optional `scopedSkills`, `skills: string[]` kept) · D3 B (`files` unchanged, separate deleted/old-path list for grouping only) · D4 A (non-barrel `contracts/skill-scope.ts`) · D5 A (`modules/_shared/glob-shape.ts`) · D6 multi-agent.

- **Plan pass-2 risks R1–R5** (user, 2026-10-22): R1 (a) per-call grounding applies only to grouped single-pass calls created by Applies to; map-reduce chunks and runs with no scoped skill keep today's whole-diff grounding · R2 (a) "Outside Applies to" computed at read time from the skill's current globs · R3 accepted: old single-pass traces show one "All changed files" group · R4 checked by the main session: the five `docs/agent-prompts/*.md` mirrors equal `BUILTIN_AGENT_PROMPTS` except a trailing newline, so the mirror test compares with `trimEnd()` on both sides · R5 the `node-typescript-review` body is the JS/TS items removed from the four prompts (truthiness, `??`/`||`, async traps, async `forEach`, Fastify/Drizzle context); the user reviews the prompt/skill text diff at G5 review.

- **G5 review** (user, 2026-10-23): prompt texts accepted as written (`# Stack conventions` sentence, General "Concurrency bugs" bullet, Performance neutralisation). R5 amended (option a): `node-typescript-review` keeps only general JS/TS pitfalls (truthiness, `??`/`||`, async traps incl. async `forEach`, N+1 in a loop, `await` in a loop vs bounded concurrency, unbounded fan-out exhausting a DB pool/sockets/rate limits, event-loop blocking, buffering a whole streamed response); it drops every DevDigest-specific item (Fastify, SSE plugin, Drizzle/`inArray`, postgres-js, pgvector, p-queue, octokit, simple-git, ripgrep, zod, "~10" pool, vitest/`.it.test.ts`/testcontainers/RTL, `@devdigest/shared` vendoring). DevDigest's own rules come from its `AGENTS.md`/gotchas (Opt4). Spec AC-35 text updated. Fix id **G5-R5a** (implementer fix mode).
- **Verification sign-off** (user, 2026-10-23): D7 accepted — the `makeRe` catch in `skill-paths.ts` is unreachable with picomatch 4.0.4 default options (empty/non-string/>64 KiB only, all rejected earlier); kept as a defensive guard, no test.
- **Verification sign-off** (user, 2026-10-23): R3 accepted (no plan-approved checkpoint; the only step change after approval is G5-R5a, recorded above) · R4 accepted (break-check subjects restored with matching shasums; subject diffs show only planned edits; full suites passed afterwards). G1–G7 verification: complete. Plan stays in-progress until G8 (S19) is done and verified.
- **G8 sign-off** (user, 2026-10-23): D41 accepted (main session: two `npm run build` runs byte-identical by `cmp`); DC2 per option (a) — feature PR #44 → `main`, stacked runner PR #45 → feature branch; plan becomes `done` once CI is green on both.
- **Plan change E2E-09** (user, 2026-10-23): CI `e2e web / browser flows` failed on #44 in `09-skills` — the new seeded `node-typescript-review` skill pushed the `secret-leakage-gate` card below the ~1280×577 CI viewport, so `find text … click` did not navigate. Fix outside the steps' Files: `e2e/specs/09-skills.flow.json` gains one step that filters the rail via "Search skills…" before the click. Verified locally on a production client build: 12/12 flows. `main-session fix: E2E-09`.
- **Approved** by the user 2026-10-22 (after the R1–R5 correction round); implementation on branch `feat/stack-scoped-review-guidance` from `origin/main` d88682bf; the G8 runner PR goes on a branch stacked on it.

## Prerequisites
- Docker/Postgres for `.it` tests. No new dependency (`picomatch` is in `server/package.json:45`).
- Gotcha refs below: **SG** `server/insights/gotchas.md` · **CG** `client/insights/gotchas.md` · **RG** `reviewer-core/insights/gotchas.md` · **RI** root `INSIGHTS.md` (by entry date). Paths `…/` repeat the step's previous folder.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S3 | shared contract + mirror, server schema/migration, `_shared` glob helpers | — | `skill-scope.ts` exports; `paths` columns; `normalizeSkillPaths`, `skillPathProblem`, `createPathMatcher` |
| G2 | S4–S6 | reviewer-core | G1 | `ParsedDiff.deletedPaths`, `ScopedSkillInput`, `PathMatcher`, `ReviewInput.scopedSkills/matchesPath`, `ContextDoc.viaSkillIds`, `ReviewOutcome.calls` |
| G3 | S7–S8 | server skills module | G1 | `findByName`; `insert`/`update` take `paths`; DTOs carry `paths` |
| G4 | S9–S10 | server run executor + eval | G2, G3 | trace `prompt_groups`; skill case routes serve `EvalSkillSuiteCase` |
| G5 | S11–S13 | server prompts, seed, sync + docs mirrors | G3 | `NODE_TYPESCRIPT_SKILL`, `NODE_TS_SKILL_AGENTS`; user reviews the prompt/skill text diff before G5 is accepted (R5) |
| G6 | S14–S15 | client skills data + UI | G3 | `appliesToSummary`; hooks typed `ScopedSkill` |
| G7 | S16–S18 | client trace, skill evals, export warning | G4, G6 | — |
| G8 | S19 | agent-runner bundle, separate stacked PR (main session) | G1–G7 | — |

Groups run in order; none in parallel.

## Steps

### S1 — Add the non-barrel `skill-scope` contract and mirror it  [Contract]
- **Files:** `server/src/vendor/shared/contracts/skill-scope.ts` (create) · `client/src/vendor/shared/contracts/skill-scope.ts` (create, identical)
- **Change:** schemas + `z.infer` types: `SKILL_PATHS_MAX = 20`, `SKILL_PATH_MAX_CHARS = 1024`; `SkillPaths = z.array(z.string().max(1024)).max(20, 'Applies to holds at most 20 globs')`; `ScopedSkill = Skill.extend({ paths: z.array(z.string()) })`; `ScopedSkillVersion = SkillVersion.extend({ paths: z.array(z.string()).nullish() })`; `PromptGroup = { label, files: string[], skills: { name, version: int.nullish() }[], skipped: boolean }`; `RunTraceWithGroups = RunTrace.extend({ prompt_groups: z.array(PromptGroup).nullish() })`; `EvalSkillSuiteCase = EvalSuiteCase.extend({ outside_applies_to: z.boolean() })`. Bases from `../index.js`.
- **Layer / why here:** contract first, targeted mirror; non-barrel (D4).
- **Skills to apply:** `zod`, `typescript-expert`
- **Practices:** `.extend()` only; `.nullish()` for keys absent in stored docs; no `index.ts` edit; mirror = one new file, never the folder.
- **Known gotchas:** RI 2026-10-19 (non-barrel deep path); RI 2026-09-17 (copies drift); RI "TS2719 two different types".
- **Done when:** `git diff --quiet HEAD -- server/src/vendor/shared/index.ts client/src/vendor/shared/index.ts` · `diff server/src/vendor/shared/contracts/skill-scope.ts client/src/vendor/shared/contracts/skill-scope.ts` prints nothing · `cd server && pnpm typecheck`

### S2 — Add `paths` to `skills` and `skill_versions`
- **Files:** `server/src/db/schema/skills.ts` (modify) · `server/src/db/migrations/**` (generated only)
- **Change:** `skills.paths: text('paths').array().notNull().default(sql\`'{}'::text[]\`)` + `check('skills_paths_max', sql\`cardinality(paths) <= 20\`)`; `skillVersions.paths: text('paths').array()` nullable (NULL = pre-feature version ⇒ restores empty). Then `cd server && pnpm db:generate`.
- **Layer / why here:** schema; generated migration only.
- **Skills to apply:** `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`
- **Practices:** `TEXT[]` ordered list, no index (never queried by element); CHECK via `check()`; no `db:migrate`.
- **Known gotchas:** SG "A CHECK constraint goes in the schema via `check()`"; SG "Migrations are never applied on boot"; RI 2026-10-15 (worktrees share one Postgres); RI 2026-09-30 (auto-mode may block writing a migration — stop and report).
- **Done when:** one new generated `.sql` adds both columns and the check · `cd server && pnpm typecheck`

### S3 — Extract glob shape rules; add skill-path helpers
- **Files:** `server/src/modules/_shared/glob-shape.ts` (create) · `server/src/modules/_shared/skill-paths.ts` (create) · `server/src/modules/context/helpers.ts` (modify) · `server/src/modules/context/constants.ts` (modify) · `server/test/skill-paths.test.ts` (create)
- **Change:** move `globShapeProblem` (`context/helpers.ts:84-155`) and its three caps (`MAX_SEGMENT_WILDCARDS`, `MAX_DOUBLE_STARS`, `MAX_MULTI_WILDCARD_SEGMENTS`) to `glob-shape.ts`; `context` imports them from `_shared` (logic unchanged). `skill-paths.ts`: `normalizeSkillPaths(raw)` (trim, drop empty, strip one leading `./`, keep order — AC-7); `skillPathProblem(glob)` (empty, >1024, NUL, absolute/drive, negation incl. `picomatch.scan().negated`, `..` segment, `globShapeProblem`, `makeRe` failure; no `.md` rule); `createPathMatcher()` → `(path, globs) => boolean` with `picomatch(globs, { dot: true, nocase: false, windows: false })` cached per glob list.
- **Layer / why here:** shared pure helper for context, skills and the executor (D5).
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:** no I/O or `process.env`; `_shared` imports no adapter/db/other module.
- **Known gotchas:** SG "Validate a user-supplied glob's shape … prove it with a fuzz"; SG "`context-helpers.test.ts` < 50 ms failure is pre-existing flakiness".
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/skill-paths.test.ts test/context-helpers.test.ts` green; the new test covers AC-7, each rejection, dot-segment match, case sensitivity, and a fuzz of shape-valid 1024-char globs vs 2,000-segment paths within the bound `context-helpers.test.ts` uses.

### S4 — Report deleted files' old paths from the parser
- **Files:** `reviewer-core/src/diff/parse.ts` (modify) · `reviewer-core/src/index.ts` (modify) · `reviewer-core/test/diff-parse.test.ts` (modify)
- **Change:** return `ParsedDiff = UnifiedDiff & { deletedPaths: string[] }`; a `+++ /dev/null` file's path comes from its `--- a/<path>` line into `deletedPaths`; `files` unchanged (D3); renames keep the `+++` path (AC-11). Export the type.
- **Layer / why here:** pure core.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** `UnifiedDiff` in `adapters.ts` untouched; existing fixtures' `files` identical.
- **Known gotchas:** RI 2026-10-15 (bundle rebuilt only in S19); RI 2026-10-05 (core input change breaks server tests).
- **Done when:** `cd reviewer-core && npm run typecheck && npm test`; test asserts deleted → `deletedPaths` not `files`, rename → new path.

### S5 — Add pure skill routing and doc scoping
- **Files:** `reviewer-core/src/review/skill-routing.ts` (create) · `reviewer-core/src/prompt.ts` (modify) · `reviewer-core/src/index.ts` (modify) · `reviewer-core/test/skill-routing.test.ts` (create)
- **Change:** `ScopedSkillInput { id; name; version; body; paths }`, `PathMatcher`; `skillsForFile(skills, path, match)` → indexes in attached order, empty `paths` always in; `groupBySkillSet(paths, skills, match)` → `{ paths; skillIdx }[]` keyed by exact set, ordered by first file in diff order; `specsForCall(specs, injectedIds)` keeps docs without `viaSkillIds` plus those sharing an id. `ContextDoc.viaSkillIds?: string[]` (not rendered).
- **Layer / why here:** pure core logic (Purity NFR), matcher injected (D1).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** no imports beyond local types; deterministic order; never renders paths (AC-47).
- **Known gotchas:** RG "The only I/O allowed under `reviewer-core/src` is the `fetch` in `listModels()`".
- **Done when:** `cd reviewer-core && npm run typecheck && npm test`; test covers unscoped-only group, two-stack file, attached order, deleted path by old path, doc kept/dropped.

### S6 — Group single-pass calls and route skills per call
- **Files:** `reviewer-core/src/review/run.ts` (modify) · `reviewer-core/test/run.test.ts` (modify) · `reviewer-core/test/run-reliability.test.ts` (modify) · `reviewer-core/test/run-grouping.test.ts` (create)
- **Change:** `ReviewInput.scopedSkills?`, `matchesPath?`; `diff: UnifiedDiff & { deletedPaths?: string[] }`. No `scopedSkills` ⇒ `input.skills` as today; no `matchesPath` ⇒ all scoped skills count as unscoped. `selectMode` on the whole diff as today (AC-24). Single-pass: groups over `files` + `deletedPaths`; **one group ⇒ today's exact chunk** (`'all files'`, `diff.raw`, same logs and size guard); several ⇒ one call per group (`group <n>`, joined `sliceDiff`); a deleted-only group makes no call; a group over `maxSinglePass` with >1 file goes per file (AC-22), skip tolerance `floor(n × maxSkippedChunkFraction)` inside it; across groups `allowed = calls − 1` (AC-25/26). Map-reduce chunk skills via `skillsForFile` (AC-23). Every call: `memoryFor(call paths)`, `specsForCall` (AC-18/18a/19). Grounding (R1): only when single-pass split into ≥2 groups, ground each group's findings (including its per-file calls from the size guard) against that group's sub-diff (`{ raw: joined slices, files: group files }`) before `reduceReviews` (AC-27); one-group runs, runs with no scoped skill and map-reduce chunks keep today's single whole-diff `groundFindings` after the reduce. Logs: AC-20 line `Grouped <F> files into <G> review calls by skill set: <label>: <k> files · <names|no skills>; …`; AC-17 line `<label>: no skill matches its files — reviewed with no skills section`; skipped group lists its files (AC-25). `summarizeFindings` when >1 call ran (AC-21). New `ReviewOutcome.calls: { label; paths; skillIds; ok }[]`; `assembly` = whole-diff when >1 single-pass call (TQ3).
- **Layer / why here:** engine owns strategy, chunking, grounding.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** serial loop (TQ1); every call through `callWithDeadline`; existing `run.test.ts` cases pass unmodified.
- **Known gotchas:** RG "Missing findings mean the grounding gate did its job"; RG truncation re-roll then skip; RG "Every review LLM call goes through `callWithDeadline`"; RI 2026-10-05.
- **Done when:** `cd reviewer-core && npm run typecheck && npm test` · `cd server && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` · `run-grouping.test.ts` (MockLLMProvider): single-stack = 1 call with messages identical to a no-`scopedSkills` run; `.cs`+`.tsx` = 2 calls, own skills + diff, full file list in both; per-group repo rules; huge group per file, other group one call; map-reduce per-file skills; in a 2-group run a finding citing the other group's file is dropped by grounding; in map-reduce (with and without `scopedSkills`) a chunk finding citing another changed file's diff line is still kept, as today; AC-17/20 lines; `calls`. `run-reliability.test.ts`: one group fails ⇒ partial review with the other's findings; all fail ⇒ `ReviewChunksSkippedError`.

### S7 — Persist and version `paths` in the skills repository
- **Files:** `server/src/modules/skills/repository.ts` (modify) · `server/src/modules/skills/helpers.ts` (modify) · `server/test/skills-helpers.test.ts` (modify)
- **Change:** `InsertSkill.paths?`, `UpdateSkill.paths?`; insert stores + snapshots paths; update bumps + snapshots when `isVersionedChange` (renamed from `isBodyChange`; body changed or `paths` differ element-wise, AC-5); `snapshotVersion` writes `paths`; new `findByName(workspaceId, name)`. `toSkillDto` → `ScopedSkill`; `toSkillVersionDto` → `ScopedSkillVersion` (`paths: row.paths ?? null`).
- **Layer / why here:** queries in the repository, mapping in helpers.
- **Skills to apply:** `onion-architecture`, `drizzle-orm-patterns`, `typescript-expert`, `zod`
- **Practices:** awaited rows only; workspace filter on every query; row types from `db/rows.ts`.
- **Known gotchas:** SG "A row type derived from `db/schema` … goes in `repository.ts` or `db/rows.ts`".
- **Done when:** `cd server && pnpm typecheck` · `skills-helpers.test.ts` covers body-only, paths-only, reordered, unchanged.

### S8 — Validate, save and restore Applies to
- **Files:** `server/src/modules/skills/service.ts` (modify) · `server/src/modules/skills/routes.ts` (modify) · `server/test/skills.it.test.ts` (modify)
- **Change:** `CreateSkillBody` / `UpdateSkillBody` gain `paths: SkillPaths.optional()` (AC-4); service runs `normalizeSkillPaths`, then `skillPathProblem` per glob, throwing `ValidationError('Applies to: "<glob, ≤80 chars>" — <reason>')` before any write (AC-3); `restoreVersion` refuses only when body and paths both equal current, restores `snapshot.paths ?? []` (AC-6). `importPreview` untouched (AC-45).
- **Layer / why here:** shape in routes, rules in service, writes in repository.
- **Skills to apply:** `onion-architecture`, `fastify-best-practices`, `zod`, `typescript-expert`, `security`
- **Practices:** schema-first routes, no `parse` in handlers; stored skill unchanged on rejection.
- **Known gotchas:** SG "An empty body sent as `application/json` is rejected with 400"; SG "A hermetic `.it` test must not be able to reach a real API key".
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/skills.it.test.ts`: 21 globs → 422 with the limit; `../x`, `a**b` → 422 naming the glob, row unchanged; `./src/**` saved as `src/**`; paths-only change → v+1 with paths; pre-feature version restores `[]`; import-created skill with `paths:` front-matter stores `[]`.

### S9 — Route skills per call in the executor; record what was injected
- **Files:** `server/src/modules/reviews/run-executor.ts` (modify) · `server/test/skills-in-prompt.it.test.ts` (modify) · `server/test/agent-performance.it.test.ts` (modify)
- **Change:** `ResolvedSkills.blocks` gain `name`, `version`, `paths`; pass `scopedSkills` + `matchesPath: createPathMatcher()` instead of `skills`; `buildContextDocs` sets `viaSkillIds` (every enabled linking skill) on docs inherited only, not attached to the agent (AC-18a); `recordRunSkills` runs after `reviewPullRequest` returns, for skills in ≥1 `outcome.calls` entry, `tokens = count(body) × calls with it` (AC-29/29a); none if the engine throws (TQ5); trace typed `RunTraceWithGroups`, `prompt_groups` from `calls` (`skipped: !ok`, skills name + version) (AC-28).
- **Layer / why here:** application orchestration.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `zod`, `security`
- **Practices:** no new `db/schema` import; recording stays best-effort; user-facing facts in the `runLog.info` message.
- **Known gotchas:** SG "Never read `run_traces` straight after `waitForPrRuns`"; SG "only `msg` is persisted"; SG "A deferred/gated LLM stub must reject the PR-intent call"; SG "seeded PR #482 … empty diff".
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/skills-in-prompt.it.test.ts test/agent-performance.it.test.ts`: `**/*.cs` skill on a `.ts` PR absent from prompt, `run_skills`, Skill Stats pull rate and Agent Stats "Most-used skills" (AC-30a); mixed PR = 2 calls and unscoped skill `tokens` = body × 2; `prompt_groups` per call; doc inherited only via the unmatched skill absent; no-paths workspace = 1 call, same skills block.

### S10 — Route agent-suite cases like live reviews; flag skill cases
- **Files:** `server/src/modules/eval/types.ts`, `…/pipeline-runner.ts`, `…/pipeline-service.ts`, `…/pipeline-helpers.ts`, `…/skill-suite-service.ts`, `…/routes.ts` (modify) · `server/src/platform/container.ts` (modify) · `server/test/eval-pipeline-runner.test.ts`, `…/eval-pipeline-skill-runner.test.ts`, `…/eval-pipeline-skill-cases.it.test.ts` (modify)
- **Change:** `EvalAgentSkill`/`EvalSkill` gain `paths` (`container.ts:308,360`); `EvalAgentSnapshot.scoped?` built in `pipeline-service.snapshot`; `runCase` passes `scopedSkills` + `deps.matchesPath` for agent snapshots (AC-40), plain `skills` for `owner: 'skill'` (AC-41); `listCases`/`createCase` return `EvalSkillSuiteCase` with `outside_applies_to` = skill has paths and no parsed case-diff path (files + `deletedPaths`) matches; `GET/POST /skills/:id/eval-cases` respond with it (AC-42, scoring untouched).
- **Layer / why here:** eval services; deps wired in the composition root.
- **Skills to apply:** `onion-architecture`, `fastify-best-practices`, `zod`, `typescript-expert`
- **Practices:** new deps via the container getter; no `reviews` value imports; existing `skillRunTokenHash` inputs unchanged.
- **Known gotchas:** SG hermetic `.it`; onion step 6 (no foreign consumer ports).
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/eval-pipeline-runner.test.ts test/eval-pipeline-skill-runner.test.ts test/eval-pipeline-skill-cases.it.test.ts`: agent case on `.cs` omits a `**/*.ts` skill; skill case injects it; that skill case lists `outside_applies_to: true`.

### S11 — Neutralise four prompts; seed `node-typescript-review`
- **Files:** `server/src/db/seed-prompts.ts`, `server/src/db/seed-skills.ts`, `server/src/db/seed.ts`, `server/test/builtin-prompts.test.ts` (modify)
- **Change:** General, Test Quality, API Contract, Performance: Role line names no stack; each `# Stack context (assume this…)` block becomes `# Stack conventions` + "Rely on the provided skills and repo context for the stack's conventions; don't assume a language or framework they don't state." (assumption: wording); Security unchanged. Also move the JS/TS-specific items out of those four prompts (truthiness traps, `??` vs `||`, async traps incl. missing `await` and async `forEach`, Fastify/Drizzle/zod/octokit context); everything else stays. `seed-skills.ts`: `NODE_TYPESCRIPT_SKILL` (GAP4 values, type `convention`, body = the general JS/TS items removed from the prompts, de-duplicated, under per-reviewer headings, with no project-specific framework, library or package — R5 as amended at G5 review) and `NODE_TS_SKILL_AGENTS` (the four names). `seed.ts`: only when the workspace row was created in this run, insert the skill (+ v1 with paths) and append it last to the four agents, before the agent version snapshot block (AC-35/38).
- **Layer / why here:** seed data under `db/`.
- **Skills to apply:** `drizzle-orm-patterns`, `typescript-expert`
- **Practices:** seed stays idempotent; existing workspace gets nothing new.
- **Known gotchas:** SG "Migrations are never applied on boot … `db:seed` is idempotent".
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/builtin-prompts.test.ts`: the four prompts contain no `Stack context`, `Fastify`, `Drizzle`, `Node.js`, `forEach`; `NODE_TYPESCRIPT_SKILL.body` contains `forEach` and `??` and none of `Fastify`, `Drizzle`, `@devdigest`, `testcontainers`, `p-queue`, `octokit` (G5-R5a); `SECURITY_REVIEWER_PROMPT` unchanged in `git diff`. G5 review: the main session shows the user the prompt + skill text diff (`git diff -- server/src/db/seed-prompts.ts server/src/db/seed-skills.ts`) before G5 is accepted (R5).

### S12 — Mirror prompts in docs; document the repo-rules depth
- **Files:** `docs/agent-prompts/general-reviewer.md`, `…/performance-reviewer.md`, `…/test-quality-reviewer.md`, `…/api-contract-reviewer.md`, `…/README.md`, `reviewer-core/docs/pipeline.md` (modify) · `server/test/builtin-prompts.test.ts` (modify)
- **Change:** each mirror = the shipped text; README *Repo context* and `pipeline.md` repo-rules paragraph state that `AGENTS.md` / `insights/gotchas.md` are read only from the root and two directory levels below, ≤40 files, 12,000 chars per file, 8,000 per call (`reviews/constants.ts:40-49`) (AC-46); test asserts each of the five mirrors equals its `BUILTIN_AGENT_PROMPTS` entry with `trimEnd()` on both sides (AC-39; R4: mirrors differ only by a trailing newline today).
- **Layer / why here:** docs + guard test.
- **Skills to apply:** `typescript-expert`
- **Practices:** Security mirror untouched.
- **Known gotchas:** RI 2026-09-28 (Markdown wraps grep phrases).
- **Done when:** `cd server && pnpm exec vitest run test/builtin-prompts.test.ts` · `tr '\n' ' ' < docs/agent-prompts/README.md | grep -q 'two directory levels'`

### S13 — Create and attach the built-in skill in `agents:sync-builtin`
- **Files:** `server/src/modules/agents/service.ts`, `…/sync-builtin.ts`, `…/constants.ts`, `server/test/agents-sync-builtin.it.test.ts` (modify)
- **Change:** `AgentsService.ensureBuiltinSkill(workspaceId, def, { dryRun })` via `container.skillsRepo.findByName`/`insert` → `{ id: string | null; status: 'created' | 'would-create' | 'existing' }`, never modifying an existing same-named skill (AC-36a); `syncBuiltin` input `attachSkill?: { id: string | null; name }` appends it last in the same transaction if no link has that name, reports `attached`, counts as `changed`; CLI prints `node-typescript-review: created | would be created (dry run) | exists — attached unchanged`, then `<agent>: attached: node-typescript-review` (AC-36/37).
- **Layer / why here:** application service + CLI; skill writes via the container's skills repository.
- **Skills to apply:** `onion-architecture`, `drizzle-orm-patterns`, `typescript-expert`
- **Practices:** dry run writes nothing; no `skills/service` import.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/agents-sync-builtin.it.test.ts`: fresh seed links the four agents (last), not Security; re-seed after deleting the skill does not recreate it; dry run reports and changes nothing; sync creates + attaches, second sync unchanged; a user skill of that name with other body/paths is attached unchanged and reported.

### S14 — Add the Applies to field and summary helper
- **Files:** `client/src/lib/skills/applies-to.ts` (create) · `client/src/lib/skills/applies-to.test.ts` (create) · `client/src/lib/hooks/skills.ts` (modify) · `client/src/app/skills/[id]/_components/SkillEditor/_components/ConfigTab/ConfigTab.tsx`, `…/ConfigTab/helpers.ts`, `…/ConfigTab/ConfigTab.test.tsx` (modify) · `client/src/app/skills/[id]/_components/SkillEditor/_components/VersionsTab/VersionsTab.tsx`, `…/VersionsTab/VersionsTab.test.tsx` (modify) · `client/messages/en/skills.json` (modify)
- **Change:** hooks typed `ScopedSkill`/`ScopedSkillVersion` (`import type` from `@devdigest/shared/contracts/skill-scope.js`), update patch accepts `paths`; `appliesToSummary(paths)` → `null` (= "All files") or comma-joined globs; ConfigTab "Applies to" textarea (one glob per line), dirty check includes paths, 422 message inline; VersionsTab rows show each version's Applies to.
- **Layer / why here:** hook + component; helper in `lib/` (two features use it).
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** derive dirty state; every label via i18n; type-only shared imports.
- **Known gotchas:** CG "Import only types from `@devdigest/shared`"; CG "no `@testing-library/user-event`"; CG "targeted run: `pnpm exec vitest run <pattern>`".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run applies-to ConfigTab VersionsTab shared-type-only-imports`; ConfigTab test saves two globs and shows a 422 message.

### S15 — Show Applies to on skill cards and the agent's skills list
- **Files:** `client/src/app/skills/_components/SkillCard/SkillCard.tsx`, `…/SkillCard/SkillCard.test.tsx` · `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx`, `…/SkillsTab/SkillsTab.test.tsx` · `client/messages/en/skills.json`, `client/messages/en/agents.json` (all modify)
- **Change:** both show `appliesToSummary` or "All files" under the name (AC-8); order untouched (AC-9).
- **Layer / why here:** presentational.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** no new request; one formatter.
- **Known gotchas:** CG "multiple matches on i18n copy".
- **Done when:** `cd client && pnpm typecheck && pnpm test`

### S16 — Show per-call files and skills in the trace drawer
- **Files:** `client/src/components/run-trace-drawer/helpers.ts` (modify) · `client/src/components/run-trace-drawer/_components/PromptGroups/PromptGroups.tsx`, `…/PromptGroups/index.ts` (create) · `client/src/components/run-trace-drawer/_components/TraceBody/TraceBody.tsx` (modify) · `client/src/lib/hooks/trace.ts` (modify) · `client/src/components/run-trace-drawer/RunTraceDrawer.test.tsx` (modify) · `client/messages/en/runs.json` (modify)
- **Change:** `useRunTrace` typed `RunTraceWithGroups`; `promptGroupsOf(trace)` → `prompt_groups`, else one legacy group: files = `tool_calls` args when `meta === 'map-reduce'`, else one "All changed files" entry; skills from `### Skill: <name>` lines of `prompt_assembly.skills` (AC-32; R3 accepted); `PromptGroups` lists label, files, skills (name vN), skipped badge (AC-31).
- **Layer / why here:** pure helper + child of `TraceBody`.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** paths and names rendered as plain text.
- **Known gotchas:** CG "Mock a hook from its real initial value".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run run-trace-drawer`: two groups from `prompt_groups`, one legacy group for an old trace.

### S17 — Mark skill eval cases outside Applies to
- **Files:** `client/src/lib/hooks/eval.ts` · `client/src/app/skills/[id]/_components/SkillEditor/_components/EvalsTab/EvalsTab.tsx`, `…/EvalsTab/EvalsTab.test.tsx` · `client/messages/en/eval.json` (all modify)
- **Change:** skill-case hooks (`eval.ts:204,213`) typed `EvalSkillSuiteCase`; "Outside Applies to" badge beside the result when `outside_applies_to` (AC-42).
- **Layer / why here:** hook + component.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** type-only import; i18n badge.
- **Known gotchas:** CG "spread the real module first via `importActual`".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run EvalsTab`, badge asserted.

### S18 — Warn on Export to CI when an attached skill is scoped
- **Files:** `client/src/app/agents/[id]/_components/AgentEditor/_components/ExportWizard/ExportWizard.tsx`, `…/ExportWizard/ExportWizard.test.tsx` · `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/CiTab.test.tsx` · `client/messages/en/ci.json` (all modify)
- **Change:** `useAgentSkills(agent.id)` + `useSkills()`; if any attached skill has `paths`, a `role="status"` notice above the steps: Applies to is ignored in CI, every attached skill applies to every file there (AC-43); export payload untouched (AC-44).
- **Layer / why here:** component on existing hooks.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** flag derived from query data.
- **Known gotchas:** CG "When a component gains a request, find every test that mounts it … run the full `pnpm test`".
- **Done when:** `cd client && pnpm typecheck && pnpm test`; `ExportWizard.test.tsx` asserts the notice with a scoped skill and none without.

### S19 — Rebuild the runner bundle in the stacked runner PR (main session)
- **Files:** `agent-runner/dist/index.js` (regenerated only)
- **Change:** on a branch stacked on the feature branch: `cd agent-runner && npm run build && npm test`; commit `dist/` there only.
- **Layer / why here:** user rule (runner in its own PR) + spec NFR.
- **Skills to apply:** none
- **Practices:** never in the feature commit; feature PR merges first.
- **Known gotchas:** RI 2026-10-15 (bundle inlines shared + core).
- **Done when:** `cd agent-runner && npm run build && npm test` green; a second build leaves `git diff --exit-code agent-runner/dist/index.js` clean.

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `server/test/skill-paths.test.ts` (create) | unit | AC-3, AC-7, AC-10 | S3 |
| `reviewer-core/test/diff-parse.test.ts` | unit | AC-11, AC-12 | S4 |
| `reviewer-core/test/skill-routing.test.ts` (create) | unit | AC-2, AC-9, AC-13, AC-18a | S5 |
| `reviewer-core/test/run-grouping.test.ts` (create), `run.test.ts`, `run-reliability.test.ts` | unit | AC-14–AC-27, AC-47 | S6 |
| `server/test/skills-helpers.test.ts` | unit | AC-5 | S7 |
| `server/test/skills.it.test.ts` | integration | AC-1, AC-3–AC-7, AC-45 | S8 |
| `server/test/skills-in-prompt.it.test.ts`, `agent-performance.it.test.ts` | integration | AC-18a, AC-28–AC-30a | S9 |
| `server/test/eval-pipeline-runner.test.ts`, `eval-pipeline-skill-runner.test.ts` | unit | AC-40, AC-41 | S10 |
| `server/test/eval-pipeline-skill-cases.it.test.ts` | integration | AC-42 | S10 |
| `server/test/builtin-prompts.test.ts` | unit | AC-33, AC-34, AC-39 | S11, S12 |
| `server/test/agents-sync-builtin.it.test.ts` | integration | AC-35–AC-38 | S13 |
| `applies-to.test.ts` (create), `ConfigTab.test.tsx`, `VersionsTab.test.tsx`, `SkillCard.test.tsx`, `SkillsTab.test.tsx` | unit | AC-1, AC-6, AC-8, AC-9 | S14, S15 |
| `RunTraceDrawer.test.tsx`, skill `EvalsTab.test.tsx`, `ExportWizard.test.tsx`, `CiTab.test.tsx` | unit | AC-31, AC-32, AC-42, AC-43 | S16–S18 |

## Migrations & contracts
- `cd server && pnpm db:generate` after S2 (`skills.paths text[] NOT NULL DEFAULT '{}'` + `skills_paths_max`; nullable `skill_versions.paths`). The main session runs `pnpm db:migrate` before the full `.it` suite.
- New non-barrel `contracts/skill-scope.ts` in both copies (S1); neither `index.ts` changes; `UnifiedDiff` not edited.

## Out of scope
- `agent-runner/src/**`, `server/src/modules/ci/**` (only `dist/` in S19).
- `paths` in skill import/export front-matter; per-stack Agent Stats; repo-rules caps; Security prompt; `auto` rules; group concurrency.
- `server/src/modules/eval/replay.ts`, `replay-cli.ts` (keep plain `skills`); `mcp-server/`, `e2e/`, `client/src/vendor/ui/**`.

<!-- implementer-brief:end -->

## Context applied
- `server/insights/gotchas.md` → glob shape / PSR1 fuzz rule (S3); CHECK via `check()`, migrations not on boot (S2).
- root `INSIGHTS.md` → runner bundle staleness 2026-10-15, non-barrel contract 2026-10-19, copies drift 2026-09-17, core input change breaks server tests 2026-10-05 (S1, S4–S6, S19).
- `reviewer-core/insights/gotchas.md` → grounding drops, truncation re-roll, `callWithDeadline` (S6).
- `client/insights/gotchas.md` → type-only shared imports, tests mounting a component with a new request, no user-event (S14–S18).
- `docs/ideas/11-stack-scoped-review-guidance.md` → Opt1 + Opt4 chosen; Opt2/Opt5 not reopened.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | Context applied | — |
| `onion-architecture` | preload | S3–S10, S13 | — |
| `zod` | on demand (S1) | S1, S7–S10 | — |
| `typescript-expert` | on demand (S1) | all code steps | — |
| `drizzle-orm-patterns` | on demand (S2) | S2, S7, S11, S13 | — |
| `postgresql-table-design` | on demand (S2) | S2 | — |
| `fastify-best-practices` | on demand (S8) | S8, S10 | — |
| `security` | on demand (S3) | S3, S8, S9 | — |
| `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library` | on demand (S14) | S14–S18 | — |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `contracts/skill-scope.ts` (both copies) | ports | new |
| server | `db/schema/skills.ts`, migration | infrastructure | changed / new |
| server | `modules/_shared/glob-shape.ts`, `skill-paths.ts`; `context/helpers.ts`, `constants.ts` | shared helpers | new / changed |
| reviewer-core | `diff/parse.ts`, `review/skill-routing.ts`, `review/run.ts`, `prompt.ts` | core | changed / new |
| server | `modules/skills/*` | repository, service, routes | changed |
| server | `modules/reviews/run-executor.ts` | application | changed |
| server | `modules/eval/*`, `platform/container.ts` | application, composition root | changed |
| server | `db/seed*.ts`, `modules/agents/{service,sync-builtin,constants}.ts` | seed, application | changed |
| client | skill editor/cards, agent SkillsTab, trace drawer, skill EvalsTab, ExportWizard, hooks, `lib/skills/` | UI | changed / new |
| docs | `docs/agent-prompts/*`, `reviewer-core/docs/pipeline.md` | docs | changed |
| agent-runner | `dist/index.js` | bundle | rebuilt (S19) |

## Design notes
- **Pass-1 review (resolved).** TQ1–TQ5, GAP1–GAP4, REC1–REC4 and options D1–D6 were raised in pass 1 and are answered in *Decisions recorded*. Options were: D1 A matcher injected · B picomatch in core · C precomputed sets; D2 A parallel `scopedSkills` · B objects in `skills`; D3 A `oldPath` on `files` · B separate `deletedPaths`; D4 A non-barrel · B barrel edits; D5 A `_shared` · B cross-module import · C copy.
- **Compatibility path.** With one group the engine reuses the old chunk literally (`raw` diff, `'all files'`, old log lines); S6 pins identical messages with and without `scopedSkills`.
- **Per-call grounding (R1).** Only groups created by Applies to in a split single-pass run are grounded against their own sub-diff (AC-27); one-group runs, runs without scoped skills and map-reduce keep today's whole-diff gate, so a no-paths workspace's findings are unchanged.
- **Outside Applies to (R2).** Computed when the skill's case list is read, from its current globs; not stored on results.
- **Seed vs sync.** Seed adds the skill only to a workspace it creates (AC-38); existing workspaces get it only through `agents:sync-builtin` (AC-36).
- **Skill creation outside the per-agent transaction.** `ensureBuiltinSkill` runs once before the per-agent loop; a crash between leaves an unattached skill that the next sync attaches (idempotent).

## Risks & open questions
- **Neutral sentence wording** in S11 (`# Stack conventions` line) is the implementer's (assumption); the user sees it in the G5 text-diff review (R5).
- Mode rule re-checked against the real steps: migration + contract ⇒ `multi-agent` (19 steps, 4 packages + docs) — matches the recorded mode.
- Brief above the marker is ~33k characters, over the ~20k target: 19 steps across 4 packages; each group run reads its own steps only.

## Handed off
- architecture-reviewer: `_shared/glob-shape.ts` move, `run.ts` grouping complexity, eval container wiring of `matchesPath`, agents service using `container.skillsRepo`.
- security review: glob validation and match cost (S3 fuzz at 1024), paths never in the prompt as instructions (AC-47), sync never overwriting a user skill (AC-36a), trace drawer rendering paths as text.

## Insights to record
- `reviewer-core/INSIGHTS.md` · Codebase Patterns — `parseUnifiedDiff` drops deleted files from `files` (`reviewer-core/src/diff/parse.ts:40,78`); use `deletedPaths` for path-based logic — candidate after S4.

## Red-flags check
- [x] Every AC maps to at least one step or test (no-spec plans) — n/a, spec plan
- [x] Every spec AC-n has a row in *Spec traceability* with a step or test
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; technical choices are in *Decisions needed*, product gaps are GAPn
- [x] Groups end type-checking; parallel groups share no file (none parallel)
- [x] No group under 3 files / ~80 lines that could merge with a neighbour (G8 separate by user rule)
- [ ] The brief above the marker is under ~20,000 characters — ~33k, see *Risks*
- [x] Pass 1: n/a (pass 2)
- [x] Execution mode recommended per the D4 rule
- [x] Every step's *Skills to apply* is complete (the implementer reads only those)
- [x] `bash .claude/skills/sdd-engineering/scripts/sdd.sh plan-lint <plan>` prints `plan-lint: ok`

## Handoffs → G1
Status: done (2026-10-22). S1–S3 done; deviations trivial (fuzz uses a shape-aware generator plus three hand-built 1024-char globs; `SkillPaths` message built from the constants).

Handoff to the next group:
- `@devdigest/shared/contracts/skill-scope.js` exports `SKILL_PATHS_MAX` (20), `SKILL_PATH_MAX_CHARS` (1024) and the schemas/types `SkillPaths`, `ScopedSkill`, `ScopedSkillVersion`, `PromptGroup`, `RunTraceWithGroups`, `EvalSkillSuiteCase`. Server and client copies identical; neither `index.ts` changed.
- `server/src/db/schema/skills.ts`: `skills.paths text[] NOT NULL DEFAULT '{}'` (check `skills_paths_max`), nullable `skillVersions.paths`; migration `0032_sudden_wolfsbane.sql` generated, NOT applied (main session runs `pnpm db:migrate` before the `.it` suite). `db/rows.ts` row types not touched.
- `server/src/modules/_shared/skill-paths.ts`: `normalizeSkillPaths(raw)`, `skillPathProblem(glob): string | null`, `createPathMatcher(): (path, globs) => boolean` — empty globs match everything, cached per glob list, picomatch `dot: true, nocase: false, windows: false`.
- `server/src/modules/_shared/glob-shape.ts`: `globShapeProblem` + the three caps; `context/constants.ts` no longer exports `MAX_SEGMENT_WILDCARDS`, `MAX_DOUBLE_STARS`, `MAX_MULTI_WILDCARD_SEGMENTS` (no other importers).
- `server/test/skill-paths.test.ts` takes ~0.85 s (fuzz).

Verification: server typecheck ✅; `skill-paths` + `context-helpers` 47 ✅; server unit suite 79 files / 1104 ✅; trace-imports clean. Not run: client typecheck, `.it` tests.

## Handoffs → G2
Status: done (2026-10-22). S4–S6 done. Deviations (trivial): `run.test.ts` untouched (existing cases pass unchanged); skip tolerance inside a split group = `max(1, floor(n × fraction))` (0 with no fraction), across groups the run throws `ReviewChunksSkippedError` only when no call succeeded; the "group over the single-pass limit" test needs a custom `countTokens` (with chars/4 the whole-diff size guard picks map-reduce first, so the path is defensive).

Handoff to the next group (new `@devdigest/reviewer-core` exports):
- `ParsedDiff` = `UnifiedDiff & { deletedPaths: string[] }` from `parseUnifiedDiff`; `files` unchanged; a deleted file appears by its old path in `deletedPaths` only.
- `ScopedSkillInput` = `{ id, name, version: number, body, paths: string[] }`; `PathMatcher` = `(path, globs) => boolean`; helpers `skillsForFile`, `groupBySkillSet`, `specsForCall` (`review/skill-routing.ts`).
- `ReviewInput` gains `scopedSkills?` and `matchesPath?`; `diff` typed `UnifiedDiff & { deletedPaths?: string[] }`. With `scopedSkills` the flat `skills` is ignored; each `body` is the exact prompt string, so the caller renders it (`renderSkillBlock`, `### Skill: <name>`) as for `skills` today. Without `matchesPath` every scoped skill is unscoped.
- `ContextDoc.viaSkillIds?: string[]` (never rendered): a doc carrying it goes only to calls that include one of those skill ids.
- `ReviewOutcome.calls: { label; paths; skillIds; ok }[]` = attempted LLM calls; single-pass labels `'all files'` (one group) or `'group n'`, per-file calls inside a split group use the file path, map-reduce labels are paths; `skillIds` `[]` without `scopedSkills`; `ok: false` = skipped.
- `outcome.assembly`: the single call's assembly when one call ran; otherwise the whole-diff assembly with the union of applicable skills.
- Run-log lines: `Grouped <F> files into <G> review calls by skill set: group n: k files · <names|no skills>; …` and `<label>: no skill matches its files — reviewed with no skills section`.
- ≥2 single-pass groups ⇒ per-group grounding; map-reduce and one-group runs keep whole-diff grounding (`run-grouping.test.ts` "map-reduce … keeps whole-diff grounding").
- `outcome.skipped` / `chunks` are per call (a skipped group = one entry `group n`); summary and "Reviewed X/Y files" count files.

Verification: reviewer-core typecheck ✅, 15 files / 249 tests ✅; server typecheck ✅, unit 79 files / 1104 ✅.

## Handoffs → G3
Status: done (2026-10-22). S7–S8 done. Deviations (trivial): `isBodyChange` renamed `isVersionedChange` (only importers updated); `skills-helpers.test.ts` fixtures gained `paths`; restore refusal reads "That version is already the current body and Applies to."

Handoff to the next group:
- `SkillsRepository.findByName(workspaceId, name): Promise<SkillRow | undefined>` (new, for S13).
- `InsertSkill.paths?` / `UpdateSkill.paths?` take normalised globs; `insert` defaults `paths` to `[]` and snapshots v1 with them. The repository does NOT validate — S13 `ensureBuiltinSkill` and the seed must pass clean globs.
- `SkillsService.create` / `update` take raw `paths`, run `normalizeSkillPaths` + `skillPathProblem`, throw `ValidationError('Applies to: "<glob ≤80>" — <reason>')` before any write.
- `toSkillDto` → `ScopedSkill`, `toSkillVersionDto` → `ScopedSkillVersion` (`paths: row.paths ?? null`); service return types follow, `list()` still adds rollups.
- Restore refuses only when body AND paths equal the current values; a null-paths (pre-feature) version restores `[]`.

Verification: server typecheck ✅; `skills-helpers` 18 ✅; `skills.it.test.ts` 40 ✅ (its own `startPg` DB is migrated; local DB untouched); unit 79 files / 1106 ✅; trace-imports `modules/skills` clean.

## Handoffs → G4
Status: done (2026-10-22). S9–S10 done; `pipeline-helpers.ts` needed no edit (`skillSnapshot` leaves `scoped` unset, as AC-41 needs). Deviations (trivial): `paths: []` added to fixtures in `eval-pipeline-skill-service.test.ts`, `eval-pipeline-views.test.ts`, `eval-pipeline-helpers.test.ts`; `PUT /eval-cases/:id` and `POST /eval-cases/:id/runs` still answer plain `EvalSuiteCase` (no `outside_applies_to` on a single-case run response — G7 must refetch the list or not rely on it there); a doc gets `viaSkillIds` only when its path is not also attached to the agent; `specs_read` still lists every read doc, not per call.

Handoff to the next group:
- `run-executor.ts`: `ResolvedSkills.blocks` carry `name`, `version`, `paths`; the executor passes `scopedSkills` + `matchesPath: createPathMatcher()` (only when the agent has skills); `recordRunSkills(runId, skills, outcome.calls, runLog)` runs after the engine — `tokens = count(rendered block) × calls containing it`, no row for a skill in no call, none on an engine throw.
- Trace typed `RunTraceWithGroups` with `prompt_groups: { label, files, skills: [{ name, version }], skipped }[]`, one per `outcome.calls` entry; the trace route has no response schema, so it reaches the client as is.
- Eval: `EvalAgentSnapshot.scoped?` (agent snapshots only), `CaseRunnerDeps.matchesPath?`, `matchesPath` on both eval service deps (wired in `container.ts`). `GET`/`POST /skills/:id/eval-cases` respond `EvalSkillSuiteCase` with `outside_applies_to`, computed at read time from current globs against the case diff's `files` + `deletedPaths`.

Out-of-plan observation: `server/test/skill-paths.test.ts` "every accepted glob matches within 50 ms" failed once at 53.6 ms under full-suite load, passed on re-runs — load-sensitive timing (watch in the full run; candidate for test-writer to harden).

Verification: server typecheck ✅; unit 79 files / 1108 ✅; related `.it` (skills-in-prompt, agent-performance, eval-*, multi-agent-run, reviews, review-repo-rules, context-run-order, run-cost, intent-review) 27 files / 273 ✅ on own `startPg` DB. Not run: trace-imports for reviews/eval (checked by hand).

## Handoffs → G5
Status: done (2026-10-23). S11–S13 done; G5 review gate passed: user accepted the prompt texts and chose option (a) for the skill body, applied as fix G5-R5a (`NODE_TYPESCRIPT_SKILL` keeps only general JS/TS pitfalls under Correctness / Performance; description "General Node.js / TypeScript pitfalls for JS/TS files."; test asserts no `Fastify`, `Drizzle`, `@devdigest`, `testcontainers`, `p-queue`, `octokit`).

Handoff to the next group:
- `NODE_TYPESCRIPT_SKILL` / `NODE_TS_SKILL_AGENTS` in `server/src/db/seed-skills.ts`; `seed.ts` inserts the skill (+ v1 with paths) only for a newly created workspace; `syncBuiltin` returns `attached` and creates or attaches the skill outside the per-agent transaction (AC-36/36a).
- No client-facing contract change in G5; the client sees the skill as an ordinary skill with `paths`.

Verification: server typecheck ✅; `builtin-prompts.test.ts` 26 ✅; `agents-sync-builtin.it.test.ts` 16 ✅; related `.it` 122 ✅; unit ✅ except the known `context-helpers` "<50 ms" timing flake.

## Handoffs → G6
Status: done (2026-10-23). S14–S15 done. Deviations (trivial): "All files" / "Applies to" copy under `skills.appliesTo.*`, reused by the agent SkillsTab via the `skills` namespace (`agents.json` untouched); type-only edits outside Files to compile: `SkillEditor.tsx` (+ `paths: []` in `SkillEditor.test.tsx` fixture), `SkillsListView.tsx`, `SkillsRail/helpers.ts` (`filterSkills` generic).

Handoff to the next group:
- `client/src/lib/skills/applies-to.ts`: `appliesToSummary(paths)` (null for empty/missing), `pathsToText`, `textToPaths`.
- `client/src/lib/hooks/skills.ts` hooks typed `ScopedSkill` / `ScopedSkillVersion` via `import type` from `@devdigest/shared/contracts/skill-scope.js` (subpath, not the barrel); S18 reads `.paths` from `useSkills()` / `useAgentSkills()`.
- "All files" copy = `skills.appliesTo.all`; tests mounting skill components need the `skills` messages.
- Review note: Applies to text renders as plain React text; the server 422 message is shown as-is.

Verification: client typecheck ✅; targeted 13 files / 139 ✅; full client `pnpm test` 126 files / 887 ✅.

## Handoffs → G7
Status: done (2026-10-23). S16–S18 done. Deviations (trivial): S17 badge lives in the shared `client/src/components/eval-suite/CaseRow.tsx` (row renderer; `EvalsTab.tsx` needed no edit, hook retyped); S16 `run-trace-drawer/styles.ts` group styles, groups section open by default; legacy trace (no `prompt_groups`) → one group (map-reduce: files from `tool_calls` args, else "All changed files"; skill names parsed from `### Skill: <name>` lines, no version); S18 `CiTab.test.tsx` unchanged (mocks `ExportWizard`).

Handoff to the next group:
- G8 (runner `dist/` rebuild on a stacked branch) — nothing client-side left.
- Open for test-writer / verifier: the G4 note that single-case eval responses lack `outside_applies_to` — confirm the client refetches the case list after a single-case edit/run.
- Review notes: paths and skill names render as plain React text; new type-only imports use the `@devdigest/shared/contracts/skill-scope.js` subpath.

Verification: client typecheck ✅; full client `pnpm test` 126 files / 891 ✅.

## Skills
| Group | Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|---|
| G1 | `onion-architecture` | preload | S3 | |
| G1 | `zod` | on demand | S1 | |
| G1 | `typescript-expert` | on demand | S1, S3 | |
| G1 | `drizzle-orm-patterns` | on demand | S2 | |
| G1 | `postgresql-table-design` | on demand | S2 | |
| G1 | `security` | on demand | S3 | |
| G2 | `onion-architecture` | preload | S4–S6 (no I/O, `process.env`, `fetch`; grep-checked) | |
| G2 | `typescript-expert` | on demand | S4–S6 | |
| G3 | `onion-architecture` | preload | S7, S8 | |
| G3 | `drizzle-orm-patterns` | on demand | S7 | |
| G3 | `typescript-expert` | on demand | S7, S8 | |
| G3 | `zod` | on demand | S7, S8 | |
| G3 | `fastify-best-practices` | on demand | S8 | |
| G3 | `security` | on demand | S8 | |
| G4 | `onion-architecture` | preload | S9, S10 | |
| G4 | `typescript-expert` | on demand | S9, S10 | |
| G4 | `zod` | on demand | S9, S10 | |
| G4 | `security` | on demand | S9 | |
| G4 | `fastify-best-practices` | on demand | S10 | |
| G5 | `onion-architecture` | preload | S11–S13 (seed data under `db/`, sync via container repos) | |
| G5 | `drizzle-orm-patterns` | on demand | S12, S13 | |
| G5 | `typescript-expert` | on demand | S11–S13 | |
| G6 | `onion-architecture` | preload | — | client-only group |
| G6 | `frontend-architecture` | on demand | S14, S15 | |
| G6 | `react-best-practices` | on demand | S14, S15 | |
| G6 | `next-best-practices` | on demand | S14, S15 | |
| G6 | `react-testing-library` | on demand | S14, S15 | |
| G6 | `typescript-expert` | on demand | S14, S15 | |
| G7 | `onion-architecture` | preload | — | client-only group |
| G7 | `frontend-architecture` | on demand (opening part only) | S16–S18 | |
| G7 | `react-best-practices` | on demand (opening part only) | S16–S18 | |
| G7 | `next-best-practices` | on demand (opening part only) | S16–S18 | |
| G7 | `react-testing-library` | on demand (opening part only) | S16–S18 | |
| G7 | `typescript-expert` | on demand (opening part only) | S16–S18 | |
| G1 | `typescript-expert` | on demand (fix SK2) | S2 (checked: `text('paths').array()` infers `string[]`; no change) | |
| G5 | `drizzle-orm-patterns` | on demand (fix SK11) | S11 (checked: seed insert uses `insert().values().returning()`; no change) | |
