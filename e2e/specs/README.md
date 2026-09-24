# e2e/specs — executable flows, not written specifications

**This directory is the exception.** In `client/`, `server/`, `reviewer-core/`,
and the repo root, `specs/` holds written feature specifications. Here it holds
the **executable** agent-browser flows the runner actually runs.

- Flows are `NN-name.flow.json`; `run.ts` globs this directory and executes every
  file ending in `.flow.json` in name order, against one shared browser session.
- Files that don't match that suffix — this README included — are ignored by the
  runner, so documentation here is harmless.
- Written prose about the suite belongs in [`../docs/`](../docs/README.md).

The flow format, the assertion model, and the coverage table are in
[`../README.md`](../README.md). Two rules matter most when adding a flow:
deterministic locators only (never the AI `chat` command), and target the seeded
read-only fixtures so no run can trigger a model call.

## Flows

| Flow | Journey |
|------|---------|
| `01-app-boot` | root → redirect to first repo's PR list → seeded PR #482 |
| `02-repo-pulls-detail` | PR list → open PR #482 → review detail route |
| `03-agents` | agents list renders the seeded reviewer agents |
| `04-pr-findings` | PR #482 → Agent runs tab → verdict + findings; expand → FindingCard |
| `05-pr-diff` | PR #482 → Files changed tab → seeded file in the diff viewer |
| `06-onboarding` | `/onboarding` → add-repository form renders (no submit) |
| `07-settings` | `/settings/api-keys` + `/settings/models` → section titles render |
| `11-gitlab-affordances` | API Keys → GitLab PAT row + scopes hint; onboarding copy accepts a GitLab URL |
