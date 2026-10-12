import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import type { RepoRef, TagCommit, TagReader } from '@devdigest/shared';

export class GitTagReader implements TagReader {
  constructor(private readonly cloneDir: string) {}

  async commitsBetween(
    repo: RepoRef,
    fromTag: string,
    toTag: string,
    limit: number,
  ): Promise<TagCommit[]> {
    const git = simpleGit(join(this.cloneDir, repo.owner, repo.name));
    await git.fetch(['--tags']);
    const log = await git.log({ from: fromTag, to: toTag, maxCount: limit });
    return log.all.map((c) => ({
      sha: c.hash,
      subject: c.message,
      author: c.author_name,
    }));
  }
}
