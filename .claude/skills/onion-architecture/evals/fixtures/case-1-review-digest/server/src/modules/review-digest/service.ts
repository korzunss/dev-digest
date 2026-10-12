import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { toRepoRef } from '../../platform/forge-resolve.js';
import { OctokitGitHubClient } from '../../adapters/github/octokit.js';
import { DIGEST_DEFAULT_DAYS, DIGEST_MAX_DAYS, DIGEST_MAX_ENTRIES } from './constants.js';
import { averageScore, renderDigestMarkdown } from './helpers.js';
import { ReviewDigestRepository } from './repository.js';
import type { DigestEntry, RepoDigest } from './types.js';

export class ReviewDigestService {
  private repo: ReviewDigestRepository;

  constructor(private container: Container) {
    this.repo = new ReviewDigestRepository(container.db);
  }

  async build(workspaceId: string, repoId: string, days = DIGEST_DEFAULT_DAYS): Promise<RepoDigest> {
    const repo = await this.repo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const window = Math.min(Math.max(days, 1), DIGEST_MAX_DAYS);
    const since = new Date(Date.now() - window * 24 * 60 * 60 * 1000);
    const rows = await this.repo.reviewsSince(workspaceId, repoId, since, DIGEST_MAX_ENTRIES);
    const counts = await this.repo.findingCounts(rows.map((r) => r.reviewId));
    const byReview = new Map(counts.map((c) => [c.reviewId, c]));

    const entries: DigestEntry[] = rows.map((r) => ({
      ...r,
      findings: byReview.get(r.reviewId)?.findings ?? 0,
      critical: byReview.get(r.reviewId)?.critical ?? 0,
    }));

    return {
      repoId,
      since: since.toISOString(),
      entries,
      averageScore: averageScore(entries),
    };
  }

  async postToPull(
    workspaceId: string,
    repoId: string,
    pullNumber: number,
    days?: number,
  ): Promise<{ id: string }> {
    const digest = await this.build(workspaceId, repoId, days);
    const repo = await this.repo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const token = await this.container.secrets.get('GITHUB_TOKEN');
    if (!token) throw new NotFoundError('GitHub token is not configured');
    const github = new OctokitGitHubClient(token);

    return github.postReview(toRepoRef(repo), pullNumber, {
      body: renderDigestMarkdown(digest),
      event: 'COMMENT',
    });
  }
}
