# Spec: Eval Pipeline
Spec ID: SPEC-11
Status: implemented
Supersedes: none

## Problem & user

A DevDigest user who tunes a reviewer agent (edits its system prompt, model, strategy
or skills) has no way to tell whether the change made the agent better or worse.
Today the only evidence is re-reviewing a real PR and eyeballing the findings, which
is slow, not repeatable, and not comparable between versions: the PR, the repo
context and the model output all move at once.

Two signals already exist in the product and are thrown away. One is a finding the
user **accepted**, which shows what the agent must keep finding. The other is a
finding the user **dismissed**, which shows what the agent must stop flagging.
There is no place to keep these as regression cases. Nothing runs an agent over a
fixed set of inputs, scores the result, or shows the score over versions.

The existing planted-issue eval (a server CLI that scores stored review runs of one
fixture PR) is a developer tool with no UI, and it cannot score a new agent version
without a fresh review of that PR.

## Goals / Non-goals

**Goals**
- Turn a real accepted or dismissed finding into a regression case from one click.
  The click opens a prefilled draft that the user checks, and may run, before anything
  is saved. [user: correction, 2026-10-12]
- Let the user write and edit cases by hand in the same suite, in the same modal.
- Run an agent over its whole suite on frozen inputs, so runs of different agent
  versions are comparable, and score each run with code only: recall, precision and
  citation accuracy.
- Show per-agent history, the trend, a regression alert, and a side-by-side compare
  of two runs (metric deltas plus a system-prompt diff), with a way to promote the
  better version.
- Show an Eval Dashboard across all agents, with a way to run every agent's suite.
- Provide a hermetic `pnpm verify:l06` that proves the feature works without a
  live model.

**Non-goals**
- "Run on save" in the EvalCaseModal. The toggle shown in designs 06 and 09 is not
  rendered. [user: answer to B6, 2026-10-11]
- Saving a case straight from the finding card without the modal.
  [user: correction, 2026-10-12]
- Skill-owned eval cases and the Skill Editor Evals tab (design 07 is a list-style
  reference only).
- Running an **older** stored agent version. A run always uses the current version.
  Promote (AC-54…AC-57) is how an older version is brought back. [user: answer to B3, 2026-10-11]
- Any LLM call in scoring, including LLM-as-judge or semantic matching of finding
  titles.
- Matching tolerance beyond strict line-range intersection. [user: answer to B5, 2026-10-11]
- Changing, replacing or migrating the planted-fixture CLI (plans 09/12) or its
  stored rows. [user: answer to B1, 2026-10-11]
- Live repo context during an eval run (repo-intel, memory, project context, clone
  reads). [user: answer to B3, 2026-10-11]
- The harness eval of the `pr-self-review` skill under `evals/`, a PreToolUse hook,
  and mutation testing (separate tooling tasks).
- Period presets other than "30 days" and "All time" (e.g. 7 or 90 days).
  [user: rejected SG2, 2026-10-12]
- Re-baselining a frozen case, such as flipping its expectation type when the source
  finding is re-decided. The user edits the expected output by hand instead.
  [user: rejected SG3, 2026-10-12]
- MCP tools for evals.
- CI gating on eval metrics.

## User stories

1. As an agent author, I want one click to turn an accepted finding into a prefilled
   "must find" draft and a dismissed finding into a "must not flag" draft, and to save
   it only after I have checked it (and optionally run it), so that real review
   outcomes become regression tests without unchecked rows piling up.
2. As an agent author, I want to see every case in my agent's suite with its last
   result, so that I know what the suite covers and what fails.
3. As an agent author, I want to run my agent on all its cases with frozen inputs, so
   that runs of different versions are comparable.
4. As an agent author, I want recall, precision and citation accuracy for each run, so
   that I can judge a version by numbers instead of by impression.
5. As an agent author, I want to compare two runs side by side, with metric deltas and
   the system-prompt diff, and promote the better version, so that I can see what a
   prompt change did and keep it or roll it back.
6. As a team lead, I want an Eval Dashboard of all agents with their latest metrics and
   recent runs, plus a way to run all suites, so that I can spot a regressing agent.
7. As an agent author, I want to create and edit a case by hand (paste a diff, set
   expectations, file and line range), so that I can cover cases no real PR produced yet.
8. As an agent author, I want a trend chart of the three metrics over all runs, with
   the prompt version and cost per point, so that I can see the direction over time.

## Acceptance criteria (EARS)

### Suite scope and coexistence

- **AC-1** The system SHALL include in an agent's eval suite only agent-owned cases in
  the eval-pipeline expectation shape (AC-5). Planted-fixture cases written by the
  review-eval CLI SHALL NOT appear in any eval-pipeline list, run, metric, trend or
  dashboard. [user: answer to B1, 2026-10-11]
- **AC-2** The system SHALL keep the review-eval CLI (plans 09/12) working with its
  stored cases and run rows unchanged. [user: answer to B1, 2026-10-11]

### Case model

- **AC-3** The system SHALL store each case as a frozen input plus a list of zero or
  more expectations. The frozen input is a unified-diff fragment, the files it covers,
  and the PR meta (repo, PR number, title, head SHA) when the case came from a PR.
  [user: answer to B2, 2026-10-11]
- **AC-4** The system SHALL never re-fetch or re-derive a case's frozen input after
  the case is created. Only an explicit edit in the Case Editor changes it.
  [user: answer to B3, 2026-10-11]
- **AC-5** The system SHALL give each expectation a type (`must_find` or
  `must_not_flag`), a file path and a line range (start ≤ end, both ≥ 1, new-side line
  numbers). Optional title, severity and category SHALL be used for display only and
  never in matching. [user: answer to B2, 2026-10-11]
- **AC-6** The system SHALL treat a case with an empty expectation list as "must flag
  nothing". [user: answer to B2, 2026-10-11]
- **AC-7** The system SHALL keep case names unique within one agent's suite, checked
  when a case is saved.
- **AC-64** The system SHALL represent a case's expected output as a JSON array with
  one element per expectation. Each element has:
  - `expect`: `"must_find"` or `"must_not_flag"`, required;
  - `file`: required;
  - `start_line`: required;
  - `end_line`: optional, defaults to `start_line`;
  - `title`, `severity`, `category`: optional, display only (AC-5).

  `[]` means "must flag nothing" (AC-6). [user: answer to B2, 2026-10-11; correction,
  2026-10-12; user: confirmed, 2026-10-12]

### Creating a case from a finding (EvalCaseModal, designs 08, 09)

- **AC-8** The system SHALL show a "Turn into eval case" action on every finding card
  (designs 01, 08).
- **AC-9** WHILE a finding is neither accepted nor dismissed, the system SHALL show the
  action disabled, with a tooltip saying the finding must be accepted or dismissed
  first. [user: answer to B4, 2026-10-11]
- **AC-10** WHEN the user triggers the action on a decided finding that has no saved
  case, the system SHALL open the EvalCaseModal holding an unsaved draft case seeded
  from that finding, for the suite of the agent that produced it. It SHALL persist
  nothing. [user: correction, 2026-10-12]
- **AC-11** The system SHALL seed the draft's expected output with exactly one
  expectation at the finding's file and line range: `must_find` for an accepted
  finding, `must_not_flag` for a dismissed one. The expectation SHALL carry the
  finding's title, severity and category for display.
  [user: answer to B2, 2026-10-11; correction, 2026-10-12]
- **AC-12** WHEN a draft is seeded from a finding, the system SHALL take as its frozen
  input:
  - the hunks of the finding's file, from the diff between the PR's current base and
    head SHAs, falling back to that file's stored PR patch. Reviews store no reviewed
    SHA, so this is the PR's diff at seeding time, which may not be the exact diff the
    review ran on. That is an accepted limitation, guarded by AC-25 (see *Edge cases*).
    [user: answer to plan-34 GAP4, 2026-10-12];
  - the files those hunks cover;
  - the PR meta.

  The Diff, Files and PR meta tabs SHALL show them. The seeded diff SHALL stay
  editable in the Diff tab. [user: answer to B4, 2026-10-11; correction, 2026-10-12;
  editable diff: user: confirmed, 2026-10-12]
- **AC-13** The system SHALL prefill the draft's name as `must-find-<title-kebab>` for
  an accepted finding or `must-not-flag-<title-kebab>` for a dismissed one. The title
  part SHALL be cut to a bounded length, with the number left to the plan, and a
  numeric suffix SHALL be added when the name is already taken in that suite. The name
  SHALL be editable. [user: correction, 2026-10-12; user: confirmed, 2026-10-12]
- **AC-77** WHERE a case was created from a finding, the system SHALL show in its PR
  meta tab a link to the source PR and to the source finding.
  [user: accepted SG4, 2026-10-12]
- **AC-14** IF neither the reviewed diff nor the stored patch yields diff text for the
  finding's file, THEN the system SHALL refuse with a visible reason ("no diff text
  available for <file>"), SHALL NOT open the modal, and SHALL create nothing.
  [user: answer to B4, 2026-10-11]
- **AC-15** IF the agent that produced the finding no longer exists, THEN the system
  SHALL refuse with a visible reason, SHALL NOT open the modal, and SHALL create
  nothing.
- **AC-16** WHEN the user triggers the action on a finding whose case has already been
  saved, the system SHALL open that saved case in the same modal in edit mode, not a
  new draft. [user: answer to B4, 2026-10-11; correction, 2026-10-12]
- **AC-17** WHEN a draft is saved successfully, the system SHALL confirm it visibly,
  naming the case and its expectation type, with a link to the case.
  [user: correction, 2026-10-12]
- **AC-65** WHEN the modal holds a case seeded from a finding, the system SHALL title
  it "Eval case · <name>". It SHALL use the subtitle "Seeded from an accepted finding ·
  assert the expected output" or "Seeded from a dismissed finding · assert the expected
  output". [user: correction, 2026-10-12]
- **AC-66** WHEN the modal holds a case seeded from a finding, the system SHALL show a
  type banner built from the source finding. For an accepted finding it reads
  `POSITIVE CASE · MUST find "<title>" at <file>:<line>`; for a dismissed finding it
  reads `NEGATIVE CASE · MUST NOT flag "<title>" at <file>:<line>`. `<line>` is a
  single number, or `<start>-<end>` for a range. [user: correction, 2026-10-12]
- **AC-67** WHEN the user clicks "Run case" on an unsaved draft, the system SHALL
  first show the agent's model and confirm. It SHALL then run the agent's current
  version on the draft's input and expected output, with the frozen-input rules of
  AC-29 and the scoring of AC-37…AC-43. It SHALL show the result in the modal ("Last
  run passed | failed | errored · expected N, got M · duration · cost"). It SHALL
  persist no case and no case result. [user: correction, 2026-10-12]
- **AC-68** WHEN the user edits the draft's input or expected output after a draft run,
  the system SHALL mark the shown result as stale ("edited since last run").
  [user: correction, 2026-10-12]
- **AC-69** WHEN the user clicks "Save" on a draft, the system SHALL apply the
  validation of AC-24, AC-25, AC-26 and AC-74, and SHALL write the case only after all
  of it passes. [user: correction, 2026-10-12]
- **AC-70** WHEN a draft is saved, the system SHALL store the draft run's result as the
  case's last result only if that run used exactly the saved input, the saved expected
  output and the agent's current version. Otherwise it SHALL store the case as never
  run. [user: correction, 2026-10-12]
- **AC-71** WHEN the user clicks "Cancel" or closes the modal on an unsaved draft that
  has no edits and no draft-run result, the system SHALL discard the draft without
  asking. No case SHALL exist for it.
  [user: correction, 2026-10-12; user: accepted SG5, 2026-10-12]
- **AC-78** WHEN the user clicks "Cancel" or closes the modal on an unsaved draft that
  has edits or a draft-run result, the system SHALL ask "Discard draft?" first. It SHALL
  discard the draft only on confirmation, and otherwise keep the modal open with the
  draft intact. The same applies when the user closes the edit of a saved case that
  has unsaved changes: the system SHALL ask "Discard changes?" first, and closing it
  with no changes SHALL not ask. [user: accepted SG5, 2026-10-12; user: extended to
  saved-case edits, 2026-10-12]
- **AC-72** IF, at Save, the draft's source finding already has a saved case, THEN the
  system SHALL refuse to save a second one and offer to open the existing case.
  [user: answer to B4, 2026-10-11]

### Case list (Evals tab, design 05)

- **AC-18** The system SHALL show, on the agent editor's Evals tab, metric cards for
  the agent's latest completed suite run: recall, precision and citation accuracy with
  deltas against the previous completed run, and cases passed / cases total. A
  "View full dashboard" link SHALL open the agent's detail page.
- **AC-19** The system SHALL list the agent's cases newest first. Each row SHALL show
  the name, a summary of the expectations ("expected N finding(s), got M"; "expected 0
  findings" for an empty list), a severity · category badge from the first expectation
  (or "empty []"), the last result (passed, failed, errored or never run), and actions:
  run case, edit and delete.
- **AC-20** The system SHALL show a "N / M passing" count for the suite, based on each
  case's latest result.
- **AC-21** WHEN the user deletes a case, the system SHALL ask for confirmation, then
  remove the case and its per-case results. Past suite runs SHALL keep their stored
  metrics.

### Case Editor (EvalCaseModal, design 06)

- **AC-22** The system SHALL use one EvalCaseModal in three cases: a draft seeded from
  a finding, a new hand-written case ("New eval case"), and editing a saved case. The
  modal SHALL show:
  - the name (required);
  - the input in three tabs: Diff holds the unified diff with a DiffView preview;
    Files lists the case's frozen files; PR meta shows the frozen PR meta, or "none"
    for a hand-written case;
  - the expected output;
  - "Cancel", "Run case" and "Save".

  [user: answer to B7, 2026-10-11; correction, 2026-10-12]
- **AC-23** The system SHALL edit the expected output as the JSON array of AC-64, with
  an indicator that shows "valid JSON", or the parse error when the JSON is invalid. A
  "Finding skeleton" action SHALL append a pre-filled `must_find` element. Every
  element SHALL carry its own `expect` field (AC-64).
  [user: correction, 2026-10-12; required `expect`: user: confirmed, 2026-10-12]
- **AC-74** IF the expected output is not valid JSON, or an element breaks AC-64, THEN
  the system SHALL refuse to save and name the offending element.
  [user: correction, 2026-10-12]
- **AC-24** IF the pasted diff does not parse as a unified diff with at least one hunk,
  THEN the system SHALL refuse to save and show the parse error.
- **AC-25** IF an expectation's file is not in the case's diff, or its line range does
  not intersect any new-side line of that file's hunks, THEN the system SHALL refuse
  to save and name the offending expectation. [user: confirmed, 2026-10-12]
- **AC-26** IF the name is empty or already used in the agent's suite, THEN the system
  SHALL refuse to save and say why.
- **AC-27** The system SHALL show the case's last result in the modal: passed, failed
  or errored, the expected and actual finding counts, the duration and the cost. For
  an unsaved draft, the last result is that of its draft run (AC-67), or none.

### Running

- **AC-28** WHEN the user starts a suite run (Evals tab "Run all evals", or "Run eval"
  on the agent detail page), the system SHALL first show the number of cases and the
  agent's model, and start only after the user confirms.
  [user: answer to B6, 2026-10-11]
- **AC-79** IF no API key is configured for the agent's provider when a run is
  started, THEN the system SHALL refuse the start, state the reason ("no API key for
  <provider>"), and create no run, no case result and no errored case. This applies to
  a suite run, a single-case run and a draft run. For "Run all agents", such an agent
  SHALL be skipped and named with that reason, as in AC-35.
  [user: answer to plan-34 GAP3, 2026-10-12]
- **AC-29** WHEN a suite run starts (`POST /agents/:id/eval-runs`), the system SHALL
  run the agent's current version (system prompt, model, strategy, attached skills) on
  each case's frozen input only, with no repo-intel, memory, project context or clone
  reads. [user: answer to B3, 2026-10-11]
- **AC-30** The system SHALL record on every suite run the agent version number, the
  model, the start and end time, the per-case results and the total cost.
  [user: answer to B3, 2026-10-11]
- **AC-75** The system SHALL record on every suite run the set of skills attached to
  the agent when the run started, as skill names with their versions.
  [user: accepted SG1, 2026-10-12]
- **AC-31** WHILE a suite run of an agent is in progress, the system SHALL show its
  progress (cases done / total) and SHALL refuse to start another suite run of that
  agent, saying a run is already in progress. [user: answer to B6, 2026-10-11]
- **AC-32** IF the agent's model call for a case fails or returns output that cannot
  be parsed, THEN the system SHALL record that case as errored with the reason, never
  as a miss, and continue with the remaining cases. This covers per-case failures only
  after a run has started. A missing provider key at start is AC-79.
  [user: answer to B6, 2026-10-11; user: answer to plan-34 GAP3, 2026-10-12]
- **AC-33** WHEN the user runs a single saved case (row action or "Run case" in the
  modal),
  the system SHALL first show the agent's model and confirm, then run that case on its
  frozen input and update that case's last result. A single-case run SHALL NOT count
  as a suite run in history, metrics, the trend, the dashboard or the alert.
  [user: answer to B6, 2026-10-11; user: confirmed, 2026-10-12]
- **AC-34** WHEN the user clicks "Run all agents" on the Eval Dashboard, the system
  SHALL first show the total case count across agents and the model of each agent it
  will run, then start one suite run for every enabled agent with at least one case.
  [user: answer to B6, 2026-10-11]
- **AC-35** IF an agent already has a suite run in progress when "Run all agents"
  starts, THEN the system SHALL skip that agent and name it as skipped.
  [user: answer to B6, 2026-10-11]
- **AC-36** IF the agent's suite is empty, THEN the system SHALL refuse a suite run and
  say the suite has no cases.

### Scoring (code only)

- **AC-37** The system SHALL compute every metric and every pass/fail with
  deterministic code and SHALL make no LLM call while scoring.
- **AC-38** The system SHALL count a finding as matching an expectation only when the
  file paths are equal and the finding's line range intersects the expectation's line
  range, with no added tolerance. [user: answer to B5, 2026-10-11]
- **AC-39** The system SHALL compute recall for a suite run as matched `must_find`
  expectations divided by all `must_find` expectations of the completed cases.
  [user: answer to B5, 2026-10-11]
- **AC-40** The system SHALL count a grounded finding as noise when it intersects a
  `must_not_flag` expectation of its case, or when its case has an empty expectation
  list. It SHALL compute precision as 1 − noise ÷ all grounded findings of the
  completed cases. [user: answer to B5, 2026-10-11]
- **AC-41** The system SHALL compute citation accuracy as findings that passed the
  grounding gate divided by all findings the model returned (passed plus dropped),
  over the completed cases. [user: answer to B5, 2026-10-11]
- **AC-42** The system SHALL mark a case passed when every `must_find` expectation is
  matched and no noise finding exists, and failed otherwise.
  [user: answer to B5, 2026-10-11]
- **AC-43** IF a metric's denominator is zero, THEN the system SHALL store it as
  having no value and show "n/a", never 0% or 100%. [user: answer to B5, 2026-10-11]
- **AC-44** The system SHALL compute suite-run metrics over completed cases only, and
  SHALL show the errored-case count next to the metrics whenever it is above zero.
  [user: answer to B6, 2026-10-11]

### Agent detail page (design 03)

- **AC-45** The system SHALL show, for one agent: its name and model, the run count, an
  agent switcher, a period filter (default "30 days", plus "All time"), "Run eval", the
  three metric cards with sparklines and deltas against the previous completed run, the
  trend chart, and the recent-runs table. [user: answer to B7, 2026-10-11; period
  presets: user: confirmed, 2026-10-12]
- **AC-46** WHEN the user picks another agent in the switcher, the system SHALL show
  that agent's detail page.
- **AC-47** WHEN the user changes the period filter, the system SHALL limit the trend
  chart and the recent-runs table to suite runs started within that period.
- **AC-48** The system SHALL list suite runs newest first, each row showing the start
  time, the agent version (v N), recall, precision and citation accuracy as bars with
  values, cases passed / total, the errored count when above zero, and the cost.
- **AC-49** The system SHALL show the trend chart with one point per completed suite
  run in chronological order and one line each for recall, precision and citation
  accuracy. A point's tooltip SHALL give the agent version, the run time and the cost.
- **AC-50** WHEN the latest completed suite run shows a negative delta against the
  previous completed run for any metric, rounded to whole percentage points, the system
  SHALL show a regression alert banner that names each dropped metric, the size of the
  drop and the version. Metrics that rose SHALL be mentioned too. The banner SHALL be
  computed in code. [user: answer to B7, 2026-10-11]

### Compare and promote (design 04)

- **AC-51** WHILE exactly two suite runs are selected in the recent-runs table, the
  system SHALL enable "Compare". At any other count it SHALL keep it disabled.
- **AC-52** WHEN the user clicks "Compare", the system SHALL open a modal titled
  "v<older> → v<newer>" with recall, precision, citation accuracy and cost shown as
  old → new with a signed delta. It SHALL also show a line diff of the two versions'
  system prompts, taken from the stored version configs.
- **AC-53** IF both selected runs used the same agent version, THEN the system SHALL
  show the metric deltas and state "same prompt version" in place of the diff.
- **AC-76** WHEN the compare modal opens, the system SHALL show, beside the prompt
  diff, the difference between the two runs' recorded skill sets: skills added,
  removed, and changed in version. It SHALL state "same skills" when the sets are
  equal. This applies even when both runs used the same agent version.
  [user: accepted SG1, 2026-10-12]
- **AC-54** WHERE the newer-selected run's version differs from the agent's current
  version, the system SHALL offer "Promote v N" in the compare modal.
  [user: answer to B7, 2026-10-11]
- **AC-55** WHEN the user clicks "Promote v N", the system SHALL ask for confirmation,
  naming the version and that it will become the agent's current config.
  [user: answer to B7, 2026-10-11]
- **AC-56** WHEN the user confirms a promote, the system SHALL write a new agent
  version whose config is a copy of version N's stored config, and make it current. It
  SHALL also restore, as the agent's attached skills, the skill set recorded on the
  promoted run (AC-75). Skills are not pinned to a version, so a restored skill uses
  its latest body; the recorded skill versions are not brought back. Every existing
  version SHALL stay unchanged (history is append-only).
  [user: answer to B7, 2026-10-11; user: answer to plan-34 GAP1, 2026-10-12]
- **AC-80** WHEN the promote confirmation (AC-55) is shown, the system SHALL list the
  skill set that will be restored. It SHALL name any recorded skill that no longer
  exists, which is left out of the restore.
  [user: answer to plan-34 GAP1, 2026-10-12]
- **AC-57** IF the selected version's stored config is missing, THEN the system SHALL
  refuse to promote and say why.

### Eval Dashboard (design 02)

- **AC-58** The system SHALL provide an "Eval Dashboard" page in the left sidebar.
- **AC-59** The system SHALL list every agent on the dashboard with its model, its
  latest completed suite run (version, time, cases passed / total), a trend sparkline,
  and the latest recall, precision and citation accuracy. Agents SHALL be ordered by
  latest run newest first; agents with no run come last, marked "never run".
- **AC-60** WHEN the user opens an agent row, the system SHALL show that agent's detail
  page.
- **AC-61** The system SHALL list the 20 newest suite runs across all agents, newest
  first, each with the agent name, the time, the version, the three metrics and cases
  passed / total. [user: confirmed, 2026-10-12]

### Verification

- **AC-62** The system SHALL provide `pnpm verify:l06`. It SHALL be hermetic (no live
  LLM call, no API key, isolated secrets) and SHALL pass only when all of these pass
  [user: answer to B8, 2026-10-11]:
  1. the eval-pipeline server unit and integration tests, run against a mock LLM
     provider;
  2. a test proving that scoring makes zero LLM-provider calls;
  3. a test proving that two suite runs with different scripted model outputs (old and
     new prompt) produce different recall and precision;
  4. a check that the test fixture suite has at least 8 cases and covers both
     `must_find` and `must_not_flag`. The fixture serves the tests and
     `verify:l06` only; `db:seed` seeds no eval cases.
     [user: answer to plan-34 GAP2, 2026-10-12];
  5. a test that, for an accepted and for a dismissed finding, opening the draft and
     running it write no case, cancelling leaves no case, and Save creates exactly one
     case whose expectation type matches (`must_find` / `must_not_flag`);
  6. client typecheck and client unit tests;
  7. a byte-equality check of the eval contracts in the two vendored `shared` copies.
- **AC-63** The system SHALL ship a documented manual demo with a live model. The
  user first builds a suite of at least 8 cases on Security Reviewer from real
  accepted and dismissed findings, through the EvalCaseModal: the user's decisions are
  the dataset. The demo then makes two suite runs, with an old and a new system prompt,
  whose metrics differ. A third run with a deliberately broken prompt shows lower
  precision. [user: answer to B8, 2026-10-11; user: answer to plan-34 GAP2, 2026-10-12]

## Edge cases

- **Finding flips after a case is made.** The case is frozen (AC-4). A later
  re-accept or re-dismiss of the source finding does not change the case or its
  expectation type. A second click opens the existing case (AC-16).
- **Finding flips while its draft is open.** The draft keeps the type it was seeded
  with, as the banner shows. The user decides at Save.
- **Draft edited after a draft run.** The result is marked stale (AC-68) and is not
  stored on Save; the saved case is "never run" (AC-70). The same applies when the
  agent's version changed between the draft run and Save.
- **Draft discarded after a draft run.** The user is asked "Discard draft?" first
  (AC-78). On confirmation, the model call's cost is spent and no case exists. The
  spend is announced by the confirmation of AC-67.
- **Two drafts from the same finding** (two tabs). The first Save wins. The second is
  refused and offered the existing case (AC-72).
- **Saved case deleted.** The next click on its source finding opens a fresh draft.
- **Expected output emptied to `[]` in a seeded draft.** Allowed; the case becomes
  "must flag nothing" (AC-6).
- **Finding on a seeded demo PR with no patch and no clone.** Creation is refused
  (AC-14). No eval cases are seeded. The demo suite of at least 8 cases is built by the
  user from real findings on PRs that have diff text (AC-63), and the tests use a
  fixture. [user: answer to plan-34 GAP2, 2026-10-12]
- **The PR moved since the review.** The draft's hunks come from the PR's current
  SHAs (AC-12). If those hunks no longer cover the finding's lines, Save is refused
  under AC-25, with the reason that the PR's current diff no longer contains the
  finding's lines. The user can paste the original hunk or adjust the range.
  [user: answer to plan-34 GAP4, 2026-10-12]
- **Provider key missing.** Every run start is refused before anything is created
  (AC-79). A key removed during a suite run makes the remaining cases errored (AC-32).
  [user: answer to plan-34 GAP3, 2026-10-12]
- **Promoted run's skills partly deleted.** The rest is restored and the missing ones
  are named (AC-80). [user: answer to plan-34 GAP1, 2026-10-12]
- **Finding on a newly added file.** Line drift of 2–8 lines can turn a real hit into
  a miss under the strict rule (AC-38). The user widens the expectation's range in the
  Case Editor. No implicit tolerance applies.
- **Agent deleted.** Its cases and suite runs are removed with it, and it disappears
  from the dashboard. One-click on its old findings is refused (AC-15).
- **Agent with cases but no runs.** The Evals tab shows "never run" per case, the
  metric cards show "n/a", the trend chart is empty with a "no runs yet" note, and the
  dashboard row shows "never run".
- **Agent with no cases.** The Evals tab shows an empty state with "New eval case".
  The agent is left out of "Run all agents", and its own suite run is refused (AC-36).
- **Only one completed run.** No deltas (shown as "—"), no alert, and Compare cannot be
  enabled for lack of a second run.
- **All cases errored.** The run is stored as failed with "n/a" metrics and the
  errored count. It produces no trend point and is ignored by the alert and the deltas.
  [user: confirmed, 2026-10-12]
- **Only must_not_flag cases.** Recall is "n/a" (AC-43). Precision and citation
  accuracy are still computed.
- **Agent returns zero findings.** Precision and citation accuracy are "n/a". Recall
  is 0 when any `must_find` exists.
- **Skills changed without a version bump.** Linking skills does not change the agent
  version number, so two runs on the same "v N" may differ in attached skills. Each run
  records its skill set (AC-75), and the compare modal shows the difference (AC-76).
- **A recorded skill was deleted later.** The run keeps the recorded name and version,
  and the compare modal still shows them.
- **Agent edited during a suite run.** The run uses the version current at its start,
  for every case.
- **Two browser tabs start a run.** The second start is refused (AC-31).
- **Case deleted or edited after runs.** Past suite runs keep their stored metrics.
  The latest result shown for an edited case is cleared to "never run" until it runs
  again. [user: confirmed, 2026-10-12]
- **Source PR or finding of a case deleted later.** The case keeps its frozen PR meta.
  The links of AC-77 show as unavailable instead of broken.
- **Huge pasted diff.** Refused above the case size limit (see NFR).
- **Promote of the current version.** Not offered (AC-54).
- **Period filter excludes every run.** The chart and table show "no runs in this
  period". The metric cards still show the latest run.
- **Sort orders.** Cases newest first. Suite runs newest first. Trend points
  oldest → newest. Dashboard agents by latest run newest first, never-run agents last.

## Non-functional requirements

- **Cost.** Every run trigger, a draft run included, shows its case count and model(s)
  before spending (AC-28, AC-33, AC-34, AC-67). Scoring is free (AC-37). The run cost is shown per run and per
  point.
- **Security.** The API is reachable from the whole LAN (server gotcha), so a run
  start is a paid side effect any network peer can trigger. Run starts are limited to
  one in-flight suite run per agent (AC-31). No route returns secrets.
- **Size.** A case's diff SHALL be at most 256 KB, and a suite at most 200 cases. Over
  either limit, save or run is refused with the limit named.
  [user: confirmed, 2026-10-12]
- **Determinism.** The same stored model outputs always produce the same metrics and
  pass/fail.
- **Latency.** Cases in a suite run may run concurrently, up to a bounded limit. The
  UI shows progress and never blocks on a running suite.
- **Testability.** The engine stays pure. Tests use a mock LLM provider and never read
  real secrets.

## Inputs and provenance

- Accepted / dismissed state of a finding — [reused: findings accept/dismiss, `POST /findings/:id/(accept|dismiss)`]
- Finding file, line range, title, severity, category — [llm: agent review call that produced the finding]
- Diff fragment for a one-click case — [external: forge diff / clone `base_sha...head_sha`, fallback `pr_files.patch`]
- PR meta (repo, number, title, head SHA) — [external: forge PR data stored in `pull_requests`]
- Prefilled draft name, expectation type and type banner — [deterministic: source finding's accepted/dismissed state, title, file and lines]
- Hand-written or edited diff, expected-output JSON, case name — [user: EvalCaseModal]
- Draft-run findings — [llm: agent review call on an unsaved draft's input]
- Agent's current config (prompt, model, strategy, skills) and version number — [reused: agents module, `agent_versions`]
- Attached skill set at run start (names and versions) — [reused: `GET /agents/:id/skills`, skill `version`]
- Stored version configs for the prompt diff and promote — [reused: `GET /agents/:id/versions/:version`]
- Findings the agent returns during an eval run — [llm: agent review call on a case's frozen input]
- Grounding result (passed vs dropped findings) — [deterministic: reviewer-core grounding gate]
- Recall, precision, citation accuracy, pass/fail, deltas, alert — [deterministic: eval scoring code]
- Run cost and duration — [deterministic: provider usage reported by the review call, priced by the existing price book]
- Existing fixture cases and runs — [reused: plan 09 / 12 review-eval CLI rows, excluded from this feature]

## Untrusted inputs

- **Diff fragments**, whether frozen from a PR (external) or pasted by a user, are
  shown and sent to the agent as data. They are wrapped as untrusted content in the
  prompt like any review diff, and never interpreted as instructions.
- **PR meta** (external) is shown as text, never rendered as HTML or followed.
- **Model output during an eval run or a draft run** (llm) is used only through its structured
  file/line fields for scoring. Its title and rationale text is shown as text only. A
  call that fails or cannot be parsed makes the case errored (AC-32).
- **Source finding text** (llm) copied onto an expectation is used for display only,
  never in matching (AC-5).
- **Hand-written expected-output JSON, names and system prompts shown in the compare
  diff** (user) are shown as text. They are validated (AC-24…AC-26, AC-74); the JSON
  is parsed as data only.
- **Source finding title in the banner and prefilled name** (llm) is shown as text
  and turned into a kebab-case name only. A prompt diff is never
  executed or rendered as markup.
- Content from cloned repositories reaches this feature only as diff text frozen into
  a case. It is data.

## Module interactions

- **`@devdigest/shared`** (`server/src/vendor/shared`, then the client vendored copy,
  kept byte-equal). The existing eval contracts (`EvalCase`, `EvalCaseInput`,
  `EvalRun`, `EvalRunRecord`, `EvalRunResult`, `EvalTrendPoint`, `EvalDashboard`) are
  the base. They need:
  - a typed expectation shape (`must_find` / `must_not_flag`, file, line range,
    display fields);
  - a suite-run record (agent version, model, attached skill set as names and
    versions, status, progress, errored count, per-case results, cost);
  - nullable metrics for "n/a";
  - version and cost on trend points;
  - the source-finding and source-PR link on a case;
  - a compare payload, including the skill-set difference.
  Today `EvalTrendPoint` metrics are non-nullable and `EvalRun` has no version.
- **server, eval module.** It already holds the fixture-scoring CLI (plans 09/12). The
  feature adds the HTTP surface beside it, without changing the CLI:
  - case CRUD per agent;
  - a draft seed for a finding, which reads, writes nothing, and returns the refusals
    of AC-9, AC-14 and AC-15, or the saved case of AC-16;
  - a run of an unsaved draft, which writes no case;
  - `POST /agents/:id/eval-runs` (suite run);
  - a single-case run; run all agents, run history and detail, compare, and the dashboard aggregate.
  Today `eval_runs` is one row per case with no grouping, version or model, so
  persisting a suite run needs a schema extension. That is the plan's decision.
- **server, reviews module.** It is the source of findings (file, lines, title,
  severity, category, accepted/dismissed timestamps) and of the reviewed diff for
  freezing a fragment. Accept and dismiss are mutually exclusive (setting one clears
  the other).
- **server, agents module.** It supplies the current agent config and the version
  history (`GET /agents/:id/versions[/:version]`). Promote writes through the existing
  update path, which bumps the version on a config change (`PUT /agents/:id`). Agent
  deletion must remove the agent's cases and runs: `eval_cases.owner_id` has no
  foreign key today.
- **reviewer-core.** Consumed unchanged if possible: the review run on a diff and the
  grounding gate's kept/dropped split, which citation accuracy needs.
- **client.** Touches:
  - FindingCard (the "Turn into eval case" action);
  - the AgentEditor Evals tab (reserved key `editor.tabs.evals`);
  - one EvalCaseModal with DiffView, seeded from a finding or empty for a hand-written
    case, with no "Run on save" toggle;
  - the `/eval` dashboard and per-agent detail pages (reserved nav `nav.eval`, app-shell
    helper, `messages/en/eval.json`);
  - the compare modal.
- **mcp-server.** Not touched.

## Open questions

_None._

## Changelog

- 2026-10-12 · approved after the EvalCaseModal correction (AC-10–AC-17, AC-22, AC-23, AC-27, AC-33, AC-62, AC-64–AC-78): one click opens a draft that is saved only after validation; SG1/SG4/SG5 added, SG2/SG3 → Non-goals · user "так", mentor feedback
- 2026-10-12 · AC-12, AC-32, AC-56, AC-62 #4, AC-63, AC-79, AC-80, Edge cases · plan-34 GAP1–GAP4: promote restores the run's skill set (latest skill bodies); no seeded eval cases, fixture for tests, user-built demo suite; missing provider key refuses the run start; hunks re-derived from current PR SHAs, guarded by AC-25 · user "так, беремо по рекомендаціям"
- 2026-10-12 · re-approved; confirmed AC-79 applies to every run trigger (Run all agents skips and names keyless agents) and AC-80 promotes with the remaining skills, naming deleted ones · user "Тоді згоден"
- 2026-10-12 · implemented via plan 34 (docs/plans/34-eval-pipeline.md): complete — needs sign-off, accepted by the user (TAC3 equivalents, MetricCard delta format)
