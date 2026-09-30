# Insights — repo-wide

An append-only log of things that cost someone time. Package-local findings go in
that package's `INSIGHTS.md`; this file is for what crosses package boundaries —
two or more packages, the `shared` contracts, `scripts/`, Docker, CI.

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

### 2026-09-30 — review run time is driven by hidden reasoning tokens, and nothing caps them (fix deferred)
**Symptom:** some reviewer runs take 15–70 min on an ordinary diff, General Reviewer most often (6 of 27 runs above 20k output tokens; avg 20.9k vs 8–9.6k for the other agents). Run duration correlates with `tokens_out` (0.74–1.00 per agent), not `tokens_in` (−0.01–0.35).
**Cause:** `deepseek-v4-flash` spends hidden reasoning tokens that OpenRouter bills as output — e.g. 105 270 output tokens for a 210-char visible answer (71 min at ~24 tok/s). No cap is sent: `reviewer-core/src/review/run.ts` never passes `maxTokens`, and no OpenRouter `reasoning` limit is set anywhere. General Reviewer has the broadest mandate and the most skills (5 attached, 4 enabled) — likely why it reasons longest (inference, not tested).
**Rule:** to diagnose a slow run, compare `agent_runs.tokens_out` with `length(run_traces.trace->>'raw_output')`; a large gap is reasoning, not a big answer. Planned fix (user, 2026-09-30: "later", no plan yet): (1) cap reasoning — OpenRouter `reasoning: { max_tokens | effort }` + `max_tokens`; (2) a real deadline via `AbortSignal` (see `reviewer-core/INSIGHTS.md` 2026-09-30); (3) per agent: fewer skills or `map-reduce` for General Reviewer. Touches `reviewer-core` + `server` → needs a plan.
**Evidence:** `select a.name, corr(r.duration_ms, r.tokens_out) from agent_runs r join agents a on a.id = r.agent_id where r.status = 'done' group by 1` · `reviewer-core/src/review/run.ts:207-214`
