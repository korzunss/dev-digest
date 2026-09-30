/**
 * Demo convention candidates for the seeded `acme/payments-api` repo.
 *
 * They exist so the Conventions screen (and e2e flow 10) has pending, grounded
 * rules straight after `pnpm db:seed`. The evidence paths are files of the
 * seeded PR. Confidences are distinct so the card order is fixed.
 */

import { createHash } from 'node:crypto';
import type { ConventionCategory } from '@devdigest/shared';

export interface SeedConvention {
  rule: string;
  category: ConventionCategory;
  evidencePath: string;
  evidenceLine: number;
  evidenceEndLine: number;
  evidenceSnippet: string;
  confidence: number;
}

export const SEED_CONVENTIONS: SeedConvention[] = [
  {
    rule: 'Read every tunable from process.env in src/config.ts instead of hard-coding it at the call site.',
    category: 'structure',
    evidencePath: 'src/config.ts',
    evidenceLine: 3,
    evidenceEndLine: 3,
    evidenceSnippet: 'export const RATE_LIMIT_RPM = Number(process.env.RATE_LIMIT_RPM ?? 60);',
    confidence: 0.92,
  },
  {
    rule: 'Answer a throttled request with 429 and a Retry-After header.',
    category: 'api',
    evidencePath: 'src/middleware/ratelimit.ts',
    evidenceLine: 41,
    evidenceEndLine: 42,
    evidenceSnippet:
      "reply.header('Retry-After', String(retryAfterSec));\nreturn reply.code(429).send({ error: 'rate_limited' });",
    confidence: 0.85,
  },
  {
    rule: 'Load related rows for a list with one IN query, never one query per item.',
    category: 'data-access',
    evidencePath: 'src/api/users.ts',
    evidenceLine: 47,
    evidenceEndLine: 47,
    evidenceSnippet: 'const posts = await db.posts.findMany({ where: { userId: { in: ids } } });',
    confidence: 0.74,
  },
];

/**
 * Copy of `fingerprintFor` in `modules/conventions/helpers.ts` (db/ must not
 * import modules/). A unit test pins the two together.
 */
export function seedConventionFingerprint(rule: string, evidencePath: string): string {
  const key = `${rule.replace(/\s+/g, ' ').trim().toLowerCase()}\u0000${evidencePath}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}
