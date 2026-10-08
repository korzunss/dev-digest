import { Octokit } from 'octokit';
import type { CheckAnnotationsClient, CheckRunInput, RepoRef } from '@devdigest/shared';
import { withRetry, withTimeout } from '../../platform/resilience.js';

const BATCH = 50;

export class OctokitCheckAnnotations implements CheckAnnotationsClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async publish(repo: RepoRef, headSha: string, input: CheckRunInput): Promise<{ id: string }> {
    const first = input.annotations.slice(0, BATCH);
    const conclusion = input.annotations.some((a) => a.annotation_level === 'failure')
      ? 'failure'
      : 'neutral';
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.checks.create({
          owner: repo.owner,
          repo: repo.name,
          name: input.name,
          head_sha: headSha,
          status: 'completed',
          conclusion,
          output: {
            title: input.name,
            summary: `${input.annotations.length} finding(s)`,
            annotations: first,
          },
        }),
        30_000,
      ),
    );
    return { id: String(res.data.id) };
  }
}
