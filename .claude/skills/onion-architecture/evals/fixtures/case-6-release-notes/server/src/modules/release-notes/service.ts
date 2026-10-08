import type { NotesWriter, ReleaseNotes, TagReader } from '@devdigest/shared';
import { toRepoRef } from '../../platform/forge-resolve.js';
import { DEFAULT_MAX_COMMITS } from './constants.js';
import type { ReleaseNotesRepository } from './repository.js';

export interface ReleaseNotesServiceDeps {
  repo: ReleaseNotesRepository;
  tags: TagReader;
  writer: NotesWriter;
}

export class ReleaseNotesService {
  constructor(private readonly deps: ReleaseNotesServiceDeps) {}

  async generate(
    workspaceId: string,
    repoId: string,
    fromTag: string,
    toTag: string,
  ): Promise<ReleaseNotes | undefined> {
    const row = await this.deps.repo.getRepo(workspaceId, repoId);
    if (!row) return undefined;

    const limit = Number(process.env.RELEASE_NOTES_MAX_COMMITS ?? DEFAULT_MAX_COMMITS);
    const commits = await this.deps.tags.commitsBetween(toRepoRef(row), fromTag, toTag, limit);
    if (commits.length === 0) {
      return { fromTag, toTag, commitCount: 0, markdown: '' };
    }

    const markdown = await this.deps.writer.write({
      repo: row.fullName,
      fromTag,
      toTag,
      commits,
    });
    return { fromTag, toTag, commitCount: commits.length, markdown };
  }
}
