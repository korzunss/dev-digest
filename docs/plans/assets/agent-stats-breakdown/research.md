# Repo research — SPEC-16 agent Stats breakdown panels: data sources, query reuse, client components

Researcher report for `specs/016-agent-stats-breakdown.md`, saved verbatim by the main session (the researcher has no Write tool). Date: 2026-10-20.

## Answer (per question)

1. **run_traces and "counted runs".**
   - `MemoryPulled` is `{ pr?: int|null|undefined, text: string }`. In `RunTrace` it is `memory_pulled: z.array(MemoryPulled)`, required, not nullish.
   - There are exactly two builders of `memory_pulled: []`, at `run-executor.ts:438` and `:729` (the second is inside `traceFromBuffer`, the failure path).
   - There is one writer, `saveRunTrace` (`reviews/repository/run.repo.ts:189`, upsert on PK `run_id`). It is called at `run-executor.ts:122`, `:446` and `:469`.
   - The trace is written for local done runs (`:446`), local failed or cancelled runs (`:122`, `:469`) and never for CI runs.
   - There is no index beyond the PK on `run_id`.
   - Spec 015's "counted run" is the `scope()` helper plus `r.status = 'done'`, quoted under "Query predicates to reuse" below.
2. **run_skills to skills.**
   - The current name is `skills.name`, reached by joining `skills s ON s.id = rs.skill_id`.
   - `ON DELETE CASCADE` is confirmed on both FKs of `run_skills`.
   - The skills-repository queries are not reusable.
   - There is no index path for "earliest `ran_at` of a done local run with a run_skills row", so it is a scan. The plan 42 perf test seeds no `run_skills` or `run_traces`, so there is no size evidence.
3. **findings to runs.**
   - The path is `agent_runs.id = reviews.run_id` then `reviews.id = findings.review_id`.
   - `severity` and `category` are plain `text NOT NULL`. No CHECK in any migration.
   - Spec 015 M-7 counts all finding kinds and joins exactly as above.
4. **Time bucketing.**
   - Plan 42 validates `tz` in the service against `pg_timezone_names` and binds it as a parameter. A Zod regex also guards it.
   - Windows are rolling 24h and 30×24h instants, built on the client. Recommendation: bucket in SQL, on the local wall-clock (details below).
5. **Client components.**
   - The vendored ui has `Donut`, `BarRow` and `ProgressBar`. It has no stacked or vertical bar chart. `Donut` cannot show a centre total, a `count · %` legend or per-row legend control beyond a number.
   - The repo's precedent is `CostDonut`, a local recharts donut written because the vendored legend "can only print a number".
   - The skill `helpers.ts` is importable by relative path but is colocated under `skills/[id]/...`. Moving the shared pieces to a neutral place is cleaner.
6. **Agent StatsTab.** The tab makes up to 3 requests today (stats, runs page 1, and runs-count only in the empty state). The 4th hook fits beside `useAgentPerfStats`, and the panels must render only in the final `else` branch.
7. **Contract placement.** Adding schemas to `contracts/agent-performance.ts` does not change `agent-runner/dist`, provided nothing in the barrel starts importing that file.
8. **Colours and i18n.** Existing maps are `SEVERITY_META` / `severityColor` (`client/src/lib/severity.ts`) and `CATEGORY_COLOR` (skill StatsTab `constants.ts`). `agentPerformance.json` is a nested, single-locale file with ICU plurals.

**Confidence:** high for what the code does. Medium for the SQL bucketing recommendation (inference, not run).

## Evidence

| # | Claim | Kind | Where | What it says |
|---|---|---|---|---|
| 1 | MemoryPulled shape | fact | `server/src/vendor/shared/contracts/trace.ts:91-95`, `:138` | `z.object({ pr: z.number().int().nullish(), text: z.string() })`; `RunTrace.memory_pulled: z.array(MemoryPulled)` |
| 2 | Client copy of trace.ts differs (comments only in the part diffed) | fact | `diff server/.../trace.ts client/.../trace.ts` | Only comment lines 74-77 differ in the first 20 diff lines read |
| 3 | Memory is always empty | fact | `run-executor.ts:438` (done path), `:729` (`traceFromBuffer`) | `memory_pulled: []` |
| 4 | Single trace writer | fact | `run.repo.ts:189-194`; callers `run-executor.ts:122`, `:446`, `:469` | `insert(runTraces).onConflictDoUpdate`; no other insert in `server/src` |
| 5 | Failed and cancelled runs also get a trace | fact | `run-executor.ts:122-124`, `:467-470` | `saveRunTrace(... traceFromBuffer(...))` in failure/catch blocks; done-path trace saved after `completeAgentRun` (`:386` vs `:446`) |
| 6 | CI runs write no trace and no run_skills | fact | `ci/repository.ts:279`, `:315-335` | Comment "no `run_skills`"; insert `agent_runs` with `source: 'ci'`, no trace call |
| 7 | run_traces has only a PK index | fact | `db/schema/runs.ts:98-103` | `run_id` PK + FK cascade |
| 8 | agent_runs indexes | fact | `db/schema/runs.ts:53-67` | `agent_runs_pr_idx`, `agent_runs_agent_idx`, `agent_runs_multi_agent_run_idx`, partial `agent_runs_done_agent_ran_idx(agent_id, ran_at DESC) WHERE status='done'`; no `workspace_id`/`ran_at`-only index |
| 9 | Plan 42 chose no index | fact | `server/test/agent-performance-perf.it.test.ts:20`; `docs/plans/42-agent-performance.md:55` (D5 A) | "no `(workspace_id, ran_at)` index on `agent_runs`" |
| 10 | Perf test size | fact | `agent-performance-perf.it.test.ts:36-48` | 20 agents × 10 000 done local runs over 29 days (200 000); seeds no `run_skills`, `run_traces`, `reviews`, `findings` |
| 11 | run_skills schema | fact | `db/schema/runs.ts:80-95`; `db/migrations/0014_typical_lifeguard.sql:13,18-20` | PK `(run_id, skill_id)`; `run_skills_skill_idx(skill_id)`; both FKs cascade |
| 12 | `skills.name` | fact | `db/schema/skills.ts:17-47` | `text NOT NULL`; `skills_ws_idx(workspace_id)` |
| 13 | run_skills written for local runs only, best-effort, only when skills exist | fact | `run-executor.ts:295`, `:580-598`; `skills/repository.ts:298-316` | Early return if `skills.blocks.length === 0`; failure only logged; `onConflictDoNothing` |
| 14 | Skills repository run filter | fact | `skills/repository.ts:319-326` | `workspace_id = ws AND status='done' AND source='local' AND ran_at >= since`; no upper bound, no agent filter |
| 15 | Skills repository queries are per-skillId | fact | `skills/repository.ts:238-290` | `completedRunCount`, `runCountsBySkill`, `findingsBySkill` |
| 16 | reviews.run_id has no FK, has an index | fact | `db/schema/reviews.ts:25-38` | `reviews_run_idx(run_id)`; `reviews.kind` is `summary` or `review` |
| 17 | findings columns | fact | `db/schema/reviews.ts:41-65`; `0000_init.sql:148-149` | `review_id` FK cascade, `findings_review_idx`; `severity`, `category`, `kind` are `text NOT NULL` (`kind` default `'finding'`); no CHECK |
| 18 | Contract enums | fact | `shared/contracts/findings.ts:11,26,29-35` | `Severity = CRITICAL, WARNING, SUGGESTION`; `FindingCategory = bug, security, perf, style, test`; `FindingKind = finding, secret_leak, lethal_trifecta, phantom, hook`; DB enforces none |
| 19 | 015 M-7 implementation | fact | `specs/015-agent-performance.md:108-111`; `agent-performance/repository.ts:93-109` | `agent_runs r JOIN reviews rv ON rv.run_id = r.id JOIN findings f ON f.review_id = rv.id WHERE r.status='done' AND scope(...)`; no kind/decision filter |
| 20 | tz handling | fact | `repository.ts:55-59`; `service.ts:195-198`; `contracts/agent-performance.ts:26-31` | `pg_timezone_names` check; `ValidationError('Unknown time zone')`; Zod regex `^[A-Za-z0-9_+\-/]+$`, max 64 |
| 21 | Window computation | fact | `client/src/lib/period.ts:104-124`; `helpers.ts:25-52` | 1d `now-24h`, 30d `now-30×24h`; custom local midnight to next local midnight capped at `now`; server re-checks ±`CLOCK_SKEW_MS`, custom ≤ 365 days |
| 22 | Existing bucket SQL | fact | `repository.ts:134-163` | `generate_series(date_trunc(unit, from AT TIME ZONE tz), ...)`; `to_char(..., 'YYYY-MM-DD"T"HH24:MI')`; LEFT JOIN fills empty buckets |
| 23 | Vendored charts | fact | `client/src/vendor/ui/charts/index.ts` | `Sparkline`, `LineChart`, `Donut`, `BarRow`, `MetricCard`; no stacked/vertical bars; `primitives/ProgressBar.tsx` (`ProgressBar`, `PercentProgress`) |
| 24 | Donut API | fact | `charts/Donut.tsx:5-27` | `DonutSegment {label, value, color}`; props `segments`, `size=130`, `stroke=22`, `valuePrefix="$"`, `formatValue?`; no centre slot; legend lists every segment incl. 0 |
| 25 | BarRow API | fact | `charts/BarRow.tsx:4-17` | `{label, value, max, color?, suffix?}`; grid 150px / 1fr / 70px; label truncated by CSS, no `title` |
| 26 | ProgressBar API | fact | `primitives/ProgressBar.tsx:3-16` | `{value (0-100), color?, height=6, bg?}` |
| 27 | Local donut precedent | fact | `agent-performance/_components/CostBreakdown/CostDonut.tsx:1-3` | Local recharts donut; `client/package.json:22` recharts ^2.15.0 |
| 28 | Skill donut helpers | fact | `skills/[id]/.../StatsTab/helpers.ts:19-35`; `constants.ts:15-27`; `StatsTab.tsx:89` | `donutSegments` filters > 0, sorts desc; `formatSegmentValue` = `toLocaleString("en-US")`; `CATEGORY_COLOR` security→`--crit`, bug→`--warn`, perf→`--info`, style→`--sugg`, test→`--ok`; fallback `--text-muted`; `DONUT_SIZE` 140 |
| 29 | Severity colours | fact | `client/src/lib/severity.ts:12-31` | `SEVERITY_META` `--crit`/`--warn`/`--sugg`, labelKeys under `prReview.severity` (`messages/en/prReview.json:34-37`); `severityColor` → `--info` for `INFO`, `--text-muted` otherwise; `vendor/ui/primitives/tokens.ts:7-22` has INFO; `CAT` has no colour |
| 30 | CSS tokens | fact | `vendor/ui/styles.css:25-35`, `:64-74` | `--crit/--warn/--sugg/--info/--ok` + `-bg`, both themes |
| 31 | Agent StatsTab structure | fact | `agents/[id]/.../StatsTab/StatsTab.tsx:48-176` | loading, 404, error, `figures.runs === 0` → `PerfEmptyState` (AC-25), else tiles + `<RunHistory/>` (`:171`); runs-count only in empty state on non-30d (`:56`) |
| 32 | Hooks | fact | `client/src/lib/hooks/agent-performance.ts:42-48` | key `["agent-performance","stats",agentId,periodKey,tz]`; window resolved in `queryFn`; `qs()`; `enabled` flag |
| 33 | Request cap test | fact | `StatsTab.test.tsx:88-101` | `/stats?` count 1, no `runs-count`, `paths().length <= 3`; new path must not be miscounted by the `/stats?` filter |
| 34 | Contract outside barrel; copies identical | fact | `diff` of both `agent-performance.ts` (empty); `contracts/agent-performance.ts:3-8` | Not re-exported from `index.ts` |
| 35 | agent-runner does not reference that file | fact | `rg 'agent-performance' agent-runner` empty; `agent-runner/src/core.ts:13`, `main.ts:9`; `scripts/build.mjs:27` | Bundle inlines what the barrel reaches |
| 36 | Deep-path rule | fact | `INSIGHTS.md:304-310` | Client `import type`; prove with `git diff --quiet HEAD -- */vendor/shared/index.ts`; `shared-type-only-imports.test.ts` matches deep paths |
| 37 | Routes | fact | `agent-performance/routes.ts:36-53` | Response schemas declared; `getContext` then `container.agentPerformance.<m>` |
| 38 | i18n | fact | `client/messages/en/agentPerformance.json`; `client/src/i18n/request.ts:15-24` | One `en` locale; groups `period`, `tiles`, `cost`, `accept`, `sparkline`, `table`, `empty`, `breakdown`, `runHistory`, `card`, top-level `statsLoadError`, `retry`; ICU plurals |

## Query predicates to reuse (spec 015, from `agent-performance/repository.ts`)

```
scope(alias): r.workspace_id = $ws::uuid
  AND r.ran_at >= $from::timestamptz AND r.ran_at < $to::timestamptz [AND r.agent_id = $agent::uuid]   (:48-53)
counted run = the above AND r.status = 'done'   (e.g. :102, :156, :174, :215)
```

- No `source` filter, so both local and CI runs count.
- A "counted local run" (SPEC-16) = the above `AND r.source = 'local'` (same meaning as `windowedRuns` in `skills/repository.ts:319-326`, which has no upper bound).
- Return timestamps with the existing `isoMs(...)` / `to_char` pattern, never raw `timestamptz`.

## How it works (recommended shapes, inference)

1. **Skills panel.** Denominator from `agent_runs`; skills from `run_skills rs JOIN skills s ON s.id = rs.skill_id JOIN agent_runs r ON r.id = rs.run_id`; both with scope + `status='done'` + `source='local'` + `r.ran_at >= skills_tracked_since`. Group by `s.id, s.name`, count `rs.run_id` (exact thanks to the PK). Agent is `r.agent_id`, not the attachment (AC-12). *Skills tracked since* = `min(r.ran_at)` over `run_skills JOIN agent_runs` with workspace + done + local; workspace-wide.
2. **Memory panel.** Denominator: counted local runs `JOIN run_traces rt ON rt.run_id = r.id`. Entries: `jsonb_array_elements(coalesce(rt.trace->'memory_pulled','[]'::jsonb))`, grouped by `(elem->>'text', elem->>'pr')`, counting distinct runs. Tests must seed traces, since the array is always empty today.
3. **Findings.** Reuse the M-7 join (`repository.ts:99-102`); group by `f.category` and by `(bucket, f.severity)`.

## Consequences for the task at hand

- **Do not reuse the skills-repository methods** (keyed by `skillIds`, `since` only, no agent/upper bound). New SQL goes in `agent-performance/repository.ts` (drizzle/schema imports only in `repository.ts`, plan 42 S3).
- **`run_traces` exists for failed and cancelled runs too**, so memory tracked-since and its denominator must filter `status='done' AND source='local'` explicitly.
- **A done run can lack a trace** (`saveRunTrace` after `completeAgentRun`, not transactional — inference), so the memory denominator can be smaller than the skills one; consistent with AC-14.
- **Tracked-since queries have no index path**; cost unmeasured. Consider extending `agent-performance-perf.it.test.ts` with `run_skills`, `run_traces`, `reviews`, `findings`, or caching the value.
- **Severity and category are unconstrained text.** Group by the raw string; map unknowns to "other" explicitly; response fields `z.string()`, not `z.enum`.
- **Severity case.** DB/contract uppercase `CRITICAL/WARNING/SUGGESTION`; categories lowercase. `severityColor()` gives `--info` for `INFO`, which AC-33 treats as "Other", so the panel needs its own mapping or a guard.
- **Bucketing (inference, not run).** Aggregate in SQL on local wall-clock:
  - `local_from := $from::timestamptz AT TIME ZONE $tz`;
  - 4h: `floor(extract(epoch from (r.ran_at AT TIME ZONE $tz) - local_from) / 14400)` (0..5);
  - 7-day: same with `604800`;
  - month: `date_trunc('month', r.ran_at AT TIME ZONE $tz)`, first/last clipped to `from`/`to`;
  - bounds back to instants via `(local_ts AT TIME ZONE $tz)` for AC-32.
  - DST: 7-day/month buckets follow the local clock (AC-28/29). A 1d window is 24 real hours, so across DST six wall-clock 4h buckets cover 23 or 25 real hours; spec leaves this open. Unit-test bucket edges with `America/New_York` on 2026-03-08 and 2026-11-01, and a non-hour offset (`Asia/Kolkata`).
  - The sparkline unit rule (`resolveWindow`, `helpers.ts:50`) is unrelated; the new bucket kind depends on period kind and span (≤ 90 / > 90 days).
- **Donut.** Vendored `Donut` has no centre slot and `formatValue` gets only the value (ambiguous for `count · %`). Use a local donut (as `CostDonut`) under `client/src/components/` or the tab's `_components/`; `src/vendor/**` is not touched.
- **Stacked bars**: recharts `BarChart` with `stackId`, or CSS flex segments. `BarRow` fits skills/memory lists (`suffix="42%"`), but has no title/tooltip; full text on hover needs a wrapper.
- **Helper placement.** Move `CATEGORY_COLOR`, `CATEGORY_FALLBACK_COLOR`, `formatSegmentValue` to a shared module (`src/lib/` like `severity.ts`, or `src/components/`) and re-export from the skill tab, instead of a cross-route deep import.
- **Client wiring.**
  - `useAgentPerfBreakdown(agentId, sel, enabled)` in `hooks/agent-performance.ts`, key `["agent-performance","breakdown",agentId,periodKey,tz]`.
  - Panels after the tiles, before `<RunHistory/>` (`:171`); AC-3 follows from existing early returns. Gate the request with `enabled = !!data && data.figures.runs > 0` (inference).
  - AC-37 (panels shown when KPI/history fail) conflicts with the current early-return structure: the tile error branch returns before any panel. Needs a restructure (inference).
  - Request-cap test (`StatsTab.test.tsx:100`) must go to 4 with its `/stats?` filter adjusted.
- **Contract.** New schemas in `server/src/vendor/shared/contracts/agent-performance.ts`, byte-for-byte to the client; `index.ts` untouched; names not already in the barrel.
- **i18n.** New group (e.g. `panels`; `breakdown` is taken). Severity labels from `prReview.severity.*` via a second `useTranslations`, or duplicated.

## Not established

- Cost of the `min(ran_at)` queries at scale (no EXPLAIN; perf test has no `run_skills`/`run_traces` rows); whether the 1 s NFR holds.
- Whether a run can have more than one `reviews` row (writers not checked); M-7 counts all by design.
- Whether any historical `run_traces.trace` lacks `memory_pulled`.
- Production volumes of `run_skills`, `run_traces`, `findings`.
- `agent-runner/dist/index.js` freshness (no build run); conclusion rests on the import graph.
- Which categories/severities appear in real findings (data not queried).
- `PeriodControl` and `perf-kit` details beyond imports.
- Other client locales (only `messages/en/` exists).

## Search log

- Read in full: `specs/016-agent-stats-breakdown.md`, `server/src/modules/agent-performance/{repository,routes,service}.ts`, `helpers.ts` (first 80 lines), `types.ts` (first 40 lines), both `contracts/agent-performance.ts` (diffed), `client/src/lib/period.ts`, `client/src/lib/hooks/agent-performance.ts`, `client/messages/en/agentPerformance.json`, agent `StatsTab.tsx` and `index.ts`.
- Partial: `server/src/db/schema/{runs,reviews,skills}.ts`, `run-executor.ts` (110-130, 285-300, 380-475, 575-600, 715-735), `reviews/repository/run.repo.ts` (110-200), `skills/repository.ts` (235-345), `ci/repository.ts` (295-335), `server/test/agent-performance-perf.it.test.ts`, `StatsTab.test.tsx` (1-125).
- Commands: `rg` over `server/src` for `runTraces|run_traces|memory_pulled|saveRunTrace|recordRunSkills`; `rg` over `agent-runner` for shared imports and `agent-performance`; `diff` of vendored copies.
