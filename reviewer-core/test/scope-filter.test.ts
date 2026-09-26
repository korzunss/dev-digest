import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { applyScopeFilter, type ScopedFinding } from '../src/index.js';

/**
 * Out-of-scope filter (spec 006 D6) — runs only on grounding survivors. It can
 * only REMOVE a finding, never add or resurrect one; a "serious" (CRITICAL or
 * security) out-of-scope finding is never fully silenced.
 */

function finding(overrides: Partial<ScopedFinding> = {}): ScopedFinding {
  return {
    id: overrides.id ?? 'f1',
    severity: 'WARNING',
    category: 'bug',
    title: 'A finding',
    file: 'src/a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'because',
    confidence: 0.9,
    kind: 'finding',
    ...overrides,
  } as ScopedFinding;
}

describe('applyScopeFilter', () => {
  it('keeps every in-scope finding untouched and strips out_of_scope from the output', () => {
    const f = finding({ id: 'in-scope-1' });
    const { kept, dropped } = applyScopeFilter([f]);
    expect(kept).toHaveLength(1);
    expect(kept[0]).not.toHaveProperty('out_of_scope');
    expect(dropped).toHaveLength(0);
  });

  it('drops a non-serious out-of-scope finding', () => {
    const f = finding({ id: 'oos-suggestion', severity: 'SUGGESTION', out_of_scope: true });
    const { kept, dropped } = applyScopeFilter([f]);
    expect(kept).toHaveLength(0);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.reason).toBe('out of scope');
    expect(dropped[0]!.finding.id).toBe('oos-suggestion');
  });

  it('collapses two serious out-of-scope findings into exactly one kept finding', () => {
    const critical = finding({
      id: 'oos-critical',
      severity: 'CRITICAL',
      category: 'security',
      out_of_scope: true,
    });
    const warningSecurity = finding({
      id: 'oos-warning-security',
      severity: 'WARNING',
      category: 'security',
      out_of_scope: true,
    });
    const { kept, dropped } = applyScopeFilter([critical, warningSecurity]);

    expect(kept).toHaveLength(1);
    expect(kept[0]!.id).toBe('oos-critical'); // the most severe survives
    expect(kept[0]!.title).toMatch(/^Out of scope: /);
    expect(kept[0]!.rationale).toContain('+1 more out-of-scope serious findings suppressed');
    // The suppressed one is reported as dropped, distinguishable from a plain drop.
    expect(dropped).toHaveLength(1);
    expect(dropped[0]!.finding.id).toBe('oos-warning-security');
    expect(dropped[0]!.reason).toContain('collapsed');
  });

  it('a lone serious out-of-scope finding is kept, retitled, with no "+N more" suffix', () => {
    const f = finding({ id: 'oos-solo', severity: 'CRITICAL', out_of_scope: true });
    const { kept, dropped } = applyScopeFilter([f]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.title).toBe('Out of scope: A finding');
    expect(kept[0]!.rationale).toBe('because');
    expect(dropped).toHaveLength(0);
  });

  it('a mix of in-scope, dropped, and collapsed-serious findings all resolve independently', () => {
    const inScope = finding({ id: 'kept-in-scope' });
    const nonSeriousOos = finding({ id: 'dropped-oos', severity: 'SUGGESTION', out_of_scope: true });
    const seriousOos = finding({ id: 'collapsed-oos', severity: 'CRITICAL', out_of_scope: true });
    const { kept, dropped } = applyScopeFilter([inScope, nonSeriousOos, seriousOos]);

    const keptIds = kept.map((f) => f.id).sort();
    expect(keptIds).toEqual(['collapsed-oos', 'kept-in-scope']);
    expect(dropped.map((d) => d.finding.id)).toEqual(['dropped-oos']);
  });

  it('never adds a finding — an empty input produces an empty result', () => {
    const { kept, dropped } = applyScopeFilter([]);
    expect(kept).toEqual([]);
    expect(dropped).toEqual([]);
  });
});
