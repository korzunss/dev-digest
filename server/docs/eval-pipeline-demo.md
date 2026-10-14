# Eval pipeline — manual demo (live model)

The hermetic check is `cd server && pnpm verify:l06`. It runs against scripted
mock providers and calls no model. This page is the other half: a demo with a
real model on the **Security Reviewer** agent. The suite is built by you, from
your own accept/dismiss decisions. `db:seed` creates no eval cases.

## Before you start

1. Postgres, API and web up: `./scripts/dev.sh` from the repo root (API :3001, web :3000), or `pnpm dev` in `server/` and in `client/`. Apply migrations first: `cd server && pnpm db:migrate`.
2. A provider key for the model Security Reviewer uses, set in Settings. Without
   it every run start is refused with "No API key for `<provider>`", and no run
   is created.
3. A repo synced from GitHub with a pull request that has diff text, and a
   Security Reviewer review on it. Paid runs cost money: the app asks for
   confirmation each time and names the case count and the model.

## 1. Build a suite of at least 8 cases

1. Open the PR and decide on the Security Reviewer findings: **accept** the real
   ones, **dismiss** the false positives. A finding with no decision cannot be
   turned into a case.
2. On each decided finding click **Turn into eval case**.
   - An accepted finding becomes a `must_find` case: the model has to report it.
   - A dismissed finding becomes a `must_not_flag` case: the model must stay quiet.
3. In the modal check the diff, the expected output and the name. Optionally
   **Run case** to see one result, then **Save**. A refusal names the element and
   the reason, for example "no diff text available for `<file>`".
4. Repeat until **Agents > Security Reviewer > Evals** lists at least 8 cases,
   with both kinds.

## 2. Run with the old prompt

1. On the Evals tab click **Run all evals**, then confirm.
2. Wait for "Running x / y" to finish. The cards show **Recall**, **Precision**
   and **Citation accuracy**. Note them.

## 3. Edit the prompt, run again, compare

1. On **Agents > Security Reviewer > Config** (system prompt) make a real improvement and save.
   That creates a new agent version.
2. Run the eval again (step 2).
3. Open **Eval Dashboard** (sidebar, SKILLS LAB) and the agent's detail page.
   Select the two runs and open the comparison: metric deltas, the prompt diff
   and the skills diff. The metrics should differ.

## 4. Break the prompt, run a third time

1. Break the prompt on purpose, for example tell the agent to flag every line
   as a security issue. Save.
2. Run the eval a third time. **Precision** drops, because the dismissed
   findings (`must_not_flag` cases) are now reported. The trend chart on the
   detail page shows the third point.

## 5. Promote back

1. In the comparison open the good run and click **Promote v`<n>`**.
2. The confirmation names the version and the skills to restore. Skills that no
   longer exist are listed and left out. Confirm.
3. The agent gets a new version with that run's prompt and skills. Past versions
   stay as they were. Run the eval once more to see the metrics return.

## Troubleshooting

- "A run is already in progress for this agent": wait for it. One suite run per
  agent at a time.
- Save refused because the PR's current diff no longer contains the finding's
  lines: paste the original hunk into the Diff tab or adjust the range.
- Runs left in `running` after an API restart are marked failed on boot.
