# Spec: Agent versions tab
Spec ID: SPEC-12
Status: implemented
Supersedes: none

## Problem & user

A developer who tunes a review agent changes its system prompt, model, strategy and
attached skills over many edits. Each config change already produces a numbered
version, and eval runs are scored against those numbers, but the agent editor never
shows that history. The user cannot see what changed between the version an eval run
scored and the current one, cannot read why a change was made, and cannot go back to
an earlier config except by promoting an eval run (spec 011, AC-54…AC-57). Skills
already have this in the skill editor's Versions tab; agents do not.

Two gaps in today's versioning make any history view unreliable: editing the
attached skill set in the Skills tab does not create a version, so a version's
recorded skill set can be stale; and editing only the name or description creates a
version whose recorded config is identical to the previous one.

## Goals / Non-goals

**Goals**

- A "Versions" tab in the agent editor with the same functions as the skill
  editor's Versions tab: history newest-first, a Current marker, a diff against the
  current version, and Restore behind a confirmation.
- The diff covers the whole recorded config and the skill set, not only the prompt.
- Restore behaves like eval Promote: it appends a new version, never rewrites one.
- Every version can carry a short message saying what changed.
- Versioning rules change so that every version reflects a real change of config
  or skill set (behaviour changes to existing versioning, see AC-22…AC-24).
- The agent's Skills tab saves with an explicit Save, so one save is at most one
  version and carries its note (AC-33, AC-34).
- Every agent has a recorded snapshot of its current version, and snapshots name
  their skills, so history stays readable after skills are deleted (AC-30…AC-32).

**Non-goals**

- Toggling `enabled` does not create a version and does not appear in history.
- Attached context documents are not part of a version, are not diffed and are not
  restored.
- Diffing any two arbitrary versions; the diff is always "selected version → current".
- Showing, per version, the eval runs that scored it.
- MCP tools for agent versions.
- Pinning skills to a version: a restored skill uses its latest content (as with
  Promote, spec 011 AC-56).
- Overwriting or deleting a past version.
- Changing how eval Promote works (spec 011 AC-54…AC-57, AC-75, AC-80); it only
  gains an automatic message (AC-26).

## User stories

- As an agent author, I want to see every version of my agent with its date and a
  message, so that the history reads as a changelog.
- As an agent author, I want to compare an older version with the current one,
  including model, strategy and skills, so that I can tell what caused a change in
  review quality.
- As an agent author, I want to restore an earlier version as a new version, so that
  I can undo a bad change without losing the history eval runs depend on.
- As an agent author, I want to write a note when I save a change, so that I later
  know why I made it.

## Acceptance criteria (EARS)

### Tab and list

- **AC-1** The system SHALL provide a "Versions" tab in the agent editor, alongside
  Config, Skills, Context and Evals, linkable through the editor's tab parameter.
  [user: feature request, 2026-10-12]
- **AC-2** The system SHALL list the agent's recorded versions newest first, each
  with its version number, its message, and its creation date. A version number that
  was never recorded SHALL NOT be listed.
  [user: feature request, 2026-10-12; user: answer to plan-37 GAP3, 2026-10-12]
- **AC-3** The system SHALL mark the agent's current version as "Current" and SHALL
  offer Diff and Restore on every other version.
  [user: feature request, 2026-10-12]
- **AC-4** IF a version has no message, THEN the system SHALL show a "no message"
  placeholder in its place. [user: answer to B7, 2026-10-12]
- **AC-5** WHILE the version list is loading, the system SHALL show a loading
  placeholder, and IF loading fails, THEN the system SHALL show an error with a retry.
- **AC-6** WHILE the agent has only one version, the system SHALL show that version
  and a note that a diff and restore become available after the next change.

### Diff

- **AC-7** WHEN the user clicks Diff on a version, the system SHALL show the
  difference between that version and the current version, and nothing else.
  [user: answer to B2, 2026-10-12]
- **AC-8** The system SHALL show the system-prompt change as a line diff, rendered
  like a code diff in the PR viewer. [user: answer to B1, 2026-10-12]
- **AC-9** The system SHALL show, for each of provider, model, strategy, CI fail-on
  threshold, repo-intel setting and output schema that differs, the old and the new
  value. [user: answer to B1, 2026-10-12]
- **AC-10** The system SHALL show the skill-set change as skills added, skills
  removed, and a changed order, naming each skill. [user: answer to B1, 2026-10-12]
- **AC-11** IF a skill recorded in either version no longer exists, THEN the system
  SHALL still list it in the diff, by the name recorded on the version, and mark it
  as deleted (AC-32 when no name was recorded).
  [user: answer to plan-37 GAP2, 2026-10-12]
- **AC-12** IF the two versions have no difference in any field covered by AC-8…AC-10,
  THEN the system SHALL say that the versions are identical.
- **AC-13** IF the diff cannot be loaded, THEN the system SHALL show an error with a
  retry inside the diff view.

### Restore

- **AC-14** WHEN the user clicks Restore on a version, the system SHALL ask for
  confirmation, naming the version, stating that it becomes a new current version and
  that no existing version changes, and listing the skill set that will be restored.
  [user: answer to B5, 2026-10-12]
- **AC-15** WHEN the user confirms a restore, the system SHALL write a new version
  whose config is a copy of the selected version's recorded config, SHALL set the
  agent's attached skills to the selected version's recorded skill set in its
  recorded order, and SHALL make the new version current, leaving every existing
  version unchanged. Skills come back with their latest content. This SHALL be
  consistent with eval Promote (spec 011 AC-56). [user: answer to B5, 2026-10-12]
- **AC-16** IF a skill recorded on the selected version no longer exists, THEN the
  system SHALL name it in the confirmation (AC-14), by its recorded name or as in
  AC-32, and SHALL restore the remaining skills without it, as eval Promote does
  (spec 011 AC-80).
  [user: answer to B5, 2026-10-12; user: answer to plan-37 GAP2, 2026-10-12]
- **AC-17** IF the selected version's recorded config is missing or malformed, THEN
  the system SHALL show "config unavailable" for that version in the list and the
  diff, and SHALL refuse its restore and say why, as eval Promote does (spec 011
  AC-57). [user: plan-37 TQ default, 2026-10-12]
- **AC-18** IF the selected version's provider has no API key configured, or its
  model is not among the provider's offered models, THEN the system SHALL restore it
  anyway and the confirmation SHALL warn which provider lacks a key or which model is
  unknown. [user: answer to B6, 2026-10-12]
- **AC-19** WHILE a restore is in progress, the system SHALL disable every Restore
  action in the tab.
- **AC-20** WHEN a restore completes, the system SHALL refresh the version list and
  the agent's config, skills and version shown everywhere in the editor.
- **AC-21** IF the agent was changed by another action between the confirmation and
  the restore, THEN the system SHALL still restore the selected version as a new
  version on top of the latest one, never overwriting or skipping a version number.

### Versioning rules (behaviour changes to existing versioning)

- **AC-22** WHEN the user saves a change to the agent's attached skill set (attach,
  detach or reorder) with the Skills tab's Save (AC-33), the system SHALL create
  exactly one new version recording the new skill set and the unchanged config,
  however many edits the Save carries. IF the saved ordered list of skills equals the
  current one, THEN the system SHALL create no version. Today such a change creates
  no version at all.
  [user: answer to B3, 2026-10-12; user: answer to plan-37 GAP1, 2026-10-12]
- **AC-23** WHEN the user changes only the agent's name or description, the system
  SHALL NOT create a version. Today such a change creates one.
  [user: answer to B4, 2026-10-12]
- **AC-24** WHEN only `enabled` is toggled, or only the attached context documents
  change, the system SHALL NOT create a version (unchanged behaviour).
  [user: answer to B3, 2026-10-12]

### Messages

- **AC-25** WHERE a Config tab save or a Skills tab Save (AC-33) would create a
  version, the system SHALL offer an optional "what changed" note beside that Save
  and SHALL store it as that version's message.
  [user: answer to B7, 2026-10-12; user: answer to plan-37 GAP1, 2026-10-12]
- **AC-26** WHEN a version is created by a restore, an eval Promote, or a built-in
  agent sync, the system SHALL store an automatic message naming its origin
  ("Restored from vN", "Promoted vN from an eval run", "Synced built-in prompt").
  [user: answer to B7, 2026-10-12]
- **AC-27** The system SHALL keep versions created before this feature without a
  message (AC-4). [user: answer to B7, 2026-10-12]
- **AC-28** IF a message is longer than 500 characters, THEN the system SHALL reject
  the save and say so, keeping the user's edits.
  [user: answer to plan-37 GAP4, 2026-10-12]
- **AC-29** The system SHALL render a version message as plain text, never as markup
  or a link.

### Recorded history (added by plan-37 review)

- **AC-30** WHERE an agent has no recorded snapshot of its current version (for
  example a seeded agent), the system SHALL record that snapshot once, from the
  agent's current config and skill set, without changing its version number.
  [user: answer to plan-37 GAP3, 2026-10-12]
- **AC-31** WHEN the seed creates or updates an agent, the system SHALL record the
  snapshot of that agent's version. [user: answer to plan-37 GAP3, 2026-10-12]
- **AC-32** The system SHALL record, on every new version, the name of each attached
  skill beside its id; IF a recorded skill no longer exists and the version recorded
  no name for it, THEN the system SHALL show it as "Deleted skill · <short id>".
  [user: answer to plan-37 GAP2, 2026-10-12]

### Skills tab saving (added by plan-37 review)

- **AC-33** WHEN the user attaches, detaches or reorders skills in the agent's Skills
  tab, the system SHALL stage the change in the tab, mark the tab as having unsaved
  changes, and write nothing until the user clicks Save; Cancel SHALL discard every
  staged change and show the stored skill set again.
  [user: answer to plan-37 GAP1, 2026-10-12]
- **AC-34** IF the user leaves the Skills tab or the agent page while staged changes
  are unsaved, THEN the system SHALL ask whether to discard them, and SHALL keep the
  user on the tab with the changes intact unless the user confirms the discard.
  [user: answer to plan-37 GAP1, 2026-10-12]
- **AC-35** WHEN the user restores a version whose recorded config and skill set
  equal the current ones, the system SHALL still append a new version (AC-15).
  [user: plan-37 TQ default, 2026-10-12]

## Edge cases

- **Only one version** — AC-6.
- **Agent deleted while the tab is open** — list, diff and restore return "not found";
  the tab says the agent no longer exists.
- **Every recorded skill deleted** — restore proceeds with an empty skill set; the
  confirmation names all of them (AC-16).
- **Recorded config malformed or missing** — shown as "config unavailable", restore
  refused (AC-17).
- **Seeded agent with no snapshot** — its current version is recorded once (AC-30);
  version numbers never recorded stay out of the list (AC-2).
- **Skill deleted before names were recorded** — "Deleted skill · <short id>" (AC-32).
- **Skills tab: Save with nothing changed, or edits that return to the stored order**
  — no version (AC-22).
- **Skills tab: many edits, one Save** — one version (AC-22).
- **Skills tab: leaving with unsaved edits** — asked to discard (AC-34).
- **Restoring a version equal to the current one** — still appends (AC-35).
- **Output schema empty on the selected version** — handled as eval Promote handles
  it (the current schema is kept); the diff shows the schema as unchanged.
- **Provider without a key / unknown model** — restored with a warning (AC-18); a
  later run is refused by the existing missing-key rule (spec 011 AC-79).
- **Restore concurrent with an edit, a Promote or a sync** — each produces its own
  new version in order (AC-21); none is lost.
- **Two restores from two tabs** — two new versions, in order.
- **Very long system prompts** — the diff stays scrollable and shows only changed
  regions with context, like a code diff.
- **Many versions** (hundreds) — the list stays usable; newest first.
- **Old versions created by name/description edits** (before AC-23) — they stay in
  history; their diff against a neighbour shows "identical" (AC-12).

## Non-functional requirements

- **Integrity:** history is append-only; no action in this feature updates or
  deletes a past version (eval runs reference versions by number).
- **Atomicity:** a restore writes the new config, the skill set and the new version
  together or not at all.
- **Tenancy:** versions, diffs and restores are scoped to the caller's workspace;
  a restored skill set may contain only skills of that workspace.
- **Performance:** listing versions and loading one diff each respond within the
  same bounds as the skill Versions tab; the diff is computed for one pair at a time,
  on demand.
- **Accessibility and i18n:** all copy comes from the agents message namespace;
  every action is keyboard reachable, matching the skill Versions tab.

## Inputs and provenance

- Version history: number, recorded config, recorded skill set, date
  `[reused: agent_versions snapshots written by AgentsRepository.update]`
- Version message `[user: Config/Skills tab "what changed" note]`
- Automatic messages for restore, promote, sync `[deterministic: origin of the version]`
- Prompt line diff and field diff `[deterministic: computed from two recorded configs]`
- Skill names for the diff and confirmation `[deterministic: names recorded on the version (AC-32), else skills of the workspace looked up by recorded id]`
- Backfilled snapshot of an agent's current version `[deterministic: the agent's current config and skill set]`
- Restore semantics `[reused: spec 011 AC-56, AC-57, AC-80 — eval Promote]`
- Diff and restore UX pattern `[reused: spec 003 — skill editor Versions tab]`
- API-key presence and offered models `[reused: settings provider list and key check, spec 011 AC-79]`
- Recorded system prompts and skill names may originate from imported skills or
  built-in sync `[user: earlier agent and skill edits]`

## Untrusted inputs

- **Version messages** `[user]` — data, never an instruction; shown as plain text
  (AC-29), length-bounded (AC-28).
- **Recorded system prompts and skill names** `[user]` — data shown in the diff; never
  executed, never rendered as markup.
- No `llm` or `external` input is read by this feature. Cloned-repository content is
  not read.

## Module interactions

- **`@devdigest/shared`** — `AgentVersion` gains an optional message; the recorded
  config gains optional skill names beside the skill ids (older versions have none,
  AC-32); new contracts for a version diff (prompt patch, changed fields, skill-set
  change) and for a restore request (optional message) and its result; the
  skill-set save accepts an optional message (AC-25). Mirrored into the client's
  vendored copy.
- **server, agents module** — already serves the version list and a single version.
  Gains: a diff between a version and the current one, a restore that appends a new
  version, a message on save, and the versioning-rule changes AC-22…AC-24. Restore
  follows the same rules as the existing Promote path (append-only, skills limited to
  the workspace, missing skills dropped, malformed config refused). New snapshots
  record skill names (AC-32).
- **server, seed** — writes the snapshot of each agent version it creates (AC-31).
- **server, eval module** — Promote is unchanged except for its automatic message
  (AC-26). Suite runs keep recording the agent version and the skill set (spec 011
  AC-30, AC-75); with AC-22 a skill-set edit now also moves the agent version.
- **server, settings** — supplies the provider list, offered models and key presence
  for the warning in AC-18.
- **server, database** — `agent_versions` gains a nullable message column
  (migration); agents with no snapshot of their current version get one recorded
  once (AC-30).
- **client** — the agent editor gains the Versions tab; the Config tab gains the
  optional note; the Skills tab changes from saving on every edit to staged edits
  with Save, Cancel, the optional note and an unsaved-changes guard (AC-33, AC-34).
  Data comes through the client's hook layer.
- **mcp-server, reviewer-core** — not touched.

## Open questions

## Changelog
- 2026-10-12 · approved (B1–B8 by recommendation; Open questions empty) · user "так, затверджую, запускай дослідження"
- 2026-10-12 · reopened → draft for plan-37 GAP1–GAP4: Skills tab gets an explicit Save with an optional note (no per-click versions); pre-feature deleted skills shown as "Deleted skill · <short id>"; current-version snapshot backfilled for agents without one, never-recorded versions not listed; message max 500 characters · user "так, по рекомендаціях"
- 2026-10-12 · GAP1–GAP4 correction written (AC-2, 11, 16, 17, 22, 25, 28 reworded; AC-30–AC-35 added, AC-34 = ask before discarding unsaved Skills-tab edits); re-approved · user "так"
- 2026-10-12 · implemented via plan 37 (docs/plans/37-agent-versions.md): complete — needs sign-off, accepted by the user (R3; known limitations listed in the plan's Decisions recorded) · user "Закриваємо цей план і комітимо зміни"
