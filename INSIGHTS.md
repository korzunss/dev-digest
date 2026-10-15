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

### 2026-10-12 — commit one finished plan while another plan's edits sit in the same package
**Symptom:** plan 34 was signed off while plan 35 had already edited three `client/` files (the vendored contract copy, `TurnIntoEvalCase.tsx`, one line of a plan-34 test). Staging only plan 34's files would be denied by the test gate, and the plan-34 test no longer typechecked without plan 35's contract.
**Cause:** `.claude/hooks/test-gate.sh` denies a commit when a touched package still has untracked files or unstaged edits (the tests would see a different tree than the commit), so a package cannot be committed in parts.
**Rule:** copy the other plan's files of that package to the scratchpad and record `shasum`; return them to the committed plan's state (`git checkout -- <file>`, or undo the one mixed line); stage and commit; copy the files back and `shasum -c`. Docs outside packages can be staged partially. Never bypass the gate.
**Evidence:** commit `3504068` · `.claude/hooks/test-gate.sh` (decision model, header) · `docs/plans/35-skill-eval-suites.md` Verification log (REC3 entry)

### 2026-10-11 — a doc-routing eval question must be unanswerable from the always-loaded docs
**Symptom:** the server routing trace passed 1/5: the model answered "which file and key holds the self-hosted GitLab token" and "where does a contract change start" correctly but never opened `adapters/secrets/local.ts` or `vendor/shared`.
**Cause:** both answers sit verbatim in docs that load into every session (`server/AGENTS.md`, `server/insights/gotchas.md`, root `CLAUDE.md`), so reading the routed file is unnecessary. The same goes for anything a `Grep` hit already shows, such as a function signature.
**Rule:** ask for a fact that exists only in the routed file (`local.ts` silently treats a missing or corrupt secrets file as empty and caches it; the repo-intel README lists the facade methods wired in the starter). Name the source kind ("за документацією модуля") when code holds a competing answer, or the model answers from `service.ts`. Check each fact with `grep` against CLAUDE.md, the package AGENTS.md and gotchas before using it. After the rewrite, both routed files were read in every run. Two side lessons: a dispatch case needs the thing to review in the prompt (with "оціни мій план" and no plan, the model asked which plan), and `/sdd` allows `brainstormer` before `spec-creator`, so a feature case must accept either first step.
**Evidence:** `evals/workflow/review-workflow.cases.ts` (server, API-route, feature cases with their comments) · `evals/results/repeat-wf-gotchas-n5.json` · commits `47fd5e8`, `aaca7d8`

### 2026-10-05 — checkpoint the working tree without a commit: temp index + `write-tree` + a tree ref
**Symptom:** R3 and delta reviews need a baseline, but the user does not want commits during a pipeline run, and `git add` on the real index re-stages over the approved text (2026-09-30 entry) and changes `git status`, which reviewers use as their read-only proof.
**Cause:** an approved state has to live somewhere addressable that is neither a commit nor the real index.
**Rule:** `cp .git/index <tmp-outside-worktree>; GIT_INDEX_FILE=<tmp> git add -A; T=$(GIT_INDEX_FILE=<tmp> git write-tree); git update-ref refs/sdd/<NN>/<label> "$T"` — the real index and `git status --porcelain` stay untouched, the tree and its blobs survive `git gc --prune=now`, `fsck` is clean. Compare two checkpoints with `git diff --name-only <t1> <t2>`. Against the *working tree*, `git diff <tree> -- <path>` shows an untracked file as deleted — use `git show <tree>:<path> | diff - <path>` instead. `/sdd` wraps this as `sdd.sh checkpoint` / `delta` / `brief-diff`; clean up with `git update-ref -d`.
**Evidence:** `.claude/skills/sdd/scripts/sdd.sh` (`make_tree`) · `docs/plans/22-sdd-pipeline-skill.md` → *Verification log* (R3 `brief-diff` empty, rc 0) · throwaway test on git 2.54.0
**Guard:** `selftest.sh` cases for `sdd.sh checkpoint` / `delta` / `brief-diff` (real index untouched, tree ref survives gc, untracked paths handled) — plans 22, 23.
**Addendum 2026-10-06 (plan 28):** a read-only reviewer cannot run `sdd.sh delta` against the working tree — with no second tree it calls `make_tree ""` (`sdd.sh:405`), which writes git objects, so plan-verifier and architecture-reviewer refused it in four delta passes. Give them the recipe in the prompt instead: `git diff --name-status <ref>` for tracked files plus `git show <ref>:<f> | diff - <f>` per untracked file (in plan 28, 38 `D` entries came down to 3 real changes).

## What Doesn't Work

### 2026-10-15 — parallel worktrees share one dev Postgres, so their migrations collide in number and both land in the DB
**Symptom:** `__drizzle_migrations` held 29 rows while this branch had only 0000–0027; the extra one was `0028_tearful_lyja` from the parallel `l07-multi-agents-review` worktree. This branch then generated its own `0028_romantic_vargas` and applied it on top. Also: a second API from another worktree on the same DB reaps the first one's `running` runs (server gotcha), and ports 3000/3001 and 3100/3101 were already taken by other worktrees.
**Cause:** every worktree's `server` defaults to `postgres://…@localhost:5432/devdigest` (the one `devdigest-postgres` container), and `db:generate` numbers from the branch's own journal.
**Rule:** before `db:migrate`, compare `select id, created_at from drizzle.__drizzle_migrations order by id desc` with your `meta/_journal.json` to spot another worktree's migrations; keep migrations additive while sharing the DB; whichever branch merges second must regenerate its migration against main (two `NNNN_*` with the same number). Start a worktree's dev servers on free ports (`API_PORT`/`WEB_PORT`, `NEXT_PUBLIC_API_BASE`) after checking `lsof -iTCP:<port> -sTCP:LISTEN` and that no run is `running`.
**Evidence:** plan 41 "Handoffs → G2" (migration clash) · `server/src/db/migrations/0028_romantic_vargas.sql` vs the other worktree's `0028_tearful_lyja.sql` · `lsof` output in the session

### 2026-10-15 — a plan step that paraphrases a spec field loses its definition, and implementer + tests agree on the wrong one
**Symptom:** plan 40's UF wave shipped "Recent runs" rows showing the run's age ("3h") where AC-15c asks for the wall-clock time defined in AC-31; the implementer's own test asserted "3h", the test-writer's gap pass kept it, and only the plan-verifier (reading the spec) caught it.
**Cause:** step S25 said just "time"; implementer and tests both read the step, not the spec AC, so they were consistent with each other and wrong.
**Rule:** when a plan step names a field the spec defines, copy the spec's definition (or its AC id + "as defined in AC-n") into the step text and the Done-when assertion.
**Evidence:** plan 40 *Verification log* (gap AC15C) · `client/src/app/repos/[repoId]/multi-agent/_components/RecentRuns/RecentRuns.test.tsx:51-52`

### 2026-10-15 — an implementer told to "follow the mockups" never sees images the user pasted into the main session
**Symptom:** plan 40's G5/G6 shipped a Configure run screen far from the user's mockups (card boxes, one-line agent rows, wrong crumb and nav group); the implementer's report said "I had no pixel mockup". A whole design fix round (DG1–DG8) followed.
**Cause:** pasted images live only in the main session's context; a subagent gets the prompt text, and the spec describes a design only in words.
**Rule:** when a feature has mockups, pass their file paths (the `[Image: source: …]` paths) to spec-creator, every UI implementer group and any design fix, and tell it to Read them first; after the last UI group, compare screenshots of the running build against them before the verifier.
**Evidence:** plan 40 *Handoffs → G6* ("did not see the pixel mockups") and *Design review (main session)* DG1–DG8

### 2026-10-14 — splitting one broad CI `paths:` filter into per-tier filters leaves the router script reacting to paths no workflow triggers on
**Symptom:** plan 39 split `harness-evals.yml` (one `paths:` incl. `evals/**`) into four per-tier workflows. `ci-detect.mjs` still set `run_workflow=true` for an `evals/skills/<n>/**` change of a skill named in the workflow cases, but `harness-evals-workflow.yml`'s `paths:` had no `evals/skills/**` — that rule was dead in CI, yet live under `CI_DETECT_ALL` and locally (architecture-reviewer F1).
**Cause:** the script decides on paths that the workflow filter has already narrowed; with one broad filter the two never disagreed, with several narrow ones every rule the script has but the filter lacks silently stops firing.
**Rule:** when a workflow's `paths:` and a router script both select by path, keep one table as the truth and pin the other with a test (plan 39 F3: `evals/src/ci-detect.test.ts` reads each `harness-evals-<tier>.yml` `on.pull_request.paths` and checks it against the script's engine table).
**Evidence:** `evals/scripts/ci-detect.mjs:171-173` (mention rule, now `.claude/skills/<n>/` only) · `.github/workflows/harness-evals-workflow.yml:3-23` · plan 39 Verification log "architecture-reviewer: PASS; F1 MEDIUM …"

### 2026-10-11 — "no Bash/Write/Edit in `trace.tools`" does not prove an agent eval left the repo alone
**Symptom:** plan 32 added `disallowedTools` (Bash, Write, Edit, MultiEdit, NotebookEdit) to `agentTask`. Its M1 gate checked with `jq` that no `agents/*` record lists those tools in `trace.tools`, and every record passed.
**Cause:** `runClaude` collects `tool_use` blocks from the main stream only, so tool calls made inside a subagent never reach `trace.tools`. `agentTask` still offers `Task`/`Agent` (and `WebFetch`/`WebSearch`) under `bypassPermissions`. Whether the SDK's `disallowedTools` also binds a spawned subagent was not checked.
**Rule:** for an agent eval, prove isolation with the repo's `git status --porcelain` before vs after the run, as `workflowTask` does. Treat a clean `trace.tools` as evidence about the main session only. Until `Task`/`Agent` are disallowed in `agentTask`, assume a subagent may write.
**Evidence:** `evals/src/runtime/run-claude.ts:30-33` (only `writeAttempts`, set by the hook, sees subagent calls) · `evals/src/config.ts:38` · `evals/src/tasks.ts:44` · plan 32 M1 log (before/after status diff: unchanged) · security-reviewer manual check, plan 32 Verification log

### 2026-10-11 — `allowedTools` and a PreToolUse deny hook do not keep an SDK workflow eval read-only
**Symptom:** `pnpm eval:repeat workflow` sessions wrote to the repo: a fabricated pgvector entry in `server/INSIGHTS.md` + `server/insights/gotchas.md` (the engineering-insights activation case) and an idea brief in `docs/ideas/` (the feature case: brainstormer, then the main session saved the brief per CLAUDE.md). After `Write`/`Edit` got a deny hook, one run still landed a `Write` + `Edit` pair: the trace listed both tools, `write_attempts` was empty, so the hook was never called.
**Cause:** under `permissionMode: "bypassPermissions"` the SDK's `allowedTools` only pre-approves the listed tools; it restricts nothing. A hook is fail-open: when it does not fire, the tool just runs. The miss did not reproduce in 8 targeted probes (write before and after a subagent, after `brainstormer`, from Claude Code and from a plain terminal).
**Rule:** isolation, not tool lists, is the guard. `workflowTask` runs every session in a throwaway worktree of the current tree (`git stash create` or HEAD) and compares the real repo's `git status` before and after, failing on any new change. `disallowedTools` removes tools a case never needs (`Bash`). The hook stays only to log write attempts. To debug a hook, run with `EVAL_SDK_DEBUG=1`: the per-session log under `evals/results/sdk-debug/` shows `Hook denied tool use for Write` when it fired. Revert anything an eval session wrote; never keep it.
**Evidence:** `evals/src/runtime/sandbox.ts` · `evals/src/tasks.ts:57` (`workflowTask`) · `evals/src/config.ts:33-35` · the wf-baseline run-2 record of the feature case (`tools: Read, Grep, Agent, Write, Edit`, `write_attempts: []`) · commits `0d1de7d`, `265bda3`

### 2026-10-09 — the upstream `evals/agents/architecture-reviewer` cases graded a different agent than ours
**Symptom:** the imported cases required rule ids `inward-only-dependencies`, `di-discipline`, `reviewer-core-zero-io`, `reviewer-core-ground-findings-gate`; none exists in `.claude/agents/architecture-reviewer.md` (its rules are check ids `A1`…`A13` + a source doc), so those practices fail for every variant. Their prompt said only "Audit this diff", while the agent's Step 0 builds the diff from `git` and `agentTask` strips `Bash` — the agent can answer `Status: blocked`.
**Cause:** the eval package was imported wholesale (commit `221623e`) from a repo with another reviewer prompt; the cases were never re-aligned.
**Rule:** an agent-eval practice may only name ids/phrases the agent's own prompt defines — grep the agent file for each before running. For a git-driven reviewer, the prompt must say the patch is inline and not applied (see `reviewPrompt` in the cases file). A copy of an agent for an A/B (`architecture-reviewer-lite`) needs its own `description` marked eval-only, or it competes with the original for dispatch in real sessions and in `workflowTask` evals.
**Evidence:** `evals/agents/architecture-reviewer/architecture-reviewer.cases.ts` (`reviewPrompt`, rewritten 2026-10-09) · `git show 221623e --stat` · `evals/src/tasks.ts` `agentTask` → `agentTools()` drops `Bash` (`evals/src/artifacts/load.ts`)
**Addendum (same day, after the first run):** a fixture diff must target a path that exists in the repo. The reviewer runs against the live repo, so `reviewer-core-gate.diff` (`reviewer-core/src/pipeline/run.ts`, real file: `src/review/run.ts`) drew a *Clarification needed* (score 0), and `benign-refactor.diff` (`blast/score.ts`, absent) drew an A6 "undocumented file" MEDIUM — failures of the fixture, not the variant. Read the run's text in `results/outputs/<run>/` before reading a delta.

### 2026-10-06 — "T1–T11 present and green" does not mean every AC in a test row's *Covers* column is asserted
**Symptom:** after plan 28's test-writer reported all eleven Tests-table rows covered and green, the full plan-verifier pass still came back `incomplete`: T3, T6 and T10 claimed AC-11, AC-18, AC-4/13/27 but no assertion checked them (default budget never exercised; blast-missing only in an `.it` that accepted `missing` *or* `partial`; empty states, truncated note and skeleton never rendered in a test).
**Cause:** the implementer writes the Tests-table files and the test-writer audits by file presence and pass/fail, while the verifier checks each *Covers* AC against an actual assertion. Nobody between them maps AC → assertion line.
**Rule:** in the test-writer prompt, ask for an AC → `file:line` assertion map for every AC in each row's *Covers* column, and to add the missing assertion when an AC has none; an assertion that accepts two outcomes does not pin either AC. It costs one fix-loop round less.
**Evidence:** `docs/plans/28-pr-brief.md` Verification log (review-1: 154/158, partial T3/T6/T10) · `docs/plans/assets/28-pr-brief/plan-verifier-report.md` · `server/test/brief.it.test.ts:215` (the `missing`-or-`partial` assertion)

### 2026-10-05 — writing a script through a heredoc that itself contains `EOF` heredocs ran its body in the real repo
**Symptom:** while writing `selftest.sh` (plan 22) the implementer's outer `cat > file <<EOF` closed at the first inner `EOF`; the rest of the would-be script — `git init`, fixture writes, `git add -A && git commit` — executed in the current shell, i.e. in this repo on branch L05: two stray commits (`fixtures`, `more`), `specs/README.md` overwritten, fixture files created. Not pushed; the user recovered with `git reset --mixed 12d454d`.
**Cause:** a heredoc ends at the first line equal to its delimiter, nested or not.
**Rule:** create script files with the Write tool, never through a shell heredoc. If a heredoc is unavoidable, use a unique outer delimiter (`<<'SDD_EOF_OUTER'`). A test script that runs git must `cd` into a `mktemp -d` repo and assert `[ "$(pwd -P)" = "$(git rev-parse --show-toplevel)" ]` before its first git command; the main session reads such a script before running it and diffs `HEAD`/`git status`/refs before and after.
**Evidence:** `docs/plans/22-sdd-pipeline-skill.md` → *Verification log* (INCIDENT, 2026-10-05) · `.claude/skills/sdd/scripts/selftest.sh:21-25`
**Extended 2026-10-05 (plan 23):** a prompt line and the template rule did not stop it: G1 edited `sdd.sh` with a python script fed through a shell heredoc, and G3 ran a no-op `cat > /dev/null <<EOF` after the rule was in `implementer.md`. Neither did damage, but the rule alone is not a guard — the main session still diffs `HEAD`/refs/stash (`sdd.sh git-state`) around every implementer run.
**Guard:** implementer *Hard rules* bullet "never create or rewrite a script file through a shell heredoc" (`.claude/agents/implementer.md`); `selftest.sh` `new_repo()` toplevel guard; `sdd.sh git-state save|check` catches stray commits, refs and stash (plan 23).

### 2026-09-30 — an untracked plan file makes R3 and delta re-verification unprovable
**Symptom:** in plans 07, 08 and 09 the plan-verifier reported R3 ("plan changed only in Status/decisions") as not-verifiable every time, and its delta scope checks fell back to file mtimes.
**Cause:** plan files and the new code stay untracked until the PR commit, so git has no approved baseline to diff against.
**Rule:** stage (or commit) the plan file right after the user's approval and again at the end of each implementation wave; the verifier can then diff against the index instead of asking the user to sign off R3.
**Evidence:** `docs/plans/07-review-diff-base-sha.md`, `08-llm-call-reliability.md`, `09-review-eval-fixture.md` → *Verification log* (R3 rows)
**Extended 2026-10-04 (plans 20, 21):** staging alone is not enough. The main session re-stages the plan after every appended handoff and log line, and each `git add` replaces the index blob, so by verification time the approved text is gone and R3 is again not-verifiable. Keep R3 provable by committing the plan right after approval (a `docs(plans): approve plan NN` commit on the branch), or by not re-staging it until the verifier has run.
**Guard:** `sdd.sh checkpoint <NN> plan-approved` at approval + `sdd.sh brief-diff <plan> <tree>` for R3 — `.claude/skills/sdd/scripts/sdd.sh` (plans 22, 23).
**Extended 2026-10-15 (plan 40):** when the checkpoint was missed (the pipeline was run by hand, not via `/sdd`), R3 can still be proved: replay the implementation-planner's own `Write`/`Edit` tool_use inputs on the plan path from its subagent transcript (`~/.claude/projects/<proj>/<session>/subagents/agent-*.jsonl`; `agent-*.meta.json` names the agent type) — last Write, then each later Edit — and diff that baseline against the current file above `<!-- implementer-brief:end -->`. The plan-verifier rebuilt it independently and matched. Evidence: `docs/plans/assets/40-multi-agent-review/plan-baseline-pass2.md`.

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
**Extension (2026-10-08):** skills behave the same way, and real numbers in a worked
example leak as facts. In the `dependency-checker` quality evals (`skillTask` = SKILL.md
only), the chat-summary example said "6 packages · 1.3 GB", and an answer about pasted data
with 4 packages wrote "6 packages" in its Key numbers. The prose said `flowchart`, but with
no literal diagram skeleton the model drew `graph LR`, which failed the
`` ```mermaid ``/`flowchart`
grounding. Fix that worked (3/3 cases on the re-run): write examples with `<placeholders>`,
not this repo's numbers, and give the diagram as a literal fenced skeleton. Evidence:
`.claude/skills/dependency-checker/SKILL.md` → *Chat summary format*, *When the data is
given to you instead* · `cd evals && pnpm run eval:skills dependency-checker`.

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

### 2026-10-11 — an eval record's outcome falls back to "the session did not error" unless the case passes `passed`
**Symptom:** `eval:repeat workflow` showed the server case 2/2 while it had read none of its expected files, and activation cases 0/2 while the skill had engaged both times (they hit `maxTurns` 4).
**Cause:** `record()` derives `outcome` from a grounding gate or a judge verdict; workflow cases have neither, so it fell back to `!result.isError`, and the `expect` calls after it never reached the stats.
**Rule:** a runner branch without a judge collects its failures first, calls `record(name, { result, passed })`, then asserts (the `finish` helper in `runWorkflowCases`). Any new case kind must pass `passed` too, or `eval:repeat` and `eval:delta` report session health, not the assertions.
**Evidence:** `evals/src/records/record.ts:52` · `evals/src/dsl/case.ts:130` (`finish`) · commit `0d1de7d`

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

### 2026-10-15 — `agent-runner/dist/index.js` inlines `@devdigest/shared` and reviewer-core: any shared edit makes the committed bundle stale
**Symptom:** after a contract-only change (`CiRunsQuery.since` gained `.max(40)`), `npm run build` in `agent-runner/` changed `dist/index.js` (body + `sha256:` header) although no runner file was touched; the `agent-runner.yml` freshness check (`git diff --exit-code dist/index.js`) would fail.
**Cause:** esbuild bundles everything the runner imports, including `server/src/vendor/shared` and `reviewer-core` via path aliases.
**Rule:** after editing `server/src/vendor/shared/**` or `reviewer-core/src/**`, run `cd agent-runner && npm run build` and commit `dist/`. Keep `zod`/`openai` aliased to `agent-runner/node_modules` in **all three** of tsconfig `paths`, the vitest alias and the esbuild `alias`, or the manifest schema and the engine run on different zod copies; the ESM bundle needs the `createRequire` banner for CJS `openai`. Related: once a server file re-exports from `@devdigest/reviewer-core`, `reviewer-core/vitest.config.ts` needs a self-alias, because reviewer-core tests import `server/src/adapters/mocks.ts`.
**Evidence:** `agent-runner/scripts/build.mjs` · `.github/workflows/agent-runner.yml` · `reviewer-core/vitest.config.ts` · `server/src/adapters/git/diff-parser.ts` · plan 40 G1-F1 and "bundle freshness" log lines

### 2026-10-11 — a Claude Code background command dies at 2 h, and `eval:benchmark -n 5` can take longer
**Symptom:** `pnpm eval:benchmark skills/onion-architecture -n 5` (80 Haiku sessions plus a Sonnet judge, subscription) was started as a background command. It was killed with exit 143 during baseline run 5/5, when only 4 of its 8 records had been written, and no `benchmark.md` was produced. Single runs took 10–17 minutes each.
**Cause:** a background Bash command has a hard limit of 7 200 000 ms. `benchmark.ts` writes its report only after all 2×N runs, although each run appends its records to `records.jsonl` as it goes.
**Rule:**
- Estimate first: cases × runs × 2 × ~1.5 min. If that is over ~100 min, split the work, for example by running `-n 3` twice.
- To recover a killed run, keep its records. Re-run only the missing configuration run, using the exact per-run invocation: `EVAL_CONFIG=<config> EVAL_QUIET=1 pnpm exec vitest run --reporter=dot <pattern>`.
- Then rebuild the report from `records.jsonl`. Take the records from the benchmark's start line, drop the partial `run_id`, and pass them through the same `aggregate`/`byConfig`/`computeFlags` path as `benchmark.ts` (a scratch copy with only the record source changed).
- Run long jobs under `caffeinate -dimsu` so the Mac does not sleep.
**Evidence:** `evals/src/records/benchmark.ts:96-106` · plan 32 *Handoffs → M2* (partial run `20261011T184647`, rebuilt report `evals/results/benchmarks/2026-10-11T19-03-26-504Z/`)

### 2026-10-11 — the LiteLLM `main-stable` image refuses to start without a master key
**Symptom:** in CI the `agents` and `workflow` jobs of `harness-evals.yml` failed at `Start LiteLLM proxy` with `error: proxy did not become healthy`. The container log said `LiteLLM proxy refused to start: no master key is set, so every request would be accepted without authentication.` The same config had worked earlier in no-auth mode.
**Cause:** `ghcr.io/berriai/litellm:main-stable` is a moving tag, and a newer build now enforces a master key at boot (`enforce_master_key_boot_verdict`).
**Rule:** set `LITELLM_MASTER_KEY` to the `OPENROUTER_API_KEY` value in `evals/proxy/docker-compose.yml`. The eval clients already send that key as Bearer, so no code changes. Pin the image by digest (`tag@sha256:…` pulls by digest; the tag is only a label) and bump it by hand. When probing the proxy, use POST, because GET `/v1/messages` returns 405. Only a missing key gives 401 `No api key passed in`; a wrong key gives 400 `No connected db.` (no DB is configured); a valid key is forwarded to OpenRouter.
**Evidence:** `evals/proxy/docker-compose.yml` · commit `6ca27f4` · local `docker run … main-stable` reproduced the boot refusal · plan 31 D7

### 2026-10-08 — correction: a subagent transcript's `output_tokens` is far too low, so its weighted total can't be trusted
**Symptom:** in a zod-skill A/B run (12 general-purpose subagents), the deduplicated transcript `usage.output_tokens` came to 29–353 per agent. Every one of those agents had written a 60–160 line `.ts` file through `Write`, which alone takes well over 1k output tokens. Taking the last line or the max line per `message.id` gave the same sums.
**Cause:** the transcript stores `usage` as it stood when the message was first streamed, so `output_tokens` misses the content that came after (inferred: it holds for every message checked). The input side (`input` / `cache_read` / `cache_creation`) looks plausible. This changes the 2026-10-05 entry below: its weight `5·output` multiplies a figure that is too small, so its "weighted tokens" mostly measure context size.
**Rule:** use transcript usage only for the input/cache split. Don't compare runs by output or by the weighted total until `output_tokens` is checked against a known-size `Write`. For skill-creator benchmarks, `total_tokens` is the notification's `subagent_tokens` (its documented contract).
**Evidence:** `~/.claude/projects/-Users-sergey--projects-www-ai-dev-digest/98568580-…/subagents/agent-a5e91214e530a3b24.jsonl`: 7 messages, output sum 100, one of them a `Write` of a 161-line `schemas.ts` · notification `subagent_tokens` 59 637 for the same agent

### 2026-10-07 — prove a refactored `.mjs` script prints the same output by running the old version straight from a git ref
**Symptom:** plan 29 moved the weights out of `.claude/skills/sdd/scripts/flags.mjs`; "output unchanged" needed the pre-refactor script, but writing a copy into the tree breaks the reviewers' read-only proof.
**Cause:** `node -e` takes the script text, but then `process.argv[1]` is the first extra argument, not a script path, so the old script's argument parsing shifts by one.
**Rule:** `diff <(node --input-type=module -e "$(git show <ref>:<path>)" -- dummy <args>) <(<new command>)` — the `dummy` fills `argv[1]`. This works only for a self-contained script; relative imports resolve against the cwd, not the ref.
**Evidence:** plan 29 plan-verifier, baseline `refs/sdd/29/pre-impl` vs `sdd.sh flags docs/plans/28-pr-brief.md` → empty diff

### 2026-10-05 — the root `.gitignore` rule `clones/` silently hides any `clones/` folder, including e2e fixtures
**Symptom:** plan 24's G7 put fixture docs in `e2e/fixtures/clones/acme/payments-api/specs/*.md`; `./scripts/e2e.sh` passed locally, but `git status` never listed the files, so CI would have run flow 12 without them.
**Cause:** `.gitignore:20` is the unanchored `clones/` (meant for `server/clones/`), which matches a `clones/` directory at any depth.
**Rule:** never name a committed folder `clones/`; fixture clone roots live in `e2e/fixtures/repos/`. After adding fixtures, check `git check-ignore -v <file>` prints nothing.
**Evidence:** `git check-ignore -v e2e/fixtures/clones/acme/payments-api/specs/alpha.md` → `.gitignore:20:clones/` · plan 24 Verification log (G7-IGN)

### 2026-10-05 — a reviewer-core input-type change breaks server tests that `pnpm typecheck` never sees
**Symptom:** plan 24 changed `PromptParts.specs` from `string[]` to `{path, body}[]`; `cd server && pnpm typecheck` was clean, yet 5 server unit tests (`prompt-callers.test.ts`, `prompt-structured.test.ts`) failed on string fixtures.
**Cause:** `server/tsconfig.json` has `"include": ["src/**/*.ts"]`, so `server/test/**` is never typechecked; only vitest exercises it.
**Rule:** after changing any reviewer-core or `shared` input type, run the server unit suite (`pnpm exec vitest run --exclude '**/*.it.test.ts'`), not just typecheck.
**Evidence:** `server/tsconfig.json:28` · plan 24 Handoffs → G4 (deviation)

### 2026-10-05 — a subagent's real token usage lives in its transcript, not in the task notification
**Symptom:** the task notification's `subagent_tokens` for plan 23's G1 implementer said ~66k, while its transcript summed to ~580k raw tokens (516k of them cache reads); summing transcript `usage` naively gave ~2.2× too much again.
**Cause:** the notification figure's scope is undocumented (research 2026-10-05); transcripts (`~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`) carry `usage` per streamed message, so one `message.id` appears on several lines (80 usage lines → 36 ids); cache reads dominate a run's raw tokens (~89%). A `SubagentStop` hook gets no token data either.
**Rule:** measure from transcripts, deduped by `message.id` (last line wins), split input / output / cache_read / cache_creation, and compare runs in weighted tokens (`input + 1.25·cache_creation + 0.1·cache_read + 5·output`), not raw sums. The agent's type is in the sibling `agent-<id>.meta.json` (`agentType`); never store its `description`. Transcripts are deleted after `cleanupPeriodDays` (default 30) — scan before then. `/sdd` does all of this as `sdd.sh usage-scan` + `flags`.
**Evidence:** `docs/plans/23-workflow-retro-skill.md` → *Verification log* (pre-approval field check, first real scan) and *Handoffs → G3* · `.claude/skills/sdd/scripts/usage-scan.mjs`, `flags.mjs`
**Guard:** `selftest.sh` usage-scan cases (duplicate `message.id`, no content/description in `.sdd/usage.jsonl`) and the F1 weighted-median case with its weight break check (plan 23).

### 2026-10-05 — in zsh, `$VAR:a` (and `:h`, `:t`, `:r`, `:e`) is a path modifier, not text
**Symptom:** a Bash-tool one-liner `git rev-parse $T:a.txt` (tree sha + `:path`) failed with `ambiguous argument '/…/scratchpad/<sha>.txt'` — the sha had become an absolute path.
**Cause:** the Bash tool's shell is zsh here; `$T:a` applies zsh's "absolute path" modifier to `$T`, then `.txt` is appended.
**Rule:** brace every variable followed by `:` — `"${T}:a.txt"` — in inline commands; scripts start with `#!/usr/bin/env bash` and still use `${VAR}` braces (the `/sdd` scripts do).
**Evidence:** plan 22 research, EXT3 throwaway test (main session, 2026-10-04)
**Guard:** the scripts lint in `.claude/skills/sdd/scripts/selftest.sh` fails on an unbraced `$NAME:` in the skill's scripts (plan 23).

### 2026-10-04 — `grep -w <name>` cannot find leftovers of a rename to a hyphenated name
**Symptom:** while planning the `planner` → `implementation-planner` rename (plan 21), a "no bare `planner` left" check written as `grep -rnw planner` would match every *new* `implementation-planner` too, so it can never come back empty.
**Cause:** `-w` treats `-` as a word boundary — `implementation-planner` contains the whole word `planner`. The same pattern also matches prose like "Implementation planner" with a space.
**Rule:** for a rename check use `git grep -nIiE '(^|[^-[:alnum:]_])<old>'` with pathspec exclusions for history (old plans, INSIGHTS) and genuine other meanings (the Postgres "query planner"); write the new name hyphenated everywhere, including titles.
**Evidence:** `docs/plans/21-implementation-planner.md` → S6 Done-when, G1 handoff ("`# Implementation-planner`") · `.claude/skills/postgresql-table-design/SKILL.md:91`

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
**Extended 2026-10-04 (plan 20):** a count threshold has the opposite problem.
`grep -c` counts matching *lines*, so a Done-when like `grep -c 'spec-creator' … ≥ 2`
made the implementer add a second mention just to pass (S4, S5); the verifier
then had to read the lines to tell content from padding. Prefer a per-token
`grep -n` loop or a heading loop that checks the required content itself.
**Guard:** `sdd.sh plan-lint <plan>` flags `grep -c` and multi-word greps on `.md` files in Done-whens; implementation-planner runs it (Method step 6, Red-flags check) — plan 23.

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

### 2026-10-15 — a `\u202A`-style escape written through Edit/heredoc landed as raw invisible bidi characters
**Symptom:** a regex meant to strip bidi controls, `/[\u202A-\u202E\u2066-\u2069]/g`, was saved into `server/src/modules/ci/service.ts` with the **raw** code points (bytes `e2 80 aa …`) — invisible in review, the Trojan-Source pattern GitHub flags as hidden Unicode. A Python `r'''…'''` heredoc rewrite produced the same raw bytes.
**Cause:** the `\uXXXX` text was turned into the characters on the way into the file, not by TypeScript.
**Rule:** when a source file needs `\u` escapes for invisible/bidi code points, build the backslash explicitly (e.g. Python `chr(92) + 'u202A'`), then check the bytes; before a PR scan the diff: `grep -lP '[\x{200E}\x{200F}\x{061C}\x{202A}-\x{202E}\x{2066}-\x{2069}]' <changed files>` must print nothing.
**Evidence:** `od -c` of the `BIDI_CONTROLS` line before/after · `docs/plans/41-export-to-ci.md` "/pr-self-review re-run 2" (SR3)

### 2026-10-11 — a green `harness-evals` run can mean nothing ran, or every eval failed
**Symptom:** on PR #21:
- Run 1 skipped every model job. A local `git diff main...HEAD` showed 144 changed files, so the detector should have selected suites, and the first guess was a missing secret.
- After the eval steps became non-blocking, every job was green although every case had failed with `401 … OpenrouterException {"message":"User not found."}`. The tool-tier cases each burned ~3 minutes (`1 turns · 182799ms · 0→0 tok`), while the direct skills tier failed in 2 s.
- Once the key worked, 3 of 4 `architecture-reviewer` cases failed with `Test timed out in 240000ms`.
**Cause:**
- Run 1: the PR's base was `L06_lab`, not `main`, and its real diff was 5 files that mapped to no suite.
- Run 2: OpenRouter's `User not found` means the key value is invalid; the proxy and the code were fine.
- Run 3: `evals/vitest.config.ts` sets `testTimeout: 240_000`, which was sized for Haiku on the subscription; DeepSeek through the proxy needs longer.
**Rule:** read a `harness-evals` run from its logs, not from its check icons:
- For skipped jobs, reproduce detection with the PR's own base: `CHANGED_FILES="$(git diff --name-only <base_sha>...<head_sha>)" node evals/scripts/ci-detect.mjs`. Find the base in the PR, not by assuming `main`.
- For a green job, open the eval step and look for `::warning … non-blocking` and the `Tests N failed` line.
- `401 User not found` from the skills tier means: replace the `OPENROUTER_API_KEY` secret.
- A `Test timed out in 240000ms` is a time limit, not a wrong answer. Do not score it as model quality.
**Evidence:** `.github/workflows/harness-evals.yml` · `evals/scripts/ci-detect.mjs` · `evals/vitest.config.ts:9` · PR #21 runs on `65e331c` and `6ca27f4` · plan 31 Verification log

### 2026-10-04 — an implementer hand-back can be the single word "placeholder" although the edits landed
**Symptom:** in plan 20 the implementer's hand-back was literally `placeholder` twice (G1, and the AC8a fix-mode run) — no step table, no Done-when output, no handoff — while the files were in fact edited. Asking for "the full report before handing back" in the prompt did not prevent the second one.
**Cause:** the agent called its hand-back before writing the report (its own words when resumed); the run is short (5–8 tool uses), so nothing in the transcript forces the report.
**Rule:** treat a hand-back without a step table as "unknown", never as done: read `git diff` (or `git diff` against the index when the wave is staged) yourself and re-run the step's Done-when before logging it. When the plan needs the handoff or the `## Skills` table (next group, `SK` items), resume the same implementer with SendMessage and ask for the report — it then writes a normal one.
**Evidence:** `docs/plans/20-spec-creator-agent.md` → *Verification log* (AC8a line) and *Handoffs → G2* · resumed G1 run: "I called the hand-back before writing the report"
**Extended 2026-10-04 (plan 21):** a sharper prompt line did work twice: ending the implementer prompt with "Write your full Implementation Report — step table with each Done-when command and its actual output, Handoff, ## Skills — before you hand back; a one-word hand-back will be treated as 'not done'" gave full reports for G1 and G2. Keep checking the diff anyway.
**Guard:** `sdd.sh handback-check` (with `--log` it writes `handback: unknown`) rejects a hand-back without a step table — `.claude/skills/sdd/scripts/sdd.sh`; `/sdd` runs it after every implementer run (plan 23).

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

### 2026-10-11 — plan 31: harness evals on GitHub Actions with DeepSeek V4 Flash
Harness evals now run on every PR that touches the harness (`.github/workflows/harness-evals.yml`), on OpenRouter, with Flash as the task model and Pro as the judge. Eval failures are non-blocking for now (plan 31 D1 rev 2). The first full run, n=1, on V4 Flash:
- workflow tier: 7/9; the subagent-dispatch case passed, so unlike `deepseek/deepseek-chat` in the README table, V4 Flash does dispatch subagents;
- `architecture-reviewer`: 1/4, with all 3 failures being the 240 s timeout.
Before making the evals blocking again, raise the CI test timeout and measure with `eval:repeat`.

## Open Questions

### 2026-10-15 — a mid-body `ECONNRESET` from OpenRouter fails a whole review with no retry and records 0 tokens (fix deferred)
**Symptom:** multi-agent run `27a5737b-4f0b-44ad-a147-468c372c9fd0` on PR #34 (map over many files, `openrouter` / `deepseek-v4-flash`): General, Test Quality and Security reviewers all failed at the same instant (2026-10-15T14:06:00Z) after ~642 s each with `Invalid response body while trying to fetch https://openrouter.ai/api/v1/chat/completions: read ECONNRESET`. No "retrying once" line in the run log; every `agent_runs` row stores `tokens_in = tokens_out = 0` and cost null although dozens of map calls had succeeded. The same instant across three sockets points to a shared network event (see "a local review run that dies with `Socket timeout` may just be the Mac falling asleep", 2026-10-01); parallel fan-out makes one blip fail every agent at once.
**Cause (confirmed in `reviewer-core/node_modules`):**
- No retry: `openai` 4.104.0 reads the response body unwrapped (`openai/core.js:49`), so node-fetch throws `FetchError` (`name 'FetchError'`, `type 'system'`, `code 'ECONNRESET'`; `node-fetch/lib/index.js:159,400`) — not an `APIConnectionError`. `reviewer-core/src/llm/openrouter.ts:110-119` passes it through unmapped and `isTransientLlmError` (`reviewer-core/src/llm/errors.ts:53-65`) returns false, so `callWithDeadline` (`reviewer-core/src/review/llm-call.ts:194`) never retries. The server's `adapters/llm/openai.ts` and `anthropic.ts` map no connection errors at all.
- 0 tokens: a throw out of `reviewPullRequest` discards its running usage totals (`reviewer-core/src/review/run.ts:386`); the executor's catch hard-codes 0 tokens / null cost (`server/src/modules/reviews/run-executor.ts:450-470`, `traceFromBuffer` `:690+`). Plan 13 recorded "failed runs store 0" on purpose (`docs/plans/13-count-failed-llm-attempt-usage.md:106`, Q2 = no).
**Options (analysed in a plan-42 pass-1 draft, discarded unimplemented on the user's request):**
- (a) Retry only — treat node-fetch `FetchError` with `type === 'system'` as transient (keep `invalid-json`, `max-size`, `AbortError` non-transient): map it to `LlmConnectionError` in `openrouter.ts` (keeps the "adapter normalises errors, classify by `instanceof`" gotcha) **and** duck-type it in `isTransientLlmError` (covers the server adapters). Test with a loopback `node:http` server that sends headers and destroys the socket mid-body, driving the real `OpenRouterProvider` + SDK. Risk: an undici-based SDK throws `TypeError: terminated` with `cause.code` instead — the loopback test catches that.
- (b) (a) + record usage-so-far on a failed or cancelled run: carry totals out of `reviewPullRequest` via a cumulative `ReviewInput.onUsageTotals` callback, not a wrapper error (a wrapper breaks `err instanceof RunCancelledError` at `run-executor.ts:453` and `ReviewChunksSkippedError` checks). Reverses plan 13's Q2 decision and is user-visible: the PR list COST column (`server/src/modules/pulls/routes.ts:126-133`) and the multi-agent header total (`multi-agent.helpers.ts:217-221`) sum runs of every status; multi-agent estimates use done runs only and are unaffected. The round whose body failed reports no usage, so the total stays an undercount unless estimated like the deadline path (`llm-call.ts:173-187`). Recommended option when picked up.
- (c) (b) + partial review: when one map chunk fails after its retry, keep the other files' findings and end the run as partial with the unreviewed files listed — a behaviour change that needs a spec.
**Rule (until fixed):** on a large PR, a run that fails with `Invalid response body … ECONNRESET` / `Socket timeout` lost to the network, not to the model — re-run it, keep the Mac awake, and do not read its 0-token cost as real.
**Evidence:** dev DB `agent_runs where multi_agent_run_id = '27a5737b-…'`; the cited `node_modules` and source lines above.

### 2026-10-14 — vitest 2.1.9 carries 6 audit advisories in every package, and only vitest 5 fixes them (deferred)
**Symptom:** `npm audit` in `agent-runner/` reports 6 vulnerabilities (3 moderate, 1 high, 2 critical) — `tinypool` prototype-pollution → RCE (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr), `esbuild` dev-server read (GHSA-67mh-4wv8-2f99) via `vite`/`vite-node`, `@vitest/mocker` path traversal (GHSA-82fw-gwwq-j7x9). The only offered fix is `npm audit fix --force` → `vitest@5.0.4`, a breaking change.
**Cause:** it is not an `agent-runner` problem: `server`, `client`, `reviewer-core`, `mcp-server`, `evals` and `agent-runner` all resolve `vitest` 2.1.9, the last 2.x release, so no in-range bump exists. `e2e` has no vitest. All of it is dev tooling: `ncc` does not bundle vitest into `agent-runner/dist/index.js`, so nothing reaches a target repo's CI.
**Rule:** planned fix (user, 2026-10-14: "later", no plan yet): upgrade vitest to 5.x in all six packages in one plan via `implementation-planner`, each with its own package manager. Never bump one package alone (e.g. `npm audit fix --force` in `agent-runner/`) — that creates version drift, and npm there would also write a second lock file next to `pnpm-lock.yaml`. Expect config changes: every `vitest.config.ts`, plus `server/vitest.mutation.config.ts` and the `@stryker-mutator/vitest-runner` plugin (`server/stryker.config.json`), which must support vitest 5.
**Evidence:** `cd agent-runner && npm audit` · `for p in server client reviewer-core mcp-server evals agent-runner; do node -p "require('./$p/node_modules/vitest/package.json').version"; done` → 2.1.9 ×6

### 2026-10-08 — the `dependency-checker` eval asks for "three zod versions" while its data has two
**Symptom:** the practice "the three different zod versions across server, client, and reviewer-core are called out explicitly as version drift" fails for answers that call out the drift correctly. The judge's evidence quotes a correct finding (`zod 3.23.8 vs 3.22.4`).
**Cause:** `REPO_DATA` in the case file lists `zod@3.23.8` (server), `zod@3.22.4` (client) and `zod@3.23.8` (reviewer-core). That is two distinct versions in three packages, and the sentence "three different resolved zod versions" contradicts its own list. An accurate skill cannot satisfy the practice.
**Rule:** don't tune `SKILL.md` to chase this practice. Either give reviewer-core a third version (e.g. `3.24.1`) in `REPO_DATA`, or reword the practice to "zod drift across the three packages". That is an eval change, so the user decides.
**Evidence:** `evals/skills/dependency-checker/dependency-checker.cases.ts` (`REPO_DATA` zod lines, case 3 practices) · `cd evals && pnpm run eval:skills dependency-checker` → case 3, 1 FAIL out of 5, all 3 tests passing

### 2026-10-04 — does `spec-creator` pass 1 over-classify display details as blocking?
**Symptom:** in the plan 20 smoke test (T1, feature "show the run's total token count in the review header") pass 1 returned B1–B5 as blocking; B3 (in/out split in a tooltip) and B4 (show cost too) are display details that fit an inline `[NEEDS CLARIFICATION: Qn]` in the draft.
**Cause:** unknown from one run — the "blocking = scope/boundaries" definition in `.claude/agents/spec-creator.md` (*Passes*) has no counter-example.
**Rule:** watch the first real specs (SPEC-08+). If display/format questions keep landing in pass 1, add a "not blocking: format, labels, tooltips" counter-example to the agent's pass-1 template.
**Evidence:** `docs/plans/20-spec-creator-agent.md` → *Verification log* (T1 line)

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
