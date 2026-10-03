import { describe, it, expect } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import { toBlastRadius } from '../src/modules/blast/helpers.js';
import { BFS_DEPTH, MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

function result(over: Partial<BlastResult> = {}): BlastResult {
  return {
    changedSymbols: [
      { file: 'src/a.ts', name: 'alpha', kind: 'function', rank: 0.2 },
      { file: 'src/b.ts', name: 'beta', kind: 'function', rank: 0.9 },
    ],
    callers: [
      { file: 'src/r1.ts', symbol: 'h1', viaSymbol: 'alpha', line: 3, rank: 0, depth: 1, via: null },
      { file: 'src/r2.ts', symbol: 'h2', viaSymbol: 'beta', line: 7, rank: 0, depth: 1, via: null },
      { file: 'src/r3.ts', symbol: 'h3', viaSymbol: 'beta', line: 9, rank: 0, depth: 2, via: 'h2' },
    ],
    impactedEndpoints: [],
    factsByFile: {
      'src/r1.ts': { endpoints: ['GET /x'], crons: [] },
      'src/r3.ts': { endpoints: [], crons: ['0 * * * *'] },
    },
    source: 'index',
    limits: { callersPerSymbol: MAX_CALLERS_PER_SYMBOL, depth: BFS_DEPTH },
    ...over,
  };
}

describe('toBlastRadius', () => {
  it('groups flat callers per changed symbol, sorted by rank desc', () => {
    const out = toBlastRadius(result());
    expect(out.downstream.map((d) => d.symbol)).toEqual(['beta', 'alpha']);
    expect(out.downstream[0]!.rank).toBe(0.9);
  });

  it('attributes endpoints and crons only to the group whose callers carry them', () => {
    const out = toBlastRadius(result());
    const alpha = out.downstream.find((d) => d.symbol === 'alpha')!;
    const beta = out.downstream.find((d) => d.symbol === 'beta')!;
    expect(alpha.endpoints_affected).toEqual(['GET /x']);
    expect(alpha.crons_affected).toEqual([]);
    expect(beta.endpoints_affected).toEqual([]);
    expect(beta.crons_affected).toEqual(['0 * * * *']);
  });

  it('keeps every caller it is given', () => {
    const out = toBlastRadius(
      result({
        callers: [
          ...result().callers,
          { file: 'src/a.ts', symbol: 'self', viaSymbol: 'alpha', line: 1, rank: 0, depth: 1, via: null },
        ],
      }),
    );
    const alpha = out.downstream.find((d) => d.symbol === 'alpha')!;
    expect(alpha.callers.map((c) => c.file)).toEqual(['src/r1.ts', 'src/a.ts']);
    // alpha's 2 rows + beta's 2 → nothing dropped from the call-site count either.
    expect(out.summary).toContain('4 callers');
  });

  it('carries depth and via, and omits symbols without callers', () => {
    const out = toBlastRadius(
      result({
        changedSymbols: [
          ...result().changedSymbols,
          { file: 'src/c.ts', name: 'gamma', kind: 'function', rank: 1 },
        ],
      }),
    );
    expect(out.downstream.map((d) => d.symbol)).not.toContain('gamma');
    const beta = out.downstream.find((d) => d.symbol === 'beta')!;
    expect(beta.callers[1]).toMatchObject({ depth: 2, via: 'h2', name: 'h3' });
  });

  it('reports limits from the constants and a digit summary', () => {
    const out = toBlastRadius(result());
    expect(out.limits).toEqual({ callers_per_symbol: MAX_CALLERS_PER_SYMBOL, depth: BFS_DEPTH });
    expect(out.summary).toBe('2 changed symbols · 3 callers · 1 endpoints · 1 crons');
    expect(BlastRadius.parse(out)).toEqual(out);
  });

  it('counts call sites, so two calls in one file count twice', () => {
    const out = toBlastRadius(
      result({
        callers: [
          { file: 'src/r1.ts', symbol: 'h1', viaSymbol: 'alpha', line: 3, rank: 0, depth: 1, via: null },
          { file: 'src/r1.ts', symbol: 'h1', viaSymbol: 'alpha', line: 30, rank: 0, depth: 1, via: null },
        ],
      }),
    );
    expect(out.summary).toContain('2 callers');
  });

  it('passes degraded and reason through', () => {
    const out = toBlastRadius(
      result({ degraded: true, reason: 'no_data', callers: [], source: 'fallback' }),
    );
    expect(out.degraded).toBe(true);
    expect(out.reason).toBe('no_data');
    expect(out.summary).toContain('degraded: no_data');
    expect(toBlastRadius(result()).degraded).toBe(false);
  });
});
