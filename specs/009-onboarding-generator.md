# Spec: Onboarding Generator
Spec ID: SPEC-09
Status: implemented
Supersedes: none

## Problem & user

A developer who joins an unfamiliar repository (a new hire, a reviewer seeing a
codebase for the first time, a contributor from another team) has no single
place in DevDigest that explains how the repo is built, which files matter, how
to run it, what to read first and what to try first. DevDigest already indexes
every imported repository (symbols, import graph, file rank), but that
knowledge is only used inside PR reviews; a person cannot see it.

"Onboarding" in this spec means exactly this: a **per-repository codebase tour
for a developer new to that repository**. It is not the product's first-run
"Add repository" screen, which already lives at `/onboarding` and keeps its
meaning. [user: answer to B1, 2026-10-05]

## Goals / Non-goals

Goals
- A repo-scoped **Onboarding Tour** page with five sections, in this order:
  Architecture overview, Critical paths, How to run locally, Guided reading
  path, First tasks. [user: requirements + design 16.png/17.png]
- Facts are collected deterministically; one structured LLM call turns them
  into readable sections; any degradation shows a deterministic skeleton with an
  honest status.
- The page always says what the tour was built from (coverage, index status,
  age, staleness).

Non-goals
- Raising or removing the repo-intel indexing cap (5,000 files, JS/TS only)
  for this feature. [user: answer to B2, 2026-10-05]
- A tour built from the forge API without a local clone. [user: answer to B3, 2026-10-05]
- Automatic generation on page view or after every re-index; any paid LLM call
  without an explicit user action. [user: answer to B4, 2026-10-05]
- Git-history "hotness" in the reading-path rank (clones are shallow, so
  hotness is 0 today); a follow-up. [user: answer to B5, 2026-10-05]
- First tasks from forge issues (e.g. `good-first-issue` labels). [user: answer to B6, 2026-10-05]
- Public or external sharing, or a new unauthenticated route. [user: answer to B7, 2026-10-05]
- A "Copy as Markdown" export of the tour. [user: rejected SG7, 2026-10-05]
- An `mcp-server` tool for the tour in v1; a follow-up. [user: answer to B8, 2026-10-05]
- Any change to `reviewer-core`, to PR reviews, or to the Add-repository flow.
- Translating the tour beyond the language mechanism the existing onboarding
  prompt already carries.

## User stories

- As a developer new to a repo, I want one page that explains its
  architecture, critical files, run steps, reading order and first tasks, so
  that I can become productive without asking a teammate for a walkthrough.
- As a developer, I want the page to tell me honestly how much of the repo the
  tour is based on and how fresh it is, so that I know how far to trust it.
- As a workspace owner, I want the paid model call to run only when someone
  asks for it, so that browsing never costs money.
- As a developer on a repo that is not indexed well (huge, non-JS/TS, failed
  index, not cloned), I want to see what is still known and why the rest is
  missing, instead of an empty or invented page.

## Acceptance criteria (EARS)

Navigation and meaning
- AC-1: The system SHALL provide a repo-scoped Onboarding Tour page, reachable
  from a WORKSPACE navigation item labelled "Onboarding Tour" placed between
  "Pull Requests" and "Project Context".
- AC-2: WHILE the Add-repository page (`/onboarding`) is displayed, the system
  SHALL NOT mark the Onboarding Tour navigation item as active.
- AC-3: WHILE the Onboarding Tour page of a repo is displayed, the system SHALL
  mark the Onboarding Tour navigation item as active and show the breadcrumb
  `<owner>/<repo> › Onboarding Tour`.

Deterministic facts (no LLM)
- AC-4: WHEN the tour page is opened or a generation starts, the system SHALL
  collect the repo's stack, top-level structure, routes/endpoints and run
  scripts deterministically from the repo clone and the repo-intel index,
  without any LLM call.
- AC-5: The system SHALL order the Guided reading path by descending file rank
  from the import graph (PageRank; hotness is 0 because clones are shallow),
  excluding tests, configuration, declaration, migration and generated files,
  and SHALL list at most 10 files, each with a one-line reason to read it.
  [user: accepted SG5, 2026-10-05] In the deterministic skeleton (no LLM
  output), each row's reason SHALL be computed from the graph, e.g.
  "rank #2 · imported by 14 files". [user: plan 26 GAP4, 2026-10-05]
- AC-6: The system SHALL derive Critical paths from the import-graph
  dependency chains that start at the highest-ranked files, and SHALL show at
  most 6 rows, each with the file path, a one-line reason and an Open action.
  [user: accepted SG6, 2026-10-05] In the deterministic skeleton (no LLM
  output), each row's reason SHALL be computed from the graph: the chain the
  file heads, its rank or its importer count. [user: plan 26 GAP4, 2026-10-05]
- AC-7: WHERE the repo has no import graph because its language is not indexed
  (non-JS/TS), the system SHALL show the Guided reading path and Critical paths
  sections as "not available for this language" and SHALL still show
  Architecture overview, structure and How to run locally from the
  deterministic facts.
- AC-8: IF the import graph is empty for any other reason (index failed, no
  edges), THEN the system SHALL show the Guided reading path and Critical paths
  sections as not available, with the index status and reason.

Generation (one structured LLM call)
- AC-9: WHEN the user activates Generate or Regenerate, the system SHALL make
  exactly one structured LLM call, with the provider and model configured for
  the `onboarding` feature, that turns the deterministic facts into the five
  sections in the order of the Goals.
- AC-10: The system SHALL send that call only a bounded set of deterministic
  facts (stack, structure, routes, scripts, ranked paths, critical-path chains,
  index coverage), never the full contents of every file.
- AC-11: The system SHALL ask the LLM for 3 to 5 first tasks, each citing at
  least one file present in the repo index; WHEN only 1 or 2 tasks survive
  grounding (AC-14, AC-15), the system SHALL show them with the note "only N
  tasks could be tied to files". [user: plan 26 GAP3, 2026-10-05]
- AC-12: The system SHALL NOT make any LLM call when the page is opened, only
  on an explicit Generate or Regenerate.
- AC-13: WHILE a generation for a repo is in progress, the system SHALL show
  that it is generating and SHALL NOT start a second generation for the same
  repo.

Grounding
- AC-14: IF a section produced by the LLM cites a file path that is not in the
  repo index, THEN the system SHALL drop that reference (row, link, reading
  step) before the tour is stored or shown.
- AC-15: IF a first task has no remaining valid file reference after AC-14,
  THEN the system SHALL drop that task; IF no task survives, including when
  there is no index to ground against, THEN the system SHALL show First tasks
  as "not available" with its cause per AC-37.
  [user: plan 26 GAP3, 2026-10-05]
- AC-16: IF any `&&`-separated part of a run command produced by the LLM is not
  one of the allowed forms, THEN the system SHALL drop that command. The allowed
  forms are: `cd <a package directory found in the repo>`;
  `<package manager> install|i|ci`; `<package manager> run <collected script>`
  or `<package manager> <collected script>`;
  `cp <an env example file found in the repo> .env`; and `docker compose up`
  or `docker compose up -d`, only when a compose file was found in the repo.
  IF no LLM command survives, THEN the system SHALL show the deterministic
  commands collected from the repo instead.
  [user: plan 26 cross-model review X4, 2026-10-05]
- AC-17: IF a diagram produced by the LLM cannot be rendered, THEN the system
  SHALL drop the diagram and keep the section's text.

Degradation and honest status
- AC-18: IF the structured LLM call fails, times out, has no usable model or
  key, or returns output that fails validation, THEN the system SHALL show the
  deterministic skeleton with a status that names the failure reason, and SHALL
  show First tasks as "not available".
- AC-19: IF a Regenerate fails, THEN the system SHALL keep the previously
  stored tour unchanged and report the failure; only a successful generation
  replaces the stored tour.
- AC-20: WHILE the repo has no clone on disk (not cloned yet, or cloning), the
  system SHALL show an empty state that names the clone status and SHALL NOT
  offer Generate.
- AC-21: IF the repo's clone failed, THEN the system SHALL show an error state
  with the failure reason and a Re-clone action that re-queues the clone
  (re-sync does not re-clone a repo that has no clone).
  [user: plan 26 GAP1, 2026-10-05]
- AC-22: WHILE a clone exists and the index status is `partial`, `degraded` or
  `failed`, the system SHALL show the deterministic skeleton (or the stored
  tour) labelled with the index status and its reason.
- AC-23: WHEN the index covers fewer source files than the repo holds, the
  system SHALL state the coverage in the page header as "indexed N of M source
  files · partial", where M counts only the source files of the indexed
  languages (the JS/TS files the index sees), not every file in the clone;
  WHEN `partial` is caused by parse or graph errors rather than the file cap,
  the system SHALL show that reason next to the coverage.
  [user: plan 26 GAP2, 2026-10-05]

Persistence and freshness
- AC-24: WHEN a repo with no stored tour is opened, the system SHALL show the
  deterministic skeleton and a Generate action.
- AC-25: The system SHALL keep one stored tour per repo; a successful
  Regenerate SHALL replace it.
- AC-26: WHILE a stored tour is shown, the system SHALL show the subtitle
  "Generated from index of N files · last refreshed <relative time>", or the
  partial-coverage form of AC-23 when the index is partial.
  [user: accepted SG4, 2026-10-05]
- AC-27: WHILE the repo's last indexed commit differs from the commit the
  stored tour was built from, the system SHALL mark the tour as stale with the
  text "Index moved since this tour was built" and offer Regenerate.
  [user: accepted SG4, 2026-10-05]

Interactions shown in the design
- AC-28: WHEN the user selects an entry in the "On this page" list, the system
  SHALL bring that section into view; WHILE the user scrolls, the list SHALL
  highlight the section currently in view. [user: accepted SG3, 2026-10-05]
- AC-29: WHEN the user activates a section's collapse control, the system SHALL
  collapse or expand that section; every section SHALL start expanded on each
  page load, and the collapsed state SHALL NOT be persisted.
  [user: accepted SG3, 2026-10-05]
- AC-30: WHEN the user activates the copy control of a run command, the system
  SHALL copy exactly that command's text to the clipboard and confirm with a
  "Copied" toast. [user: accepted SG4, 2026-10-05]
- AC-31: WHEN the user activates Open on a file row, the system SHALL open that
  file on the repository's forge (GitHub or GitLab, honouring a self-managed
  base URL and path prefix) at the commit the tour was built from, in a new
  tab. [user: accepted SG1, 2026-10-05]
- AC-32: WHEN the user activates Share link, the system SHALL copy the deep
  link to this repo's tour page in the studio to the clipboard and confirm with
  a "Link copied" toast, without creating any new public or unauthenticated
  route. [user: accepted SG4, 2026-10-05]
- AC-35: The system SHALL render the Architecture overview diagram from the
  section's mermaid diagram, styled as the design's box diagram, and SHALL show
  a diagram in no other section. [user: accepted SG2, 2026-10-05]
- AC-36: WHILE the Generate or Regenerate action is offered, the system SHALL
  show the provider and model that the call will use.
  [user: accepted SG8, 2026-10-05]
- AC-37: WHEN a section is shown as "not available", the system SHALL name its
  cause (language not indexed, index failed, or model call failed) and, where
  one applies, offer the next step: re-sync the repo for an index cause, or
  Settings → Models for a model cause. [user: accepted SG9, 2026-10-05]

Untrusted content
- AC-33: The system SHALL pass repository content and collected facts to the
  LLM as delimited untrusted data, and instructions found inside them SHALL NOT
  change the system's behaviour or the output's shape.
- AC-34: The system SHALL render LLM-produced text as Markdown only, without
  raw HTML, scripts or embeds, and SHALL strip Markdown image syntax from it
  so that no remote image (e.g. a tracking pixel) is loaded.
  [user: plan 26 cross-model review X15, 2026-10-05]

## Edge cases

- **Repo far past the index cap** (design: 12,450 files): a tour is generated
  from the partial index and labelled per AC-23, counting source files of the
  indexed languages only; the LLM still gets bounded
  facts only (AC-10).
- **Non-JS/TS repo**: no import graph; AC-7 applies.
- **Empty repo or a repo with no manifest/scripts**: How to run locally shows
  "no run scripts found" instead of invented commands; the command allowlist
  (AC-16) removes any invented or injected command (e.g. `curl … | sh` taken
  from a README).
- **Not cloned / cloning / clone failed**: AC-20, AC-21.
- **Index degraded, partial, failed, or repo-intel switched off**: AC-8, AC-22.
- **No API key or no model for the `onboarding` feature**: AC-18.
- **LLM cites only invented paths**: every reference is dropped (AC-14,
  AC-15); a section left empty shows as not available rather than blank.
- **Prompt injection in a README, code comment or file name**: AC-33.
- **Double click on Generate, or two tabs**: AC-13.
- **Re-index finishes while a generation runs**: the tour is stored with the
  commit it was built from and AC-27 marks it stale if the index moved.
- **Regenerate fails after an earlier success**: AC-19.
- **Repo deleted**: its stored tour goes with it.

## Non-functional requirements

- **Cost:** at most one paid LLM call per explicit Generate/Regenerate (AC-9,
  AC-12, AC-13); the model input is bounded regardless of repo size (AC-10).
- **Performance:** opening the page never waits on an LLM call; the stored tour
  or the deterministic skeleton is shown from the index and stored data.
- **Reliability:** generation is bounded by the existing LLM-call timeout and
  reasoning caps; a hung or failed call ends in AC-18, never a spinner forever.
- **Security:** the API is reachable from the LAN without auth (server
  gotcha), so Generate is a paid side effect any LAN peer can trigger, the same
  exposure as starting a review; no new route returns secrets or file contents
  outside the tour. Untrusted content per AC-33/AC-34.
- **Accessibility / i18n:** UI copy comes from the client's i18n messages, like
  every other page.

## Inputs and provenance

- Repo identity, default branch, clone path — [reused: `Repo` contract, `@devdigest/shared` platform contracts]
- Index status, files indexed/skipped, last indexed commit, degraded reason — [reused: repo-intel `getIndexState`, `GET /repos/:id/index-state`]
- Ranked file paths for the reading path — [reused: repo-intel `getTopFilesByRank` over `file_rank` (PageRank, hotness 0)]
- Critical-path chains — [reused: repo-intel `getCriticalPaths` over `file_edges` + `file_rank`]
- Routes/endpoints per file — [reused: repo-intel `file_facts`]
- Stack, top-level structure, run scripts, env-example and compose presence — [deterministic: repo clone on disk (manifests, top-level tree)]
- Repository file contents and file names read for the facts — [external: cloned repository content]
- Model choice for the call, also shown next to Generate — [reused: `FEATURE_MODELS` entry `onboarding`, Settings → Models override]
- Forge file link for Open (provider, base URL with path prefix, owner/name, build commit) — [reused: `Repo` contract `provider`/`api_base`/`full_name` + stored tour's build commit]
- Section prose, diagram, reading reasons, critical-path reasons, run-step wording, first tasks — [llm: onboarding structured call]
- Generate / Regenerate / Share link / Open / copy actions — [user: Onboarding Tour page]
- Stored tour and its build commit — [deterministic: stored tour for the repo]

## Untrusted inputs

- **[external] cloned repository content** (READMEs, manifests, scripts, code,
  comments, file and directory names): data, never instruction; passed to the
  LLM only inside untrusted delimiters (AC-33).
- **[llm] onboarding structured call output**: data, never instruction;
  validated against the section shape, grounded against the index (AC-14 to
  AC-17), run commands restricted to an allowlist (AC-16), rendered as
  Markdown without HTML or images (AC-34); fallback AC-18/AC-19.
- **[user] page actions** (Generate, Regenerate, Share link, Open, copy): carry
  only the repo id from the route; no free text reaches the LLM.

## Module interactions

- **`@devdigest/shared`** (`server/src/vendor/shared`, mirrored in
  `client/src/vendor/shared`): an `Onboarding` contract already exists in the
  knowledge contracts (sections with kind, title, Markdown body, mermaid
  diagram, links). The tour needs structured per-section data (file rows with a
  reason, ordered commands, ordered reading steps, tasks with file refs) plus
  status, coverage, build commit and refresh time; whether that contract is
  extended or replaced is a planning decision. `DegradedReason` and the
  `onboarding` `FEATURE_MODELS` entry ("Onboarding Tour") already exist; this
  spec does not change the entry's default model.
- **server**: reads through the repo-intel facade only (`getIndexState`,
  `getTopFilesByRank`, `getCriticalPaths`, file facts), never the indexing
  pipeline; resolves the model through the feature-model settings; uses the
  existing `onboarding.system.md` prompt, which already marks untrusted blocks;
  stores one tour per repo in the existing `onboarding` table (deleted with the
  repo); re-sync of an existing clone uses the existing
  `POST /repos/:id/resync`, while Re-clone after a failed clone uses the
  existing `POST /repos/:id/refresh`, which re-queues the clone
  [user: plan 26 GAP1, 2026-10-05]. Clone state comes from the repo record and
  its clone job.
- **client**: a new repo-scoped page under the repo routes; one WORKSPACE nav
  item added to `vendor/ui/nav.ts`, the sanctioned vendored edit, recorded here
  and commented on the line (a vendor refresh drops it). The shell's
  active-item mapping currently matches any path containing `/onboarding` to
  `onboarding-tour`, which AC-2 forbids for the Add-repository page.
- **reviewer-core**: not touched.
- **mcp-server**: not touched (Non-goals).

## Open questions

_None._

## Changelog

2026-10-05 · all · approved (B1–B8 recommended options; SG1–6, SG8, SG9 accepted, SG7 rejected; AC-13/16/17/19 confirmed) · user approval after pass 2 · user
2026-10-05 · AC-5, AC-6, AC-11, AC-15, AC-21, AC-23, Module interactions, Edge cases · Re-clone via /refresh; coverage denominator = indexed-language source files; surviving tasks shown with a note; deterministic skeleton reasons · plan 26 GAP1–4 · user
2026-10-05 · AC-16, AC-34, Edge cases, Untrusted inputs · run-command allowlist; strip Markdown images from LLM text · plan 26 cross-model review X4/X15, user-approved · user
2026-10-05 · AC-16 (implementation note, no wording change) · the two-token `<pm> <script>` form is kept only for `start`/`test`; other scripts must use `<pm> run <script>`, and package dirs must match `^[A-Za-z0-9_][A-Za-z0-9._-]*$` — narrower than the allowed-forms list, so a script named like a package-manager builtin or an option-like dir can never be suggested · plan 26 review 1 (M1, SF1, SF3), user-approved · user
2026-10-05 · all · implemented via plan 26 (G1–G6, T1, T2, review-1 fixes F1x + SF3/F5, verifier fixes) · plan verification complete, user browser sign-off · user
