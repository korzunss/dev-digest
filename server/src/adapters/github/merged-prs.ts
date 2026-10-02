import type { MergedPrTouching } from '@devdigest/shared';

/** Per-path / per-commit HTTP calls in flight at once (GitHub secondary rate limit). */
const CONCURRENCY = 4;

export interface MergedPrIo {
  /** Commit SHAs (newest first) that touched `path`. */
  listCommits(path: string): Promise<string[]>;
  /** PRs associated with a commit; `merged_at` is null while unmerged. */
  prsForCommit(
    sha: string,
  ): Promise<{ number: number; title: string; author?: string | null; merged_at: string | null }[]>;
}

export interface CollectOpts {
  excludeNumber: number;
  limit: number;
}

function statusOf(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : undefined;
}

/** Run `fn` over `items`, at most CONCURRENCY at a time; never rejects. */
async function settleChunked<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    out.push(...(await Promise.allSettled(items.slice(i, i + CONCURRENCY).map(fn))));
  }
  return out;
}

/**
 * Merged PRs that touched any of `paths`: path → commits → associated PRs.
 * A 404/409 on a call counts as empty; other per-call failures are skipped;
 * if every commit listing failed, the first error is rethrown.
 */
export async function collectMergedPrs(
  paths: string[],
  io: MergedPrIo,
  opts: CollectOpts,
): Promise<MergedPrTouching[]> {
  const commitResults = await settleChunked(paths, (p) => io.listCommits(p));

  const shaPaths = new Map<string, Set<string>>();
  let firstError: unknown;
  let failed = 0;
  commitResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      for (const sha of r.value) {
        const set = shaPaths.get(sha) ?? new Set<string>();
        set.add(paths[i]!);
        shaPaths.set(sha, set);
      }
    } else if (statusOf(r.reason) !== 404 && statusOf(r.reason) !== 409) {
      failed += 1;
      firstError ??= r.reason;
    }
  });
  if (paths.length > 0 && failed === paths.length) throw firstError;

  const shas = [...shaPaths.keys()];
  const prResults = await settleChunked(shas, (sha) => io.prsForCommit(sha));

  const byNumber = new Map<number, MergedPrTouching & { set: Set<string> }>();
  prResults.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const touched = shaPaths.get(shas[i]!)!;
    for (const pr of r.value) {
      if (pr.merged_at == null || pr.number === opts.excludeNumber) continue;
      const entry = byNumber.get(pr.number) ?? {
        number: pr.number,
        title: pr.title,
        author: pr.author || 'unknown',
        merged_at: pr.merged_at,
        paths: [],
        set: new Set<string>(),
      };
      for (const p of touched) entry.set.add(p);
      byNumber.set(pr.number, entry);
    }
  });

  return [...byNumber.values()]
    .map(({ set, ...pr }) => ({ ...pr, paths: [...set].sort() }))
    .sort((a, b) => (a.merged_at < b.merged_at ? 1 : a.merged_at > b.merged_at ? -1 : 0))
    .slice(0, opts.limit);
}
