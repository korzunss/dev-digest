# Eval results, 2026-10

Committed evidence for the harness evals. The JSON files it comes from are in
`evals/results/`, which is gitignored, so they are local. Every number below is
pasted from a command in section (d).

## (a) Two agent versions, same cases, n=5

`architecture-reviewer` (strict-v2) vs `architecture-reviewer-lite` (lite-v2).

- strict-v2 · sha 925251c · dirty true · n=5
- lite-v2 · sha 925251c · dirty true · n=5

Recorded before plan 32 removed Bash from agent sessions (`6d8a5b1`), so these are not comparable with later records.

| Test | strict-v2 pass | strict-v2 duration | lite-v2 pass | lite-v2 duration |
|---|---|---|---|---|
| flags both checkout violations with severity and a documented rule | 4/5 | 55.4 ± 18.1 s | 5/5 | 38.7 ± 9.2 s |
| does not fabricate an architecture finding for the out-of-scope security-shaped change | 5/5 | 56.4 ± 15.5 s | 3/5 | 52.8 ± 18.7 s |
| cites the documented rule for reviewer-core violations | 5/5 | 58.4 ± 18 s | 4/5 | 59.6 ± 20.6 s |
| does not fabricate a documented-rule violation for a benign rename | 5/5 | 50.5 ± 15.7 s | 5/5 | 43.3 ± 38.8 s |

Reading (from the table only):

- Pass counts: strict-v2 19/20, lite-v2 17/20 over the four cases.
- The two versions differ most on "does not fabricate an architecture finding for the out-of-scope security-shaped change" (strict-v2 5/5, lite-v2 3/5) and on "flags both checkout violations ..." (4/5 vs 5/5).
- Durations overlap in most rows: the stddev is 9 to 39 s against means of 39 to 60 s, so duration differences are within the spread.

## (b) Workflow trace: dispatch, positive activation, negative control

- wf-sandbox · sha 47fd5e8 · dirty true · n=2

| Test | pass | duration |
|---|---|---|
| server task follows the protocol and the routing in server/AGENTS.md | 1/2 | 22.8 ± 13 s |
| client UI-string task reads AgentCard, then the next-intl messages per client/AGENTS.md | 1/2 | 38.5 ± 26.8 s |
| root CLAUDE.md routes test strategy, approved plans and a symbol lookup | 1/2 | 15.5 ± 2.2 s |
| reviewer-core task reads pipeline.md and reviewer-core gotchas | 2/2 | 7.9 ± 0.3 s |
| a new feature request starts at brainstormer or spec-creator, not implementation | 2/2 | 16.8 ± 2.2 s |
| near-miss negative — a bug fix does NOT go to spec-creator | 2/2 | 78.4 ± 76.1 s |
| API-route task reads server architecture AND pulls the architecture-reviewer | 1/2 | 13.7 ± 5.3 s |
| engineering-insights activates on a genuine discovery | 2/2 | 10.8 ± 2.3 s |
| near-miss negative — explaining the same topic must NOT try to record an insight | 2/2 | 35.9 ± 9.6 s |

Roles:

- Dispatch: "a new feature request starts at brainstormer or spec-creator, not implementation" and "API-route task reads server architecture AND pulls the architecture-reviewer".
- Positive activation: "engineering-insights activates on a genuine discovery".
- Negative controls: the two "near-miss negative" cases.

Earlier series, wf-baseline:

- wf-baseline · sha 248a17a · dirty true · n=2

Caveat: recorded before the worktree sandbox (`265bda3`); one of its feature-case sessions wrote to the repo (root `INSIGHTS.md` 2026-10-11).

| Test | pass | duration |
|---|---|---|
| server task follows the protocol and the routing in server/AGENTS.md | 1/2 | 28 ± 16 s |
| client UI-string task reads AgentCard, then the next-intl messages per client/AGENTS.md | 1/2 | 29.4 ± 19.2 s |
| root CLAUDE.md routes test strategy, approved plans and a symbol lookup | 2/2 | 11.5 ± 1.6 s |
| reviewer-core task reads pipeline.md and reviewer-core gotchas | 2/2 | 9.6 ± 1.2 s |
| a new feature request goes to spec-creator first | 1/2 | 35.3 ± 19.8 s |
| near-miss negative — a bug fix does NOT go to spec-creator | 1/2 | 72.6 ± 12.8 s |
| API-route task reads server architecture AND pulls the architecture-reviewer | 2/2 | 19.7 ± 0.3 s |
| engineering-insights activates on a genuine discovery | 2/2 | 12.5 ± 7.4 s |
| near-miss negative — explaining the same topic must NOT try to record an insight | 2/2 | 35.2 ± 19.7 s |

### CI (DeepSeek via OpenRouter)

Facts from the plan 31 *Verification log* for PR #21 run 2 (`6ca27f4`):

- workflow 7/9 (TESTING.md routing miss; engineering-insights activation hit max turns 8; the subagent-dispatch case passed);
- architecture-reviewer 1/4 (3 × vitest `testTimeout` 240000 ms, not wrong answers);
- eval failures reported as `::warning`.

Run 1 failed on an invalid secret (401 `User not found` from OpenRouter).

## (c) With/without-skill benchmark

See [benchmarks/2026-10-11-onion-architecture.md](benchmarks/2026-10-11-onion-architecture.md) for the onion-architecture benchmark; its numbers are not copied here.

## (d) Reproduce

```bash
cd evals
pnpm eval:repeat agents/architecture-reviewer -n 5 --label strict-v2
pnpm eval:repeat agents/architecture-reviewer-lite -n 5 --label lite-v2
pnpm eval:delta strict-v2 lite-v2
pnpm eval:repeat workflow -n 2 --label wf-sandbox
```

The benchmark command is in [benchmarks/2026-10-11-onion-architecture.md](benchmarks/2026-10-11-onion-architecture.md).

Rebuild the provenance lines (any label):

```bash
jq -r '"\(.label) · sha \(.git_sha) · dirty \(.dirty) · n=\(.times)"' results/repeat-<label>.json
```

Command A (table in section a):

```bash
jq -rn --slurpfile s results/repeat-strict-v2.json --slurpfile l results/repeat-lite-v2.json 'def r: (./100|round)/10; def d: "\(.metrics.durationMs.mean|r) ± \(.metrics.durationMs.stddev|r) s"; $s[0].tests[] as $a | ($l[0].tests[] | select(.label==$a.label)) as $b | "| \($a.label) | \($a.pass.passed)/\($a.pass.total) | \($a|d) | \($b.pass.passed)/\($b.pass.total) | \($b|d) |"'
```

Command B (tables in section b):

```bash
jq -r 'def r: (./100|round)/10; .tests[] | "| \(.label) | \(.pass.passed)/\(.pass.total) | \(.metrics.durationMs.mean|r) ± \(.metrics.durationMs.stddev|r) s |"' results/repeat-<label>.json
```
