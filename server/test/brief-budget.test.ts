import { describe, expect, it } from 'vitest';
import { BriefBudgetError, capBlast, fitToBudget } from '../src/modules/brief/budget.js';
import {
  BLAST_CRONS_MAX,
  BLAST_ENDPOINTS_MAX,
  BLAST_SYMBOLS_MAX,
} from '../src/modules/brief/constants.js';
import { BRIEF_INPUT_TOKEN_BUDGET, SCHEMA_TOKEN_RESERVE } from '../src/modules/brief/constants.js';
import { buildBriefMessages } from '../src/modules/brief/prompt.js';
import type { BriefBlastFacts, BriefFacts, TokenCounter } from '../src/modules/brief/types.js';

const counter: TokenCounter = { count: (s) => Math.ceil(s.length / 4) };
const total = (f: BriefFacts) => buildBriefMessages(f).reduce((n, m) => n + counter.count(m.content), 0);

function base(over: Partial<BriefFacts> = {}): BriefFacts {
  return {
    pr: { title: 't', author: 'a', branch: 'b', base: 'main', head_sha: 'h' },
    files: [
      { path: 'a.ts', additions: 1, deletions: 0, role: null, ranges: [{ start: 1, end: 2 }] },
      { path: 'b.ts', additions: 1, deletions: 0, role: null, ranges: [{ start: 1, end: 2 }] },
    ],
    intent: null,
    blast: null,
    findings: [{ file: 'a.ts', line: 1, severity: 'low', title: 'f1' }],
    description: 'd',
    issues: [],
    docs: [],
    ...over,
  };
}

const blast = (n: number): BriefBlastFacts => ({
  changed_symbols: Array.from({ length: n }, (_, i) => ({ name: `s${i}`, file: 'a.ts', kind: 'fn' })),
  callers: Array.from({ length: n }, (_, i) => ({ symbol: 's0', name: `c${i}`, file: 'a.ts', line: i + 1 })),
  endpoints: [],
  crons: [],
  degraded: false,
  reason: null,
});

describe('fitToBudget', () => {
  it('returns the facts untouched when they fit', () => {
    const f = base();
    const r = fitToBudget(f, counter, 100_000);
    expect(r.facts).toBe(f);
    expect(r.truncated).toEqual([]);
  });

  it('cuts specs first, from the end, and records each input once', () => {
    const docs = Array.from({ length: 5 }, (_, i) => ({ path: `d${i}.md`, body: 'x'.repeat(400) }));
    const f = base({ docs });
    const budget = total({ ...f, docs: docs.slice(0, 3) });
    const r = fitToBudget(f, counter, budget);
    expect(r.facts.docs.map((d) => d.path)).toEqual(['d0.md', 'd1.md', 'd2.md']);
    expect(r.truncated).toEqual([{ input: 'attached_specs', status: 'truncated', ref: null, reason: null }]);
    expect(total(r.facts)).toBeLessThanOrEqual(budget);
  });

  it('cuts symbols only after callers and records blast_radius once', () => {
    const f = base({ blast: blast(10), description: '' });
    const budget = total({ ...f, blast: { ...blast(10), callers: [] } }) - 1;
    const r = fitToBudget(f, counter, budget);
    expect(r.facts.blast!.callers).toHaveLength(0);
    expect(r.facts.blast!.changed_symbols.length).toBeLessThan(10);
    expect(r.truncated.filter((t) => t.input === 'blast_radius')).toHaveLength(1);
    expect(total(r.facts)).toBeLessThanOrEqual(budget);
  });

  it('cuts an issue body before dropping the issue', () => {
    const f = base({ issues: [{ ref: '#1', title: 'T', body: 'y'.repeat(800) }] });
    const noBody = total({ ...f, issues: [{ ref: '#1', title: 'T', body: '' }] });
    const r = fitToBudget(f, counter, noBody + 5);
    expect(r.facts.issues).toEqual([{ ref: '#1', title: 'T', body: '' }]);
    expect(r.truncated.map((t) => t.input)).toEqual(['linked_issue']);
    const dropped = fitToBudget(f, counter, noBody - 5);
    expect(dropped.facts.issues).toEqual([]);
  });

  it('cuts the description to the longest prefix that fits', () => {
    const f = base({ description: 'z'.repeat(800) });
    const budget = total(f) - 100;
    const r = fitToBudget(f, counter, budget);
    expect(r.facts.description.length).toBeGreaterThan(0);
    expect(r.facts.description.length).toBeLessThan(800);
    expect(total(r.facts)).toBeLessThanOrEqual(budget);
    expect(total({ ...r.facts, description: f.description.slice(0, r.facts.description.length + 1) })).toBeGreaterThan(budget);
    expect(r.truncated.map((t) => t.input)).toEqual(['pr_description']);
  });

  it('uses the default budget minus the schema reserve', () => {
    const docs = Array.from({ length: 40 }, (_, i) => ({ path: `d${i}.md`, body: 'x'.repeat(2000) }));
    const f = base({ docs });
    expect(total(f)).toBeGreaterThan(BRIEF_INPUT_TOKEN_BUDGET);
    const r = fitToBudget(f, counter);
    expect(total(r.facts)).toBeLessThanOrEqual(BRIEF_INPUT_TOKEN_BUDGET - SCHEMA_TOKEN_RESERVE);
    expect(r.truncated.map((t) => t.input)).toContain('attached_specs');
  });

  it('trims a ~2,000-file PR with a bounded number of token counts', () => {
    const files = Array.from({ length: 2000 }, (_, i) => ({
      path: `src/dir${i}/file${i}.ts`,
      additions: 1,
      deletions: 0,
      role: null,
      ranges: [{ start: 1, end: 2 }],
    }));
    const f = base({ files, blast: blast(50) });
    const budget = Math.floor(total(f) / 2);
    let calls = 0;
    const counting: TokenCounter = { count: (s) => (calls++, counter.count(s)) };
    const r = fitToBudget(f, counting, budget);
    expect(total(r.facts)).toBeLessThanOrEqual(budget);
    expect(r.facts.files.length).toBeLessThan(2000);
    expect(r.truncated.map((t) => t.input)).toContain('changed_files');
    // ~ (log2(n) + 2) fits() calls, each tokenizing a handful of messages.
    expect(calls).toBeLessThanOrEqual(Math.ceil(Math.log2(2000) + 3) * 8 * 7);
  });

  it('throws BriefBudgetError when nothing is left to trim', () => {
    expect(() => fitToBudget(base(), counter, 1)).toThrow(BriefBudgetError);
  });
});

describe('capBlast', () => {
  it('slices to the caps and flags the cut', () => {
    const big: BriefBlastFacts = {
      ...blast(BLAST_SYMBOLS_MAX + 5),
      endpoints: Array.from({ length: BLAST_ENDPOINTS_MAX + 1 }, (_, i) => `e${i}`),
      crons: Array.from({ length: BLAST_CRONS_MAX + 1 }, (_, i) => `c${i}`),
    };
    const r = capBlast(big);
    expect(r.truncated).toBe(true);
    expect(r.blast.changed_symbols).toHaveLength(BLAST_SYMBOLS_MAX);
    expect(r.blast.endpoints).toHaveLength(BLAST_ENDPOINTS_MAX);
    expect(r.blast.crons).toHaveLength(BLAST_CRONS_MAX);
  });
  it('does not flag when under the caps', () => {
    const small = blast(2);
    const r = capBlast(small);
    expect(r.truncated).toBe(false);
    expect(r.blast).toBe(small);
  });
});
