---
status: active
packages: server, client
---

# 003 — Skills: a reusable library of review rules, with its own editor

## Problem

A reviewer agent today is a model plus one system prompt. Every rule it applies
has to live inside that prompt, which means a rule two agents share gets written
twice and drifts, and a rule you want to try on one PR has to be pasted in and
pasted back out.

The product already believes otherwise. The `skills`, `skill_versions` and
`agent_skills` tables were created in migration `0000`. The `Skill`,
`SkillType`, `SkillSource` and `AgentSkillLink` contracts exist in
`shared`. `GET /agents/:id/skills` and `POST /agents/:id/skills` are implemented
and registered. `assemblePrompt` has a `skills` slot that renders a
`## Skills / rules` section (`reviewer-core/src/prompt.ts:88-109`), the run trace
carries `PromptAssembly.skills`, and the trace drawer already has a panel for it
(`TraceBody.tsx:76-94`). The whole client-side copy is written
(`client/messages/en/skills.json`).

Not one of those things is reachable. There is no `skills` module on the server,
so the tables are empty and `POST /agents/:id/skills` can only fail on the
foreign key. There is no `/skills` page. And `run-executor.ts:190` never passes
`skills`, so the prompt section is always omitted and the trace panel always
renders `null`.

The `specs` slot is dead in the same way. `assemblePrompt` renders a
`## Project context` section from `parts.specs`, and `RunTrace.specs_read` is
declared for the paths that fed it — but `run-executor.ts` passes neither, so
the section has never appeared in a real prompt.

And nothing records what a skill DID. A run's trace keeps the rendered skill
text as one blob, which cannot be matched back to a skill once its body is
edited, so there is no way to ask "is this rule pulling its weight?" — which is
the question a library of rules exists to answer.

This spec connects what is already built and fills the holes in the middle:
skills CRUD, the editor, the documents a skill carries, and the record of what
each run pulled.

## Scope

- A **skills module** on the server: list / read / create / update / delete,
  workspace-scoped, with body changes versioned into `skill_versions`.
- A **Skills page** (`/skills`): a card grid (name, type, description, enabled
  toggle) with a side preview that renders the body as markdown and can edit it.
- A **skill editor**: name, description, type, markdown body. The description
  field is labelled as what it is — the skill's *interface*, written
  imperatively, because it is what tells an agent when the skill applies.
- **Import** a skill from a `.md` file, a `.zip` archive, or a URL, through a
  **preview that must be confirmed before anything is stored**. Executable parts
  of an archive are never unpacked to disk, never run, and are listed in the
  preview as ignored.
- A **Skills tab in the agent editor**: attach / detach, and reorder. Order is
  the order the blocks appear in the assembled prompt.
- **Skills reach the model.** The run executor resolves the agent's attached,
  enabled skills in order and passes their bodies to `reviewPullRequest`, so the
  `## Skills / rules` section and the trace panel light up.
- The trace shows **how many tokens the skills block added**.
- Two new built-in reviewers — **Test Quality Reviewer** and **API Contract
  Reviewer** — each seeded with its own skills, so the "without skills it misses
  it, with skills it flags it" experiment is reproducible on both.

**Not in scope.** The community-skill catalogue (the `CommunitySkill` contract
and the drawer's third tab stay unused). The Conventions extractor and anything
that produces `source: 'extracted'`. Per-agent enable separate from attach:
attaching *is* enabling, and the skill's own `enabled` flag is the global off
switch. Any relationship to the repo-root `skills-lock.json`, which is Claude
Code developer tooling and not this feature. Plus, specifically:

- **Attributing a finding to a skill.** The model is not asked which rule fired,
  because that would change the response contract and give the model a second
  job while it is doing the first. Every Stats figure but "used by" is therefore
  measured over the runs whose prompt CONTAINED the skill — correlation, and the
  screen has to say so.
- **Running evals.** `eval_cases.owner_kind = 'skill'` stays unused and the
  Evals tab stays a placeholder.
- **Indexing context documents into embeddings.** `code_chunks` stays empty;
  documents are read from the clone on demand.
- **Attaching documents to an agent directly** — a document reaches a prompt
  only by being attached to a skill the agent uses.

## Design

### Trust: why an imported body is NOT wrapped in `<untrusted>`

Every other externally-derived block in the prompt goes through
`wrapUntrusted()`. Skills deliberately do not, and the reason needs recording
because the opposite looks safer at a glance.

`INJECTION_GUARD` tells the model that everything inside `<untrusted>` is data
and that instructions found there must be ignored. A skill's entire purpose is to
*be* an instruction. Wrapping one would not harden it — it would neutralise it,
and an imported skill would silently do nothing at all.

So the control is human review, not markup:

| Rule | Where |
|---|---|
| Any import lands `enabled: false` | `POST /skills` when `source !== 'manual'` |
| It shows a `needs vetting` badge in the list | `skills.listItem.needsVetting` |
| Opening it shows the untrusted-source notice | `skills.preview.untrustedNotice` |
| Only a person can turn it on | the toggle |

A foreign skill is foreign instructions inside your agent's prompt. The only
thing between the two is someone reading the text before flipping the switch —
which is exactly why the preview step is mandatory rather than convenient.

Note what this does NOT excuse. The body is trusted because a person vetted it;
the **name** is not an instruction at all, and it is rendered in a structural
position (`### Skill: {name}`). It is flattened to a single line before it goes
in, so a name carrying newlines cannot forge a section boundary in the user
message. The rule generalises: content the feature exists to deliver goes in
verbatim, metadata around it is normalised to the shape the prompt assumes.

Two structural facts hold regardless of any of this, and are worth stating
because a reader may assume otherwise: a skill's **description never reaches a
model at all** — it is the library's interface, not the agent's — and skills and
documents are assembled into the **user** message. The system message is the
agent's own prompt plus the injection guard, and nothing a skill or a document
carries can reach it.

### Import: two phases, no temporary state

```
POST /skills/import/preview   ->  SkillImportPreview   (parses, stores NOTHING)
                                        |
                                        v  user confirms in the drawer
POST /skills                  ->  Skill (enabled: false)
```

The preview is stateless: the server parses and returns the extracted core, the
drawer holds it in component state, and confirming posts it back as an ordinary
create. There are no half-imported rows to clean up, and abandoning the drawer
leaves nothing behind.

**The body is JSON with base64, not multipart.** `fastify-type-provider-zod`
cannot validate a multipart body, and schema-first routes are the server's
convention — so multipart would mean both a new plugin (`@fastify/multipart`) and
a route that opts out of the house style. A base64 field keeps it a normal zod
route. The global `bodyLimit` is 1 MB (`app.ts:49`), so the preview route sets
its own.

```ts
const ImportPreviewBody = z.union([
  z.object({ kind: z.literal('md'),  filename: z.string(), content: z.string() }),
  z.object({ kind: z.literal('zip'), filename: z.string(), content_b64: z.string() }),
  z.object({ kind: z.literal('url'), url: z.string().url() }),
]);
```

**Archives.** `fflate`'s `unzipSync` — pure JS, no native build step. The archive
is expanded **in memory only**: nothing is written to disk and nothing is
executed. The skill core is the first match of `SKILL.md` → `skill.md` →
`README.md` → a lone `*.md`. Every other entry goes into `ignored[]` and is
rendered in the preview, which is what makes "executable parts are not processed"
something the user can see rather than something we assert. Guards: at most 200
entries and 2 MB of uncompressed data, otherwise 422.

**URLs.** `http`/`https` only, 10 s timeout, 1 MB response cap, and a refusal for
loopback / private / link-local addresses after DNS resolution. The response is
treated as markdown.

**Parsing** is a pure function, `parseSkillMarkdown()`: YAML front matter
(`name`, `description`, `type`) when present, otherwise the name comes from the
first `# ` heading and the description from the first non-empty paragraph, with
`type: 'custom'`. Being pure, it is unit-tested without Docker — including the
archive case where a `.sh` sitting next to `SKILL.md` must end up in `ignored[]`.

### Contract changes (`shared` first, then mirrored by hand)

The two vendored copies have already drifted (root `INSIGHTS.md`), so each field
is mirrored individually and verified with a `diff` scoped to it — never
whole-file equality, and never `cp`.

| Contract | Change |
|---|---|
| `knowledge.ts` → `SkillSource` | `+ 'imported_file'` |
| `knowledge.ts` → `SkillImportPreview` | new: `{ name, description, type, body, source, ignored: string[] }` |
| `trace.ts` → `PromptAssembly` | `+ skills_tokens`, `+ specs_tokens` — both `z.number().int().nullish()` |
| `knowledge.ts` → `SkillVersion` | `+ message: z.string().nullish()` |
| `knowledge.ts` → `Skill` | `+ agent_count`, `+ pull_rate`, `+ accept_rate` — nullish, **list endpoint only** |
| `knowledge.ts` → `SkillContextLink` | new: `{ skill_id, path, order }` |
| `knowledge.ts` → `SkillStats` | new — see *What the stats mean* |

`source` is a plain `text` column with no `CHECK` (`0000_init.sql:322`) —
Drizzle's `text(..., { enum })` is a TypeScript-level constraint only — so the
new enum value needs no migration.

`skills_tokens` is **nullish, not nullable-required**, for the same reason spec
001 gave for `RunStats`: `run_traces.trace` is a jsonb document and every trace
written before this change lacks the field. A required field would fail to parse
historical traces.

### Where a skill lives

`/skills/:id` — a rail of every skill on the left, a tabbed editor on the right,
mirroring `/agents/:id` down to the `?tab=` whitelist. `/skills` renders the same
rail with an empty right pane. The selection moves from a query parameter into
the path, which is what finally switches on the `skills.detail.*` copy that has
sat unused in the message file since the starter shipped.

### Project context attached to a skill

```
repo clone                        skill_context_docs             prompt
specs/*.md  docs/*.md  ──list──▶  (skill_id, path, order)  ──▶  ## Project context
insights/*.md                                                    <untrusted source="spec-N">
```

- The source is the working clone, three folders (`specs/`, `docs/`,
  `insights/`), `.md` only. repo-intel is deliberately NOT used: it indexes code
  under its own token budget, and this is a cheap directory listing.
- The link stores a **path**, not an id — context documents are files and have
  no row anywhere. The consequence, recorded because it looks like a bug
  otherwise: a workspace can hold several repos, so an attached path may not
  exist in the repo of a given PR. The executor **skips** those with a line in
  the run log. The user attached a rule, not a dependency; failing a review
  because a document moved would be the wrong trade.
- **Reading a file by a path from a request is a traversal vector.** One pure
  guard, `resolveDocPath(cloneDir, requested)`, normalises the path, refuses any
  surviving `..`, absolute paths, NUL bytes, a first segment outside the three
  folders, and any extension but `.md`, then checks the result is inside the
  clone on a separator boundary (so `/clone-evil/x.md` cannot pass a bare
  prefix test). A refusal is **422**, never 404 — "you may not ask that" and
  "there is no such file" are different answers. A symlink is re-checked after
  `realpath`, with both sides realpathed (on macOS `/var` is itself a link).
  The executor runs stored paths through the same guard: a stored path is only
  a request that was saved.
- Each attached document becomes one element of `specs`, which `assemblePrompt`
  already wraps as untrusted — unlike a skill body, a spec is data, not an
  instruction. The screen's "serializes as" box shows the heading and the path
  list, a summary of what will be sent rather than a second copy of Preview.
- The trace fills the long-declared `specs_read` with the paths actually read,
  and gains `specs_tokens` beside `skills_tokens`.

### What the stats mean

| Tile | How it is computed |
|---|---|
| USED BY | `agent_skills` rows for this skill — exact |
| PULL FREQUENCY | completed runs in the last 30 days whose prompt included this skill ÷ **all** completed runs in the window |
| ACCEPT RATE | accepted ÷ (accepted + dismissed) over the findings of those same runs |
| FINDINGS (30D) / BY CATEGORY | the findings of those same runs, grouped by `category` |

The last three are **correlation, not causation**: the skill was in the prompt
when the finding appeared, and nothing shows it caused it. The screen carries
that sentence; the spec carries the reason it is not fixable here (see *Not in
scope*).

Two rules the numbers depend on:

- **Null is not zero.** A skill nobody has run has no pull rate and no accept
  rate — `null`, rendered as an em dash. A skill that *was* pulled and had every
  finding dismissed has a real `0`. Flattening the two would report a
  measurement that was never taken.
- **The denominator is every completed run**, not only runs by agents holding
  the skill. Scoped the narrow way the figure sits near 100% for every skill and
  distinguishes nothing. Failed runs are excluded from both sides: they pulled a
  prompt but produced no findings, so counting them would depress every accept
  rate.

Making this measurable needs one new table, `run_skills(run_id, skill_id, order,
tokens)`, written by the executor at assembly time. The trace cannot serve: it
stores the rendered text, which stops matching the moment a body is edited.

### Server

`server/src/modules/skills/` mirrors `modules/agents/` exactly — `getContext` for
tenancy, `NotFoundError` for 404, a service that returns `undefined` rather than
throwing when a row is not in the workspace, and request bodies declared as zod
schemas at the top of `routes.ts`.

```
GET    /skills                 workspace list
GET    /skills/:id             one skill
POST   /skills                 create (manual -> enabled true; imported -> false)
PUT    /skills/:id             update; a body change bumps version + writes skill_versions
DELETE /skills/:id             delete (agent_skills cascades)
GET    /skills/:id/versions    body history, newest first
GET    /skills/:id/versions/diff?from=&to=      unified diff between two bodies
POST   /skills/:id/versions/:version/restore    re-apply an old body (appends)
GET    /skills/:id/context     attached documents, in order
PUT    /skills/:id/context     replace the attached set
GET    /skills/:id/stats       usage figures
POST   /skills/import/preview  parse .md / .zip / URL; stores nothing

GET    /repos/:id/context               list the repo's context documents
GET    /repos/:id/context/doc?path=…    one document, with content
```

Versioning copies `AgentsRepository.snapshotVersion`: a changed `body` bumps
`skills.version` and inserts the new body into `skill_versions`. Changing only
name, description or `enabled` does not bump it — a version is a body, which is
the thing the prompt actually contains. A save may carry a `message`, stored on
the version it creates, so the history reads as a changelog rather than a list
of timestamps.

**Restore appends, it does not rewind.** Restoring v2 from v5 produces v6 with
v2's body, and v1–v5 stay exactly where they were. That is what makes the
history usable as a record of what a past eval run scored: rewriting it would
silently invalidate every run that referenced a version.

The diff between two versions is computed **server-side** (`createTwoFilesPatch`
from the `diff` package) rather than in the browser — the algorithm stays in the
unit lane, and the client already renders unified-diff text with the PR viewer's
`parsePatch` + `CodeLine`.

**Two migrations.** `0013` adds two indexes, `0014` adds `skill_versions.message`,
the `skill_context_docs` and `run_skills` tables, and the indexes those need
(`run_skills_skill_idx`, plus `agent_runs_agent_idx`, which was missing for the
same reason as everything below).

**The indexes in `0013`.** `skills.workspace_id` has none and the
list endpoint filters on it; `agent_skills.skill_id` has none, because the
composite primary key covers the agent side of the link only, leaving "which
agents use this skill" — and the cascade when a skill is deleted — scanning the
table. Postgres indexes the column a foreign key *points at*, never the column
holding it; this repo has now hit that four times. Generated with
`pnpm db:generate`, applied with `pnpm db:migrate` (the server never migrates on
boot).

**A tenancy hole gets closed on the way past.** `AgentsService.setSkills` and
`linkSkill` verify that the *agent* belongs to the caller's workspace but never
check the skill ids, so a skill from another workspace links successfully today.
It has been unreachable only because the table is empty; this feature fills it.
Both now reject ids outside the workspace.

### Wiring the run

`run-executor.ts` is the only place the feature switches on:

1. Before `reviewPullRequest` (~line 190), resolve the agent's links with the
   existing `linkedSkills()`, drop any whose skill is globally disabled, and map
   the survivors to `### Skill: {name}\n\n{body}` in link order.
2. Pass `...(bodies.length ? { skills: bodies } : {})` — an empty array must not
   be passed, or `assemblePrompt` still omits the section but the intent is
   muddier.
3. Count the block's tokens with the container's existing `tokenizer` adapter and
   persist `{ ...outcome.assembly, skills_tokens }` on the trace.
4. Record the pulled skills in `run_skills` with each block's token count.
   Best-effort: losing a statistic must never cost the user a review.
5. Resolve the union of the documents attached to those skills, read the ones
   that exist in this repo's clone, and pass them as `specs`; fill `specs_read`
   with the paths that were read and `specs_tokens` with the block's cost.
6. The failure path and `platform/trace-builder.ts` keep the blocks `null` and
   gain `skills_tokens: null` / `specs_tokens: null`.

`reviewer-core` is unchanged. It cannot count tokens — it has no tokenizer and is
forbidden I/O — so the count is the server's job, using the tokenizer it already
holds for the repo-map budget.

### Client

**`/skills/:id`** is a rail plus a tabbed editor, mirroring `/agents/:id`: the
rail reuses `SkillCard`, which gains a footer of the list endpoint's rollups
(`{n} agents · {p}% pull · {a}% accept`, em dashes when null) and an icon for the
source. The header carries the type badge, a `v{n}` chip and a disabled "Run on
evals" button.

**Config** ports the old preview panel's form and adds the body editor's header
strip: the `<name>.md` chip, an `unsaved` badge shown while the local body
differs from the saved one, and a token count. There is no tokenizer in the
browser, so the count is an **estimate** (`ceil(chars / 4)`, the same heuristic
the server falls back to) and renders with a `~` — the convention spec 001
established for figures we computed rather than measured. The exact number for
an actual run is in its trace.

Below the editor the tab states what the body *is*: "the only text sent to the
model — everything else is metadata". Then the save row: **Save skill**,
**Cancel** (which restores every field to the stored values, the note included),
and, opposite them, what the next save would do — *Saving snapshots the body as
v6*. That note is **predictive and conditional**: it appears only while the body
differs, because only a changed body creates a version, and it is worth more
before the click than a receipt is after it. The optional "what changed" note
sits just above that row; it is the only place a version's message can be
written, and the Versions tab is unreadable as a changelog without it.

**Deleting is not editing**, so it is not a button beside Save. It sits below a
rule in its own block, titled, with the consequence spelled out — *removes it
from all agents, cannot be undone* — and still behind a confirm.

**Context** is the agent editor's Skills tab over a different list: the same
`orderedRows` / `toggleAttachment` / `moveId` / `filterRows` helpers, the same
checkbox-is-the-attachment rule, the same native HTML5 drag with `ArrowUp` /
`ArrowDown` on the focused handle. The eye opens the document in a modal. Below
the list sits the "serializes as" box.

**Stats** is four `MetricCard` tiles, the agents list, and a `Donut` for the
categories. The vendored `Donut` prints `{valuePrefix}{value.toFixed(2)}`, so
counts render as `12.00`; it gains an optional `formatValue` rather than a
caller-side workaround.

**Versions** lists the history newest-first with a `Current` marker, a Diff that
renders the server's patch through `parsePatch` + `CodeLine`, and a Restore
behind a confirm.

**The import drawer** is unchanged: two tabs, the file read in the browser, the
preview endpoint, and only the confirm button calling `POST /skills`.

**The agent editor's Skills tab** is unchanged — it is the component Context was
modelled on.

**Nav** grows a `SKILLS LAB` section holding Agents and Skills, which is what
both screens' breadcrumbs have claimed all along. No items are added for screens
that do not exist.

Copy comes from the `skills` and `agents.skills` namespaces; every new string is
added to `messages/en/skills.json`.

## Acceptance

1. A skill created in the UI appears in the rail, opens at `/skills/:id`, and is
   readable back from `GET /skills`.
2. Editing a body and saving bumps `version` and adds a row to `skill_versions`;
   editing only the name or the toggle does not.
3. Deleting a skill removes its `agent_skills` rows and the agents that used it
   still load.
4. A skill belonging to another workspace is not listed, not readable by id, and
   **cannot be attached** to an agent in this workspace.
5. Importing a `.zip` that contains `SKILL.md` and `install.sh` shows the skill
   body and `install.sh` under ignored; nothing is written to disk; `GET /skills`
   does not contain it until the confirm button is pressed; afterwards it is
   present, `source: 'imported_file'`, `enabled: false`, badged `needs vetting`.
6. Dismissing the import drawer after a preview leaves no row behind.
7. An archive over the entry or size cap is rejected with 422 and no partial
   import.
8. A URL import of a plain markdown file works; a `file://` URL, a loopback
   address and a private-range address are each refused.
9. Attaching three skills to an agent and reordering them survives a reload, and
   `agent_versions.config_json.skills` records the order at the time of the next
   config save.
10. A review run by an agent with two attached enabled skills produces a prompt
    whose `## Skills / rules` section contains both bodies **in the attached
    order**, and the trace drawer shows them in one Skills block with a token
    count beside it.
11. Turning a skill off globally removes it from the next run's prompt and trace
    without detaching it from any agent.
12. An agent with no attached skills produces a run whose trace Skills panel is
    absent — not an empty block.
13. A trace written before this change still opens; its Skills panel is absent
    and nothing fails to parse.
14. Test Quality Reviewer with no skills misses the uncovered branch in a
    happy-path-only test PR, and with its skills attached flags both the
    uncovered branch and the edge case. API Contract Reviewer does the same for a
    route-signature change. Both are reproducible from seeded data.
15. Reordering is operable from the keyboard alone.
16. `pnpm typecheck` passes in `server/` and `client/`, `npm test` in
    `reviewer-core/` passes **with no changes to that package**, and every field
    this spec adds is identical in the two vendored `shared` copies. (Only those
    — the copies had already drifted, and closing that gap is not this feature's
    job.)
17. `/skills/:id` shows the rail and six tabs; the active tab is in `?tab=` and
    survives a reload; an unknown tab falls back to Config rather than blanking.
18. Attaching a document in Context changes the next run of any agent holding
    that skill: the trace grows a `Project context` block containing the
    document's text, `specs_read` lists its path, and `specs_tokens` is set.
19. A document attached but absent from this PR's repo does not fail the run —
    it is skipped and named in the run log.
20. `GET /repos/:id/context/doc?path=../../etc/passwd` is **422**, not 404, and
    reads nothing. A symlink under `specs/` pointing outside the clone is
    refused the same way. An allowed path that is simply missing is 404.
21. A stored attachment that escapes the clone is refused at read time too: the
    run completes with no `Project context` block.
22. The Config tab states the next version a save would create, and only while
    the body differs; Cancel restores every field including the note; deleting
    lives in its own block below a rule and behind a confirm.
23. Saving a changed body with a note records that note on the new version; Diff
    between two versions shows the changed lines; restoring v2 from v5 produces
    v6 with v2's body and leaves v1–v5 in place. Restoring the body that is
    already current is refused.
24. Stats reports an exact USED BY and agent list; the other three figures are
    labelled as measured over runs where the skill was present. A skill with no
    runs shows em dashes, not zeros; a skill pulled by runs whose findings were
    all dismissed shows a real `0%`.
25. The Evals tab renders an empty state and the "Run on evals" button is
    disabled.
26. A run that pulled no skill writes no `run_skills` rows; a run that pulled two
    writes them in prompt order with per-block token counts.
