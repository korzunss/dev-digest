# Development Plan: Agent Stats tab breakdown panels
Status: done
Execution: multi-agent
Save as: docs/plans/43-agent-stats-breakdown.md
Spec: specs/016-agent-stats-breakdown.md
Research: docs/plans/assets/agent-stats-breakdown/research.md
Designs: Agent → Stats panels `docs/plans/assets/agent-stats-breakdown/design-agent-stats-panels.png`, `docs/plans/assets/agent-stats-breakdown/design-agent-stats-panels-scrolled.png`; Skill → Stats `docs/plans/assets/agent-stats-breakdown/current-skill-stats.png`, `docs/plans/assets/agent-stats-breakdown/design-period-control.png`
Predecessor: docs/plans/42-agent-performance.md (done). Branch `L08_agent_stats_breakdown`, own PR into L08. `agent-runner/` must not change, `dist/index.js` included.

## Spec traceability
| Spec AC | Covered by |
|---|---|
| AC-1 | S14, S15 · T6 |
| AC-2 | S2, S4 · T2 |
| AC-3 | S14, S15 · T6, T7 |
| AC-4 | S2 · T2 |
| AC-5 | S2 · T2 |
| AC-6 | S2, S10, S11 · T2, T5 |
| AC-7 | S11 · T6 |
| AC-8 | S10, S11 · T5 |
| AC-9 | S2, S10 · T2, T5 |
| AC-10 | S10, S11 · T5 |
| AC-11 | S2, S10 · T2, T5 |
| AC-12 | S2 · T2 |
| AC-13 | S2 · T2 |
| AC-14 | S2 · T2 |
| AC-15 | S2 · T2 |
| AC-16 | S10, S11 · T5, T6 |
| AC-17 | S10, S11 · T5 |
| AC-18 | S10, S11 · T5 |
| AC-19 | S10 · T5 |
| AC-20 | S2 · T2 |
| AC-21 | S3, S12, S13 · T2, T6 |
| AC-22 | S10 · T5 |
| AC-23 | S10 · T5 |
| AC-24 | S7, S10, S13 · T5, T6 |
| AC-25 | S2, S10, S13 · T2, T5 |
| AC-26 | S12 · T6 |
| AC-27 | S2, S3 · T1, T2 |
| AC-28 | S2, S3 · T1, T2 |
| AC-29 | S2, S3, S10 · T1, T2, T5 |
| AC-30 | S2 · T2 |
| AC-31 | S2, S12 · T2, T6 |
| AC-32 | S10, S12 · T5, T6 |
| AC-33 | S2, S10, S12 · T2, T5 |
| AC-34 | S8, S15 · T7 |
| AC-35 | S14 · T6 |
| AC-36 | S14 · T6 |
| AC-37 | S15 · T7 |
| AC-38 | S4 · T2 |
| AC-39 | S4 · T2 |
| AC-40 | S4, S5 · T2 |
| AC-41 | S1, S2, S14 · T2, T6 |
| AC-42 | S21 · T9 |
| AC-43 | S16, S17, S18 · T8 |
| AC-44 | S17 · T8 |
| AC-45 | S20, S21 · T9 |
| AC-46 | S21 · T9 |
| AC-47 | S1, S16, S17, S21 · T8, T9 |
| AC-48 | S17 · T8 |
| AC-49 | S4, S17, S18, S21 · T8, T9 |
| NFR performance | S6 · T3 |

## Decisions recorded
User answers, 2026-10-20:
- **TQ1–TQ5** defaults: 1d = 6 buckets of 4 real hours from the period start (a DST day shows one bucket as 3 h or 5 h on the clock); "custom ≤ 90 days" counts local calendar days in `tz`; severity matches stored `CRITICAL`/`WARNING`/`SUGGESTION` exactly, anything else (incl. `INFO`, lower case) is "Other", shown only when > 0; endpoint `GET /agents/:id/stats/breakdown`, i18n group `panels`, severity labels from `prReview.severity.*`; month labels short month (+ year when the range crosses a year) via `Intl`.
- **GAP1**: the breakdown response carries its own counted-run count; at 0 the panels hide, as in AC-3. Sent to `spec-creator` as a correction (spec back to `draft`, re-approval needed).
- **D1** A: new `client/src/lib/finding-category.ts`; Skill StatsTab imports it.
- **D2** A: local recharts donut (as `CostDonut`).
- **D3** A: CSS flex stacked bars, each bucket keyboard-focusable.
- **D4** A: three independent regions (tiles, panels, history); panels request not gated on stats; panels hidden only when a response says 0 runs or 404.
- **D5** A: bucketing in SQL in `repository.ts`, bounds returned as ms ISO; DST-edge `.it` cases for `America/New_York` and `Asia/Kolkata`.
- **D6** A: a second perf `it` seeding `run_skills`, `run_traces`, `reviews`, `findings`.
- **D7**: multi-agent.
- **D8** A (2026-10-20): the skills module calls `container.agentPerformance.checkWindow(q)`.
- **D9** A (2026-10-20): the period query on `/skills/:id/stats` is required.

## Decisions needed
D1–D7: see *Decisions recorded*. Open after the AC-42…49 correction:
| # | Decision | Options | Recommendation | Steps affected |
|---|---|---|---|---|
| D8 | How skills reuses spec 015's window + tz rules | A: public `AgentPerformanceService.checkWindow(q)`, called via `this.container.agentPerformance` · B: move `resolveWindow` to `modules/_shared/`, own tz query in the skills repo | A — one implementation, reached through the container (onion step 6) | S4, S17 |
| D9 | `/skills/:id/stats` period query | A: required · B: optional, absent → 30 days | A — its only caller always sends it | S18 |

## Prerequisites
- Docker for `.it` (G2, G5). No new dependency.
- Before G1 the main session runs `cd agent-runner && npm run build && git diff --exit-code dist/index.js`; if HEAD's bundle is already stale, restore it and tell the user first (S1 assumes a clean baseline).
- **Legend:** `AP/` = `server/src/modules/agent-performance/` · `SK/` = `server/src/modules/skills/` · `AST/` = `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/` · `BP/` = `AST/_components/BreakdownPanels/` · `SST/` = `client/src/app/skills/[id]/_components/SkillEditor/_components/StatsTab/` · `DS/` = `docs/plans/assets/agent-stats-breakdown/` · `SG`/`CG` = `server`/`client` `insights/gotchas.md`.
- UI steps read the designs they name; **the spec wins over a mockup** (Design notes → Mockup vs spec).

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff |
|---|---|---|---|---|
| G1 | S1–S3 | shared + server repo/helpers | — | contract names, repo signatures, helper names |
| G2 | S4–S6 | server service, route, tests | G1 | route codes, T3 ms, `checkWindow` |
| G3 | S7–S10 | client lib, hook, i18n, helpers | G1 (∥ G2/G5: other package, no shared file) | hook signature, helper names, `panels.*` keys |
| G4 | S11–S15 | client components + agent StatsTab | G3 | — |
| G5 | S16–S18 | server skills module | G2 | `stats(ws, id, q)`; route query |
| G6 | S19–S21 | client Skill → Stats | G4, G5 | — |

## Steps

### S1 — Contracts, mirrored  [Contract]
- **Files:** `server/src/vendor/shared/contracts/agent-performance.ts` (modify) · `server/src/vendor/shared/contracts/skill-stats.ts` (create) · both under `client/src/vendor/shared/contracts/` (identical)
- **Change:** breakdown schemas in `agent-performance.ts`; `skill-stats.ts` = `SkillStatsQuery` (= `PerfQuery`) + `SkillStatsPeriod` (= `SkillStats.extend({ ever_used })`). Shapes: Design notes → Contract.
- **Layer / why here:** ports, outside the barrel (runner bundle unchanged).
- **Skills to apply:** `zod`, `typescript-expert`, `security`
- **Practices:** `category`/`severity` `z.string()`; counts `.int()`. **No edit to `index.ts` or `knowledge.ts`**; `findings_30d` keeps its name.
- **Known gotchas:** root `INSIGHTS.md` 2026-10-19 (non-barrel contract), 2026-10-15 (runner inlines the barrel), 2026-09-17 (copies drift: mirror only these files).
- **Done when:** each file `diff`s empty vs its client copy · `git diff --quiet HEAD -- '*/vendor/shared/index.ts' '*/vendor/shared/contracts/knowledge.ts'` · `cd agent-runner && npm run build && git diff --exit-code dist/index.js` (on failure restore it, stop) · `pnpm typecheck` in `server`, `client`

### S2 — Breakdown repository reads
- **Files:** `AP/repository.ts`, `AP/types.ts` (modify)
- **Change:** `countedRuns`, `skillsTrackedSince`, `memoryTrackedSince`, `skillUsage`, `memoryUsage`, `findingsByCategory`, `severityBuckets` (Design notes → Queries, Bucketing).
- **Layer / why here:** infrastructure; SQL only here.
- **Skills to apply:** `onion-architecture`, `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`, `security`
- **Practices:** `this.scope` + done (+ local where the AC says so); M-7 join as `decisionsByAgent`; exact severity else `other`; fixed `kind` fragments, values bound; `isoMs` out; awaited plain rows typed in `types.ts`; `jsonb_typeof` guard; no index/migration.
- **Known gotchas:** `SG` → DB items 1–3 (`to_char`, `toISOString()::timestamptz`, row types).
- **Done when:** `cd server && pnpm typecheck` · `bash .claude/skills/onion-architecture/scripts/check-module.sh agent-performance` adds no edge vs HEAD

### S3 — Pure bucket-kind and assembly helpers
- **Files:** `AP/helpers.ts`, `AP/constants.ts`, `server/test/agent-performance-helpers.test.ts` (modify)
- **Change:** `breakdownBucketKind(period, from, to, tz)` and `toBreakdown(parts)` (Design notes → Bucketing); `MONTH_BUCKETS_AFTER_DAYS = 90`.
- **Layer / why here:** pure rules beside `resolveWindow`.
- **Skills to apply:** `typescript-expert`, `zod`
- **Practices:** no I/O, no clock, no rounding.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm exec vitest run agent-performance-helpers` green (T1)

### S4 — Service: `breakdown` and `checkWindow`
- **Files:** `AP/service.ts` (modify)
- **Change:** `breakdown(ws, agentId, q)`: `checked(q)` (AC-40) → `getById`/`NotFoundError` (AC-39) → bucket kind → S2 reads in `Promise.all` → `toBreakdown`. Public `checkWindow(q)` wraps `checked` (D8).
- **Layer / why here:** application.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `zod`
- **Practices:** only `deps.repo`/`deps.agents`; no LLM (AC-38); `container.ts` unchanged.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck`

### S5 — Route `GET /agents/:id/stats/breakdown`
- **Files:** `AP/routes.ts` (modify)
- **Change:** sibling of `/agents/:id/stats` (`:44-51`): `IdParams`, `PerfQuery`, `200: AgentStatsBreakdown`.
- **Layer / why here:** transport.
- **Skills to apply:** `fastify-best-practices`, `zod`, `onion-architecture`, `security`
- **Practices:** schema-first; no `parse` or logic in the handler.
- **Known gotchas:** `SG` → Security "reachable from the LAN": skill names and memory text, like the trace routes.
- **Done when:** `cd server && pnpm typecheck`

### S6 — Breakdown `.it` and perf tests
- **Files:** `server/test/agent-stats-breakdown.it.test.ts` (create) · `server/test/agent-performance-perf.it.test.ts` (modify)
- **Change:** T2, T3.
- **Layer / why here:** tests.
- **Skills to apply:** `fastify-best-practices`, `drizzle-orm-patterns`, `typescript-expert`
- **Practices:** app + seeding as `agent-performance.it.test.ts:51-135`; windows end ≤ now; incompressible trace text; timing only when `!process.env.CI`.
- **Known gotchas:** `SG` → Tests: "Expected Reaper…"; "Prove a child read's workspace filter…" (other-workspace skill run).
- **Done when:** `cd server && pnpm exec vitest run agent-stats-breakdown.it agent-performance-perf.it` green; perf log < 1000 ms locally

### S7 — Category colour + count format to `src/lib`
- **Files:** `client/src/lib/finding-category.ts` (create) · `SST/constants.ts`, `SST/helpers.ts`, `SST/index.ts` (modify)
- **Change:** move `CATEGORY_COLOR`, `CATEGORY_FALLBACK_COLOR`, `formatCount` (`formatSegmentValue` stays as alias); add `KNOWN_CATEGORIES`; export names unchanged.
- **Layer / why here:** second consumer → `src/lib`.
- **Designs:** `DS/current-skill-stats.png`, `DS/design-period-control.png` (no visual change)
- **Skills to apply:** `frontend-architecture`, `typescript-expert` (plan change 2026-10-20, SK7: `react-best-practices`/`next-best-practices` removed — pure TS, no React/Next)
- **Practices:** no `@devdigest/shared` value import.
- **Known gotchas:** `CG` → Tooling: bracket-free vitest filter.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run SkillEditor/_components/StatsTab` green, unedited (T4)

### S8 — Hook `useAgentStatsBreakdown`
- **Files:** `client/src/lib/hooks/agent-performance.ts` (modify)
- **Change:** `useAgentStatsBreakdown(agentId, sel)`, key `["agent-performance","breakdown",agentId,periodKey(sel),tz]`, `enabled: !!agentId`, not gated on stats (D4).
- **Layer / why here:** data layer.
- **Skills to apply:** `react-best-practices`, `next-best-practices`, `typescript-expert`
- **Practices:** mirror `useAgentPerfStats` (`:43-50`); `import type` from the deep path.
- **Known gotchas:** `CG` → Tests: type-only shared imports.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run shared-type-only-imports`

### S9 — i18n `panels`
- **Files:** `client/messages/en/agentPerformance.json` (modify)
- **Change:** keys in Design notes → Copy.
- **Layer / why here:** i18n.
- **Skills to apply:** `next-best-practices`
- **Practices:** ICU plurals; no markup; reuse `retry`.
- **Known gotchas:** `CG` → UI: `t.rich` rejects elements.
- **Done when:** `jq -e '.panels.skills.caption and .panels.memory.none and .panels.findings.ciOnly and .panels.severity.other' client/messages/en/agentPerformance.json` prints `true`

### S10 — Pure panel view helpers
- **Files:** `BP/helpers.ts`, `BP/helpers.test.ts` (create)
- **Change:** `sharePercent`, `sortSkillRows`, `skillsView`, `memoryView`, `findingsView`, `bucketLabel`, `bucketRange`, `categoryLegend`, `severityLegend` (Design notes → States).
- **Layer / why here:** framework-free logic beside its consumer.
- **Skills to apply:** `frontend-architecture`, `typescript-expert`
- **Practices:** no React; `Intl` in the passed `tz`; unknown values never mapped to known ones.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm exec vitest run BreakdownPanels/helpers` green (T5)

### S11 — Skills and memory panels
- **Files:** `BP/SkillsPanel.tsx`, `BP/MemoryPanel.tsx`, `BP/styles.ts` (create)
- **Change:** `Card` + `SectionLabel`, caption, "based on N"; rows = text (ellipsis, `title`), `ProgressBar`, share; S10 states + "No data before".
- **Layer / why here:** colocated components.
- **Designs:** `DS/design-agent-stats-panels.png`, `DS/design-agent-stats-panels-scrolled.png`
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `security`
- **Practices:** text nodes only — no `dangerouslySetInnerHTML`/Markdown; caption per AC-7.
- **Known gotchas:** `CG` → UI: `styles.ts` entries each `satisfies CSSProperties`.
- **Done when:** `cd client && pnpm typecheck`

### S12 — Severity stacked bars
- **Files:** `BP/SeverityBars.tsx` (create)
- **Change:** CSS columns per bucket, label kept at 0 (AC-31); Suggestion, Warning, Critical, Other bottom→top; focusable columns with `aria-label`; hover/focus detail line; legend; "N findings in period".
- **Layer / why here:** colocated component (D3).
- **Designs:** `DS/design-agent-stats-panels.png`, `DS/design-agent-stats-panels-scrolled.png`
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `typescript-expert`
- **Practices:** hover = focus (AC-32); labels from `prReview.severity.*`, CSS-capitalised; Other `var(--text-muted)`.
- **Known gotchas:** `CG` → UI: border longhand.
- **Done when:** `cd client && pnpm typecheck`

### S13 — Category donut
- **Files:** `BP/CategoryDonut.tsx` (create)
- **Change:** recharts `PieChart` 140 px (assumption), centre total, Pie data count > 0, legend "count · pct".
- **Layer / why here:** colocated component (D2).
- **Designs:** `DS/design-agent-stats-panels.png`, `DS/design-agent-stats-panels-scrolled.png`
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `typescript-expert`
- **Practices:** colours/`formatCount` from `@/lib/finding-category`; no vendored `Donut`.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm typecheck`

### S14 — `BreakdownPanels` container
- **Files:** `BP/BreakdownPanels.tsx`, `BP/index.ts`, `BP/BreakdownPanels.test.tsx` (create)
- **Change:** loading → 4 skeletons (AC-35); error → retry per slot (AC-36); 404 or `counted_runs === 0` → `null` (AC-3/41); else 2 × 2 grid (AC-1).
- **Layer / why here:** colocated.
- **Designs:** `DS/design-agent-stats-panels.png`, `DS/design-agent-stats-panels-scrolled.png`
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** mock `@/lib/api` (spread `importActual`); `agentPerformance` + `prReview` messages; `fireEvent`.
- **Known gotchas:** `CG` → Tests: hook braces; `importActual`; no `user-event`; "multiple elements".
- **Done when:** `cd client && pnpm exec vitest run BreakdownPanels` green (T6)

### S15 — Agent StatsTab: three regions
- **Files:** `AST/StatsTab.tsx`, `AST/StatsTab.test.tsx`, `AST/styles.ts` (modify); `client/src/app/agent-performance/agent-performance.readonly.test.tsx`, `client/src/app/agent-performance/agent-performance.period-rejection.test.tsx` (modify — plan change 2026-10-20, gap G6-F1: they mount the Agent StatsTab and must answer `/stats/breakdown`)
- **Change:** tiles keep `:69-139`; `<BreakdownPanels>` after them in every stats state but 404; `RunHistory` data-only.
- **Layer / why here:** colocated component (D4).
- **Designs:** `DS/design-agent-stats-panels.png`, `DS/design-agent-stats-panels-scrolled.png`
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** no early return skips the panels; `serve()` answers `/stats/breakdown?`; cap `≤ 4`.
- **Known gotchas:** as S14.
- **Done when:** `cd client && pnpm exec vitest run AgentEditor/_components/StatsTab` green (T7) · `cd client && pnpm typecheck`

### S16 — Skills repository: bounded window, `everUsed`
- **Files:** `SK/repository.ts` (modify)
- **Change:** `windowedRuns` and `completedRunCount`/`runCountsBySkill`/`findingsBySkill` take an optional `until` (`lt(ranAt, until)`); new `everUsed(ws, skillId)` (AC-47).
- **Layer / why here:** infrastructure.
- **Skills to apply:** `onion-architecture`, `drizzle-orm-patterns`, `postgresql-table-design`, `typescript-expert`
- **Practices:** builder helpers (`gte`, `lt`) bind `Date`; done + local unchanged; `everUsed` is an awaited `exists`/`LIMIT 1`.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck`

### S17 — Skills service: period stats, 30-day rail card
- **Files:** `SK/service.ts`, `SK/stats.ts` (modify)
- **Change:** `stats(ws, id, q)`: `checkWindow(q)` first (D8, AC-49) → `getById` → windowed reads (AC-43); agents, `everUsed` unwindowed (AC-44/47) → `SkillStatsPeriod`. `list()`: `{ now − 30 × 24 h, now }` (AC-48). Document `findings_30d` = findings in the window (`stats.ts`).
- **Layer / why here:** application; other module via `container.*` only.
- **Skills to apply:** `onion-architecture`, `typescript-expert` (plan change 2026-10-20, SK17: `zod` removed — no schema in this step; validation in `checkWindow`, schemas in S1/S18)
- **Practices:** no import from `../agent-performance/`; deep-path contract types.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `bash .claude/skills/onion-architecture/scripts/check-module.sh skills` adds no edge vs HEAD

### S18 — Skills route query + `.it`
- **Files:** `SK/routes.ts`, `server/test/skills.it.test.ts` (modify)
- **Change:** `/skills/:id/stats`: `IdParams`, `querystring: SkillStatsQuery`, `200: SkillStatsPeriod` (D9); T8; `:625`, `:642` send a 30d query.
- **Layer / why here:** transport + tests.
- **Skills to apply:** `fastify-best-practices`, `zod`, `onion-architecture`, `security`
- **Practices:** schema-first; deep-path imports only.
- **Known gotchas:** `SG` → Tests: "Expected Reaper…".
- **Done when:** `cd server && pnpm exec vitest run skills.it skills-stats` green · `git diff --quiet HEAD -- '*/vendor/shared/index.ts' agent-runner`

### S19 — `useSkillStats(id, sel)`
- **Files:** `client/src/lib/hooks/skills.ts` (modify)
- **Change:** key `["skill-stats", id, periodKey(sel), tz]`; query from `resolveWindow(sel, new Date(), tz)`; returns `SkillStatsPeriod`.
- **Layer / why here:** data layer.
- **Designs:** `DS/current-skill-stats.png`, `DS/design-period-control.png`
- **Skills to apply:** `react-best-practices`, `next-best-practices`, `typescript-expert`
- **Practices:** `import type` from `@devdigest/shared/contracts/skill-stats.js`; window resolved in `queryFn`.
- **Known gotchas:** `CG` → Tests: type-only shared imports.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run shared-type-only-imports`

### S20 — Skills copy
- **Files:** `client/messages/en/skills.json` (modify)
- **Change:** `stats.findings` "FINDINGS" (AC-45), `stats.noFindingsInPeriod` "No findings in this period" (AC-46); drop `stats.findings30d` once unused.
- **Layer / why here:** i18n.
- **Designs:** `DS/current-skill-stats.png`, `DS/design-period-control.png`
- **Skills to apply:** `next-best-practices`
- **Practices:** no markup.
- **Known gotchas:** none.
- **Done when:** `jq -e '.stats.findings and .stats.noFindingsInPeriod' client/messages/en/skills.json` prints `true`

### S21 — Skill StatsTab: period control and states
- **Files:** `SST/StatsTab.tsx`, `SST/helpers.ts`, `SST/styles.ts`, `SST/StatsTab.test.tsx`, `client/src/app/skills/[id]/_components/SkillEditor/SkillEditor.test.tsx` (modify)
- **Change:** `PeriodControl` header in every state, agent tab's `setPeriod` (AC-42); `useSkillStats(skill.id, sel)`; findings tile + period name (AC-45); `runs_with_skill === 0` → "—" pull/accept + `noFindingsInPeriod` (AC-46); `hasNothingToShow` = `agent_count === 0 && !ever_used` (AC-47); no numbers while loading/error (AC-49).
- **Layer / why here:** colocated component.
- **Designs:** `DS/current-skill-stats.png`, `DS/design-period-control.png`
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** reuse `PeriodControl`, `parsePeriod`; tests add `agentPerformance` messages, mock `next/navigation` as `AST/StatsTab.test.tsx:20-24`.
- **Known gotchas:** as S14.
- **Done when:** `cd client && pnpm exec vitest run SkillEditor` green (T9) · `cd client && pnpm typecheck`

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| T1 `server/test/agent-performance-helpers.test.ts` | unit | bucket kind (1d, 30d, custom 90/91 days, NY DST, Kolkata); `toBreakdown` | S3 |
| T2 `server/test/agent-stats-breakdown.it.test.ts` | it | Design notes → T2 cases | S6 |
| T3 `server/test/agent-performance-perf.it.test.ts` | it | NFR 1 s (Design notes → T3 seed) | S6 |
| T4 `SST/StatsTab.test.tsx` | unit | unchanged after S7 | S7 |
| T5 `BP/helpers.test.ts` | unit | AC-6, 8–11, 16–19, 22–25, 27–29, 32, 33 | S10 |
| T6 `BP/BreakdownPanels.test.tsx` | unit | AC-1, 3/41, 7, 16, 21, 24, 26, 31, 32, 35, 36 | S14 |
| T7 `AST/StatsTab.test.tsx` | unit | AC-3, 34 (≤ 4 requests), 37 | S15 |
| T8 `server/test/skills.it.test.ts` | it | Design notes → T8 cases | S18 |
| T9 `SST/StatsTab.test.tsx` + `SkillEditor.test.tsx` | unit | AC-42, 45, 46, 47, 49 | S21 |

## Migrations & contracts
No migration. Contracts only in S1 (non-barrel files + mirror); `index.ts`, `knowledge.ts`, `agent-runner/` unchanged.

## Out of scope
- `run-executor.ts`, prompts, `run_skills`/trace writing; "Sync CI"; dashboard panels; breakdown panels on Skill → Stats.
- Any index or migration, even if T3 is slow (report it).
- Renaming `findings_30d`, any barrel-reachable schema edit, any `agent-runner/` change (own PR).
- `src/vendor/**` beyond S1; `mcp-server/`, `reviewer-core/`.

<!-- implementer-brief:end -->

## Context applied
- `docs/plans/assets/agent-stats-breakdown/research.md` → predicates, bucketing, client components (S2, S10, S13).
- root `INSIGHTS.md` → non-barrel contract; runner bundle inlines the barrel; vendored copies drift (S1, S18, Prerequisites).
- `server/insights/gotchas.md` → raw-SQL timestamps and bound dates, row types (S2); workspace-filter proof, Reaper (S6, S18); LAN exposure (S5).
- `client/insights/gotchas.md` → type-only shared imports (S8, S19); `styles.ts` TS2742 (S11); test idioms (S14, S15, S21); bracket filters (S7, S21).
- `docs/plans/42-agent-performance.md` → module layout, perf-test pattern (S6).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| engineering-insights | preload | gotchas read; Insights to record | |
| onion-architecture | preload | S2, S4, S5, S16–S18 | |
| zod | on demand (S1) | S1, S3, S4, S5, S17, S18 | |
| typescript-expert | on demand (S1) | all code steps | |
| security | on demand (S1) | S1, S2, S5, S11, S18 | |
| drizzle-orm-patterns | on demand (S2) | S2, S6, S16 | |
| postgresql-table-design | on demand (S2) | S2, S16 | |
| fastify-best-practices | on demand (S5) | S5, S6, S18 | |
| frontend-architecture | on demand (S7) | S7, S10–S15, S21 | |
| react-best-practices | on demand (S7) | S7, S8, S11–S15, S19, S21 | |
| next-best-practices | on demand (S7) | S7, S8, S9, S11, S14, S15, S19–S21 | |
| react-testing-library | on demand (S14) | S14, S15, S21 | |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `contracts/agent-performance.ts`, `contracts/skill-stats.ts` (both copies) | ports | changed / new |
| server | `modules/agent-performance/*` | infra / app / transport | changed |
| server | `modules/skills/{repository,service,stats,routes}.ts` | infra / app / transport | changed |
| server | `test/agent-stats-breakdown.it.test.ts`, `agent-performance-perf.it.test.ts`, `agent-performance-helpers.test.ts`, `skills.it.test.ts` | tests | new / changed |
| client | `src/lib/finding-category.ts`; hooks `agent-performance.ts`, `skills.ts`; `messages/en/{agentPerformance,skills}.json` | lib / data / i18n | new / changed |
| client | agent `StatsTab/` + `BreakdownPanels/`; skill `StatsTab/`, `SkillEditor.test.tsx` | feature | changed / new |

## Design notes

### Contract
```ts
BreakdownBucketKind = z.enum(['4h', '7d', 'month'])
BreakdownSkillRow   = { skill_id: uuid string, name: string, runs: int }
BreakdownMemoryRow  = { text: string, pr: int | null, runs: int }
BreakdownCategoryCount = { category: string, count: int }
BreakdownBucket     = { start: ISO, end: ISO, critical: int, warning: int, suggestion: int, other: int }
AgentStatsBreakdown = {
  window: PerfWindow, counted_runs: int /* AC-41, M-2 */, local_runs: int,
  skills: { tracked_since: ISO | null, denominator: int, rows: BreakdownSkillRow[] },
  memory: { tracked_since: ISO | null, denominator: int, rows: BreakdownMemoryRow[] },
  findings: { total: int, by_category: BreakdownCategoryCount[], bucket_kind: BreakdownBucketKind, buckets: BreakdownBucket[] },
}
// contracts/skill-stats.ts (new, outside the barrel)
SkillStatsQuery  = PerfQuery                                   // from './agent-performance.js'
SkillStatsPeriod = SkillStats.extend({ ever_used: z.boolean() }) // SkillStats from './knowledge.js'
```
Shares, labels and percentages are computed on the client from raw counts.

### Skill → Stats (AC-42…49)
- **Why a deep-path contract:** `SkillStats` is in `knowledge.ts`, which the barrel (`index.ts:20`) re-exports, and the runner bundle inlines the barrel. A new field or a rename there would change `agent-runner/dist/index.js`. `SkillStatsPeriod` extends it in a file nothing in the barrel imports. Only the server route and the client hook import it.
- **`findings_30d`** keeps its name and now means "findings in the requested window" (documented in `SK/stats.ts` and the client, not in `knowledge.ts`). The rail card (`list()`) never used it.
- **AC-46 needs no field:** `runs_with_skill` (already in `SkillStats`) is the period-scoped numerator, and 0 means no local run in the period included the skill.
- **AC-47 needs `ever_used`:** with period-scoped `runs_with_skill`, today's rule would hide a skill whose runs predate the period.
- **The window** comes from `checkWindow` (D8): the same tz check (`pg_timezone_names`) and AC-4 rules as Agent → Stats, so an invalid period gets 422 before any skill query (AC-49). Rejecting an invalid custom range in the browser, and keeping the previous data, is `PeriodControl`'s existing behaviour.
- **The rail card** uses `{ now − 30 × 24 h, now }`. Today's `statsWindowStart()` (`SK/service.ts:362`) has the same start and no upper bound; S17 adds the bound.

### Queries
- **Counted:** `count(*)` and `count(*) FILTER (WHERE source = 'local')` over `scope` + done.
- **Skills:**
  - *Tracked since*: `min(r.ran_at)` over `run_skills rs JOIN agent_runs r` for the workspace, done, local.
  - Denominator: counted local runs with `ran_at >= since` (the window still applies).
  - Rows: `run_skills ⋈ skills ⋈ agent_runs`, `GROUP BY s.id, s.name`, `count(*)` (exact, since the PK is `(run_id, skill_id)`).
- **Memory:**
  - *Tracked since*: `min(r.ran_at)` over `agent_runs ⋈ run_traces`, done, local.
  - Denominator: the agent's counted local runs `⋈ run_traces`.
  - Rows: `jsonb_array_elements(CASE WHEN jsonb_typeof(rt.trace->'memory_pulled') = 'array' THEN rt.trace->'memory_pulled' ELSE '[]'::jsonb END) e`, `GROUP BY e->>'text', (e->>'pr')::int`, `count(DISTINCT rt.run_id)`, ordered by runs desc, then text.
- **Findings:** the M-7 join, `GROUP BY f.category`.

### Bucketing (D5, TQ1, TQ2)
- **Kind:** `breakdownBucketKind`: `1d` → `4h`, `30d` → `7d`. `custom` counts local calendar days from `from` to `to − 1 ms`, inclusive (`Intl.DateTimeFormat('en-CA', { timeZone })`): ≤ 90 → `7d`, else `month`.
- **`toBreakdown`:** a null `tracked_since` gives denominator 0 and no rows.
- **`4h`:** `idx = floor(extract(epoch FROM r.ran_at − from) / 14400)`, from 0 to 5. Bounds are `from + i·4h`, and the last ends at `to`. These are real hours: on a DST day the clock shows 3 h or 5 h.
- **`7d`:** `lf = from AT TIME ZONE tz`; `idx = floor(extract(epoch FROM (r.ran_at AT TIME ZONE tz) − lf) / 604800)`. Bounds are `(lf + i·7 days) AT TIME ZONE tz`, and the last is clipped to `to`.
- **`month`:** `generate_series(date_trunc('month', lf), date_trunc('month', (to − 1 ms) AT TIME ZONE tz), '1 month')`. Bounds are each month start `AT TIME ZONE tz`, with the first and last clipped to `from` and `to`. Labels come from `start` in the client.
- Every bucket is emitted, via `generate_series` LEFT JOIN counts, so that empty buckets keep their label.

### States (client, S10)
- **skillsView:**
  - `local_runs = 0` → ciOnly (AC-11; it takes precedence over AC-9, assumption);
  - `tracked_since = null` → notRecorded (AC-9);
  - `denominator = 0` → only "No data before";
  - no rows → noSkills (AC-10);
  - otherwise list.
  - "No data before <date>" is added whenever `tracked_since > window.from` (AC-8).
- **memoryView:**
  - `local_runs = 0` → ciOnly (AC-19);
  - no rows → none (AC-17), including at denominator 0;
  - otherwise list.
  - Plus AC-18's "No data before" line.
- **findingsView:** `local_runs = 0` → ciOnly (AC-23); `total = 0` → none (AC-22); otherwise charts.
- **`sharePercent`** returns `"<1%"` when the share is above 0 but rounds to 0. **`sortSkillRows`** sorts by share descending, then by name.
- **`categoryLegend`** lists the five known categories with real 0s, then unknown values as stored, in the fallback colour. **`severityLegend`** shows Other only when it is > 0.
- **SeverityBars:** segments bottom to top are Suggestion, Warning, Critical, Other (`SEVERITY_META`, Other `var(--text-muted)`), with heights relative to the largest bucket. Each column has `tabIndex={0}` and an `aria-label` carrying the range and counts. Hover or focus shows "<label>: <range>" and the counts above the chart (scrolled mockup).
- **Formats (assumption):** the date is "Oct 11"; the range is "Oct 11 08:00–12:00", with a date on both ends when the days differ; the month label is "Oct", or "Oct 2026" when the range crosses a year. Skill → Stats names the period under the findings tile with `PeriodControl`'s own label text.

### Copy (`panels.*`, S9)
- `skills.{title, caption, basedOn, notRecorded, noSkills, noDataBefore, ciOnly}`
- `memory.{title, caption, basedOn, none}`
- `severity.{title, total, other, bucketDetail}`
- `category.{title, centreLabel}`
- `findings.{none, ciOnly}`
- `loadError`

Texts are verbatim from AC-7, 9, 10, 11, 16, 17, 19, 22, 23 and 26.

### T2 cases
- AC-4/5: a period straddling *tracked since* leaves the earlier local runs out of the denominator.
- AC-6 sort and counts. AC-9: no `run_skills` anywhere → `tracked_since` null. AC-11: a CI-only agent → `local_runs` 0.
- AC-12: a deleted skill is absent; a detached skill is kept under its current name.
- AC-13–15: seeded `memory_pulled` entries, with identity = text + pr; `trace: {}` and a failed run's trace are ignored.
- AC-20/21: every kind and decision state counts; total = Σ buckets = Σ categories = seeded findings.
- AC-25/33: an unknown category is kept as stored; `INFO` and `warning` count as `other`.
- AC-27–31: 6 × 4 h; 30d → W1–W5, the last one shorter; custom 91 local days → months; empty buckets present.
- DST: 4 h bounds across 2026-03-08 in New York; 7 d across 2025-11-02 in New York; Asia/Kolkata offsets.
- AC-38: the `agent_runs` count is unchanged. AC-39: an unknown agent and another workspace's agent → 404. AC-40: a bad tz or bad period → 422, the same as `/stats`. AC-41: counted includes local + CI.
- Workspace: an earlier skill run in another workspace does not move *tracked since*.

### T3 seed (assumption)
A second `it` reuses one Load agent and adds:
- 2 `run_skills` per run;
- 2 000 traces of ~32 KB incompressible text, each carrying 3 `memory_pulled` entries;
- 1 review and 5 findings per run.

It then times `GET /agents/:id/stats/breakdown` over 30d.

### T8 cases
- AC-43: a run with the skill inside a `1d` window and one 2 days earlier; only the first counts in `runs_with_skill`, `runs_total`, `accept_rate` and `findings_30d`. A custom window excludes runs at `to` (upper bound).
- AC-44: `agent_count` and `agents` are the same for `1d` and `30d`.
- AC-47: a skill with no agents and only an old run → `ever_used: true`, `runs_with_skill: 0`.
- AC-48: `GET /skills` (no query) still reports the 30-day rollup, whatever the stats query.
- AC-49: a bad tz → 422; a `1d` that is not 24 h → 422; a missing query → 422 (D9); an unknown skill with a valid query → 404.

### Mockup vs spec
- The mockup's skills caption reads "…where the model applied the skill". AC-7's caption is the one to use.
- The "Sync CI" button is a Non-goal.
- The accept tile's "based on 0 local findings" belongs to SPEC-15 and is untouched here.
- `current-skill-stats.png` is today's tab; its "FINDINGS (30D)" label becomes "FINDINGS" with the period named under it (AC-45). `design-period-control.png` shows the control to reuse.

### Pass-1 review (resolved)
- TQ1–TQ5 were accepted at their defaults.
- GAP1 (AC-3 vs AC-37: no state when stats fails and 0 runs) was closed by the spec correction that added AC-41.
- REC1 (memory query de-TOAST cost) → D6. REC2 (ungated panels request) → D4. REC3 (shared category helpers) → D1.
- Options considered and rejected:
  - D1: a deep import, or a duplicate;
  - D2: the vendored `Donut` (no centre slot, `charts/Donut.tsx:10-27`);
  - D3: recharts `BarChart` (sizes to 0 in jsdom; weak keyboard focus);
  - D4: keeping the early returns (fails AC-37);
  - D5: TS bucketing;
  - D6: no perf test.

## Risks & open questions
- **Memory query cost:** `trace->'memory_pulled'` de-TOASTs whole traces. If T3 goes over 1 s, the fix (a column or index) is a migration, which is a spec Non-goal. That goes back to the user and `spec-creator`; the implementer does not add one.
- **Runner baseline:** `server/src/vendor/shared` changed (2026-10-20) after `agent-runner/dist/index.js` was last committed (2026-10-15). If HEAD's bundle is already stale, S1's build check fails for a reason this plan didn't cause. That is why the Prerequisites baseline run exists, and a stale baseline goes to the user (an agent-runner PR of its own).
- **D9 = A** makes `?period…` mandatory on `/skills/:id/stats`. Callers checked: the client hook only (`mcp-server`, `e2e`, `agent-runner` don't call it). e2e flow 09 opens the tab through the UI, which sends the query.
- **`hasNothingToShow`** changes from a 30-day rule to "ever" (AC-47). A skill with no agents whose last run is older than 30 days now shows the tab instead of the empty state, which is what the spec asks for.
- *Tracked since* queries scan, because there is no index path (research). This is covered by T3.
- Severity labels in `prReview.severity` are lower case, and S12 capitalises them with CSS.
- The panels request fires even in the empty state. It is still one request inside the budget of 4.
- If the stats and panels counts disagree because a run finished between the two requests, the panels follow their own count (AC-41).
- Doc vs code: the research says the panels go "only in the final `else`". That is superseded by D4 and AC-37.
- Mode re-check: 3 packages, 21 steps and a contract change → multi-agent. This matches D7.

## Handed off
- **architecture-reviewer:**
  - S2 SQL confined to `repository.ts`, and the `types.ts` row types;
  - S7's move into `src/lib`;
  - S17's cross-module call through `container.agentPerformance` (no value import).
- **security review:**
  - S5 returns PR-derived memory text and user skill names over the LAN-bound API;
  - S11 plain-text rendering;
  - S2 `tz` binding and the fixed `kind` fragments;
  - S18's new querystring validation.

## Insights to record
- None yet. Candidates:
  - T3's measured cost of reading `memory_pulled` from large traces, if notable (`server/INSIGHTS.md` · Tool & Library Notes);
  - extending a barrel schema through a deep-path `.extend()` file to keep the runner bundle unchanged, if it holds up (root `INSIGHTS.md` · Codebase Patterns).

## Red-flags check
- [x] Every spec AC-n (AC-1…AC-49) has a row in *Spec traceability* with a step or test
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; technical choices D8, D9 are in *Decisions needed*
- [x] Groups end type-checking; parallel groups (G2/G5 ∥ G3/G4) share no file
- [x] No group under 3 files / ~80 lines
- [x] Brief near ~20,000 characters (path legend; detail below the marker)
- [x] Execution mode multi-agent (contract change)
- [x] Every step's *Skills to apply* is complete
- [x] `plan-lint: ok`

## Handoffs → G1

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S1 | done | `server/src/vendor/shared/contracts/agent-performance.ts`, `client/src/vendor/shared/contracts/agent-performance.ts`, `server/src/vendor/shared/contracts/skill-stats.ts` (+new), `client/src/vendor/shared/contracts/skill-stats.ts` (+new) |
| S2 | done | `server/src/modules/agent-performance/repository.ts`, `server/src/modules/agent-performance/types.ts` |
| S3 | done | `server/src/modules/agent-performance/helpers.ts`, `server/src/modules/agent-performance/constants.ts`, `server/test/agent-performance-helpers.test.ts` |

## Handoff to the next group
- **Contract.** `server/src/vendor/shared/contracts/agent-performance.ts` gained `BreakdownBucketKind` (`'4h' | '7d' | 'month'`), `BreakdownSkillRow`, `BreakdownMemoryRow`, `BreakdownCategoryCount`, `BreakdownBucket`, `AgentStatsBreakdown`. `contracts/skill-stats.ts` is new with `SkillStatsQuery` and `SkillStatsPeriod`. Client copies identical.
- **Repository** (`AgentPerformanceRepository`, `win: {from: Date, to: Date}`): `countedRuns(ws, win, agentId)`, `skillsTrackedSince(ws)`, `memoryTrackedSince(ws)`, `skillUsage(ws, win, agentId, since: Date | null)`, `memoryUsage(ws, win, agentId, since: Date | null)`, `findingsByCategory(ws, win, agentId)`, `severityBuckets(ws, win, tz, kind, agentId)`. `skillUsage`/`memoryUsage` return `{0, []}` without a query when `since` is null.
- **Types/constant:** row types in `types.ts`; `MONTH_BUCKETS_AFTER_DAYS` (90) in `constants.ts`.
- **Helpers** (`helpers.ts`): `breakdownBucketKind(period, from, to, tz)`; `toBreakdown(parts)` with `parts = {window: PerfWindow, counts, bucketKind, skillsSince, skills, memorySince, memory, categories, buckets}`; zeroes a panel whose tracked-since is null.
- **S4 wiring:** `window` via existing `windowOf(q, win)`; call `skillsTrackedSince` and `memoryTrackedSince` first, then pass the dates to `skillUsage`/`memoryUsage` with the other reads in `Promise.all`; `bucketKind = breakdownBucketKind(q.period, win.from, win.to, q.tz)`.
- **Design choice:** `severityBuckets` builds buckets in SQL as instant ranges `[start, end)` (generate_series) and joins findings on `ran_at >= s AND ran_at < e`, instead of the Design-notes `idx` formula; keeps counts consistent with displayed bounds across DST (checked in psql: NY 4h on 2026-03-08, 7d across DST, Kolkata month).
- **Behaviours for S6:** `severityBuckets` rows ordered, every bucket present; memory rows sort runs desc, text, pr; skill rows sort runs desc, name (service/client re-sorts by share); the `.it` test needs a CI-run seed for AC-41.
- **Commands:** `.it` needs Docker; `devdigest-postgres` running (user/db `devdigest`).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S2 | |
| `engineering-insights` | preload | | no insight written: candidate left to the main session |
| `zod` | on demand (S1) | S1, S3 | |
| `typescript-expert` | on demand (S1) | S1, S2, S3 | |
| `security` | on demand (S1) | S1, S2 | |
| `drizzle-orm-patterns` | on demand (S2) | S2 | |
| `postgresql-table-design` | on demand (S2) | S2 | no schema or index change |

## Handoffs → G2

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S4 | done (`pnpm typecheck` exit 0) | `server/src/modules/agent-performance/service.ts` |
| S5 | done (`pnpm typecheck` exit 0) | `server/src/modules/agent-performance/routes.ts` |
| S6 | done (`vitest run agent-stats-breakdown.it agent-performance-perf.it`: 2 files, 16 tests passed; breakdown 127 ms, dashboard 277 ms) | `server/test/agent-stats-breakdown.it.test.ts` (+new), `server/test/agent-performance-perf.it.test.ts` |

## Handoff to the next group
- **Route:** `GET /agents/:id/stats/breakdown` with `IdParams` and `PerfQuery`, response `AgentStatsBreakdown`. 422 for a bad tz, period or window; 404 for an unknown or other-workspace agent.
- **Service:** `AgentPerformanceService.breakdown(ws, agentId, q)` and public `checkWindow(q): Promise<PerfWindowResolved>` (`from`, `to`, `previousFrom`, `previousTo`, `unit`) in `server/src/modules/agent-performance/service.ts`. `checkWindow` throws `ValidationError` (422) for a bad tz or window; no `container.ts` change. For D8, G5 calls `this.container.agentPerformance.checkWindow(q)` before `getById`.
- **DST cases:** 4h NY 2026-03-08, 7d NY 2025-11-02 and Kolkata month call `AgentPerformanceRepository.severityBuckets` directly (`new AgentPerformanceRepository(db)`), because a `1d` request must be exactly 24 h and the route cannot take a 23 h window.
- **T3:** 127 ms vs 1 s budget; no index/migration. Seed: 2,000 traced runs, ~32 KB incompressible traces, 2 `run_skills` per run, 5 findings per run.
- **Test seeding pattern:** workspace filter proven with an older skill run in another workspace. `TESTCONTAINERS_RYUK_DISABLED=true` needed for `.it` locally.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S4, S5 | |
| `engineering-insights` | preload | | no insight written, candidate listed in report |
| `typescript-expert` | on demand (S4) | S4, S6 | |
| `zod` | on demand (S4) | S4, S5 | |
| `security` | on demand (S5) | S5 | |
| `fastify-best-practices` | on demand (S5) | S5, S6 | |
| `drizzle-orm-patterns` | on demand (S6) | S6 | |

## Handoffs → G3

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S7 | done | `client/src/lib/finding-category.ts` (+new); `SST/constants.ts`, `SST/helpers.ts`, `SST/index.ts` |
| S8 | done | `client/src/lib/hooks/agent-performance.ts` |
| S9 | done | `client/messages/en/agentPerformance.json` (pure insertion, +32 lines) |
| S10 | done | `BP/helpers.ts` (+new), `BP/helpers.test.ts` (+new) |

`SST` = `client/src/app/skills/[id]/_components/SkillEditor/_components/StatsTab/`. `BP` = `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/_components/BreakdownPanels/`.

## Handoff to the next group
- **Hook:** `useAgentStatsBreakdown(agentId, sel: PeriodSel)` in `client/src/lib/hooks/agent-performance.ts`; `useQuery` of `AgentStatsBreakdown`; key `["agent-performance","breakdown",agentId,periodKey(sel),tz]`; `enabled: !!agentId`.
- **`@/lib/finding-category`:** `KNOWN_CATEGORIES` (five, legend order), `CATEGORY_COLOR`, `CATEGORY_FALLBACK_COLOR`, `formatCount`. `SST/constants.ts` keeps only `DONUT_SIZE`; `SST/index.ts` re-exports the colours (names unchanged); `formatSegmentValue = formatCount`.
- **`BP/helpers.ts`:** `shareValue(count, denom)` (0–100 unrounded, bar width); `sharePercent(count, denom)` (string, `"<1%"` under 1%); `sortSkillRows(rows, denom)`; `skillsView(data)` → `{kind: "ciOnly" | "notRecorded"} | {kind: "noDenominator" | "noSkills", noDataBefore} | {kind: "list", rows, noDataBefore}`; `memoryView(data)` → `{kind: "ciOnly"} | {kind: "none", noDataBefore} | {kind: "list", rows, noDataBefore}`; `noDataBefore` ISO or null, formatted by `formatDay(iso, tz)` ("Oct 11"); `findingsView(data)` → `"ciOnly" | "none" | "charts"`; `bucketLabel(kind, index, bucket, tz, withYear?)`, `crossesYear(buckets, tz)`; `bucketRange(kind, bucket, tz)` ("Oct 11 08:00–12:00"), AC-32 line from `panels.severity.bucketDetail`; `categoryLegend(byCategory, total)` → `{category, count, color, percent, known}[]`; `severityLegend(buckets)` → `{key: "critical"|"warning"|"suggestion"|"other", count, color}[]`, Other only when > 0; `bucketTotal(b)`.
- **i18n `panels.*`:** `skills.{title, caption, basedOn(n), notRecorded, noSkills, noDataBefore(date), ciOnly}`; `memory.{title, caption, basedOn(n), none}`; `severity.{title, total(n), other, bucketDetail(label, range)}`; `category.{title, centreLabel}`; `findings.{none, ciOnly}`; `loadError`; reuse top-level `retry`.
- `SeverityBars` takes labels from `prReview.severity.{critical,warning,suggestion}`, so tests need both `agentPerformance` and `prReview` messages.
- `BP/` sits at `StatsTab/_components/BreakdownPanels/`, next to `RunHistory`.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | | no new insight written |
| `onion-architecture` | preload | | server-only; G3 is client only |
| `frontend-architecture` | on demand (S7) | S7, S10 | |
| `react-best-practices` | on demand (S7) | S8 | S7 and S10 contain no React |
| `next-best-practices` | on demand (S7) | S8, S9 | S7 has no RSC or route changes |
| `typescript-expert` | on demand (S7) | S7, S8, S10 | |

## Handoffs → G5

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S16 | done (`pnpm typecheck` exit 0) | `server/src/modules/skills/repository.ts` |
| S17 | done (`pnpm typecheck` clean; `check-module.sh skills` ok except pre-existing `fetch`) | `server/src/modules/skills/service.ts`, `server/src/modules/skills/stats.ts` |
| S18 | done (`vitest run skills.it skills-stats`: 2 files, 43 passed; `git diff --quiet HEAD -- '*/vendor/shared/index.ts' agent-runner` clean) | `server/src/modules/skills/routes.ts`, `server/test/skills.it.test.ts` |

## Handoff to the next group
- **Server route:** `GET /skills/:id/stats?period&from&to&tz`, all four required (D9). Returns `SkillStatsPeriod` = `SkillStats` fields + `ever_used`.
- **Window:** `findings_30d`, `runs_with_skill`, `runs_total`, `pull_rate`, `accept_rate` over the requested window, exclusive end (`until` → `lt(ranAt, until)` in `windowedRuns`, `completedRunCount`, `runCountsBySkill`, `findingsBySkill`). `agents`, `agent_count`, `ever_used` not windowed. `everUsed(ws, skillId)`: `LIMIT 1` over `run_skills ⋈ agent_runs`, workspace filter only.
- **Service:** `stats(ws, id, q: PerfQuery)` calls `this.container.agentPerformance.checkWindow(q)` first (D8), then `getById`, then windowed reads. `list()` uses `{ now − 30 d, now }`; `statsWindowStart` removed; `findings_30d` comment in `stats.ts` says "findings in the requested window".
- **Errors:** 422 for bad tz/window/missing query (even unknown skill); 404 unknown skill with a valid query.
- **`GET /skills`:** unchanged behaviour, 30-day rollup.
- **Tests:** existing stats/404 tests in `skills.it.test.ts` send a 30-day query; five new T8 tests cover AC-43 (incl. exclusive end), AC-44, AC-47, AC-48, AC-49. Local `.it` needs `TESTCONTAINERS_RYUK_DISABLED=true`.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S16, S17, S18 | |
| `engineering-insights` | preload | | no insight written |
| `drizzle-orm-patterns` | on demand (read after the fact) | S16 | S17, S18 have no query code |
| `postgresql-table-design` | on demand (read after the fact) | S16 | S17, S18 have no SQL; no schema/index change |
| `typescript-expert` | on demand (read after the fact) | S16, S17, S18 | |
| `zod` | on demand (read after the fact) | S18 | S16 has no schema; S17 imports contract types only |
| `fastify-best-practices` | on demand (read after the fact) | S18 | S16, S17 have no routes |
| `security` | on demand (read after the fact) | S17, S18 | S16 has no input handling |

Skill re-check (after the fact): no code change needed; `run_skills` lookups by `skill_id` use the existing `run_skills_skill_idx`.

## Handoffs → G4

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S11 | done (`pnpm typecheck` exit 0) | `BP/SkillsPanel.tsx` (+new), `BP/MemoryPanel.tsx` (+new), `BP/styles.ts` (+new) |
| S12 | done (`pnpm typecheck` exit 0) | `BP/SeverityBars.tsx` (+new) |
| S13 | done (`pnpm typecheck` exit 0) | `BP/CategoryDonut.tsx` (+new) |
| S14 | done (`vitest run BreakdownPanels`: 2 files, 27 passed) | `BP/BreakdownPanels.tsx`, `BP/index.ts`, `BP/BreakdownPanels.test.tsx` (all +new) |
| S15 | done (`vitest run AgentEditor/_components/StatsTab`: 4 files, 37 passed; typecheck exit 0) | `AST/StatsTab.tsx`, `AST/StatsTab.test.tsx` |

`BP` = `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/_components/BreakdownPanels/`, `AST` = `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/`.

## Handoff to the next group
- `BreakdownPanels({ agentId, sel })` exported from `BP/index.ts`; the agent StatsTab renders it after the tiles in every stats state except a 404; `RunHistory` renders only when stats has data. Loading: the 160 px history skeleton moved from `LoadingState` into the history region; tiles skeleton keeps `aria-busy`. `AST/styles.ts` unchanged.
- The StatsTab test's `serve(result, count, panels)` answers `/stats/breakdown?`; `renderTab()` provides `agentPerformance` and `prReview` messages.
- Memory panel reuses `panels.skills.noDataBefore` and `panels.skills.ciOnly` (no memory-specific keys in G3 copy). Severity detail line uses lowercase `prReview.severity.*` labels; legend labels are CSS-capitalised.
- G6: the Skill StatsTab reuses `PeriodControl`, `parsePeriod`, `THIRTY_DAYS`, `PeriodSel` from `@/components/period-control` and `@/lib/period`, as `AST/StatsTab.tsx` does.
- Not verified: no browser check against the mockups; `BreakdownPanels.test.tsx` prints React "not wrapped in act" warnings (tests pass).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `engineering-insights` | preload | | no new insight to write |
| `onion-architecture` | preload | | client-only group |
| `frontend-architecture` | on demand | S11, S12, S13, S14, S15 | |
| `react-best-practices` | on demand | S11, S12, S13, S14, S15 | |
| `next-best-practices` | on demand | S11, S14, S15 | S12, S13 add no route, server component or metadata change |
| `react-testing-library` | on demand | S14, S15 | |
| `typescript-expert` | on demand | S11, S12, S13, S14, S15 | |
| `security` | on demand | S11 | memory text and skill names render as text nodes, `title` for full text |

## Handoffs → G6

## Steps
| Step / gap | Status | Files changed |
|---|---|---|
| S19 | done (typecheck exit 0 at group end; shared-type-only-imports 1/1) | `client/src/lib/hooks/skills.ts` |
| S20 | done (`jq -e '.stats.findings and .stats.noFindingsInPeriod'` → true; `stats.findings30d` removed, no uses) | `client/messages/en/skills.json` |
| S21 | done (`vitest run SkillEditor`: 6 files, 71 passed; typecheck exit 0) | `client/src/app/skills/[id]/_components/SkillEditor/_components/StatsTab/StatsTab.tsx`, `helpers.ts`, `styles.ts`, `StatsTab.test.tsx`, `client/src/app/skills/[id]/_components/SkillEditor/SkillEditor.test.tsx` |

## Handoff to the next group
- Last group. Full client suite: 2 files failed / 122 passed; 2 tests failed / 865 passed. Failures outside every step's Files, caused by G4's new `/stats/breakdown` request in the Agent StatsTab: `client/src/app/agent-performance/agent-performance.readonly.test.tsx` (~line 90, `get` mock: "unexpected GET /agents/…/stats/breakdown?…") and `agent-performance.period-rejection.test.tsx` (~line 91, "Found multiple elements with the role alert"; `MISSING_MESSAGE agentPerformance`). Each needs a `/stats/breakdown` answer plus `prReview` messages.
- S21 deviations: findings tile period name in a caption under the vendored `MetricCard` (`tileColumn`, `tileCaption` in `styles.ts`); when `runs_with_skill === 0` pull, accept and findings tiles show "—" (AC-46); no `keepPreviousData` (no numbers while loading/error); old skill tests edited for the `(id, sel)` hook, `ever_used`, `next/navigation` and `agentPerformance` messages.
- Review note: `setPeriod` URL logic (~10 lines) duplicated between the Skill and Agent StatsTabs; extraction optional.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | | client-only group, no server layers |
| `engineering-insights` | preload | | no insight written |
| `zod` | on demand | S19 | S20, S21: no schema code |
| `typescript-expert` | on demand | S19, S21 | S20: JSON only |
| `security` | on demand | S19 | S20, S21: no untrusted HTML or input handling beyond text nodes |
| `react-best-practices` | on demand | S19, S21 | S20: JSON only |
| `next-best-practices` | on demand | S19, S20, S21 | |
| `frontend-architecture` | on demand | S21 | S19, S20: no placement question |
| `react-testing-library` | on demand | S21 | S19, S20: no tests |

## Follow-ups
- 2026-10-20 SR-H1: breakdownBucketKind uses Intl.DateTimeFormat({timeZone}); a zone in pg_timezone_names that ICU rejects (posix/...) gives 500 not 422 — map RangeError to ValidationError + test
- 2026-10-20 G4: BreakdownPanels.test.tsx prints React 'not wrapped in act' warnings (tests pass)
- 2026-10-20 G6: setPeriod URL logic (~10 lines) duplicated between Skill and Agent StatsTabs — extract a shared helper
- 2026-10-20 PV-I1: memoryUsage restricts its denominator to ran_at >= memory tracked-since (equivalent today by definition; would drift if the tracked-since definition changes)
- 2026-10-20 PV-H1: the AC-9 .it case empties run_skills for the shared fixture and must stay last in agent-stats-breakdown.it.test.ts — give it its own seed
- 2026-10-20 SELF-M: 9 MEDIUM from pr-self-review (unused Icon import; four role=alert on one failure; double announcement in SeverityBars; inline style; brittle test selectors; skills repo loads rows into Node for up-to-365-day windows; memoryUsage has no LIMIT; tz ICU 500 = SR-H1; setPeriod duplication) — details in .pr-self-review.json
- 2026-10-20 retro P1: skills only on steps whose code they govern; plan-lint warns on React/Next skills on non-JSX .ts — implementation-planner.md, sdd.sh plan-lint
- 2026-10-20 retro P2: steps adding a request list every test that mounts the component; last UI group runs full pnpm test — implementation-planner.md
- 2026-10-20 retro P3: implementer hand-back incomplete until every on-demand skill was read — implementer.md
- 2026-10-20 retro P4: test-writer reverts mutations from a saved copy, not a reverse Edit — test-writer.md
- 2026-10-20 retro P5: ask once before plan pass 2 whether adjacent mockup screens are in scope — stages.md plan-decisions

## Verification log
- 2026-10-20 agent: spec-p1 aa85d4bae96ef2a38 spec-creator 2026-10-20T10:48:47Z
- 2026-10-20 agent: spec-p2 aa85d4bae96ef2a38 spec-creator 2026-10-20T10:54:07Z
- 2026-10-20 agent: research a3d1f3437c78acabc researcher 2026-10-20T11:09:15Z
- 2026-10-20 agent: plan-p1 aaff383bf2962c975 implementation-planner 2026-10-20T11:12:01Z
- 2026-10-20 decisions recorded: TQ1-5 defaults, GAP1 -> spec correction, D1-D6 A, D7 multi-agent
- 2026-10-20 agent: spec-p2 aa85d4bae96ef2a38 spec-creator 2026-10-20T11:15:28Z
- 2026-10-20 spec 016 re-approved after GAP1 (AC-41 added; AC-3/28/29/33/37 changed)
- 2026-10-20 ext-research: skipped — both pass-1 researcher questions were conditional (D3=B not chosen; D6 measurement happens in implementation)
- 2026-10-20 agent: plan-p2 aaff383bf2962c975 implementation-planner 2026-10-20T11:25:57Z
- 2026-10-20 user correction: add the period control (1 day / 30 days / Custom) to Skill → Stats, as on Agent → Stats; spec 016 back to draft
- 2026-10-20 agent: spec-p2 aa85d4bae96ef2a38 spec-creator 2026-10-20T11:37:00Z
- 2026-10-20 spec 016 re-approved with AC-42..AC-49 (Skill → Stats period control, B8-B11)
- 2026-10-20 agent: plan-p2 aaff383bf2962c975 implementation-planner 2026-10-20T11:45:23Z
- 2026-10-20 runner baseline: npm ci + npm run build in agent-runner/ at HEAD 037890c leaves dist/index.js unchanged (bundle fresh before G1)
- 2026-10-20 decisions recorded: D8 A, D9 A; plan approved; plan-approved tree 1cd602d396e7b8aa00bcc5d5f7b08e27050d72bc
- 2026-10-20 agent: implement a02afbbb052e94ec1 implementer 2026-10-20T11:59:12Z
- 2026-10-20 implement G1: done S1-S3; spot-check: index.ts untouched, contract copies identical, T1 28/28; severityBuckets uses bound sql fragments
- 2026-10-20 agent: implement a32ee4af0c17479c0 implementer 2026-10-20T12:02:26Z
- 2026-10-20 agent: implement ac8b7874c0039643f implementer 2026-10-20T12:02:40Z
- 2026-10-20 implement G2: done S4-S6; T3 127 ms (1 s budget); spot-check: agent-stats-breakdown.it 14/14
- 2026-10-20 implement G3: done S7-S10; spot-check: BreakdownPanels/helpers 21/21
- 2026-10-20 agent: implement a1255d25e072d5223 implementer 2026-10-20T12:05:16Z
- 2026-10-20 agent: implement a1255d25e072d5223 implementer 2026-10-20T12:05:44Z
- 2026-10-20 implement G5: done S16-S18; skills read after the fact on request, no code change; spot-check: no ../agent-performance import in skills module (type-only deep-path contract import)
- 2026-10-20 agent: implement a9975241df81ebbd2 implementer 2026-10-20T12:06:01Z
- 2026-10-20 implement G4: done S11-S15; spot-check: AgentEditor + shared-type-only-imports 15 files 127 passed; no dangerouslySetInnerHTML
- 2026-10-20 agent: implement a3619c2f3899737c1 implementer 2026-10-20T12:09:09Z
- 2026-10-20 implement G6: done S19-S21; full client suite 2 failed (agent-performance.readonly / period-rejection tests, outside every step's Files) — plan change needed
- 2026-10-20 plan change G6-F1: two agent-performance tests added to S15 Files; user approved; plan-approved tree f6a4addf10ae624403c167d2b07b1a769ebe4aff
- 2026-10-20 agent: fix-loop a2cfa6c9e6afa9a83 implementer 2026-10-20T12:12:32Z
- 2026-10-20 fix G6-F1: test-only (period refused client-side before any request; panels' alerts came from the unmocked breakdown GET); client 124 files / 867 tests pass
- 2026-10-20 agent: tests aa95514da796c621c test-writer 2026-10-20T12:19:15Z
- 2026-10-20 tests: test-writer extended T2/T8/T5-T7/T9 + hooks (Proof table in report); blocked on a whitespace-only revert slip in BreakdownPanels.tsx
- 2026-10-20 main-session fix: TW-revert — restored the newline at BreakdownPanels.tsx:27 (S14 file); shasum back to 8d74c4d5; client typecheck 0, pnpm test 125 files / 877 passed
- 2026-10-20 it-suite: server pnpm test (unit + .it) 126 files / 1548 passed
- 2026-10-20 M1 design review: live screenshots (review-*.png in assets) vs mockups — panels, bars, donut, period control match; DG1 Skill Findings tile shorter than its row (caption outside the card); DG2 category legend counts pushed to the far right edge
- 2026-10-20 user: fix DG1 and DG2 before review
- 2026-10-20 agent: fix-loop a50785f85dcf23db4 implementer 2026-10-20T12:40:45Z
- 2026-10-20 fix DG1 DG2: styles only (Skill StatsTab styles.ts, BreakdownPanels styles.ts); re-screenshot confirms equal tile heights and legend counts beside labels; SkillEditor+BreakdownPanels 8 files / 103 passed
- 2026-10-20 agent: review a186e9652888c0d38 security-reviewer 2026-10-20T12:42:28Z
- 2026-10-20 agent: review a0647e20679c3f1d1 architecture-reviewer 2026-10-20T12:42:51Z
- 2026-10-20 agent: review a9ca75b814aa6d1ae plan-verifier 2026-10-20T12:45:59Z
- 2026-10-20 review-1: plan-verifier incomplete 190/196 (gaps SP-AC-10/S11, T2, SK7, SK17; R4 sign-off); architecture-reviewer PASS; security-reviewer PASS
- 2026-10-20 agent: fix-loop a72d66903a58dfefd implementer 2026-10-20T12:47:15Z
- 2026-10-20 fix review-1: SP-AC-10/S11 basedOn in noSkills state + T6 assert; T2 AC-9 .it case (tracked_since null); SK7/SK17 skills read, nothing to apply (S7 pure TS; S17 no schemas)
- 2026-10-20 plan change SK7/SK17: removed skills with nothing to do from S7 (react-/next-best-practices) and S17 (zod); user approved; plan-approved tree a389e5e4b3870bf8dc4016214d3e22b7f9647be0
- 2026-10-20 agent: review a9ca75b814aa6d1ae plan-verifier 2026-10-20T13:05:13Z
- 2026-10-20 review-2 (delta): plan-verifier complete 196/196; review iteration 1: fix 4, plan-change 1 (SK7/SK17), trivial 0, follow-up 4, sign-off 0
- 2026-10-20 close: plan done, spec 016 implemented
- 2026-10-20 insights: client/INSIGHTS.md + gotchas (new request breaks tests that mount the component elsewhere); other candidates already recorded (deep-path contract 2026-10-19, tz binding gotchas) or too narrow (DST 4h only testable at repo level; Edit revert swallowing a newline)
- 2026-10-20 agent: docs a39c5aef6f546aad5 doc-writer 2026-10-20T13:08:39Z
- 2026-10-20 docs: docs/agent-performance.md, server/docs/agent-performance.md, client/docs/agent-performance.md updated + index rows; main session filled the 90-day rationale (B5)
- 2026-10-20 self-review: PASS (0 critical, 0 high, 9 medium); gates server 126/1549, client 125/878
- 2026-10-20 metrics: 6.76M weighted tokens, 19 runs, 17 agents; flags F1 implement (1.56M vs median 0.53M), F1 tests (0.87M vs 0.37M); repeat: F1 plans=24,26,28,34,42,43; F3 not raised (header pinned in prompts)
- 2026-10-20 retro-fact: the user added Skill → Stats period scope after plan pass 2 (before approval) — spec reopened for B8–B11, planner correction round added G5/G6
- 2026-10-20 retro-fact: GAP1 (AC-3 vs AC-37) found only by the planner sent the approved spec back to draft once
- 2026-10-20 retro-fact: the G5 implementer handed back without reading its on-demand skills; the main session re-sent it to read them (no code change)
- 2026-10-20 retro-fact: two tests outside every step's Files (app/agent-performance/*) broke from G4's new request; caught only by G6's full client run → plan change G6-F1
- 2026-10-20 retro-fact: a test-writer break-check revert dropped a newline in BreakdownPanels.tsx; shasum guard blocked it, main-session fix restored it
- 2026-10-20 retro-fact: SK7/SK17 (skills listed on steps with nothing to do) needed a plan change, same pattern as plan 42 P3 and root INSIGHTS 2026-09-29
- 2026-10-20 retro-fact: naming the step-table header in every implementer prompt kept handback-check green on all 6 groups (no F3)
- 2026-10-20 retro-fact: M1 live screenshots found DG1/DG2 that 877 green jsdom tests missed
- 2026-10-20 retro: docs/plans/assets/agent-stats-breakdown/workflow-retro.md
- 2026-10-20 eval:workflow: 8/9 passed; only 'server task … server/AGENTS.md' fails — same pre-existing low-pass case as plan 42 (13/37 historically); this plan edited only client/insights/gotchas.md
- 2026-10-20 brainstormer: docs/ideas/10-sdd-f1-repeat-after-43.md (go Opt1 = 09 Opt1 + size normaliser for tests)
- 2026-10-20 agent: handover a0520fb56a12385f6 brainstormer 2026-10-20T13:21:32Z

## Tests → Proof (test-writer, 2026-10-20)
Break checks: each mutation was applied to production code, the named test failed, and the file was reverted to its recorded shasum (all eight server/client subjects verified; `BreakdownPanels.tsx` restored by main-session fix TW-revert, shasum `8d74c4d5`).

| AC / test | File : test | Break check (mutation → result) |
|---|---|---|
| Child-row workspace filter, run_skills → skills | `agent-stats-breakdown.it.test.ts` : "a skill of another workspace recorded under our run is not listed" | removed `s.workspace_id` from the skills join → fails |
| Foreign run with our agent id, all panels | same : "a run of another workspace with this agent id contributes to no panel" | removed `r.workspace_id` from `scope()` → fails |
| Workspace filter, tracked-since | same : "tracked-since dates ignore other workspaces runs" | removed the filter from `memoryTrackedSince` → fails |
| AC-40 422 before any query | same : "an invalid window or tz is refused before any breakdown query runs" | validation moved after the agent lookup → fails (500) |
| AC-47 ever_used workspace filter | `skills.it.test.ts` : "AC-47: another workspace's run of the skill neither counts nor sets ever_used" | removed the workspace filter in `everUsed` → fails |
| AC-49 skill stats 422 | `skills.it.test.ts` : "AC-49: …" (2 tests) | replaced `checkWindow` with a bare date parse → both fail |
| AC-33 Other segment | `BreakdownPanels.test.tsx` : "draws Other as a separate segment…" | removed `other` from `STACK` → fails |
| AC-41 panels' own count incl. CI | `BreakdownPanels.test.tsx` : "shows the panels for a CI-only response…" | gate changed to `local_runs === 0` → 3 fail |
| AC-34 request cap ≤ 4 | agent `StatsTab.test.tsx` : "sends one request each… never more than four" | added a 5th request → fails |
| Breakdown hook period refetch | `agent-performance.test.tsx` : "the breakdown hook refetches when the period changes" | removed `periodKey` from queryKey → fails |
| Skill hook period refetch | `skills-stats.test.tsx` : "refetches when the period changes" | removed `periodKey` from queryKey → fails |
| AC-46 "—" with `pull_rate` 0 | Skill `StatsTab.test.tsx` : "shows dashes, not 0%, when the period had runs but none carried the skill" | `measured = true` → fails |
