import type { SmartDiffResponse } from '@devdigest/shared';
import { buildSmartDiff } from './helpers.js';
import type { SmartDiffRepository } from './repository.js';

/** Narrow view of `SmartDiffRepository` the service depends on (D10-A precedent
 * from `intent/service.ts`) — the composition root is the only place allowed
 * to know both this service and its repository. */
export interface SmartDiffServiceDeps {
  repo: Pick<SmartDiffRepository, 'getPull' | 'getPrFiles' | 'latestReviewFindings'>;
}

/**
 * Smart Diff (S6, spec 007) — orchestration only. `buildSmartDiff` (pure,
 * reviewer-core-backed classification) does all the grouping logic; this
 * class just loads the PR's files and latest-review findings and hands them
 * over.
 */
export class SmartDiffService {
  constructor(private deps: SmartDiffServiceDeps) {}

  async get(workspaceId: string, prId: string): Promise<SmartDiffResponse | undefined> {
    const pull = await this.deps.repo.getPull(workspaceId, prId);
    if (!pull) return undefined;
    const [files, findings] = await Promise.all([
      this.deps.repo.getPrFiles(prId),
      this.deps.repo.latestReviewFindings(prId),
    ]);
    return buildSmartDiff(files, findings);
  }
}
