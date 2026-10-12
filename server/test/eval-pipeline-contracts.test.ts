import { describe, it, expect } from 'vitest';
import {
  EvalExpectation,
  EvalCaseSaveBody,
  EvalMetrics,
  EvalPeriod,
  EvalDraftSeed,
  EvalSuiteRunStatus,
} from '@devdigest/shared';

describe('EvalExpectation', () => {
  it('accepts a minimal must_find and display-only fields', () => {
    expect(EvalExpectation.safeParse({ expect: 'must_find', file: 'a.ts', start_line: 3 }).success).toBe(true);
    const full = {
      expect: 'must_not_flag',
      file: 'a.ts',
      start_line: 3,
      end_line: 5,
      title: 't',
      severity: 'high',
      category: 'security',
    };
    expect(EvalExpectation.parse(full)).toEqual(full);
  });

  it('rejects start_line > end_line with a path on start_line', () => {
    const r = EvalExpectation.safeParse({ expect: 'must_find', file: 'a.ts', start_line: 9, end_line: 2 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.path).toEqual(['start_line']);
  });

  it('rejects unknown keys, empty file, line < 1 and an unknown kind', () => {
    expect(EvalExpectation.safeParse({ expect: 'must_find', file: 'a.ts', start_line: 1, extra: 1 }).success).toBe(false);
    expect(EvalExpectation.safeParse({ expect: 'must_find', file: '', start_line: 1 }).success).toBe(false);
    expect(EvalExpectation.safeParse({ expect: 'must_find', file: 'a.ts', start_line: 0 }).success).toBe(false);
    expect(EvalExpectation.safeParse({ expect: 'maybe', file: 'a.ts', start_line: 1 }).success).toBe(false);
  });
});

describe('EvalMetrics', () => {
  it('allows null and 0..1, rejects out of range and a missing key', () => {
    expect(EvalMetrics.safeParse({ recall: null, precision: 0, citation_accuracy: 1 }).success).toBe(true);
    expect(EvalMetrics.safeParse({ recall: 1.1, precision: 0, citation_accuracy: 1 }).success).toBe(false);
    expect(EvalMetrics.safeParse({ recall: null, precision: 0 }).success).toBe(false);
  });
});

describe('request bodies and enums', () => {
  it('EvalCaseSaveBody requires a name and a uuid source_finding_id', () => {
    const base = { name: 'n', input: { diff: 'd' }, expected_output: [] };
    expect(EvalCaseSaveBody.safeParse(base).success).toBe(true);
    expect(EvalCaseSaveBody.safeParse({ ...base, name: '' }).success).toBe(false);
    expect(EvalCaseSaveBody.safeParse({ ...base, source_finding_id: 'nope' }).success).toBe(false);
  });

  it('EvalDraftSeed is discriminated on kind', () => {
    expect(EvalDraftSeed.safeParse({ kind: 'other' }).success).toBe(false);
  });

  it('EvalPeriod and EvalSuiteRunStatus list exactly the planned values', () => {
    expect(EvalPeriod.options).toEqual(['30d', 'all']);
    expect(EvalSuiteRunStatus.options).toEqual(['running', 'completed', 'failed']);
  });
});
