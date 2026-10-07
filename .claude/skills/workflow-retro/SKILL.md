---
name: workflow-retro
description: "Main-session, on-demand process retro for one finished plan: what happened, cost, what worked, what did not, proposed corrections filed as plan follow-ups. Invoke only on demand via /workflow-retro <plan path>."
argument-hint: "<plan path>"
disable-model-invocation: true
user-invocable: true
version: "1.0.0"
---

# /workflow-retro — per-plan process retro

## 1. Scope and boundaries

- The **main session** writes the retro inline: no subagent, no new agent. One plan, process only (how the pipeline ran), never the product code.
- It supersedes plan 23's "no `/workflow-retro` skill" for **on-demand** use only (plan 29): run by the user, or offered at the `/sdd` hand-over and run on a yes — never on every feature.
- Never writes `INSIGHTS.md`, `insights/gotchas.md`, specs, agents, code, the plan's `Status:` or any other plan; never commits. Lessons worth an `INSIGHTS.md` entry are listed as *insight candidates* for `engineering-insights` (its gate and routing apply, see `.claude/skills/engineering-insights/SKILL.md`).
- A mechanical failure is proposed as a guard (`sdd.sh`, its selftest, an agent template), not as a reminder to be careful (idea 07, option 4).

## 2. Inputs and budget

- About 30k tokens for the whole run; the retro file is at most about 10k characters.
- Read the plan **by section only**: `sed -n '/^## <heading>/,/^## /p' <plan>` for *Decisions recorded*, *Step groups*, *Follow-ups* and *Verification log*, plus its first 6 lines. Then `ls docs/plans/assets/<plan basename>/` and at most the first 40 lines of each report there.
- Never read the whole plan, the spec body, code or transcripts.
- The only cost source is `sdd.sh`: `usage-scan`, `flags` and `cost`. No own arithmetic, no dollar prices, no in-context `subagent_tokens`.

## 3. Procedure

`S` below is `bash .claude/skills/sdd/scripts/sdd.sh`.

1. `S usage-scan`
2. `S flags <plan>`
3. `S cost <plan>` — quote the outputs of 1–3 verbatim.
4. Read the plan sections of §2.
5. A fact known only from the conversation is first logged with `S log <plan> "retro-fact: <fact>"` (`S state` skips `retro-fact:` lines), then cited as that log line.
6. The path is `docs/plans/assets/<plan basename>/workflow-retro.md`. If it exists, ask (AskUserQuestion): overwrite or stop.
7. Write the file from the §4 template with the Write tool; drop the HTML comments from the result.
8. File each `P<n>`: `S follow-up <plan> "retro P<n>: <change> — <where>"`.
9. `S log <plan> "retro: <path>"` — `S state` skips `retro:` lines, so a `done` plan keeps its stage.
10. Reply with the path, the `P<n>` ids and the insight candidates.

## 4. Output template

The comments inside the fence are part of the template: they carry the caps and rules.

~~~md
# Plan NN — workflow retro (<title>)

Date: <YYYY-MM-DD> · Execution: <mode> · Sources: <plan path>, `sdd.sh usage-scan` / `flags` / `cost` (run <date>), <asset reports read>
<!-- cite: every claim ends with its source — a Verification-log date and prefix (a `retro-fact:` line included), a `path:line`, or an `sdd.sh` output line; no source, no claim -->
<!-- n/a: a metric or count that cannot be sourced from the `sdd.sh` outputs or a cited line is written `n/a`, never estimated, rounded from memory or inferred -->

## 1. What happened
| Phase | Rounds | Outcome |
|---|---|---|
<!-- cap: at most 8 rows; counts come from `agent:`, `review iteration`, `plan approved` log lines -->

## 2. Cost
<`sdd.sh cost` output, verbatim> · <`flag:` / `repeat:` lines of `sdd.sh flags`, verbatim>
<!-- cap: no figure that is not in those outputs; main-session tokens are not included — say so -->
<!-- busy: busy time and the critical path are first_ts→last_ts spans, so an agent resumed after a long gap (plan 28 `spec-p2` 397m) counts its idle time — call them an upper bound, never working time -->

## 3. What worked
<!-- cap: at most 5 bullets -->

## 4. What did not work
<!-- cap: at most 6 numbered items, largest loss first; each names its cost (rounds or stage share) -->
<!-- check: walk all four before writing, each with evidence or "none found": duplicated context (the same plan, spec or files re-read by several agents or resumes; `cost` cache hit and a resumed agent's stage share) · rework and clarifying round-trips (re-approvals, `review iteration`, `fix-loop`, correction rounds, post-`done` reopenings) · scope drift (steps, groups or ACs added after approval) · failure taxonomy (tag every item mechanical / judgement / environment / spec gap) -->
<!-- check: the `unattributed` line of `sdd.sh cost` above 0 is itself an item (unlogged agents) -->
| Checklist | Finding | Source |
|---|---|---|
| duplicated context | <finding or "none found"> | <cite> |
| rework / round-trips | … | … |
| scope drift | … | … |
| failure taxonomy | <counts per tag> | … |

## 5. Proposed corrections
| # | Change | Where | Expected effect | Targets |
|---|---|---|---|---|
<!-- cap: at most 9 rows P1…; Where = an existing file or "new plan"; Targets = item numbers of section 4; a mechanical failure gets a guard; every row is also filed with `sdd.sh follow-up` -->

## 6. Open items
<!-- cap: at most 6 bullets — `repeat:` lines, unfiled follow-ups, insight candidates for engineering-insights (never written here) -->
~~~
