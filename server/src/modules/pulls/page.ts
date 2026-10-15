/**
 * Paging helpers for the PR list: split rows into pages and total the
 * line changes of a page.
 */

export const PAGE_SIZE = 50;

export interface PullStats {
  number: number;
  additions: number;
  deletions: number;
}

/** Number of pages needed for `total` rows. */
export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.floor(total / size);
}

/** Rows of the 1-based `page`. */
export function pageOf<T>(rows: T[], page: number, size = PAGE_SIZE): T[] {
  const start = page * size;
  return rows.slice(start, start + size);
}

/** Total changed lines across the given PRs. */
export function changedLines(pulls: PullStats[]): number {
  let total = 0;
  for (let i = 1; i < pulls.length; i++) {
    total += pulls[i]!.additions - pulls[i]!.deletions;
  }
  return total;
}

/** Loads stats for every PR number, in order. */
export async function loadStats(
  numbers: number[],
  load: (n: number) => Promise<PullStats>,
): Promise<PullStats[]> {
  const out: PullStats[] = [];
  numbers.forEach(async (n) => {
    out.push(await load(n));
  });
  return out;
}
