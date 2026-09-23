import type { Container } from '../../platform/container.js';
import { type Repo, type ForgeProvider } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { RepoRepository } from './repository.js';
import { parseRepoUrl, withForgeToken, toRepoDto, cloneUrlFor } from './helpers.js';
import { CLONE_JOB_KIND, CLONE_DEPTH } from './constants.js';
import { forgeTokenKeys } from '../../platform/forge-resolve.js';
import {
  INDEX_JOB_KIND,
  REFRESH_JOB_KIND,
} from '../repo-intel/constants.js';

/**
 * F1 — repos service. Business logic for the Repositories feature:
 *   - add / list / refresh / remove
 *   - the asynchronous `clone` job (real `git clone` via the GitClient adapter)
 *
 * No HTTP and no raw SQL live here — persistence goes through RepoRepository,
 * pure transforms through helpers.ts, literals through constants.ts.
 */

/** Payload enqueued for (and consumed by) the `clone` job. */
export interface CloneJobPayload {
  repoId: string;
  owner: string;
  name: string;
  url: string;
  /** Absent on jobs enqueued before GitLab support — treated as 'github'. */
  provider?: ForgeProvider;
  apiBase?: string | null;
}

export class RepoService {
  private repo: RepoRepository;

  constructor(private container: Container) {
    this.repo = new RepoRepository(container.db);
  }

  /**
   * Register the `clone` job handler once. Authenticates the clone with the
   * stored GitHub PAT (so private repos work), clones via the GitClient adapter,
   * then persists the resulting path + last_polled_at.
   */
  registerCloneJobHandler(): void {
    this.container.jobs.register(CLONE_JOB_KIND, async (payload) => {
      await this.runCloneJob(payload as CloneJobPayload);
    });
  }

  async runCloneJob(payload: CloneJobPayload): Promise<void> {
    const { repoId, owner, name, url } = payload;
    const provider: ForgeProvider = payload.provider ?? 'github';
    const token = await this.resolveForgeToken(provider, payload.apiBase ?? null);
    const cloneUrl = token ? withForgeToken(url, token, provider) : url;
    const { path } = await this.container.git.clone({ owner, name }, cloneUrl, {
      depth: CLONE_DEPTH,
    });
    await this.repo.updateClonePath(repoId, path);

    // T2.2 — kick off the indexer in the background. ENQUEUE (not call) so the
    // clone job closes immediately and the (heavier) index runs as its own
    // job under JobRunner's timeout/retry. If the handler isn't registered
    // (e.g. repo-intel disabled at module wiring), enqueue() throws — log and
    // continue so the clone result is preserved either way.
    const workspaceId = await this.repo.workspaceIdFor(repoId);
    if (workspaceId) {
      try {
        await this.container.jobs.enqueue(workspaceId, INDEX_JOB_KIND, {
          repoId,
          owner,
          name,
        });
      } catch {
        // No handler registered or transient enqueue failure — clone has
        // already succeeded, so we don't fail the job for an index-followup
        // miss. The user can hit POST /repos/:id/reindex to retry.
      }
    }
  }

  /**
   * The first configured token for a forge instance: per-instance secret
   * (`GITLAB_TOKEN@git.acme.com`) before the canonical one, so a workspace can
   * point at two self-managed instances with two different PATs.
   */
  private async resolveForgeToken(
    provider: ForgeProvider,
    apiBase: string | null,
  ): Promise<string | undefined> {
    for (const key of forgeTokenKeys(provider, apiBase)) {
      const token = await this.container.secrets.get(key);
      if (token) return token;
    }
    return undefined;
  }

  /**
   * Add a repo: parse the URL, dedupe within the workspace, persist, and enqueue
   * the real clone (non-blocking). `created` is false when the repo already
   * existed (the caller returns 200 instead of 201).
   */
  async add(
    workspaceId: string,
    userId: string,
    url: string,
    provider?: ForgeProvider,
  ): Promise<{ repo: Repo; created: boolean }> {
    const parsed = parseRepoUrl(url, {
      provider,
      gitlabBases: this.container.config.gitlabBases,
    });

    const existing = await this.repo.findByFullName(
      workspaceId,
      parsed.provider,
      parsed.apiBase,
      parsed.fullName,
    );
    if (existing) return { repo: toRepoDto(existing), created: false };

    const row = await this.repo.insert({
      workspaceId,
      provider: parsed.provider,
      apiBase: parsed.apiBase,
      owner: parsed.owner,
      name: parsed.name,
      fullName: parsed.fullName,
      createdBy: userId,
    });
    await this.container.jobs.enqueue(workspaceId, CLONE_JOB_KIND, {
      repoId: row.id,
      owner: parsed.owner,
      name: parsed.name,
      url,
      provider: parsed.provider,
      apiBase: parsed.apiBase,
    } satisfies CloneJobPayload);

    return { repo: toRepoDto(row), created: true };
  }

  async list(workspaceId: string): Promise<Repo[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toRepoDto);
  }

  /** Re-fetch the clone for an existing repo (enqueues a fresh `clone` job). */
  async refresh(workspaceId: string, id: string): Promise<{ status: 'refreshing' }> {
    const repo = await this.repo.getById(workspaceId, id);
    if (!repo) throw new NotFoundError('Repo not found');
    await this.container.jobs.enqueue(workspaceId, CLONE_JOB_KIND, {
      repoId: repo.id,
      owner: repo.owner,
      name: repo.name,
      // Rebuilt from the repo's own forge + instance. Hardcoding github.com
      // here is how a GitLab repo would silently re-clone from the wrong host.
      url: cloneUrlFor(repo),
      provider: repo.provider as ForgeProvider,
      apiBase: repo.apiBase,
    } satisfies CloneJobPayload);
    // T2.2 — also enqueue an incremental refresh. The two queue positions are
    // independent (p-queue doesn't FIFO across kinds), but `runIncremental` is
    // a no-op when `currentHead === lastIndexedSha`, so ordering is safe: if
    // refresh fires before the new clone settles, it cheaply exits; if after,
    // it picks up the new HEAD.
    try {
      await this.container.jobs.enqueue(workspaceId, REFRESH_JOB_KIND, {
        repoId: repo.id,
        owner: repo.owner,
        name: repo.name,
      });
    } catch {
      // No handler / transient enqueue failure — refresh button is best-effort.
    }
    return { status: 'refreshing' };
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const ok = await this.repo.remove(workspaceId, id);
    if (!ok) throw new NotFoundError('Repo not found');
  }
}
