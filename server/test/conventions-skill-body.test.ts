import { describe, it, expect } from 'vitest';
import type { ConventionCandidate } from '@devdigest/shared';
import { buildSkillPreviews } from '../src/modules/conventions/skill-body.js';

/**
 * The accepted-candidates → skill-body stage (spec 004), which is pure: no DB,
 * no clone, no model. The properties that matter here are that nothing the
 * caller did not hand over shows up in a body, and that two calls over the same
 * candidates produce the same bytes — the modal re-renders on every open.
 */

function c(partial: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: 'cand-1',
    repo_id: 'repo-1',
    scan_id: 'scan-1',
    rule: 'Always use async/await instead of .then() chains.',
    category: 'async',
    evidence_path: 'src/api/users.ts',
    evidence_line: 23,
    evidence_end_line: 31,
    evidence_snippet: 'const user = await db.users.find(id);',
    confidence: 0.9,
    status: 'accepted',
    skill_id: null,
    created_at: '2026-09-22T00:00:00.000Z',
    ...partial,
  };
}

const build = (candidates: ConventionCandidate[], split = false) =>
  buildSkillPreviews({ repoName: 'payments-api', candidates, split });

describe('buildSkillPreviews — merged', () => {
  it('renders the documented body shape', () => {
    const [preview] = build([c()]);

    expect(preview).toMatchObject({
      name: 'payments-api-conventions',
      type: 'convention',
      description: '1 house conventions extracted from payments-api',
    });
    expect(preview!.body).toBe(
      [
        '# payments-api-conventions',
        '',
        'House conventions for `payments-api`. Flag changes that violate any rule below',
        'and cite the offending `file:line`.',
        '',
        '## async-await-then-chains',
        'Always use async/await instead of .then() chains.',
        '',
        'Detected in `src/api/users.ts:23-31`:',
        '',
        '```ts',
        'const user = await db.users.find(id);',
        '```',
      ].join('\n'),
    );
  });

  it('returns [] for an empty candidate list', () => {
    expect(build([])).toEqual([]);
  });

  it('contains only the candidates it was handed', () => {
    const previews = build([
      c({ id: 'a', rule: 'Return typed errors from every handler.', category: 'error-handling' }),
    ]);

    expect(previews[0]!.body).toContain('typed errors');
    expect(previews[0]!.body).not.toContain('async/await');
    expect(previews[0]!.candidate_ids).toEqual(['a']);
  });

  it('groups rules by category in contract declaration order', () => {
    const body = build([
      c({ id: 'a', category: 'testing', rule: 'Name a test file after its tier.' }),
      c({ id: 'b', category: 'naming', rule: 'Name files in kebab-case.' }),
      c({ id: 'd', category: 'async', rule: 'Await every promise you create.' }),
    ])[0]!.body;

    const headings = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([
      'name-files-kebab-case',
      'await-promise-you-create',
      'name-test-file-after-tier',
    ]);
  });

  it('folds every id in, in the order the body renders them', () => {
    const [preview] = build([
      c({ id: 'low', category: 'api', confidence: 0.2 }),
      c({ id: 'high', category: 'api', confidence: 0.95 }),
    ]);

    expect(preview!.candidate_ids).toEqual(['high', 'low']);
  });

  it('de-duplicates evidence_files down to the distinct cited paths', () => {
    const [preview] = build([
      c({ id: 'a', evidence_path: 'src/api/users.ts' }),
      c({ id: 'b', evidence_path: 'src/api/users.ts', category: 'api' }),
      c({ id: 'd', evidence_path: 'src/db/repo.ts', category: 'data-access' }),
    ]);

    expect(preview!.evidence_files).toEqual(['src/api/users.ts', 'src/db/repo.ts']);
  });
});

describe('buildSkillPreviews — citations', () => {
  it('renders `path:line` when the snippet is one line', () => {
    const body = build([c({ evidence_line: 23, evidence_end_line: 23 })])[0]!.body;
    expect(body).toContain('Detected in `src/api/users.ts:23`:');
  });

  it('renders `path:start-end` when it spans several', () => {
    const body = build([c({ evidence_line: 23, evidence_end_line: 31 })])[0]!.body;
    expect(body).toContain('Detected in `src/api/users.ts:23-31`:');
  });

  it('infers the fence language from the extension, bare when unknown', () => {
    expect(build([c({ evidence_path: 'lib/parse.py' })])[0]!.body).toContain('```python\n');
    expect(build([c({ evidence_path: 'Makefile' })])[0]!.body).toContain('```\nconst user');
  });

  it('widens the fence so a snippet cannot close its own block', () => {
    const body = build([
      c({ evidence_path: 'README.md', evidence_snippet: '```ts\nconst a = 1;\n```' }),
    ])[0]!.body;

    expect(body).toContain('````md\n```ts\nconst a = 1;\n```\n````');
  });
});

describe('buildSkillPreviews — split', () => {
  const mixed = [
    c({ id: 'a', category: 'async', rule: 'Await every promise you create.' }),
    c({ id: 'b', category: 'testing', rule: 'Name a test file after its tier.' }),
    c({ id: 'd', category: 'testing', rule: 'Assert on behaviour, not on calls.' }),
  ];

  it('yields one preview per category present and none for the absent ones', () => {
    const previews = build(mixed, true);

    expect(previews.map((p) => p.name)).toEqual([
      'payments-api-async',
      'payments-api-testing',
    ]);
    expect(previews.map((p) => p.description)).toEqual([
      '1 async conventions extracted from payments-api',
      '2 testing conventions extracted from payments-api',
    ]);
  });

  it('gives each preview only its own candidates, ids and evidence files', () => {
    const [async_, testing] = build(
      [
        ...mixed,
        c({ id: 'e', category: 'testing', evidence_path: 'test/helpers/pg.ts' }),
      ],
      true,
    );

    expect(async_!.candidate_ids).toEqual(['a']);
    expect(async_!.evidence_files).toEqual(['src/api/users.ts']);
    expect(async_!.body).not.toContain('test file');

    expect(testing!.candidate_ids).toHaveLength(3);
    expect(testing!.evidence_files).toEqual(['src/api/users.ts', 'test/helpers/pg.ts']);
    expect(testing!.body).not.toContain('Await every promise');
  });

  it('titles each split body with its own name', () => {
    expect(build(mixed, true)[0]!.body.startsWith('# payments-api-async\n')).toBe(true);
  });
});

describe('buildSkillPreviews — determinism', () => {
  const candidates = [
    c({ id: 'a', category: 'api', rule: 'Version every public route.', confidence: 0.7 }),
    c({ id: 'b', category: 'api', rule: 'Reject unknown fields.', confidence: 0.7 }),
    c({ id: 'd', category: 'naming', rule: 'Name files in kebab-case.', confidence: 0.4 }),
  ];

  it('is byte-identical across two calls', () => {
    expect(build(candidates)).toEqual(build(candidates));
    expect(build(candidates, true)).toEqual(build(candidates, true));
  });

  it('does not depend on the order the candidates arrive in', () => {
    const reversed = [...candidates].reverse();
    expect(build(reversed)[0]!.body).toBe(build(candidates)[0]!.body);
  });
});
