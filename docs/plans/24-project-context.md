# Development Plan: Project Context
Status: done
Execution: multi-agent
Save as: docs/plans/24-project-context.md
Spec: specs/008-project-context.md

## Spec traceability
| Spec AC | Covered by |
|---|---|
| AC-1 | S1, S2, S5, S7 |
| AC-2 | S3, S5, S7 |
| AC-3 | S1, S5, S7 |
| AC-4 | S5, S7 |
| AC-5 | S3, S5, S7 |
| AC-6 | S3 |
| AC-7 | S5, S7 |
| AC-8 | S5, S7 |
| AC-9 | S3, S5, S7 |
| AC-10 | S5, S7 |
| AC-11 | S5, S7 |
| AC-12 | S20 |
| AC-13 | S16, S19 |
| AC-14 | S4, S5, S7, S19 |
| AC-15 | S19 |
| AC-16 | S19 |
| AC-17 | S7, S15, S19 |
| AC-18 | S19 |
| AC-19 | S17, S18 |
| AC-20 | S8–S10, S18 |
| AC-21 | S17, S22 (e2e drag-and-drop) |
| AC-22 | S8, S9, S17 |
| AC-23 | S17 |
| AC-24 | S17 |
| AC-25 | S17 |
| AC-26 | S10 |
| AC-27 | S11, S12, S17 |
| AC-28 | S11, S12 |
| AC-29 | S17 |
| AC-30 | S14 |
| AC-31 | S5, S13, S14 |
| AC-32 | S13 |
| AC-33 | S5, S14 |
| AC-34 | S13, S14 |
| AC-35 | S1, S14 |
| AC-36 | S21 |
| AC-37 | S21 |

## Decisions needed
None open — see *Decisions recorded*. Resolved options with steps affected: *Design notes → Decisions* (below the marker).

## Decisions recorded
2026-10-05, user (main session):
- TQ1–TQ6: defaults accepted as written above.
- GAP1: an agent whose only link to the document is a **disabled skill** is NOT counted; a **disabled agent** IS counted (its configured links count). Sent to `spec-creator`; spec re-approved before pass 2.
- D1 A (`picomatch` direct server dep) · D2 A (`fs.readdir` whole-clone walk + glob filter) · D3 A (shared safe reader via `container`) · D4 A (`{path, body}[]`, escaped label) · D5 A (exact tokenizer + 500-doc timing test) · D6 A (`repos.context_globs text[]`) · D7 A (shared doc picker).
- D8: multi-agent.

## Prerequisites
- Main session, before G1: `cd server && pnpm add picomatch@^4.0.4 && pnpm add -D @types/picomatch`.
- Postgres up for the `.it` tests (G2–G4); main session runs `cd server && pnpm db:migrate` after S2.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S3 | shared contract + mirror, server schema/migration, context helpers | — | S1 contract names; `repos.contextGlobs`, `agentContextDocs`; helpers of S3 |
| G2 | S4–S7 | server `context` module + container | G1 | `container.context`: `list`, `getDoc`, `getRoots`/`setRoots`/`resetRoots`, `readDocsForRun` |
| G3 | S8–S12 | server `agents` + `skills` | G2 | `AgentsRepository.listContextDocs`/`setContextDocs`/`inheritedContextDocs`; `/agents/:id/context`; `/skills/:id/context` → `SkillContext` |
| G4 | S13–S14 | reviewer-core prompt + server executor | G3 | `ContextDoc` exported; trace `specs_skipped` |
| G5 | S15–S17 | client hooks, shared preview + picker, skill tab | G4 | `lib/hooks/context.ts`; `useAgentContext`/`useSetAgentContext`; `<DocPreview>`, `<ContextDocPicker>` |
| G6 | S18–S21 | client agent tab, page, nav, trace drawer | G5 | picker rows keep `draggable` and the `Reorder <path>` / `<path>` aria-labels S22 locates by |
| G7 | S22 | e2e flow + hermetic clone fixture (`e2e/`, `scripts/e2e.sh`, CI workflow) | G6 | — |

All groups run sequentially. S13 alone breaks `server` typecheck at `run-executor.ts:318`; S14 fixes it — both in one G4 run.

Skill sets used below: **srv** = `onion-architecture`, `typescript-expert`, `zod`, `security`; **db** = `drizzle-orm-patterns`, `postgresql-table-design`, `onion-architecture`, `typescript-expert`; **ui** = `frontend-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `typescript-expert`, `security`. Gotcha refs name the package's `insights/gotchas.md` section and item.

## Steps

### S1 — Add the project-context contracts and mirror them  [Contract]
- **Files:** `server/src/vendor/shared/contracts/platform.ts`, `knowledge.ts`, `trace.ts` (modify); the same three in `client/src/vendor/shared/contracts/` (modify, targeted mirror)
- **Change:** platform.ts after `SpecFile`: `DEFAULT_CONTEXT_ROOTS = ['**/{specs,docs,insights}/**/*.md'] as const`; `ContextDocType` enum `specs|docs|insights|other`; `SpecFile` + `type`, `tokens`, `used_by_agents` (all nullish); `ContextListing {docs: SpecFile[], truncated: boolean}`; `ContextRoots {globs: string[], is_default: boolean}`; `SetContextRootsBody {globs: string[].min(1)}`; `ContextDocPath` = string 1–512 chars (assumption) refined: no NUL, no leading `/` or `\`, no `..` segment (split on `/` and `\`), ends `.md` case-insensitive; `ContextPathsBody {paths: ContextDocPath[].max(200)}` (assumption). knowledge.ts after `SkillContextLink`: `AgentContextLink {agent_id, path, order}`, `InheritedContextDoc {path, skill_id, skill_name}`, `AgentContext {links, inherited}`, `SkillContext {links: SkillContextLink[], used_by_agents: int}`. trace.ts: `ContextSkipReason` enum `missing|outside_search_roots|outside_clone|too_large`, `SpecSkipped {path, reason}`, `RunTrace.specs_skipped: SpecSkipped[]` nullish.
- **Layer / why here:** ports; contracts change in shared first.
- **Skills to apply:** `zod`, `typescript-expert`, `onion-architecture`
- **Practices:** schema + `z.infer` type exported together; refinements return `false`, never throw; new response/trace fields nullish; mirror = the same inserted text, never a folder copy.
- **Known gotchas:** root INSIGHTS "the two vendored `shared` copies are not actually in sync"; root INSIGHTS "TS2719 … after adding a contract field" (add new keys to fixture defaults).
- **Done when:** `cd server && pnpm typecheck` · `cd client && pnpm typecheck`.

### S2 — Store search roots per repo and agent context links
- **Files:** `server/src/db/schema/repos.ts`, `server/src/db/schema/agents.ts` (modify); one migration under `server/src/db/migrations/` (create, only via `pnpm db:generate`)
- **Change:** `repos.contextGlobs = text('context_globs').array().notNull().default(sql\`ARRAY['**/{specs,docs,insights}/**/*.md']::text[]\`)`, commented as mirroring `DEFAULT_CONTEXT_ROOTS`. New `agentContextDocs` = `agent_context_docs(agent_id uuid FK→agents ON DELETE CASCADE, path text NOT NULL, order integer NOT NULL DEFAULT 0, PK(agent_id, path))` after `agentSkills`. Then `cd server && pnpm db:generate` once.
- **Layer / why here:** infrastructure; additive only.
- **Skills to apply:** db
- **Practices:** camelCase TS / snake_case SQL; the PK leads with the FK column, so no separate FK index.
- **Known gotchas:** server gotchas → DB & migrations: "`db:generate` can hang" (no drop+add on one table), "A foreign-key column carries no index"; root INSIGHTS "the auto-mode permission check blocks an implementer from writing a migration file" (if blocked, hand `pnpm db:generate` to the main session).
- **Done when:** `cd server && pnpm typecheck` · the new migration SQL creates `agent_context_docs`, adds `context_globs`, and contains no `DROP` — if the array default renders wrong, stop and report.

### S3 — Glob-based path helpers
- **Files:** `server/src/modules/context/helpers.ts`, `server/src/modules/context/constants.ts`, `server/test/context-helpers.test.ts` (modify)
- **Change:** keep `resolveDocPath`/`CONTEXT_FOLDERS` (S14 deletes them). Add: `normaliseDocPath(raw)` (`\`→`/`, strip `./`, collapse `//`, `path.posix.normalize`; null on empty, NUL, leading `/` or `\`, `^[A-Za-z]:`, a remaining `..`); `compileRoots(globs)` → `(rel) => boolean`, one `picomatch(g, { dot: false, nocase: false, windows: false, ignore: ['**/node_modules/**'] })` per glob, `some()`; `validateRootGlob(glob)` → reason or null (≤ `MAX_GLOB_LENGTH`, no NUL, not absolute, no `..` segment, last `/`-segment ends `.md` case-insensitive, `picomatch.makeRe` does not throw); `resolveContextPath(cloneDir, requested, isRoot)` → `{abs, rel} | {refused: 'outside_search_roots' | 'outside_clone'}` (normalise → `isRoot` → `.md` → `isInsideDir`); `docType(rel)` = nearest ancestor dir named `specs|docs|insights`, else `other`. Constants: `EXCLUDED_DIRS = ['.git','node_modules']`, `MAX_ROOT_GLOBS = 20`, `MAX_GLOB_LENGTH = 256` (both assumption).
- **Layer / why here:** pure module helpers (the testable half of the guard).
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:** no I/O; normalise before matching; `.md` checked independently of the globs.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/context-helpers.test.ts` passes with: default glob matches `specs/a.md`, `server/specs/a.md`, `specs/sub/a.md`; rejects `src/a.md`, `.github/docs/x.md`, `specs/.hidden.md`, `node_modules/x/docs/a.md`, `specs/a.txt`; `validateRootGlob` rejects `/abs/**/*.md`, `../x/*.md`, `**/*.{md,txt}`, `**/*.m?`; `docType('server/specs/docs/a.md')` is `docs`, `docType('README.md')` is `other`.

### S4 — Context repository: roots and "used by"
- **Files:** `server/src/modules/context/repository.ts` (modify)
- **Change:** `ContextRepoRef` + `contextGlobs` (selected in `getRepoRef`); `setContextGlobs(ws, repoId, globs)` scoped by both ids; `agentCountForPath(ws, path)` = distinct workspace agents with an `agent_context_docs` row for `path` OR an `agent_skills` link to an **enabled** skill with a `skill_context_docs` row for `path`; disabled agents count (GAP1).
- **Layer / why here:** the only layer touching `db/schema`.
- **Skills to apply:** db
- **Practices:** every query predicated on `workspaceId`; the count is one query.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` (behaviour asserted in S7).

### S5 — Context service: glob listing, one safe reader, roots, run reads
- **Files:** `server/src/modules/context/service.ts` (modify)
- **Change:** constructor `deps: { db: Db; git: GitClient; tokenizer: Container['tokenizer'] }` — the tokenizer type comes from `Container` (type-only import of `platform/container.js`), never from `src/adapters/**` (F1) (Container fits structurally, so `routes.ts` still compiles). `list` → `ContextListing`: sorted `readdir` walk from the clone root, prune `EXCLUDED_DIRS` and dot-dirs, never follow symlinks, depth ≤ `MAX_WALK_DEPTH` from the root (TQ2), keep `.md` files matched by `compileRoots(repo.contextGlobs)`, stop at `MAX_LISTED_DOCS` with `truncated: true`; per doc `type`, `size`, `updated_at`, `tokens` (`tokenizer.count` when ≤ `MAX_DOC_BYTES`, else null), no `content`; no clone → empty. Private `readSafely` = `resolveContextPath` + realpath of clone AND target + `isInsideDir` + size → content or a `ContextSkipReason`. `getDoc`: refused → `ValidationError`, missing → `NotFoundError`; adds `type`, `tokens`, `used_by_agents`. `getRoots`/`setRoots` (dedupe; empty, > `MAX_ROOT_GLOBS` or a `validateRootGlob` failure → `ValidationError` naming the glob)/`resetRoots`; `is_default` = equals `DEFAULT_CONTEXT_ROOTS`. `readDocsForRun(repo: {owner, name, contextGlobs}, paths)` → `{docs: {path, body}[], skipped: SpecSkipped[]}` in input order.
- **Layer / why here:** application; the spec's single path guard.
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:** no Drizzle import; no import from `src/adapters/**`; refusal 422, never 404; content read only after both realpath checks; messages carry no file content. **Fix item SF1 (security-reviewer, HIGH):** after realpath, `readSafely` converts the real target to its repo-relative form against the realpath'd clone and applies the roots matcher and the `.md` check to THAT form too (not only to the requested path); a real target with any dot-directory segment (`.git/`, `.github/`, …) is refused. Both refusals map to `outside_search_roots` (or `outside_clone` when outside the clone) and to 422 on the HTTP read.
- **Known gotchas:** server gotchas → Security: "A `realpath` containment check must resolve the allowed root too", "Every route is reachable from the LAN".
- **Done when:** `cd server && pnpm typecheck` · `rg -n "adapters/" server/src/modules/context/service.ts` prints nothing · SF1 case in `server/test/context.it.test.ts` (run in S7): a fixture symlink `docs/x.md -> ../.git/config` is refused as `outside_search_roots` or `outside_clone` both by `GET /repos/:id/context/doc?path=docs/x.md` (422) and by `app.container.context.readDocsForRun(...)` (`skipped` entry, no `docs` entry).

### S6 — Wire the context service into the container
- **Files:** `server/src/platform/container.ts` (modify)
- **Change:** lazy cached getter `get context(): ContextService` built from `{ db, git, tokenizer }`.
- **Layer / why here:** composition root.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** same pattern as `blast`/`smartDiff`; no new override field.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck`.

### S7 — Context routes: listing shape and search-roots endpoints
- **Files:** `server/src/modules/context/routes.ts`, `server/test/context.it.test.ts` (modify)
- **Change:** use `app.container.context`; `GET /repos/:id/context` → `ContextListing`; add `GET`, `PUT` (`SetContextRootsBody`), `DELETE` (reset) `/repos/:id/context/roots` → `ContextRoots`; unknown repo → 404.
- **Layer / why here:** transport.
- **Skills to apply:** `fastify-best-practices`, srv
- **Practices:** Zod schemas in route options, no `parse` in handlers; handler = context → service → 404 on undefined.
- **Known gotchas:** server gotchas → Tests: "A hermetic `.it` test must not be able to reach a real API key".
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/context.it.test.ts` asserts: default roots + `is_default`; PUT stores; `**/*.txt` → 422 naming it; `[]` → rejected, roots unchanged; DELETE restores; a fixture clone with `server/specs/a.md`, `src/x.md`, `.github/docs/b.md` and a symlink lists only the matching regular file(s), sorted, with `type`/`tokens`, no `content`; uncloned → empty; doc outside roots → 422; in-root symlink to outside → 422; SF1: symlink `docs/x.md -> ../.git/config` refused on the doc read (422) and in `readDocsForRun` (skipped); `used_by_agents` counts direct, enabled-skill and disabled-agent links, not disabled-skill-only; other workspace → 404; 500 docs list in < 2000 ms.

### S8 — Agents repository: context links and inherited docs
- **Files:** `server/src/modules/agents/repository.ts` (modify)
- **Change:** `listContextDocs(agentId)` by `order`; `setContextDocs(agentId, paths)` (delete + insert, order = index); `inheritedContextDocs(agentId)` → `{path, skillId, skillName}[]` via `agent_skills` ⨝ `skills` (enabled) ⨝ `skill_context_docs`, ordered by link order then doc order.
- **Layer / why here:** infrastructure.
- **Skills to apply:** db
- **Practices:** one query for inherited docs.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck`.

### S9 — Agents service: read and replace context links
- **Files:** `server/src/modules/agents/service.ts` (modify)
- **Change:** `contextLinks(ws, id)` → `AgentContext | undefined` (undefined when `getById` misses; `inherited` minus own paths, first occurrence); `setContextLinks(ws, id, paths)` → dedupe, `repo.transaction(r => r.setContextDocs(...))`, return `contextLinks`. No version bump (TQ1).
- **Layer / why here:** application.
- **Skills to apply:** srv
- **Practices:** tenancy check before read or write.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck`.

### S10 — Agents routes: `GET/PUT /agents/:id/context`
- **Files:** `server/src/modules/agents/routes.ts` (modify); `server/test/agents-context.it.test.ts` (create)
- **Change:** two routes beside `/agents/:id/skills`; PUT body `ContextPathsBody`; undefined → `NotFoundError('Agent not found')`.
- **Layer / why here:** transport.
- **Skills to apply:** `fastify-best-practices`, srv
- **Practices:** Zod schemas in route options.
- **Known gotchas:** server gotchas → Security: "Every route is reachable from the LAN".
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/agents-context.it.test.ts` asserts: order stored, duplicates dropped; `inherited` from enabled skills in skill order with `skill_name`, no disabled skill, no own path; other-workspace agent → 404 for GET and PUT; `../x.md`, `/etc/a.md`, `a.txt` rejected; agent `version` unchanged.

### S11 — Skills service: context response with "used by"
- **Files:** `server/src/modules/skills/service.ts` (modify)
- **Change:** `contextLinks`/`setContextLinks` return `SkillContext` with `used_by_agents = (await this.repo.agentsUsingSkill(ws, id)).length` (includes disabled agents, AC-27). No version change.
- **Layer / why here:** application.
- **Skills to apply:** srv
- **Practices:** reuse `agentsUsingSkill`.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck`.

### S12 — Skills routes: shared body schema
- **Files:** `server/src/modules/skills/routes.ts`, `server/test/skills.it.test.ts` (modify)
- **Change:** local `SetContextBody` → `ContextPathsBody`; update the context tests (~lines 494–575) to `SkillContext`; add: `used_by_agents` counts a disabled agent; `../a.md` rejected; skill `version` unchanged after PUT.
- **Layer / why here:** transport.
- **Skills to apply:** `fastify-best-practices`, srv
- **Practices:** Zod schemas in route options.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/skills.it.test.ts` passes.

### S13 — Label injected documents with their repo path
- **Files:** `reviewer-core/src/prompt.ts`, `reviewer-core/src/review/run.ts`, `reviewer-core/src/index.ts`, `reviewer-core/test/prompt.test.ts` (modify)
- **Change:** `export interface ContextDoc { path: string; body: string }`; `PromptParts.specs` and the `run.ts` input `specs` become `ContextDoc[]`; block = `wrapUntrusted(d.path, d.body)`; `wrapUntrusted` escapes its label (`&`, `"`, `<`, `>` to entities; control chars incl. newlines → space); export `ContextDoc` beside `PromptParts`. Heading and omit-when-empty unchanged.
- **Layer / why here:** core; stays pure (the server passes path + text).
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:** no I/O imports; constant labels render unchanged.
- **Known gotchas:** reviewer-core gotchas → Engine invariants: "The only I/O allowed under `reviewer-core/src` is the `fetch` in `OpenRouterProvider.listModels()`".
- **Done when:** `cd reviewer-core && npm run typecheck && npm test` · `prompt.test.ts` asserts `<untrusted source="specs/a.md">`, that path `x" evil="1>.md` renders as `x&quot; evil=&quot;1&gt;.md`, and no `## Project context` for `specs: []`.

### S14 — Run executor: merge agent + skill docs, record skips
- **Files:** `server/src/modules/reviews/run-executor.ts`, `server/src/modules/reviews/helpers.ts`, `server/src/modules/context/helpers.ts`, `server/src/modules/context/constants.ts`, `server/test/context-helpers.test.ts`, `server/test/skills-in-prompt.it.test.ts` (modify); `server/test/context-merge.test.ts` (create)
- **Change:** `reviews/helpers.ts`: `mergeContextPaths(own, inherited)` — own first, then inherited, first occurrence wins. `buildContextDocs(repo, agentId, runLog)`: `this.agents.listContextDocs` + `inheritedContextDocs` → merge → `this.container.context.readDocsForRun(repo, paths)`; no early return when the agent has no skills; `specs: docs`; trace `specs_read` (read paths, in order) and `specs_skipped`; one `runLog.info` naming read paths and each skipped `path (reason)`. Drop the `readFile`/`stat`, `resolveDocPath`, `MAX_DOC_BYTES` imports; delete `resolveDocPath` and `CONTEXT_FOLDERS` and their tests.
- **Layer / why here:** application; cross-module only via `container.context` (D3).
- **Skills to apply:** `onion-architecture`, `typescript-expert`, `security`
- **Practices:** no `modules/context` import left in `reviews/`; a context failure logs and continues, never fails the run.
- **Known gotchas:** server gotchas → Run log: "only `msg` is persisted"; Tests: "Never read `run_traces` straight after `waitForPrRuns`", hermetic `.it`.
- **Done when:** `cd server && pnpm typecheck` · `rg -n "modules/context|context/helpers|context/constants" server/src/modules/reviews` prints nothing · `cd server && pnpm exec vitest run test/context-merge.test.ts test/context-helpers.test.ts test/skills-in-prompt.it.test.ts` asserts: own docs before skill docs, skill order then doc order, duplicates once; `<untrusted source="<path>">` in the prompt; missing, outside-roots, symlink-escape and > 512 KB docs skipped with reasons in `specs_skipped` and the run log; nothing read → no `## Project context`; `specs_tokens` set.

### S15 — Client hooks for context, roots and agent context
- **Files:** `client/src/lib/hooks/context.ts` (create); `client/src/lib/hooks/skills.ts`, `agents.ts`, `core.ts`, `index.ts`, `skills-ordering.test.tsx` (modify)
- **Change:** move `useContextDocs` (now `ContextListing`) and `useContextDoc` from `skills.ts` to `context.ts`; add `useContextRoots`, `useSetContextRoots`, `useResetContextRoots` (invalidate `["context-roots", repoId]` and `["context-docs", repoId]`). `useSkillContext`/`useSetSkillContext` typed `SkillContext` (optimistic update rewrites `links`, keeps `used_by_agents`); `agents.ts`: `useAgentContext`, `useSetAgentContext` (same optimistic pattern); `core.ts` `useContextFiles` generic → `ContextListing`; barrel exports `./context`.
- **Layer / why here:** data layer, one hook per endpoint.
- **Skills to apply:** ui, `zod`
- **Practices:** no `fetch` outside `lib/api.ts`; path segments encoded.
- **Known gotchas:** client gotchas → Tests: "spread the real module first via `importActual`"; Tooling: "use `pnpm exec vitest run <pattern>`".
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run src/lib/hooks` passes.

### S16 — Shared Markdown document preview
- **Files:** `client/src/components/context-doc-preview/DocPreview.tsx`, `index.ts`, `styles.ts`, `DocPreview.test.tsx` (create)
- **Change:** `<DocPreview repoId path />` — `useContextDoc`; loading, error and 422 (too large / refused) states; `content` rendered by the vendored `Markdown` from `@devdigest/ui`; copy in `context.json` `preview.*`.
- **Layer / why here:** shared component (page + both tabs).
- **Skills to apply:** ui
- **Practices:** no `rehype-raw`, no custom `urlTransform`, no `a` override rebuilding `href`, no vendor edit.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm exec vitest run src/components/context-doc-preview` passes incl. an XSS case: `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `[x](javascript:alert(1))`, `![y](data:text/html,x)` → no `script` element, no `onerror` attribute, link `href` empty or absent.

### S17 — Shared context-doc picker; skill Context tab on top of it
- **Files:** `client/src/components/context-doc-picker/ContextDocPicker.tsx`, `helpers.ts`, `constants.ts`, `styles.ts`, `index.ts`, `ContextDocPicker.test.tsx` (create); `client/src/lib/attachment-order.ts`, `client/src/lib/attachment-order.test.ts` (create); in `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/`: `helpers.ts`, `index.ts`, `SkillsTab.tsx`, `SkillsTab.test.tsx` (modify); in `client/src/app/skills/[id]/_components/SkillEditor/_components/ContextTab/`: `ContextTab.tsx`, `helpers.ts`, `constants.ts`, `index.ts`, `styles.ts`, `ContextTab.test.tsx` (modify); `client/messages/en/context.json`, `client/messages/en/skills.json` (modify)
- **Change:** move the skill tab's list/DnD/arrow-key/filter/preview-modal logic into `<ContextDocPicker repoId attached onChange inherited hint extraHeader />`. Rows: attached in stored order (a path absent from the listing stays, badge "not in this repo"), then inherited (`via <skill>`, checkbox disabled, not draggable), then the rest; each row: checkbox, path, `type` badge, `tokens`, Preview (`Modal` + `<DocPreview>`). Header `{attached}/{listed}` and `≈ {tokens}` over attached ∪ inherited present in the listing, each path once. Filter: case-insensitive path substring. Truncated note; empty state links to `/repos/<repoId>/context`. Skill `ContextTab` = picker + `extraHeader` "Used by N agents" + serializes-as box (`CONTEXT_HEADING`, marker `<untrusted source="<path>">`; drop `UNTRUSTED_SOURCE_PREFIX`). Picker copy in `context.json` `picker.*` (replaces the file's unused legacy keys).
- **Layer / why here:** shared component (two editors), D7.
- **Skills to apply:** ui
- **Practices:** derived values in render; helpers outside the component; ≤ 7 props; ≤ ~200 lines per component (split the row out if needed); F2: `moveId`/`toggleAttachment` move unchanged from `SkillsTab/helpers.ts` to `client/src/lib/attachment-order.ts` (their unit cases move from `SkillsTab.test.tsx` to `attachment-order.test.ts`); `SkillsTab.tsx`, the picker and its `helpers.ts` import them from `@/lib/attachment-order`; the `SkillsTab` barrel no longer re-exports them; nothing under `src/components/` imports from `src/app/`. Keep the attached row `draggable`, the reorder handle's aria-label `Reorder <path>` and the checkbox's aria-label `<path>` — the S22 e2e flow locates rows by them.
- **Known gotchas:** client gotchas → Tests: "no `@testing-library/user-event`", UI: "give every entry its own literal with `satisfies CSSProperties`".
- **Done when:** `cd client && pnpm typecheck` · `rg -n "app/agents" client/src/components` prints nothing · `cd client && pnpm exec vitest run src/lib/attachment-order src/components/context-doc-picker src/app/skills SkillsTab` asserts: toggle sends the full ordered list; ArrowDown reorders; filter `API` matches `specs/api.md`; inherited row disabled and labelled `via`; absent attached path shows "not in this repo"; `≈` counts a duplicate once; skill tab shows used-by and `## Project context`.

### S18 — Agent editor Context tab
- **Files:** `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.tsx`, `index.ts`, `ContextTab.test.tsx` (create); `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`, `constants.ts`, `AgentEditor.test.tsx`, `client/messages/en/agents.json`, `client/src/app/agents/[id]/page.tsx` (`VALID_TABS` += `"context"`) (modify)
- **Change:** tab `{ key: "context", labelKey: "editor.tabs.context", icon: "FileText" }`; `ContextTab({ agent })` = `useActiveRepo` + `useAgentContext` + `useSetAgentContext` → picker with `inherited` as `{path, skillName}`; no-repo empty state.
- **Layer / why here:** colocated feature component.
- **Skills to apply:** ui
- **Practices:** container fetches, picker renders.
- **Known gotchas:** as S17; mock hooks with `importActual`.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run src/app/agents` asserts the tab renders, checking a doc sends paths only, inherited docs show `via <skill>`.

### S19 — Project Context page
- **Files:** `client/src/app/repos/[repoId]/context/page.tsx`, `styles.ts`, `constants.ts` (create); under `client/src/app/repos/[repoId]/context/_components/`: `ContextDocList/`, `ContextRootsEditor/`, `ContextFooter/`, each `<Name>.tsx` + `index.ts` + `<Name>.test.tsx` (create); `client/messages/en/context.json` (modify)
- **Change:** thin page like `conventions/page.tsx` (`AppShell`, `RepoNotFound`, `useParams`): `ContextDocList` (path, type, tokens, select, Refresh = listing `refetch`, truncated note, empty states for "not cloned" and "no matches → search roots"); `<DocPreview>` + "Used by N agents" from the doc response; `ContextRootsEditor` (one glob per line, Save → PUT, Reset → DELETE, server 422 message, default marked); `ContextFooter` (count, Σ tokens, last sync = active repo `last_polled_at`, TQ6). Selection in component state (assumption). No edit, new or upload control. Keys `page.*`, `roots.*`, `footer.*`.
- **Layer / why here:** route + colocated feature components.
- **Skills to apply:** ui
- **Practices:** page stays thin; data via hooks; totals derived in render.
- **Known gotchas:** client gotchas → Tooling: Suspense around `useSearchParams` (if used); Tests: "`getByText` reports multiple matches" means a copy bug.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run context/` (bracket-free filter; vitest 2.1.9 does not match `\[repoId\]`) asserts: rows show path/type/tokens; Refresh refetches; Save sends the edited list and shows a 422 message; Reset calls DELETE; footer shows count, token sum, last sync; no button named Edit, Upload or New.

### S20 — Sidebar entry for Project Context
- **Files:** `client/src/vendor/ui/nav.ts` (modify — sanctioned by spec 008)
- **Change:** in `WORKSPACE` after `pulls`: `{ key: "context", label: "Project Context", icon: "FileText", href: "/repos/:repoId/context" }`, with a comment "Signed-off exception (spec 008); a vendor refresh drops this line — see client/INSIGHTS.md". No `gKey` (assumption). `activeKeyFor` already maps `/context`.
- **Layer / why here:** the one vendored file the repo edits.
- **Skills to apply:** `frontend-architecture`, `typescript-expert`
- **Practices:** one commented item; nothing else in `src/vendor/**`.
- **Known gotchas:** client gotchas → UI: "Adding a nav item to `src/vendor/ui/nav.ts` is the one sanctioned hand-edit".
- **Done when:** `cd client && pnpm typecheck` · `rg -n "repos/:repoId/context" client/src/vendor/ui/nav.ts` prints one line.

### S21 — Run trace: skipped docs and relabelled block
- **Files:** `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx`, `client/messages/en/runs.json` (modify)
- **Change:** under "Specs read", list `specs_skipped` as `path — <reason>` (`trace.config.skipReason.<enum>`); `trace.prompt.specs` → "Project context — attached specs (untrusted)"; `PromptBlock` keeps tokens, expand and copy.
- **Layer / why here:** colocated feature component.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `react-testing-library`, `typescript-expert`
- **Practices:** nullish `specs_skipped` renders nothing.
- **Known gotchas:** root INSIGHTS TS2719 entry — add `specs_skipped` to the test's trace defaults.
- **Done when:** `cd client && pnpm typecheck` · `cd client && pnpm exec vitest run RunTraceDrawer` asserts a skipped path with its reason and the new label.

### S22 — e2e flow: reorder attached documents by drag and drop
- **Files:** `e2e/specs/12-project-context.flow.json` (create); `e2e/fixtures/repos/acme/payments-api/specs/alpha.md`, `e2e/fixtures/repos/acme/payments-api/specs/beta.md` (create); `scripts/e2e.sh`, `.github/workflows/e2e-web.yml`, `e2e/docs/flows.md`, `e2e/README.md` (modify)
- **Change:** *Fixture:* the seeded repo `acme/payments-api` has no clone (`clonePath: null` in `server/src/db/seed.ts`), and the clone root defaults to the developer's `~/.devdigest/workspace` (`server/src/platform/config.ts:84-86`), so the hermetic stack lists no documents today. `scripts/e2e.sh` copies `e2e/fixtures/repos/` into a `mktemp -d` dir, exports `DEVDIGEST_CLONE_DIR` to it before the API starts, and deletes it in `cleanup`. `e2e-web.yml` does the same (copy into `$RUNNER_TEMP`, set `DEVDIGEST_CLONE_DIR` in the API start step's env). The fixtures are two short Markdown files with distinct H1s. *Flow 12:* `open {BASE}/agents` → wait for `Test Quality Reviewer` → `find text "Test Quality Reviewer" click` → `wait --fn` for a `Context` button → `find role button click --name Context --exact` → `wait --url tab=context` → `wait --load networkidle` → `wait --text specs/alpha.md`. Attach alpha, then beta: `click "[aria-label='specs/alpha.md']"`, then the same for beta, with a `wait --fn` after each until `button[aria-label='Reorder <path>']` is enabled. Drag: `drag "div[draggable='true']:has(button[aria-label='Reorder specs/beta.md'])" "div[draggable='true']:has(button[aria-label='Reorder specs/alpha.md'])"`, then `wait --load networkidle`. Reload with `open` on the same URL, then `wait --fn` that among `button[aria-label^='Reorder ']` beta's index is lower than alpha's. The `description` records the PRECONDITION (fixture clone + seeded agent) and that the flow writes, like `10-conventions`. Add the flow to the `flows.md` §3 catalogue (rename the heading to "The 12 flows today") and to the `README.md` coverage table.
- **Layer / why here:** e2e — jsdom cannot verify real HTML5 DnD (AC-21).
- **Skills to apply:** none — rules from `e2e/AGENTS.md`, `e2e/docs/flows.md` §1/§6
- **Practices:** deterministic locators only (no `chat`); the flow starts with its own `open`; number `12-` sorts after `10-conventions`, the other writing flow; never a new `npm`/`pnpm` dependency.
- **Known gotchas:** e2e gotchas → Flow grammar: no `click --text`; wait for the target before `find … click`; CI-only bare `Element not found` → click by CSS selector after a `wait --fn` guard. e2e gotchas → Local runs: run the hermetic stack, never `docker compose down -v`. *Drag:* `agent-browser drag <source> <target> [--human]` exists in 0.38.1 (`agent-browser drag --help`), but whether its CDP mouse drag fires HTML5 `dragstart`/`dragover`/`drop` is unverified. Probe it first. If the order does not change, replace the `drag` step with an `eval` step that dispatches `dragstart` on the beta row, then `dragover` and `drop` on the alpha row, then `dragend`, sharing one `new DataTransfer()` and awaiting ~50 ms between events so React flushes the `dragging` state. Record which variant shipped in the flow `description`. Do not fall back to the keyboard reorder: it would not cover DnD.
- **Done when:** `./scripts/e2e.sh` exits 0 with every flow green, including `12-project-context` and `09-skills` (whose skill Context tab copy changed in S17). The runner has no per-flow filter (`e2e/run.ts:55`), so the full run is the check.

## Migrations & contracts
- One `pnpm db:generate` after S2 (additive: `repos.context_globs`, table `agent_context_docs`).
- Contracts in S1 (mirrored). Breaking response shapes: `GET /repos/:id/context` (array → `ContextListing`) and `GET/PUT /skills/:id/context` (array → `SkillContext`); all consumers updated in S12, S15, S17.

## Out of scope
- Editing/creating/uploading documents; git sync from the page; chunking; auto-selection; coverage ring; finding "source" field.
- Any `*/src/vendor/**` edit beyond S1's contract files and S20's nav line (the `Markdown` primitive stays untouched).
- mcp-server, e2e flows other than S22's new flow 12, non-`en` locales, removing the unused `useReindexContext`.

<!-- implementer-brief:end -->

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `server/test/context-helpers.test.ts` | unit | glob match/validation, normalisation, `docType` | S3, S14 |
| `server/test/context.it.test.ts` | integration | listing, roots, guard, used-by, timing | S7 |
| `server/test/agents-context.it.test.ts` | integration | agent links, inherited, tenancy, no version | S10 |
| `server/test/skills.it.test.ts` | integration | `SkillContext`, used-by, no version | S12 |
| `server/test/context-merge.test.ts` | unit | AC-30 order + dedupe | S14 |
| `server/test/skills-in-prompt.it.test.ts` | integration | injection, labels, skips, trace | S14 |
| `reviewer-core/test/prompt.test.ts` | unit | path labels, escaping | S13 |
| `client/src/lib/hooks/skills-ordering.test.tsx` | unit | optimistic order, new shapes | S15 |
| `client/src/components/context-doc-preview/DocPreview.test.tsx` | unit | Markdown, XSS regression | S16 |
| `client/src/components/context-doc-picker/ContextDocPicker.test.tsx` | unit | AC-21–25 | S17 |
| skill + agent `ContextTab.test.tsx`, `AgentEditor.test.tsx` | unit | tabs | S17, S18 |
| `ContextDocList` / `ContextRootsEditor` / `ContextFooter` tests | unit | page | S19 |
| `RunTraceDrawer.test.tsx` | unit | AC-36, AC-37 | S21 |
| `e2e/specs/12-project-context.flow.json` | e2e (agent-browser) | AC-21 drag reorder persisted across reload | S22 |

## Context applied
- `server/insights/gotchas.md` → realpath both sides (S5), LAN routes (S5, S7, S10), additive `db:generate` + FK index (S2), run log `msg` (S14), trace polling and hermetic `.it` (S7, S14).
- `client/insights/gotchas.md` → `nav.ts` exception (S20), `fireEvent`, `importActual`, `pnpm exec vitest run`, TS2742 styles, Suspense (S15–S21).
- `reviewer-core/insights/gotchas.md` → purity (S13).
- Root `INSIGHTS.md` → shared copies drift (S1), TS2719 fixture defaults (S1, S21), auto-mode blocks migration writes (S2).
- Repo research `research-008-project-context.md` and external research `ext-research-008.md` (react-markdown 9.1.0 safe as used; picomatch options) → S3, S16, Risks.

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1, S3–S14 | |
| `engineering-insights` | preload | Context applied | |
| `zod` | on demand (S1) | S1, S7, S9–S12, S15 | |
| `typescript-expert` | on demand (S1) | all | |
| `drizzle-orm-patterns` | on demand (S2) | S2, S4, S8 | |
| `postgresql-table-design` | on demand (S2) | S2, S4, S8 | |
| `fastify-best-practices` | on demand (S7) | S7, S10, S12 | |
| `security` | on demand (S3) | S3, S5, S7, S9–S19 | |
| `frontend-architecture` | on demand (S15) | S15–S21 | |
| `react-best-practices` | on demand (S15) | S15–S19, S21 | |
| `next-best-practices` | on demand (S15) | S15–S19 | |
| `react-testing-library` | on demand (S15) | S15–S19, S21 | |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `contracts/platform.ts`, `knowledge.ts`, `trace.ts` (+ client mirror) | ports | changed |
| server | `db/schema/repos.ts`, `db/schema/agents.ts`, migration | infrastructure | changed / new |
| server | `modules/context/*`, `platform/container.ts` | all module layers, composition root | changed |
| server | `modules/agents/*`, `modules/skills/*` | repo / service / routes | changed |
| server | `modules/reviews/run-executor.ts`, `helpers.ts` | application | changed |
| reviewer-core | `prompt.ts`, `review/run.ts`, `index.ts` | core | changed |
| client | `lib/hooks/*`, `components/context-doc-picker`, `components/context-doc-preview` | data / shared UI | changed / new |
| client | `app/repos/[repoId]/context/**`, agent + skill Context tabs, `RunTraceDrawer`, `vendor/ui/nav.ts` | routes / feature UI | new / changed |
| e2e | `specs/12-project-context.flow.json`, `fixtures/repos/**`, docs; `scripts/e2e.sh`; `.github/workflows/e2e-web.yml` | e2e / tooling | new / changed |

## Design notes

### Decisions
| # | Decision | Options | Chosen | Steps affected |
|---|---|---|---|---|
| D1 | Glob matcher | A: `picomatch` direct dep · B: hand-rolled | A | Prerequisites, S3 |
| D2 | Discovery walk | A: whole-clone `readdir` + glob filter · B: ripgrep behind a port | A | S5 |
| D3 | Shared safe reader | A: context service via `container` · B: executor imports `context/helpers` | A | S5, S6, S14 |
| D4 | `PromptParts.specs` shape | A: `{path, body}[]` · B: parallel `specLabels` | A | S13, S14 |
| D5 | Token counts at list time | A: exact + 500-doc timing test · B: bytes ÷ 4 · C: A + cache | A | S5, S7 |
| D6 | Search-roots storage | A: `repos.context_globs text[]` · B: jsonb · C: table | A | S2, S4 |
| D7 | Agent tab UI | A: shared picker · B: copy | A | S17, S18 |
| D8 | Execution mode | multi-agent · single-agent | multi-agent | all |

Mode re-check against the real steps: migration (S2), contract change (S1), trust boundary (S5, S13), 4 packages, 21 steps → `multi-agent` holds.

### Glob semantics
`dot: false` (ext research R-Q2): `.git/**`, `.github/**` and hidden files never match, so `.git` needs no ignore pattern; `node_modules` is excluded by the walk and by `ignore`. Matching is case-sensitive (`nocase: false`): `README.MD` is not listed by the default glob even though the extension check is case-insensitive; a user can add a `*.MD` root. Paths are normalised before matching, so `./specs/a.md` and `specs\a.md` hit the same rule.

### Requirements review (pass 1)
TQ1–TQ6 answered with their defaults (*Decisions recorded*). REC1 → S5/S14 (closes the existing executor symlink read), REC2 → S13, REC3 → S17. GAP1 closed by the spec correction to AC-14 and AC-27.

## Risks & open questions
- S7's 2 s timing test may fail on a slow CI runner; the spec allows a bytes ÷ 4 fallback. If it fails, the main session decides (fallback or looser CI bound), not the implementer.
- The whole-clone walk also visits non-document trees (e.g. `src/`) up to depth 6 — bounded but unmeasured on very large repos.
- `MAX_WALK_DEPTH` becomes root-relative (TQ2): very deep docs listed today (e.g. `docs/a/b/c/d/e/f.md`) may drop out.
- Remote `https` images in a previewed document load in the studio (a tracking beacon, not XSS), and links open in the same tab; avoiding that needs a wrapper around the vendored `Markdown` — not planned (ext research R-Q1).
- Drizzle's rendering of an array `DEFAULT` containing `{…}` is checked in S2; if it is wrong, stop and report — never hand-edit the migration.
- e2e flow `09-skills` walks the skill Context tab whose copy changes in S17 — S22's Done-when runs it.
- S22: whether agent-browser 0.38.1 `drag` fires HTML5 DnD events is unverified; the `eval`-dispatched DragEvent fallback is planned in the step. If neither reorders, stop and report — the main session decides; do not swap in a keyboard reorder.
- S22: pointing `DEVDIGEST_CLONE_DIR` at a fixture dir with no `.git` also changes what other code paths see for `acme/payments-api` (`conventions/service.ts:112`, the ripgrep code index). Flows 02/04/05/10 must stay green in the same full run; if one breaks, stop and report.
- S22 edits `.github/workflows/e2e-web.yml`; the CI result is only visible after a push.
- Doc vs code: `client/messages/en/context.json` holds unused legacy prototype keys (`resync`, `mode.edit`); S17/S19 replace them.

## Handed off
- architecture-reviewer: `ContextService` deps and `container.context` (S5, S6); removal of the `reviews → context` import edge (S14); picker/preview placement under `src/components/` (S16, S17).
- security review: path guard + realpath (S5), glob validation (S3), `ContextDocPath` refinement (S1), label escaping (S13), Markdown preview (S16), workspace scoping of new routes (S7, S10).

## Insights to record
- `server/INSIGHTS.md` · What Doesn't Work — the executor's context read used `stat` without a realpath re-check, so an in-allowlist committed symlink was read into the prompt (`server/src/modules/reviews/run-executor.ts` `buildContextDocs`, before S14). Record once S14 lands.
- `reviewer-core/INSIGHTS.md` · Codebase Patterns — `wrapUntrusted` labels must be escaped once they carry repo data (`reviewer-core/src/prompt.ts:30-34`).

## Red-flags check
- [x] Every spec AC-n has a row in *Spec traceability* with a step or test
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; technical choices are in *Decisions needed*, product gaps are GAPn
- [x] Groups end type-checking; parallel groups share no file (all sequential)
- [x] No group under 3 files / ~80 lines that could merge with a neighbour
- [ ] The brief above the marker is under ~20,000 characters — see the summary for the measured size
- [x] Execution mode recommended per the D4 rule
- [x] Every step's *Skills to apply* is complete
- [x] `bash .claude/skills/sdd/scripts/sdd.sh plan-lint <plan>` prints `plan-lint: ok`

## Handoffs → G1

### Handoff to the next group
- Shared contracts (server + client copies): `platform.ts` — `DEFAULT_CONTEXT_ROOTS`, `ContextDocType`, `ContextListing`, `ContextRoots`, `SetContextRootsBody`, `ContextDocPath`, `ContextPathsBody`, `SpecFile` + nullish `type`/`tokens`/`used_by_agents`; `knowledge.ts` — `AgentContextLink`, `InheritedContextDoc`, `AgentContext`, `SkillContext`; `trace.ts` — `ContextSkipReason`, `SpecSkipped`, `RunTrace.specs_skipped` (nullish).
- Schema: `repos.contextGlobs` (text[] not null default) in `db/schema/repos.ts`; `agentContextDocs(agentId, path, order)` in `db/schema/agents.ts`. Migration `0022_pink_namor.sql` (add-only).
- `server/src/modules/context/helpers.ts`: `normaliseDocPath(raw)`, `compileRoots(globs)`, `validateRootGlob(glob)`, `resolveContextPath(cloneDir, requested, isRoot)` → `{abs, rel}` | `{refused: 'outside_search_roots' | 'outside_clone'}`, `docType(rel)`.
- Constants: `EXCLUDED_DIRS`, `MAX_ROOT_GLOBS` (20), `MAX_GLOB_LENGTH` (256). `resolveDocPath` / `CONTEXT_FOLDERS` kept until S14 deletes them.
- Glob count/length caps are enforced only in the service (S5).
- Review note: `ContextDocPath`, `validateRootGlob`, `compileRoots` over untrusted globs are new input guards.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S1–S3 | |
| zod | on demand | S1 | |
| typescript-expert | on demand | S1, S3 | |
| drizzle-orm-patterns | on demand | S2 | |
| postgresql-table-design | on demand | S2 | PK leads with FK column, no extra index |
| security | on demand | S1, S3 | |
| engineering-insights | preload | — | no insight |

## Handoffs → G2

### Handoff to the next group
- `container.context: ContextService` (`server/src/platform/container.ts`), constructed with `{ db, git, tokenizer }`.
- Methods: `list(ws, repoId)` → `ContextListing | undefined`; `getDoc(ws, repoId, path)` → `SpecFile | undefined`; `getRoots` / `setRoots(ws, repoId, globs)` / `resetRoots` → `ContextRoots | undefined`; `readDocsForRun({owner, name, contextGlobs}, paths)` → `{docs: {path, body}[], skipped: SpecSkipped[]}` — never throws, input order kept.
- `ContextRepository.getRepoRef` returns `contextGlobs`; S14 passes the repo's `contextGlobs` into `readDocsForRun`.
- Skipped entries keep the requested path; read docs use the normalised relative path.
- `resolveDocPath` / `CONTEXT_FOLDERS` still in helpers/constants (unused by service) — S14 deletes them.
- `GET /repos/:id/context` now returns `ContextListing` (breaking: array → object); client consumers updated in G5.
- `agentCountForPath` (ContextRepository): one SQL over agents ∪ direct `agent_context_docs` ∪ enabled-skill `skill_context_docs`, workspace-scoped.
- Not run: `skills.it.test.ts` (G3/S12 owns it); `depcruise` is not a script here.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S4–S7 | |
| typescript-expert | on demand | S5, S6 | |
| zod | on demand | S7 | |
| security | on demand | S5 | |
| drizzle-orm-patterns | on demand | S4 | |
| postgresql-table-design | on demand | S4 | no schema change in this group |
| fastify-best-practices | on demand | S7 | |
| engineering-insights | preload | — | no insight |

## Handoffs → G3

### Handoff to the next group
- `AgentsRepository.listContextDocs(agentId)` → `{path, order}[]`; `setContextDocs(agentId, paths)` → void; `inheritedContextDocs(agentId)` → `{path, skillId, skillName}[]` (enabled skills only, link order then doc order).
- S14: executor calls `listContextDocs` + `inheritedContextDocs`, merges with `mergeContextPaths`, then `container.context.readDocsForRun(...)` with the repo's `contextGlobs`.
- `AgentsService.contextLinks` / `setContextLinks` → `AgentContext | undefined` (tenancy check first; no version bump).
- `GET/PUT /agents/:id/context` → `AgentContext`; `GET/PUT /skills/:id/context` → `SkillContext` (breaking: array → object; client in G5). Invalid PUT paths → 4xx via shared `ContextPathsBody`.
- Review notes: `ContextPathsBody` is the only save-time gate (paths validated again at read); `inheritedContextDocs` reads `skills`/`skill_context_docs` directly from the agents repository.
- Process note: the implementer read only the first ~2500 chars of several skill files (headers only).

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S8–S12 | |
| engineering-insights | preload | gotchas read | no insight |
| drizzle-orm-patterns, postgresql-table-design | on demand, headers only | S8 | |
| typescript-expert, zod, security | on demand, headers only | S9–S12 | |
| fastify-best-practices | on demand, first ~2500 chars | S10, S12 | |

## Handoffs → G4

### Handoff to the next group
- reviewer-core exports `ContextDoc { path; body }`; `PromptParts.specs` and `reviewPullRequest` input `specs` are `ContextDoc[]`. `wrapUntrusted` escapes every label (`escapeLabel`: control chars → space, `& " < >` entities).
- `RunTrace.specs_skipped: SpecSkipped[]` (`{path, reason}`) persisted; empty/cancelled traces write `[]`.
- Run log: `project context: N document(s) attached — …; skipped K: path (reason), …`.
- `resolveDocPath`, `CONTEXT_FOLDERS`, `ContextFolder` removed.
- Client (S21): check `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/constants.ts` (`specs:`); add `specs_skipped` to the drawer test's trace defaults (TS2719 risk).
- Deviations (trivial): `prompt-callers.test.ts`, `prompt-structured.test.ts` fixtures moved to `{path, body}` (outside S14 Files); the escape `.it` case now plants the row directly (reason `outside_clone`).
- Review notes: `escapeLabel` (prompt injection via file paths); `buildContextDocs(repo, agentId, runLog)` goes through `container.context.readDocsForRun`.
- Insight candidate: a reviewer-core input-type change breaks server unit-test fixtures that `pnpm typecheck` in server/ does not see (tests outside its tsconfig) — run the unit suite.
- Process note: `typescript-expert` and `security` read only ~150 lines, despite the full-read instruction.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S13, S14 | |
| engineering-insights | preload | gotchas read | no insight |
| typescript-expert | on demand, first ~150 lines | S13, S14 | |
| security | on demand, first ~150 lines | S13, S14 | |

## Handoffs → G5

### Handoff to the next group
- Hooks `client/src/lib/hooks/context.ts` (barrel-exported): `useContextDocs(repoId)` → `ContextListing` (`["context-docs", repoId]`), `useContextDoc(repoId, path)` (`retry: false`), `useContextRoots(repoId)` (`["context-roots", repoId]`), `useSetContextRoots()` `{repoId, globs}`, `useResetContextRoots()` `{repoId}` — both write the roots cache and invalidate the listing.
- `agents.ts`: `useAgentContext(id)` → `AgentContext` (`["agent-context", id]`), `useSetAgentContext()` `{id, paths}` optimistic. `useSkillContext` / `useSetSkillContext` use `SkillContext`.
- Components: `<DocPreview repoId path />` (`@/components/context-doc-preview`); `<ContextDocPicker repoId attached onChange inherited? hint? extraHeader? />` (`@/components/context-doc-picker`, `inherited: InheritedDoc[] = {path, skillName}[]`); render the picker only with non-null `repoId`.
- i18n `context.json`: `preview.*`, `picker.*` exist; G6 adds `page.*`, `roots.*`, `footer.*`.
- Tests mocking `@/lib/hooks/context` need `useContextDocs` and `useContextDoc`; the agent ContextTab test (S18) also mocks `@/lib/repo-context`.
- Nav (S20) and RunTraceDrawer (S21) untouched.
- Deviations (trivial): `DocRow.tsx` split; `core.ts` imports `ContextListing` from `@devdigest/shared`; native disabled checkbox for inherited rows (vendored `Checkbox` has no `disabled`); unused skills.json keys removed; `SkillEditor.test.tsx` has dead context-hook mocks.
- Review notes: picker in shared `src/components` imports `moveId`/`toggleAttachment` from the agent route's SkillsTab barrel (plan-mandated); DocPreview uses vendored Markdown without rehype-raw/href override.
- Main-session check: all `client/messages/en/*.json` parse; DocPreview XSS test rerun 5/5.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | — | no server/core layer touched |
| engineering-insights | preload | gotchas read | no insight |
| frontend-architecture | full SKILL.md | S16, S17 | |
| react-best-practices | full SKILL.md | S16, S17 | |
| next-best-practices | full SKILL.md | S16, S17 | |
| react-testing-library | full SKILL.md | S15–S17 | fireEvent per repo gotcha |
| typescript-expert | full SKILL.md | S15–S17 | |
| security | full SKILL.md | S16, S17 | |
| zod | full SKILL.md | S15 | |

## Handoffs → G6

### Handoff to the next group
None — last group. Main session: full `.it` suite, then test-writer / plan-verifier / reviewers.
- Out-of-plan edit (pending user decision): `client/src/app/agents/[id]/page.tsx` `VALID_TABS` += `"context"` — required for `?tab=context`; not in any step's Files.
- Deviations (trivial): vitest filter with `[repoId]` matches nothing → ran `context/_components`; no page-level test of mutation wiring (Refresh/422/Reset covered at component level); footer uses `Date.toLocaleString`; skipped lines reuse `s.spec` style (`RunTraceDrawer/styles.ts` not edited); agent `context.*` keys in `agents.json`.
- Nav item in `client/src/vendor/ui/nav.ts` with the sanctioned-exception comment (spec 008).
- Not verified: browser rendering; e2e.
- Review notes: roots textarea sends raw globs (server validates); 422 shown as plain text in `role="alert"`.
- Insight candidates: vitest path filters with `[brackets]` match nothing; `next dev` regenerating `.next/types` gives a transient `AppRoutes` typecheck error; a new agent-editor tab needs its key in `VALID_TABS`.
- Process note: `typescript-expert` (~60 lines) and `security` (80 lines) read only partly.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | — | no server/core layer touched |
| engineering-insights | preload | gotchas read | no insight |
| frontend-architecture | full SKILL.md | S18–S21 | |
| react-best-practices | full SKILL.md | S18, S19, S21 | |
| next-best-practices | full SKILL.md | S19 | |
| react-testing-library | full SKILL.md | S18, S19, S21 | fireEvent per repo gotcha |
| typescript-expert | first ~60 lines | S18–S21 | not read in full |
| security | first 80 lines | S18, S19 | not read in full |

## Follow-ups
- 2026-10-05 F3: rename client/src/components/context-doc-preview/ so folder and component name match (doc-preview/ or ContextDocPreview)
- 2026-10-05 F4: move context-doc-picker/DocRow.tsx into DocRow/{DocRow.tsx,index.ts}
- 2026-10-05 audit: pnpm audit --prod in server/ shows 18 pre-existing advisories (14 high) in fastify <5.12.5, fast-uri, drizzle-orm <0.45.2, find-my-way, form-data — none from picomatch
- 2026-10-05 product: a user root under a dot-dir (e.g. .github/**/*.md) lists and reads nothing (picomatch dot:false + SF1 dot-segment rule) — decide whether .github docs should be supported
- 2026-10-05 e2e flake: on a cold next dev, flows 11/12 hit 25 s wait timeouts once and passed on re-run — watch CI
- 2026-10-05 plan text: S17 Practices says to keep the checkbox aria-label <path>, but attachable rows never had one (vendored Checkbox); flow 12 locates rows via the 'Reorder <path>' handle — consider adding an aria-label to the vendored Checkbox usage
- 2026-10-05 CI: flow 12 uses 'find role button click --name Context'; per e2e gotcha this can fail CI-only — watch the first CI run
- 2026-10-05 dead code: client/src/lib/hooks/core.ts useContextFiles / useReindexContext have no consumers; POST /repos/:id/context/reindex does not exist
- 2026-10-05 stale comment: reviewer-core/src/review/run.ts:34 says specs are resolved strings; now ContextDoc[]
- 2026-10-05 AGENTS.md: e2e/AGENTS.md:42 'flows target read-only seeded data' — flows 10 and 12 write; suggested Gotchas lines for server (read context docs only via container.context) and client (new agent-editor tab needs VALID_TABS) — need user OK
- 2026-10-05 skill drift: devdigest-appsec anchors for prompt.ts moved; onion skill drift lists — verify and refresh
- 2026-10-05 PSR-UI-H1: ContextDocPicker owners (agent/skill tabs) show no error when the replace-all PUT fails — the optimistic cache silently rolls back
- 2026-10-05 PSR-UI-H2: useSetAgentContext onSuccess invalidates every ['context-doc'] query (refetches all open previews' Markdown) — scope to ['context-doc', repoId, path] or refetchType 'active'
- 2026-10-05 PSR-UI-H3: Project Context page rootsError keeps a stale Save/Reset error after the other mutation succeeds — reset() the other mutation
- 2026-10-05 PSR-UI-M: roots section hidden with no ErrorState when useContextRoots fails; cloned flag false while repos load; DEFAULT_DOC_TYPE defined twice; attachedPaths duplicated; TraceBody skipped keys by index; vi.mock barrel without importActual in 3 tests
- 2026-10-05 PSR-BE-H1: every GET /repos/:id/context reads up to 500×512 KB to count tokens — estimate in the listing or cache by (path, mtime, size)
- 2026-10-05 PSR-BE-H2: the whole-clone walk caps listed docs, not visited entries — add a visited-entries cap and prune dirs no root can match
- 2026-10-05 PSR-BE-M: depth-6 walk can omit deep docs that getDoc still reads; SetContextRootsBody has no .max() in the shared contract; agent/skill context paths stored unnormalised (./specs/a.md) so used_by_agents can under-count — normalise on write
- 2026-10-05 PSR1 tests: pin MAX_DOUBLE_STARS (3 '**' refused) and the '/'-inside-braces refusal

## Handoffs → fix-1

### Fix mode 1 — SF1, F1, F2, SK2/4/7/8/15/18, MS1
- SF1: `readSafely` re-applies roots + `.md` + no dot-dir segment to the realpath'd target's repo-relative form → `outside_search_roots` (HTTP 422). `.it` covers `docs/x.md -> ../.git/config` and `docs/y.md -> ../.github/docs/b.md` on doc read and `readDocsForRun`.
- F1: `ContextServiceDeps.tokenizer: Container['tokenizer']` (type-only import of `platform/container.js`).
- F2: `moveId`/`toggleAttachment` → `client/src/lib/attachment-order.ts` (+test); SkillsTab barrel no longer re-exports them.
- SK4: `agentCountForPath` rewritten with Drizzle `exists()` subqueries (same semantics).
- SK18 + MS1: agent and skill ContextTab show Skeleton while loading and ErrorState+retry on error (fixes first-toggle overwrite of unloaded links); keys `agents.json` / `skills.json` `context.loadError`.
- SK2/7/8/15: re-checked, no change.

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S5, S7, S8 | |
| drizzle-orm-patterns | on demand | S2, S4, S8 | S2/S8 no change needed |
| postgresql-table-design | on demand | S2, S4, S8 | |
| typescript-expert | on demand | S2, S4, S7, S8, S15, S17, S18 | |
| zod | on demand | S7 | S15, S18: no schema boundary on the client |
| security | on demand | S5, S7, S15, S17 | S2, S4, S8, S18: no new trust boundary |
| fastify-best-practices | not re-read | S7 | route code unchanged |
| frontend-architecture | on demand | S15, S17, S18 | |
| react-best-practices | on demand | S15, S17, S18 | |
| next-best-practices | on demand | S15, S18 | no RSC/metadata surface |
| react-testing-library | on demand | S15, S17, S18 | fireEvent per repo gotcha |

## Handoffs → G7

### Handoff → G7 (S22) + fix G7-IGN
- New flow `e2e/specs/12-project-context.flow.json`: native `agent-browser drag` (0.38.1) fires HTML5 DnD; rows located via `Reorder <path>` handle (attachable-row checkbox has no aria-label); persistence checked by reopening the agent via `/agents`.
- Fixtures `e2e/fixtures/repos/acme/payments-api/specs/{alpha,beta}.md` (renamed from `fixtures/clones`, which root `.gitignore` `clones/` hid); `scripts/e2e.sh` copies them to a `mktemp -d` and exports `DEVDIGEST_CLONE_DIR`; `e2e-web.yml` does the same into `$RUNNER_TEMP/clones`.
- `./scripts/e2e.sh`: 12/12 passed (after G7); after the rename run 1 failed on two 25 s cold-start timeouts (flows 11, 12), run 2 passed 12/12 with no change. CI workflow not run (needs a push).

### Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | — | no server code |
| engineering-insights | preload | — | no insight |

## Verification log
- 2026-10-05 agent: spec-p1 a790b313195e53d9b spec-creator 2026-10-05T09:13:27Z
- 2026-10-05 agent: spec-p2 a790b313195e53d9b spec-creator 2026-10-05T09:36:21Z
- 2026-10-05 agent: research a3508178e9a7139a7 researcher 2026-10-05T09:44:19Z
- 2026-10-05 agent: plan-p1 a509f0396989f7a0b implementation-planner 2026-10-05T09:46:52Z
- 2026-10-05 decisions recorded: TQ1-6 defaults, GAP1 answered (disabled skill not counted, disabled agent counted), D1-D7 A, D8 multi-agent
- 2026-10-05 agent: spec-p2 a790b313195e53d9b spec-creator 2026-10-05T09:49:52Z
- 2026-10-05 spec 008 re-approved after GAP1 correction
- 2026-10-05 agent: ext-research abcf0141cbb6766fe researcher 2026-10-05T09:51:49Z
- 2026-10-05 agent: plan-p2 a509f0396989f7a0b implementation-planner 2026-10-05T10:02:35Z
- 2026-10-05 plan approved by user
- 2026-10-05 prerequisite: main session ran pnpm add picomatch@^4.0.4 (4.0.4) and -D @types/picomatch (4.0.3) in server/
- 2026-10-05 agent: implement adb5180e8e7d5b10f implementer 2026-10-05T10:12:56Z
- 2026-10-05 implement G1: done (S1-S3; typecheck server+client ok; 546 unit tests; context-helpers 21 passed; migration 0022 add-only)
- 2026-10-05 main session: pnpm db:migrate applied 0022
- 2026-10-05 agent: implement a161f1b1ca9ea2ce3 implementer 2026-10-05T10:15:25Z
- 2026-10-05 implement G2: done (S4-S7; typecheck ok; 546 unit; context.it 11 + helpers 21 passed; main-session rerun context.it 11/11)
- 2026-10-05 agent: implement a633a691e979ce813 implementer 2026-10-05T10:17:18Z
- 2026-10-05 implement G3: done (S8-S12; typecheck ok; 546 unit; agents-context.it 5 + skills.it 23; main-session rerun 28/28)
- 2026-10-05 agent: implement a05c6c9bad20e9811 implementer 2026-10-05T10:20:13Z
- 2026-10-05 implement G4: done (S13-S14; core 218 tests; server typecheck ok, 537 unit; skills-in-prompt.it 12 + context.it 11; main-session rerun skills-in-prompt 12/12)
- 2026-10-05 agent: implement aaa4fa2e3f094fdd1 implementer 2026-10-05T10:25:17Z
- 2026-10-05 implement G5: done (S15-S17; client typecheck ok; 48 files / 381 tests; main-session rerun DocPreview 5/5, locale JSON valid)
- 2026-10-05 agent: implement abda0247d7ab575ab implementer 2026-10-05T10:29:31Z
- 2026-10-05 implement G6: done (S18-S21; client typecheck ok; 52 files / 393 tests; out-of-plan edit agents/[id]/page.tsx VALID_TABS pending user decision)
- 2026-10-05 plan change (user-approved): S18 Files += client/src/app/agents/[id]/page.tsx (VALID_TABS)
- 2026-10-05 plan re-approved by user after S18 Files change
- 2026-10-05 agent: tests a65de5fab1fa8ad27 test-writer 2026-10-05T10:51:25Z
- 2026-10-05 tests: test-writer added context-read-guard, context-run-order.it, context page.test, extended context-helpers + reviewer-core prompt.test; found defect TW1 (same doc under two spellings attached twice)
- 2026-10-05 main-session fix: TW1 — readDocsForRun dedupes on resolved rel path (server/src/modules/context/service.ts, S5 Files); typecheck ok; 4 files / 35 tests passed
- 2026-10-05 it-suite: server full vitest (unit + .it) 73 files / 721 tests passed
- 2026-10-05 agent: review af7a4d374387b08b6 security-reviewer 2026-10-05T10:55:04Z
- 2026-10-05 agent: review a1c18e4ed10882cae architecture-reviewer 2026-10-05T10:55:19Z
- 2026-10-05 agent: review a09c9fe3f2f2261bc plan-verifier 2026-10-05T10:57:08Z
- 2026-10-05 review 1 triage: fix SF1, F1, SK2/4/7/8/15/18; plan-change F2, SK3/SK5, D32 (user-approved); follow-up F3, F4, audit; sign-off SP-AC-21, R4
- 2026-10-05 agent: plan-p2 a509f0396989f7a0b implementation-planner 2026-10-05T11:00:49Z
- 2026-10-05 plan re-approved (user-approved change: F2 attachment-order lib, zod off S3/S5, D32 filter, SF1+F1 in S5)
- 2026-10-05 agent: fix-loop acc153bdc6137250d implementer 2026-10-05T11:03:34Z
- 2026-10-05 fix 1: SF1, F1, F2, SK4, SK18 done (+ agent ContextTab loading-overwrite bug); SK2/7/8/15 no change; server 550 unit + 54 .it, client 399 passed
- 2026-10-05 main-session gap MS1: skill ContextTab renders the picker before useSkillContext loads (attached=[]), so a first toggle overwrites stored links — same bug as fixed in the agent tab (S17 Files)
- 2026-10-05 agent: fix-loop acc153bdc6137250d implementer 2026-10-05T11:04:24Z
- 2026-10-05 fix MS1 done (skill ContextTab loading/error guard); it-suite: server full vitest 73 files / 722 passed; reviewer-core 223; client 400 (implementer)
- 2026-10-05 agent: review a22fcc0ab24f2b2b3 architecture-reviewer 2026-10-05T11:05:52Z
- 2026-10-05 agent: review a793316847ed6b1ee security-reviewer 2026-10-05T11:05:59Z
- 2026-10-05 agent: review a37447449ef371e56 plan-verifier 2026-10-05T11:07:29Z
- 2026-10-05 review iteration 1: fix 6 (SF1, F1, F2, SK*, MS1), plan-change 3 (F2, SK3/SK5, D32), trivial 1 (TW1), follow-up 4, sign-off 1 (SP-AC-21); delta re-review: security PASS, architecture PASS, verifier complete — needs sign-off; tree 1028e3cd16924c36186583bcd2e7f610b4b30097
- 2026-10-05 sign-off: user chose to cover SP-AC-21 with a drag-and-drop e2e flow → plan change
- 2026-10-05 agent: plan-p2 a509f0396989f7a0b implementation-planner 2026-10-05T11:10:28Z
- 2026-10-05 plan re-approved by user: G7/S22 e2e drag-and-drop flow (fixture clone, scripts/e2e.sh, e2e-web.yml)
- 2026-10-05 agent: implement aac864121c9ef9b57 implementer 2026-10-05T11:14:23Z
- 2026-10-05 plan change (user-approved): S22 fixture folder e2e/fixtures/clones → e2e/fixtures/repos (root .gitignore 'clones/' hid the fixtures from git/CI); .gitignore untouched
- 2026-10-05 agent: fix-loop aac864121c9ef9b57 implementer 2026-10-05T11:21:34Z
- 2026-10-05 implement G7 + fix G7-IGN: done; e2e 12/12 (one earlier run had cold-start timeouts in flows 11/12)
- 2026-10-05 agent: review acdd29b3ac025fd4a security-reviewer 2026-10-05T11:22:24Z
- 2026-10-05 agent: review a3570b944897c179d plan-verifier 2026-10-05T11:23:43Z
- 2026-10-05 main session: ./scripts/e2e.sh → 12/12 flows passed, exit 0 (closes D22 / SP-AC-21); e2e-web.yml unrun until a push
- 2026-10-05 sign-off: user accepted the unrun e2e-web.yml change (needs a push)
- 2026-10-05 insights: server (SF1 realpath allowlist), client (replace-all PUT loading guard; vitest bracket filter), e2e (agent-browser drag), root (.gitignore clones/; server tests outside typecheck); gotchas updated for server/client/e2e
- 2026-10-05 agent: docs aaf715c2275cb4310 doc-writer 2026-10-05T11:29:37Z
- 2026-10-05 docs: server/docs/architecture.md §9 (+Mermaid), reviewer-core/docs/pipeline.md, client/docs/ui-architecture.md §8, server+client README, e2e flows.md/README
- 2026-10-05 self-review: BLOCKED — PSR1 CRITICAL verified (ReDoS: user root glob '**/'+'*a'×20+'*b.md' vs 40-char name hangs picomatch >40 s, reproduced by main session); plan reopened for fix mode (S3 Files: context/helpers.ts + context-helpers.test.ts)
- 2026-10-05 agent: fix-loop acb6ae151cc3b08c6 implementer 2026-10-05T11:38:04Z
- 2026-10-05 fix PSR1: validateRootGlob structural caps (≤2 wildcards/segment, no extglob/nested braces/ranges/'/' in braces) + tests (implementer); main-session fix: PSR1b — MAX_DOUBLE_STARS 4→2 (constants.ts, S3 Files): 4 '**' measured ~2 s on a 245-char path, 2 stays <20 ms at 515; context-helpers + context.it 29/29
- 2026-10-05 it-suite after PSR1: server full vitest 73 files / 725 passed
- 2026-10-05 agent: review ac31fb9ca2bd57345 plan-verifier 2026-10-05T11:40:20Z
- 2026-10-05 PSR1 delta verification: complete (S3 Done-when, AC-1..4, default glob ok). Stored pre-PSR1 globs: none can exist (repos.context_globs is new in this plan).
- 2026-10-05 insights: + server PSR1 (picomatch glob shape caps) and its gotcha item
- 2026-10-05 self-review: PASS after PSR1 fix (0 verified CRITICAL; 6 HIGH + 12 MEDIUM → Follow-ups)
- 2026-10-05 metrics: flags: 0 flag(s), 0 repeat(s)
- 2026-10-05 correction: self-review warnings are 5 HIGH (3 UI, 2 backend) + 13 MEDIUM, not 6 + 12
