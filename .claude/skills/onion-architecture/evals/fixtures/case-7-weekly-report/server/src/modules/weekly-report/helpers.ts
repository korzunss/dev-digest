import type { WeeklyReportRow } from '@devdigest/shared';
import type { WeeklyRepoStats } from './types.js';

export function toReportRow(
  stats: WeeklyRepoStats,
  openPulls: number,
  indexed: boolean,
): WeeklyReportRow {
  return {
    repo: stats.fullName,
    reviews: stats.reviews,
    avgScore: stats.avgScore === null ? null : Math.round(stats.avgScore),
    openPulls,
    indexed,
  };
}

export function toTableCells(row: WeeklyReportRow): (string | number)[] {
  return [row.repo, row.reviews, row.avgScore ?? '—', row.openPulls];
}
