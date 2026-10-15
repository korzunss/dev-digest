# Spec: Export to CI
Spec ID: SPEC-14
Status: implemented
Supersedes: none

## Problem & user

A developer tunes a review agent in the DevDigest studio. Its model, system prompt,
attached skills, strategy and gate are a versioned configuration (SPEC-12). Today
that agent runs only on the developer's machine, so the team cannot rely on it for
every pull request: a review happens only when someone runs it locally.

The developer needs to move the tuned agent into a GitHub repository so it reviews
every PR in GitHub Actions. They also need to see those CI runs back in the studio:
which repo, PR and commit was reviewed, the verdict, the findings, and the cost. Doing
this by hand (writing a workflow, copying the prompt and skills, wiring a runner,
handling secrets safely) is slow and easy to get wrong in ways that leak secrets or
run untrusted PR code with write permissions.

The same manifest gives the same configuration, not a byte-identical result. Model
answers vary and CI tool versions differ. So each CI run must record what it ran with:
manifest version, model, runner and dependency versions, and the commit SHA.

## Goals / Non-goals

**Goals**

- An "Add to CI" action on the agent page opens an Export Wizard with four steps:
  Target → Preview → Configure → Install. It follows the five design screens as
  closely as possible.
- GitHub Actions is the one working target. It serializes the agent to a manifest that
  the studio and the runner validate with the same shared schema.
- The export goes through a dedicated `devdigest/ci` branch and a pull request in the
  target repo, never straight to the default branch. The alternative is a zip download.
- A bundled agent-runner committed into the target repo runs the review with
  `reviewer-core`, including the grounding gate. It publishes the result as configured
  and fails the check when the agent's *Fail CI on* gate trips.
- CI results come back into the studio through a verified, pull-based channel and are
  recorded as agent runs with source `ci`.
- A CI Runs page and a CI tab on the agent page show installations, history and the
  gate setting.
- The generated workflow is secure by default: minimal permissions, no
  `pull_request_target`, pinned actions, no secrets in logs or artifacts, and untrusted
  PR data never turned into commands.

**Non-goals**

- Generators for CircleCI, Jenkins or Generic CLI. Their cards are visible but disabled
  [user: answer to B1, 2026-10-14].
- GitLab repositories as a target [user: answer to B3, 2026-10-14].
- A published marketplace action. `devdigest/review-action@v1` in the mock is a
  placeholder and is not used [user: answer to B4, 2026-10-14].
- An inbound ingest endpoint, a public tunnel, or a GitHub App [user: answer to B2,
  2026-10-14].
- Reading, writing or validating the value of `OPENROUTER_API_KEY`.
- Configuring GitHub branch protection or rulesets. Making the check *required* stays a
  manual step that the wizard explains.
- A Stats tab on the agent page. The Memory, Multi-Agent Review and Agent Performance
  nav items from the design are out of scope [user: answer to B7, 2026-10-14].
- Any change to the multi-run service or the PR feed (scope fence from the request).
- Making CI review output byte-identical to a local run.
- Supporting `pull_request` events beyond opened, synchronize and reopened.
- Runner support for the OpenAI and Anthropic providers is deferred to a possible later
  spec. That work would add their own adapters and show `OPENAI_API_KEY` or
  `ANTHROPIC_API_KEY` as the expected secret, per the agent's provider. Export is
  OpenRouter-only for now (AC-68) [user: plan-41 GAP2, 2026-10-14].
- Counting CI runs in the PR list cost, the PR in-flight state, eval results or skill
  stats (AC-69) [user: plan-41 GAP3, 2026-10-14].

## User stories

- As a developer, I want to export my tuned agent to a connected GitHub repo as a pull
  request, so that my team can review the workflow before it runs on every PR.
- As a developer, I want to preview the generated workflow and adjust its name, timeout
  and runner image before installing, so that it fits my repo without any risk to its
  security settings.
- As a reviewer of the export PR, I want a checklist of permissions, triggers and the
  secret it needs, so that I can approve it knowingly.
- As a team lead, I want a CRITICAL finding to fail the CI check, so that a required
  status check can block the merge.
- As a developer, I want to see every CI review in the studio, linked to the right
  repo, PR, commit and GitHub job, so that I can track cost and quality across CI runs.
- As a developer, I want to know when a repo runs an older agent version and update it
  in a few clicks, so that CI stays in step with my tuning.

## Acceptance criteria (EARS)

### Entry points and navigation

- **AC-1** The system SHALL show a "CI" tab on the agent page after the existing
  Versions tab. The tab set is Config · Skills · Context · Evals · Versions · CI
  [user: answer to B7, 2026-10-14].
- **AC-2** The system SHALL show a "CI Runs" item in the sidebar under a new "GLOBAL"
  section that links to the CI Runs page. This is recorded as a signed-off exception
  to the vendored-nav rule [user: answer to B7, 2026-10-14].
- **AC-3** The CI tab SHALL show:
  - a "CI deployment" heading;
  - an "Active in N repos" badge, where N is the agent's installation count;
  - "Update CI config" and "+ Add to CI" buttons;
  - one row per installation with repo, target "GitHub Actions", the latest ingested
    run status (`passed`, `gate_failed` or `error`, per AC-70), and its relative time.
    A row with no ingested run shows "no runs yet"
    [user: plan-41 GAP4, 2026-10-14];
  - a dashed "+ Add repository" row.
- **AC-4** WHEN the user clicks "+ Add to CI" or "+ Add repository", the system SHALL
  open the Export Wizard at step Target for this agent [user: answer to B6, 2026-10-14].
- **AC-5** WHILE the agent has no installations, the CI tab SHALL show an empty state
  that explains Export to CI and offers "+ Add to CI".

### Step 1 — Target

- **AC-6** The Export Wizard SHALL show a four-step stepper (Target, Preview, Configure,
  Install). It marks completed steps with a check and the current step as active.
- **AC-7** The Target step SHALL show four cards:
  - GitHub Actions ("Runs on pull_request events", badge "recommended"), selected;
  - CircleCI ("config.yml job"), disabled and not selectable;
  - Jenkins ("Pipeline stage"), disabled and not selectable;
  - Generic CLI ("devdigest review --pr"), disabled and not selectable.

  [user: answer to B1, 2026-10-14]
- **AC-8** The Target step SHALL include a repository picker that lists only GitHub
  repositories connected in DevDigest. It defaults to the active repo when that repo is
  a GitHub repo [user: answer to B3, 2026-10-14].
- **AC-9** IF no GitHub repository is connected, THEN the system SHALL disable Continue
  and point the user to connecting a repository.
- **AC-10** IF the agent already has an installation in the selected repo, THEN the
  system SHALL tell the user that installing will update that installation (AC-31),
  rather than create a second one.
- **AC-73** IF the selected repo already has an installation of a different agent in
  the workspace, THEN the system SHALL refuse the install, as a PR or as a zip, with an
  error that names that agent. The error SHALL suggest running "Update CI config" for
  that agent or removing its installation first. No zip fallback is offered in this
  case. This is because the workflow file and the `devdigest/ci` branch are per repo,
  so one repo holds one DevDigest agent [plan-41 fix mode 4, 2026-10-15].

### Step 2 — Preview

- **AC-11** The Preview step SHALL show a "FILES TO CREATE" list and the selected file's
  contents beside it. The files are:
  - `.devdigest/agents/<slug>.yaml`
  - `.devdigest/skills/<skill-slug>.md`, one per attached skill
  - `.devdigest/memory.jsonl`
  - `.devdigest/runner/index.js`
  - `.github/workflows/devdigest-review.yml`

  For an agent with two skills, as in the design, that is six files. In general it is
  4 plus the number of skills. Every place that names the count (the Install text and
  the PR body) SHALL use the real count for this agent
  [user: accepted recommendation, 2026-10-14].
- **AC-12** The system SHALL serialize the agent's current version into
  `.devdigest/agents/<slug>.yaml` and validate it with the shared manifest schema before
  showing it. The manifest carries:
  - name, provider, model, system prompt, skill slugs, strategy and `ci_fail_on`;
  - the agent version number;
  - the manifest schema version.

  Export applies only to an agent whose provider is OpenRouter (AC-68)
  [user: plan-41 GAP2, 2026-10-14].
- **AC-68** IF the agent's provider is not OpenRouter, THEN the system SHALL block the
  export, say that CI export currently supports only OpenRouter, and suggest switching
  the provider in the agent's Config tab [user: plan-41 GAP2, 2026-10-14].
- **AC-13** IF the serialized manifest fails the shared manifest schema, THEN the system
  SHALL block Continue and show which field failed.
- **AC-14** The system SHALL write `.devdigest/memory.jsonl` as one JSON object per line,
  with only `kind` and `content`. It includes only memory entries scoped to the target
  repo. Global-scope and team-scope memory SHALL not be exported, because it may carry
  knowledge from other repos into a possibly public repo. The file is empty when there
  are none [user: answer to B5, 2026-10-14; plan-41 SF3 / memory, 2026-10-15].
- **AC-15** The system SHALL mark `.github/workflows/devdigest-review.yml` with a badge
  reading "editable: name, timeout, runner" and every other file as read-only. A hint
  beside the badge says that triggers and "Post results as" are set in Configure, and
  that any further change belongs in the export PR on GitHub
  [user: answer to B4, 2026-10-14; plan-41 SF3 / memory, 2026-10-15].
- **AC-16** The generated workflow SHALL:
  - trigger only on `pull_request` with the event types chosen in Configure;
  - declare `permissions: contents: read, pull-requests: write` and nothing else;
  - pin `actions/checkout` (with `persist-credentials: false`), `actions/setup-node`
    and `actions/upload-artifact` to full commit SHAs;
  - take `.devdigest/` (runner, manifest, skills, memory) from the PR's base commit,
    never from the PR head [user: plan-41 GAP5, 2026-10-14];
  - take only the diff from the PR head [user: plan-41 GAP5, 2026-10-14];
  - run the runner from that base-commit `.devdigest/runner/index.js`;
  - pass `OPENROUTER_API_KEY` only as an env value from Actions secrets;
  - contain no `${{ }}` expression over PR-controlled data inside a `run:` step;
  - upload `devdigest-result.json` as an artifact.

  So a PR cannot swap the runner, manifest, skills or memory while the key is in the
  environment [user: answer to B4, 2026-10-14; plan-41 GAP5, 2026-10-14].
- **AC-17** WHEN a workflow is submitted (Continue in Preview, Install as PR or as zip),
  the system SHALL accept it only if it parses as YAML and equals the generated workflow
  except for these three fields:
  - the workflow `name`;
  - the review job's `timeout-minutes`;
  - the review job's `runs-on`, which must be one of `ubuntu-latest`, `ubuntu-24.04`
    or `ubuntu-22.04`.

  The server SHALL enforce this check on every submission, not only the wizard.
  Triggers and "Post results as" change only through Configure, which regenerates the
  file. The reason: the install route is reachable from the LAN and commits with the
  user's PAT, so an arbitrary workflow edit would let a third party exfiltrate repo
  secrets. Further edits belong in the export PR on GitHub, where the user reviews them
  [user: plan-41 SF3 / memory, 2026-10-15].
- **AC-18** IF the edited workflow does not parse as YAML, THEN the system SHALL block
  Continue and show the parse error with its line.
- **AC-19** IF a submitted workflow differs from the generated one in anything outside
  the three AC-17 fields, THEN the system SHALL refuse it with an error that names the
  first differing field, and SHALL commit and package nothing. Examples of refused
  differences:
  - triggers or `pull_request_target`;
  - `permissions`;
  - extra steps or jobs;
  - `env`, `defaults` or `container`;
  - other or re-pinned actions;
  - a changed runner step;
  - the checkout `path`, `ref` or `repository`.

  [user: accepted recommendation, 2026-10-14; plan-41 SF3 / memory, 2026-10-15]
- **AC-56** IF `runs-on` is set to a value outside the allowed list, or
  `timeout-minutes` is not an integer from 1 to 360 (the GitHub-hosted job limit), THEN the system SHALL refuse the
  submission with an error that names the field and lists the allowed values. There is
  no warn-and-allow path any more: the earlier warning case is dropped, because every
  difference outside the three editable fields is now refused (AC-19)
  [user: plan-41 SF3 / memory, 2026-10-15].
- **AC-20** The runner file SHALL start with a header comment that states the runner
  version and the sha256 of the bundle [user: answer to B4, 2026-10-14].

### Step 3 — Configure

- **AC-21** The Configure step SHALL show three trigger chips:
  - `pull_request:opened`, on by default;
  - `pull_request:synchronize`, on by default;
  - `pull_request:reopened`, off by default.

  It SHALL require at least one chip to be on, and it SHALL regenerate the workflow's
  event types from the chips.
- **AC-22** The Configure step SHALL show a "Secrets expected" table:
  - `OPENROUTER_API_KEY`, described as the user's OpenRouter key, with status
    "expected · not verified";
  - `GITHUB_TOKEN`, "Auto-provided by Actions", status "ready".

  The system SHALL never claim that the OpenRouter secret is set or not set, because it
  cannot read secret values. It SHALL not query GitHub for secret names either
  [user: accepted recommendation, 2026-10-14].
- **AC-23** The Configure step SHALL offer "Post results as" with three options:
  "GitHub review" (recommended, default), "PR comment" and "None (exit code only)".
- **AC-24** The Configure step SHALL show an info box. It says that to block merges the
  user sets *Fail CI on* in the CI tab so the run exits non-zero, then adds a required
  status check in GitHub branch protection or rulesets, and that no GitHub App is
  needed. The existing UI copy that says a GitHub App is required SHALL be replaced
  [user: answer to B8, 2026-10-14].

  The info box SHALL also recommend protecting `.github/` and `.devdigest/` with
  CODEOWNERS plus a ruleset, because for `pull_request` events GitHub runs the workflow
  file from the PR itself [user: plan-41 GAP5, 2026-10-14].

### Step 4 — Install

- **AC-25** The Install step SHALL offer two options:
  - "Open a PR with these files" (recommended, default), with text naming the target
    repo, the PR title "Add DevDigest CI review" and the generated file count;
  - "Copy files as a zip — add them manually".

  It SHALL also show a "GitHub Action setup docs" help link
  [user: answer to B3/B4, 2026-10-14].
- **AC-26** WHEN the user installs with "Open a PR", the system SHALL commit the
  generated files to the `devdigest/ci` branch of the target repo and open a PR into the
  repo's default branch titled "Add DevDigest CI review". It SHALL never write to the
  default branch [user: answer to B3, 2026-10-14].
- **AC-27** The PR body SHALL list the generated files and a manual review checklist
  covering:
  - the workflow permissions;
  - the trigger events;
  - how PR code is executed;
  - adding `OPENROUTER_API_KEY` under Settings → Secrets and variables → Actions;
  - protecting `.github/` and `.devdigest/` with CODEOWNERS plus a ruleset, because for
    `pull_request` events GitHub runs the workflow file from the PR itself
    [user: plan-41 GAP5, 2026-10-14];
  - a note that this PR's own workflow run skips with a notice (AC-71).

  [user: answer to B3, 2026-10-14]
- **AC-28** WHEN the PR is opened, the system SHALL show its link and record or update
  the installation. The installation holds the repo, target, exported agent version,
  workflow version, chosen triggers, post-as mode, and the PR URL.
- **AC-29** IF the stored GitHub token is missing, or lacks the `workflow` scope
  (classic) or Workflows: write permission (fine-grained), THEN the system SHALL show an
  error that names the missing permission and how to fix it, and SHALL offer the zip
  option. No partial branch is left recorded as an installation
  [user: answer to B3, 2026-10-14].
- **AC-30** WHEN the user installs with "Copy files as a zip", the system SHALL download
  a zip containing the same files at the same paths, including the workflow edits from
  Preview that AC-17 allows. The zip is subject to the same refusal rule
  (AC-19) [user: plan-41 SF3 / memory, 2026-10-15]. It SHALL also record or update the installation, marked "manual", with no PR
  URL [user: accepted recommendation, 2026-10-14].
- **AC-31** WHILE an export PR from `devdigest/ci` is open in the target repo, a new
  install to that repo SHALL add a new commit to `devdigest/ci` and reuse the open PR
  [user: answer to B3, 2026-10-14].
- **AC-32** IF the previous export PR was merged or closed, and every commit on
  `devdigest/ci` past its merge-base with the default branch carries the
  `DevDigest-Export` trailer, THEN a new install SHALL delete `devdigest/ci`, recreate it
  from the current default branch, and open a new PR. It SHALL never force-push
  [user: answer to B3, 2026-10-14; plan-41 GAP1, 2026-10-14].
- **AC-59** IF `devdigest/ci` has any commit past the merge-base without the
  `DevDigest-Export` trailer, or the branch is protected, THEN the system SHALL refuse
  the install with an error that names the reason and SHALL offer the zip. It SHALL
  neither delete nor force-push the branch
  [user: accepted recommendation, 2026-10-14; plan-41 GAP1, 2026-10-14].
- **AC-67** Every commit DevDigest makes on `devdigest/ci` SHALL carry a
  `DevDigest-Export` commit trailer [user: plan-41 GAP1, 2026-10-14].
- **AC-74** Every export commit SHALL delete any `.devdigest/agents/*.yaml` and
  `.devdigest/skills/*.md` that is not in the new file set. Renaming the agent or
  changing its skills therefore never leaves two manifests or orphaned skill files in
  the repo [plan-41 fix mode 4, 2026-10-15].

### Update CI config and Fail CI on

- **AC-33** WHEN the user clicks "Update CI config", the system SHALL ask which
  installation to update, unless there is exactly one. It SHALL then open the wizard at
  Preview with files regenerated from the agent's current version and Configure
  prefilled with that installation's saved choices [user: answer to B6, 2026-10-14].
- **AC-34** WHILE an installation's exported agent version or workflow version is older
  than the current one, the CI tab SHALL mark that row "out of date"
  [user: answer to B6, 2026-10-14].
- **AC-35** The CI tab SHALL show a *Fail CI on* control (never, critical, warning, any)
  that edits the agent's existing `ci_fail_on` field. Saving it creates a new agent
  version the same way any config change does (SPEC-12)
  [user: answer to B8, 2026-10-14].
- **AC-36** WHILE an installation exported a `ci_fail_on` different from the agent's
  current value, the CI tab SHALL state that the repo still uses the old gate until
  "Update CI config" is run [user: answer to B8, 2026-10-14].

### Installation lifecycle

- **AC-60** WHEN the user removes an installation from the CI tab and confirms, the
  system SHALL delete only the DevDigest installation record and keep its past CI runs.
  The confirmation SHALL say that the files in the repo must be removed by hand
  [user: accepted recommendation, 2026-10-14].
- **AC-61** WHILE an installation's repo is no longer connected in DevDigest, the CI tab
  SHALL show that installation as "inactive", and the system SHALL not fetch workflow
  runs for it [user: accepted recommendation, 2026-10-14].
- **AC-62** The CI tab SHALL show the export PR's state (open, merged or closed) on each
  installation row that has an export PR. The state is read from GitHub when the tab is
  opened or refreshed [user: accepted recommendation (SG1), 2026-10-14].
- **AC-63** WHILE an installation's latest export PR is open and not yet merged, the CI
  tab SHALL label that installation "pending merge" and SHALL not count it in "Active in
  N repos" [user: accepted recommendation (SG1), 2026-10-14].
- **AC-64** WHERE an installation has an export PR URL, the CI tab SHALL show a "View
  export PR" link on that row that opens the PR on GitHub
  [user: accepted recommendation (SG2), 2026-10-14].
- **AC-65** IF the export PR's state cannot be read (token missing or GitHub error),
  THEN the CI tab SHALL show the state as "unknown" and keep the rest of the row
  [user: accepted recommendation (SG1), 2026-10-14].

### Agent-runner (in CI)

- **AC-37** WHEN the workflow runs, the agent-runner SHALL do the following in order:
  1. validate the manifest with the same shared schema the studio uses;
  2. read the PR event payload file itself;
  3. take the diff of `base_sha...head_sha` from that event;
  4. run `reviewer-core` with the grounding gate.

  The manifest, skills, memory and runner it uses are the PR base commit's copies
  (AC-16) [user: answer to B4, 2026-10-14; plan-41 GAP5, 2026-10-14].
- **AC-71** IF the PR's base commit has no `.devdigest/runner/index.js` (for example the
  export PR's own run, before it is merged), THEN the workflow SHALL log a notice, skip
  the review and exit 0 [user: plan-41 GAP5, 2026-10-14].
- **AC-72** WHILE a PR changes files under `.devdigest/`, the agent-runner SHALL still
  review that PR with the base commit's manifest, skills, memory and runner. Changes to
  them take effect only after merge [user: plan-41 GAP5, 2026-10-14].
- **AC-38** IF the manifest fails schema validation, THEN the agent-runner SHALL fail
  the job with a message that names the invalid field, and SHALL not call the model.
- **AC-39** WHERE "Post results as" is "GitHub review", the agent-runner SHALL post one
  PR review with the findings. WHERE it is "PR comment", the runner SHALL post one PR
  comment. WHERE it is "None", the runner SHALL post nothing to the PR.
- **AC-40** WHEN the findings trip the manifest's `ci_fail_on` gate, the agent-runner
  SHALL exit with code 1 whatever the post mode is. Otherwise it SHALL exit 0
  [user: answer to B8, 2026-10-14].
- **AC-41** IF the PR comes from a fork, or `OPENROUTER_API_KEY` is not available, THEN
  the agent-runner SHALL log a notice, skip the review and exit 0
  [user: answer to B4, 2026-10-14].
- **AC-42** IF the model call fails or returns output that fails the structured-output
  schema, THEN the agent-runner SHALL record a failed result with the error class, post
  no findings, and exit with code 1, so a broken review never looks clean under a
  required check [user: accepted recommendation, 2026-10-14].
- **AC-43** The agent-runner SHALL write `devdigest-result.json` containing:
  - the verdict, gate result and findings count by severity;
  - cost, duration and tokens;
  - the manifest and agent versions, model, runner version and dependency versions;
  - the commit SHA it reviewed.
- **AC-44** The agent-runner SHALL never write `OPENROUTER_API_KEY`, `GITHUB_TOKEN` or
  any other secret into the log, the trace or `devdigest-result.json`.

### Ingest (pull-based)

- **AC-45** WHEN the CI Runs page or the agent's CI tab is opened, or the user clicks
  Refresh, the system SHALL fetch new `devdigest-review` workflow runs and their
  `devdigest-result.json` artifacts for each installation repo. It uses the stored
  GitHub token [user: answer to B2, 2026-10-14].
- **AC-57** WHILE the CI Runs page or an agent's CI tab is open, the system SHALL repeat
  the AC-45 fetch every 60 seconds. No fetch runs while neither is open
  [user: accepted recommendation, 2026-10-14].
- **AC-58** On each refresh, the system SHALL look back at most 30 days and page
  through at most 300 workflow runs per installation repo
  [user: accepted recommendation, 2026-10-14; plan-41 fix mode 4, 2026-10-15].
- **AC-75** IF a refresh reaches the 300-run cap for a repo before covering its 30-day
  window, THEN the system SHALL report that as a refresh error naming the repo, and
  SHALL keep what it recorded [plan-41 fix mode 4, 2026-10-15].
- **AC-76** WHEN a workflow run is re-run (a new attempt of the same run, with the same
  `created_at`), the system SHALL fetch and ingest the new attempt as its own CI run
  [plan-41 fix mode 4, 2026-10-15].
- **AC-46** The system SHALL take repository id, PR number, head commit SHA and job URL
  from GitHub's workflow-run metadata, never from the artifact
  [user: answer to B2, 2026-10-14].
- **AC-47** IF an artifact fails the shared result schema, or its commit SHA does not
  match the workflow run's head SHA, or the run belongs to a repo with no installation,
  THEN the system SHALL not record it as a CI run and SHALL show the rejection reason in
  the refresh feedback [user: answer to B2, 2026-10-14].
- **AC-48** WHEN an artifact passes validation, the system SHALL record it as an agent
  run with source `ci`, linked to the installation's agent, plus a CI run record that
  holds the repo, PR number, commit SHA, job URL, status and, when one exists, the link
  to the local PR record. The agent run of source `ci` SHALL not be linked to the local
  PR and SHALL record no skill usage
  [user: answer to B2, 2026-10-14; plan-41 GAP3, 2026-10-14].
- **AC-69** The system SHALL exclude runs of source `ci` from:
  - the PR list cost;
  - the PR in-flight state;
  - eval results;
  - skill stats.

  [user: plan-41 GAP3, 2026-10-14]
- **AC-70** The system SHALL store a CI run's status as exactly one of these, and never
  as running:
  - `passed`: the review completed and the gate did not trip;
  - `gate_failed`: the review completed and the `ci_fail_on` gate tripped;
  - `error`: the review failed (AC-38, AC-42).

  [user: plan-41 GAP4, 2026-10-14]
- **AC-49** The system SHALL record each workflow run attempt at most once, no matter
  how many times it is fetched.
- **AC-50** IF a workflow run has finished but has no `devdigest-result.json` artifact
  (skipped fork run, cancelled job, expired artifact), THEN the system SHALL record
  nothing for it and SHALL not retry it on every refresh.
- **AC-51** IF the GitHub token is missing or GitHub rejects the request, THEN the
  system SHALL keep the already-recorded CI runs visible and show the ingest error.

### CI Runs page

- **AC-52** The CI Runs page SHALL list CI runs newest-first. Each row shows repository,
  PR number, agent, verdict, findings count, cost, duration, run time, status
  (`passed`, `gate_failed` or `error`), and a link to the GitHub Actions job
  [user: plan-41 GAP4, 2026-10-14].
- **AC-53** The CI Runs page SHALL offer filters for time range (default last 7 days),
  agent, repository and status. The status filter's values are `passed`, `gate_failed`
  and `error` [user: plan-41 GAP4, 2026-10-14].
- **AC-54** WHILE there are no CI runs, the CI Runs page SHALL show the "No CI runs yet"
  empty state.
- **AC-55** IF a CI run's agent has been deleted, THEN the CI Runs page SHALL keep the
  row and show the agent as deleted.
- **AC-66** WHERE a CI run record links to a local PR record, the CI Runs row SHALL link
  the PR number to the local PR page. Otherwise the PR number is plain text next to the
  GitHub job link
  [user: accepted recommendation (SG3), 2026-10-14; plan-41 GAP3, 2026-10-14].

## Edge cases

- **Fork PRs:** no secrets are available and `GITHUB_TOKEN` is read-only. The runner
  skips and exits 0 (AC-41). The run produces no artifact and is not ingested (AC-50).
  `pull_request_target` is never used.
- **Re-export while the PR is open:** a new commit on `devdigest/ci` reuses the PR
  (AC-31).
- **PR merged or closed:** if every commit past the merge-base carries the
  `DevDigest-Export` trailer, the branch is deleted, recreated from the default branch,
  and a new PR is opened (AC-32, AC-67).
- **`devdigest/ci` has a commit without the trailer, or is protected:** the install is
  refused, the zip is offered, and the branch is neither deleted nor force-pushed
  (AC-59).
- **The export PR's own workflow run:** the base commit has no runner yet, so the run
  skips with a notice and exits 0. It produces no CI run (AC-71, AC-50).
- **A PR that edits `.devdigest/`** (runner, manifest, skills, memory): it is reviewed
  with the base commit's copies, and the edits take effect only after merge (AC-72).
- **A PR that edits `.github/workflows/devdigest-review.yml`:** GitHub runs the PR's
  version of the workflow for `pull_request` events. DevDigest cannot prevent this. The
  info box and the PR checklist recommend CODEOWNERS plus a ruleset on `.github/` and
  `.devdigest/` (AC-24, AC-27). Fork PRs still get no secrets.
- **Agent with a non-OpenRouter provider:** export is blocked with a suggestion to switch
  the provider in Config (AC-68).
- **Workflow file already exists at `.github/workflows/devdigest-review.yml`** (not from
  DevDigest): the export PR overwrites it on the branch, and the PR diff shows the
  change for the human reviewer.
- **Artifact fails schema, SHA mismatch, unknown repo:** rejected with a reason (AC-47).
- **Duplicate ingest or re-run attempts:** each attempt is recorded once (AC-49). A
  re-run attempt counts as a new run and is ingested even though its `created_at` is
  unchanged (AC-76) [plan-41 fix mode 4, 2026-10-15].
- **A repo with more than 300 runs in 30 days:** the refresh stops at the cap and
  reports it as an error (AC-58, AC-75).
- **Artifact expired** (GitHub retention): recorded nothing, not retried (AC-50).
- **Uninstall:** "Remove" deletes only the DevDigest record and keeps past runs. The repo
  files are removed by hand (AC-60). Artifacts arriving later from that repo are
  rejected because it has no installation (AC-47).
- **Export PR never merged:** the installation shows "pending merge" and is not counted
  as active (AC-63).
- **Agent deleted:**
  - its installations are removed with it;
  - its past CI runs stay on the CI Runs page as "deleted agent" (AC-55);
  - later artifacts from its repos are rejected (no installation).
- **Repo disconnected from DevDigest:** it disappears from the picker. Its installations
  show as "inactive" and are not polled (AC-61).
- **User-edited workflow YAML:** only `name`, `timeout-minutes` and `runs-on` (from the
  allowed list) may differ. Anything else is refused on every submission, including a
  zip (AC-17, AC-19, AC-56). "Update CI config" regenerates the workflow, so earlier
  edits are not carried over. Preview says so.
- **A crafted install request from the LAN** with a modified workflow: refused by the
  same server-side check (AC-17, AC-19) [user: plan-41 SF3 / memory, 2026-10-15].
- **Agent with no skills:** no `.devdigest/skills/` files are generated, and the
  manifest's skill list is empty.
- **Skill slug collision** (two skills slugify alike): slugs are made unique and the
  manifest references the unique slugs.
- **Huge diff in CI:** the runner relies on the agent's strategy (auto or map-reduce)
  as locally. The job's time limit bounds the run.
- **Concurrent installs to the same repo from two tabs:** the second install becomes a
  further commit on the same branch and PR. There is one installation per agent and
  repo.
- **A second agent on a repo that already has one:** refused with an error naming the
  installed agent, suggesting Update CI config or Remove, with no zip offered (AC-73).
  The same holds when two tabs try to install different agents on one repo
  [plan-41 fix mode 4, 2026-10-15].
- **Agent renamed or skills changed between exports:** stale manifests and skill files
  are deleted in the export commit (AC-74).
- **Concurrent workflow runs on the same PR** (synchronize bursts): each run is
  ingested on its own.

## Non-functional requirements

- **Security:**
  - The workflow keeps the AC-16 invariants.
  - Secrets never reach the manifest, artifact, log or trace (AC-44).
  - Ingest creates no inbound endpoint. Every mutating route this feature adds that has
    no unguessable path id requires a JSON object body, because the API is reachable
    from the LAN with no auth.
  - Artifacts are size-capped before parsing.
- **Reproducibility:** each CI run records the manifest version, agent version, model,
  runner version, dependency versions and commit SHA (AC-43). The runner bundle carries
  its own version and sha256 (AC-20).
- **Purity:** `reviewer-core` stays free of db, GitHub and fs access. All I/O lives in
  the agent-runner.
- **Auditability:** the runner bundle is not minified so a human can review it in the
  export PR [user: answer to B4, 2026-10-14].
- **Performance:** a refresh with no new workflow runs finishes without downloading any
  artifact. Run lists are paged, not loaded in full.
- **Cost:** CI model spend is charged to the repo's own OpenRouter key and reported per
  run, so DevDigest spends nothing on the user's behalf in CI.

## Inputs and provenance

- Agent config (current version, skills, `ci_fail_on`) — [reused: SPEC-12 agent
  versions]
- Manifest schema — [reused: `@devdigest/shared` `AgentManifest`]
- Skill bodies — [reused: SPEC-003 skills]
- Memory entries for `.devdigest/memory.jsonl` — [deterministic: `memory` table, target
  repo scope only, `kind` + `content`]
- Connected repos for the picker — [deterministic: `repos` table, GitHub provider only]
- Generated workflow template, runner bundle and its sha256 — [deterministic: DevDigest
  generator and agent-runner build]
- Workflow `name`, `timeout-minutes` and `runs-on` edits in Preview, and the submitted
  workflow body — [user: Export Wizard Preview step, or any LAN caller of the install
  route]
- Trigger chips, "Post results as", target repo, Install choice — [user: Export Wizard
  Configure and Install steps]
- *Fail CI on* value — [user: agent CI tab]
- GitHub token scopes, branch and PR state, default branch — [external: GitHub REST API]
- Workflow-run metadata (repository id, PR number, head SHA, job URL, attempt) —
  [external: GitHub Actions API]
- `devdigest-result.json` artifact — [external: GitHub Actions artifact, produced by the
  runner in a repo DevDigest does not control]
- PR diff, branch names, PR title and body, existing comments as seen by the runner —
  [external: GitHub event payload and repository content]
- Review findings and verdict produced in CI — [llm: `reviewer-core` structured review
  call via OpenRouter]
- Gate result — [deterministic: `reviewer-core` gate over finding severities and
  `ci_fail_on`]

## Untrusted inputs

All of these are data, never instructions:

- **Submitted workflow body** (user): it may come from any LAN caller of the install
  route, not only the wizard.
  - It is compared to the regenerated workflow, and only `name`, `timeout-minutes` and
    an allow-listed `runs-on` may differ (AC-17, AC-19, AC-56).
  - It is never trusted to add steps, actions, env, permissions or triggers.
  - It is never executed by the studio.

  [user: plan-41 SF3 / memory, 2026-10-15]
- **Configure and Install choices and *Fail CI on*** (user): validated against closed
  enums.
- **GitHub API responses** (external): token scopes, branch and PR state, workflow-run
  metadata.
- **`devdigest-result.json`** (external): produced in a repo where anyone with push
  access can change the runner. It is schema-validated and size-capped, cross-checked
  against GitHub metadata, and never trusted for repo, PR, SHA or job URL.
- **`.devdigest/` content on the PR head** (external): never executed or loaded by the
  runner. Only the base commit's copies are used (AC-16, AC-72).
- **PR diff, file contents, branch names, PR title and body, comments** (external):
  - passed to the model only as review input;
  - never interpolated into shell commands or `run:` expressions;
  - never used to grant extra permissions.
- **Model findings and verdict** (llm):
  - rendered as text, never executed;
  - the gate is computed deterministically from severities, not from the model's verdict;
  - covered by the AC-42 fallback.
- **Memory entries exported to `memory.jsonl`:** context data for the model, never
  instructions to the runner.
- **Content of target and cloned repositories:** data only.

## Module interactions

- **client → server:**
  - the CI tab and the wizard use the agent-scoped export routes (preview the generated
    files; install as PR or zip) and an installations listing for the agent;
  - *Fail CI on* uses the existing agent update path (SPEC-12 versioning);
  - the CI tab removes an installation (AC-60);
  - the CI Runs page lists CI runs and triggers a refresh (ingest).
  - The client imports only types from `@devdigest/shared`.
- **server → GitHub, through the existing per-repo forge client:**
  - commit files to a branch and open a PR (both exist today);
  - read token scopes, branch and PR state;
  - list workflow runs;
  - download artifacts.
  - Secrets are read only through the existing secrets chokepoint.
- **`@devdigest/shared` contracts:**
  - `AgentManifest` gains the agent version and manifest schema version;
  - `CiExportInput` already carries target, action, `post_as`, triggers and base;
  - `CiInstallation` gains exported versions and saved choices;
  - `CiRun` gains repo, commit SHA, verdict and job URL;
  - `CiResultArtifact` gains verdict, gate result, the provenance fields of AC-43 and
    the reviewed SHA.
  - Contracts change in the server copy first, then the client copy.
- **agent-runner (new top-level package, npm):**
  - consumes `reviewer-core` and the shared manifest and result schemas as source and
    bundles them into one file;
  - talks to the GitHub REST API (posts the review or comment with `GITHUB_TOKEN`) and
    to OpenRouter.
  - `reviewer-core` is unchanged in purity.
- **Persistence:** existing `ci_installations`, `ci_runs` and `agent_runs` (source `ci`)
  tables. Agent deletion cascades to installations. Removing an installation keeps
  its CI runs (AC-60), so a CI run carries its own repo and PR identity rather than
  relying on the installation link. The local-PR link lives only on the CI run record.
  The agent run of source `ci` has no PR link and no skill-usage rows, so the existing
  PR, eval and skill-stats readers do not see it (AC-48, AC-69)
  [user: plan-41 GAP3, 2026-10-14].
- **Contracts:** the CI run status contract becomes the closed set `passed`,
  `gate_failed`, `error` (AC-70) [user: plan-41 GAP4, 2026-10-14].
- **Out of scope:** the multi-run service and the PR feed are not touched.
- **Vendor exception:** `client/src/vendor/ui/nav.ts` gains the "CI Runs" item under a
  GLOBAL section. This is signed off by the user [user: answer to B7, 2026-10-14] in the
  same way as specs 004, 008, 009 and 011.

## Open questions

None. Q1–Q8 were answered on 2026-10-14 by accepting the recommendations, and are
recorded in AC-11, AC-19, AC-22, AC-30, AC-42, AC-56–AC-61 and *Edge cases*.
SG1–SG3 were accepted and are recorded in AC-62–AC-66.

## Changelog
- 2026-10-14 · approved (B1 by the user: all 4 targets shown, only GitHub Actions enabled; B2–B8, Q1–Q8 by recommendation; SG1–SG3 accepted; Open questions empty) · user "так, давай зробимо ресеч"
- 2026-10-14 · reopened → draft for plan-41 GAP1–GAP5: devdigest/ci recreate rule; non-OpenRouter agents blocked (option C, other providers in the runner, recorded as a future follow-up); CI runs kept out of PR/eval/skill aggregates; CI run statuses; `.devdigest/` taken from the base SHA + CODEOWNERS advice · user "Залишаємо А…" / "усі інщі по твоїм рекомендаціям"
- 2026-10-14 · GAP1–GAP5 correction written (AC-3, 12, 16, 24, 27, 32, 37, 48, 52, 53, 59, 66 reworded; AC-67–AC-72 added; Non-goal: other providers in the runner deferred); re-approved · user "так"
- 2026-10-15 · reopened → draft for plan-41 SF3 (security): the submitted workflow must equal the generated one except workflow `name`, job `timeout-minutes` and `runs-on` from a fixed list (AC-15/17/19/56 narrowed); memory export limited to the target repo (global memory no longer exported) · user "SF3 - А…" / "добре, давай по твоїм рекомендаціям"
- 2026-10-15 · SF3 / memory correction written (AC-14, 15, 17, 19, 30, 56 reworded; AC-56 `timeout-minutes` bounded 1–360 by the main session per its proposal); re-approved · user "давай виправимо правки безпеки перед тестуванням"
- 2026-10-15 · reopened → draft after /pr-self-review fix mode 4: one DevDigest agent per repo (installing a different agent on a repo with an installation is refused, offering Update/Remove; each export prunes stale agent/skill files); AC-58 cap changed from 100 to a paginated 300 runs per refresh (re-runs ingested via `updated_at`) · user "Так, давай виправимо HIGH разом із MEDIUM зауваження"
- 2026-10-15 · fix-mode-4 correction written (AC-58 reworded: 300 runs per refresh; AC-73 one agent per repo, AC-74 stale agent/skill files pruned, AC-75 cap reported as a refresh error, AC-76 re-runs ingested); re-approved · user "так"
- 2026-10-15 · implemented via plan 41 (docs/plans/41-export-to-ci.md): complete — needs sign-off, accepted by the user (export PR #30 merged on korzunss/dev-digest; no live review run yet; follow-ups listed in the plan) · user "так, я запушив ci у гіт. Можна закривати фічу"
- 2026-10-15 · renumbered SPEC-13 → SPEC-14 (`specs/014-export-to-ci.md`) and its plan 40 → 41 on the merge of `origin/L07`, where SPEC-13 / plan 40 belong to Multi-Agent Review; no criterion changed
