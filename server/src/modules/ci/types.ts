import type { CiFailOn, ForgeClient, Provider, RepoRef, RunnerBundleSource } from '@devdigest/shared';
import type { CiRepository } from './repository.js';

/**
 * Consumer ports of the `ci` module: the shapes `CiService` needs from its
 * neighbours. `container.agentsRepo` satisfies `CiAgentsPort` structurally.
 */

/** The agent fields the export reads. */
export interface CiAgent {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: 'auto' | 'single-pass' | 'map-reduce';
  ciFailOn: CiFailOn;
  version: number;
}

export interface CiAgentsPort {
  getById(workspaceId: string, id: string): Promise<CiAgent | undefined>;
  linkedSkills(agentId: string): Promise<{ skill: { name: string; body: string } }[]>;
}

export interface CiServiceDeps {
  repo: CiRepository;
  agents: CiAgentsPort;
  /** Resolves the forge client for a repo (throws `ConfigError` when the token is missing). */
  forge: (ref?: { provider?: 'github' | 'gitlab' | null; apiBase?: string | null }) => Promise<ForgeClient>;
  bundle: RunnerBundleSource;
  now?: () => Date;
}

export type { RepoRef };
