# Spec: Multi-Agent Review
Spec ID: SPEC-13
Status: implemented
Supersedes: none

## Problem & user

A reviewer who runs several review agents on a pull request today has no way to
pick *which* agents run together, cannot see their results side by side, and
cannot tell where the agents agree or disagree on the same lines of code. The
"Run all enabled agents" action runs the agents one after another, so a
three-agent review takes roughly three times as long as one. Each agent's run is
an isolated row in the PR's run history; nothing records that several runs
were started together as one review, so the results cannot be revisited as a
set. When two agents flag the same location, the reviewer sees two unrelated
cards and must notice the overlap by hand; when one agent flags a location and
another stays silent, nothing surfaces that difference.

## Goals / Non-goals

**Goals**

- Let the user pick a set of agents for one PR, from the PR page and from a
  dedicated "Multi-Agent Review" screen, with a time and cost estimate per agent
  and for the whole run.
- Run the selected agents concurrently, sharing the PR preparation once, so one
  agent's failure or cancellation never affects the others.
- Record the selected runs as one multi-agent run that can be reopened after a
  reload.
- Show the results in two modes, Columns and Tabs + detail, with live per-agent
  status, score, time, cost, findings and a per-agent trace.
- Mark findings that several agents raised on the same location, keeping every
  original finding and its author.
- Show "Where agents disagree" for each contended location, with a "Show only
  conflicts" toggle.
- Make the existing "Run all enabled agents" action run concurrently too.

**Non-goals**

- **Learn** and **Reply to author** finding actions: hidden on the multi-agent
  results page. The contract already lists them, but they belong to the memory
  and forge-comment features [user: answer to B7, 2026-10-14].
- A separate "match groups" panel: grouping appears only as a marker on each
  finding card [user: answer to B3, 2026-10-14].
- A reason text for "did not flag" (e.g. "Not a security concern."): it would
  need an extra model call per location. The row shows a bare "did not flag"
  [user: answer to B4, 2026-10-14].
- Stored per-agent icons or colours: no database change [user: answer to B8,
  2026-10-14].
- Running agents in separate git worktrees: every agent reads the one shared
  diff. The header does not claim "fan-out via worktrees" [user: answer to B8,
  2026-10-14].
- Merging, deduplicating or rewriting findings: originals are never altered.
- Changing the seeded agents: the demo uses the five agents already seeded
  [user: answer to B8, 2026-10-14].
- Any change to `ci/` or `agent-runner/` (Worktree A boundary).
- Other navigation items shown in the mockups (Memory, Agent Performance, CI
  Runs): they belong to other features.
- A target speed-up ratio: the 1-vs-3 measurement is recorded as observed
  [user: answer to B9, 2026-10-14].

## User stories

- As a reviewer on a PR page, I want to tick the agents I care about and start
  them together, so that I get several perspectives in roughly the time of the
  slowest one.
- As a reviewer, I want an estimate of time and cost before I start, so that I
  can decide whether a larger agent set is worth it.
- As a reviewer, I want to watch each agent's status while the run is in
  progress, and open its live log, so that I know which agent is slow or failed.
- As a reviewer, I want to see when several agents flagged the same lines, and
  still read each agent's own wording, so that agreement raises my confidence
  without losing attribution.
- As a reviewer, I want to see where agents disagree, so that I can judge the
  contested locations myself.
- As a course author running the demo, I want each agent's trace to explain its
  tokens, cost and grounding-gate decisions, so that I can account for the
  measured cost of one agent versus three.

## Acceptance criteria (EARS)

### Starting a run — PR page picker

- **AC-1** WHEN the user opens the "Run Review" dropdown on a PR page, the
  system SHALL show a "Pick agents to run" list with one checkbox per agent,
  each with the agent's name and its time estimate, a "Clear" action, a
  "Run multi-agent review (N)" button and a "Configure agents…" entry.
- **AC-2** WHEN the "Pick agents to run" list first opens, the system SHALL tick
  every enabled agent and leave every disabled agent unticked
  [user: answer to B5, 2026-10-14].
- **AC-3** WHEN the user activates "Clear", the system SHALL untick every agent.
- **AC-4** WHILE no agent is ticked, the system SHALL disable the
  "Run multi-agent review (N)" button.
- **AC-5** The system SHALL show in the "Run multi-agent review (N)" label the
  number of ticked agents.
- **AC-6** WHEN the user activates "Run multi-agent review (N)" on the PR page,
  the system SHALL start a multi-agent run for the ticked agents on that PR and
  navigate to that run's results page [user: answer to B5, 2026-10-14].
- **AC-7** WHEN the user activates "Configure agents…", the system SHALL open
  the Configure run screen with this PR preselected [user: answer to B5,
  2026-10-14].
- **AC-8** The system SHALL keep the existing "Run all enabled agents" and
  single-agent entries of the dropdown working as before, and SHALL NOT attach
  a single-agent run to a multi-agent run [user: answer to B2, 2026-10-14].

### Starting a run — Configure run screen

- **AC-9** The system SHALL show a "Multi-Agent Review" item in the global
  navigation that opens the Configure run screen for the active repository.
- **AC-10** The system SHALL offer in step 1 of the Configure run screen a
  pull-request select listing every synced pull request of the active
  repository, the same set the repository's pull-request list shows; WHEN the
  screen opens with a PR given in the address, the system SHALL preselect that
  PR [user: answer to GAP3, 2026-10-14].
- **AC-11** WHILE no pull request is selected in the step 1 select, the system
  SHALL show the empty state "Pick a pull request first" in place of the agent
  list and SHALL NOT allow a run to start [user: answer to GAP3, 2026-10-14].
- **AC-12** WHILE a pull request is selected, the system SHALL list every agent
  in step 2 with a checkbox, its icon and colour, its name, its last verdict
  line and its per-agent estimate shown as "<time>s · $<cost>".
- **AC-13** WHEN the user activates "Select all", the system SHALL tick every
  listed agent.
- **AC-14** WHILE at least one agent is ticked, the system SHALL show beside the
  "Run multi-agent review (N)" button an aggregate estimate as
  "≈ <time>s · $<cost> · parallel fan-out".
- **AC-15** WHEN the user activates "Run multi-agent review (N)" on the
  Configure run screen, the system SHALL start a multi-agent run for the ticked
  agents on the selected PR and navigate to its results page.

### Finding a past run again

- **AC-15a** The system SHALL derive a multi-agent run's overall status from its
  agent runs: `running` while any agent run is running; `done` when every agent
  run finished `done`; `partially failed` when at least one finished `done` and
  at least one ended `failed` or `cancelled`; `failed` when none finished
  `done` [user: answer to UF1, 2026-10-15].
- **AC-15b** The system SHALL show on the Configure run screen, below the
  "Run multi-agent review (N)" button, a "Recent runs" block listing the
  10 most recent multi-agent runs on pull requests of the active repository in
  this workspace, with every `running` run first and the rest newest first
  [user: answer to UF1, 2026-10-15].
- **AC-15c** The system SHALL show in each "Recent runs" row the PR number and
  title, the agent names (or "<N> agents" when they do not fit), the overall
  status (AC-15a), the wall-clock time as defined in AC-31 and the total cost
  [user: answer to UF1, 2026-10-15].
- **AC-15d** WHILE a run listed in "Recent runs" is `running`, the system SHALL
  update its row's status, time and cost as its agents finish, without a page
  reload [user: answer to UF1, 2026-10-15].
- **AC-15e** WHEN the user activates a "Recent runs" row, the system SHALL open
  that run's results page [user: answer to UF1, 2026-10-15].
- **AC-15f** IF the active repository has no multi-agent run, THEN the system
  SHALL show in the "Recent runs" block the empty state "No multi-agent runs
  yet — runs you start appear here."
- **AC-15g** WHILE a pull request that has at least one multi-agent run is
  selected on the Configure run screen, the system SHALL show a link
  "Latest run for #<N>" with that run's overall status, opening the PR's newest
  multi-agent run; WHILE the selected PR has none, the system SHALL show no such
  link [user: answer to UF1, 2026-10-15].
- **AC-15h** WHEN the PR page's Agent runs tab lists an agent run that belongs
  to a multi-agent run, the system SHALL show on that row a link that opens the
  multi-agent run's results page; a run with no multi-agent run SHALL show no
  such link [user: answer to UF1, 2026-10-15].

### Estimates and agent identity

- **AC-16** The system SHALL compute an agent's time estimate and cost estimate
  as the median duration and median cost of that agent's last 5 runs with
  status `done`, across all PRs of the workspace [user: answer to B6,
  2026-10-14].
- **AC-17** The system SHALL compute the aggregate time estimate as the largest
  per-agent time estimate among the ticked agents, and the aggregate cost
  estimate as the sum of their per-agent cost estimates [user: answer to B6,
  2026-10-14].
- **AC-18** IF an agent has no finished run to estimate from, THEN the system
  SHALL show "no estimate yet" for that agent and SHALL leave it out of the
  aggregate estimate [user: answer to B6, 2026-10-14].
- **AC-19** The system SHALL show as an agent's last verdict line the first
  sentence of the summary of that agent's most recent review, and SHALL show
  no line when the agent has no review with a summary [user: answer to B6,
  2026-10-14].
- **AC-20** The system SHALL give each agent an icon and colour from a fixed
  palette, chosen from the agent's name, so the same agent looks the same on
  every screen [user: answer to B8, 2026-10-14].

### Running

- **AC-21** WHEN a multi-agent run is requested, the system SHALL require a JSON
  object body naming between 1 and 20 agents, SHALL treat a repeated agent id
  as one agent, and SHALL reject an empty, missing or non-object body, or more
  than 20 agent ids, without starting any run [user: accepted with plan 40
  pass 1 review, 2026-10-14].
- **AC-22** IF a requested agent does not exist in the workspace, THEN the
  system SHALL reject the request without starting any run.
- **AC-23** WHEN a multi-agent run is accepted, the system SHALL record one
  multi-agent run for the PR, create one agent run per selected agent linked to
  it, and return the multi-agent run immediately with every column in status
  `running` [user: answer to B2, 2026-10-14].
- **AC-24** The system SHALL load the PR diff, resolve the PR intent and load the
  repository rules once per multi-agent run and share them with every selected
  agent [user: answer to B1, 2026-10-14].
- **AC-25** The system SHALL run the selected agents concurrently, with at most
  4 agents in flight at once, and start a waiting agent as soon as a running one
  finishes [user: answer to B1, 2026-10-14].
- **AC-26** IF one agent's run fails or is cancelled, THEN the system SHALL let
  every other agent of the same multi-agent run continue and keep its result
  [user: answer to B1, 2026-10-14].
- **AC-27** IF the PR diff cannot be loaded, THEN the system SHALL mark every
  agent run of that multi-agent run `failed` with the same reason.
- **AC-28** IF an agent's model call fails, THEN the system SHALL mark that
  agent's run `failed` with the failure reason, keep its trace, and show the
  reason in its column.
- **AC-29** WHEN the user runs "Run all enabled agents" on a PR, the system SHALL
  run those agents concurrently under the same limit and isolation as AC-24 to
  AC-26 [user: answer to B1, 2026-10-14].

### Results page — common

- **AC-30** WHEN the results page opens for a multi-agent run, the system SHALL
  load that run by its id, so the page shows the same run after a reload or
  from a shared link [user: answer to B2, 2026-10-14].
- **AC-31** The system SHALL show in the results header a "Configure run" action
  that returns to the Configure run screen with this PR preselected, the title
  "Multi-Agent Review", "<N> selected agents · parallel", the PR number and
  title, and "<N> agents · parallel fan-out · <time>s total · $<cost>"
  [user: answer to B8, 2026-10-14], where "<time>s total" is the wall-clock
  time of the multi-agent run, from the first agent's start to the last
  agent's end, not the sum of the agents' durations [user: answer to GAP2,
  2026-10-14].
- **AC-32** The system SHALL offer a Columns / Tabs switch on the results page,
  with Columns selected by default.
- **AC-33** WHILE an agent's run is in progress, the system SHALL show that
  agent's status as running and update it to done, failed or cancelled when the
  run ends, without a page reload.
- **AC-34** IF an agent of a multi-agent run has since been deleted, THEN the
  system SHALL still show its column with its stored results under a "Deleted
  agent" label.
- **AC-35** IF every agent of a multi-agent run fails, THEN the system SHALL show
  every column with its failure reason, show no "Where agents disagree" entries,
  and keep the "Configure run" action available.
- **AC-36** The system SHALL render every model-written text (finding title,
  explanation, suggested fix, review summary) without loading remote images or
  raw HTML.
- **AC-37** The system SHALL list an agent's findings by severity (critical,
  then warning, then suggestion), then by file path, then by start line.

### Results page — Columns mode

- **AC-38** WHILE Columns mode is selected, the system SHALL show one column per
  selected agent with the agent's icon and colour, its name, its status, its
  duration and cost, its score ring, its findings (severity, title,
  file:line), a "View trace" action and "<N> findings".
- **AC-39** IF an agent's run has no score (failed or cancelled), THEN the system
  SHALL show its score ring empty and show the run's status instead of a score.

### Results page — Tabs + detail mode

- **AC-40** WHILE Tabs mode is selected, the system SHALL show one tab per
  selected agent labelled with its name and score, and for the active tab a
  header with the score ring, the review summary, duration, cost and a
  "View trace" action, followed by that agent's finding cards.
- **AC-41** The system SHALL show on each finding card in Tabs mode the
  severity, title, category, file:line and confidence as a percentage, and when
  expanded the explanation, the suggested fix, and the actions Accept, Dismiss
  and Turn into eval case [user: answer to B7, 2026-10-14].
- **AC-41a** WHILE Tabs mode is selected, the system SHALL lay out the agent tab
  bar, the agent's summary card and its finding cards across the full content
  width of the page, overriding the narrower column of mockup 6.png
  [user: answer to UF2, 2026-10-15].
- **AC-41b** WHILE Tabs mode is selected with up to 5 agents at a viewport width
  of 1280 px or more, the system SHALL show every agent tab without a
  horizontal scrollbar on the tab bar [user: answer to UF2, 2026-10-15].
- **AC-42** The system SHALL NOT show the Learn and Reply to author actions on
  the multi-agent results page [user: answer to B7, 2026-10-14].

### Grouping

- **AC-43** The system SHALL treat two findings of different agents in the same
  multi-agent run as one group when they name the same file and their line
  ranges overlap, regardless of category [user: answer to B3, 2026-10-14].
  A finding's range for grouping is `[start_line, end_line]`, or
  `[start_line, start_line]` when it has no end line. A finding whose range
  spans more than 10 lines (`end_line − start_line + 1 > 10`) takes part in
  grouping by its start line only, i.e. its grouping range is
  `[start_line, start_line]`; it still shows its full range everywhere else
  [user: option C after live-data review, 2026-10-15]. Overlap is inclusive
  (ranges that share one line overlap). Grouping is transitive: if A overlaps B and B overlaps C, all three
  form one group, and a second overlapping finding from an agent already in the
  group joins the same group.
- **AC-44** WHEN a finding belongs to a group with findings of other agents, the
  system SHALL show on its card an "also flagged by <agent>" marker naming each
  other agent of the group [user: answer to B3, 2026-10-14].
- **AC-45** The system SHALL keep every finding of a group as its own card, with
  its own title, text, severity and authoring agent unchanged.

### Where agents disagree

- **AC-46** The system SHALL show a "Where agents disagree" block below the
  results in both modes, with one entry per group, each headed by its file,
  line and title, and one row per agent of this run with that agent's verdict.
  The line and title come from the group's highest-severity finding; among
  findings of equal severity, the one with the lowest start line
  [user: answer to GAP1, 2026-10-14].
- **AC-47** The system SHALL show for an agent that flagged the location its
  severity and the finding's title, and for an agent of this run that did not
  flag it the bare text "did not flag" [user: answer to B4, 2026-10-14].
- **AC-48** The system SHALL include in the block only agents of this
  multi-agent run, and only agents whose run finished `done` [user: answer to
  B4, 2026-10-14].
- **AC-49** The system SHALL treat a group as a conflict when at least one
  agent of the run flagged it and at least one other `done` agent did not, or
  when the agents that flagged it gave different severities.
- **AC-50** WHILE "Show only conflicts" is off, the system SHALL list every group
  flagged by at least two agents and every conflict; WHILE it is on, the
  system SHALL list conflicts only [user: answer to B4, 2026-10-14].
- **AC-51** IF there is nothing to list for the current toggle state, THEN the
  system SHALL show "No conflicts — the agents agree on every flagged
  location."

### Trace per agent

- **AC-52** WHEN the user activates "View trace" in a column or an agent tab
  header, the system SHALL open the existing run trace drawer for that agent's
  run, with its Trace tab (Configuration, Stats, Prompt assembly), its Live log
  tab and its "Copy raw output" action [user: answer to B11, 2026-10-14].
- **AC-53** WHILE that agent's run is in progress, the system SHALL open the
  drawer on the Live log tab and stream that run's events into it
  [user: answer to B11, 2026-10-14].
- **AC-54** WHILE an agent's run has ended but its trace has not yet been
  written, the system SHALL show a "trace pending" state in the Trace tab
  instead of an empty state, keep checking for the trace for up to 30 seconds
  after the run ended, and show the trace once it appears [user: answer to B11,
  2026-10-14; answer to GAP4, 2026-10-14].
- **AC-54a** IF no trace appears within 30 seconds after the run ended (for
  example a run the stale-run reaper marked failed on an API restart, which
  never gets a trace), THEN the system SHALL replace "trace pending" with the
  drawer's existing "no trace" state [user: answer to GAP4, 2026-10-14].
- **AC-55** WHEN the results page opens with a run id in its `trace` address
  parameter that belongs to this multi-agent run, the system SHALL open the
  drawer for that run [user: answer to B11, 2026-10-14].
- **AC-56** IF the `trace` address parameter names a run that does not belong to
  this multi-agent run, THEN the system SHALL ignore it and open no drawer.
- **AC-57** The system SHALL show in an agent's trace its tokens in and out, its
  cost and its grounding-gate result [user: answer to B11, 2026-10-14]. The
  grounding-gate explanation is the trace's grounding summary (passed of total)
  plus the run's persisted log lines "grounding dropped <title>: <reason>", one
  per finding the gate removed.

### Demo measurement

- **AC-58** WHEN the feature is verified, the measurement of the same demo PR
  reviewed by one agent and by three agents SHALL be recorded with the actual
  wall-clock time, tokens and cost of each, without fitting the conclusion to a
  3× ratio [user: answer to B9, 2026-10-14].

## Edge cases

- **Nothing ticked:** the run button is disabled (AC-4); the server also
  rejects an empty agent list (AC-21).
- **No agents in the workspace:** the picker shows the existing "no agents yet"
  entry; the Configure run screen shows an empty state with a link to Agents.
- **Disabled agent:** listed but unticked by default (AC-2); it can still be
  ticked and run, as single-agent runs of disabled agents can today.
- **Agent deleted after the run:** its column stays, labelled "Deleted agent"
  (AC-34).
- **Agent edited after the run:** the column shows the results of the version
  that ran; the trace's Configuration shows that version.
- **Second multi-agent run on the same PR while one is running:** allowed
  (Q1). Each multi-agent run is independent and gets its own results page; the
  limit of 4 concurrent agents applies per multi-agent run, so two overlapping
  runs may execute up to 8 agents at once.
- **Every agent fails:** AC-35. **Diff load fails:** AC-27.
- **Cancel one agent from its drawer:** that column ends `cancelled`; the others
  continue (AC-26).
- **API restart during a run:** the existing stale-run reaper marks the
  in-flight agent runs failed on boot; the results page shows them failed, and
  their trace drawer falls back to "no trace" after 30 seconds (AC-54a).
- **Same agent id sent twice, or more than 20 ids:** duplicates count once;
  more than 20 is rejected (AC-21).
- **Chain of overlapping findings:** A overlaps B, B overlaps C, A and C do not
  overlap — one group (AC-43). Two overlapping findings of the same agent land
  in the same group; the agent appears once in "also flagged by" and once in
  the disagree rows.
- **Wide finding:** a finding spanning lines 14–53 (40 lines, more than 10)
  groups as if it covered line 14 only (AC-43). It joins a group only with a
  finding whose grouping range includes line 14, so it can no longer pull
  unrelated findings of other agents at, say, lines 28 and 52 into one group
  through transitive overlap. Its card, file:line label and trace still show
  14–53.
- **Agent with zero findings:** its column shows "No findings." and it counts as
  "did not flag" for every group (AC-47).
- **Only one agent selected:** the run is still a multi-agent run; no group or
  conflict can exist, so the disagree block shows its empty state.
- **Huge result:** many findings per agent; columns scroll independently.
- **Unknown multi-agent run id or one from another workspace:** the results
  page shows a not-found state.
- **Trace not yet written after the run ends:** AC-54; never written: AC-54a.
- **Repository with no synced pull requests:** the step 1 select is empty and
  the "Pick a pull request first" state stays (AC-10, AC-11).
- **Estimate history contains only failed runs:** treated as no history
  (AC-18).
- **Run cost unknown for an agent (model not in the price book):** its column
  shows no cost; the header total sums the known costs and marks itself as
  partial. The same rule applies to a "Recent runs" row (AC-15c).
- **User leaves a running multi-agent run and comes back via the nav item:**
  the run is listed first in "Recent runs" with a live status (AC-15b,
  AC-15d), and "Latest run for #<N>" appears once its PR is selected (AC-15g).
- **More than 10 multi-agent runs in the repository:** only the 10 most recent
  appear in "Recent runs" (running ones first); an older run stays reachable
  from its PR's Agent runs tab (AC-15h) or by its link.
- **Run reaped on API restart:** "Recent runs" shows it `failed` or
  `partially failed` per AC-15a, never `running` forever.
- **Multi-agent run whose PR was deleted:** the run is removed with its PR, so
  it leaves "Recent runs".
- **More than 5 agents, or a viewport under 1280 px, in Tabs mode:** the tab bar
  may need to scroll; AC-41b applies only up to 5 agents at 1280 px or more.

## Non-functional requirements

- **Latency:** with N ≤ 4 agents, the wall-clock time of a multi-agent run SHALL
  be bounded by the shared preparation plus the slowest agent, not by the sum of
  the agents. Measured, not targeted (AC-58).
- **Cost:** a multi-agent run SHALL make no model calls beyond each selected
  agent's own review and the PR's shared intent resolution; grouping,
  conflicts, estimates and the verdict line are computed without a model.
- **Abuse:** the run-starting request SHALL keep the same rate limit as the
  existing review request (10 per minute) and require a JSON object body,
  because it spends money and the API is reachable from the LAN.
- **Responsiveness:** the start request SHALL return before any agent finishes.
- **Persistence:** a multi-agent run and its agent runs SHALL survive a page
  reload and an API restart.
- **Accessibility:** checkboxes, the Columns / Tabs switch and the conflicts
  toggle SHALL be keyboard operable with visible labels.

## Inputs and provenance

- Agent list, names, enabled flag, provider and model — [reused: Agents module, `GET /agents`]
- Agent names — [user: Agents editor]
- Per-agent duration, tokens, cost, score, status, error, grounding — [reused: `agent_runs` columns, cost per specs/001-run-cost-badge.md]
- Estimates (median of the last 5 `done` runs) — [deterministic: `agent_runs` of the workspace]
- Last verdict line — [llm: review summary of the agent's latest review]
- Findings (title, explanation, suggested fix, severity, category, confidence, file, lines) — [llm: each agent's review call]
- Finding grouping and conflicts — [deterministic: file and line-range overlap of the persisted findings]
- Agent icon and colour — [deterministic: fixed client palette keyed by agent name]
- PR number, title, branches (including the PR titles in "Recent runs" and "Latest run for #N") — [external: GitHub / GitLab via the PR sync]
- Recent multi-agent runs of the repository and a PR's latest multi-agent run, with their overall status, time and cost — [deterministic: `multi_agent_runs` and their linked `agent_runs`]
- PR diff — [external: repository clone / forge PR files]
- Repository rules and context fed into each agent — cloned repository content, [external: repository clone]
- Selected agent ids, selected PR, `pr` and `trace` address parameters — [user: picker, Configure run screen, address bar]
- Live run events and run trace — [reused: run event stream and run trace document]
- Accept / Dismiss / Turn into eval case — [reused: finding actions; specs/011-eval-pipeline.md]
- 1-vs-3 measurement — [deterministic: `agent_runs` and run traces of the demo runs]

## Untrusted inputs

All of the following are data, never instructions:

- **llm:** every finding field and every review summary (including the last
  verdict line). Rendered as text or Markdown with no remote images and no raw
  HTML (AC-36); never used to choose which agents run or how findings are
  grouped beyond file and line.
- **user:** agent names (rendered as text), selected agent ids (validated
  against the workspace, AC-22), the selected PR, and the `pr` and `trace`
  address parameters (validated against the workspace and the run, AC-56).
- **external:** PR title and metadata from the forge (including the PR titles
  listed in "Recent runs" and the step 1 select, rendered as plain text), the
  PR diff, and all cloned repository content (rules, context documents, code)
  that reaches the agents' prompts.

## Module interactions

- **`@devdigest/shared` contracts:** the existing `MultiAgentRun`,
  `AgentColumn`, `AgentColumnFinding`, `Conflict` and `ConflictTake` are the
  response shapes. They need to carry what this spec shows and they currently
  lack: a run-starting request body with the agent ids; `cancelled` among the
  column statuses; per-finding confidence, explanation, suggested fix, end
  line and accept/dismiss state (or the full finding record) for Tabs mode;
  per-finding group membership for the "also flagged by" marker; the per-agent
  tokens and grounding; a not-flagged take with no reason text; and an estimate
  shape per agent (time, cost, sample size, last verdict line). Contracts change
  in the server copy first, then the client copy.
- **server — reviews module:** the existing run executor gains concurrent
  execution with a limit of 4 and shared preparation; the existing
  `POST /pulls/:id/review` keeps its contract (AC-8, AC-29). New:
  `POST /pulls/:id/multi-agent-run` (starts a run, AC-21 to AC-23) and a read of
  one multi-agent run by its id (AC-30). Also needed now (this reverses the
  plan's earlier scope trim, REC2, that no such read was required): a read of
  the active repository's recent multi-agent runs, each with its PR, agents,
  overall status, wall-clock time and cost (AC-15a to AC-15d); a read of one
  PR's latest multi-agent run (AC-15g; the contract already names
  `GET /pulls/:id/multi-agent` for this); and, on the PR's run history, each
  agent run's multi-agent run id (AC-15h). A summary shape for a recent-runs
  row joins the contracts listed above. Live status and traces stay on the existing `GET /runs/:id/events`,
  `GET /runs/:id/trace` and `POST /runs/:id/cancel`. Finding actions stay on
  `POST /findings/:id/(accept|dismiss)`; Turn into eval case stays on the eval
  module's existing route.
- **server — database:** `multi_agent_runs` already exists; each `agent_runs`
  row gains a nullable link to its multi-agent run, with its own index (the
  link is a foreign key, which Postgres does not index on its own).
- **server — estimates:** an agent-level read of the last 5 `done` runs and the
  latest review summary, served for the agents list of the Configure run screen
  and the PR picker.
- **client:** the PR page's Run Review dropdown and Agent runs tab, a new
  Configure run screen (with "Recent runs" and "Latest run for #N") and a new
  results page under the repository routes; the existing run trace drawer
  (its `running` mode), live log stream and finding card are reused, not
  forked.
- **client — sanctioned vendored edit:** one "Multi-Agent Review" entry is added
  to `client/src/vendor/ui/nav.ts`. This is the one vendored file edited by
  hand; a vendor refresh drops it, so the line is commented as such.
- **Out of bounds:** `ci/`, `agent-runner/`, `reviewer-core/` (unchanged;
  the engine already reviews one agent per call), `mcp-server/`.

## Open questions

None.

## Changelog

- 2026-10-14 — Q1 resolved by the user: a second multi-agent run on a PR with
  one still running is allowed; the 4-agent limit is per multi-agent run.
- 2026-10-14 — Approved by the user, with SG1–SG5 accepted as written.
- 2026-10-14 — Back to draft: plan 40 pass 1 raised GAP1–GAP4 (group heading, "total" time, Configure run PR list, trace-pending timeout); the user accepted the suggested resolutions.
- 2026-10-14 — GAP1–GAP4 closed (AC-10, AC-11, AC-21, AC-31, AC-43, AC-46, AC-54, new AC-54a, AC-57, edge cases); re-approved by the user.
- 2026-10-15 — Back to draft: on live data (PR #12) one wide finding (lines 14–53) absorbed unrelated findings of other agents through the transitive overlap rule. The user chose option C: a finding spanning more than 10 lines takes part in grouping by its start line only.
- 2026-10-15 — AC-43 note + "Wide finding" edge case (option C) re-approved by the user.
- 2026-10-15 — Implemented by plan 40 (`docs/plans/40-multi-agent-review.md`, verified complete 191/191).
- 2026-10-15 — Back to draft after the user's live check: UF1 (a past multi-agent run cannot be found again → "Recent runs" on Configure run + "Latest run for #N" link + a link from the PR page's Agent runs tab) and UF2 (Tabs mode: tab bar and content at full content width). See plan 40 *User review*.
- 2026-10-15 — AC-15a–h, AC-41a, AC-41b (UF1, UF2) approved by the user.
- 2026-10-15 — UF1/UF2 implemented (plan 40 G9–G10, verified complete 260/260).
