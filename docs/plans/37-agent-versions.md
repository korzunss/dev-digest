# Development Plan: Agent Versions tab
Status: done
Execution: multi-agent
Save as: docs/plans/37-agent-versions.md
Spec: specs/012-agent-versions.md

## Spec traceability
| Spec AC | Covered by |
|---|---|
| AC-1 | S15 · T10 |
| AC-2 | S1, S4, S6, S13 · T2, T8 |
| AC-3 | S13 · T8 |
| AC-4 | S13 · T8 |
| AC-5 | S13 · T8 |
| AC-6 | S13 · T8 |
| AC-7 | S4, S6, S7, S13 · T1, T2, T8 |
| AC-8 | S4, S13 · T1, T8 |
| AC-9 | S4, S13 · T1, T8 |
| AC-10 | S4, S13 · T1, T8 |
| AC-11 | S4, S6, S13 · T1, T2, T8 |
| AC-12 | S4, S13 · T1, T8 |
| AC-13 | S13 · T8 |
| AC-14 | S14 · T8 |
| AC-15 | S6, S7 · T2 |
| AC-16 | S6, S14 · T2, T8 |
| AC-17 | S4, S6, S13, S14 · T1, T2, T8 |
| AC-18 | S14 · T8 |
| AC-19 | S13 · T8 |
| AC-20 | S9, S11 · T8, T9 |
| AC-21 | S6 · T2 |
| AC-22 | S6, S12 · T3, T7 |
| AC-23 | S4 · T1, T2 |
| AC-24 | S4, S6 · T2 |
| AC-25 | S7, S11, S12 · T2, T7, T9 |
| AC-26 | S4, S6, S8 · T2, T3, T4 |
| AC-27 | S2 · T5 |
| AC-28 | S1, S7, S11, S12 · T2, T7, T9 |
| AC-29 | S13, S14 · T8 |
| AC-30 | S2 · T5 |
| AC-31 | S3 · T6 |
| AC-32 | S3, S4, S5, S13 · T1, T2, T8 |
| AC-33 | S12 · T7 |
| AC-34 | S12, S15 · T7, T10 |
| AC-35 | S6 · T2 |

## Decisions needed
None open — see *Decisions recorded*. (Pass-1 review and options are below the marker under *Design notes → Pass-1 review*.)

## Decisions recorded
2026-10-12, user "так, по рекомендаціях":
- TQ1–TQ4: defaults as written (no-op skill save creates no version; restoring a config equal to the current one still appends; note shown only when the Config save would create a version, server stores `message` only on a bump; a malformed `config_json` row shows "config unavailable", restore 422).
- GAP1 → (b): the Skills tab stages edits behind an explicit Save with an optional note. GAP2: a skill deleted before names were recorded shows as "Deleted skill · <short id>". GAP3: backfill the current version's snapshot for agents without one (and the seed writes it); never-recorded versions are not listed. GAP4: max message length 500 characters. All four closed: spec 012 amended (AC-30–AC-35 new) and re-approved 2026-10-12.
- REC1–REC4 accepted; D1 A, D2 A, D3 A, D4 A, D5 B (`RestoreConfirm`), D6 A; D7 Execution: multi-agent.

## Prerequisites
- Docker running for `.it` tests. No new dependency: `diff` ^9 is already used by `server/src/modules/skills/service.ts`.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S3 | shared contract + mirror, server schema, migrations, seed | — | contract names; both migration file names; `buildAgentSnapshotConfig` signature |
| G2 | S4–S8 | server agents module + eval promote | G1 | routes, request/response shapes, auto-message strings |
| G3 | S9–S12 | client hooks, i18n, Config + Skills tabs | G2 | hook signatures; `SkillsTab` `onDirtyChange` prop; i18n keys |
| G4 | S13–S15 | client Versions tab, restore confirm, editor wiring | G3 | — |

Strictly sequential (G3 and G4 both depend on S10's keys).

## Steps
`…/AgentEditor/` = `client/src/app/agents/[id]/_components/AgentEditor/`. Reference blocks R1–R5 are under *Design notes* below the marker.

### S1 — Agent-version message, skill names, diff and restore contracts  [Contract]
- **Files:** `server/src/vendor/shared/contracts/knowledge.ts` (modify), `client/src/vendor/shared/contracts/knowledge.ts` (modify — targeted mirror)
- **Change:** declarations exactly as in **R1**, placed after `AgentVersion` (server). The client copy lacks `AgentVersionConfig`/`AgentVersion`: add them plus every R1 export after `AgentSkillLink`, same text.
- **Layer / why here:** ports; contracts change in shared first, then the mirror (CLAUDE.md).
- **Skills to apply:** `zod`, `typescript-expert`, `onion-architecture`
- **Practices:** each schema exported with its `z.infer` type of the same name; `nullable()` = present-but-unknown, `optional()` only for `skill_names`/`message` inputs; no `z.any()`; no new imports.
- **Known gotchas:** the vendored copies have drifted — edit only these declarations, never copy the file (root `INSIGHTS.md` 2026-09-17 "the two vendored `shared` copies are not actually in sync"); `TS2719` after a contract field (root `INSIGHTS.md` 2026-09-17).
- **Done when:** `cd server && pnpm typecheck` · `cd client && pnpm typecheck` · `diff <(sed -n '/^export const AgentVersionConfig/,/^export type AgentVersionRestoreResult/p' server/src/vendor/shared/contracts/knowledge.ts) <(sed -n '/^export const AgentVersionConfig/,/^export type AgentVersionRestoreResult/p' client/src/vendor/shared/contracts/knowledge.ts)` prints nothing.

### S2 — Backfill current-version snapshots, then add `agent_versions.message`
- **Files:** `server/src/db/migrations/0026_*.sql` + meta (create via `--custom`), `server/src/db/schema/agents.ts` (modify), `server/src/db/migrations/0027_*.sql` + meta (create, generated)
- **Change:** (1) before any schema edit, `cd server && pnpm db:generate --custom`; write the **R2** backfill into that stub. (2) Add `message: text('message')` (nullable) to `agentVersions`; `cd server && pnpm db:generate`.
- **Layer / why here:** schema + migrations; a data fix only in a `--custom` stub.
- **Skills to apply:** `drizzle-orm-patterns`, `postgresql-table-design`
- **Practices:** no hand-written DDL; the stub body is the only hand edit; JSON keys equal those `snapshotVersion` writes (`repository.ts:172-191`); idempotent; never `db:migrate`.
- **Known gotchas:** stub before the schema edit ([server gotchas → DB & migrations](../../server/insights/gotchas.md)); the write into the stub may be denied — report the exact SQL and stop (root `INSIGHTS.md` 2026-09-30 "the auto-mode permission check blocks an implementer from writing a migration file").
- **Done when:** `cd server && pnpm typecheck` · 0027 is one `ALTER TABLE "agent_versions" ADD COLUMN "message" text` · T5 passes.

### S3 — One snapshot builder; the seed snapshots seeded agents
- **Files:** `server/src/db/agent-snapshot.ts` (create), `server/src/db/seed.ts` (modify)
- **Change:** `buildAgentSnapshotConfig(row: AgentRow, skills: { id: string; name: string }[])` → `{ provider, model, system_prompt, output_schema, strategy, ci_fail_on, repo_intel, skills: ids, skill_names: { [id]: name } }`. In `seed()`, after the agent-skill link loop, for each seeded agent insert `agentVersions { agentId, version: agent.version, configJson }` from its ordered linked skills, `onConflictDoNothing()` (AC-31).
- **Layer / why here:** infrastructure (`db/`): seed and repository (S5) may import it; `db/` never imports `modules/**`.
- **Skills to apply:** `drizzle-orm-patterns`, `onion-architecture`, `typescript-expert`
- **Practices:** builder is pure; `AgentRow` from `db/rows.ts`; seed stays idempotent.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · T6 passes.

### S4 — Versioning rule, tolerant DTO, pure diff builder
- **Files:** `server/src/modules/agents/helpers.ts` (modify), `server/src/modules/agents/constants.ts` (modify)
- **Change:** `isConfigChange`: drop `name`/`description` clauses (AC-23); `outputSchema` differs only by `JSON.stringify(x ?? null)` (add `outputSchema` to the `Pick`). `toAgentVersionDto`: `safeParse` → `config: null` on failure; `message: row.message ?? null`. New `buildVersionDiff` per **R3**. Constants `SYNC_VERSION_MESSAGE = 'Synced built-in prompt'`; helper `restoreVersionMessage(n)` → `` `Restored from v${n}` ``.
- **Layer / why here:** pure module helpers, unit-tested.
- **Skills to apply:** `onion-architecture`, `zod`, `typescript-expert`
- **Practices:** `safeParse` stored jsonb; no `db/schema`/`drizzle-orm` import.
- **Known gotchas:** row types from `db/schema` stay out of non-repository files ([server gotchas → DB & migrations](../../server/insights/gotchas.md)).
- **Done when:** `cd server && pnpm typecheck` · T1 passes.

### S5 — Repository: message and names in snapshots, name lookup
- **Files:** `server/src/modules/agents/repository.ts` (modify)
- **Change:** `update(…, opts: { bumpVersion?: boolean; message?: string })` → `snapshotVersion(row, version, message)` stores `message ?? null` and `configJson = buildAgentSnapshotConfig(row, linked {id, name})`; `insert` uses the same path. New `skillNamesByIds(workspaceId, ids): Promise<Map<string, string>>` (workspace-scoped `inArray`; empty input → empty map).
- **Layer / why here:** the only agents file touching `db/schema`.
- **Skills to apply:** `drizzle-orm-patterns`, `postgresql-table-design`, `onion-architecture`
- **Practices:** await every query in the repository; keep `onConflictDoNothing`; tenancy filter on the lookup.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck`.

### S6 — Service: locked saves, skill-set versions, diff, restore, auto messages
- **Files:** `server/src/modules/agents/service.ts` (modify)
- **Change:** per **R4** — `update(…, message?)` and `linkSkill` under `lockById` in one transaction; `setSkills(…, message?)` locks, no-ops on equal ordered ids, else sets + bumps once; `promote` input gains `message?`; `syncBuiltin` passes `SYNC_VERSION_MESSAGE`; new `versionDiff(ws, id, version)` and `restore(ws, id, version, message?)`.
- **Layer / why here:** application orchestration; DB stays in the repository.
- **Skills to apply:** `onion-architecture`, `zod`, `typescript-expert`, `security`
- **Practices:** no `drizzle-orm`/`db/schema` import; other modules only via `container.skillsRepo`; a vanished row inside a transaction throws `NotFoundError` (rollback), as `promote` does; skill ids checked against the workspace before writing.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · T2, T3 pass (after S7).

### S7 — Routes: messages on saves, diff and restore endpoints
- **Files:** `server/src/modules/agents/routes.ts` (modify)
- **Change:** `UpdateAgentBody`, `SetSkillsBody` gain `message: AgentVersionMessage.optional()`, passed through. `GET /agents/:id/versions/:version/diff` (`VersionParams`) → `service.versionDiff`; `POST /agents/:id/versions/:version/restore`, body `RestoreAgentVersionBody.nullish()`, passes `req.body?.message`; both map `undefined` → `NotFoundError`. Update the header route list.
- **Layer / why here:** transport: schema → service → map.
- **Skills to apply:** `fastify-best-practices`, `zod`, `onion-architecture`, `security`
- **Practices:** validation only in route schemas; >500 chars → 422 via the schema (`app.ts:123-131`); no logic in handlers.
- **Known gotchas:** optional body `.nullish()` ([server gotchas → Tooling](../../server/insights/gotchas.md)); uuid path id, so the bodyless-POST rule doesn't apply ([server gotchas → Security](../../server/insights/gotchas.md)).
- **Done when:** `cd server && pnpm typecheck` · T2 passes.

### S8 — Eval Promote stores its automatic message
- **Files:** `server/src/modules/eval/types.ts`, `server/src/modules/eval/pipeline-service.ts` (modify); `server/src/platform/container.ts` (modify only if `:286-291` stops type-checking)
- **Change:** `EvalPromotePort.promote` input gains `message?: string`; `promote()` (`pipeline-service.ts:645-663`) passes `` `Promoted v${run.agentVersion} from an eval run` ``.
- **Layer / why here:** eval application layer through its own port.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** eval never imports the agents service.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck` · T4 passes.

### S9 — Client hooks: versions, diff, restore, messages
- **Files:** `client/src/lib/hooks/agents.ts`, `client/src/lib/hooks/skills.ts` (modify)
- **Change:** `useAgentVersions(id)` (`["agent-versions", id]`); `useAgentVersionDiff(id, version)` (`["agent-version-diff", id, version]`, enabled when `version != null`); `useRestoreAgentVersion()` (no body). `useUpdateAgent` and `useSetAgentSkills` inputs gain optional `message`, sent in the body. Cache effects per **R7** (AC-20; the Skills optimism goes — edits are staged now).
- **Layer / why here:** client data layer, one hook per endpoint.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `typescript-expert`
- **Practices:** fetch only via `lib/api.ts`; types from `@devdigest/shared`.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm typecheck`.

### S10 — i18n copy
- **Files:** `client/messages/en/agents.json` (modify)
- **Change:** add the keys listed in **R5**.
- **Layer / why here:** all copy in the `agents` namespace (spec NFR).
- **Skills to apply:** none (JSON only)
- **Practices:** valid JSON; ICU placeholders as in R5.
- **Known gotchas:** one string per distinct state ([client gotchas → Tests](../../client/insights/gotchas.md)).
- **Done when:** `jq -e '.versions.restoreBody and .skills.save and .editor.tabs.versions' client/messages/en/agents.json`.

### S11 — Config tab: optional note when the save versions
- **Files:** `…/AgentEditor/_components/ConfigTab/ConfigTab.tsx` (modify), `…/ConfigTab/helpers.ts` (create)
- **Change:** `wouldCreateVersion(agent, form)` = provider/model/system_prompt/strategy/ci_fail_on/repo_intel differ. When true, a note input beside Save; `message` sent only when true and non-blank. Note >`AGENT_VERSION_MESSAGE_MAX`: inline error, Save disabled, form kept (AC-28). Reset effect deps `[agent.id, agent.version]` (AC-20); the note clears after success.
- **Layer / why here:** colocated feature component + pure helper.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `react-testing-library`
- **Practices:** derive during render (no state + effect); helper outside the component; ≤200 lines (split a `NoteField.tsx` in the folder if needed).
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm typecheck` · T9 passes.

### S12 — Skills tab: staged edits, Save/Cancel with note, unsaved guard
- **Files:** `…/AgentEditor/_components/SkillsTab/SkillsTab.tsx`, `…/SkillsTab/helpers.ts`, `…/SkillsTab/styles.ts` (modify), `…/SkillsTab/use-unsaved-guard.ts` (create)
- **Change:** stage toggles/drag/arrow keys locally; a footer with note, Cancel and Save that posts once; prop `onDirtyChange?(dirty)`; `useUnsavedGuard(dirty, message)` for unload and link clicks — behaviour per **R8** (AC-33, AC-34).
- **Layer / why here:** colocated component, helpers, component-local hook.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `react-testing-library`
- **Practices:** derive `isDirty`/`attached` in render; each listener in one effect with cleanup; loading/error early-returns stay before any control.
- **Known gotchas:** a whole-list editor must not render controls before the stored list loads ([client gotchas → UI](../../client/insights/gotchas.md)); no `user-event` — use `fireEvent` ([client gotchas → Tests](../../client/insights/gotchas.md)).
- **Done when:** `cd client && pnpm typecheck` · T7 passes.

### S13 — Versions tab: list and diff view
- **Files:** `…/AgentEditor/_components/VersionsTab/` `VersionsTab.tsx`, `DiffView.tsx`, `helpers.ts`, `constants.ts`, `styles.ts`, `index.ts` (all create)
- **Change:** list via `useAgentVersions` with loading/error/404 states; rows with message, date, `configUnavailable`; `agent.version` = Current, others Diff + Restore; `DiffView` modal rendering the prompt with `parsePatch` + `CodeLine` (as the skill `VersionsTab.tsx`) — behaviour per **R9** (AC-2…AC-13, AC-19).
- **Layer / why here:** colocated feature component (PascalCase folder + barrel).
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `react-testing-library`, `security`
- **Practices:** messages, prompts, names render as text nodes only — no `Markdown`, `dangerouslySetInnerHTML` or auto-links (AC-29); files ≤200 lines; the diff is fetched only after Diff is clicked.
- **Known gotchas:** a vendored `Modal` does not portal itself ([client gotchas → UI](../../client/insights/gotchas.md)).
- **Done when:** `cd client && pnpm typecheck` · T8 passes.

### S14 — Restore confirmation
- **Files:** `…/VersionsTab/RestoreConfirm.tsx` (create), `…/VersionsTab/VersionsTab.tsx` (modify)
- **Change:** `Modal` with `restoreTitle`/`restoreBody`; skill set = `useAgentVersionDiff(agentId, version)` → `skills.from` in order, deleted ones under `restoreMissing` (AC-16); warnings from `useSecretsStatus()` (no key for the version's provider) and `useProviderModels(provider)` (model absent, checked only when the key exists) (AC-18); confirm disabled when `config === null` (AC-17). Confirm → `useRestoreAgentVersion`; success toast `versions.restored`.
- **Layer / why here:** colocated component (D5 B), existing hooks.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `typescript-expert`, `react-testing-library`, `security`
- **Practices:** text nodes only; ≤200 lines; no new endpoint (assumption: the diff endpoint supplies names).
- **Known gotchas:** as S13.
- **Done when:** `cd client && pnpm typecheck` · T8 passes.

### S15 — Wire the tab and the discard confirm
- **Files:** `…/AgentEditor/constants.ts`, `…/AgentEditor/AgentEditor.tsx`, `client/src/app/agents/[id]/page.tsx` (modify)
- **Change:** `TABS` + `{ key: "versions", labelKey: "editor.tabs.versions", icon: "History" }`; `AgentEditor` renders `VersionsTab` and passes `onDirtyChange` to `SkillsTab`; `page.tsx` adds `"versions"` to `VALID_TABS`, keeps `skillsDirty`, and while dirty routes `setTab` and agent-card clicks through `ConfirmModal` (`skills.discard*`); refusing keeps the user and the edits (AC-34).
- **Layer / why here:** route page + editor shell.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `next-best-practices`, `typescript-expert`, `react-testing-library`
- **Practices:** `ConfirmModal` (`client/src/components/confirm-modal`) used unchanged; page holds state + handlers only.
- **Known gotchas:** keep `useSearchParams()` under `<Suspense>` ([client gotchas → Tooling](../../client/insights/gotchas.md)); mocking `lib/hooks/agents` needs `importActual` ([client gotchas → Tests](../../client/insights/gotchas.md)).
- **Done when:** `cd client && pnpm typecheck` · T10 passes.

## Tests
| Id | Test file | Tier | Covers | Step |
|---|---|---|---|---|
| T1 | `server/test/agents-version-diff.test.ts` (create) | unit | `buildVersionDiff` (patch, fields, added/removed/order, names live/recorded/none, identical, unreadable); `isConfigChange` (name-only, equal schema → false) | S4 |
| T2 | `server/test/agents-versions.it.test.ts` (modify) | it | the R6 server cases | S5–S7 |
| T3 | `server/test/agents-sync-builtin.it.test.ts` (modify `:270-279`) | it | setSkills bumps once, snapshot has ordered ids + names; equal ids → no version; sync message | S6 |
| T4 | `server/test/eval-pipeline-runs.it.test.ts` (modify, promote case `:169`) | it | message `Promoted vN from an eval run` | S8 |
| T5 | `server/test/agents-version-backfill.it.test.ts` (create) | it | 0026 SQL on an agent without a snapshot → one row at its version, ordered skills + names, `message` null; rerun adds nothing | S2 |
| T6 | same file as T5 | it | `seed()` snapshots each seeded agent; re-seed adds none | S3 |
| T7 | `…/SkillsTab/SkillsTab.test.tsx` (modify) | unit | nothing written before Save; one post with the note; Cancel; Save disabled when unchanged / note >500; `onDirtyChange` | S12 |
| T8 | `…/VersionsTab/VersionsTab.test.tsx` (create) | unit | the R6 client cases | S13, S14 |
| T9 | `…/ConfigTab/ConfigTab.test.tsx` (create) | unit | no note for name-only edit; note for model edit sent as `message`; >500 blocks Save, edits kept | S11 |
| T10 | `…/AgentEditor/AgentEditor.test.tsx` (modify) | unit | `tab="versions"` renders; leaving a dirty Skills tab asks, refusing keeps edits | S15 |

Run: `cd server && pnpm exec vitest run test/<file>`; `cd client && pnpm exec vitest run <bracket-free substring>` (e.g. `AgentEditor/_components/VersionsTab`).

## Migrations & contracts
- `0026_*` (`pnpm db:generate --custom`, R2 body) then `0027_*` (`pnpm db:generate`, nullable `message`). The main session runs `db:migrate`.
- S1 changes `knowledge.ts`; targeted mirror into the client copy in the same step.

## Out of scope
- MCP tools, `reviewer-core`, `e2e`; diffing two arbitrary versions; per-version eval runs.
- Eval Promote beyond its message; the skill Versions tab; `ConfirmModal` itself.
- Any update/delete of a past `agent_versions` row; any `*/src/vendor/**` edit outside S1.

<!-- implementer-brief:end -->

## Design notes

### R1 — Contracts (S1)
```ts
export const AGENT_VERSION_MESSAGE_MAX = 500;
export const AgentVersionMessage = z.string().max(AGENT_VERSION_MESSAGE_MAX);
// AgentVersionConfig: add  skill_names: z.record(z.string(), z.string()).optional()   // id -> name at snapshot time
// AgentVersion: add  message: z.string().nullable();  change  config: AgentVersionConfig.nullable()  // null = unreadable
export const AgentVersionSkillRef = z.object({ id: z.string(), name: z.string().nullable(), deleted: z.boolean() });
export const AgentVersionField = z.enum(['provider', 'model', 'strategy', 'ci_fail_on', 'repo_intel', 'output_schema']);
export const AgentVersionFieldChange = z.object({
  field: AgentVersionField,
  from: z.union([z.string(), z.boolean()]).nullable(),   // output_schema as a JSON string
  to: z.union([z.string(), z.boolean()]).nullable(),
});
export const AgentVersionDiff = z.object({
  from: z.number().int(), to: z.number().int(),
  config_available: z.boolean(),
  prompt_patch: z.string(),                               // '' when unchanged or unavailable
  fields: z.array(AgentVersionFieldChange),
  skills: z.object({
    from: z.array(AgentVersionSkillRef), to: z.array(AgentVersionSkillRef),
    added: z.array(AgentVersionSkillRef), removed: z.array(AgentVersionSkillRef),
    order_changed: z.boolean(),
  }),
  identical: z.boolean(),
});
export const RestoreAgentVersionBody = z.object({ message: AgentVersionMessage.optional() });
export const AgentVersionRestoreResult = z.object({
  agent_id: z.string(), version: z.number().int(), restored_from: z.number().int(),
  dropped_skill_ids: z.array(z.string()),
});
// plus `export type X = z.infer<typeof X>` for each; AgentVersionRestoreResult's type is the last declaration
```

### R2 — Backfill SQL (S2, custom stub)
```sql
INSERT INTO "agent_versions" ("agent_id", "version", "config_json")
SELECT a."id", a."version", jsonb_build_object(
  'provider', a."provider", 'model', a."model", 'system_prompt', a."system_prompt",
  'output_schema', a."output_schema", 'strategy', a."strategy", 'ci_fail_on', a."ci_fail_on",
  'repo_intel', a."repo_intel",
  'skills', COALESCE((SELECT jsonb_agg(s."skill_id" ORDER BY s."order") FROM "agent_skills" s WHERE s."agent_id" = a."id"), '[]'::jsonb),
  'skill_names', COALESCE((SELECT jsonb_object_agg(k."id", k."name") FROM "agent_skills" s JOIN "skills" k ON k."id" = s."skill_id" WHERE s."agent_id" = a."id"), '{}'::jsonb))
FROM "agents" a
WHERE NOT EXISTS (SELECT 1 FROM "agent_versions" v WHERE v."agent_id" = a."id" AND v."version" = a."version");
```
`created_at` takes its default; `message` does not exist yet and stays null (AC-27).

### R3 — `buildVersionDiff` (S4)
Input: `{ from: number; fromConfig: unknown; current: { version, provider, model, systemPrompt, outputSchema, strategy, ciFailOn, repoIntel }; currentSkills: { id, name }[]; liveNames: Map<string, string> }`.
- `AgentVersionConfig.safeParse(fromConfig)`; on failure `config_available = false`, `prompt_patch = ''`, `fields = []`, skills from `fromConfig.skills` if it is a string array, else `[]`.
- `prompt_patch = createTwoFilesPatch('system-prompt', 'system-prompt', old, new, 'v'+from, 'v'+current.version)` when the prompts differ, else `''`.
- `fields`: one entry per differing field; `output_schema` compared and shown as `JSON.stringify(x ?? null)`; an old `output_schema` of null/undefined counts as unchanged (Promote keeps the current schema — spec edge case).
- Skill ref: `name = liveNames.get(id) ?? skill_names?.[id] ?? null`, `deleted = !liveNames.has(id)`. `added` = in current not in from; `removed` = in from not in current; `order_changed` = the ids common to both appear in a different relative order.
- `identical` = no patch, no fields, no added/removed, no order change.

### R4 — Service flows (S6)
- `update(ws, id, patch, message?)`: `repo.transaction(r => r.lockById(ws, id) ?? undefined → r.update(ws, id, mapped, { message }))`.
- `setSkills(ws, id, ids, message?)`: agent check; `assertSkillsInWorkspace`; transaction: `lockById`; `current = linkedSkills` ids; equal ordered → return links (no write, TQ1); else `r.setSkills` + `r.update(ws, id, {}, { bumpVersion: true, message })`; vanished row → throw.
- `linkSkill`: same lock + `bumpVersion: true` inside one transaction.
- `promote(ws, id, { config, skillIds, message? })`: pass `message` to `update` opts.
- `syncBuiltin`: `{ bumpVersion: true, message: SYNC_VERSION_MESSAGE }`.
- `versionDiff(ws, id, version)`: agent (`getById`) or undefined; `getVersion` or undefined; `linkedSkills`; `skillNamesByIds(ws, union of ids)`; `buildVersionDiff` against the live row.
- `restore(ws, id, version, message?)`: agent or undefined; row or undefined; `AgentVersionConfig.safeParse(row.configJson)` fails → `ValidationError('Stored version config is malformed')` (AC-17); `existing = container.skillsRepo.idsInWorkspace(ws, recorded)`; `kept` = recorded in order ∩ existing; `promote(ws, id, { config: row.configJson, skillIds: kept, message: message?.trim() || restoreVersionMessage(version) })`; return `{ agent_id, version: out.version, restored_from: version, dropped_skill_ids }`. Always appends (AC-35).
- Blank (trimmed) user messages count as no message everywhere.

### R5 — i18n keys (S10, `client/messages/en/agents.json`)
`editor.tabs.versions`; `config.note`, `config.noteHint`, `config.noteTooLong` (`{max}`); `skills.save`, `skills.saving`, `skills.cancel`, `skills.unsaved`, `skills.note`, `skills.noteTooLong` (`{max}`), `skills.discardTitle`, `skills.discardBody`, `skills.discardConfirm`, `skills.leaveConfirm`; `versions.title`, `versions.count` (`{count}`), `versions.hint`, `versions.version` (`v{version}`), `versions.current`, `versions.noMessage`, `versions.diff`, `versions.restore`, `versions.restoring`, `versions.loadError`, `versions.onlyOne`, `versions.configUnavailable`, `versions.agentGone`, `versions.diffTitle` (`{from}`, `{to}`), `versions.identical`, `versions.promptHeading`, `versions.fieldsHeading`, `versions.skillsHeading`, `versions.added`, `versions.removed`, `versions.orderChanged`, `versions.deleted`, `versions.deletedSkill` (`Deleted skill · {id}`), `versions.field.{provider,model,strategy,ci_fail_on,repo_intel,output_schema}`, `versions.restoreTitle` (`{version}`), `versions.restoreBody` (`{version}`: becomes a new current version, no existing version changes), `versions.restoreSkills`, `versions.restoreNoSkills`, `versions.restoreMissing`, `versions.restoreNoKey` (`{provider}`), `versions.restoreUnknownModel` (`{model}`), `versions.restoreConfirm`, `versions.restored` (`{version}`).

### R6 — Test cases for T2 and T8
- **T2** (`agents-versions.it.test.ts`): message stored only on a bump; name-only PUT creates no version; a 501-char message → 422; the list carries `message`, a malformed row → `config: null`; diff route incl. a deleted skill, unknown agent/version 404, other workspace 404; restore → new version, skills in recorded order, missing ones dropped, message `Restored from vN`, malformed config → 422, equal-to-current still appends; two concurrent restores → two consecutive versions, both listed.
- **T8** (`VersionsTab.test.tsx`): newest first, Current badge, no-message placeholder, a `<b>x</b>` message shown as literal text, loading / error + retry / one-version states; diff modal: prompt lines, field changes, skills added/removed/order, deleted label, identical, error + retry; restore confirm: skill list, missing skills, no-key and unknown-model warnings, malformed config disables confirm; every Restore disabled while one is pending.

### R7 — Hook cache effects (S9)
- `useRestoreAgentVersion` success: invalidate `["agent", id]`, `["agents"]`, `["agent-versions", id]`, `["agent-skills", id]`, `["agent-version-diff", id]`.
- `useUpdateAgent` success: as today, plus invalidate `["agent-versions", id]`.
- `useSetAgentSkills`: no `onMutate`/`onError` optimism; success sets `["agent-skills", agentId]` and invalidates `["agents"]`, `["agent", agentId]`, `["agent-versions", agentId]`.

### R8 — Skills tab staging (S12)
- State `staged: string[] | null` (null = no edits); `attached = staged ?? stored ids`; toggles, drag and arrow keys write `staged` only, nothing is posted (AC-33).
- `isDirty = staged !== null && !sameOrder(staged, stored)` (`sameOrder` in `helpers.ts`).
- While dirty, a footer: `skills.unsaved`, note input (≤ `AGENT_VERSION_MESSAGE_MAX`, inline `skills.noteTooLong`), Cancel (`staged = null`), Save → `useSetAgentSkills.mutate({ agentId, skillIds: staged, message })`, then `staged = null` and the note clears. Save disabled while pending, when not dirty, or when the note is too long.
- `onDirtyChange?.(isDirty)` from an effect keyed on `isDirty`.
- `use-unsaved-guard.ts` → `useUnsavedGuard(dirty, message)`: only while dirty, a `beforeunload` handler (`preventDefault`) and a capture-phase `document` click listener on same-origin `a[href]` that calls `preventDefault()` + `stopPropagation()` unless `window.confirm(message)` (assumption: link navigation is guarded with `window.confirm`; tab switches and agent cards use the S15 modal).

### R9 — Versions tab behaviour (S13)
- `useAgentVersions(agent.id)`: `Skeleton` while loading; `ErrorState` + retry on error; a 404 (`ApiError.status === 404`) → `versions.agentGone`.
- Each row: `versions.version`, the message as a text node or `versions.noMessage`, the date, `versions.configUnavailable` when `config === null`. The row whose `version === agent.version` gets the Current badge; every other row gets Diff and Restore; all Restore buttons are disabled while a restore is pending (AC-19). Exactly one row → the `versions.onlyOne` note (AC-6).
- `DiffView` (in a `Modal`, fetched only once Diff is clicked): prompt via `parsePatch(prompt_patch)` + `CodeLine`; a field table old → new with `versions.field.*` labels; skills added / removed / order changed, each by name, or `versions.deletedSkill` with the first 8 id chars, plus a `versions.deleted` marker when `deleted`; `identical` → `versions.identical`; `config_available === false` → `versions.configUnavailable` above what is readable; error → `ErrorState` + retry inside the modal (AC-13).

### Other notes
- **Diff against the live row.** The current side is the live agent row + linked skills, equal to the current version by construction, so a missing current snapshot cannot break it.
- **Restore = Promote.** Restore filters missing skills, then calls `promote` with an auto message: one lock/transaction path (D1).
- **Pass-1 review.** TQ1–TQ4, GAP1–GAP4, REC1–REC4 and D1–D7 as drafted in pass 1; answers in *Decisions recorded*.

## Context applied
- `docs/plans/assets/37-agent-versions/research.md` → main fact base (R Q1–Q8).
- `server/insights/gotchas.md` → `--custom` stub first (S2); optional body `.nullish()` (S7); row types out of non-repository files (S4).
- root `INSIGHTS.md` → vendored copies drift (S1); implementer denied on a migration stub (S2).
- `client/insights/gotchas.md` → whole-list editor waits for load (S12); `importActual` for hook mocks (S15); `fireEvent` only (S12); bracket-free vitest filters (Tests).

## Skills
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| onion-architecture | preload | S1, S3–S8 | |
| engineering-insights | preload | Context applied | |
| zod | on demand (S1) | S1, S4, S6, S7 | |
| fastify-best-practices | on demand (S7) | S7 | |
| drizzle-orm-patterns | on demand (S2) | S2, S3, S5 | |
| frontend-architecture | on demand (S9) | S9, S11–S15 | |
| react-best-practices | on demand (S9) | S9, S11–S15 | |
| react-testing-library | on demand (S11) | S11–S15 | |
| next-best-practices | on demand (S11) | S11–S13, S15 | |

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `contracts/knowledge.ts` (both copies) | ports | changed |
| server | `db/schema/agents.ts`, migrations 0026/0027, `db/agent-snapshot.ts`, `db/seed.ts` | infrastructure | changed / new |
| server | `modules/agents/{helpers,constants,repository,service,routes}.ts` | agents, all layers | changed |
| server | `modules/eval/{types,pipeline-service}.ts` | application | changed |
| client | `lib/hooks/{agents,skills}.ts`, `messages/en/agents.json` | data / i18n | changed |
| client | `app/agents/[id]/…` ConfigTab, SkillsTab, VersionsTab (new), AgentEditor, page | UI | changed / new |

- 2026-10-12, user "так" to the full plan: approved with its assumptions (AC-34 guard: tab switch/agent card via ConfirmModal, sidebar links via window.confirm, close/reload via beforeunload, browser Back not intercepted; ~20.6 KB brief). Writing the S2 backfill SQL by the main session, if the implementer is blocked, still needs the user's explicit instruction for that file.

- 2026-10-12, user "Закриваємо цей план і комітимо зміни": closes the plan — R3 signed off; accepted as known limitations: Config tab drops unsaved edits when the version changes elsewhere (no banner chosen), no SQL CHECK on message (Zod cap), browser Back not guarded, inline "Saved (vN)" replaced by the toast; browser walkthrough not explicitly confirmed (the user found and reported the BLD1 500 there).

## Risks & open questions
- S2: the implementer may be denied writing the `--custom` stub body (root `INSIGHTS.md` 2026-09-30); writing it in the main session needs the user's explicit instruction for that file.
- AC-34 for sidebar/app-shell links relies on a capture-phase click listener + `window.confirm` (assumption); the App Router has no navigation-blocking API, and browser Back within the SPA is not intercepted — only full unloads (`beforeunload`).
- `agents-sync-builtin.it.test.ts:270-279` flips meaning under AC-22 (T3); `agents-context.it.test.ts:201` (version unchanged after context edits) must stay green (AC-24).
- R Q5 says `UpdateAgentBody` is strict; it is not (`routes.ts:48-59`). No effect on the plan.
- Agents inserted in tests without a snapshot list no versions; their diff still works from the live row.
- Mode re-check: 4 groups, 15 steps, 3 packages, migration + contract → multi-agent holds.

## Handed off
- architecture-reviewer: `db/agent-snapshot.ts` shared by seed and repository; locks in `update`/`setSkills`/`linkSkill`; `EvalPromotePort` change.
- security review: restore POST (workspace scoping, skill tenancy), message bound, plain-text rendering of messages/prompts/names (AC-29).

## Insights to record
- None.

## Red-flags check
- [x] Every spec AC-n has a row in *Spec traceability* with a step or test
- [x] Every step has Files, Practices and a runnable Done when
- [x] Every existing path was opened; every new one is marked `create`
- [x] Every assumption is marked; no open product gaps
- [x] Groups end type-checking; no parallel groups
- [x] No group under 3 files / ~80 lines
- [x] The brief above the marker is under ~20,000 characters
- [x] Execution mode per the rule: multi-agent
- [x] Every step's *Skills to apply* is complete
- [x] `bash .claude/skills/sdd/scripts/sdd.sh plan-lint <plan>` prints `plan-lint: ok`

## Verification log
- 2026-10-12 approved by the user ("так"); status -> in-progress; G1 started
- 2026-10-12 implement G1: done S1–S3; client typecheck ok; server typecheck 1 expected TS2741 at agents/helpers.ts:36 (fixed by S4); backfill T5/T6 2 passed; server unit 920. `--custom` write not blocked. Main session read 0026 (INSERT … WHERE NOT EXISTS only) and 0027 (ADD COLUMN message text). Skills drizzle-orm-patterns/postgresql-table-design read after the steps, re-check found nothing (logged as process miss)

- 2026-10-12 test-writer: T2 +6 cases (deleted skill by recorded name / null name, restore drops missing skills in order, cross-workspace 404 on diff+restore, message >500 → 422 on skills POST + restore, concurrent restores → consecutive distinct versions); SkillsTab.test.tsx gets `common` (MISSING_MESSAGE 16 → 0). Break checks: restore drop, lockById FOR UPDATE removed, getById workspace filter removed, SetSkillsBody message unbounded, ref() recorded-name fallback — each failed its test; shasums restored. Gaps left: setSkills/PUT racing restore; null-name diff case not mutation-guarded
- 2026-10-12 main session: full server `.it` 36 files / 321 passed; client typecheck ok + full client 85 files / 635 passed

- 2026-10-12 security-reviewer (diff d4eca26..working tree): PASS, 0 findings; filtered with reasons: bodyless restore POST (UUID path id, spends nothing), getVersion/listVersions agent-only filter (callers check getById(workspace) first), XSS (text nodes only), 0026 static SQL, no-key restore (functional), concurrent restores (row lock). Handoffs: devdigest-appsec anchors drifted (app.ts helmet/CORS/rate-limit now :97-104); `useRestoreAgentVersion` posts no body — check against the restore-note ACs

- 2026-10-12 architecture-reviewer (diff d4eca26..working tree): PASS; F1 MEDIUM (non-blocking): VersionsTab.tsx:12-13, DiffView.tsx:11, RestoreConfirm.tsx:10-11 import lib/ via 7-level relative paths — use `@/lib/...` (client/AGENTS.md). 0026 proven a pre-schema --custom stub (snapshot equals 0025 under jq -S del(.id,.prevId)); 0027 generated; prevId chain intact; layering ok. Handoffs: SkillRefLabel.tsx not in S11 Files (logged deviation); no response schema on diff/restore routes; versionDiff fallback parse could be a pure helper

- 2026-10-12 plan-verifier full pass: incomplete — 123/132 met; partial SP-AC-6 (onlyOne copy lacks 'after the next change'), SP-AC-10 (order change shows a fixed string, no skill names), SP-AC-16 (missing skills counted, not named); missing SK5 (drizzle-orm-patterns, postgresql-table-design not recorded for S5); not-verifiable SP-AC-34 link/unload guard (no test), R3 (plan untracked), R4 (no Test Report passed; subjects inspected clean). Fix mode 1 started with F1 (arch) + a use-unsaved-guard unit test for SP-AC-34

- 2026-10-12 fix mode 1 (SP-AC-6, SP-AC-10, SP-AC-16, SK5, F1, SP-AC-34): onlyOne copy names diff/restore after the next change; DiffView `SkillOrder` names old → new order; RestoreConfirm lists missing skills (SkillRefLabel); VersionsTab/DiffView/RestoreConfirm import `@/lib`/`@/components`; new `SkillsTab/use-unsaved-guard.test.tsx` (4 cases); SK5 skills read in full, S5 unchanged. Break checks: old-order render, missing-skill list, guard preventDefault → 3 tests failed, restored. Main session re-ran: client typecheck ok, VersionsTab+SkillsTab+use-unsaved-guard green

## Handoffs → fix-1
| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `drizzle-orm-patterns` | on demand (full) | S5 | re-check, no change |
| `postgresql-table-design` | on demand (full) | S5 | re-check, no change |

- 2026-10-12 verification delta after fix mode 1: complete — needs sign-off, 131/132 met (AC-1…AC-35 all met; F1 fixed); open: R3 (plan untracked, no approved baseline) → user sign-off

- 2026-10-12 /pr-self-review (reviewed vs origin/L06): PASS — 0 CRITICAL (ConfigTab stale-enabled deps downgraded to HIGH: pre-existing at origin/L06), 3 HIGH, 21 MEDIUM; full list in .pr-self-review.json. User: "так, виправляй HIGH і MEDIUM" → fix mode 2 (PRS1–PRS3 HIGH, PRS4–PRS24 MEDIUM). Not taken: PRS23 SQL CHECK on agent_versions.message (needs a new migration = plan change; Zod cap stays)

- 2026-10-12 fix mode 2 (PRS1–PRS22, PRS24; PRS23 not taken): ConfigTab remounted by key agent.id:version, no `enabled` in the form (header toggle writes it directly); RestoreConfirm diff-error state + Retry, Restore disabled until diff data; no per-call onError; linkSkill no-op + message; restore passes parsed config; promote `dropMissingSkills` filters after lockById (returns droppedSkillIds); `recordedSkillIds` + `canonicalJson` helpers; note trim before length check; VALID_TABS from TABS; guard skips modifier/middle clicks; VersionsTab modals portaled; FIELD_LABEL_KEYS lookup; no default export; importActual; 4-state test split; knowledge.ts copies byte-identical; seed batched. New tests prove-failed without the fixes. Follow-up: `AgentEditor.save.test.tsx` (real QueryClient) proves the save toast survives the remount; side effect: the inline "Saved (vN)" note no longer shows (toast remains). Main session re-ran: server typecheck ok, server `pnpm test` 105 files / 1253; client typecheck ok, client `pnpm test` 86 files / 651; cmp of knowledge.ts copies identical

- 2026-10-12 verification delta after fix mode 2: complete — needs sign-off, 131/132 (AC-1…AC-35 met, no regressions); open: R3 → user. Notes: Config tab remount on any version change drops unsaved Config edits when the version changes elsewhere; inline "Saved (vN)" gone (toast stays); knowledge.ts comment hunks outside the R1 block synced (PRS22); promote returns droppedSkillIds

- 2026-10-12 /pr-self-review re-run: backend — linkSkill re-link without `order` still bumped; UI — header toggle shared the Save mutation (disabled Save, showed the save note), redundant `stagedIds` alias. main-session fix: PR-R1 service.ts linkSkill no-op when the skill is already linked and no order is given (+3-line assertion in agents-versions.it.test.ts; break check: old condition → 1 failed, restored, shasum identical, 19 passed); PR-R2 ConfigTab.tsx toggle gets its own useUpdateAgent; PR-R3 SkillsTab.tsx alias removed. Note: PR-R1 touched a code file and a test file (rule is ≤1 file) — logged for the verifier. Open, for the user: Config tab remount drops unsaved Config edits when the version changes elsewhere (background refetch, promote, sync)

- 2026-10-12 user-reported runtime failure (next dev): `/agents/:id` 500 — `Module not found: Can't resolve './contracts/findings.js'` from client/src/vendor/shared/index.ts. Cause: ConfigTab.tsx, NoteField.tsx, SkillsTab.tsx, SaveBar.tsx import the VALUE `AGENT_VERSION_MESSAGE_MAX` from `@devdigest/shared`; the rest of the client imports only types from it (erased), so Next never bundled the vendored index whose `.js` specifiers webpack can't map to `.ts`. typecheck/vitest resolve them, so no test caught it. Fix mode 3 (BLD1): client-local constant, no value import from `@devdigest/shared`

- 2026-10-12 fix mode 3 (BLD1): client-local `AGENT_NOTE_MAX = 500` in AgentEditor/constants.ts used by ConfigTab, NoteField, SkillsTab, SaveBar; guard test `client/src/lib/shared-type-only-imports.test.ts` (failed on the four files before the fix); client typecheck ok, client 88 files / 653. Main session: no value import from @devdigest/shared left in client/src; running next dev → GET /agents/<id>?tab=versions 200. Insight recorded in client/INSIGHTS.md + gotchas.md

- 2026-10-12 closed: last verification complete — needs sign-off (R3), signed off by the user; status -> done

## Handoffs → G1
- Contracts (server + client `knowledge.ts`): `AGENT_VERSION_MESSAGE_MAX`, `AgentVersionMessage`, `AgentVersionSkillRef`, `AgentVersionField`, `AgentVersionFieldChange`, `AgentVersionDiff`, `RestoreAgentVersionBody`, `AgentVersionRestoreResult`; `AgentVersionConfig` + optional `skill_names`; `AgentVersion.config` nullable, required `message: string | null`.
- Migrations `0026_dashing_valeria_richards.sql` (backfill), `0027_giant_northstar.sql` (message); user runs `pnpm db:migrate`.
- `buildAgentSnapshotConfig(row, skills: {id,name}[])` in `server/src/db/agent-snapshot.ts` → `{provider, model, system_prompt, output_schema, strategy, ci_fail_on, repo_intel, skills: ids, skill_names}`; S5 replaces the inline object in `snapshotVersion`.
- S4 fixes `toAgentVersionDto` (helpers.ts:36). T5 runs the 0026 SQL via `pg.handle.sql.unsafe`.

| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S1, S2, S3 | |
| `zod` | on demand | S1 | |
| `typescript-expert` | on demand | S1, S3 | |
| `drizzle-orm-patterns` | on demand (after the steps) | S2, S3 (re-check) | |
| `postgresql-table-design` | on demand (after the steps) | S2 (re-check) | S3 has no DDL |
- 2026-10-12 implement G2: done S4–S8 + T1–T4; server typecheck ok, unit 929, agents/eval .it passed. Main session re-ran: typecheck ok, `vitest run agents eval-pipeline-runs` 6 files / 57 passed. Deviations: `linkSkill` now always bumps (R4); old "setSkills does not bump (D2-A)" test replaced by "bumps once with ordered ids + names" + "equal ids write nothing". T2 gaps left for test-writer: concurrent restores, diff with a deleted skill, restore dropping missing skills, cross-workspace 404 on diff/restore

## Handoffs → G2
- `POST /agents/:id/skills` `{ skill_ids?, skill_id?, order?, message? }` — `message` applies to `skill_ids` only; same ordered ids write no version.
- `PUT /agents/:id` + `message?` (max 500 → 422), stored only on a bump; name/description edits no longer bump.
- `GET /agents/:id/versions/:version/diff` → `AgentVersionDiff` (404 unknown agent/version).
- `POST /agents/:id/versions/:version/restore` optional `{ message? }` (null ok) → `AgentVersionRestoreResult`; 422 malformed config, 404 unknown; always appends.
- List/get: `config` null for an unreadable row; `message: string | null`.
- Auto messages: `Synced built-in prompt`, `Restored from v{N}`, `Promoted v{N} from an eval run`; whitespace-only note = no note.
- Server symbols: `buildVersionDiff` (agents/helpers.ts), `SYNC_VERSION_MESSAGE`, `restoreVersionMessage` (constants.ts), `AgentsRepository.skillNamesByIds`, `AgentsService.versionDiff`/`restore`.

| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `onion-architecture` | preload | S4–S8 | |
| `zod` | on demand | S4, S6, S7 | |
| `typescript-expert` | on demand | S4, S6, S8 | |
| `fastify-best-practices` | on demand (first ~150 lines) | S7 | |
| `security` | on demand (first ~150 lines) | S6, S7 | |
- 2026-10-12 implement G3: done S9–S12 + T7/T9; client typecheck ok, full client 83 files / 620 passed. Main session re-ran: typecheck ok, ConfigTab+SkillsTab+skills-ordering green. Deviations: SaveBar.tsx split (200-line limit); SkillsTab Skeleton/ErrorState before the list loads; onDirtyChange(false) on unmount; `skills-ordering.test.tsx` (not in Files) rewritten because the optimistic write was removed (R7)

## Handoffs → G3
- Hooks (`lib/hooks/agents.ts`): `useAgentVersions(id)` `["agent-versions", id]`; `useAgentVersionDiff(id, version)` `["agent-version-diff", id, version]` (enabled when version != null); `useRestoreAgentVersion()` `mutate({ id, version })`, no body → `AgentVersionRestoreResult`, invalidates agent, agents, agent-versions, agent-skills, agent-version-diff; `useUpdateAgent` + optional `message`, also invalidates agent-versions.
- `useSetAgentSkills` (`lib/hooks/skills.ts`): `mutate({ agentId, skillIds, message? })`, not optimistic; on success sets agent-skills, invalidates agents, agent, agent-versions.
- `SkillsTab` props `{ agent, onDirtyChange? }` (pass a stable setter; reports false on unmount if dirty).
- `useUnsavedGuard`: capture-phase document click handler → `window.confirm(t("skills.leaveConfirm"))` for same-origin `a[href]` to another page. If agent cards are anchors they'd hit this before S15's ConfirmModal — S15 uses buttons or an opt-out attribute.
- i18n `agents.json`: `editor.tabs.versions`, `config.note*`, `skills.{save,saving,cancel,unsaved,note,noteTooLong,discardTitle,discardBody,discardConfirm,leaveConfirm}`, `versions.*` incl. `versions.field.*`, `versions.diffTitle` = `v{from} → v{to}`.
- `AgentEditor.test.tsx` mocks `lib/hooks/agents` with a bare factory → S15 adds `importActual` + the new hooks.
- Test note: vendored `FormField` does not link its label; use `aria-label` on the input.

| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `frontend-architecture` | on demand | S9, S11, S12 | |
| `react-best-practices` | on demand | S9, S11, S12 | |
| `typescript-expert` | on demand | S9, S11, S12 | |
| `next-best-practices` | on demand | S11, S12 | |
| `react-testing-library` | on demand | S11, S12 | fireEvent per client gotcha |
- 2026-10-12 implement G4: done S13–S15 + T8/T10; client typecheck ok, full client 85 files / 635 passed. Main session re-ran: typecheck ok, `vitest run agents/` green. Deviations: `VersionsTab/SkillRefLabel.tsx` (shared by DiffView + RestoreConfirm); dirty-guard tests in new `page.test.tsx`; `AgentEditor` prop `onSkillsDirtyChange`, `SkillsTab key={agent.id}`; no-op tab/card clicks skip the guard; `ConfirmModal` unchanged → danger-styled "Trash" confirm for discard. Agent cards are `div onClick`, so no unsaved-guard opt-out needed. Noted: SkillsTab.test.tsx lacks the `common` namespace (MISSING_MESSAGE noise, tests pass)

## Handoffs → G4
- New `AgentEditor/_components/VersionsTab/` (VersionsTab, DiffView, RestoreConfirm, SkillRefLabel, helpers, constants, styles, index, test T8); `page.tsx` holds `skillsDirty` + `pendingNav`, routes tab switches and agent-card clicks through `ConfirmModal`; `RestoreConfirm` takes the version's skill names from `useAgentVersionDiff`.
- Server-supplied strings render as text nodes only; `CodeLine` reused from the diff viewer; the diff is fetched only on Diff click.

| Skill | Loaded | Applied in | Not used — reason |
|---|---|---|---|
| `frontend-architecture` | on demand (full) | S13–S15 | |
| `react-best-practices` | on demand (full) | S13–S15 | |
| `next-best-practices` | on demand (full) | S13, S15 | |
| `typescript-expert` | on demand (first 120 lines) | S13–S15 | |
| `react-testing-library` | on demand (first 200 lines) | S13–S15 | fireEvent per client gotcha |
| `security` | on demand (first 140 lines) | S13, S14 | |
