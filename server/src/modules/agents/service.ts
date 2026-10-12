import type { Container } from '../../platform/container.js';
import { AgentVersionConfig } from '@devdigest/shared';
import { SYNC_VERSION_MESSAGE, restoreVersionMessage } from './constants.js';
import type {
  Agent,
  AgentContext,
  AgentSkillLink,
  AgentVersion,
  AgentVersionDiff,
  AgentVersionRestoreResult,
  CiFailOn,
  InheritedContextDoc,
  ModelInfo,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import { AgentsRepository } from './repository.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { buildVersionDiff, canonicalJson, recordedSkillIds, toAgentDto, toAgentVersionDto } from './helpers.js';

/**
 * A2 — agents service. Business logic for the Agents tab + Agent Editor.
 * Provider/model selection uses the LLM adapter's dynamic model list.
 *
 * An Agent = provider + model + system_prompt + linked skills + output_schema +
 * enabled. Config changes are versioned via `agent_versions` (repository).
 */

// Re-exported for backwards compatibility; implementation lives in ./helpers.
export { toAgentDto } from './helpers.js';

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  ci_fail_on?: CiFailOn;
  repo_intel?: boolean;
  enabled?: boolean;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  system_prompt?: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  ci_fail_on?: CiFailOn;
  repo_intel?: boolean;
  enabled?: boolean;
}

/** A blank (whitespace-only) note counts as no note. */
const cleanMessage = (m: string | undefined): string | undefined => m?.trim() || undefined;

export class AgentsService {
  private repo: AgentsRepository;

  constructor(private container: Container) {
    this.repo = new AgentsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Agent[]> {
    const rows = await this.repo.list(workspaceId);
    // One extra query for the page, not one per card.
    const counts = await this.repo.skillCounts(rows.map((r) => r.id));
    return rows.map((row) => ({ ...toAgentDto(row), skill_count: counts.get(row.id) ?? 0 }));
  }

  async get(workspaceId: string, id: string): Promise<Agent | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toAgentDto(row) : undefined;
  }

  /** Delete an agent (and its versions/skill-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateAgentInput, userId?: string): Promise<Agent> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      provider: input.provider,
      model: input.model,
      systemPrompt: input.system_prompt,
      outputSchema: input.output_schema,
      ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
      ...(input.ci_fail_on !== undefined ? { ciFailOn: input.ci_fail_on } : {}),
      ...(input.repo_intel !== undefined ? { repoIntel: input.repo_intel } : {}),
      enabled: input.enabled,
      createdBy: userId ?? null,
    });
    return toAgentDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgentInput,
    message?: string,
  ): Promise<Agent | undefined> {
    const note = cleanMessage(message);
    // Row lock: the version bump reads `existing.version`, so concurrent saves must queue.
    return this.repo.transaction(async (repo) => {
      if (!(await repo.lockById(workspaceId, id))) return undefined;
      const row = await repo.update(
        workspaceId,
        id,
        this.toRepoPatch(patch),
        note !== undefined ? { message: note } : {},
      );
      return row ? toAgentDto(row) : undefined;
    });
  }

  private toRepoPatch(patch: UpdateAgentInput) {
    return {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.system_prompt !== undefined ? { systemPrompt: patch.system_prompt } : {}),
      ...(patch.output_schema !== undefined ? { outputSchema: patch.output_schema } : {}),
      ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
      ...(patch.ci_fail_on !== undefined ? { ciFailOn: patch.ci_fail_on } : {}),
      ...(patch.repo_intel !== undefined ? { repoIntel: patch.repo_intel } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    };
  }

  /**
   * Config history for an agent, newest version first. Workspace-scoped: returns
   * undefined when the agent isn't in this workspace (the route maps that to 404)
   * so version snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, agentId: string): Promise<AgentVersion[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.repo.listVersions(agentId);
    return rows.map(toAgentVersionDto);
  }

  /**
   * A single config snapshot for an agent. Returns undefined when the agent isn't
   * in this workspace OR that version was never recorded (route → 404).
   */
  async getVersion(
    workspaceId: string,
    agentId: string,
    version: number,
  ): Promise<AgentVersion | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const row = await this.repo.getVersion(agentId, version);
    return row ? toAgentVersionDto(row) : undefined;
  }

  /** Linked skills for an agent as AgentSkillLink[] (ordered). */
  async skillLinks(agentId: string): Promise<AgentSkillLink[]> {
    const links = await this.repo.linkedSkills(agentId);
    return links.map((l) => ({ agent_id: agentId, skill_id: l.skill.id, order: l.order }));
  }

  /**
   * Context documents: the agent's own links plus what its enabled skills bring.
   * `inherited` omits own paths and repeats of the same path (first wins).
   */
  async contextLinks(workspaceId: string, agentId: string): Promise<AgentContext | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const [own, inherited] = await Promise.all([
      this.repo.listContextDocs(agentId),
      this.repo.inheritedContextDocs(agentId),
    ]);
    const seen = new Set(own.map((r) => r.path));
    const inheritedOut: InheritedContextDoc[] = [];
    for (const r of inherited) {
      if (seen.has(r.path)) continue;
      seen.add(r.path);
      inheritedOut.push({ path: r.path, skill_id: r.skillId, skill_name: r.skillName });
    }
    return {
      links: own.map((r) => ({ agent_id: agentId, path: r.path, order: r.order })),
      inherited: inheritedOut,
    };
  }

  /**
   * Replace the agent's own context links. Paths are stored canonical
   * (`./specs/a.md` -> `specs/a.md`); existence is validated when READ, not
   * here (a document can appear or vanish from a clone). No version bump:
   * links are not part of the agent's config snapshot.
   */
  async setContextLinks(
    workspaceId: string,
    agentId: string,
    paths: string[],
  ): Promise<AgentContext | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const deduped = [...new Set(this.canonicalPaths(paths))];
    await this.repo.transaction((r) => r.setContextDocs(agentId, deduped));
    return this.contextLinks(workspaceId, agentId);
  }

  /** Canonicalise via the context module's one normaliser; a path it refuses is a 422. */
  private canonicalPaths(paths: string[]): string[] {
    return paths.map((p) => {
      const canonical = this.container.context.normalisePath(p);
      if (canonical === null) throw new ValidationError(`Invalid document path "${p.slice(0, 80)}"`);
      return canonical;
    });
  }

  /**
   * Set / reorder the agent's linked skills. If `skillIds` is provided, replaces
   * the whole set in that order. Returns the resulting ordered links.
   */
  async setSkills(
    workspaceId: string,
    agentId: string,
    skillIds: string[],
    message?: string,
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.assertSkillsInWorkspace(workspaceId, skillIds);
    const note = cleanMessage(message);
    const found = await this.repo.transaction(async (repo) => {
      if (!(await repo.lockById(workspaceId, agentId))) return false;
      const current = await repo.skillIdsForAgent(agentId);
      const same = current.length === skillIds.length && current.every((id, i) => id === skillIds[i]);
      if (same) return true; // no-op save: no write, no version
      await repo.setSkills(agentId, skillIds);
      const row = await repo.update(
        workspaceId,
        agentId,
        {},
        { bumpVersion: true, ...(note !== undefined ? { message: note } : {}) },
      );
      if (!row) throw new NotFoundError(`agent ${agentId} vanished during set-skills`);
      return true;
    });
    return found ? this.skillLinks(agentId) : undefined;
  }

  /**
   * Built-in sync for one agent, in ONE transaction: detach the linked skills
   * named in `detachSkillNames` (others keep their order), set the prompt, bump
   * the version and snapshot. A detach alone also bumps the version, so the
   * snapshot records the post-detach skill set. `dryRun` reports without
   * writing. Returns undefined when the agent isn't in this workspace.
   */
  async syncBuiltin(
    workspaceId: string,
    agentId: string,
    input: { systemPrompt: string; detachSkillNames: readonly string[]; dryRun?: boolean },
  ): Promise<
    { detached: string[]; changed: boolean; fromVersion: number; toVersion: number } | undefined
  > {
    return this.repo.transaction(async (repo) => {
      // Row lock: a concurrent sync/edit waits here, so `version` below is current.
      const agent = await repo.lockById(workspaceId, agentId);
      if (!agent) return undefined;
      const links = await repo.linkedSkills(agentId);
      const drop = new Set(input.detachSkillNames);
      const detached = links.filter((l) => drop.has(l.skill.name)).map((l) => l.skill.name);
      const promptChanged = agent.systemPrompt !== input.systemPrompt;
      const changed = detached.length > 0 || promptChanged;
      const v = agent.version;
      if (!changed) return { detached, changed, fromVersion: v, toVersion: v };
      if (input.dryRun) return { detached, changed, fromVersion: v, toVersion: v + 1 };
      if (detached.length > 0) {
        await repo.setSkills(
          agentId,
          links.filter((l) => !drop.has(l.skill.name)).map((l) => l.skill.id),
        );
      }
      const row = await repo.update(
        workspaceId,
        agentId,
        promptChanged ? { systemPrompt: input.systemPrompt } : {},
        { bumpVersion: true, message: SYNC_VERSION_MESSAGE },
      );
      // Throw, don't return: a vanished row must roll back the detach above.
      if (!row) throw new NotFoundError(`agent ${agentId} vanished during sync`);
      return { detached, changed, fromVersion: v, toVersion: row.version };
    });
  }

  /**
   * Promote a past version's config: write it as a NEW version (past versions
   * stay untouched) and restore the skill set it recorded, in ONE transaction.
   * `config` is a stored `agent_versions.config_json`; a malformed one is a 422.
   * Returns undefined when the agent isn't in this workspace.
   */
  async promote(
    workspaceId: string,
    agentId: string,
    input: {
      config: Record<string, unknown>;
      skillIds: string[];
      message?: string;
      /**
       * Drop skill ids that no longer exist in the workspace instead of a 422. The
       * check runs inside the agent's row lock, so a skill deleted in between is
       * dropped and reported, never a failed restore.
       */
      dropMissingSkills?: boolean;
    },
  ): Promise<{ version: number; droppedSkillIds: string[] } | undefined> {
    const parsed = AgentVersionConfig.omit({ skills: true }).safeParse(input.config);
    if (!parsed.success) {
      throw new ValidationError('Stored version config is malformed', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const cfg = parsed.data;
    const note = cleanMessage(input.message);
    if (!input.dropMissingSkills) await this.assertSkillsInWorkspace(workspaceId, input.skillIds);
    return this.repo.transaction(async (repo) => {
      const agent = await repo.lockById(workspaceId, agentId);
      if (!agent) return undefined;
      let skillIds = input.skillIds;
      let droppedSkillIds: string[] = [];
      if (input.dropMissingSkills) {
        const live = await repo.skillNamesByIds(workspaceId, skillIds);
        skillIds = skillIds.filter((id) => live.has(id));
        droppedSkillIds = input.skillIds.filter((id) => !live.has(id));
      }
      await repo.setSkills(agentId, skillIds);
      const schemaDiffers =
        cfg.output_schema != null &&
        canonicalJson(cfg.output_schema) !== canonicalJson(agent.outputSchema);
      const row = await repo.update(
        workspaceId,
        agentId,
        {
          provider: cfg.provider,
          model: cfg.model,
          systemPrompt: cfg.system_prompt,
          strategy: cfg.strategy,
          ciFailOn: cfg.ci_fail_on,
          repoIntel: cfg.repo_intel,
          ...(schemaDiffers ? { outputSchema: cfg.output_schema } : {}),
        },
        { bumpVersion: true, ...(note !== undefined ? { message: note } : {}) },
      );
      // Throw, don't return: a vanished row must roll back the skill restore above.
      if (!row) throw new NotFoundError(`agent ${agentId} vanished during promote`);
      return { version: row.version, droppedSkillIds };
    });
  }

  /** Link a single skill (append or set order) — additive to existing links. */
  async linkSkill(
    workspaceId: string,
    agentId: string,
    skillId: string,
    order?: number,
    message?: string,
  ): Promise<AgentSkillLink[] | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    await this.assertSkillsInWorkspace(workspaceId, [skillId]);
    const ok = await this.repo.transaction(async (repo) => {
      if (!(await repo.lockById(workspaceId, agentId))) return false;
      const existing = await repo.linkedSkills(agentId);
      const current = existing.find((l) => l.skill.id === skillId);
      // Already linked (anywhere when no order is given, else at that position): no write, no version.
      if (current && (order === undefined || current.order === order)) return true;
      const target = order ?? existing.length;
      await repo.linkSkill(agentId, skillId, target);
      const note = cleanMessage(message);
      const row = await repo.update(
        workspaceId,
        agentId,
        {},
        { bumpVersion: true, ...(note !== undefined ? { message: note } : {}) },
      );
      if (!row) throw new NotFoundError(`agent ${agentId} vanished during link`);
      return true;
    });
    return ok ? this.skillLinks(agentId) : undefined;
  }

  /**
   * A stored version against the agent's current config: prompt patch, changed
   * fields and skill-set changes. Undefined when the agent or version is missing.
   */
  async versionDiff(
    workspaceId: string,
    agentId: string,
    version: number,
  ): Promise<AgentVersionDiff | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const row = await this.repo.getVersion(agentId, version);
    if (!row) return undefined;
    const linked = await this.repo.linkedSkills(agentId);
    const currentSkills = linked.map((l) => ({ id: l.skill.id, name: l.skill.name }));
    const recordedIds = recordedSkillIds(row.configJson);
    const ids = [...new Set([...recordedIds, ...currentSkills.map((s) => s.id)])];
    const liveNames = await this.repo.skillNamesByIds(workspaceId, ids);
    return buildVersionDiff({
      from: version,
      fromConfig: row.configJson,
      current: {
        version: agent.version,
        provider: agent.provider,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        outputSchema: agent.outputSchema,
        strategy: agent.strategy,
        ciFailOn: agent.ciFailOn,
        repoIntel: agent.repoIntel,
      },
      currentSkills,
      liveNames,
    });
  }

  /**
   * Restore a past version as a NEW version (always appends). Skills deleted
   * since are dropped and reported. Undefined when the agent or version is missing.
   */
  async restore(
    workspaceId: string,
    agentId: string,
    version: number,
    message?: string,
  ): Promise<AgentVersionRestoreResult | undefined> {
    const agent = await this.repo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const row = await this.repo.getVersion(agentId, version);
    if (!row) return undefined;
    const parsed = AgentVersionConfig.safeParse(row.configJson);
    if (!parsed.success) throw new ValidationError('Stored version config is malformed');
    const out = await this.promote(workspaceId, agentId, {
      config: parsed.data,
      skillIds: parsed.data.skills,
      dropMissingSkills: true,
      message: cleanMessage(message) ?? restoreVersionMessage(version),
    });
    if (!out) return undefined;
    return {
      agent_id: agentId,
      version: out.version,
      restored_from: version,
      dropped_skill_ids: out.droppedSkillIds,
    };
  }

  /**
   * Reject skill ids that don't belong to this workspace.
   *
   * Checking the AGENT is not enough: `agent_skills` has a foreign key to
   * `skills` but no notion of a tenant, so without this a caller could attach
   * another workspace's skill — and its body would then be read into this
   * workspace's prompts. Unknown ids are rejected by the same check (a 422
   * beats the foreign-key 500 they used to produce).
   */
  private async assertSkillsInWorkspace(workspaceId: string, skillIds: string[]): Promise<void> {
    if (skillIds.length === 0) return;
    const found = new Set(await this.container.skillsRepo.idsInWorkspace(workspaceId, skillIds));
    const foreign = [...new Set(skillIds)].filter((id) => !found.has(id));
    if (foreign.length > 0) {
      throw new ValidationError('Unknown skill for this workspace', { skill_ids: foreign });
    }
  }

  /**
   * Dynamic model list from the provider adapter's /models. Degrades gracefully
   * to [] if the provider key is not configured (the editor still renders).
   */
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    try {
      const llm = await this.container.llm(provider);
      return await llm.listModels();
    } catch {
      return [];
    }
  }
}
