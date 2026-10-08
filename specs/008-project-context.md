# Spec: Project Context
Spec ID: SPEC-08
Status: implemented
Supersedes: none (extends [003 — Skills](003-skills.md), section "Project context attached to a skill")

## Problem & user

A reviewer agent only knows what is in the diff. The project's specs, docs and
insights describe invariants the diff can break, such as "module `api/` does not
import `db/` directly". The agent never sees them unless the user pastes them into
a skill body by hand.

Spec 003 already lets a user attach project documents to a **skill**. A run then
injects those documents into the prompt as untrusted data. Four things are still
missing:

- The user has no place to browse the project's documents.
- The user cannot attach a document to an **agent** directly.
- The user cannot see what a document costs in tokens before attaching it.
- Documents are only found in three top-level folders. Package-level folders such
  as `server/specs/` are never found.

The affected users are the developers who configure DevDigest agents and skills
for a repository.

## Goals / Non-goals

**Goals**
- A **Project Context** page that lists the active repo's Markdown documents and
  previews each one. It shows each document's token cost and how many agents use it.
- A **Context** tab in the agent editor for attaching, ordering and previewing
  documents. Documents inherited through the agent's skills are visible there.
- The skill editor's Context tab (from 003) shows token counts and the "used by"
  figure.
- **Per-repo search roots** (globs) that the user can change, with the default
  `**/{specs,docs,insights}/**/*.md`.
- Run transparency: the trace lists the documents that were read and the ones that
  were skipped, plus the block's token cost. The Prompt Assembly block is labelled
  "Project context — attached specs (untrusted)".
- A reviewer can name the document it relies on, because each injected document is
  labelled with its repo path.

**Non-goals**
- **Editing documents.** The page is view-only. The Edit toggle and the new-file,
  new-folder and upload buttons in the design are out of scope. The clone is a
  read-only mirror that every sync hard-resets, so an edit would be silently lost
  and would never reach the forge. [user: answer to editing question, 2026-10-05]
- Automatic selection of relevant documents from the PR's content. This is a
  separate, later feature.
- A coverage percentage or ring. The header shows only an agent count.
  [user: requirements, 2026-10-05]
- A new skill version when a skill's attached documents change. [user: requirements, 2026-10-05]
- A structured "source document" field on findings. A citation lives in the
  finding text. [user: answer to B6, 2026-10-05]
- Chunking or embedding documents. A document is injected whole.
- A git sync triggered from the Project Context page. Refresh only re-scans the
  clone. [user: answer to B8, 2026-10-05]
- Documents in a format other than Markdown (`.md`).

## User stories

- As a developer, I want to browse my repo's specs, docs and insights in DevDigest,
  so that I can see what context exists without leaving the studio.
- As a developer, I want to attach chosen documents to an agent and order them, so
  that the agent reviews PRs against my project's own rules.
- As a developer, I want a skill to carry documents that every agent using it
  inherits, so that I attach a shared rule once.
- As a developer, I want to see each document's token cost and the running total
  while I select, so that I know how much each review's prompt will grow.
- As a developer, I want to choose where DevDigest looks for documents in my repo,
  so that documents outside the default folders can be attached.
- As a developer, I want the run trace to show exactly which documents were read
  and skipped, and their full injected text, so that I can trust and debug a review.

## Acceptance criteria (EARS)

**Search roots**
- AC-1: The system SHALL keep a list of search-root globs for each repo. The default
  is `**/{specs,docs,insights}/**/*.md`.
- AC-2: WHEN the user saves a repo's search roots, the system SHALL validate every
  glob before storing it. It SHALL reject the whole save with a message naming the
  offending glob if any glob is absolute, contains a `..` segment or a NUL byte, or
  can match files that do not end in `.md`.
- AC-3: IF the user saves an empty list of search roots, THEN the system SHALL
  reject the save and keep the previous list.
- AC-4: WHEN the user resets the search roots, the system SHALL restore the default
  glob.

**Discovery and listing**
- AC-5: WHEN the documents of a repo are listed, the system SHALL return every
  regular `.md` file in that repo's clone that matches at least one of the repo's
  search roots. Results are sorted by path. There is no depth limit: the listing is
  bounded only by a cap of 20,000 visited entries and a cap of 500 documents, and it
  is marked truncated when either cap is hit. [user: plan 25 D3, 2026-10-05]
- AC-6: The system SHALL give each listed document a type. The type is the name of
  the nearest ancestor folder called `specs`, `docs` or `insights`; if there is
  none, the type is `other`.
- AC-7: WHEN the documents of a repo are listed, the system SHALL return each
  document's token count. The count is computed with the server's tokenizer. It is
  not persisted, and it may be cached in memory per path, mtime and size. [user:
  answer to plan 25 GAP1, 2026-10-05]
- AC-8: The system SHALL return a document's full text only through a single-document
  request. A listing SHALL NOT contain document bodies.
- AC-9: IF a requested or stored document path does not match the repo's current
  search roots, THEN the system SHALL refuse it as a validation error (not as "not
  found").
- AC-10: IF a requested document path resolves outside the repo clone after symlinks
  are resolved, THEN the system SHALL refuse it as a validation error.
- AC-11: WHILE a repo has no clone on disk yet, the system SHALL return an empty
  document list rather than an error.

**Project Context page**
- AC-12: The system SHALL offer a Project Context entry in the workspace navigation.
  It opens the Project Context page for the active repo.
- AC-13: WHEN the user selects a document on the Project Context page, the system
  SHALL render its Markdown content as a read-only preview.
- AC-14: WHEN a document is shown on the Project Context page, the system SHALL show
  "Used by N agents". N is the number of distinct agents in the workspace that have
  the document attached directly or through one of their enabled skills. A disabled
  agent is counted, because its configured links count. An agent whose only link to
  the document goes through a disabled skill is not counted. The count is carried
  on the single-document response. [user: answer to GAP1, 2026-10-05]
- AC-15: The system SHALL show a footer on the Project Context page with the number
  of listed documents, the sum of their token counts and the repo's last sync time.
- AC-16: WHEN the user presses Refresh on the Project Context page, the system SHALL
  list the documents again from the clone without fetching from the forge.
- AC-17: The system SHALL let the user view, edit and reset the active repo's search
  roots from the Project Context page.
- AC-18: The system SHALL offer no way to modify, create or upload a document file.

**Agent Context tab**
- AC-19: The system SHALL provide a Context tab in the agent editor. It lists the
  active repo's documents, each with a checkbox, path, type, token count and a
  Preview action.
- AC-20: WHEN the user checks or unchecks a document on the agent Context tab, the
  system SHALL store or remove that document's repo-relative path on the agent. It
  SHALL NOT store the document's text.
- AC-21: WHEN the user drags an attached document to a new position on the agent
  Context tab, the system SHALL store the new order of the agent's attached documents.
- AC-22: The system SHALL show on the agent Context tab the documents the agent
  inherits through its enabled skills, marked "via <skill name>" and not toggleable.
- AC-23: The system SHALL show on the agent Context tab the number of attached
  documents out of the number listed. It SHALL also show an approximate ("≈") token
  total covering the agent's own and inherited documents, each counted once.
- AC-24: WHEN the user types in the agent Context tab's filter, the system SHALL show
  only documents whose path contains the typed text, case-insensitively.
- AC-25: IF an agent's attached path is not among the active repo's documents, THEN
  the system SHALL keep it attached and show it marked "not in this repo".
- AC-26: IF a request attaches documents to an agent outside the caller's workspace,
  THEN the system SHALL reject it as not found.

**Skill Context tab (extends 003)**
- AC-27: The system SHALL show on the skill Context tab each document's token count,
  the attached documents' token total, and the number of agents that have the skill
  attached. Disabled agents are counted. The count is carried on the skill context
  response. [user: answer to GAP1, 2026-10-05]
- AC-28: WHEN the user changes a skill's attached documents, the system SHALL NOT
  create a new skill version.
- AC-29: The system SHALL show the skill Context tab's "Serializes as" summary under
  the heading `## Project context`.

**Run assembly**
- AC-30: WHEN an agent run starts, the system SHALL build the run's documents in this
  order: first the agent's own documents in their stored order, then the documents
  of each of its enabled skills in skill order, each skill's documents in their
  stored order. A path that occurs more than once is included only at its first
  position.
- AC-31: WHEN an agent run starts, the system SHALL read every document in that list
  from the PR's repo clone, through the same path checks as AC-9 and AC-10. It SHALL
  inject their text under `## Project context` as untrusted, delimited data, with the
  existing injection guard in force. No extra LLM call is made.
- AC-32: The system SHALL label each injected document with its repo-relative path
  inside the untrusted delimiter.
- AC-33: IF an attached document is missing from the PR's repo, is refused by the
  path checks, or is over the size limit, THEN the system SHALL skip it, continue the
  run, and record its path and reason in the run log and in the run trace.
- AC-34: IF no attached document could be read, THEN the system SHALL omit the
  `## Project context` section from the prompt.
- AC-35: WHEN a run completes, the system SHALL record in the trace the paths that
  were read, in injection order (`specs_read`), the skipped paths with their reasons,
  and the token count of the project-context block.

**Run trace UI**
- AC-36: The system SHALL show the read documents in the run trace's Configuration
  under "Specs read", and any skipped documents with their reasons beside them.
- AC-37: WHERE a run's prompt contains a project-context block, the system SHALL show
  a Prompt Assembly section labelled "Project context — attached specs (untrusted)"
  with its token count. The section expands to the full injected text and offers copy.

## Edge cases

- **Repo not cloned yet:** the listing is empty and the page shows an empty state
  (AC-11). Runs skip every document (AC-33).
- **Repo with no matching documents:** the page and tabs show an empty state that
  points to the search-roots setting.
- **Very deep trees:** no depth limit applies, so a deeply nested document is both
  listed and readable.
- **Over 500 matches, or a very large clone (over 20,000 visited entries):** the
  listing is truncated at whichever cap is hit first, and the page says the list is
  truncated.
- **Document larger than 512 KB:** the preview refuses it. A run skips it with reason
  "too large" (AC-33).
- **Committed symlink inside a root:** it is not listed. If its path is requested, it
  is refused when it resolves outside the clone (AC-10).
- **Search roots changed after documents were attached:** an attached path that no
  longer matches stays attached. At run time it is skipped with reason "outside
  search roots" (AC-9, AC-33).
- **The same path attached directly and through a skill:** it is injected once, at
  its first position, and counted once in the total (AC-23, AC-30).
- **A disabled skill:** its documents are neither injected nor shown as inherited.
- **Workspace with several repos:** attachments are stored as repo-agnostic paths.
  The tabs show the active repo's view (AC-25), and a run resolves the paths against
  the PR's own repo.
- **Document renamed or deleted upstream after a sync:** the next run skips it
  (AC-33). The tabs show it as "not in this repo".
- **Two tabs saving the agent's attachments at once:** the last save wins. Each save
  replaces the whole ordered set.
- **Non-UTF-8 or binary content in a `.md` file:** it is read as text. The tokenizer
  count and the preview may look wrong, but nothing fails.
- **Huge total context:** no cap. The ≈ total on the tabs is how the user sees the
  cost.

## Non-functional requirements

- **Performance:** listing a repo with 500 documents, including token counts, should
  complete within about 2 s on a developer machine. If measurements show it does not,
  the token count may fall back to a size-based estimate (bytes ÷ 4), still shown as
  "≈". [user: answer to B5, 2026-10-05]
- **Security:** every file read, whether from a listing, a preview or a run, goes
  through one path guard. The guard accepts exactly what the configured globs match,
  stays inside the clone on a separator boundary, and re-checks after realpath with
  both sides resolved. A refusal is a 422, never a 404. The routes are reachable from
  the LAN, so the search-roots setting and the attach endpoints are scoped to the
  workspace.
- **Cost:** adding project context makes no extra LLM call. The prompt grows by the
  token cost shown.
- **Determinism:** the injected block's order is fully determined by the stored orders
  (AC-30).

## Inputs and provenance

- Skill-level attachments, the repo document reader, the path guard, run injection,
  `specs_read` / `specs_tokens` and the trace drawer's specs block —
  [reused: specs/003-skills.md, "Project context attached to a skill"]
- Search-root globs per repo — [user: Project Context page search-roots setting]
- Agent's attached paths and their order — [user: agent editor Context tab]
- Skill's attached paths and their order — [user: skill editor Context tab]
- Document list and file contents — [deterministic: repo working clone on disk] (repo
  content, untrusted)
- Document type — [deterministic: nearest `specs`/`docs`/`insights` ancestor folder of
  the path]
- Token counts — [deterministic: server tokenizer adapter; not persisted, may be
  cached in memory per path, mtime and size]
- "Used by N agents" — [deterministic: agent and skill attachment records in the DB]
- Repo last sync time — [deterministic: repo record]
- Agent's enabled skills and their order — [reused: specs/003-skills.md, agent skills
  links]

No `llm` or `external` input is added by this feature.

## Untrusted inputs

- **Search-root globs** `[user]`: data only. They are validated (AC-2, AC-3) and can
  never widen reads beyond `.md` files inside the clone.
- **Attached paths, for agents and skills** `[user]`: a stored path is a request that
  was saved. It goes through the same guard at every read (AC-9, AC-10, AC-31).
- **Filter text** `[user]`: used only to match paths on the client.
- **Document contents** (cloned-repo content): data, never instruction. They are
  wrapped in untrusted delimiters under `## Project context`, with the injection guard
  in force (AC-31). In the studio they are rendered as Markdown without executing
  scripts or raw HTML.
- **Document paths and file names** (cloned-repo content): the label inside the
  delimiter (AC-32) is data. A file name that imitates an instruction or a delimiter
  must not escape the wrapper.

## Module interactions

- **`@devdigest/shared`** (`server/src/vendor/shared`, mirrored to
  `client/src/vendor/shared`):
  - the document listing contract (today `SpecFile`) gains a type and a token count;
  - new contracts for a repo's search roots and for agent context links (alongside
    the existing `SkillContextLink`);
  - `RunTrace` gains the skipped documents with their reasons, beside `specs_read`
    and `PromptAssembly.specs_tokens`;
  - "used by" counts: the per-document count goes on the single-document response
    (AC-14) and the per-skill count on the skill context response (AC-27). The agent
    context response carries no "used by" count.
- **server**:
  - the `context` module (`GET /repos/:id/context`, `GET /repos/:id/context/doc`)
    moves from its fixed three-folder allowlist to the repo's configured globs, and
    exposes reading and writing the search roots;
  - the `agents` module gains read and replace endpoints for the agent's ordered
    context paths, like `GET/PUT /skills/:id/context`;
  - the `skills` module's context endpoints add counts;
  - the run executor's existing project-context step merges agent and skill documents
    (AC-30) and records the skips in the trace.
- **reviewer-core**: `assemblePrompt` keeps its `specs` slot and its untrusted
  wrapping. Each document's label carries its repo path instead of a positional
  `spec-N` (AC-32). The package stays pure, because the server passes the path
  together with the text.
- **client**:
  - a new Project Context route, scoped to the active repo, plus a nav item (the one
    sanctioned edit to `client/src/vendor/ui/nav.ts`, recorded here);
  - a new agent editor `context` tab;
  - additions to the skill Context tab;
  - in the run trace drawer, the relabelled Prompt Assembly block and skipped
    documents in Configuration.
- **mcp-server**: not affected.

## Open questions

(none)

## Changelog

2026-10-05 · all · approved (SG1–SG3 and no token cap accepted) · user approval after pass 2 · user
2026-10-05 · Acceptance criteria (AC-14, AC-27), Module interactions · "Used by" counts: disabled agents counted, disabled-skill-only links not; no count on the agent context response · GAP1/TQ5 from plan 24 pass 1 · user
2026-10-05 · all · implemented via plan 24 (G1–G7, review iteration 1, e2e flow 12 for AC-21) · plan verification complete, user sign-off on unrun CI workflow · user
2026-10-05 · Edge cases (clarification, no behaviour change) · search roots under dot-directories (e.g. .github/**/*.md) list and read nothing — deliberate (picomatch dot:false + SF1 dot-segment rule) · plan 24 follow-up, user decision · user
2026-10-05 · Acceptance criteria (AC-7), Inputs and provenance · token count "not persisted; may be cached in memory per path, mtime and size" (was "computed at that moment … not stored") · plan 25 GAP1, user approved the wording · user
2026-10-05 · Acceptance criteria (AC-5), Edge cases · no walk depth limit; listing bounded by 20,000 visited entries and 500 documents, truncated when either is hit; deep docs listed and readable · plan 25 D3, user approved · user
2026-10-05 · all · implemented again via plan 25 (hardening: token cache, entry-bounded walk, canonical paths + data migration 0023, glob shape caps, error states) · plan 25 verification complete · user
