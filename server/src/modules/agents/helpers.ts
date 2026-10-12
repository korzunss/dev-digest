import { createTwoFilesPatch } from 'diff';
import type {
  Agent,
  AgentVersion,
  AgentVersionDiff,
  AgentVersionFieldChange,
  AgentVersionSkillRef,
  CiFailOn,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import { AgentVersionConfig } from '@devdigest/shared';
import type { AgentRow, AgentVersionRow } from './repository.js';

/**
 * Pure helpers for the agents module — DB row ⇄ DTO mapping and the
 * config-version-bump rule. No I/O; behaviour-identical to the previous inline
 * implementations.
 */

/** Map a persisted agent row to the public `Agent` DTO. */
export function toAgentDto(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    provider: row.provider as Provider,
    model: row.model,
    system_prompt: row.systemPrompt,
    output_schema: row.outputSchema ?? null,
    enabled: row.enabled,
    version: row.version,
    strategy: row.strategy as ReviewStrategy,
    ci_fail_on: row.ciFailOn as CiFailOn,
    repo_intel: row.repoIntel,
  };
}

/**
 * Map a persisted `agent_versions` row to the public `AgentVersion` DTO. The
 * stored `config_json` is untyped jsonb (a snapshot from an older config shape
 * could drift), so it is parsed through `AgentVersionConfig` — a malformed
 * snapshot yields `config: null` ("unreadable") rather than leaking an
 * unvalidated blob to the client or failing the whole list.
 */
export function toAgentVersionDto(row: AgentVersionRow): AgentVersion {
  return {
    agent_id: row.agentId,
    version: row.version,
    config: AgentVersionConfig.safeParse(row.configJson).data ?? null,
    message: row.message ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** Fields whose change bumps the agent's config version (anything but `enabled`). */
export interface ConfigChangePatch {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
}

/** JSON with object keys sorted recursively, so key order never matters (jsonb reorders keys). */
export function canonicalJson(x: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, val]) => [k, sort(val)]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(x ?? null));
}

/** Skill ids a stored version recorded; tolerates a config that no longer parses. */
export function recordedSkillIds(configJson: unknown): string[] {
  const parsed = AgentVersionConfig.safeParse(configJson);
  if (parsed.success) return parsed.data.skills;
  const raw = (configJson as { skills?: unknown } | null | undefined)?.skills;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * True when a patch changes config (vs. just toggling `enabled`) relative to the
 * existing row — a config change bumps the version and snapshots agent_versions.
 */
export function isConfigChange(
  existing: Pick<
    AgentRow,
    | 'provider'
    | 'model'
    | 'systemPrompt'
    | 'strategy'
    | 'ciFailOn'
    | 'repoIntel'
    | 'outputSchema'
  >,
  patch: ConfigChangePatch,
): boolean {
  return (
    (patch.provider !== undefined && patch.provider !== existing.provider) ||
    (patch.model !== undefined && patch.model !== existing.model) ||
    (patch.systemPrompt !== undefined && patch.systemPrompt !== existing.systemPrompt) ||
    (patch.strategy !== undefined && patch.strategy !== existing.strategy) ||
    (patch.ciFailOn !== undefined && patch.ciFailOn !== existing.ciFailOn) ||
    (patch.repoIntel !== undefined && patch.repoIntel !== existing.repoIntel) ||
    (patch.outputSchema !== undefined &&
      canonicalJson(patch.outputSchema) !== canonicalJson(existing.outputSchema))
  );
}

/** Input of {@link buildVersionDiff}: a stored snapshot against the live agent. */
export interface VersionDiffInput {
  from: number;
  fromConfig: unknown;
  current: {
    version: number;
    provider: string;
    model: string;
    systemPrompt: string;
    outputSchema: unknown;
    strategy: string;
    ciFailOn: string;
    repoIntel: boolean;
  };
  currentSkills: { id: string; name: string }[];
  /** id -> name of the skills that still exist in the workspace. */
  liveNames: Map<string, string>;
}

/** Pure diff of a stored version against the agent's current config (no I/O). */
export function buildVersionDiff(input: VersionDiffInput): AgentVersionDiff {
  const { current, liveNames } = input;
  const parsed = AgentVersionConfig.safeParse(input.fromConfig);
  const recordedNames: Record<string, string> = parsed.success
    ? (parsed.data.skill_names ?? {})
    : {};

  const fromIds = recordedSkillIds(input.fromConfig);

  const ref = (id: string): AgentVersionSkillRef => ({
    id,
    name: liveNames.get(id) ?? recordedNames[id] ?? null,
    deleted: !liveNames.has(id),
  });
  const toIds = input.currentSkills.map((s) => s.id);
  const toSet = new Set(toIds);
  const fromSet = new Set(fromIds);
  const added = toIds.filter((id) => !fromSet.has(id)).map(ref);
  const removed = fromIds.filter((id) => !toSet.has(id)).map(ref);
  const commonFrom = fromIds.filter((id) => toSet.has(id));
  const commonTo = toIds.filter((id) => fromSet.has(id));
  const orderChanged = commonFrom.some((id, i) => id !== commonTo[i]);

  const fields: AgentVersionFieldChange[] = [];
  let promptPatch = '';
  if (parsed.success) {
    const cfg = parsed.data;
    const pairs: [AgentVersionFieldChange['field'], string | boolean | null, string | boolean | null][] = [
      ['provider', cfg.provider, current.provider],
      ['model', cfg.model, current.model],
      ['strategy', cfg.strategy, current.strategy],
      ['ci_fail_on', cfg.ci_fail_on, current.ciFailOn],
      ['repo_intel', cfg.repo_intel, current.repoIntel],
    ];
    for (const [field, from, to] of pairs) if (from !== to) fields.push({ field, from, to });
    // An old null/undefined schema counts as unchanged: Promote keeps the current one.
    if (cfg.output_schema != null && canonicalJson(cfg.output_schema) !== canonicalJson(current.outputSchema)) {
      fields.push({
        field: 'output_schema',
        from: canonicalJson(cfg.output_schema),
        to: canonicalJson(current.outputSchema),
      });
    }
    if (cfg.system_prompt !== current.systemPrompt) {
      promptPatch = createTwoFilesPatch(
        'system-prompt',
        'system-prompt',
        cfg.system_prompt,
        current.systemPrompt,
        `v${input.from}`,
        `v${current.version}`,
      );
    }
  }

  return {
    from: input.from,
    to: current.version,
    config_available: parsed.success,
    prompt_patch: promptPatch,
    fields,
    skills: { from: fromIds.map(ref), to: toIds.map(ref), added, removed, order_changed: orderChanged },
    identical:
      promptPatch === '' &&
      fields.length === 0 &&
      added.length === 0 &&
      removed.length === 0 &&
      !orderChanged,
  };
}
