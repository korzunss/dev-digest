import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { summarizeFindings, SUMMARY_TITLE_MAX } from '../src/review/summary.js';
import { verdictFromFindings } from '../src/review/reduce.js';

function f(severity: Finding['severity'], title = 't', file = 'a.ts', line = 1): Finding {
  return {
    id: `${severity}-${title}-${line}`,
    severity,
    category: 'bug',
    title,
    file,
    start_line: line,
    end_line: line,
    rationale: 'r',
    confidence: 0.9,
    kind: 'finding',
  } as Finding;
}

describe('verdictFromFindings', () => {
  it('CRITICAL ⇒ request_changes', () => {
    expect(verdictFromFindings([f('WARNING'), f('CRITICAL')])).toBe('request_changes');
  });
  it('WARNING only ⇒ comment', () => {
    expect(verdictFromFindings([f('WARNING')])).toBe('comment');
  });
  it('SUGGESTION only ⇒ comment', () => {
    expect(verdictFromFindings([f('SUGGESTION')])).toBe('comment');
  });
  it('no findings ⇒ approve', () => {
    expect(verdictFromFindings([])).toBe('approve');
  });
  it('no findings on a partial run ⇒ comment (D6)', () => {
    expect(verdictFromFindings([], { partial: true })).toBe('comment');
  });
});

describe('summarizeFindings', () => {
  it('0 findings', () => {
    expect(summarizeFindings([], { files: 4, chunks: 4 })).toBe('Reviewed 4 files in 4 chunks: no findings.');
  });

  it('mixed severities without a CRITICAL', () => {
    expect(summarizeFindings([f('WARNING'), f('SUGGESTION'), f('WARNING')], { files: 3, chunks: 3 })).toBe(
      'Reviewed 3 files in 3 chunks: 3 findings (0 critical · 2 warning · 1 suggestion).',
    );
  });

  it('5 CRITICALs list 3 then +2 more', () => {
    const crit = [1, 2, 3, 4, 5].map((n) => f('CRITICAL', `bug ${n}`, `f${n}.ts`, n * 10));
    expect(summarizeFindings(crit, { files: 5, chunks: 5 })).toBe(
      'Reviewed 5 files in 5 chunks: 5 findings (5 critical · 0 warning · 0 suggestion). ' +
        'Critical: bug 1 (f1.ts:10); bug 2 (f2.ts:20); bug 3 (f3.ts:30) +2 more.',
    );
  });

  it('a multi-line 200-char title is one line, capped at 80 + …', () => {
    const title = `first line\n${'x'.repeat(200)}`;
    const out = summarizeFindings([f('CRITICAL', title)], { files: 1, chunks: 1 });
    expect(out).not.toContain('\n');
    const shown = out.slice(out.indexOf('Critical: ') + 'Critical: '.length, out.indexOf(' (a.ts:1)'));
    expect(shown).toHaveLength(SUMMARY_TITLE_MAX + 1);
    expect(shown.endsWith('…')).toBe(true);
    expect(shown.startsWith('first line x')).toBe(true);
  });

  it('singular forms', () => {
    expect(summarizeFindings([f('SUGGESTION')], { files: 1, chunks: 1 })).toBe(
      'Reviewed 1 file in 1 chunk: 1 finding (0 critical · 0 warning · 1 suggestion).',
    );
  });
});
