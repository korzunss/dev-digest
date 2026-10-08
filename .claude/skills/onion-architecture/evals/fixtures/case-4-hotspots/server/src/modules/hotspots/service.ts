import type { RepoRef } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { toRepoRef } from '../../platform/forge-resolve.js';
import { langForFile, parseSymbols } from '../../adapters/astgrep/index.js';
import { HOTSPOT_LIMIT, HOTSPOT_WINDOW_DAYS, MAX_SOURCE_BYTES } from './constants.js';
import { byScore, hotspotScore, isRankable } from './helpers.js';
import type { Hotspot, HotspotsServiceDeps } from './types.js';

export class HotspotsService {
  constructor(private deps: HotspotsServiceDeps) {}

  async list(workspaceId: string, repoId: string): Promise<Hotspot[]> {
    const repo = await this.deps.repo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    if (!repo.clonePath) return [];

    const churn = await this.deps.churn.commitsPerPath(repo.clonePath, HOTSPOT_WINDOW_DAYS);
    const paths = churn.filter((c) => isRankable(c.path)).map((c) => c.path);
    const ranks = await this.deps.repoIntel.getFileRank(repoId, paths);
    const rankByPath = new Map(ranks.map((r) => [r.path, r.percentile]));

    const out: Hotspot[] = [];
    for (const c of churn) {
      if (!isRankable(c.path)) continue;
      const percentile = rankByPath.get(c.path) ?? 0;
      const symbols = await this.countSymbols(toRepoRef(repo), c.path);
      out.push({ path: c.path, commits: c.commits, percentile, symbols, score: hotspotScore(c.commits, percentile, symbols) });
    }
    return out.sort(byScore).slice(0, HOTSPOT_LIMIT);
  }

  private async countSymbols(ref: RepoRef, path: string): Promise<number> {
    if (!langForFile(path)) return 0;
    const source = await this.deps.readSource(ref, path);
    if (source === null || source.length > MAX_SOURCE_BYTES) return 0;
    return parseSymbols(path, source).length;
  }
}
