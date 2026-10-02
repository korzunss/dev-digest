import type { BlastRadius, ForgeClient, PrHistory, RepoRef } from '@devdigest/shared';
import { toRepoRef } from '../../platform/forge-resolve.js';
import type { RepoIntel } from '../repo-intel/types.js';
import { toBlastRadius } from './helpers.js';
import type { BlastRepository } from './repository.js';
import {
  HISTORY_CACHE_MAX,
  HISTORY_COMMITS_PER_PATH,
  HISTORY_LIMIT,
  HISTORY_MAX_PATHS,
  HISTORY_TTL_MS,
} from './constants.js';

export interface BlastServiceDeps {
  repo: Pick<BlastRepository, 'getPull' | 'getPrFilePaths'>;
  repoIntel: Pick<RepoIntel, 'getBlastRadius'>;
  forge: (ref: RepoRef) => Promise<Pick<ForgeClient, 'listMergedPullsTouching'>>;
  now?: () => number;
}

export interface BlastLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

/**
 * Blast Radius — orchestration only. The facade owns traversal and limits;
 * `toBlastRadius` (pure) shapes the contract. Prior PRs come from the forge
 * port, cached in-process per `(prId, headSha)`.
 */
export class BlastService {
  private cache = new Map<string, { at: number; value: PrHistory }>();

  constructor(private deps: BlastServiceDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  async getBlast(
    workspaceId: string,
    prId: string,
    log: BlastLogger,
  ): Promise<BlastRadius | undefined> {
    const found = await this.deps.repo.getPull(workspaceId, prId);
    if (!found) return undefined;
    const paths = await this.deps.repo.getPrFilePaths(prId);
    const result = await this.deps.repoIntel.getBlastRadius(found.pull.repoId, paths);
    const out = toBlastRadius(result);
    if (result.source === 'index') {
      log.info(
        { prId, symbols: out.changed_symbols.length, callers: result.callers.length },
        `blast: read persistent repo index (status=${result.indexStatus ?? 'unknown'}) — no AST/import-graph rebuild`,
      );
    } else {
      const reason = result.reason ?? 'unknown';
      log.info({ prId, reason }, `blast: index unavailable (${reason}) — degraded ripgrep fallback`);
    }
    return out;
  }

  async getHistory(
    workspaceId: string,
    prId: string,
    log: BlastLogger,
  ): Promise<PrHistory | undefined> {
    const found = await this.deps.repo.getPull(workspaceId, prId);
    if (!found) return undefined;
    const { pull, repo } = found;

    const key = `${prId}:${pull.headSha}`;
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < HISTORY_TTL_MS) return hit.value;

    const all = await this.deps.repo.getPrFilePaths(prId);
    const paths = [...all].sort().slice(0, HISTORY_MAX_PATHS);
    if (paths.length === 0) return this.remember(key, { status: 'ok', history: [] });

    try {
      const forge = await this.deps.forge(toRepoRef(repo));
      const lookup = await forge.listMergedPullsTouching(toRepoRef(repo), paths, {
        excludeNumber: pull.number,
        commitsPerPath: HISTORY_COMMITS_PER_PATH,
        limit: HISTORY_LIMIT,
      });
      if (!lookup.supported) return this.remember(key, { status: 'unsupported', history: [] });
      return this.remember(key, {
        status: 'ok',
        history: lookup.items.map((p) => ({
          pr_number: p.number,
          title: p.title,
          author: p.author,
          merged_at: p.merged_at,
          files_overlap: p.paths,
          notes: '',
        })),
      });
    } catch (err) {
      log.warn(
        { prId, err: err instanceof Error ? err.message : 'unknown error' },
        'pr history unavailable',
      );
      return { status: 'unavailable', history: [] };
    }
  }

  private remember(key: string, value: PrHistory): PrHistory {
    this.cache.delete(key);
    this.cache.set(key, { at: this.now(), value });
    while (this.cache.size > HISTORY_CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    return value;
  }
}
