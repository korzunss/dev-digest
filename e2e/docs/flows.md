# Flows: format, order, catalogue, and debugging

How to read a `specs/*.flow.json` file, why the `NN-` prefix is load-bearing,
what each of the 11 current flows checks, and what to do when one goes flaky.
Read this before writing a new flow or chasing a red one. For env knobs, the
full run instructions and the short coverage table, see
[`../README.md`](../README.md); this document doesn't repeat those.

## 1. The `*.flow.json` format

A flow is JSON matching the `Flow` type in `e2e/lib/assert.ts:18-22`:

```ts
export interface Step {
  cmd: string[];                                  // agent-browser argv, {BASE} substituted
  label?: string;                                 // defaults to the joined cmd
  assert?: { stdoutIncludes?: string };            // optional extra substring check
}
export interface Flow {
  name: string;
  description?: string;
  steps: Step[];
}
```

(`e2e/lib/assert.ts:9-22`)

`e2e/run.ts` is the only consumer. For each `*.flow.json` in `specs/` it:

1. substitutes `{BASE}` in every arg with `E2E_BASE_URL` (default
   `http://localhost:3000`), trimming a trailing slash — `resolveArgs`
   (`e2e/lib/assert.ts:37-40`, called at `e2e/run.ts:69`);
2. execs the resolved argv against the `agent-browser` binary
   (`AGENT_BROWSER_BIN`, default `agent-browser`) with a per-command timeout
   (`E2E_STEP_TIMEOUT`, default 60000ms) — `ab()` at `e2e/run.ts:44-51`;
3. a **non-zero exit fails the step and the flow** — `run.ts` catches, records
   the failure, takes a screenshot into `test-results/<spec-id>-fail.png`, and
   `break`s out of the remaining steps in that flow (`e2e/run.ts:80-88`);
4. if the step also carries `"assert": { "stdoutIncludes": "…" }`, the
   command's stdout must contain that substring or the step fails the same way,
   without a screenshot (`e2e/run.ts:73-77`, `stdoutContains` at
   `e2e/lib/assert.ts:42-44`);
5. after every flow has run, it closes the shared `agent-browser` session
   (`ab(["close"])`, `e2e/run.ts:109-110`) and prints a PASS/FAIL summary via
   `summarize()` (`e2e/lib/assert.ts:46-58`), exiting 1 if any flow failed
   (`e2e/run.ts:113-114`).

**Selectors are deterministic only.** Every `cmd` in the current specs is one
of: `open <url>`, `wait --load networkidle`, `wait --url <substring>`,
`wait --text <substring>`, `click --text <text>`, or
`find text|role <value> click [--name <name>]` (see e.g.
`e2e/specs/02-repo-pulls-detail.flow.json:8`,
`e2e/specs/04-pr-findings.flow.json:10`,
`e2e/specs/09-skills.flow.json:10`). None of them is the AI `chat` command —
`e2e/AGENTS.md:36-37` states that's deliberate: it's what keeps runs stable and
key-free. A `wait` step **is** the assertion (a timeout is a non-zero exit); the
`"assert"` block only adds a check on top, it never replaces the `wait`.

## 2. Why the `NN-` prefix is the run order

`run.ts` globs `specs/`, keeps files ending in `.flow.json`, and calls
`.sort()` on the filenames — plain lexical order — before running them in a
single `for` loop in one process (`e2e/run.ts:53-61`, `e2e/run.ts:104-107`).
All flows share **one** `agent-browser` session: the daemon keeps the browser
and its page across every `ab()` call for the whole run, and is only closed
once, at the very end (`e2e/run.ts:109-110`). So a flow can start wherever the
previous one left the page — every current flow works around this by opening
its own starting URL as its first step, but nothing enforces that for a flow
someone adds later.

The ordering also has to protect against flows that mutate shared, persisted
state. `10-conventions.flow.json` is the only flow that writes anything: it
rejects and accepts convention candidates and creates a real skill row (steps
at `e2e/specs/10-conventions.flow.json:14-32`). It runs after every flow that
enumerates skills or agents by name (`03-agents`, `09-skills`), so the skill it
creates (`payments-api-conventions`) can't appear as noise in an assertion that
doesn't expect it. Flows `02`, `04`, `05` and `08` additionally assume the
seeded repo `acme/payments-api` is the *only* repo in the database, because
they all rely on the home redirect landing on it (see §3); `06-onboarding` and
`11-gitlab-affordances` touch the add-repository screen but explicitly never
submit it, so today nothing in the suite can add a second repo — but a future
flow that does must sort after `02/04/05/08`, not before.

New flows: pick the next free `NN-`, per `e2e/AGENTS.md:29-32` ("name new
flows `09-…`, `10-…` to place them").

## 3. The 11 flows today

| Spec | Covers | Seed data / precondition |
|---|---|---|
| `01-app-boot` | Root loads, client fetches repos, `/` redirects to a repo's `/pulls`, heading renders. Order-independent smoke (`e2e/specs/01-app-boot.flow.json:3`). | At least one repo seeded — doesn't check which. |
| `02-repo-pulls-detail` | PR list → click the seeded PR row → `/pulls/482` renders the PR title. | `acme/payments-api` is the **first** (only) repo, PR #482 (`e2e/specs/02-repo-pulls-detail.flow.json:3,7`). |
| `03-agents` | `/agents` renders a seeded `AgentCard` ("Security Reviewer"). | Seeded reviewer agents. |
| `04-pr-findings` | PR #482 → Agent runs tab → seeded run's verdict ("request changes"), finding count ("2 findings"), and the newest run's `FindingCard` open by default ("Hardcoded Stripe secret key in commit"). | Same first-repo assumption as `02`; a seeded review run on PR #482 (`e2e/specs/04-pr-findings.flow.json:3`). |
| `05-pr-diff` | PR #482 → Files changed tab → `DiffViewer` renders a seeded path (`src/config.ts`). | Same first-repo assumption; PR #482's diff. |
| `06-onboarding` | `/onboarding` renders the add-repository form (heading + "Repository URL" field). Never submits. | None beyond the app booting. |
| `07-settings` | `/settings/api-keys` and `/settings/models` each render their section title ("API Keys", "Feature Models"). | None. |
| `08-severity-filter` | PR list's FINDINGS chip (1 critical) deep-links into `/pulls/482?severity=CRITICAL&tab=findings`; clearing the filter brings the WARNING finding back. | Same first-repo assumption; PR #482 seeded with one CRITICAL and one WARNING finding (`e2e/specs/08-severity-filter.flow.json:3`). |
| `09-skills` | `/skills` rail → open a seeded skill (`secret-leakage-gate`) → walk Config/Context/Preview/Versions/Stats/Evals tabs → open agent `Test Quality Reviewer` → its Skills tab lists an attached skill (`test-coverage-nudge`). | Seeded skill `secret-leakage-gate` with v1/context/stats data; seeded agent `Test Quality Reviewer` with an attached skill. |
| `10-conventions` | Sidebar → `/repos/:id/conventions` → reject one candidate, bulk-accept the rest, open the create-skill modal, confirm the preview, create the skill, confirm it lands in `/skills` as `payments-api-conventions`. Never presses "Run extraction / Re-scan" (the one model-calling button). | Grounded, pending convention candidates already seeded for `acme/payments-api`, at least two (`e2e/specs/10-conventions.flow.json:3`). |
| `11-gitlab-affordances` | Settings → API Keys shows the GitLab PAT row, its scope hint (`read_api + write_repository`) and `GITLAB_HOST` pointer, alongside the pre-existing GitHub row; onboarding's copy accepts a GitLab URL. Deliberately doesn't import a real GitLab project. | None beyond the app booting; GitLab import itself is covered by `server/test/gitlab.it.test.ts` and `server/test/gitlab-adapter.test.ts` (`e2e/specs/11-gitlab-affordances.flow.json:3`). |

All of them target **read-only** seeded fixtures except `10-conventions`,
which is the one flow in the suite that writes (`e2e/specs/10-conventions.flow.json:3`).
None of them uses the AI `chat` command, so none can trigger a model call
(`e2e/AGENTS.md:41-42`).

## 4. Hermetic run vs. your own stack

Two ways to point the runner at a stack; both are documented in full, with the
env knobs, in [`../README.md`](../README.md#run-locally):

- **Hermetic (`./scripts/e2e.sh`)** — an isolated Postgres/API/web trio on
  alternate ports (`:5433` / `:3101` / `:3100` by default), with no persistent
  volume, so the DB is empty and freshly seeded every run and the first-repo
  assumption in §3 always holds.
- **Your own stack (`./scripts/dev.sh` + `npm test`)** — the default ports
  (`:5432` / `:3001` / `:3000`). Only safe when that DB contains *only* the
  seeded demo repo; see the checklist below.

## 5. Debugging a flaky flow

1. **Check which stack you're actually pointed at** — `E2E_BASE_URL` and
   whether the DB behind it has more than the one seeded repo. This is the
   single most common cause of a "flaky" flow: it's deterministic once you
   know which stack failed. See the standing rule in
   [`../insights/gotchas.md`](../insights/gotchas.md) and the full write-up in
   [`../INSIGHTS.md`](../INSIGHTS.md).
2. **Read the failure screenshot.** A failed step writes
   `test-results/<spec-id>-fail.png` before the flow aborts
   (`e2e/run.ts:84-87`); CI uploads the directory as an artifact
   (`e2e/AGENTS.md:52`).
3. **Re-read the step label in the console output**, not just PASS/FAIL —
   `summarize()` prints every failing step with its label and failure detail
   (`e2e/lib/assert.ts:46-58`).
4. **Never "fix" it with `docker compose down -v`** against your dev stack —
   see the same gotcha; it deletes every repo and review you've imported, it
   doesn't just reset the seed.
5. If the flow that failed is one of `02/04/05/08`, confirm `acme/payments-api`
   is still the first repo returned by the API before doubting the flow itself.
6. If root cause isn't obvious after this, treat it as a real regression, not
   suite flakiness — nothing in this runner does implicit retries.

## 6. Adding a new flow

1. Pick the next free `NN-` (§2) — e.g. `12-…` — so it sorts after everything
   it might depend on and before nothing that depends on it.
2. Write `e2e/specs/NN-name.flow.json`: a `name`, an optional `description`
   (used by every current flow to record its seed-data assumptions — keep
   doing that), and `steps` using only the deterministic locators in §1.
3. Start each flow with its own `open` step; don't rely on where the shared
   session's page happens to be left by whatever runs before it (§2).
4. If the flow needs seed data that isn't already there, say so in
   `description` (see `10-conventions.flow.json`'s PRECONDITION line) rather
   than let it fail silently against an empty state.
5. If the flow could ever need write access to a fixture no other flow
   touches, or otherwise change the "only repo" assumption in §3, place it
   after `02/04/05/08` and say so in its `description`.
6. Run it via the hermetic stack first (§4) — a flow that only ever ran
   against a populated dev DB can bake in an untested assumption.
7. Add a row to the coverage table in [`../README.md`](../README.md) and to
   the catalogue in §3 above.
