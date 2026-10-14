import type { Octokit } from 'octokit';
import type { CheckAnnotationsClient, ForgeClient } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { toRepoRef } from '../../platform/forge-resolve.js';
import { CHECK_NAME, LEVEL_BY_SEVERITY, MAX_ANNOTATIONS } from './constants.js';
import type { ChecksRepository } from './repository.js';

type CheckOutput = NonNullable<Parameters<Octokit['rest']['checks']['create']>[0]>['output'];
type Annotation = NonNullable<NonNullable<CheckOutput>['annotations']>[number];

export interface ChecksServiceDeps {
  repo: ChecksRepository;
  checks: () => Promise<CheckAnnotationsClient>;
}

export class ChecksService {
  constructor(private deps: ChecksServiceDeps) {}

  async publish(workspaceId: string, reviewId: string): Promise<{ id: string; annotations: number }> {
    const target = await this.deps.repo.findTarget(workspaceId, reviewId);
    if (!target) throw new NotFoundError('Review not found');
    const repo = await this.deps.repo.findRepo(workspaceId, target.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const rows = await this.deps.repo.openFindings(reviewId).limit(MAX_ANNOTATIONS);
    const annotations: Annotation[] = rows.map((f) => ({
      path: f.file,
      start_line: f.startLine,
      end_line: f.endLine,
      annotation_level:
        LEVEL_BY_SEVERITY[f.severity as keyof typeof LEVEL_BY_SEVERITY] ?? 'notice',
      title: f.title,
      message: f.rationale,
    }));

    const client = await this.deps.checks();
    const { id } = await client.publish(toRepoRef(repo), target.headSha, {
      name: CHECK_NAME,
      annotations,
    });
    return { id, annotations: annotations.length };
  }
}
