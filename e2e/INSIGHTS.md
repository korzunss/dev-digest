# Insights — `@devdigest/e2e`

Append-only. Things that cost someone time in the browser suite. Repo-wide
findings go in [`../INSIGHTS.md`](../INSIGHTS.md), which carries the entry format,
the section guide and the promotion rule (a standing rule becomes one line under
`Gotchas` in `e2e/AGENTS.md`). The `engineering-insights` skill writes here.

```md
### YYYY-MM-DD — short title
**Symptom:** what you observed.
**Cause:** why it happened.
**Rule:** what to do from now on.
**Evidence:** `path/to/file.ts:42` · command · error string
```

---

## What Works

### 2026-10-05 — `agent-browser drag <src> <dst>` drives React HTML5 drag-and-drop; no synthetic DragEvent fallback needed
**Symptom:** plan 24 needed an e2e check of drag reordering (AC-21), untestable in jsdom; the plan assumed agent-browser's mouse drag might not fire HTML5 `dragstart`/`dragover`/`drop` and prepared an `eval` fallback.
**Cause:** in agent-browser 0.38.1 the native `drag` command does trigger React's `onDragStart`/`onDragOver`/`onDrop` on `draggable` rows.
**Rule:** use `drag` with CSS selectors for HTML5 DnD; locate picker rows by the `Reorder <path>` handle's aria-label (attachable-row checkboxes carry none), and assert persistence after a full reopen.
**Evidence:** `e2e/specs/12-project-context.flow.json` (drag step, persisted-order `wait --fn`) · `./scripts/e2e.sh` → `12/12 flows passed`

## What Doesn't Work

_Nothing yet._

## Codebase Patterns

_Nothing yet._

## Tool & Library Notes

### 2026-09-30 — on CI, `find role link click --name …` can fail with a bare "Element not found" that never reproduces locally; click by CSS selector
**Symptom:** flow 10's sidebar click failed only on GitHub CI (7/7 green locally, on `next dev` and on `next build && next start`). stderr: `✗ Element not found. Verify the selector is correct and the element exists in the DOM.` That wording differs from a true miss (`N elements have role "link", but none match name "…"`). A `wait --fn` just before it had confirmed the link with a real href was in the DOM.
**Cause:** not established. The client code shows no remount of the link after the PR list renders (plan 15 SC2 research: no data-derived `key`, no wrapper switch, no nested Suspense). So the likely cause is agent-browser's resolve-then-click path for `find role … --name` on a link whose name comes from a nested `div > span`, on the slower CI runner.
**Rule:** when a `find role|text … click` passes locally but fails on CI with the bare "Element not found", switch that step to `click "<css selector>"`, which resolves at click time (e.g. `a[href$='/conventions']`). Keep a `wait --fn` guard before it that proves the target is ready. Don't chase it with sleeps.
**Evidence:** `e2e/specs/10-conventions.flow.json` (the sidebar step) · CI: `49e5da4` red with the stderr above → `8541592` green · `docs/plans/15-e2e-ci-flow10-and-runner-stderr.md` → "AC5 failed on CI", SC1, SC2

### 2026-09-30 — correction: the runner now prints agent-browser's stderr on a failed step (plan 15)
**Symptom:** the entry below says `e2e/run.ts` drops the CLI's stderr, and that seeing the real error needs an `AGENT_BROWSER_BIN` wrapper. After plan 14, CI's only failure (flow 10's sidebar click) passed 7/7 locally in dev and prod builds, and with no error text its cause could not be found.
**Cause:** plan 15 added `stepFailureDetail` (`e2e/run.ts`). It appends up to 5 non-empty lines of the child's stderr to the `✗` line, e.g. `— stderr: ✗ 6 elements have role "link", but none match name "…". Names seen: …`.
**Rule:** read the `— stderr:` part of a failed step, locally and in the CI log. The wrapper is no longer needed. A CI-only failure that passes locally (dev and `next build && next start`) is diagnosed from that line, not guessed at.
**Evidence:** `e2e/run.ts` (`stepFailureDetail`) · `docs/plans/15-e2e-ci-flow10-and-runner-stderr.md` → Handoffs → verification (negative locator check)

### 2026-09-30 — agent-browser 0.38 locator grammar: no `click --text`, `xpath=` prefix, `wait --text` sees CSS-uppercased text
**Symptom:** `e2e web` had never passed in CI (runs #1–#3 all red, 8/11). The runner printed only `Command failed: agent-browser …`. Flows 09/10 failed on `click --text X`, and flow 08 timed out on `wait --text "CRITICAL only"` although the chip was on screen.
**Cause:** in agent-browser 0.38 (CI installs `latest`, unpinned):
- `click` takes only `<selector>` (CSS, `xpath=…`, or `@ref`). `--text` is read as a CSS selector (`✗ Element not found: --text`).
- A bare `//…` XPath is also "not found" and needs the `xpath=` prefix.
- `wait --text` is a case-sensitive substring match on the *rendered* text, so CSS `text-transform: uppercase` turns "CRITICAL only" into "CRITICAL ONLY" (and "Confidence" into "CONFIDENCE").
- `find … click` does not wait, so it races a list that still shows "Loading…".
- `e2e/run.ts` drops the CLI's stderr, which hides all of the above.
**Rule:**
- Click by `find text|role … click [--name] [--exact]`. `--exact` avoids substring clashes such as "Select all" / "Deselect all".
- Use `click xpath=//…` for a dialog-scoped button.
- Assert the text as rendered, uppercase included.
- Before a `find … click` after navigation, wait for the target itself. For a tab whose name the sidebar also has, use `wait --fn` for a `<button>` with that exact text, because `wait --text` passes early on the sidebar link.
- To see the real error, run with `AGENT_BROWSER_BIN=<wrapper that logs stderr>`.
- A flow that needs data must get it from `pnpm db:seed` (the CLI), since no model runs in e2e.
**Evidence:** `e2e/specs/08,09,10-*.flow.json` · `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/styles.ts:64` · `agent-browser click --help` · `docs/plans/14-e2e-flows-agent-browser.md` → Verification log

## Recurring Errors & Fixes

### 2026-09-17 — flows 02/04/05 fail locally but pass in CI

**Symptom:** the suite is green in CI and red on a developer machine, failing on
a `wait --text` for the seeded PR.
**Cause:** those flows follow the home redirect to the *first* repo, so they
assume the seeded demo repo is the only one. CI seeds an empty database; a dev
database usually has other imported repos.
**Rule:** run `./scripts/e2e.sh` — it brings up an isolated, freshly-seeded stack
on alternate ports. Do **not** "fix" this with `docker compose down -v`: that
deletes the `devdigest_pgdata` volume and every repo and review you imported.
**Evidence:** `specs/02-*.flow.json`, `scripts/e2e.sh`

## Session Notes

_Nothing yet._

## Open Questions

_Nothing yet._
