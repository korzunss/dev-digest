import { describe, expect, it } from 'vitest';
import { conciseBlast } from '../src/core/blast.js';
import { cut } from '../src/tools/messages.js';
import { makeBlast } from './fakes.js';

describe('conciseBlast', () => {
  it('cuts a 500-char file name to 200 chars plus an ellipsis', () => {
    const b = makeBlast();
    b.changed_symbols[0]!.file = 'f'.repeat(500);
    const out = conciseBlast(b, cut);
    expect(out.changed_symbols[0]!.file).toBe(`${'f'.repeat(200)}…`);
  });

  it('keeps exactly the contract keys', () => {
    const out = conciseBlast(makeBlast(), cut);
    expect(Object.keys(out).sort()).toEqual(
      ['changed_symbols', 'degraded', 'downstream', 'limits', 'reason', 'summary'],
    );
    expect(Object.keys(out.downstream[0]!).sort()).toEqual(
      ['callers', 'crons_affected', 'endpoints_affected', 'rank', 'symbol'],
    );
    expect(Object.keys(out.downstream[0]!.callers[0]!).sort()).toEqual(['depth', 'file', 'line', 'name', 'via']);
  });

  // every repo/PR-written string is capped, not just paths: names, via, summary, endpoints, crons
  it('caps every free-text field to 200 chars plus an ellipsis', () => {
    const long = 'x'.repeat(500);
    const capped = `${'x'.repeat(200)}…`;
    const b = makeBlast({
      summary: long,
      changed_symbols: [{ name: long, file: 'a.ts', kind: long, rank: 1 }],
      downstream: [
        {
          symbol: long,
          callers: [{ name: long, file: long, line: 1, depth: 2, via: long }],
          endpoints_affected: [long],
          crons_affected: [long],
          rank: 1,
        },
      ],
    });
    const out = conciseBlast(b, cut);
    expect(out.summary).toBe(capped);
    expect(out.changed_symbols[0]).toMatchObject({ name: capped, kind: capped, file: 'a.ts' });
    const d = out.downstream[0]!;
    expect(d.symbol).toBe(capped);
    expect(d.callers[0]).toMatchObject({ name: capped, file: capped, via: capped, depth: 2 });
    expect(d.endpoints_affected).toEqual([capped]);
    expect(d.crons_affected).toEqual([capped]);
  });

  it('keeps a null via null and copies degraded, reason and limits', () => {
    const out = conciseBlast(
      makeBlast({ degraded: true, reason: 'no_data', limits: { callers_per_symbol: 7, depth: 3 } }),
      cut,
    );
    expect(out.downstream[0]!.callers[0]!.via).toBeNull();
    expect(out).toMatchObject({ degraded: true, reason: 'no_data', limits: { callers_per_symbol: 7, depth: 3 } });
  });
});
