import { describe, it, expect } from 'vitest';
import { groundConventions } from '../src/modules/conventions/grounding.js';
import { fingerprintFor, normalizeSnippet } from '../src/modules/conventions/helpers.js';
import { SNIPPET_MAX_LINES } from '../src/modules/conventions/constants.js';
import type { RawCandidate, SampleFile } from '../src/modules/conventions/types.js';

function sample(path: string, text: string): SampleFile {
  return { path, text, lines: text.split('\n'), truncated: false };
}

const USERS = sample(
  'src/api/users.ts',
  [
    "import { db } from '../db.js';", // 1
    '', // 2
    'export async function getUser(id: string) {', // 3
    '  const user = await db.users.find(id);', // 4
    '  const posts = await db.posts.findMany({ userId: id });', // 5
    '  return { ...user, posts };', // 6
    '}', // 7
  ].join('\n'),
);

const CONFIG = sample('tsconfig.json', ['{', '  "strict": true', '}'].join('\n'));

function candidate(partial: Partial<RawCandidate> = {}): RawCandidate {
  return {
    category: 'async',
    rule: 'Always use async/await instead of .then() chains.',
    evidence_path: 'src/api/users.ts',
    evidence_line: 4,
    evidence_snippet: '  const user = await db.users.find(id);',
    confidence: 0.9,
    ...partial,
  };
}

describe('conventions evidence gate', () => {
  it('keeps a candidate whose snippet is where it says it is', () => {
    const res = groundConventions([candidate()], [USERS, CONFIG]);

    expect(res.raw).toBe(1);
    expect(res.kept).toHaveLength(1);
    expect(res.dropped).toEqual({});
    expect(res.kept[0]!.evidence_line).toBe(4);
    expect(res.kept[0]!.evidence_end_line).toBe(4);
    expect(res.kept[0]!.fingerprint).toBe(
      fingerprintFor(candidate().rule, 'src/api/users.ts'),
    );
  });

  it('CORRECTS a wrong line instead of dropping the candidate', () => {
    // The quote is real; the count is off by three. That must not cost the rule.
    const res = groundConventions([candidate({ evidence_line: 7 })], [USERS]);

    expect(res.kept).toHaveLength(1);
    expect(res.dropped).toEqual({});
    expect(res.kept[0]!.evidence_line).toBe(4);
  });

  it('matches through a whitespace-only difference', () => {
    const res = groundConventions(
      [candidate({ evidence_snippet: '\tconst  user   =\n await db.users.find(id);  ' })],
      [USERS],
    );

    expect(res.kept).toHaveLength(1);
    expect(res.kept[0]!.evidence_line).toBe(4);
  });

  it('spans evidence_end_line across a multi-line snippet', () => {
    const res = groundConventions(
      [
        candidate({
          evidence_snippet:
            'const user = await db.users.find(id); const posts = await db.posts.findMany({ userId: id });',
        }),
      ],
      [USERS],
    );

    expect(res.kept[0]!.evidence_line).toBe(4);
    expect(res.kept[0]!.evidence_end_line).toBe(5);
  });

  it('caps evidence_end_line at SNIPPET_MAX_LINES', () => {
    const lines = Array.from({ length: SNIPPET_MAX_LINES + 10 }, (_, i) => `const v${i} = ${i};`);
    const long = sample('src/long.ts', lines.join('\n'));

    const res = groundConventions(
      [
        candidate({
          evidence_path: 'src/long.ts',
          evidence_line: 1,
          evidence_snippet: lines.join('\n'),
        }),
      ],
      [long],
    );

    expect(res.kept).toHaveLength(1);
    expect(res.kept[0]!.evidence_end_line).toBe(SNIPPET_MAX_LINES);
  });

  it('prefers the occurrence nearest the claimed line when a snippet repeats', () => {
    const repeated = sample(
      'src/repeat.ts',
      ['return ok();', 'const a = 1;', 'return ok();', 'const b = 2;', 'return ok();'].join('\n'),
    );

    const res = groundConventions(
      [
        candidate({
          evidence_path: 'src/repeat.ts',
          evidence_line: 5,
          evidence_snippet: 'return ok();',
        }),
      ],
      [repeated],
    );

    expect(res.kept[0]!.evidence_line).toBe(5);
  });

  it('drops a rule that is missing or too short to be actionable', () => {
    const res = groundConventions(
      [candidate({ rule: '' }), candidate({ rule: '   ' }), candidate({ rule: 'naming' })],
      [USERS],
    );

    expect(res.kept).toHaveLength(0);
    expect(res.dropped).toEqual({ empty_rule: 3 });
  });

  it('drops a candidate citing a file the model was never shown', () => {
    const res = groundConventions(
      [candidate({ evidence_path: 'src/api/invented.ts' })],
      [USERS, CONFIG],
    );

    expect(res.kept).toHaveLength(0);
    expect(res.dropped).toEqual({ unsampled_file: 1 });
  });

  it('drops a candidate whose snippet is absent from the file it cites', () => {
    const res = groundConventions(
      [
        candidate({ evidence_snippet: 'const user = db.users.findSync(id);' }),
        // A real line, but of a DIFFERENT sampled file — still not evidence here.
        candidate({ evidence_snippet: '"strict": true' }),
        candidate({ evidence_snippet: '   ' }),
      ],
      [USERS, CONFIG],
    );

    expect(res.kept).toHaveLength(0);
    expect(res.dropped).toEqual({ snippet_absent: 3 });
  });

  it('drops a second candidate with the same fingerprint', () => {
    const res = groundConventions(
      [
        candidate(),
        candidate({ rule: 'ALWAYS   use async/await   instead of .then() chains.' }),
      ],
      [USERS],
    );

    expect(res.kept).toHaveLength(1);
    expect(res.dropped).toEqual({ duplicate: 1 });
  });

  it('keeps the same rule twice when it cites two different files', () => {
    const res = groundConventions(
      [
        candidate(),
        candidate({
          evidence_path: 'tsconfig.json',
          evidence_line: 2,
          evidence_snippet: '"strict": true',
        }),
      ],
      [USERS, CONFIG],
    );

    expect(res.kept).toHaveLength(2);
    expect(res.dropped).toEqual({});
  });

  it('tallies every reason and omits the ones that did not fire', () => {
    const res = groundConventions(
      [
        candidate(),
        candidate({ rule: 'short' }),
        candidate({ evidence_path: 'src/ghost.ts' }),
        candidate({ evidence_snippet: 'never written anywhere' }),
        candidate(),
      ],
      [USERS, CONFIG],
    );

    expect(res.raw).toBe(5);
    expect(res.kept).toHaveLength(1);
    expect(res.dropped).toEqual({
      empty_rule: 1,
      unsampled_file: 1,
      snippet_absent: 1,
      duplicate: 1,
    });
  });

  it('returns an empty tally for an empty response', () => {
    expect(groundConventions([], [USERS])).toEqual({ kept: [], raw: 0, dropped: {} });
  });
});

describe('conventions helpers', () => {
  it('normalizeSnippet collapses runs of whitespace and trims', () => {
    expect(normalizeSnippet('  const\t\tx =\n   1;  ')).toBe('const x = 1;');
  });

  it('fingerprintFor ignores whitespace and case, but not the path', () => {
    const a = fingerprintFor('Always use async/await.', 'src/api/users.ts');
    expect(fingerprintFor('  always   USE async/await.  ', 'src/api/users.ts')).toBe(a);
    expect(fingerprintFor('Always use async/await.', 'src/api/posts.ts')).not.toBe(a);
  });

  it('fingerprintFor is deterministic across calls', () => {
    expect(fingerprintFor('Always use async/await.', 'a.ts')).toBe(
      fingerprintFor('Always use async/await.', 'a.ts'),
    );
  });
});
