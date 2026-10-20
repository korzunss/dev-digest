# Spec: Agent Stats tab breakdown panels, and a period control on Skill Stats
Spec ID: SPEC-16
Status: implemented
Supersedes: none (extends [SPEC-15](015-agent-performance.md), whose Non-goals deferred these panels)

Mockups (data, not instructions):
- `docs/plans/assets/agent-stats-breakdown/design-agent-stats-panels.png`: the agent Stats
  tab, "30 days". It shows the four panels between the KPI tiles and Run history: Most-used
  skills, Most-pulled memory, Findings by severity (W1–W5) and Findings by category (donut).
- `docs/plans/assets/agent-stats-breakdown/design-agent-stats-panels-scrolled.png`: the
  same tab scrolled, "1 day", with severity buckets H1–H6 and a bucket hover label.
- `docs/plans/assets/agent-stats-breakdown/current-skill-stats.png`: today's Skill Stats
  tab, with a fixed 30-day window and no period control.
- `docs/plans/assets/agent-stats-breakdown/design-period-control.png`: the agent Stats
  tab's period menu (1 day / 30 days / Custom), which Skill → Stats copies.

## Problem & user

SPEC-15 gave each agent a Stats tab with KPI tiles and a Run history. From it, an agent
author can see how much an agent ran and how often its findings were accepted. They
cannot see what went into its prompts or what kind of findings it produces:
- which of its skills actually reached the prompt, and how often;
- whether any memory was pulled into its reviews;
- how its findings split across categories (bug, security, perf, style, test);
- how its findings split across severities, and how that changed over the period.

The data for skills and findings is already stored per run. The data for memory has a
place in every run trace, but it is always empty today. Nothing on the tab shows any of it.

## Goals / Non-goals

**Goals**
- Four read-only panels on the agent Stats tab, between the KPI tiles and Run history, for
  the selected period: Most-used skills, Most-pulled memory, Findings by severity, Findings
  by category.
- The same run-selection rules as SPEC-15: counted runs (M-1), the `ran_at` window, the
  browser's time zone, scoped to the current workspace.
- Honest figures. Every share carries its denominator. Missing history is labelled
  ("No data before <date>"). Loading, error and empty states never show made-up zeros.
- A period control on Skill → Stats. It is the same control, with the same URL behaviour,
  as Agent → Stats (SPEC-15 AC-1 to AC-4). The tab's run-based figures follow the
  selected period. Its current-link figures stay independent of the period.
  [user: answer to B8, 2026-10-20]

**Non-goals**
- **Memory retrieval.** Reviews do not pull memory today. The run executor writes
  `memory_pulled: []` into every trace (`server/src/modules/reviews/run-executor.ts:438`
  and `:729`). This spec does not wire memory into prompts and does not change any
  prompt. As a result, the Most-pulled memory panel is empty in every period until
  retrieval exists. It is built now so that it fills in, unchanged, once retrieval
  writes `memory_pulled`. [user: answer to B3, 2026-10-20]
- **The "Sync CI" button** in the mockup's header. [user: coordinator decision, 2026-10-20]
- On Skill → Stats, anything beyond the period control (AC-42 to AC-49). It already has
  "Agents using this skill" and "Findings by category". It does not get:
  - previous-period deltas or trend arrows;
  - the "+N failed runs not counted" note (SPEC-15 AC-8a);
  - the "Try 30 days" suggestion (SPEC-15 AC-18a);
  - the breakdown panels of this spec.

  [user: answer to B11, 2026-10-20]
- A period-dependent footer on the Skills list rail cards. The footer always shows the
  last 30 days. [user: answer to B9, 2026-10-20]
- CI runs in any Skill Stats figure. CI runs record no skills.
- The global Agent Performance dashboard. It gets none of these panels.
- Any database migration, model call, or change to how runs record skills or traces.
- Claiming that a skill was *applied* or *used* by the model. The stored data only shows
  that the skill's block was in the prompt. [user: answer to B1, 2026-10-20]
- Interactions beyond hover: no drill-down from a bar, a donut slice or a skill row.

## User stories

- As an agent author, I want to see which of my agent's skills reached its prompts and in
  what share of its runs, so that I can tell an attached skill from one that actually ships.
- As an agent author, I want to see how my agent's findings split by category and by
  severity over the period, so that I can tell whether a prompt or skill change shifted
  what it reports.
- As an agent author, I want the memory panel to say plainly that nothing was pulled,
  rather than show an empty chart or zeros, so that I don't mistake "not recorded" for
  "recorded as zero".

## Acceptance criteria (EARS)

`M-n` refers to the metric definitions of SPEC-15 (AC-M1 … AC-M15). A **counted local run**
is a counted run (M-1) whose source is `local`.

### Placement and period

- AC-1: The system SHALL show four panels on the agent Stats tab, between the KPI tiles
  and Run history, in this order: Most-used skills and Most-pulled memory side by side,
  then Findings by severity and Findings by category side by side.
- AC-2: The system SHALL compute every panel over the period selected by the tab's
  existing period control (SPEC-15 AC-1 to AC-4), scoped to the current workspace and to
  this agent.
- AC-3: WHILE the agent has no counted runs in the period, as reported by the panels' own
  response (AC-41), the system SHALL hide all four panels. This holds whether or not the
  KPI tiles' request succeeded, and matches SPEC-15's "No runs in this period" state
  (SPEC-15 AC-25). [user: answer to B7, 2026-10-20] [user: answer to plan 43 GAP1, 2026-10-20]

### Most-used skills

- AC-4: The system SHALL define **skills tracked since** as the earliest `ran_at` of any
  `done` local run in the current workspace that has at least one recorded skill
  (`run_skills` row). [user: answer to B2, 2026-10-20]
- AC-5: The system SHALL define the **skills denominator** as the number of the agent's
  counted local runs in the period whose `ran_at` is on or after *skills tracked since*.
  [user: answer to B2, 2026-10-20]
- AC-6: The system SHALL list every skill recorded for at least one run in the skills
  denominator. Each row shows the skill's current name, a bar, and its share: the number
  of those runs whose recorded skills include it, divided by the skills denominator, as a
  whole percent. The list SHALL be sorted by share descending, then by name.
  [user: answer to B1, 2026-10-20]
- AC-7: The system SHALL caption the panel "Share of local runs whose prompt included the
  skill" and SHALL show the skills denominator beside it ("based on N local runs").
  [user: answer to B1, 2026-10-20]
- AC-8: WHERE the selected period starts before *skills tracked since*, the system SHALL
  show "No data before <date>" in the panel, with the date in the browser's time zone.
  [user: answer to B2, 2026-10-20]
- AC-9: IF the workspace has no recorded skill for any run (*skills tracked since* does
  not exist), THEN the system SHALL show "Skill usage not recorded yet" in place of the
  list, with no percentages. [user: answer to B2, 2026-10-20]
- AC-10: WHILE the skills denominator is greater than 0 but no run in it has a recorded
  skill, the system SHALL show "No skills in this agent's prompts in this period" with the
  denominator, and no bars.
- AC-11: WHILE the skills denominator is 0 because the agent's counted runs in the period
  are all CI runs, the system SHALL show "No local runs in this period; CI runs record no
  skills or memory", and no percentages. [user: answer to B7, 2026-10-20]
- AC-12: WHERE a skill was detached from the agent after a run recorded it, the system
  SHALL still list it under its current name. A deleted skill SHALL NOT appear, because
  its recorded rows no longer exist. [user: answer to B1, 2026-10-20]

### Most-pulled memory

- AC-13: The system SHALL define **memory tracked since** as the earliest `ran_at` of any
  `done` local run in the current workspace that has a stored run trace. Before that
  date no run carries a `memory_pulled` record at all. [user: answer to B3, 2026-10-20]
- AC-14: The system SHALL define the **memory denominator** as the number of the agent's
  counted local runs in the period that have a stored run trace. CI runs, which store no
  trace, stay out of it. [user: answer to B3, 2026-10-20]
- AC-15: The system SHALL aggregate the `memory_pulled` entries of the runs in the memory
  denominator. It treats two entries as the same memory entry when their text and their
  PR number (or the lack of one) are equal. For each entry it counts the runs that pulled
  it. [user: answer to B3, 2026-10-20]
- AC-16: WHERE at least one memory entry was pulled, the system SHALL list the entries by
  run count descending. Each row shows the entry's text (truncated, full text on hover)
  and its share of the memory denominator as a whole percent. The panel is captioned
  "Share of runs where this entry was pulled into the prompt" and shows the denominator.
- AC-17: WHILE no memory entry was pulled by any run in the memory denominator, the system
  SHALL show "No memory pulled in this period", with no rows and no percentages. This is
  the state in every period today (see Non-goals). [user: answer to B3, 2026-10-20]
- AC-18: WHERE the selected period starts before *memory tracked since*, the system SHALL
  show "No data before <date>" in the panel, with the date in the browser's time zone.
  [user: answer to B3, 2026-10-20]
- AC-19: WHILE the memory denominator is 0 and the agent's counted runs in the period are
  all CI runs, the system SHALL show "No local runs in this period; CI runs record no
  skills or memory". [user: answer to B7, 2026-10-20]

### Findings (both findings panels)

- AC-20: The system SHALL count, for both findings panels, every finding of a review
  produced by one of the agent's counted runs in the period (as M-7 defines belonging).
  This covers every finding kind and every decision state: accepted, dismissed and
  pending. [user: answer to B4, 2026-10-20]
- AC-21: The system SHALL show the same total in the donut centre, in the severity panel's
  "N findings in period" line, and as the sum of all severity bars.
  [user: answer to B4, 2026-10-20]
- AC-22: WHILE the agent's counted runs in the period include local runs but those runs
  produced no findings, the system SHALL show "No findings in this period" in both
  findings panels, with no chart.
- AC-23: WHILE the agent's counted runs in the period are all CI runs, the system SHALL
  show "CI runs record no findings" in both findings panels, with no chart.
  [user: answer to B7, 2026-10-20]

### Findings by category

- AC-24: The system SHALL show findings by category as a donut with the total in its
  centre. Its legend lists the five known categories (security, bug, perf, style, test)
  with "count · percent" each, the percent being that category's share of the total as a
  whole percent. A known category with no findings is listed with its real count, 0, and
  draws no segment. The donut follows the colours and integer formatting of the Skill
  Stats donut.
- AC-25: IF a stored finding's category is not one of the five known categories, THEN the
  system SHALL count it in the total and show it under its stored value in a neutral
  colour, never dropping it and never relabelling it as a known category.

### Findings by severity

- AC-26: The system SHALL show findings by severity as stacked bars, one per time bucket,
  each split into Critical, Warning and Suggestion, with a legend. Below the bars it shows
  "N findings in period".
- AC-27: WHERE the period is "1 day", the system SHALL use 6 buckets of 4 hours each,
  counted from the period's start and labelled H1 … H6. [user: answer to B5, 2026-10-20]
- AC-28: WHERE the period is "30 days", or "Custom" spanning 90 or fewer local calendar
  days in the viewer's time zone (start and end dates inclusive), the system
  SHALL use consecutive 7-day buckets counted from the period's start in the browser's
  time zone, labelled W1 … Wn, the last one possibly shorter.
  [user: answer to B5, 2026-10-20]
- AC-29: WHERE the period is "Custom" spanning more than 90 local calendar days (counted as
  in AC-28), the system SHALL use
  calendar-month buckets in the browser's time zone, the first and last possibly partial,
  labelled by month. [user: answer to B5, 2026-10-20]
- AC-30: The system SHALL assign a finding to the bucket containing its run's `ran_at`.
- AC-31: WHERE a bucket has no findings, the system SHALL keep its label on the axis and
  draw no bar. [user: answer to B5, 2026-10-20]
- AC-32: WHEN the user hovers over or focuses a bucket, the system SHALL show its exact
  time range (e.g. "H3: Oct 11 08:00–12:00") and its count per severity.
  [user: answer to B5, 2026-10-20]
- AC-33: IF a stored finding's severity is not exactly `CRITICAL`, `WARNING` or
  `SUGGESTION` (for example `INFO`, a lower-case variant, or any other value), THEN the
  system SHALL count it in the total and show it as a separate "Other" segment, never
  folding it into a known severity. The legend SHALL list "Other" only when its count in
  the period is greater than 0. [user: plan 43 default, 2026-10-20]

### Loading, errors, read-only

- AC-34: The system SHALL load the data of all four panels in one request, separate from
  the KPI tiles and Run history requests. [user: answer to B6, 2026-10-20]
- AC-35: WHILE the panels' data is loading, the system SHALL show a placeholder in each
  panel, never numbers or empty-state text.
- AC-36: IF the panels' request fails, THEN the system SHALL show an error with a retry
  action inside each of the four panels, with no values. The KPI tiles, Run history and
  period control SHALL stay as they are. [user: answer to B6, 2026-10-20]
- AC-37: IF the KPI or Run history request fails while the panels' request succeeds, THEN
  the system SHALL still show the panels when the panels' counted-run count (AC-41) is
  greater than 0, and hide them per AC-3 when it is 0.
  [user: answer to B6, 2026-10-20] [user: answer to plan 43 GAP1, 2026-10-20]
- AC-38: WHEN the panels load, reload, retry or follow a period change, the system SHALL
  only read stored runs, recorded skills, traces and findings. It SHALL NOT start a
  review, a run, or a call to any model provider.
- AC-39: IF the requested agent id does not exist in the current workspace, THEN the
  system SHALL answer the panels' request with not-found, as SPEC-15 AC-29 does.
- AC-40: IF the requested period is invalid (SPEC-15 AC-4), THEN the server SHALL reject
  the panels' request, and no query SHALL run on the unvalidated value.
- AC-41: The system SHALL include in the panels' response the number of the agent's
  counted runs in the period: M-2, local and CI, as SPEC-15 defines it. The panels decide
  between AC-3 and their own states from this number alone, never from the KPI tiles'
  response. [user: answer to plan 43 GAP1, 2026-10-20]

### Skill → Stats period control

- AC-42: The system SHALL show on Skill → Stats the same period control as Agent → Stats,
  with the same presets, Custom validation and URL behaviour (SPEC-15 AC-1 to AC-4). With
  no period in the URL, it uses "30 days". [user: answer to B11, 2026-10-20]
- AC-43: The system SHALL compute Pull frequency (both its numerator and its denominator),
  Accept rate, the Findings tile and Findings by category over the selected period's
  window as SPEC-15 defines it: start and end, the browser's time zone for Custom. Only
  `done` local runs of the current workspace count. [user: answer to B8, 2026-10-20]
- AC-44: The system SHALL compute "Used by N agents" and the "Agents using this skill"
  list from the current agent–skill links, independently of the selected period.
  [user: answer to B8, 2026-10-20]
- AC-45: The system SHALL label the findings tile "Findings" and name the selected period
  below it (as the agent tab names its period), instead of the fixed "(30D)".
  [user: answer to B10, 2026-10-20]
- AC-46: WHILE no local run in the selected period included the skill, the system SHALL
  show "—" for Pull frequency and Accept rate and "No findings in this period" in the
  Findings by category panel, never 0% or 0. [user: answer to B10, 2026-10-20]
- AC-47: The system SHALL keep the tab's whole-tab empty state on today's rule: no agent
  linked and no run ever included the skill. The selected period does not change it.
  [user: answer to B10, 2026-10-20]
- AC-48: The system SHALL compute the Skills list rail card footer ("N agents · X% pull ·
  Y% accept") over SPEC-15's "30 days" window, whatever period the Stats tab has
  selected. [user: answer to B9, 2026-10-20]
- AC-49: IF the Skill Stats request carries an invalid period, THEN the server SHALL
  reject it before any query runs, and the tab SHALL keep the previous valid period's
  data with an inline message (SPEC-15 AC-4). Loading and error states follow SPEC-15
  AC-26 and AC-27, never showing numbers while loading or after a failure.

## Edge cases

- **A skill recorded twice for one run** cannot happen: a run records each skill once. A
  share therefore never exceeds 100%.
- **A skill renamed after the runs** is shown under its current name (AC-6).
- **Skills recorded, but the period ends before *skills tracked since***: the denominator
  is 0. The panel shows "No data before <date>" (AC-8) and no percentages, never 0%.
- **A period straddling *skills tracked since***: the earlier local runs are left out of
  the denominator (AC-5), so they cannot drag shares down. AC-8 says so on screen.
- **A share that rounds to 0%** (one run out of more than 200): shown as "<1%", never "0%".
- **Many skills**: every recorded skill is listed (AC-6). A long skill name is truncated
  with the full name on hover.
- **A local run with a trace but no review** (e.g. a review that produced nothing): it
  counts in the skills and memory denominators and adds nothing to the findings panels.
- **Mixed local and CI runs**: the skills and memory denominators count only local runs.
  They can therefore be smaller than Total runs (M-2), and the panel's own "based on N
  local runs" line shows that.
- **A finding both accepted and dismissed**: counted once. Decision state never matters
  to these panels (AC-20).
- **A DST change inside a period**: 4-hour, 7-day and month buckets follow the browser's
  local clock, so one bucket can be an hour longer or shorter. The hover range (AC-32)
  shows the real bounds.
- **A 1-day period**: buckets start at the rolling period start, so H1 can begin at any
  minute (e.g. 14:37). The hover label shows that.
- **A run finishing while the tab is open**: it appears on the next load or period
  change, as in SPEC-15. There is no live update.
- **Memory entry text**: it can be long or contain markup-like characters. It is rendered
  as plain text, truncated.

## Non-functional requirements

- **Performance**: the Stats tab SHALL load its data in at most four requests (SPEC-15's
  three plus the panels' one). The panels' request SHALL complete within 1 s on the local
  stack at SPEC-15's load size: 20 agents and 10 000 counted runs in a 30-day period in
  the workspace. [user: answer to B6, 2026-10-20]
- **No model calls / cost**: pure reads (AC-38). Viewing costs nothing.
- **Security**: the endpoint is a read-only aggregate scoped to the current workspace.
  Unlike SPEC-15's endpoints, it returns text: skill names and memory entry text. Memory
  entries can quote PR content. Its exposure on the LAN-bound API
  (`server/insights/gotchas.md`, "Every route is reachable from the LAN") is the same as
  the existing run-trace and skills routes, which already return that text.
- **Accessibility**: each bar list, the stacked bars and the donut have a text
  equivalent (legend values or per-bucket labels). Bucket details are reachable by
  keyboard focus as well as by hover (AC-32).
- **i18n**: all copy comes from `next-intl` namespaces.
- **Consistency**: for the same agent and period, the findings total (AC-21) SHALL equal
  the number of findings belonging to that agent's counted runs, under the same M-1 rule
  that drives the KPI tiles.

## Inputs and provenance

- Counted runs (status, source, `ran_at`, `agent_id`, workspace).
  [reused: specs/015-agent-performance.md M-1, `agent_runs`]
- Recorded skills per run (which skills were in the prompt).
  [deterministic: `run_skills`, written by the run executor for local runs only]
- Skill names. [user: the Skills editor]
- Pulled memory per run: entry text and PR number.
  [deterministic: `run_traces.trace.memory_pulled`, always empty today]
- Memory entry text, as content. [external: PR text that memory entries may quote]
- Finding category and severity values, as stored. [llm: stored output of past review
  runs; no model call is made by this feature]
- Period selection (preset or custom dates and time zone from the URL).
  [user: the period control / URL query]
- Period validation, the time-zone rule and the "no made-up zeros" states.
  [reused: specs/015-agent-performance.md AC-1 to AC-4, AC-26 to AC-27]
- Category colours, donut shape and integer formatting.
  [reused: specs/003-skills.md, the Skill Stats donut]
- The shared period query (`PerfQuery`). [reused: `@devdigest/shared` `agent-performance.ts`]
- Skill Stats figures and their rules (pull frequency, accept rate over decided findings,
  current agent links). [reused: specs/003-skills.md, `server/src/modules/skills/stats.ts`]
- The Skill → Stats period selection. [user: the period control / URL query, validated as
  in SPEC-15]

## Untrusted inputs

- **Skill names** [user]: rendered as plain text, never as markup or a link target.
- **Memory entry text** [deterministic store, external content]: it may quote PR text. It
  is rendered as plain text and truncated, never as markup, and never treated as an
  instruction.
- **Finding category and severity values** [llm]: produced by a model in past runs.
  They are counted as labels only. An unknown value is shown as stored and never mapped
  to a known one (AC-25, AC-33). They are rendered as text.
- **Period from the URL** [user]: validated on the server (AC-40, and AC-49 for Skill →
  Stats) as well as in the browser.
- No panel reads cloned-repository content.

## Module interactions

- **`@devdigest/shared`** (`server/src/vendor/shared`, mirrored to
  `client/src/vendor/shared`): a new response contract for the panels' data.
  - It covers skill rows, the skills denominator and *skills tracked since*.
  - It covers memory rows, the memory denominator and *memory tracked since*.
  - It covers counts by category and by bucket and severity, with each bucket's bounds.
  - It carries the agent's counted-run count (M-2) for the period (AC-41).
  - It reuses the existing `PerfQuery` for the period.
  - The contract changes in `shared` first, then in the client copy. The root
    `INSIGHTS.md` records that the two copies drift.
  - Spec 015's contracts live outside the `shared` barrel. The root `INSIGHTS.md` note on
    deep-path imports and the bundled `agent-runner` applies to where the new contract
    goes.
- **server**: the `agent-performance` module already serves `GET /agents/:id/stats` and
  `GET /agents/:id/stats/runs` (`server/src/modules/agent-performance/routes.ts`).
  - The panels' data is a sibling read under the same agent and period rules, so M-1 and
    the period window have one implementation.
  - Sources: `agent_runs`, `run_skills` → `skills` (names), `run_traces` (`memory_pulled`),
    and `reviews.run_id` → `findings` (category, severity).
  - The skill-stats queries (`server/src/modules/skills/repository.ts`) already apply a
    local-and-done run filter to `run_skills`, which this feature shares in meaning.
- **client**: the agent editor's Stats tab
  (`client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/`) gains the
  four panels.
  - The panels use one data hook for the new endpoint.
  - The donut reuses the Skill Stats donut behaviour (category colours, integer values).
  - Money is not shown.
- **Skill → Stats** (AC-42 to AC-49):
  - **shared**: the existing `SkillStats` contract takes a period query, reusing
    `PerfQuery`. Its `findings_30d` figure no longer always means 30 days.
  - **server**: the skills module's stats read and list read both use a fixed rolling
    window today, `statsWindowStart()` with no end (`server/src/modules/skills/service.ts`).
    The stats read moves to SPEC-15's period window. The list read stays at "30 days",
    measured the same way.
  - **client**: the skill editor's Stats tab reuses the existing shared period control
    (`client/src/components/period-control`) and its URL behaviour.
- **mcp-server, reviewer-core, agent-runner**: no change. Nothing here calls the review
  engine or alters a prompt.

## Open questions

None.

## Changelog

- 2026-10-20 · whole spec · approved with B1–B7 answers and spec-creator inline choices 1–7 (memory tracked-since from traces, memory entry identity = text + PR, 1d buckets from period start, five-category legend with real zeros, unknown category/severity kept, "<1%" for tiny shares, endpoint exposure note) · user accepted the spec and the inline choices · user
- 2026-10-20 · Acceptance criteria (AC-3, AC-28, AC-29, AC-33, AC-37, new AC-41), Module interactions · panels response carries its own counted-run count and hides at 0; "≤ 90 days" in local calendar days; severity "Other" defined and shown only when > 0 · plan 43 GAP1 and plan defaults · user
- 2026-10-20 · Title, Goals/Non-goals, new "Skill → Stats period control" (AC-42–AC-49), Inputs, Untrusted inputs, Module interactions · Skill → Stats gets the 1 day / 30 days / Custom period control; run-based figures follow the period, current links do not; rail card footer stays 30 days · user correction to plan 43 (B8–B11) · user
- 2026-10-20 · Status · implemented via plan 43 (complete 196/196; architecture and security reviewers PASS) · plan done · main session
