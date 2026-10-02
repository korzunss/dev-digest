import { z } from 'zod/v3';

/**
 * Runtime shape checks for the response bodies the core dereferences. Local on
 * purpose: shared contracts are `import type` only (a runtime import would load
 * the server's zod). Each schema covers just the fields `core/` reads; extra
 * fields pass through untouched because the original body is returned.
 */

const str = z.string();
const nullableStr = z.string().nullable();

export const BlastBody = z.object({
  changed_symbols: z.array(z.object({ name: str, file: str, kind: str, rank: z.number() })),
  downstream: z.array(
    z.object({
      symbol: str,
      callers: z.array(
        z.object({ name: str, file: str, line: z.number(), depth: z.number(), via: nullableStr }),
      ),
      endpoints_affected: z.array(str),
      crons_affected: z.array(str),
      rank: z.number(),
    }),
  ),
  summary: str,
  degraded: z.boolean(),
  reason: nullableStr,
  limits: z.object({ callers_per_symbol: z.number(), depth: z.number() }),
});

export const ConventionsBody = z.object({
  scan: z.unknown(),
  candidates: z.array(
    z.object({
      rule: str,
      category: str,
      evidence_path: str,
      evidence_line: z.number(),
      confidence: z.number(),
      status: str,
    }),
  ),
});

export const ReviewsBody = z.array(
  z.object({
    agent_id: nullableStr,
    run_id: nullableStr,
    agent_name: z.string().nullish(),
    kind: str,
    verdict: z.unknown(),
    score: z.number().nullable(),
    created_at: str,
    findings: z.array(
      z.object({
        severity: str,
        category: str,
        title: str,
        file: str,
        start_line: z.number(),
        rationale: str,
        dismissed_at: nullableStr,
      }),
    ),
  }),
);
