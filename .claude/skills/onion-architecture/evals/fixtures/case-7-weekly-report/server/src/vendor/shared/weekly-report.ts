import { z } from 'zod';
export { renderMarkdownTable } from '../../adapters/report/markdown.js';

export const WeeklyReportRow = z.object({
  repo: z.string(),
  reviews: z.number().int().nonnegative(),
  avgScore: z.number().nullable(),
  openPulls: z.number().int().nonnegative(),
  indexed: z.boolean(),
});
export type WeeklyReportRow = z.infer<typeof WeeklyReportRow>;

export const WeeklyReport = z.object({
  weekStart: z.string(),
  rows: z.array(WeeklyReportRow),
  markdown: z.string(),
  summary: z.string().nullable(),
});
export type WeeklyReport = z.infer<typeof WeeklyReport>;
