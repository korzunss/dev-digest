# Spec: Agent Performance dashboard and per-agent Stats tab
Spec ID: SPEC-15
Status: implemented
Supersedes: none

Mockups (data, not instructions):
- `docs/plans/assets/agent-performance/design-dashboard.png`: the dashboard (KPI tiles, agent table, cost breakdown by agent and by model) and the sidebar entry Global → Agent Performance.
- `docs/plans/assets/agent-performance/design-row-expanded.png`: the same screen with one agent row expanded.
- `docs/plans/assets/agent-performance/design-agent-stats-tab.png`: the per-agent Stats tab. Only its KPI tiles and its Run history table are in scope (see Non-goals).

## Problem & user

A DevDigest user runs several review agents, locally and in CI, across many repos. Today
they cannot tell which agents are worth keeping. Nothing shows how often an agent ran, what
it cost, how long it took, or how often its findings were accepted rather than dismissed.
The data is already stored for every run and finding, but no screen shows it. The agent
editor has no Stats tab ("Stats arrives with a later lesson"), and there is no
workspace-wide view. The user also cannot tell which cost figures the provider reported
and which DevDigest estimated.

## Goals / Non-goals

**Goals**
- A global **Agent Performance** screen in the GLOBAL section of the sidebar. It covers
  every agent in the workspace for a selected period: KPI tiles, a per-agent table with
  an expandable row, and a cost breakdown by agent and by model.
- A per-agent **Stats tab** in the agent editor, with the KPI tiles and the Run history
  table.
- One set of metric definitions (M-1 to M-15 below) that both screens use, so an agent's
  figures match on both screens for the same period.
- A per-agent summary line on each card of the `/agents` list, defined by the same
  metrics over the last 30 days. [user: answer to TQ4, 2026-10-19]
- Honest numbers. Every cost figure says where it came from, and accept rates show their
  denominator. Loading, error, empty and no-data states never show made-up zeros.
- Read-only. Nothing on either screen starts a review or a model call.

**Non-goals**
- **Billing reconciliation (follow-up).** v1 does not import provider invoices, CSV
  exports or provider usage APIs, and shows no "reconciled" cost. Cost is split only by
  the stored `cost_source` (M-4). [user: answer to B3, 2026-10-19]
- The Stats-tab panels Most-used skills, Most-pulled memory, Findings by severity and
  Findings by category (follow-up). [user: answer to B1, 2026-10-19]
- Counting failed or cancelled runs in any metric (M-1). [user: answer to B2, 2026-10-19]
- Scoping the dashboard to the repo chosen in the repo picker. The dashboard is
  workspace-wide. [user: answer to B5, 2026-10-19]
- Adding the Memory sidebar item that the mockup shows above Multi-Agent Review.
- Editing agents, enabling or disabling them, or running reviews from either screen.
- Persisting sort order or row expansion across reloads.

## User stories

- As a workspace owner, I want one screen that ranks my agents by runs, cost, duration and
  accept rate over a period I choose, so that I can decide which agents to keep, tune or
  remove.
- As a workspace owner, I want to see how total cost splits by agent and by model, and
  which part is provider-reported and which is estimated, so that I don't take an estimate
  for a bill.
- As an agent author, I want a Stats tab on my agent with its KPIs and run history, so
  that I can check whether a prompt or skill change made the agent better or worse.
- As a reader of an accept rate, I want to see how many decisions it is based on, so that
  I don't trust a rate built on three findings.

## Acceptance criteria (EARS)

### Period and run selection

- AC-1: The system SHALL offer three periods on both screens: "1 day" (the rolling 24 h
  ending now), "30 days" (the rolling 30 × 24 h ending now) and "Custom" (an inclusive
  start and end date, interpreted in the browser's time zone). [user: answer to B4, 2026-10-19]
- AC-2: WHEN a screen opens with no period in its URL, the system SHALL use "30 days".
- AC-3: WHEN the user changes the period, the system SHALL record it in the page URL, so
  that a reload or a shared link reopens the same period.
- AC-4: IF a custom range ends in the future, starts after it ends, or is longer than 365
  days, THEN the system SHALL reject it with an inline message and keep showing the
  previous valid period's data.
- AC-5: The system SHALL define the **previous period** as the period of equal length that
  ends where the selected period starts. Every delta (M-13, M-14) compares against it.
  [user: answer to B8, 2026-10-19]

### Metric definitions (the single source both screens refer to)

`AC-Mn` is referred to as `M-n` everywhere else in this spec. No other AC restates a
definition; it cites the `M-n` instead.

- AC-M1 (**counted run**): The system SHALL count an agent run in a period only when its
  status is `done` and its `ran_at` is inside the period, from both sources (local and
  CI). Failed, cancelled and still-running runs SHALL NOT count in any metric other than
  M-15, which only reports how many were left out. The label
  on screen SHALL say "successful runs". [user: answer to B2, 2026-10-19]
- AC-M2 (**Runs**): The system SHALL report Runs as the number of counted runs.
- AC-M3 (**Total cost**): The system SHALL report Total cost as the sum of `cost_usd`
  over the counted runs whose cost is known (not null). A cost of 0 is a known free run.
  The figure SHALL carry the number of counted runs with unknown cost, shown as "N runs
  without cost; total is a lower bound" whenever N > 0. [user: answer to B3, 2026-10-19]
- AC-M4 (**cost provenance**): The system SHALL split every known cost into three parts,
  each labelled on screen:
  - "provider-reported" (`cost_source = api`);
  - "DevDigest estimate" (`cost_source = estimate`, shown with a `~` prefix);
  - "source not recorded" (known cost with no `cost_source`, which is how CI runs are
    stored today).

  The cost area SHALL state that reconciled billing data is not available.
  [user: answer to B3, 2026-10-19]
- AC-M5 (**Avg cost**): The system SHALL report Avg cost as Total cost (M-3) divided by
  the number of counted runs whose cost is known, or "—" when that number is 0.
- AC-M6 (**Avg duration**): The system SHALL report Avg duration as the mean `duration_ms`
  over the counted runs whose duration is known, or "—" when none is known.
- AC-M7 (**decided finding**): The system SHALL treat a finding as belonging to a counted
  run when it belongs to a review produced by that run. All finding kinds count. A finding
  is *accepted* when `accepted_at` is set, *dismissed* when only `dismissed_at` is set,
  and *pending* otherwise. A decision counts with its run's period, whenever the decision
  was made. [user: answer to B4, 2026-10-19]
- AC-M8 (**Accept rate**): The system SHALL report an agent's Accept rate as
  accepted ÷ (accepted + dismissed) over its counted runs' findings. Next to it the
  system SHALL show the denominator ("n = 12") and the number of counted runs. When the
  denominator is 0, the system SHALL show "No decisions yet" instead of a percentage.
- AC-M9 (**small sample**): WHERE an agent's Accept-rate denominator is between 1 and 9,
  the system SHALL mark the rate "small sample" next to its "n = …".
  [user: answer to B6, 2026-10-19]
- AC-M10 (**Avg accept rate**): The system SHALL report the workspace Avg accept rate as
  the pooled accepted ÷ (accepted + dismissed) over all counted runs in the period
  (deleted agents included), with its denominator shown, or "No decisions yet" when the
  denominator is 0. It is not a mean of per-agent rates.
  [user: answer to B7, 2026-10-19]
- AC-M11 (**Most-active agent**): The system SHALL name as Most-active agent the existing
  agent with the most counted runs in the period, with "<runs> runs · <accept rate>"
  under the name. Ties go to the agent with the more recent last run, then to the name
  in alphabetical order. The Deleted agents row (AC-14) is never Most-active.
- AC-M12 (**Last run**): The system SHALL report an agent's Last run as the newest
  `ran_at` among its counted runs in the period, shown as relative time, or "—" when it
  has none.
- AC-M13 (**cost delta**): The system SHALL show a cost delta as the current figure minus
  the same figure over the previous period (AC-5). A decrease is presented as favourable
  and an increase as unfavourable. The system SHALL omit the delta when the previous
  period has no counted runs with known cost. [user: answer to B8, 2026-10-19]
- AC-M14 (**accept-rate trend**): The system SHALL show ↑ or ↓ next to an agent's Accept
  rate when its rate in the previous period is not null and differs from the current
  one. No arrow is shown when the rates are equal or either is null.
  [user: answer to B8, 2026-10-19]
- AC-M15 (**runs not counted**): The system SHALL report Runs not counted as the number
  of finished runs that are not `done` (status `failed` or `cancelled`), with `ran_at` in
  the period, in the same scope as the M-2 figure they accompany (both sources). Runs
  still in progress are not included. [user: accepted SG2, 2026-10-19]

### Agent Performance screen

- AC-6: The system SHALL list "Agent Performance" in the sidebar's GLOBAL section, between
  Multi-Agent Review and CI Runs, opening `/agent-performance`, and SHALL highlight it while
  that route is open. (This is the sanctioned hand-edit of the vendored
  `client/src/vendor/ui/nav.ts`, recorded here per `client/insights/gotchas.md`; a vendor
  refresh drops it.)
- AC-7: The system SHALL compute the screen over every repo of the current workspace and
  ignore the repo picker. [user: answer to B5, 2026-10-19]
- AC-8: The system SHALL show four KPI tiles:
  - Total runs: M-2, all agents, with a sparkline of counted runs per bucket. A bucket is
    an hour when the period is "1 day", otherwise a calendar day in the browser's time
    zone. The tile also carries the AC-8a note.
  - Total cost: M-3, with its M-4 split and its M-13 delta.
  - Avg accept rate: M-10, with a ring showing the same percentage.
  - Most-active agent: M-11.
- AC-8a: WHERE M-15 is greater than 0 for the period, the system SHALL show a muted
  "+N failed runs not counted" note (N = M-15) beside the Total runs figure, on the
  dashboard (whole workspace) and on the Stats tab (that agent). It SHALL show no note
  when M-15 is 0. Table rows carry no such note. [user: accepted SG2, 2026-10-19]
- AC-9: The system SHALL show a table with one row per existing agent of the workspace,
  disabled agents included. Its columns are Agent, Runs (M-2), Avg cost (M-5), Avg
  duration (M-6), Accept (M-8, M-9, M-14), Last run (M-12) and View.
  [user: answer to B5, 2026-10-19]
- AC-10: WHEN the table first renders, the system SHALL sort it by Accept rate,
  descending.
- AC-11: WHILE the table is sorted by Accept rate, the system SHALL order the rows in
  three groups: first the agents with 10 or more decisions, by rate; then the small-sample
  agents (M-9), by rate; then the agents with no rate. The Deleted agents row comes last.
  [user: answer to B6, 2026-10-19]
- AC-12: WHEN the user activates a sortable column header (Runs, Avg cost, Avg duration,
  Accept, Last run), the system SHALL sort by that column, and a second activation SHALL
  reverse the order. Rows with no value for that column sort last in either direction.
- AC-13: WHILE an agent has no counted runs in the period, the system SHALL show its row
  with "No runs in this period" in place of the metric cells, not zeros.
- AC-14: WHERE counted runs in the period have no agent (the agent was deleted), the
  system SHALL show one "Deleted agents" row that aggregates them with the same
  definitions, so that the per-agent rows add up to the KPI totals.
  [user: answer to B5, 2026-10-19]
- AC-15: WHEN the user activates a row that has counted runs in the period (an agent row
  or the Deleted agents row), the system SHALL expand it in place and show:
  - a sparkline of the durations of that row's newest 5 counted runs in the period,
    oldest to newest;
  - the line "last N runs · avg <M-6 over those runs> · <M-5 over those runs>", where
    N ≤ 5 is the number of runs shown.

  Activating the row again SHALL collapse it. A "No runs in this period" row (AC-13) does
  not expand. [user: answer to B8, 2026-10-19] [user: answer to GAP3, 2026-10-19]
- AC-16: WHEN the user activates View on an agent row, the system SHALL open that agent's
  Stats tab with the same period. Every agent row offers View, whether it is expanded or
  collapsed and including a "No runs in this period" row. The Deleted agents row offers
  no View. [user: answer to GAP3, 2026-10-19]
- AC-17: The system SHALL show the cost breakdown as two charts: by agent (one segment per
  agent row with known cost, Deleted agents included) and by model (one segment per
  stored `model` value, with "Unknown model" for runs that recorded none). Each chart has
  a legend with amounts, and each chart's amounts SHALL sum to Total cost (M-3).
- AC-17a: WHERE a cost breakdown contains more than one M-4 provenance, the system SHALL
  show each segment's amount with its provenance distinguishable (the `~` prefix for
  estimate), so that the estimated share is visible per agent and per model.
- AC-18: WHILE the workspace has no counted runs in the selected period, the system SHALL
  show one empty state for the whole screen ("No successful runs in this period"),
  together with the AC-8a note when M-15 > 0. It SHALL NOT render zero-valued tiles,
  table rows or charts.
- AC-18a: WHERE an empty state (AC-18 on the dashboard, AC-25 on the Stats tab) is shown,
  the selected period is not "30 days", and the "30 days" period has counted runs in the
  same scope, the system SHALL offer "Try 30 days" with that period's M-2 count
  ("Try 30 days — 42 runs"). Activating it selects "30 days" (AC-3). The suggestion is
  omitted when "30 days" is already selected or has no counted runs.
  [user: accepted SG4, 2026-10-19]
- AC-19: WHILE the workspace has no agents at all, the system SHALL show a distinct empty
  state that points to the Agents page.

### Agent Stats tab

- AC-20: The system SHALL add a Stats tab to the agent editor, next to the existing tabs,
  with the same period control as the dashboard (AC-1 to AC-4).
  [user: answer to B1, 2026-10-19]
- AC-21: The system SHALL show four KPI tiles on the Stats tab: Total runs (M-2, with the
  AC-8 sparkline rule), Avg cost / run (M-5 with its M-13 delta and its M-4 provenance),
  Avg duration (M-6) and Accept rate (M-8, M-9, with a ring).
- AC-22: For the same agent and the same period, the system SHALL show identical Runs,
  Total cost, Avg cost, Avg duration, Accept rate and denominator values on the Stats tab
  and on that agent's dashboard row.
- AC-23: The system SHALL show a Run history table of the agent's counted runs in the
  period, newest first, with these columns:
  - Timestamp (`ran_at`);
  - PR (the PR number, or "—" when the run has none);
  - Tokens (tokens in + out, or "—");
  - Cost (with its M-4 provenance, or "—");
  - Findings (the run's findings count, or "—");
  - Source (`local` or `CI`);
  - View trace.

  The table SHALL load its first 50 rows with the screen.
  [user: answer to GAP1, 2026-10-19]
- AC-23a: WHERE the period has more counted runs than the table shows, the system SHALL
  offer "Load more". Each activation appends the next 50 older counted runs, continuing
  from the last row shown (cursor-based, so runs arriving meanwhile neither repeat nor
  shift rows). "Load more" disappears once every counted run of the period is shown.
  IF a "Load more" request fails, THEN the system SHALL keep the rows already shown and
  offer a retry beside the button. [user: answer to GAP1, 2026-10-19]
- AC-24: WHEN the user activates View trace on a run, the system SHALL open that run's
  stored trace in the existing run-trace view. IF the run has no stored trace (e.g. a CI
  run), THEN the system SHALL show "No trace stored for this run" instead of an error.
- AC-25: WHILE the agent has no counted runs in the period, the system SHALL show one
  "No runs in this period" state in place of the tiles and the table, without zeros,
  together with the AC-8a note when M-15 > 0 and the AC-18a suggestion when it applies.

### Agent list cards

- AC-30: The system SHALL show on each agent card of the `/agents` list the line
  "<M-2> runs · <M-8> accept · <M-5> avg" (as in `design-agent-stats-tab.png`),
  computed over the "30 days" period (AC-1) for that agent. The accept part follows M-8
  and M-9, and the avg part follows M-5 with its M-4 provenance (the `~` prefix for an
  estimate). [user: answer to TQ4, 2026-10-19]
- AC-31: For the same agent, the system SHALL show on its card the same Runs, Accept rate
  and Avg cost as its Stats tab and its dashboard row over "30 days" (AC-22).
- AC-32: WHILE an agent has no counted runs in the last 30 days, its card SHALL show "No
  runs in 30 days" instead of the line. WHILE the figures are loading, the card SHALL show
  a placeholder in place of the line. IF loading them fails, THEN the card SHALL omit the
  line and stay fully usable (select, toggle, delete). None of these states shows zeros.
  [user: answer to TQ4, 2026-10-19]

### Loading, errors, read-only

- AC-26: WHILE a screen's data is loading, the system SHALL show placeholders (skeletons),
  never numbers.
- AC-27: IF loading a screen's data fails, THEN the system SHALL show an error state with
  a retry action and no metric values, and SHALL keep the period control usable.
- AC-28: WHEN the user reloads, changes the period, sorts, expands or collapses a row,
  opens View, activates "Load more", opens a trace, or opens the `/agents` list, the
  system SHALL only read stored runs, findings and traces. It SHALL NOT start a review, a run, or a call to any model provider.
- AC-29: IF a requested agent id does not exist in the current workspace, THEN the system
  SHALL answer the Stats request with not-found, and the Stats tab SHALL show the editor's
  existing not-found state.

## Edge cases

- **A finding that is both accepted and dismissed** (both timestamps set): it counts as
  accepted (M-7), the same as the existing skill Stats rule.
- **A run with cost but no `cost_source`** (every CI run today): its cost counts in M-3 as
  "source not recorded" (M-4). It is never shown as provider-reported or as an estimate.
- **CI runs carry no reviews or findings**: they count in Runs, cost and duration, but add
  nothing to any accept-rate denominator. An agent with only CI runs shows "No decisions
  yet".
- **All counted runs have unknown cost**: Total cost shows "—" with "N runs without cost",
  not $0.00. The breakdown charts show "No cost recorded in this period".
- **A model the price book doesn't know**: the cost is null, so the run is counted in the
  "runs without cost" note.
- **Several models for one agent in the period** (the model was changed): the by-model
  chart splits that agent's cost across the models; the by-agent chart keeps it whole.
- **An agent created or deleted mid-period**: an agent created mid-period shows only its
  own runs. The runs of a deleted agent move to the Deleted agents row.
- **"1 day" with a single run**: the sparkline shows one non-zero bucket. The expanded row
  shows "last 1 run".
- **Only failed runs in the period**: the empty state shows, with the "+N failed runs not
  counted" note (AC-8a), so the user can tell "the agent ran and failed" from "it never
  ran".
- **A custom range that is entirely in the past and empty**: "Try 30 days" (AC-18a)
  appears only if the last 30 days have counted runs.
- **No previous-period data**: deltas and arrows are omitted, never shown as +100% or as
  a change from $0.
- **A run finishing while the screen is open**: it appears on the next load or period
  change. There is no live update.
- **A custom range in a time zone with a DST change**: the bounds come from the browser's
  local dates, so the day buckets follow local days.
- **A very long agent or model name**: truncated with the full text on hover. The name is
  rendered as text, never as markup.

## Non-functional requirements

- **Performance**: for a workspace with 20 agents and 10 000 counted runs in a 30-day
  period, each screen's data request SHALL complete within 1 s on the local stack. Each
  screen SHALL load its data in at most three requests: the selected period, the previous
  period's deltas, and (only for the AC-18a suggestion) the "30 days" run count. The Stats
  tab's first 50 Run history rows load within that cap. Each user-initiated "Load more"
  (AC-23a) is one further request of at most 50 rows, outside the cap.
  [user: answer to GAP1, 2026-10-19] The agents list loads the figures for all of its
  cards (AC-30) in one request.
- **No model calls / cost**: both screens are pure reads of stored data (AC-28) and cost
  nothing to view.
- **Security**: the endpoints are read-only aggregates, scoped to the current workspace.
  They return no secrets, prompts or finding text, so their exposure on the LAN-bound API
  (`server/insights/gotchas.md`, "Every route is reachable from the LAN") leaks only
  counts, costs and agent and model names.
- **Accessibility**: the sparklines, the ring and the donut charts each have a text
  equivalent (a label or a legend with values). Sort headers and row expansion work from
  the keyboard and expose their state (sorted direction, expanded or collapsed).
- **i18n**: all copy comes from `next-intl` namespaces. The existing `agentPerformance`
  namespace predates this spec and its strings do not match the mockups.
- **Precision**: every money amount on these screens uses the studio-wide cost format of
  spec 001 (`formatCostUsd`):
  - 2 dp from $1;
  - adaptive precision below $1, with up to 4 dp below $0.01 (e.g. "$0.0013"), so a
    sub-cent amount never reads "$0.00";
  - "—" for unknown and `~` for an estimate.

  A total and its breakdown parts are computed from the same unrounded values; only the
  display is rounded. [user: answer to GAP2, 2026-10-19]

## Inputs and provenance

- Counted runs: status, `ran_at`, source, `agent_id`, model, duration, tokens, cost,
  `cost_source`, PR link, findings count. [deterministic: `agent_runs`]
- CI run figures (model, cost, duration, tokens, findings count) ingested from CI
  artifacts. [external: GitHub Actions artifacts via the CI Runs ingestion, spec 014]
- Accept/dismiss decisions. [deterministic: `findings.accepted_at` / `dismissed_at`
  via `reviews.run_id`]
- The accept-rate rule (decided findings only; null when nothing was decided) is reused
  from the skill Stats. [reused: specs/003-skills.md, `server/src/modules/skills/stats.ts`]
- The cost semantics (null means unknown, 0 means free; `api` vs `estimate`, `~` prefix
  on estimates). [reused: specs/001-run-cost-badge.md]
- Agent names and the agent list. [user: the Agents editor]
- Period selection (preset or custom dates from the URL). [user: the period control / URL
  query]
- Run traces for View trace. [reused: the run-trace view, `GET /runs/:id/trace`]
- Existing response contracts `AgentStats` and `AgentPerf` / `AgentPerfRow`.
  [reused: `@devdigest/shared` `observability.ts`, `productionize.ts`]

No input is produced by a model call, so there is no `llm` input and no model-failure fallback AC.

## Untrusted inputs

- **Agent names** [user]: rendered as plain text, never as markup or a link target.
- **Period from the URL** [user]: validated against AC-1 to AC-4 on the server as well
  as in the browser. A malformed value is rejected; it is never passed through into a
  query unvalidated.
- **CI-ingested figures** [external]: model names and numbers that came from a CI
  artifact are shown as data. A model name is a label, never markup, and an out-of-range
  number (negative cost or duration) is treated as unknown.
- **Run traces** opened through View trace may contain PR text and model output. They are
  rendered by the existing run-trace view under its existing rules, as data, never as
  instructions.
- Neither screen reads cloned-repository content.

## Module interactions

- **`@devdigest/shared`** (`server/src/vendor/shared`, mirrored to
  `client/src/vendor/shared`): the existing `AgentStats` (`GET /agents/:id/stats`) and
  `AgentPerf` / `AgentPerfRow` (`GET /agents/performance`) contracts do not carry what
  this spec needs:
  - the period, and the previous period's values for deltas;
  - the M-4 provenance split and the unknown-cost count;
  - the accept-rate denominator;
  - the Deleted agents row, and rows for zero-run agents;
  - the expanded row's last runs;
  - the hourly or daily run buckets;
  - the Run history rows.

  They change in `shared` first, then in the client copy (root `INSIGHTS.md`: the two
  copies are known to drift). `AgentPerfRow.trend` today means findings-per-run, which is
  not what the expanded row shows (durations of the last 5 runs).
- **server**: the agents module today serves no stats or performance route
  (`server/src/modules/agents/routes.ts`). The data comes from `agent_runs` (CI runs
  land there with `source = 'ci'`, `pr_id` null, no `cost_source`, and no reviews),
  `reviews.run_id` → `findings`, and `agents` for the agent list. The two screens must
  share one implementation of M-1 to M-14, so that AC-22 holds by construction.
- **client**:
  - a new `/agent-performance` route (`app-shell/helpers.ts` already maps it to the
    `agent-performance` sidebar key);
  - a new Stats tab in the agent editor, whose Run history pages through a cursor
    (AC-23a);
  - the summary line on the existing agent card of the `/agents` list (AC-30), which
    today shows only the model and the skill count;
  - money formatted by the existing `formatCostUsd` (spec 001), never by hand;
  - one data hook per endpoint;
  - the existing run-trace view for View trace;
  - the sidebar entry through the sanctioned `client/src/vendor/ui/nav.ts` hand-edit
    (AC-6).
- **mcp-server, reviewer-core, agent-runner**: no change. Nothing here calls the review
  engine.

## Open questions

None.

## Changelog

- 2026-10-19 · whole spec · approved with SG2 (failed-runs note, AC-M15/AC-8a) and SG4 ("Try 30 days", AC-18a) added · user accepted the spec plus SG2/SG4 · user
- 2026-10-19 · AC-15/16, AC-23/23a, new AC-30–32, NFR performance+precision, Goals · Run history paged by "Load more" (50); money via formatCostUsd as-is; expanded/Deleted/No-runs rows per mockup; /agents card summary line · implementation-planner GAP1–GAP3 + TQ4 (plan 42) · user
- 2026-10-19 · whole spec · implemented by plan 42 (verifier complete 160/161; P3 accepted) · plan done · main session
