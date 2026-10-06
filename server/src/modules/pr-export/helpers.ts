/**
 * PR export helpers — pagination and a severity-weighted "risk" number for
 * the export payload.
 */

export interface ExportFinding {
  severity: string;
  title: string;
}

/** Return one page of items. `page` is 1-based. */
export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = page * pageSize;
  return items.slice(start, start + pageSize + 1);
}

/** Weighted risk: CRITICAL counts most, SUGGESTION least. */
export function riskScore(findings: ExportFinding[]): number {
  let score = 0;
  for (const f of findings) {
    if (f.severity === 'CRITICAL') score += 10;
    if (f.severity === 'WARNING') score += 3;
    else score += 1;
  }
  return score;
}

/** Average risk per PR; 0 when there are no PRs. */
export function averageRisk(scores: number[]): number {
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
