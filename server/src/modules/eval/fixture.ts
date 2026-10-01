import { z } from 'zod';
import { FindingCategory } from '@devdigest/shared';

export const Lane = z.enum(['general', 'security', 'performance', 'test_quality', 'api_contract']);
export type Lane = z.infer<typeof Lane>;

export const EvalLocation = z
  .object({
    file: z.string().min(1),
    start_line: z.number().int().min(1),
    end_line: z.number().int().min(1),
  })
  .strict()
  .refine((l) => l.end_line >= l.start_line, {
    message: 'end_line must be >= start_line',
    path: ['end_line'],
  });
export type EvalLocation = z.infer<typeof EvalLocation>;

export const EvalIssue = z
  .object({
    id: z.string().min(1),
    lane: Lane,
    title: z.string().min(1),
    locations: z.array(EvalLocation).min(1),
    categories: z.array(FindingCategory).min(1),
    keywords: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type EvalIssue = z.infer<typeof EvalIssue>;

export const ReviewEvalFixture = z
  .object({
    id: z.string().min(1),
    repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'expected owner/name'),
    pr: z.number().int().min(1),
    head_sha: z.string().regex(/^[0-9a-f]{40}$/, 'expected 40-hex sha'),
    base_sha: z.string().regex(/^[0-9a-f]{40}$/, 'expected 40-hex sha').optional(),
    line_tolerance: z.number().int().min(0),
    lanes: z.record(Lane, z.string().min(1)),
    issues: z.array(EvalIssue),
    acceptable_extras: z.array(EvalIssue),
    /** Known-wrong findings (human-triaged); reported separately, never scored as hits. */
    false_positives: z.array(EvalIssue).default([]),
  })
  .strict()
  .superRefine((f, ctx) => {
    const seen = new Set<string>();
    for (const [key, list] of [
      ['issues', f.issues],
      ['acceptable_extras', f.acceptable_extras],
      ['false_positives', f.false_positives],
    ] as const) {
      list.forEach((it, i) => {
        if (seen.has(it.id)) {
          ctx.addIssue({
            code: 'custom',
            message: `duplicate id "${it.id}"`,
            path: [key, i, 'id'],
          });
        }
        seen.add(it.id);
      });
    }
  });
export type ReviewEvalFixture = z.infer<typeof ReviewEvalFixture>;

export function parseFixture(raw: unknown): ReviewEvalFixture {
  const r = ReviewEvalFixture.safeParse(raw);
  if (r.success) return r.data;
  const lines = r.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
  throw new Error(`invalid eval fixture: ${lines.join('; ')}`);
}
