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

_Nothing yet._
