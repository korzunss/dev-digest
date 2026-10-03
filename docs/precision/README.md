# Review precision: the workstream

This workstream makes the reviewer agents **right more often**: fewer false
findings, and above all fewer false CRITICALs. It is tracked here, apart from the
other plans, so that precision work is measured the same way each time and does
not get mixed into unrelated changes.

**How work moves here:** an item below goes through `brainstormer` (idea brief in
`docs/ideas/`), then `planner` (`docs/plans/`). When a plan or idea starts, link it
in the item's *Status* cell. Measure every change with `pnpm eval:replay` against
the fixtures below before calling it an improvement. A live smoke run is a sanity
check only, not the measure.

## Goal and measure

- **Primary:** false CRITICALs per round on PR #13
  (`server/src/modules/eval/fixtures/pr13-general-false-criticals.json`), then on a
  fresh live run.
- **Guard:** suite recall on the planted fixture
  (`server/src/modules/eval/fixtures/pr-export-planted.json`) must not drop. Cost
  per round is reported next to it.
- **Tooling:** `cd server && caffeinate -i pnpm eval:replay --fixture <f> --rounds 8`
  (paid; exit 0 = pass or skipped, 1 = gate failed, 2 = error). Run a live check
  through DevDigest (`run_agent_on_pr`) and verify every CRITICAL by hand.

## Done so far

| What | Where | Effect |
|---|---|---|
| Path-scoped repo rules + changed-file list in every chunk (Opt2), precision prompt package: lanes, severity rules, empty-review rule (Opt1) | idea [06](../ideas/06-fewer-false-criticals.md) → plan [10](../plans/10-agent-precision.md) | Replay: PR #13 false CRITICALs 6.63 → 2.50 per round (−62%); PR #12 recall 0.74 → 0.78; cost +8–12% |
| Verdict derived from grounded findings; one-line map-reduce summary | plan [17](../plans/17-map-reduce-summary.md) | The banner no longer contradicts the findings. It now shows the top-3 CRITICAL titles, so false CRITICALs are *more* visible. |
| `wrapUntrusted` closes the delimiter in any case or spacing | plan [10](../plans/10-agent-precision.md), fix TW-10-1 | Prompt-injection hardening (not a precision gain) |

## Evidence: live run on PR #13, 2026-10-02

Run `57510b3d-e017-4778-be07-4c1e77c2e352`, General Reviewer, commit `7d2bc38`:
180 files, map-reduce in 180 chunks, 92 min, $0.27. All 38 findings passed citation
grounding. Every finding was verified by hand against the code:

| Severity | Total | True | True, severity too high | False |
|---|---|---|---|---|
| CRITICAL | 8 | 0 | 1 | 7 |
| WARNING | 26 | 0 | 3 | 23 |
| SUGGESTION | 4 | 1 | 0 | 3 |
| **All** | **38** | **1** | **4** | **33 (87%)** |

There was no fabricated code this time; the earlier live run `8c23cc41` had 5 cases.
The false findings fall into four patterns:

1. **Library facts the model does not have (~8):** it claimed `zod/v3` does not
   exist (zod 3.25.76 exports it), that the MCP SDK `inputSchema` must be a
   `z.object` (1.31 takes a raw shape), that drizzle/postgres-js `execute()`
   returns `{ rows }` (it returns an array), that `signal.reason` can be
   `undefined`, and that `${VAR:-default}` is unsupported in `.mcp.json`.
2. **"What if X is undefined" on unreachable paths (~12):** every caller passes the
   value, types guarantee the field, or the lane cannot be unknown. The chunk holds
   one file, so the model cannot see the callers or types that refute it.
3. **Deliberate design read as a bug (~7):** `RATIONALE_MAX + 1` because the
   ellipsis counts, documented unique confidences, lowercase-only SHA hardening,
   the projected version in a dry run.
4. **Noise:** duplicates (`.mcp.json` twice; one test helper reported as both
   CRITICAL and WARNING) and line numbers 5–30 lines off.

Severity discipline still fails: the prompt says speculative issues are at most
WARNING, yet all 8 CRITICALs were speculative.

## Backlog

Ordered by expected gain per cost. *Status* is `open` until an idea or plan exists.

| # | Item | Targets pattern | Expected cost | Status |
|---|---|---|---|---|
| P1 | **Refute pass on CRITICALs only, capped:** one extra call per CRITICAL with the whole file, the files it imports, and the instruction "try to refute; keep only with a quoted reachable path". On a refuted CRITICAL, demote or drop it (open choice). Idea 06 named this as the next step "if CRITICALs that need cross-file facts are still wrong with the rules present". That is exactly the evidence above. | 1, 2, 3 | ~8 calls on PR #13 (< $0.01); the cap must bound small PRs | open — idea 06 Opt5, Q1 already "yes, with a limit" |
| P2 | **Dependency facts in context:** pass the installed versions of the touched package's direct dependencies (from its `package.json` / lockfile) as trusted repo context, so library-behaviour claims can be checked. | 1 | small input; data only | open |
| P3 | **Cross-file context per chunk:** the exported signatures and types the file imports, and the callers of its changed functions. `assemblePrompt` already has the `repoMap` / `callers` slots, but the server does not fill them. | 2 | +input tokens per chunk; cacheable | open |
| P4 | **Do not send pure docs (`*.md`) to code agents:** about 60 of 180 PR #13 chunks were docs, gave 0 useful findings, and one took 645 s. This is a product choice per agent. | time, noise | negative (saves calls) | open |
| P5 | **Severity calibration check:** a deterministic post-step that demotes a CRITICAL whose rationale is purely conditional ("may", "if … is undefined", "could") and cites no caller. Needs a labelled set to tune against, and risks demoting real issues. | 2 | none | open, needs data |
| P6 | **De-duplicate findings across chunks** (same file and title, overlapping lines). | 4 | none | open |
| P7 | **A fixture from this run:** label the 38 findings of run `57510b3d` as `false_positives` / issues, so P1–P6 are measured on the current code and not only on the `pr13-general-false-criticals` fixture (head `bda81c9`). | measure | none | open — do first |

Related, but outside this workstream: serial map-reduce latency
(`reviewer-core/INSIGHTS.md`, Open Questions, 2026-10-02) and the live log that
stops at the first `[error]` (`client/INSIGHTS.md`, Open Questions, 2026-10-02).
