import type {
  EvalModelPick,
  EvalSkillRef,
  EvalSuiteCase,
  LLMProvider,
  Provider,
  UnifiedDiff,
} from '@devdigest/shared';
import type { reviewPullRequest } from '@devdigest/reviewer-core';
import type { EvalPipelineRepository, SuiteCaseRow } from './repository/pipeline.repo.js';

/**
 * Ports of the eval pipeline service (plan 34). The service depends on these
 * narrow shapes only; the container passes the agents, reviews and skills
 * services, which satisfy them structurally. Nothing here imports another
 * module (`no-foreign-consumer-ports`).
 */

export type ReviewFn = typeof reviewPullRequest;
export type ReviewParams = Parameters<ReviewFn>[0];

/** An agent as the eval pipeline needs it. */
export interface EvalAgent {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: NonNullable<ReviewParams['strategy']>;
  version: number;
  enabled: boolean;
}

/** A skill linked to an agent, with its rendered body. */
export interface EvalAgentSkill {
  id: string;
  name: string;
  version: number;
  enabled: boolean;
  rendered: string;
}

export interface EvalAgentsPort {
  getById(workspaceId: string, agentId: string): Promise<EvalAgent | undefined>;
  listAll(workspaceId: string): Promise<EvalAgent[]>;
  skillsFor(agentId: string): Promise<EvalAgentSkill[]>;
  /** Which of `skillIds` still exist in the workspace (a promote restores only those). */
  existingSkillIds(workspaceId: string, skillIds: string[]): Promise<string[]>;
  /** The stored config of one past version (`agent_versions.config_json`), or null. */
  versionConfig(agentId: string, version: number): Promise<Record<string, unknown> | null>;
}

/** A finding with its PR; no diff text (cheap). */
export interface FindingRef {
  finding: {
    id: string;
    file: string;
    start_line: number;
    end_line: number;
    title: string;
    severity: string;
    category: string;
    /** accepted seeds a must_find, dismissed a must_not_flag, neither is undecided. */
    accepted: boolean;
    dismissed: boolean;
  };
  /** The agent that produced the finding, when still known. */
  agentId: string | null;
  pr: {
    id: string;
    repo_id: string;
    repo: string;
    number: number;
    title: string;
    head_sha: string;
  };
}

/** A `FindingRef` plus the finding's file section of the PR's current diff (null when none can be had). */
export interface FindingSource extends FindingRef {
  fileDiff: string | null;
}

export interface EvalReviewSourcePort {
  findingRef(workspaceId: string, findingId: string): Promise<FindingRef>;
  findingSource(workspaceId: string, findingId: string): Promise<FindingSource>;
}

export interface EvalPromotePort {
  promote(
    workspaceId: string,
    agentId: string,
    input: { config: Record<string, unknown>; skillIds: string[] },
  ): Promise<{ version: number }>;
}

/** The agent exactly as one suite run sees it (enabled skills only). */
export interface EvalAgentSnapshot {
  /** Whose version `version` is; absent means an agent (plan 34 callers). */
  owner?: 'agent' | 'skill';
  /** The agent id, or the skill id for a skill case run. */
  id: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: NonNullable<ReviewParams['strategy']>;
  version: number;
  skills: EvalSkillRef[];
  /** Rendered skill bodies, in attach order. */
  rendered: string[];
}

/** A skill as the eval pipeline needs it. */
export interface EvalSkill {
  id: string;
  name: string;
  version: number;
  enabled: boolean;
  rendered: string;
}

export interface EvalSkillsPort {
  getById(workspaceId: string, skillId: string): Promise<EvalSkill | undefined>;
  /** Agents the skill is attached to (any enabled state), by name. */
  agentsUsing(workspaceId: string, skillId: string): Promise<{ id: string; name: string }[]>;
  /** The first attached agent's provider/model, or null when none. */
  defaultPick(workspaceId: string, skillId: string): Promise<EvalModelPick | null>;
}

/** Runs one saved skill case on a pick; implemented by the skill suite service. */
export interface EvalSkillCaseRunPort {
  runSavedCase(workspaceId: string, row: SuiteCaseRow, pick: EvalModelPick): Promise<EvalSuiteCase>;
}

export interface EvalSkillSuiteServiceDeps {
  repo: EvalPipelineRepository;
  skills: EvalSkillsPort;
  llm: (provider: Provider) => Promise<LLMProvider>;
  review: ReviewFn;
  parseDiff: (raw: string) => UnifiedDiff;
  callOptions: Pick<
    ReviewParams,
    'callDeadlineMs' | 'maxOutputTokens' | 'routing' | 'retryRouting' | 'maxSkippedChunkFraction'
  >;
  countTokens?: (s: string) => number;
  estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null;
  now: () => Date;
}

export interface EvalPipelineServiceDeps {
  repo: EvalPipelineRepository;
  agents: EvalAgentsPort;
  skills: EvalSkillsPort;
  skillCases: EvalSkillCaseRunPort;
  reviews: EvalReviewSourcePort;
  promote: EvalPromotePort;
  /** Rejects with a `ConfigError` when the provider has no API key. */
  llm: (provider: Provider) => Promise<LLMProvider>;
  review: ReviewFn;
  parseDiff: (raw: string) => UnifiedDiff;
  callOptions: Pick<
    ReviewParams,
    'callDeadlineMs' | 'maxOutputTokens' | 'routing' | 'retryRouting' | 'maxSkippedChunkFraction'
  >;
  countTokens?: (s: string) => number;
  estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null;
  now: () => Date;
}
