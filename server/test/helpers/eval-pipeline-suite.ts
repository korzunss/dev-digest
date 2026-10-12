import type { EvalExpectation, Review } from '@devdigest/shared';
import type { LlmScript } from './llm-stubs.js';

/**
 * A fixture suite for the eval pipeline (spec 011, AC-62 #4): eight cases that
 * mix `must_find`, `must_not_flag` and the empty expectation, and two scripted
 * "prompts" — OLD misses one issue and raises two false alarms, NEW is clean.
 * Tests and `verify:l06` use it; the user builds the real suite from real
 * findings (GAP2), so nothing here is seeded into the database.
 */

export const OLD_PROMPT = 'OLD-PROMPT: review the diff.';
export const NEW_PROMPT = 'NEW-PROMPT: review the diff and be precise.';

export interface FixtureCase {
  name: string;
  file: string;
  diff: string;
  expected: EvalExpectation[];
}

/** A diff that adds `added` lines after line 1 of `file` (new lines 2..1+added). */
export function diffAdding(file: string, added: string[]): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -1,2 +1,${2 + added.length} @@`,
    ' const a = 1;',
    ...added.map((l) => `+${l}`),
    ' export {};',
    '',
  ].join('\n');
}

const must = (file: string, line: number): EvalExpectation => ({
  expect: 'must_find',
  file,
  start_line: line,
  end_line: line,
});
const mustNot = (file: string, line: number): EvalExpectation => ({
  expect: 'must_not_flag',
  file,
  start_line: line,
  end_line: line,
});

const f = (n: number): string => `src/f${n}.ts`;

export const FIXTURE_CASES: FixtureCase[] = [
  { name: 'must-find-sql-injection', file: f(1), diff: diffAdding(f(1), ['db.query(`select ${id}`);']), expected: [must(f(1), 2)] },
  { name: 'must-find-xss', file: f(2), diff: diffAdding(f(2), ['el.innerHTML = input;']), expected: [must(f(2), 2)] },
  { name: 'must-find-hardcoded-secret', file: f(3), diff: diffAdding(f(3), ['const key = "sk_live_x";']), expected: [must(f(3), 2)] },
  { name: 'must-find-race-condition', file: f(4), diff: diffAdding(f(4), ['cache.count += 1;']), expected: [must(f(4), 2)] },
  { name: 'must-not-flag-style', file: f(5), diff: diffAdding(f(5), ['const  spaced = 1;']), expected: [mustNot(f(5), 2)] },
  { name: 'must-not-flag-rename', file: f(6), diff: diffAdding(f(6), ['const renamed = a;']), expected: [mustNot(f(6), 2)] },
  { name: 'clean-change', file: f(7), diff: diffAdding(f(7), ['// a comment']), expected: [] },
  {
    name: 'mixed-find-and-not-flag',
    file: f(8),
    diff: diffAdding(f(8), ['eval(userInput);', 'const tidy = 1;']),
    expected: [must(f(8), 2), mustNot(f(8), 3)],
  },
];

const finding = (file: string, line: number) => ({
  id: `fx-${file}-${line}`,
  severity: 'WARNING' as const,
  category: 'bug' as const,
  title: `Issue at ${file}:${line}`,
  file,
  start_line: line,
  end_line: line,
  rationale: 'fixture',
  confidence: 0.9,
  kind: 'finding' as const,
});

const reviewOf = (found: ReturnType<typeof finding>[]): Review => ({
  verdict: found.length ? 'request_changes' : 'approve',
  summary: 'fixture',
  score: 80,
  findings: found,
});

/** Which line numbers the scripted prompt reports, per fixture file. */
type Reports = Record<string, number[]>;

const OLD_REPORTS: Reports = {
  [f(1)]: [2, 99], // line 99 is not in the diff: grounding drops it
  [f(2)]: [2],
  [f(3)]: [2],
  // f4 missed
  [f(5)]: [2], // noise
  [f(8)]: [2, 3], // line 3 is noise
};
const NEW_REPORTS: Reports = {
  [f(1)]: [2],
  [f(2)]: [2],
  [f(3)]: [2],
  [f(4)]: [2],
  [f(8)]: [2],
};

function scripted(reports: Reports): LlmScript['review'] {
  return (req) => {
    const text = req.messages.map((m) => m.content).join('\n');
    const file = Object.keys(reports).find((p) => text.includes(`b/${p}`));
    return reviewOf((file ? (reports[file] ?? []) : []).map((line) => finding(file!, line)));
  };
}

/** Scripts for `ScriptedLLMProvider`: the agent's system prompt picks the behaviour. */
export const FIXTURE_SCRIPTS: LlmScript[] = [
  { match: 'OLD-PROMPT', review: scripted(OLD_REPORTS) },
  { match: 'NEW-PROMPT', review: scripted(NEW_REPORTS) },
];

/** What a full run of the fixture suite scores under each prompt. */
export const EXPECTED_OLD = { passed: 5, recall: 4 / 5, precision: 1 - 2 / 6 };
export const EXPECTED_NEW = { passed: 8, recall: 1, precision: 1 };
