import { describe, expect, it } from 'vitest';
import type { BlastRadius, PrBriefModelOutput } from '@devdigest/shared';
import { classifyBriefError } from '../src/modules/brief/helpers.js';
import { BriefBudgetError } from '../src/modules/brief/budget.js';
import { groundBrief, groundingContext, normaliseRef } from '../src/modules/brief/grounding.js';
import { ConfigError } from '../src/platform/errors.js';

const files = [
  { path: 'src/a.ts', patch: '@@ -1,2 +10,3 @@\n+x' },
  { path: 'src/b.ts', patch: '@@ -1 +1 @@\n+y' },
];
const blast = {
  changed_symbols: [{ name: 'f', file: 'src/a.ts', kind: 'fn', rank: 1 }],
  downstream: [
    {
      symbol: 'f',
      callers: [{ name: 'g', file: 'src/c.ts', line: 40, depth: 1, via: null }],
      endpoints_affected: [],
      crons_affected: [],
      rank: 1,
    },
  ],
  summary: '',
  degraded: false,
  reason: null,
  limits: { callers_per_symbol: 5, depth: 2 },
} as BlastRadius;
const ctx = groundingContext(files, blast);

const risk = (file_refs: string[]) => ({
  kind: 'k',
  title: 't',
  explanation: 'e',
  severity: 'high' as const,
  file_refs,
});
const out = (over: Partial<PrBriefModelOutput>): PrBriefModelOutput => ({
  summary: 's',
  risks: [],
  review_focus: [],
  ...over,
});

describe('normaliseRef', () => {
  it('strips ./, leading / and :line', () => {
    expect(normaliseRef(' ./src/a.ts:12 ')).toBe('src/a.ts');
    expect(normaliseRef('/src/a.ts')).toBe('src/a.ts');
  });
});

describe('groundBrief', () => {
  it('keeps real refs, drops invented ones and risks left empty, caps at 5', () => {
    const r = groundBrief(
      out({
        risks: [
          risk(['./src/a.ts:3', 'src/a.ts', 'src/c.ts', 'nope.ts']),
          risk(['invented.ts', '../src/a.ts']),
        ],
      }),
      ctx,
    );
    expect(r.risks).toHaveLength(1);
    expect(r.risks[0]!.file_refs).toEqual(['src/a.ts', 'src/c.ts']);
    const many = groundingContext(
      Array.from({ length: 8 }, (_, i) => ({ path: `f${i}.ts`, patch: null })),
      null,
    );
    expect(groundBrief(out({ risks: [risk(Array.from({ length: 8 }, (_, i) => `f${i}.ts`))] }), many).risks[0]!.file_refs).toHaveLength(5);
  });

  it('keeps focus lines inside hunks or on caller lines; dedupes; drops the rest', () => {
    const r = groundBrief(
      out({
        review_focus: [
          { file: 'src/a.ts', line: 11, reason: 'in hunk' },
          { file: './src/a.ts:11', line: 11, reason: 'dup' },
          { file: 'src/a.ts', line: 99, reason: 'outside' },
          { file: 'src/c.ts', line: 40, reason: 'caller line' },
          { file: 'src/c.ts', line: 41, reason: 'not caller line' },
          { file: 'src/a.ts', line: 0, reason: 'zero' },
          { file: 'ghost.ts', line: 1, reason: 'ghost' },
        ],
      }),
      ctx,
    );
    expect(r.review_focus.map((f) => `${f.file}:${f.line}`)).toEqual(['src/a.ts:11', 'src/c.ts:40']);
  });

  it('caps focus at 6', () => {
    const wide = groundingContext([{ path: 'w.ts', patch: '@@ -1 +1,20 @@' }], null);
    const r = groundBrief(
      out({ review_focus: Array.from({ length: 10 }, (_, i) => ({ file: 'w.ts', line: i + 1, reason: 'r' })) }),
      wide,
    );
    expect(r.review_focus).toHaveLength(6);
  });
});

describe('groundBrief — hostile paths', () => {
  // absolute, traversing and encoded paths never resolve to an allowed file
  it('drops absolute, traversal and encoded refs for both risks and focus', () => {
    const bad = ['/etc/passwd', '../src/a.ts', 'src/../src/a.ts', '%2e%2e/src/a.ts', 'src%2Fa.ts', '.\\src\\a.ts'];
    const r = groundBrief(
      out({
        risks: [risk(bad)],
        review_focus: bad.map((file) => ({ file, line: 11, reason: 'x' })),
      }),
      ctx,
    );
    expect(r.risks).toEqual([]);
    expect(r.review_focus).toEqual([]);
  });

  // a blast-only file may be cited as a risk ref, but not as a focus line outside its caller lines
  it('does not widen focus to a blast-only file without a matching caller line', () => {
    const r = groundBrief(out({ review_focus: [{ file: 'src/c.ts', line: 1, reason: 'x' }] }), ctx);
    expect(r.review_focus).toEqual([]);
  });
});

describe('classifyBriefError', () => {
  it('maps config, budget and other errors', () => {
    expect(classifyBriefError(new ConfigError('no key'))).toBe('no_key');
    expect(classifyBriefError(new BriefBudgetError())).toBe('over_budget');
    expect(classifyBriefError(new Error('boom'))).toBe('failed');
  });
});
