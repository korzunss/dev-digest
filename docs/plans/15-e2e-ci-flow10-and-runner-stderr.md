# Development Plan: e2e — stabilise flow 10's sidebar click on CI, surface agent-browser stderr
Status: done
Save as: docs/plans/15-e2e-ci-flow10-and-runner-stderr.md
Spec: none

## Goal & acceptance criteria
Flow 10 failed on GitHub CI at `find role link click --name Conventions` with no error text, while plan 14 had it green locally (dev and prod builds). Add a readiness guard before that click, and make the runner print the child's stderr on a failed step so the next CI failure names its real cause. Pass/fail semantics stay as they are.
- AC1: `e2e/specs/10-conventions.flow.json` waits for `networkidle` and for a sidebar link whose href is `/repos/<real id>/conventions` before it clicks the sidebar entry.
- AC2: when an agent-browser command exits non-zero, the step's `detail` (console line and final summary) carries the first line of the error plus up to 5 trimmed, non-empty lines of the child's stderr. With empty stderr the message is exactly what it is today.
- AC3: the pass/fail outcome is unchanged: same `ok` flags, same `break` after the first failure, same screenshot, same process exit code.
- AC4: `./scripts/e2e.sh` gives 11/11 on 3 consecutive runs, and one production-mode run (`next build && next start`) gives 11/11.
- AC5 (user sign-off, after push): the `e2e web` workflow on the PR is green.

## Decisions needed
None. Every choice was fixed by the user; see the brief in the request. One scope note is for the user: S1 also edits one citation line in `e2e/docs/flows.md` (a third file, Markdown only). See *Risks*.

## Decisions recorded
User, 2026-09-30: approved the plan as written ("так, затверджую"), after being told that:
- S1 also edits one line of `e2e/docs/flows.md` (a third file);
- the hydration hypothesis is weak, so the flow-10 guard may be a no-op, and S2's stderr is the diagnostic if CI stays red.
Status draft → approved → in-progress (G1).

## Prerequisites
- Docker (for `./scripts/e2e.sh`), and `agent-browser` 0.38 installed globally (`e2e/AGENTS.md` → Commands).
- The main session's scratch prod variant of `scripts/e2e.sh`, for AC4's production run. It is not a repo file and not part of this plan.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S2 | e2e (flow spec + runner) | — | none (last group). New symbol: `stepFailureDetail(e: unknown): string`, file-local in `e2e/run.ts` |

G1 is under the 3-file / 80-line floor, and there is no neighbouring group to merge it into. That is expected for a plan that has only one group.

## Steps

### S1 — Guard flow 10's sidebar click with networkidle + a resolved-href check
- **Files:** `e2e/specs/10-conventions.flow.json` (modify) · `e2e/docs/flows.md` (modify, line 76 only)
- **Change:**
  - In `10-conventions.flow.json`, insert two steps between the current line 7 (`wait --text "Add rate limiting to public API endpoints"`) and line 8 (`find role link click --name Conventions`). Keep line 7 as it is.
    1. `{ "cmd": ["wait", "--load", "networkidle"], "label": "PR list and repo fetches settle" }`
    2. `{ "cmd": ["wait", "--fn", "<EXPR>"], "label": "the sidebar Conventions link carries a real repoId" }`, with `<EXPR>` exactly:
       `[...document.querySelectorAll('a[href*=conventions]')].some(a => (h => h.startsWith('/repos/') && h.endsWith('/conventions') && !h.startsWith('/repos/_/') && !h.includes(':repoId'))(a.getAttribute('href') || ''))`
       It uses single quotes only and no backslashes, so it needs no JSON escaping. An unresolved href is `/repos/_/conventions`, because `resolveHref` substitutes `repoId ?? "_"` (`client/src/vendor/ui/nav.ts:78-81`). The raw template is `/repos/:repoId/conventions` (`nav.ts:41`).
  - In `e2e/docs/flows.md:76`, change the citation `e2e/specs/10-conventions.flow.json:14-32` to `:16-34`. The two inserted lines shift the mutating steps down by 2. Change nothing else in that file.
- **Layer / why here:** flow data only. The guard belongs in the flow because the runner stays generic (`e2e/AGENTS.md` → Conventions: "`wait` steps are the assertions").
- **Skills to apply:** none (JSON flow + Markdown; per `implementer.md`, `e2e/**` flows have no dedicated skill, so `e2e/AGENTS.md` and `e2e/docs/flows.md` bind)
- **Practices:**
  - Use deterministic locators only (`wait --load`, `wait --fn`), with no sleeps and no `chat`.
  - Guard steps go *before* the `find … click`, and each has a `label`.
  - The file stays valid JSON, and the order of the existing steps is unchanged.
- **Known gotchas:**
  - "No `click --text` … wait for the click target before `find … click`" → [e2e/insights/gotchas.md → Flow grammar](../../e2e/insights/gotchas.md). The `--fn` guard is that wait, scoped to the link itself.
  - "Run the hermetic stack (`./scripts/e2e.sh`)" → [gotchas.md → Local runs](../../e2e/insights/gotchas.md). Never `docker compose down -v`.
- **Done when:** `jq . e2e/specs/10-conventions.flow.json` exits 0 · `sed -n 8,9p` of that file shows the two new steps · `grep -n '10-conventions.flow.json:16-34' e2e/docs/flows.md` matches.

### S2 — Include the child's stderr in a failed step's detail
- **Files:** `e2e/run.ts` (modify)
- **Change:**
  - Add a file-local `function stepFailureDetail(e: unknown): string` at the **end** of `run.ts`, after the `main().catch(...)` block. A function declaration is hoisted, and placing it last keeps every line number that `e2e/docs/flows.md` cites (`run.ts:44-51`, `:69`, `:73-77`, `:80-88`, `:84-87`) valid.
  - Behaviour:
    - `head` = the first line of `e.message` when `e` is an `Error`, otherwise `String(e)`. This is today's value.
    - `stderr` = `e.stderr` when `e` is a non-null object with a string `stderr` property (narrow with `typeof` / `in`; do not use `as any`).
    - Lines = `stderr` split on `\n`, each trimmed, empties dropped, first 5 kept (constant `STDERR_LINES = 5` declared inside the function, or as a literal. No module-level `const` below `main()`, because of the temporal dead zone).
    - Return `head` when no lines remain. Otherwise return `${head} — stderr: ${lines.join(" | ")}`, one line, so `summarize()` output stays one line per failed step.
  - In the `catch` at `run.ts:80-81`, replace `const msg = (e as Error).message.split("\n")[0];` with `const msg = stepFailureDetail(e);`. This is a one-line swap: no other line in `runFlow` changes, and the screenshot call, `steps.push`, `console.log` and `break` stay as they are.
  - Do not touch `lib/assert.ts`. `StepResult.detail` stays `string`.
- **Layer / why here:** runner I/O formatting. It stays in `run.ts` because it depends on the `execFile` error shape, while `lib/assert.ts` holds only the pure flow and result types.
- **Skills to apply:** `typescript-expert`, `security`
- **Practices:**
  - Catch as `unknown` and narrow structurally, with no `any` and no new casts. Keep strict-mode clean (`e2e/tsconfig.json` has `strict: true`).
  - Pass/fail logic does not change. Only the string in `detail` changes.
  - The child's stderr is logged as-is, capped at 5 lines. It comes from a local CLI and is not attacker-controlled. Do not add `process.env` or any other env values to the message (security A09: no secrets in logs).
  - Leave the screenshot `ab([...]).catch(() => {})` call alone.
- **Known gotchas:** "The runner hides the CLI's stderr; wrap `AGENT_BROWSER_BIN` to see it" → [gotchas.md → Flow grammar](../../e2e/insights/gotchas.md). This step removes the need for the wrapper. Updating that item is wrap-up work (see *Insights to record*), not part of this step.
- **Done when:**
  - `cd e2e && npm run typecheck` exits 0.
  - Negative check, then revert: temporarily change flow 10's `--name Conventions` to `--name ConventionsXYZ` and run `./scripts/e2e.sh`. The ✗ line and the summary for flow 10 must show `— stderr:` followed by agent-browser's own error text. Revert the change, and confirm with `git diff --stat e2e/specs/` that only S1's lines remain.
  - `./scripts/e2e.sh` gives 11/11 on 3 consecutive runs (AC4).
  - One run of the main session's prod variant gives 11/11 (AC4).

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `e2e/specs/10-conventions.flow.json` (the flow itself, via `./scripts/e2e.sh` ×3 + one prod run) | e2e | AC1, AC4 | S1 |
| Manual negative run with a bad locator (reverted) | e2e, manual | AC2 | S2 |
| `npm run typecheck` | static | S2 types | S2 |

`e2e/` has no unit-test runner (`e2e/package.json` has no vitest dependency, and `npm test` *is* the browser suite), so no unit test is added. Adding one would need a new dependency, which is out of scope.

## Migrations & contracts
None.

## Out of scope
- Any change to `lib/assert.ts`, the `summarize()` format beyond the longer `detail` string, exit codes, timeouts, or the screenshot logic.
- Adding a test runner or any dependency to `e2e/package.json`.
- Changing other flows, `scripts/e2e.sh`, the CI workflow (`.github/workflows/e2e-web.yml`), or pinning the agent-browser version.
- Adding sleeps or retries to flow 10.
- Editing `client/src/vendor/ui/nav.ts` or any client code.
- Editing `e2e/insights/gotchas.md`, `e2e/INSIGHTS.md` or `e2e/AGENTS.md`: that belongs to the wrap-up skill.

<!-- implementer-brief:end -->

## Context applied
- `e2e/insights/gotchas.md` → "No `click --text` … wait for the click target before `find … click`": shapes S1's `--fn` guard on the link itself. The same item's "runner hides the CLI's stderr" is what S2 fixes.
- `e2e/INSIGHTS.md` → "2026-09-30 — agent-browser 0.38 locator grammar": its evidence is that `run.ts` drops stderr and prints only `Command failed: …`, which matches the CI failure text.
- `e2e/insights/gotchas.md` → "Run the hermetic stack": all Done-when runs use `./scripts/e2e.sh`.
- `docs/plans/14-e2e-flows-agent-browser.md` → S4 guard pattern (`networkidle` → `--fn` → click) and its verifier gap on `flows.md` citation drift (line 231). This is why S1 carries the one-line `flows.md` fix and S2 puts its helper at the end of the file.
- `client/src/vendor/ui/nav.ts:41,78-81` → an unresolved href is `/repos/_/conventions`.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| engineering-insights | preload | — | read-only use (Step 0); wrap-up is the main session's |
| onion-architecture | preload | — | no `server/`, `reviewer-core/` or `mcp-server/` file touched |
| typescript-expert | on demand (S2) | S2 | — |
| security | on demand (S2) | S2 | — |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| e2e | `specs/10-conventions.flow.json` | flow data | changed |
| e2e | `run.ts` | runner | changed |
| e2e | `docs/flows.md` (line 76) | docs | changed |

## Design notes
- **Why stderr is enough.** Node's `execFile` rejection builds its message as `Command failed: <cmd>\n<stderr>` and also sets `.stderr` (assumption: Node core behaviour, not confirmed from the repo). The runner's `split("\n")[0]` at `run.ts:81` is exactly what discards it. S2 keeps the first line and adds stderr lines explicitly, so it does not depend on the message format.
- **A timed-out step** (`E2E_STEP_TIMEOUT`) is killed with SIGTERM and may have empty stderr. The detail then equals today's text, which is acceptable and matches AC2.

## Risks & open questions
- **The hydration hypothesis is weak (from reading the code).** `/` is a client component that redirects with `router.replace` after a client-side `useRepos()` fetch (`client/src/app/page.tsx:1-18`). The PR list is also `"use client"` and fetches on the client (`client/src/app/repos/[repoId]/pulls/page.tsx:1-3`). The seeded PR title therefore appears only after React is running. On `/repos/<id>/pulls` the sidebar's `repoId` comes from the URL path first (`client/src/lib/repo-context.tsx:1-2,47-48`), so the href is resolved even in server HTML, and the `--fn` guard may pass immediately. The guard is still cheap and correct, but it may not be the fix. S2's stderr is what will name the cause if CI fails again. Other candidates, none proven: a detached node during the soft navigation, or `find role link --name` matching more than one element. If CI is still red, read the stderr before adding more guards. A stricter hydration check (a `__reactProps$*` key on the link) is a possible follow-up, not in this plan.
- **Scope note:** the user brief said 2 files. S1 also edits `e2e/docs/flows.md:76` (one citation), because inserting 2 lines into flow 10 would otherwise leave a stale `:14-32` citation. Plan 14's verifier raised the same kind of drift as a gap. The user can strike this line from S1 if unwanted.
- AC5 (green `e2e web` on the PR) is a user-visible sign-off item that the implementer cannot verify locally.
- No external research questions.

## Handed off
- architecture-reviewer: nothing notable (test harness only).
- security review: none needed. Local CLI stderr is written to CI logs, capped at 5 lines, and no env values are logged.

## Insights to record
- `e2e/insights/gotchas.md` · Flow grammar: once S2 lands, reword "The runner hides the CLI's stderr; wrap `AGENT_BROWSER_BIN` to see it" to say that failures now show `— stderr: …` (`e2e/run.ts` `stepFailureDetail`). Add a correction entry in `e2e/INSIGHTS.md` first.
- `e2e/INSIGHTS.md` · Recurring Errors & Fixes: the real cause of the CI flow-10 failure, once S2's stderr reveals it. Write nothing if it is never seen again.

## Red-flags check
- [x] Every AC maps to at least one step or test (AC1→S1, AC2/AC3→S2, AC4→S1+S2 Done when, AC5→sign-off)
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create` (no new files)
- [x] Every assumption is marked; product choices are in *Decisions needed* (none open; the Node error-shape assumption is marked)
- [x] Groups end type-checking; parallel groups share no file (one group)
- [x] No group under 3 files / ~80 lines that could merge with a neighbour (single group, nothing to merge with)
- [x] The brief above the marker is under ~20,000 characters
- [x] Pass 1: n/a (single pass)
- [x] Every step's *Skills to apply* is complete (the implementer reads only those)

## Handoffs → verification (after G1)
From the G1 implementer run (2026-09-30, status done; S1–S2 done; no deviations).
- Files: `e2e/specs/10-conventions.flow.json` (+2 guard steps), `e2e/docs/flows.md` (citation `:16-34`), `e2e/run.ts` (`stepFailureDetail` at the end of the file; a one-line swap in the `catch`).
- Checks: `jq` ✅; flows.md grep ✅; e2e typecheck ✅. Negative check `--name ConventionsXYZ` gave 10/11, and the output showed `— stderr: ✗ 6 elements have role "link", but none match name "ConventionsXYZ". Names seen: …`; it was reverted (`grep -c XYZ` = 0). `./scripts/e2e.sh` 11/11 ×3 ✅; prod variant 11/11 ✅.
- Main-session review: the diff matches S1–S2, and pass/fail semantics are unchanged.

### Skills (G1)
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `typescript-expert` | on demand | S2 | |
| `security` | on demand | S2 | |
| `onion-architecture` | preload | — | e2e package, no backend layers |

## Verification log
### Wave 1 (2026-09-30)
- plan-verifier: **complete — needs sign-off**: 36/44 met, no gaps, no unplanned changes. Not-verifiable (needs a browser or CI): AC4/D6/D7/T1, D5/T2, AC5, R3, R4.
- **Main-session runs (AC4/D6/T1):** `./scripts/e2e.sh` ran 3 consecutive times, each `11/11 flows passed`, exit 0.

### AC5 failed on CI (2026-09-30, commit 49e5da4)
`e2e web` gave 10/11. Flow 10 failed at the sidebar click, although both guard steps passed:
`✗ follow the SKILLS LAB sidebar entry — Command failed: agent-browser find role link click --name Conventions — stderr: ✗ Element not found. Verify the selector is correct and the element exists in the DOM.`
The wording differs from a real miss (`N elements have role "link", but none match name …`). So `find` resolved the link and the element was gone at click time: it was re-mounted between resolve and click, and the race window is wider on a slow CI runner. User: "робимо усе у межах цього плану".
- **Gap SC1 (fix mode, S1 file):** in `e2e/specs/10-conventions.flow.json`, replace `["find","role","link","click","--name","Conventions"]` with a click that resolves at click time, `["click", "a[href$='/conventions']"]` (a CSS selector, no stored ref). Keep both guard steps before it and update the step label. Done-when: `jq` ✅, `./scripts/e2e.sh` 11/11 ×3, and a prod-variant run 11/11. Final proof is AC5 on CI.
- **Investigation SC2 (read-only, researcher):** find what re-mounts the sidebar nav link after the PR list has loaded (e.g. a `key` or wrapper change after the repos or sync status fetch). If it is a client bug, fixing it touches `client/`, which is outside this plan's steps, so it would be a plan change needing the user's approval.
- **SC2 result (researcher, 2026-09-30, medium confidence, nothing executed):** no client code remounts the Conventions `<a>` after the PR list renders. There is no data-derived `key`, no loading/loaded wrapper switch, and no nested `Suspense`/`loading.tsx`. `usePulls` refetches only update in place, and `useRepos` has no interval. The only remount is the `/` → `/repos/<id>/pulls` page swap (each page renders its own `AppShell`), which commits with the URL that flow 10 already waits for. Conclusion: the "remount between resolve and click" theory is not supported by the code. The likelier cause is agent-browser's `find role … --name` resolve/ref path (the link's name comes from a nested `div > span`). SC1's click-time CSS selector is the right mitigation either way. No `client/` change is warranted, so there is no plan change.
- **Fix mode SC1 (2026-09-30):** implementer done. `10-conventions.flow.json` step 10 is now `["click", "a[href$='/conventions']"]` (0.38.1 `click --help`: "a CSS selector, XPath, or an element reference"). Both guards are kept. Checks: `jq` ✅, `./scripts/e2e.sh` 11/11 ×3 ✅ (after the edit landed; 3 earlier runs came before a failed BSD `sed -i` and are discounted), prod variant 11/11 ✅. AC5 is pending CI after push.
- **AC5 met (2026-09-30):** on PR #13 at commit `8541592`, all 7 checks passed, including `e2e web / browser flows` (user's screenshot of the PR checks).

### Sign-off (2026-09-30)
User: "R3 підтверджую, R4 приймаю".
- R3 signed off: after approval, only the main session edited this plan file (Status, Decisions recorded, handoffs, Verification log).
- R4 accepted: no test-writer run; e2e has no test runner. The evidence is the negative-locator check (stderr shown, reverted) and CI.

### Final (2026-09-30)
Verification complete: AC5 met on CI (`8541592`, 7/7 checks green), SC1 fixed, SC2 found no client bug. The user signed off R3 and accepted R4. Status → `done`. Open follow-ups (not decided):
- CI installs `agent-browser` latest, unpinned;
- the exact cause of the CI-only `find role … click` failure is not established.
