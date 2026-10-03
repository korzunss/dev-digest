# Insights — repo-wide

An append-only log of things that cost someone time. Package-local findings go in
that package's `INSIGHTS.md`; this file is for what crosses package boundaries —
two or more packages, the `shared` contracts, `scripts/`, Docker, CI.

**Where every insight lives.** A map, not a summary — the rules themselves stay
in each package's files. There is no root `gotchas.md`: cross-package rules stay
in this file.

| Package | Log (append-only) | Rules in force |
|---|---|---|
| repo-wide | this file | — |
| `server/` | [`server/INSIGHTS.md`](server/INSIGHTS.md) | [`server/insights/gotchas.md`](server/insights/gotchas.md) |
| `client/` | [`client/INSIGHTS.md`](client/INSIGHTS.md) | [`client/insights/gotchas.md`](client/insights/gotchas.md) |
| `reviewer-core/` | [`reviewer-core/INSIGHTS.md`](reviewer-core/INSIGHTS.md) | [`reviewer-core/insights/gotchas.md`](reviewer-core/insights/gotchas.md) |
| `mcp-server/` | [`mcp-server/INSIGHTS.md`](mcp-server/INSIGHTS.md) | [`mcp-server/insights/gotchas.md`](mcp-server/insights/gotchas.md) |
| `e2e/` | [`e2e/INSIGHTS.md`](e2e/INSIGHTS.md) | [`e2e/insights/gotchas.md`](e2e/insights/gotchas.md) |

A new package gets a row here when its `INSIGHTS.md` is created.

**How to use it.** Write an entry when a symptom took more than a few minutes to
explain — especially when the code looks correct and behaves otherwise. The
`engineering-insights` skill routes a finding to the right file, picks the
section, and enforces the quality gate; run it at the end of a task, or write the
entry by hand in the same format.

**Sections.** Every `INSIGHTS.md` in this repo carries the same seven, in the same
order. Entries go newest-first **within** their section.

| Section | What belongs there |
|---|---|
| What Works | An approach that succeeded and should be reused here |
| What Doesn't Work | A dead end or antipattern — the most valuable section |
| Codebase Patterns | A convention or architectural decision, with the reason |
| Tool & Library Notes | A quirk of a dependency, CLI, or the local toolchain |
| Recurring Errors & Fixes | A symptom that will be seen again, and its fix |
| Session Notes | Dated wrap-up: what changed and what it taught |
| Open Questions | Left unresolved, phrased so someone can pick it up |

**Entry format.**

```md
### YYYY-MM-DD — short title in the imperative or as a symptom
**Symptom:** what you actually observed.
**Cause:** why it happened.
**Rule:** what to do from now on. Omit if there's nothing to generalize.
**Evidence:** `path/to/file.ts:42` · command · error string
```

**Append-only.** Never rewrite or delete an entry. An entry that has gone stale
gets a new, dated correction naming what changed.

**Promotion.** When an entry hardens into a standing rule, promote a **one-line**
version into the `Gotchas` section of the relevant `AGENTS.md` and leave the full
write-up here. That keeps `AGENTS.md` short without losing the reasoning.

---

## What Works

_Nothing yet._

## What Doesn't Work

### 2026-09-30 — an untracked plan file makes R3 and delta re-verification unprovable
**Symptom:** in plans 07, 08 and 09 the plan-verifier reported R3 ("plan changed only in Status/decisions") as not-verifiable every time, and its delta scope checks fell back to file mtimes.
**Cause:** plan files and the new code stay untracked until the PR commit, so git has no approved baseline to diff against.
**Rule:** stage (or commit) the plan file right after the user's approval and again at the end of each implementation wave; the verifier can then diff against the index instead of asking the user to sign off R3.
**Evidence:** `docs/plans/07-review-diff-base-sha.md`, `08-llm-call-reliability.md`, `09-review-eval-fixture.md` → *Verification log* (R3 rows)

### 2026-09-29 — a skill listed on a step where it has nothing to do can only be closed by a plan change
**Symptom:** plan 07's plan-verifier kept SK2–SK4 `missing` across two runs although the implementer re-read `zod` in full and recorded S2–S4 under *Not used — reason* ("no Zod schema in this step").
**Cause:** the SK check reads only the *Applied in* column of the implementer's `## Skills` table; *Not used — reason* is informational. Separately, implementers record a cross-cutting skill (`zod`, `security`) against the one step where it was most visible, which also fails step-level SK items.
**Rule:** planner — list a skill on a step only when that step writes the artifact the skill covers (`zod` only where a Zod schema is written). Implementer — list every step a cross-cutting skill was applied in. If a listed skill truly doesn't apply, close the SK item by removing it from the step (plan change, user approval), not by recording an honest "not used".
**Evidence:** `docs/plans/07-review-diff-base-sha.md` → *Wave 1 — delta verification*, *plan change CH2* · `docs/plans/05-decisions-first-planning.md` → *Carry-over results*

### 2026-09-27 — seeding the working tree while other reviewer runs are in flight breaks their read-only proof
**Symptom:** during plan 04's smoke tests, the T5 module audit reported
`git status --porcelain unchanged: no`. A file it never touched had flipped
from ` M` to clean mid-run.
**Cause:** the main session reverted the T2 seed (`git checkout -- <file>`)
while T5 was still running. Reviewer agents prove they are read-only by
comparing two `git status` snapshots of the shared working tree, so any edit
by the main session during their run shows up as a violation.
**Rule:** when reviewer runs overlap, apply and revert seeds only while no
other reviewer run is in flight. Run module audits first, or run all smoke
tests one after another. Treat a snapshot mismatch that lines up with a
main-session seed or revert as noise, not an agent write. The agent's report
should name the file, as T5's did.
**Evidence:** `docs/plans/04-security-reviewer-agent.md` → Verification log
(T5, T6)

### 2026-09-27 — in an agent prompt, the output template beats the prose rules
**Symptom:** `brainstormer` smoke runs broke two rules its Method section
stated plainly. The status quo came out as `Opt1`, although the prompt said
"not first or last". A narrow idea got a padding option instead of the "only
one sane approach" line. A later run returned 6 options under "up to 5
(plus the status quo)".
**Cause:** the model followed the template and the description over the
prose. The template heading read `### Opt1 — <name> (status quo, if
applicable)`. The description said "3-5 approaches (plus the status quo)",
which reads as 5 + 1. The escape hatch was a single sentence after the
method, with no concrete check attached.
**Rule:** when an agent prompt has an output template, write every
placement or count rule into the template itself, not only into the prose.
State limits inclusively ("at most 5, status quo included"). Turn an escape
hatch into a named check with the exact line to write ("Padding check …
write 'Only one sane approach: OptN.'"). Smoke-test with an input that
should trigger the escape hatch. A realistic input with several sane
approaches does not exercise it.
**Evidence:** `docs/plans/03-brainstormer-agent.md` → Verification log (T5
runs 2–3, T2 regression) · `.claude/agents/brainstormer.md` Method (b),
*Padding check*, `## Options` heading
**Extension (2026-09-28):** "in the template" means inside the fenced block.
Plan 05's pass-1 size cap was an HTML comment one line **after** the closing
fence in `planner.md`, so the copied template never carried it; plan-verifier
flagged it as partial (S1/P1). Place such rules as comments inside the fence,
before its last line.

### 2026-09-26 — the onion skill's `depcruise` gate and its baseline are not real
**Symptom:** the planner and architecture-reviewer both reached for
`npm run depcruise` to check the new intent module's edges. The
`onion-architecture` skill says the gate was "validated against the real graph:
**0 errors, 15 warnings**" and lists **2** cross-module edges as the
burn-down baseline. The command doesn't exist, and the reviewer then counted at
least 4 pre-existing cross-module edges the baseline doesn't list — close to
flagging old drift as new.
**Cause:** there is no `server/.dependency-cruiser.cjs` and no `depcruise`
script in `server/package.json` (only the `dependency-cruiser` dependency). The
numbers in the skill were never reproducible here.
**Rule:** until the config and script exist, check layering with explicit `rg`
edge checks (e.g. `rg -n "platform/container|\.\./settings/|\.\./repos/"
server/src/modules/<mod>`) and a manual import walk; don't compare against the
skill's counts. Treat a "pre-existing" edge as pre-existing only after checking
`git show HEAD:<file>`. Re-baselining the skill belongs with adding the config.
**Evidence:** `.claude/skills/onion-architecture/SKILL.md:109,127` ·
`.claude/skills/onion-architecture/enforcement.md:120,130` ·
`ls server/.dependency-cruiser*` → no such file · unlisted edges:
`conventions/service.ts:15`, `polling/routes.ts:8`, `pulls/routes.ts:16`,
`settings/constants.ts:4`

### 2026-09-25 — `pr-self-review`'s skill map is not a reliable source for which skills exist or how contracts change
**Symptom:** copying the skill map from `pr-self-review/routing.md` into the
`planner` agent would have told the implementer to load
`vercel-react-best-practices` and `nodejs-best-practices`. Neither is in
`.claude/skills/`, so loading them fails. The same file's §4 also says the
`vendor/shared` contracts are "do-not-touch by hand" and that drift "means a
regeneration step was missed". That contradicts `CLAUDE.md` ("Contracts change
in `shared` first") and the 2026-09-17 entry below (mirror the edit by hand;
there is no regeneration step).
**Cause:** `routing.md` and `SKILL.md` were written against a larger, generic
skill set and an assumed codegen step. Neither the skills nor the codegen step
exists in this repo.
**Rule:** take the list of available skills from `ls .claude/skills/`, never
from a skill's own references. For contract changes, follow `CLAUDE.md` and the
entry below, not `routing.md` §4. A drift CRITICAL from the gate means the hand
mirror was missed, not that a regeneration was skipped.
**Evidence:** `.claude/skills/pr-self-review/routing.md:46,54,81` ·
`.claude/skills/pr-self-review/SKILL.md:59,61` · `ls .claude/skills/`

### 2026-09-17 — the two vendored `shared` copies are not actually in sync

**Symptom:** on a clean checkout, `diff -r server/src/vendor/shared
client/src/vendor/shared` returns a long diff. The client copy has no
`'openrouter'` in the provider enums (`eval-ci.ts`, `productionize.ts`,
`knowledge.ts`), no `AgentManifest`, no `sessionId` on `StructuredRequest`, and
several adapter methods missing.
**Cause:** the copies drifted over past features. `CLAUDE.md`'s "keep them in
sync" reads like a statement of fact, but it is an instruction about *your own*
change — it was never true of the files as a whole.
**Rule:** mirror the specific edit into the client copy by hand (or a targeted
script that replaces exact strings). Never `cp`/`cp -r` the server's `shared`
over the client's: that drags in server-only contracts and provider ids the
client deliberately doesn't have, turning a one-field change into an unreviewed
bulk rewrite. Verify with a `diff` scoped to the fields you touched, never with
whole-file equality — that check is red today and will stay red.
**Evidence:** `diff -r server/src/vendor/shared client/src/vendor/shared` ·
`client/src/vendor/shared/adapters.ts` → `LLMProvider.id` is
`'openai' | 'anthropic'` where the server's is `… | 'openrouter'`

## Codebase Patterns

### 2026-09-26 — a feature model's default lives in three places, not two
**Symptom:** changing `review_intent`'s default model (spec 006, D2-B) in
`server/src/vendor/shared` and its client mirror still left Settings → Models
showing the old default.
**Cause:** the Settings page doesn't read the vendored contract. It renders its
own non-vendored copy, `FEATURE_MODELS` in `client/src/lib/feature-models.ts`.
**Rule:** a change to `FEATURE_MODELS` (default provider/model, description, a
new feature id) touches **three** files: `server/src/vendor/shared/contracts/platform.ts`,
its client vendored mirror, and `client/src/lib/feature-models.ts`. Grep the
feature id across `client/src` before calling it done.
**Evidence:** `client/src/lib/feature-models.ts:13,22` ·
`client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/SettingsModels.tsx:9`

### 2026-09-17 — searches return duplicate hits from `server/clones/`

**Symptom:** grep and file searches surface two or three copies of the same
file, some of them stale.
**Cause:** `server/clones/` holds checkouts of every imported repo, and one of
the imported repos is DevDigest itself — so the tree contains full copies of this
codebase.
**Rule:** exclude `server/clones/**` from every search. Never edit a file under
that path; it's runtime data, and the next resync overwrites it.
**Evidence:** `CLAUDE.md` → "Do not touch"; `.gitignore` → `clones/`

## Tool & Library Notes

### 2026-10-01 — a local review run that dies with `Socket timeout` may just be the Mac falling asleep
**Symptom:** a 142-file review of PR #13 on the local dev stack failed after 54 min with `Invalid response body while trying to fetch https://openrouter.ai/api/v1/chat/completions: Socket timeout`. It happened before the 10-min call deadline, with no retry. It looked like a provider stall.
**Cause:** `pmset -g log` shows `Entering Sleep state due to 'Idle Sleep'` 3 s after that chunk's request went out, and DarkWakes at exactly the run log's "still waiting" (12:30:55/56) and failure (12:35:39) timestamps. While the Mac slept, the Node process was paused. On wake, the `openai` SDK's keep-alive agent socket timeout (5 min, `reviewer-core/node_modules/openai/_shims/node-runtime.js:53-54`) fired on the dead connection, and node-fetch raised a `FetchError` (`type: 'system'`), which isn't classified as transient. The same run under `caffeinate` completed.
**Rule:** run the dev stack for long reviews under `caffeinate -is ./scripts/dev.sh` (or `caffeinate -is` in another terminal), and keep the lid open. Before treating a local `Socket timeout`, a mid-run "still waiting" jump or a deadline as a provider problem, check `pmset -g log | grep -E "Entering Sleep|Wake from|DarkWake from"` for the run's window.
**Evidence:** `pmset -g log` 2026-10-01 12:23–12:36 · run `d97f0ac3-…` (failed) vs the 13:08 run under `caffeinate` (done) · `docs/plans/08-llm-call-reliability.md` → *A1 live confirmation*, side finding (PR2)

### 2026-09-30 — the auto-mode permission check blocks an implementer from writing a migration file
**Symptom:** in plan 12 the implementer ran `pnpm db:generate --custom` fine, but its write of the SQL body into the new `server/src/db/migrations/0020_*.sql` stub was denied by the auto-mode classifier ("Modify Shared Resources"). The group came back `partial`: the stub was empty, the dedupe `.it` test failed, and `0021`'s unique index would have failed on any DB with duplicates.
**Cause:** the harness's permission check treats a hand write under `migrations/**` as a shared-resource change, independent of the plan's approval. A plan decision (D1-A) is not a permission grant, and the main session must not "launder" the denied write by doing it on the agent's behalf.
**Rule:** when a plan step hand-writes a migration (the `--custom` stub), expect the implementer to be denied. Surface it to the user with the exact content. Write the file in the main session **only** on the user's explicit instruction for that file (plan 12: "План 12. Зроби сам"), then log it as a main-session fix. Until then, `db:migrate` must not be run.
**Evidence:** `docs/plans/12-eval-write-integrity.md` → Handoffs → verification, Verification log (main-session fix: S1)

### 2026-09-28 — a Done-when `grep` for a phrase fails when Markdown wraps that phrase across two lines
**Symptom:** in plan 05 G1 the implementer ran its full `maxTurns` (100 tool
uses, 193k tokens) on six Markdown edits. Twice, a Done-when
`grep -n 'Steps: pending decisions'` / `'not-verifiable — Skills table not
provided'` found nothing although the text was present.
**Cause:** `grep` matches line by line. Hard-wrapped Markdown prose splits a
multi-word template string across two lines, so the phrase exists but never on
one line.
**Rule:** a phrase that a Done-when greps for is written unbroken on one line,
ideally inside backticks, and never hard-wrapped. When a planner writes a grep
Done-when for prose, it picks a short token that cannot wrap (an id, a heading,
a backticked literal) instead of a sentence fragment.
**Evidence:** `docs/plans/05-decisions-first-planning.md` → S3/S5 Done-when ·
implementer run: 100 tool uses · `.claude/agents/plan-verifier.md`, `AGENTS.md`

### 2026-09-27 — `rg` edge checks catch comments and prose, and `rg` is not a binary here
**Symptom:** a plan Done-when "`rg -n "_components|FindingCard|FindingRecord"
client/src/components/diff-viewer` returns nothing" failed on a *comment* in a
test file (plan 02 gap D20), and a process check `rg ': any\b'` flagged
"(D8: any depth)" in plan and spec prose. Separately, a verifier's
`… | xargs rg …` died with `xargs: rg: No such file or directory`.
**Cause:** these checks are plain text searches, so words in comments, test
fixtures and Markdown count as hits. And in the agent shell `rg` is a shell
function from the Claude Code snapshot, not an executable on `PATH`, so
anything that execs it (`xargs`, `find -exec`, a script) cannot find it.
**Rule:** write layering/"no import" checks against import lines —
`rg -n "^import .*(_components|FindingCard)" <dir>` or
`rg -n "from ['\"].*_components" <dir>` — and scope process scans to code files
(`-g '*.ts' -g '*.tsx'`), not `docs/` or `specs/`. When piping a file list, use
`xargs grep -E`, not `xargs rg`.
**Evidence:** `docs/plans/02-smart-diff.md` → Verification log, gap D20
(`client/src/components/diff-viewer/FileCard/FileCard.test.tsx:4` comment) ·
`type rg` → `rg is a shell function from ~/.claude/shell-snapshots/…` ·
`echo x | xargs rg zzz` → `xargs: rg: No such file or directory`

### 2026-09-25 — correction: new agents do show up mid-session
**Symptom:** the entry below says a new agent needs a session restart. Later in
the same session, with no restart, the harness announced "New agent types are
now available: implementer, planner".
**Cause:** agent definitions are picked up again during the session, but with
a delay. The failure below came from spawning too soon after writing the file.
**Rule:** after creating an agent, wait for the "new agent types" notice before
spawning it. Restart only if the notice never comes. A probe
subagent asked to list its "preloaded skills" also names every skill in the
session's listing, so that answer can't show that `skills:` injection worked.
**Evidence:** harness notice "New agent types are now available" after
creating `.claude/agents/implementer.md`, with no restart
**Extension (2026-09-27):** edits to an agent that already exists take effect
on its next spawn in the same session, with no notice. This is not a
guarantee. The brainstormer's T5 smoke run failed, its prompt was fixed
mid-session, and the next spawn followed the new rule. Iterate on prompt
fixes in-session, with no restart
(`docs/plans/03-brainstormer-agent.md` → Verification log).

### 2026-09-25 — a new `.claude/agents/*.md` can't be spawned in the session that created it
**Symptom:** right after writing `.claude/agents/implementer.md`, the Agent
tool returned `Agent type 'implementer' not found. Available agents: … researcher …`.
The listed agents were the ones that existed when the session started.
**Cause:** Claude Code reads agent definitions only at session start.
**Rule:** to test a new or edited agent, especially its `permissionMode`,
start a new session.
**Evidence:** `.claude/agents/implementer.md`

### 2026-09-21 — `TESTING.md`'s "`server/package.json` is skip-worktree" is not true here

**Symptom:** adding a runtime dependency to `server/` looked risky:
`TESTING.md` states that *"`server/package.json` is `skip-worktree` (a local
variant diverges from the committed file)"*, which would mean a new dependency
never reaches the commit and CI installs without it.
**Cause:** the note is stale for this checkout. `git ls-files -v server/package.json`
reports `H` (normal), not `S` (skip-worktree) — the flag is per-clone, set by
hand, and is not set here. The claim reads as a fact about the repo but is a
description of one machine.
**Rule:** check the flag before trusting the note — `git ls-files -v <file>`, and
treat only a leading `S` or `h` as skip-worktree. Do this for any dependency
change in `server/` or `client/`: if the flag *is* set locally, `pnpm add` edits
a file git will not stage, and the missing dependency surfaces only in CI. The
same command is the right check whenever a doc claims a file is untracked in
some way.
**Evidence:** `TESTING.md` → "Conventions" · `git ls-files -v server/package.json`
→ `H server/package.json` · `fflate` added for the skills import and committed
normally

### 2026-09-21 — `git stash pop` silently un-stages a symlink, and the working tree hides it

**Symptom:** mid-way through staging the `CLAUDE.md` → `AGENTS.md` rename, a
`git stash -u` / `git clone .` / `git stash pop` round-trip left `ls -la` showing
a correct `CLAUDE.md -> AGENTS.md` symlink, while `git ls-files -s CLAUDE.md` had
reverted from `120000 47dc3e3` to `100644 02ee35f` — the *old regular file*.
`git status` reported ` T` (unstaged type change), and `git checkout-index -a
--prefix=…` then wrote plausible-looking but stale regular files, so the
verification step "passed" against the wrong content.
**Cause:** `git stash pop` without `--index` restores everything as *unstaged*.
For an ordinary content edit that is invisible; for a mode/type change
(`100644` → `120000`) it means the index keeps HEAD's blob, and only the
working tree carries the symlink.
**Rule:** never use `git stash` to snapshot a tree mid-rename — clone from a
`HEAD` that predates the work instead, or just commit first. After *any* stash
round-trip in a change that stages symlinks or mode bits, verify with
`git ls-files -s`, not with `ls -la` or a diff of file contents: the working
tree looks right in exactly the case the index is wrong.
**Evidence:** `git ls-files -s CLAUDE.md` · `git status --short` → ` T CLAUDE.md`
· the five committed links in `019925b`

## Recurring Errors & Fixes

### 2026-09-17 — `TS2719: Two different types with this name exist` after adding a contract field

**Symptom:** adding a required field to a Zod contract in `shared` makes
`pnpm typecheck` fail in a *test* file with `TS2719: Type '{…}' is not assignable
to type '{…}'. Two different types with this name exist, but they are unrelated.`
The message points at a fixture factory and suggests a duplicated type or a
broken path alias — both wrong.
**Cause:** the factory is `function run(o: Partial<T>): T { return { ...defaults,
...o } }`. The new key exists only in the `Partial`, so the spread types it
`X | undefined` while the return type demands `X | null`. The follow-up line is
the real one: `Types of property 'cost_usd' are incompatible … 'undefined' is not
assignable to type 'number | null'`.
**Rule:** when TS2719 names a fixture factory right after a contract change, add
the new key to the factory's defaults literal. Don't go looking for a second copy
of the type or a tsconfig `paths` problem.
**Evidence:** `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx:16`

## Session Notes

_Nothing yet._

## Open Questions

### 2026-09-30 — agent precision (plan 10): what to try next, and how to measure it honestly
**Symptom:** on PR #12 the five agents found 9/12 planted issues (eval baseline, `pnpm eval:review`, plan 09) but 24 findings were only 13 unique: SQL injection reported by 4 agents, SSRF and off-by-one by 3–4; API Contract produced 5 findings, none in its lane. Missed: key written to a log (Security), `JSON.parse(JSON.stringify())` per row (Performance), `averageRisk([])` → `NaN` (General).
**Cause (inferred from prompts/config, not tested):** General/Performance/API Contract prompts have no "leave security to the Security Reviewer" rule; General's CRITICAL criteria include "security breach" and it carries `contract-change-gate` (same as API Contract) plus `dev-digest-conventions` (CSS/Drizzle rules — noise on most diffs); Performance has no skill at all; `secret-leakage-gate` looks for secrets in code, not in log sinks; severities for the same bug range CRITICAL→SUGGESTION across agents.
**Rule:** ideas recorded for plan 10 (user, 2026-09-30: "later", no brainstorm/plan yet): (1) lane boundaries in prompts + an explicit "empty review is fine"; (2) lane checklists/skills — Security: secrets in logs/errors; Performance: serialization/deep copies in loops, unbounded selects, N+1; General: division by `.length`, `if` without `else`, comment vs code; API Contract: schema-first routes (Zod `params/query/body/response`), new endpoints without a shared contract; (3) drop off-topic skills from General; (4) a stronger model for General/Performance, judged by eval cost vs recall; (5) one shared severity table; (6) optionally a code-side lane filter or cross-agent dedup by `file + lines + category`. **Measure honestly:** a single run is noisy (the probe: 4–8/12 for the same agent and diff), so average 3–5 eval runs per variant; add a second fixture with different planted issues before tuning prompts, so plan 10 doesn't overfit PR #12; give the fixture `acceptable_extras` for Test Quality (its precision reads 29% only because its lane has one planted issue). The process for plan 10: `brainstormer` first (several viable approaches).
**Evidence:** `docs/plans/09-review-eval-fixture.md` → *Main-session fix + T4 re-run* · `server/src/modules/eval/fixtures/pr-export-planted.json` · agent configs in the `agents`/`agent_skills` tables

### 2026-09-30 — correction: the reasoning-token cap and deadline landed (plan 08); the cause is the routed provider, not missing caps
**Symptom:** the entry below ("…nothing caps them (fix deferred)") no longer describes the code.
**Cause:** plan 08 shipped: review calls send `max_tokens: 32000`, `provider: { require_parameters: true, sort: 'throughput' }`, a 10-min per-call deadline with one retry that drops `sort`, and log "served by <provider>" per call. A live probe showed `reasoning.effort` has no consistent effect on `deepseek-v4-flash`, and duration tracks the upstream provider's throughput (14–128 tok/s), which the old entry attributed to reasoning volume alone.
**Rule:** the deferred fix is done; diagnose a slow run from the run log's served-by provider and seconds first (see `reviewer-core/INSIGHTS.md` 2026-09-30 entries). Still open: whether `sort: 'throughput'` lowers the ~15% stall rate — watch the served-by lines; a refreshed provider `order` from the endpoints API is the next step if not.
**Evidence:** `server/src/modules/reviews/constants.ts` · `reviewer-core/src/review/llm-call.ts` · `docs/plans/08-llm-call-reliability.md` (Status: done)

### 2026-09-30 — review run time is driven by hidden reasoning tokens, and nothing caps them (fix deferred)
**Symptom:** some reviewer runs take 15–70 min on an ordinary diff, General Reviewer most often (6 of 27 runs above 20k output tokens; avg 20.9k vs 8–9.6k for the other agents). Run duration correlates with `tokens_out` (0.74–1.00 per agent), not `tokens_in` (−0.01–0.35).
**Cause:** `deepseek-v4-flash` spends hidden reasoning tokens that OpenRouter bills as output — e.g. 105 270 output tokens for a 210-char visible answer (71 min at ~24 tok/s). No cap is sent: `reviewer-core/src/review/run.ts` never passes `maxTokens`, and no OpenRouter `reasoning` limit is set anywhere. General Reviewer has the broadest mandate and the most skills (5 attached, 4 enabled) — likely why it reasons longest (inference, not tested).
**Rule:** to diagnose a slow run, compare `agent_runs.tokens_out` with `length(run_traces.trace->>'raw_output')`; a large gap is reasoning, not a big answer. Planned fix (user, 2026-09-30: "later", no plan yet): (1) cap reasoning — OpenRouter `reasoning: { max_tokens | effort }` + `max_tokens`; (2) a real deadline via `AbortSignal` (see `reviewer-core/INSIGHTS.md` 2026-09-30); (3) per agent: fewer skills or `map-reduce` for General Reviewer. Touches `reviewer-core` + `server` → needs a plan.
**Evidence:** `select a.name, corr(r.duration_ms, r.tokens_out) from agent_runs r join agents a on a.id = r.agent_id where r.status = 'done' group by 1` · `reviewer-core/src/review/run.ts:207-214`
