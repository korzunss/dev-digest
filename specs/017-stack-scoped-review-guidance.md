# Spec: Stack-scoped review guidance
Spec ID: SPEC-17
Status: approved
Supersedes: none

Idea brief: [docs/ideas/11-stack-scoped-review-guidance.md](../docs/ideas/11-stack-scoped-review-guidance.md) (Opt1 + Opt4; pass-1 answers B1–B8 recorded there under `## Choice recorded`).

## Problem & user

A DevDigest user reviews repositories built on different stacks (.NET, Python, Node, Flutter, React/Vue), and some repositories mix several stacks in one PR. Today every enabled skill attached to an agent goes into every review call, whatever files the PR touches. On top of that, four built-in reviewer prompts state a Node/Fastify/Drizzle stack. The result: a `.cs` file can draw findings from React or Node guidance, irrelevant skill text inflates every call, and Skill Stats count a skill as "pulled" in runs where it had nothing to review.

The user wants each changed file reviewed only with guidance that fits its stack, including when two stacks sit in one PR. Neither the built-in prompts nor the repo-owned rules should assume a stack.

## Goals / Non-goals

**Goals**
- A skill can declare the repo-relative path globs it applies to (`paths`, shown as "Applies to"). A skill with no globs applies everywhere, as today.
- In single-pass and map-reduce studio reviews, every review call gets only the skills whose globs match the files in that call.
- A mixed-stack PR reviewed single-pass is split into one call per distinct set of matching skills, so .NET files never share a call with React-only guidance. A single-stack PR still makes one call.
- The trace shows which files and skills went into each group or chunk. Skill Stats count a run only when the skill was actually injected.
- The four built-in prompts with a `# Stack context` block become stack-neutral. Their Node/TypeScript specifics move into a built-in skill `node-typescript-review` scoped to JavaScript and TypeScript files (AC-35). [user: answer to plan-44 GAP4, 2026-10-22]
- Agent eval suites route skills exactly like live reviews. A skill's own suite still exercises the skill under test.
- Rule authors know the repo-rules depth limit (rule files no deeper than two directory levels from the root).

**Non-goals** (follow-ups get their own specs)
- Per-stack breakdown in Agent Stats. Follow-up spec; Agent Stats stay workspace-wide here. [user: answer to B3, 2026-10-22]
- CI export and agent-runner honouring Applies to. Follow-up spec in a separate PR; until then the export page warns that it is ignored in CI. [user: answer to B6, 2026-10-22]
- Reading `paths` from skill front-matter on import (md, zip, URL, marketplace) and writing it back on export. Follow-up once the marketplace adopts the key; Applies to is set in the UI after import. [user: answer to B8, 2026-10-22]
- A repo key, language key or auto-detected stack profiles on skills (brief Opt5 rejected; few repos expected). [user: answer to B1, 2026-10-22]
- Per-stack agents bound to repos or paths (brief Opt2 not chosen).
- Changing the repo-rules caps (depth 2, 40 files, 12k chars per file, 8k chars per call). [user: answer to B5, 2026-10-22]
- Forcing map-reduce on mixed PRs, or accepting the union of skills in one call (B2 options a and c rejected).
- Changing the Security Reviewer prompt (it has no stack block). [user: answer to B4, 2026-10-22]
- Changing how `auto` chooses between single-pass and map-reduce.

## User stories

- As a reviewer of a .NET + React repo, I want a `.cs` file reviewed only with .NET and unscoped skills, so that findings on it are not driven by React guidance.
- As a skill author, I want to set "Applies to" globs on a skill, so that it loads only where it is relevant.
- As a user of a single-stack repo, I want reviews to cost no more calls than today, so that scoping is free when I don't need it.
- As a user checking a run, I want the trace to show which files and skills went into each call, so that I can see why a finding appeared.
- As a user reading Skill Stats, I want a skill counted only in runs where it was injected, so that pull and accept rates reflect the skill's real use.
- As a user of a Python or Flutter repo, I want the built-in reviewers to stop assuming Node/Fastify/Drizzle, so that their priorities match my code.
- As a skill owner, I want my skill's eval suite to flag cases its globs would never match, so that I notice a suite that tests the skill outside its scope.

## Acceptance criteria (EARS)

### Skill field "Applies to"
- AC-1: The system SHALL store, on every skill, an ordered list `paths` of 0 to 20 repo-relative path globs, shown in the studio as "Applies to". [user: answer to B1, 2026-10-22]
- AC-2: WHERE a skill's `paths` list is empty, the system SHALL treat the skill as applying to every changed file, as before this feature.
- AC-3: WHEN a user saves a skill whose Applies to holds a glob that is absolute, contains a `..` segment, is longer than 1024 characters, or fails the glob shape rules already enforced for Project Context roots, the system SHALL reject the save with a validation error naming that glob and SHALL keep the stored skill unchanged.
- AC-4: WHEN a user saves a skill with more than 20 globs, the system SHALL reject the save with a validation error stating the limit.
- AC-5: WHEN a user saves a change to a skill's Applies to, the system SHALL create a new skill version whose snapshot carries the globs, the same way a body change does. This amends spec 003's rule that only a body change creates a version. [user: answer to B1, 2026-10-22] [user: accepted default, 2026-10-22]
- AC-6: WHEN a user restores an earlier skill version, the system SHALL restore that version's Applies to together with its body. A version created before this feature restores an empty Applies to.
- AC-7: The system SHALL save each glob trimmed, drop empty entries, and treat a leading `./` as equivalent to no prefix.
- AC-8: The system SHALL show each scoped skill's globs as an "Applies to" summary on its card in the skills rail and in the agent's skills list, and SHALL label an unscoped skill "All files". [user: accepted default, 2026-10-22]
- AC-9: The system SHALL keep the order of skills in every list and in every prompt as the agent's attached order, whether skills are scoped or not. [user: accepted default, 2026-10-22]

### Matching
- AC-10: The system SHALL treat a skill as matching a changed file when any of the skill's globs matches the file's repo-relative path. Matching is case-sensitive, uses `/` separators, and lets wildcards match dot-prefixed segments.
- AC-11: WHEN a changed file is renamed, the system SHALL match it by its new path. [user: accepted default, 2026-10-22]
- AC-12: WHEN a changed file is deleted, the system SHALL match it by its old path. [user: accepted default, 2026-10-22]
- AC-13: The system SHALL give each changed file the full set of enabled attached skills that match it (all unscoped skills plus every scoped skill with a matching glob). A file matched by the scoped skills of two stacks gets both. [user: accepted default, 2026-10-22]

### Single-pass grouping
- AC-14: WHILE a review runs single-pass, the system SHALL group the changed files by identical matching skill set and make one review call per group, each call containing only that group's files' diff and that group's skills. [user: answer to B2, 2026-10-22]
- AC-15: WHEN every changed file of a single-pass review has the same matching skill set, the system SHALL make exactly one review call, as before this feature.
- AC-16: The system SHALL put files that no scoped skill matches into their own group, reviewed with the unscoped skills only. [user: answer to B2 (b1), 2026-10-22]
- AC-17: IF none of a group's files match any enabled skill (no unscoped skill attached and no scoped skill matching), THEN the system SHALL review that group with no skills section and SHALL say so in the run log. [user: accepted default, 2026-10-22]
- AC-18: The system SHALL give each group its own repo-rules selection, chosen by the group's file paths and capped at the existing per-call budget. [user: answer to B5, 2026-10-22]
- AC-18a: The system SHALL put a project-context document into a group or chunk call when the document is attached directly to the agent, or when it is inherited through at least one skill injected into that call. A document inherited only through skills not injected into a call SHALL be left out of that call. [user: answer to plan-44 GAP3, 2026-10-22]
- AC-19: The system SHALL include the full list of the PR's changed file paths (names only, not diffs) in every group's call, so that each call knows the rest of the PR exists. A cross-stack defect that needs two groups' diffs to see may be missed; that is the accepted cost of isolating stacks. [user: accepted default, 2026-10-22]
- AC-20: WHEN a single-pass review splits into more than one group, the system SHALL write one run-log line giving the number of groups and, for each group, its file count and skill names.
- AC-21: The system SHALL merge the findings from all groups into one review per agent run and SHALL compute the score from all surviving findings, as map-reduce does.
- AC-22: WHEN one group's diff exceeds the existing size guard, the system SHALL review that group's files per file (map-reduce) with that group's skill selection per file, and SHALL leave the other groups single-call. [user: accepted default, 2026-10-22]

### Map-reduce
- AC-23: WHILE a review runs map-reduce, the system SHALL choose skills for each per-file chunk from that file's matching skill set. [user: answer to B2, 2026-10-22]
- AC-24: The system SHALL decide between single-pass and map-reduce under `auto` exactly as before this feature, on the whole diff.

### Failure and LLM fallback
- AC-25: IF a group's review call fails or is truncated after the existing retry rules, THEN the system SHALL keep the findings of the other groups, mark the run's review as partial the same way a skipped map-reduce chunk is marked, and name the skipped group's files in the run log. [user: accepted default, 2026-10-22]
- AC-26: IF every group's review call fails, THEN the system SHALL fail the agent run the way a failed single-pass call fails it today. [user: accepted default, 2026-10-22]
- AC-27: IF a model finding cites a file or line outside the diff of the call that produced it, THEN the system SHALL drop it through the existing grounding gate.

### Trace and stats
- AC-28: The system SHALL record in the run trace, for each group or chunk, the file paths it covered and the skills (name and version) injected into its prompt. [user: answer to B3, 2026-10-22]
- AC-29: The system SHALL record a skill in the run's skill list only when it was injected into at least one group or chunk of that run. [user: answer to B3, 2026-10-22]
- AC-29a: The system SHALL record as a run skill's token count the real spend: the skill body's token count times the number of group or chunk calls it was injected into. Rows from runs before this feature hold the body size once and are not comparable; they are not migrated or corrected. [user: answer to Q1, 2026-10-22]
- AC-30: WHEN Skill Stats compute pull rate and accept rate, the system SHALL count only runs in which the skill was injected.
- AC-30a: The system SHALL compute the Agent Stats "Most-used skills" panel and its "Tracked since" date (spec 016) from the narrowed run skill list, so that both mean "injected"; their definitions and queries are otherwise unchanged. [user: answer to plan-44 GAP2, 2026-10-22]
- AC-31: The system SHALL show in the trace drawer, per group or chunk, its files and injected skills. For a run with one group, it shows that one entry.
- AC-32: WHEN a trace recorded before this feature is opened, the system SHALL show it as one group holding every changed file and every recorded skill.

### Built-in prompts
- AC-33: The system SHALL ship the General, Performance, Test Quality and API Contract built-in prompts without a Node/Fastify/Drizzle stack statement: no `# Stack context` stack list, and no stack named in the Role line. Instead each prompt SHALL tell the model to rely on the provided skills and repo context for stack conventions. [user: answer to B4, 2026-10-22]
- AC-34: The system SHALL ship the Security Reviewer prompt unchanged.
- AC-35: The system SHALL provide a built-in skill named `node-typescript-review` holding the general JavaScript/TypeScript review pitfalls removed from those prompts (truthiness, `??` vs `||`, async traps, N+1 and unbounded fan-out, event-loop blocking); it names no project-specific framework, library or package (no Fastify, Drizzle, `@devdigest/shared`, testcontainers), since its Applies to matches every JS/TS repo. It has `source: manual` (no new source value), is enabled, has Applies to `**/*.ts, **/*.tsx, **/*.js, **/*.jsx, **/*.mjs, **/*.cjs`, and is attached to the four changed built-in agents in a newly seeded workspace. [user: answer to B4, 2026-10-22] [user: answer to plan-44 GAP4, 2026-10-22] [user: plan-44 G5 review, 2026-10-23]
- AC-36: WHEN a user runs `agents:sync-builtin` on an existing workspace, the system SHALL push the neutral prompts to the four agents as new agent versions, create the built-in Node/TypeScript skill if it is missing, and attach it to each of the four agents that lacks it. [user: accepted default, 2026-10-22]
- AC-36a: IF `agents:sync-builtin` finds a skill in the workspace named `node-typescript-review` (the built-in skill's name, matched exactly) [user: answer to plan-44 GAP4, 2026-10-22], THEN the system SHALL attach that existing skill unchanged (never overwriting its body or Applies to, never renaming it, never creating a second skill) and SHALL say so in its output, dry run included. [user: answer to Q2, 2026-10-22]
- AC-37: WHEN `agents:sync-builtin` runs with `--dry-run`, the system SHALL list the prompt updates, skill creation and skill attachments it would make, and change nothing. [user: accepted default, 2026-10-22]
- AC-38: The system SHALL never apply the neutral prompts or the new skill to an existing workspace on boot or on seed of an existing workspace. [user: accepted default, 2026-10-22]
- AC-39: The system SHALL keep each built-in prompt's documentation mirror under `docs/agent-prompts/` identical in content to the shipped prompt.

### Evals
- AC-40: WHEN an agent eval suite runs, the system SHALL select and group skills for each case by that case's file paths, exactly as a live review with the same strategy does. [user: answer to B7, 2026-10-22]
- AC-41: WHEN a skill's own eval suite runs, the system SHALL inject the skill under test into every case regardless of its Applies to.
- AC-42: WHEN a skill's own eval suite runs a case whose files match none of the skill's globs, the system SHALL mark that case's result "outside Applies to" in the suite results, and SHALL score it as usual.

### Export to CI
- AC-43: WHILE any skill attached to an agent selected on the Export to CI page has a non-empty Applies to, the system SHALL show a warning on that page that Applies to is ignored in CI and that every attached skill applies to every file there. [user: answer to B6, 2026-10-22]
- AC-44: The system SHALL export skills to CI with the same file content as before this feature.

### Import
- AC-45: WHEN a skill is imported (md, zip or URL), the system SHALL create it with an empty Applies to, whatever front-matter keys the source carries. [user: answer to B8, 2026-10-22]

### Repo-rules guidance
- AC-46: The system SHALL document, wherever repo-rules authoring is documented, that rule files (`AGENTS.md`, `insights/gotchas.md`) are read only from the repository root and the first two directory levels below it, and the existing size caps. [user: answer to B5, 2026-10-22]

### Untrusted data
- AC-47: The system SHALL pass skill bodies, repo rules, diff content and changed file paths to the model only as data inside the existing untrusted-content wrapping, and SHALL use file paths and globs only for string matching, never as instructions.

## Edge cases

- **Agent with only scoped skills on a PR none of them match.** One group, no skills section (AC-17), plus a run-log line. The review still runs.
- **Every skill disabled.** No skills section in any call. Grouping collapses to one call, since every file has the same empty set.
- **One file matching two stacks' skills** (for example `web/api.ts` matched by the Node/TypeScript skill and a `web/**` React skill). The file gets both (AC-13) and forms its own group if no other file has that exact set.
- **Many distinct skill sets.** The number of groups is bounded by the distinct matching sets, which an agent's attached skills limit. The run-log line (AC-20) makes the count visible. No extra cap.
- **Renamed file across stacks** (`web/x.ts` to `api/x.cs`). It is matched by the new path (AC-11).
- **Deleted file.** It is matched by the old path (AC-12).
- **Binary or empty-patch file.** It is grouped by path like any other. If its group has no reviewable diff, that group makes no call.
- **Huge group.** Per-file fallback for that group only (AC-22).
- **Empty diff.** Behaviour unchanged (no groups, existing empty-diff path).
- **Cross-stack issue** (a C# API change breaking a React caller). Each group's call sees only its own diff plus the full changed-file list (AC-19). A finding needing both diffs may be missed. This is the accepted cost of D1.
- **Glob matching nothing in any repo.** Allowed and saved. The skill is simply never injected, and Skill Stats show it as not pulled.
- **Edited built-in prompt.** `agents:sync-builtin` overwrites it, and the user's text stays in agent versions (existing behaviour). The dry run lists it first (AC-37).
- **Node/TypeScript skill already exists by name** (a user created one). Sync attaches the existing skill unchanged and reports it; it never duplicates, overwrites or renames it (AC-36a).
- **Run where no skill matched any file.** It writes no run skill rows, so it does not count toward Skill Stats, the Agent Stats "Most-used skills" panel or its "Tracked since" date (AC-30a). [user: answer to plan-44 GAP2, 2026-10-22]
- **Project-context document inherited through two scoped skills of different stacks.** It goes into every group where at least one of those skills was injected (AC-18a). [user: answer to plan-44 GAP3, 2026-10-22]
- **Old traces and old skill versions.** Shown as one group (AC-32) and restored with an empty Applies to (AC-6).
- **Concurrent edit of Applies to during a run.** The run uses the skill state it loaded at start, as it does for the body today.

## Non-functional requirements

- **Cost.** For a PR whose files all share one matching skill set, the number of LLM calls and the fixed prompt overhead SHALL equal today's. Skill tokens per call SHALL be no higher than today. A mixed PR pays one fixed prompt overhead per group.
- **Purity.** Skill selection and grouping are pure string operations on paths and globs. The review engine stays free of db, forge and filesystem access.
- **Glob safety.** Glob validation SHALL bound match cost the same way Project Context roots validation does (a crafted glob cannot hang a review or the API).
- **Runner behaviour and bundle.** The agent-runner's review behaviour SHALL stay unchanged: every attached skill applies to every file, and `paths` is ignored in CI (B6). Any reviewer-core change makes the committed `agent-runner/dist/index.js` stale, so the bundle SHALL be rebuilt and committed in a separate runner PR, stacked on top of the feature branch, so that both PRs stay green and merge in order. New shared contract shapes SHALL stay outside the `@devdigest/shared` barrel where possible, to keep the bundle diff small. [user: answer to B6, 2026-10-22] [user: answer to plan-44 GAP1, 2026-10-22]
- **Compatibility.** A workspace that sets no Applies to on any skill SHALL get the same prompts, calls and stats as before, except for the neutral prompts after a manual sync.
- **Latency.** Groups of one run may be reviewed concurrently within the existing per-run concurrency limits. No new limit is introduced.

## Inputs and provenance

- Skill Applies to globs: [user: skill editor, Applies to field]
- Skill bodies and attached order: [reused: specs/003-skills.md]
- Skill versions and restore: [reused: specs/003-skills.md]
- Changed file paths (old and new) and per-file diff: [external: GitHub/GitLab forge via the review diff loader] and the repo clone [deterministic: git diff of base_sha...head_sha]
- Repo rules per group: [reused: reviewer-core repo-rules selection (`selectRepoRules`)] over files from the cloned repository [external: cloned repository content]
- Strategy selection and size guard: [reused: reviewer-core review run strategy (`auto`, map-reduce threshold, size guard)]
- Grouping by matching skill set: [deterministic: glob match of changed paths against skill globs]
- Review findings per group: [llm: review completion per group or chunk]
- Run trace and run skills: [reused: specs/011-eval-pipeline.md trace shape; `run_skills`]
- Skill Stats: [reused: specs/016-agent-stats-breakdown.md Skill Stats period]
- Agent Stats "Most-used skills" and "Tracked since": [reused: specs/016-agent-stats-breakdown.md]
- Project-context documents attached to agents and skills: [reused: specs/008-project-context.md], with content from [external: cloned repository content]
- Built-in prompts and sync: [reused: server agents `agents:sync-builtin`; specs/012-agent-versions.md]
- Eval cases and their file paths: [reused: specs/011-eval-pipeline.md] (case diffs are [user: eval case editor])
- Export to CI page: [reused: specs/014-export-to-ci.md]

## Untrusted inputs

- Applies to globs [user]: used only for validated string matching. They never reach the prompt as instructions.
- Skill bodies [user]: prompt guidance under the existing skills section. They cannot change grouping, tools or output format.
- Changed file paths and diff content [external]: data inside the untrusted wrapping. A path that looks like an instruction is still only a path.
- Cloned repository content, including repo rules and project-context documents [external]: data inside `## Repo context`, followed by the existing trusted guard.
- Eval case diffs and paths [user]: treated exactly like a live diff.
- Model output per group [llm]: parsed as structured findings and passed through the grounding gate. The fallback for a failed call is AC-25 and AC-26; out-of-diff citations are dropped (AC-27).

## Module interactions

- **`@devdigest/shared` (server copy first, then the client mirror):** the `Skill` contract gains `paths`. The skill version snapshot carries it. Skill create and update bodies accept it with validation. The trace `PromptAssembly` gains a per-group or per-chunk list of files and injected skills. New shapes stay out of the barrel the runner bundles (NFR).
- **reviewer-core:** the run input carries each skill's globs. The engine groups files for single-pass, selects skills per chunk for map-reduce, scopes repo rules per group (the existing per-chunk `memoryFor` pattern), merges group findings, and reports per-group assembly for the trace. It stays pure.
- **server, skills module:** CRUD, validation (reusing the Project Context roots glob shape rules), versions and restore carry `paths`. Skill Stats read the narrowed run skill list.
- **server, reviews and run executor:** passes skills with globs to the engine, records only the injected skills in the run skill list, writes the per-group trace and the run-log lines.
- **server, agents:** new neutral built-in prompts, a new seeded built-in Node/TypeScript skill, and `agents:sync-builtin` extended to create and attach it (dry-run aware).
- **server, eval pipeline:** agent suites use the same engine routing. Skill suites force-inject the skill under test and flag outside-Applies-to cases.
- **server, CI export:** unchanged output. The client decides on the warning from the agents' attached skills.
- **client:** skill editor Applies to field with validation errors, Applies to summary on skill cards and in the agent's skills list, trace drawer per-group view, eval result "outside Applies to" mark, Export to CI warning.
- **mcp-server:** no change (it exposes no skill tools).
- **agent-runner:** no behaviour change; scoping support is a follow-up spec. Its committed bundle is rebuilt in a stacked runner PR because it inlines reviewer-core (NFR *Runner behaviour and bundle*). [user: answer to plan-44 GAP1, 2026-10-22]
- **Project Context (spec 008):** documents inherited through skills follow the skills injected into each group or chunk; documents attached to the agent go into every call (AC-18a).
- **Agent Stats (spec 016):** "Most-used skills" and "Tracked since" read the narrowed run skill list, with no query change (AC-30a).

## Open questions

None. Q1 was answered as AC-29a and Q2 as AC-36a [user: answers to Q1 and Q2, 2026-10-22].

## Changelog

- 2026-10-22 · whole spec · draft written from brief 11 pass-1 answers B1–B8 · spec pass 2 · user
- 2026-10-22 · Acceptance criteria (new AC-29a, AC-36a; AC-5, AC-19 text), Edge cases, Open questions · Q1 → real token spend per injected call; Q2 → sync attaches a same-named user skill unchanged; pass-2 defaults accepted and tagged · correction round · user
- 2026-10-22 · Status · approved (Open questions empty) · user approval · user
- 2026-10-22 · Status · back to draft for plan 44 GAP1–GAP4 (runner-bundle NFR, Agent Stats reads run_skills, inherited context docs, built-in skill name/source) · plan 44 pass 1 · main session
- 2026-10-22 · Goals, Acceptance criteria (new AC-18a, AC-30a; AC-35, AC-36a), Edge cases, NFR (runner behaviour and bundle), Inputs, Untrusted inputs, Module interactions · GAP1 stacked runner PR rebuilds dist/; GAP2 Agent Stats skill usage means injected; GAP3 inherited context docs follow the injected skill; GAP4 built-in skill node-typescript-review, source manual · plan 44 GAP1–GAP4 · user
- 2026-10-22 · Status · re-approved after plan 44 GAP1–GAP4 (Open questions empty) · user approval · user
- 2026-10-23 · Acceptance criteria (AC-35 text) · the built-in skill holds only general JS/TS pitfalls, no DevDigest-specific stack (Fastify, Drizzle, `@devdigest/shared`, testcontainers), because its globs match every JS/TS repo · plan 44 G5 review · user
