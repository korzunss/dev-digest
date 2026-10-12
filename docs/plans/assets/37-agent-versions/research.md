# Repo research — agent Versions tab (spec 012)

Researcher report (repo mode, read-only), 2026-10-12, saved by the main session. Spec: `specs/012-agent-versions.md` (AC-1…AC-29). Facts unless marked *inference*.

## Answer
- The skill Versions feature is a ready template: list / diff / restore routes, a nullable `message` column, a client tab on `parsePatch` + `CodeLine`; its restore is a plain update that appends a version.
- Agents already have `GET /agents/:id/versions[/:version]`, an `AgentVersion` contract (server copy only), `lockById` and `update(..., {bumpVersion})`. `AgentsService.promote` already does "append a version + restore the skill set" in one locked transaction, so Restore can share it.
- AC-23: drop the `name`/`description` clauses of `isConfigChange`. AC-22: `setSkills`/`linkSkill` lock the row, compare old/new ordered ids, and `update({}, {bumpVersion:true})` in one transaction.

## Q1 Skill Versions (template)
- Routes `GET /skills/:id/versions`, `GET …/versions/diff?from&to`, `POST …/versions/:version/restore` — `server/src/modules/skills/routes.ts:18-20,148,164,204`. Restore body `z.object({ message: z.string().min(1).optional() }).default({})` (`:82`). Update body has `message` (`:63-66`), stored only when the body changed.
- Diff server-side via `createTwoFilesPatch` (`diff` ^9) — `skills/service.ts:174-195`; DTO `{from,to,patch}` declared locally on both sides (`service.ts:65`, `client/src/lib/hooks/skills.ts:238`), no shared contract.
- Restore = `repo.update({body, message: message ?? 'Restored v'+version})` (`service.ts:203-224`); restoring the current body → 422. Client always sends "Restored from v{version}" (strings differ from the server fallback).
- `skill_versions(skillId, version, body, message text NULL, createdAt)` (`schema/skills.ts:42-56`); column added in `migrations/0014_typical_lifeguard.sql:16`. Contract `SkillVersion` (`shared/contracts/knowledge.ts:138-146`).
- Client: hooks `useSkillVersions`, `useVersionDiff`, `useRestoreSkillVersion` (`lib/hooks/skills.ts:34-40,238-285`); `SkillEditor/_components/VersionsTab/` (VersionsTab 129 lines, helpers, constants, styles, test 205 lines); restore confirm is `window.confirm` (cannot list skills or warn); i18n `skills.json:241-253`; skill "What changed" note in `SkillEditor/.../ConfigTab.tsx:33,78-79,146-150`.
- **No message length limit exists** (skill `message` is `min(1)` only; 1 MB bodyLimit). Max-length idioms: `shared/contracts/platform.ts:337-344`. No client `maxLength` precedent.
- Reusable (inference): `parsePatch` (`components/diff-viewer/helpers.ts:12`), `CodeLine` (deep import), `ConfirmModal` (danger/Trash, string body — needs `children` or a new modal), eval `PromoteConfirm` pattern (lists restore + missing skills), eval `SkillsDiff` (no order-change case), `skillSetDiff` (`eval/pipeline-scoring.ts:159-177`, order-blind, needs names), eval `promptDiff` (`diffLines`, not hunked).

## Q2 Agent versioning today
- `agent_versions(agentId, version, configJson NOT NULL, createdAt)`, no `message` (`schema/agents.ts:47-58`). Snapshot `{provider, model, system_prompt, output_schema, strategy, ci_fail_on, repo_intel, skills: ids}` (`agents/repository.ts:172-191`, `onConflictDoNothing`).
- `update` bumps on `isConfigChange || bumpVersion` with an unlocked `getById` (`repository.ts:135-168`). `isConfigChange` includes `name` (`helpers.ts:76`), `description` (`:77`); `outputSchema !== undefined` counts as a change even if equal (`:84`). Comment at `helpers.ts:46-57`.
- `toAgentVersionDto` parses with `AgentVersionConfig.parse` → a malformed row 500s the list (`helpers.ts:35-42`).
- Contracts `AgentVersionConfig`, `AgentVersion` in server `knowledge.ts:504-522`; **missing from the client vendored copy** (copies already drifted elsewhere).
- `setSkills` (`agents/service.ts:205-215`) and `linkSkill` (`:308-321`) neither lock nor bump; the single-link route exists (`routes.ts:61-70,160-163`). Built-in sync locks and bumps (`service.ts:224-259`, `sync-builtin.ts:34-38`).
- Seeds insert agents with `version: 1` and **no `agent_versions` row** (`db/seed.ts:243-248,299-307`).
- Race today: concurrent PUTs both compute `version+1`; the second snapshot is silently dropped by `onConflictDoNothing` (inference).
- Tests: `agents-sync-builtin.it.test.ts:270-279` ("setSkills … does not bump the version") **breaks under AC-22**; others read as unaffected (`agents-versions.it`, `agents-context.it:192-202`, `eval-pipeline-runs.it:139-187`, `eval-pipeline-views.test.ts:92`). No unit test for `isConfigChange`.

## Q3 Promote
- Eval side `pipeline-service.ts:645-663`: config from `agents.versionConfig(run.agentId, run.agentVersion)` (missing → 422 `version_config_missing`), **skills from the run's recorded `run.skills`**, missing skills silently dropped. Port `EvalPromotePort` (`eval/types.ts:89-95`), wired `container.ts:286-291`.
- Agents side `service.ts:267-305`: `AgentVersionConfig.omit({skills})` safeParse → 422; `assertSkillsInWorkspace` before the lock; one transaction `lockById` → `setSkills` → `update(…, {bumpVersion:true})`; output_schema restored only if non-null and different (`:284-286`). Returns `{version}`. No message today.
- Restore can share it (inference): add a `message` input; a Restore wrapper loads `getVersion`, takes skills from `config.skills`, computes existing/missing for the confirm, guards "target is current".

## Q4 Migration
- Next is `0026_*` via `cd server && pnpm db:generate`; nullable add needs no `--custom` stub; never hand-edit migrations; `pnpm db:migrate` by hand. `AgentVersionRow` (`db/rows.ts:13`) picks up `message`.
- AC-28 limit: add `.max(N)` on the route bodies (shared constant) → 422; UI keeps edits (inline check). CHECK via `check()` possible but optional.

## Q5 Save flows
- Config tab sends the whole form each save via `useUpdateAgent` (`ConfigTab.tsx:55-76`; hook `lib/hooks/agents.ts:51-72`); `output_schema` never sent. `UpdateAgentBody` strict, no `message` (`agents/routes.ts:48-59,111-120`). A note on a save that creates no version would be dropped (inference).
- **Skills tab autosaves per click/keystroke/drop** (`SkillsTab.tsx:33,35-47,120-123`) via `useSetAgentSkills` (`lib/hooks/skills.ts:127-158`), which does not invalidate `["agent", id]`. With AC-22 every click is a version and there is nowhere to put a note (AC-25) — spec is silent.

## Q6 Keys and models
- `GET /settings/secrets-status` → booleans per provider (`settings/routes.ts:43-51`), hook `useSecretsStatus()` (`lib/hooks/core.ts:57-63`). Models `GET /providers/:id/models` returns `[]` on missing key or failure (`agents/service.ts:345-352`), hook `useProviderModels`. Check "unknown model" only when the key is present.

## Q7 Tab routing
- `VALID_TABS` in `client/src/app/agents/[id]/page.tsx:15`; `TABS` in `AgentEditor/constants.ts:11-16`; `AgentEditor.tsx:25-33` is an if-chain (no `PANES`). Labels `agents.json:49-57` (`editor.tabs.*`). `AgentEditor.test.tsx` mocks `lib/hooks/agents` with two hooks only.

## Q8 Tests asserting versions
- Server: only `agents-sync-builtin.it.test.ts:270-279` definitely breaks. Client: fixtures only. e2e: `09-skills.flow.json` uses the skill Versions tab; no agent flow.

## Consequences
1. Skills tab autosave vs AC-22/AC-25: per-click versions, no place for a note.
2. Snapshots store skill **ids** only → a deleted skill's name is unrecoverable for diff/confirm (AC-11/14/16) unless new snapshots record names.
3. Seeded agents have no v1 row → empty history while `version: 1` (AC-6); backfill or seed change needed.
4. AC-21 race on plain PUT: lock + transaction in `service.update`.
5. Mirror contracts to the client vendored copy (it lacks `AgentVersion*`).
6. Auto messages server-side (Promote/sync have no client).
7. AC-29: text nodes only, no markdown.

## Not established
- Whether a no-op skill-set save creates a version; how the Skills tab carries a note; how deleted-skill names are shown; whether client hook tests assert exact invalidations; how a length 422 surfaces to the user; other eval/dashboard uses of agent versions; nothing was run.
