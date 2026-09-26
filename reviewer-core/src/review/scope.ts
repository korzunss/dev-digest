import { z } from 'zod';
import type { Finding } from '@devdigest/shared';
import { Finding as FindingSchema, Review as ReviewSchema } from '@devdigest/shared';

/**
 * Out-of-scope filter (spec 006 D6) — runs AFTER citation grounding, never
 * before it and never in place of it. Grounding is unchanged; this can only
 * REMOVE a grounded finding, never add or resurrect one.
 *
 * `out_of_scope` is a model-facing flag only: it exists so the reviewer model
 * can mark a finding against the injected PR intent, and is stripped from the
 * findings this module returns. Extending `Finding` here (rather than in
 * `@devdigest/shared`) keeps the CI runner and persisted findings unaffected
 * when no intent is passed.
 */

export const ScopedFinding = FindingSchema.extend({
  /** Set by the reviewer model when a finding concerns out-of-scope work. */
  out_of_scope: z.boolean().nullish(),
});
export type ScopedFinding = z.infer<typeof ScopedFinding>;

export const ScopedReview = ReviewSchema.extend({
  findings: z.array(ScopedFinding),
});
export type ScopedReview = z.infer<typeof ScopedReview>;

const SEVERITY_RANK: Record<Finding['severity'], number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};

/** "Serious" (spec 006 D6): a CRITICAL finding, or any security-category finding. */
function isSerious(f: ScopedFinding): boolean {
  return f.severity === 'CRITICAL' || f.category === 'security';
}

function strip(f: ScopedFinding): Finding {
  const { out_of_scope: _outOfScope, ...rest } = f;
  return rest;
}

export interface ScopeFilterResult {
  kept: Finding[];
  dropped: { finding: Finding; reason: string }[];
}

/**
 * Drop non-serious out-of-scope findings; collapse serious out-of-scope
 * findings (CRITICAL or security) into exactly ONE kept finding (the most
 * severe), so a blocker is never fully silenced by scope alone.
 */
export function applyScopeFilter(findings: ScopedFinding[]): ScopeFilterResult {
  const inScope = findings.filter((f) => f.out_of_scope !== true);
  const outOfScope = findings.filter((f) => f.out_of_scope === true);
  const seriousOos = outOfScope.filter(isSerious);
  const nonSeriousOos = outOfScope.filter((f) => !isSerious(f));

  const dropped: { finding: Finding; reason: string }[] = nonSeriousOos.map((f) => ({
    finding: strip(f),
    reason: 'out of scope',
  }));

  const kept: Finding[] = inScope.map(strip);

  if (seriousOos.length > 0) {
    const [most, ...rest] = [...seriousOos].sort(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
    );
    const keptSerious = strip(most!);
    keptSerious.title = `Out of scope: ${keptSerious.title}`;
    if (rest.length > 0) {
      keptSerious.rationale = `${keptSerious.rationale}\n\n+${rest.length} more out-of-scope serious findings suppressed.`;
      for (const f of rest) {
        dropped.push({ finding: strip(f), reason: 'out of scope (collapsed into kept finding)' });
      }
    }
    kept.push(keptSerious);
  }

  return { kept, dropped };
}
