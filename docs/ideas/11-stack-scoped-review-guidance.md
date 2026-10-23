# Idea brief: Stack-scoped review guidance for multi-stack and polyglot repos
Status: chosen
Save as: docs/ideas/11-stack-scoped-review-guidance.md

## Problem as understood
DevDigest will review repos with different stacks (.NET, Python, Node, Flutter, React/Vue), and some repos mix several. Today every skill attached to an agent goes into every run in every repo. The general prompt also hardcodes a Node/Fastify/Drizzle stack. The goal: in the studio, a finding on a `.cs` file is driven by .NET guidance and never by React guidance, even when both sit in one PR. Stats and evals also need to show quality per stack.
**Decision drivers:** D1 polyglot correctness (each changed file gets only the guidance for its own stack) · D2 configuration cost per new repo or stack · D3 measurability (stats and evals can answer "how good are we on .NET?") · D4 per-run LLM cost
**Appetite:** (assumption) per-run LLM cost no higher than today for a single-stack repo; one spec-sized feature, no new pipeline service.

## Already in the repo
- Repo rules are already per repo and per directory: root and ancestor-dir `AGENTS.md` + `insights/gotchas.md`, scoped per chunk — server `reviews/repo-rules.ts` (verified this session)
- Skills, agents, `agent_skills` are scoped to the workspace only — `specs/003-skills.md`, schema (verified)
- Eval suites per agent or skill, run without repo context — `specs/011-eval-pipeline.md`
- Stats are workspace-wide — `specs/015`, `specs/016`
- Conventions are mined per repo but not used in prompts — `specs/004-conventions-extractor.md` (draft)

## Options (at most 5 total, status quo included)
- Opt1 — skills declare `applies_to` (path globs, optionally a repo); one stack-neutral agent gets only the matching skills, per chunk
- Opt2 — separate per-stack agents, each bound to repos and to path globs, each reviewing only its own files
- Opt3 — status quo: workspace-wide skills, user hand-picks agents per run
- Opt4 — repo-owned guidance: neutral prompt, all stack rules live in each repo's per-dir `AGENTS.md`/gotchas, which the existing repo-rules loader already scopes
- Opt5 — auto-detected stack profiles: a no-LLM detector reads manifests (`*.csproj`, `pyproject`, `package.json`, `pubspec.yaml`), maps each changed file to a stack, and routes each slice to that stack's agents and skills

### Opt1 — Skill `applies_to` routing
- **Value:** one agent, one prompt; stack knowledge lives in skills that load only where their globs match the changed files. A polyglot PR in map-reduce gets .NET skills on the .NET chunk and React skills on the React chunk. Skill stats stop counting runs where the skill was irrelevant. The skill's own eval suite stays the per-stack quality gauge.
- **Packages / contract / migration:** shared skill contract gets a new field; skills table migration; reviewer-core picks skills per chunk (stays pure, matching is on path strings); client skill editor; CI export and runner carry the field.
- **Per-run LLM cost:** same or lower, since fewer skill tokens go into each call (inference)
- **Risk:** single-pass or auto runs on a mixed PR still get the union of skills in one call, so cross-stack bleed remains unless mixed PRs are forced to map-reduce.
- **Kill criterion:** a neutral agent with scoped skills still measurably underperforms a stack-specialist prompt.

### Opt2 — Per-stack agents with repo and path binding
- **Value:** each stack gets its own prompt, versions, eval suite and Stats row; what you see is what you measure.
- **Packages / contract / migration:** agent contract + migration (repo binding, path globs); "run all enabled" becomes per repo; the engine filters the diff per agent; client agent settings; export.
- **Per-run LLM cost:** at least one call per stack touched; polyglot PRs pay N times the fixed prompt overhead (inference)
- **Risk:** agents multiply (stack × role), skills get duplicated across agents, and every new repo needs manual binding.
- **Kill criterion:** configuration drift; repos end up with the wrong or missing agents bound.

### Opt3 — Status quo (labelled)
- **Value:** zero work; hand-picking agents per run works for a single-stack repo.
- **Packages / contract / migration:** none.
- **Per-run LLM cost:** unchanged; irrelevant skills inflate every call (inference)
- **Risk:** cross-stack bleed (Node priorities and React skills applied to .NET); Stats mix stacks into one number.
- **Kill criterion:** n/a. It fails the moment a second stack is reviewed.

### Opt4 — Repo-owned per-directory guidance
- **Value:** reuses a mechanism that already scopes per chunk; the reviewed team owns its rules; no DevDigest contract change beyond neutralizing `GENERAL_REVIEWER_PROMPT`.
- **Packages / contract / migration:** prompt seed only; maybe a doc on how to author rules.
- **Per-run LLM cost:** unchanged (inference)
- **Risk:** depends on every repo writing good `AGENTS.md` files; the loader's caps are on chars per file and on depth; there's no workspace-level reuse across repos, and nothing to measure per stack.
- **Kill criterion:** repos never write the files, so reviews fall back to generic output.

### Opt5 — Auto-detected stack profiles
- **Value:** zero per-repo configuration; a stack label on every file makes per-stack Stats, eval filtering and routing deterministic.
- **Packages / contract / migration:** new stack-profile entity + detector + routing stage; agents and skills attach to profiles; migration; widest change.
- **Per-run LLM cost:** one call per (stack × agent) touched (inference)
- **Risk:** misdetection (shared `package.json` at the root of a .NET repo, generated code, monorepo tooling); a new pipeline stage exceeds the appetite.
- **Kill criterion:** manual overrides become the norm, so detection adds nothing over globs.

## Comparison
| Option | D1 polyglot | D2 config cost | D3 measurability | Contract/migration | LLM cost/run | Purity | No-go | Confidence |
|---|---|---|---|---|---|---|---|---|
| Opt1 | good in map-reduce, partial in single-pass | low (globs once per skill) | medium (skill suites + scoped skill stats) | skill field + migration | ≤ today | kept | none | medium-high (inference) |
| Opt2 | good | high (per repo, per stack) | high | agent fields + migration | higher on polyglot | kept | none | medium (inference) |
| Opt3 | bad | none | bad | none | today | kept | fails goal | high (it's today) |
| Opt4 | good (already per chunk) | high (repo-side authoring) | none | none | today | kept | none | medium (inference) |
| Opt5 | good | lowest | high | new entity + stage | highest | kept if detection stays in server | exceeds appetite | low-medium (inference) |

## Recommendation
**Opt1 — go.** It fixes the actual leak: skills are the unit of stack knowledge and today they are unscoped. It reuses map-reduce's per-file chunking and keeps one agent per role. It costs no more tokens. It also composes with Opt4 (neutralizing the hardcoded general prompt is a prerequisite under every option). Per-stack stats can then be derived from the finding's file path through the same globs, without new agents. What would change it: if per-stack prompt quality truly differs (not just rules), Opt2's specialist agents win.

## Cheapest experiment
**Riskiest assumption:** a stack-neutral agent plus stack-scoped skills reviews a .NET (or Flutter) diff as well as a hand-written .NET-specialist agent.
**Try:** clone the general agent twice: (a) neutral prompt + a .NET skill, (b) a .NET-specialist prompt with no skill. Run both against one eval suite of 5–10 frozen .NET cases, `eval:repeat -n 5` each. **Cost:** ~half a day plus a few dollars of runs.
**Success signal:** (a) within noise of (b) on recall and precision · **Kill signal:** (b) beats (a) by more than the run-to-run spread, so go to Opt2.

## Questions that change the choice
- Q1: Are polyglot PRs usually small enough to run single-pass? → if yes and bleed shows up in tests, Opt2 (separate calls) beats Opt1.
- Q2: Must Stats show a separate *agent* per stack (versions, promote) rather than a per-stack breakdown of one agent? → flips to Opt2.
- Q3: Should the team plugin marketplace be the only source of skills, carrying its own path scoping? → Opt1's field must match that format, or Opt4 wins if guidance should live in the repos.
- Q4: How many repos and stacks within 6 months? → more than about 10 repos with frequent new stacks favours Opt5.

## Facts needed (for researcher)
- How does map-reduce group files into chunks, and can a chunk mix files of two stacks (e.g. `api/*.cs` and `web/*.tsx`)?
- How does the `auto` strategy decide single-pass vs map-reduce, and on what size thresholds?
- Does `assemblePrompt` receive one skill list per run, or can it already take a list per chunk the way repo rules are scoped?
- Does a run persist which skills were in each prompt (per chunk), enough for per-skill stats once scoping exists?
- Does skill import (md, zip, URL) keep YAML frontmatter, so a `globs`/`paths` key would survive import?
- What does the team plugin marketplace's skill format use for path or language scoping, if anything?
- How do the CI export's `.devdigest/skills/*.md` and agent-runner parse skill metadata, and would an extra field pass through untouched?
- What are repo-rules' depth, file-count and char caps, and would a polyglot monorepo with per-dir `AGENTS.md` hit them?

## Choice recorded
2026-10-21 — user chose **Opt1 + Opt4** (skill `applies_to` routing per chunk, plus a stack-neutral General Reviewer prompt with per-repo/per-dir `AGENTS.md` rules). Q4: few repos expected, so Opt5 is out. Q1/Q2 not answered separately; Opt1 implies a per-stack breakdown of one agent, not per-stack agents. The cheapest experiment was not run.
Research run (repo mode, same day) added constraints for the spec: the studio default strategy is `single-pass`, so a mixed PR needs per-skill-scope grouping or forced chunking to avoid cross-stack bleed; import drops unknown front-matter keys (Claude Code's own `paths` key is the precedent for the field name); `run_skills` is per run, not per chunk; CI export/runner carry skill bodies only (separate PR); repo rules read only the first two directory levels from the root, 8k chars per chunk.

Spec pass-1 answers (user, 2026-10-22):
- B1 (a): skill field `paths` (Claude Code name), shown as "Applies to" in the UI; repo-relative path globs only, no repo or language key; a skill matches a chunk when any of its files matches any glob; empty = applies everywhere; existing glob shape rules (PSR1), max 20 globs; a glob change creates a new skill version.
- B2 (b)+(b1): in single-pass, group changed files by the set of matching skills, one call per group (single-stack PR stays one call); files no scoped skill matches form their own group with unscoped skills only. Map-reduce keeps one chunk per file with per-chunk selection.
- B3 (a): trace shows files and skills per group/chunk; `run_skills` records a skill only if it was injected at least once, so Skill Stats count only runs where it applied. Follow-up: per-stack breakdown in Agent Stats (separate spec).
- B4: neutralise all four built-in prompts with a `# Stack context` block (General, Performance, Test Quality, API Contract; Security unchanged); move the Node/TS specifics into a scoped skill (`paths: **/*.ts, **/*.js`); existing workspaces via manual `agents:sync-builtin` (dry-run first); keep `docs/agent-prompts/*` in sync.
- B5 (a): repo-rules caps unchanged; document "rule files no deeper than two dir levels from the root". Each B2 group gets its own repo-rules selection and 8k budget.
- B6 (a): CI export / agent-runner support is a follow-up spec in a separate PR; until then the export page warns that Applies to is ignored in CI; new contract kept out of the `shared` barrel so the runner bundle stays unchanged.
- B7 (a): agent eval suites route skills by each case's paths exactly like live reviews (B2 grouping); a skill's own suite always injects the skill under test and flags cases whose files match none of its globs.
- B8 (c): import does not read `paths`; Applies to is set in the UI after import. Follow-up: read `paths` from front-matter (comma string or YAML list) on import, and write it back on skill export, once the marketplace adopts the key.
