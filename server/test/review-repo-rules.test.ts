import { describe, it, expect } from 'vitest';
import { MockGitClient } from '../src/adapters/mocks.js';
import { ruleCandidatePaths, extractRuleText, loadRepoRules } from '../src/modules/reviews/repo-rules.js';

const repo = { owner: 'acme', name: 'app' };
const BASE = 'b'.repeat(40);
const HEAD = 'h'.repeat(40);

describe('ruleCandidatePaths', () => {
  it('lists the root pair and each ancestor pair', () => {
    expect(ruleCandidatePaths(['server/src/a.ts'])).toEqual([
      'AGENTS.md',
      'insights/gotchas.md',
      'server/AGENTS.md',
      'server/insights/gotchas.md',
      'server/src/AGENTS.md',
      'server/src/insights/gotchas.md',
    ]);
  });
  it('skips a path with a .. segment', () => {
    const out = ruleCandidatePaths(['../etc/a.ts', 'x/../y/a.ts', './a.ts', 'a//b.ts']);
    expect(out).toEqual(['AGENTS.md', 'insights/gotchas.md']);
  });
});

describe('extractRuleText', () => {
  it('keeps only Gotchas/Conventions sections of AGENTS.md', () => {
    const md = '# T\n\n## Commands\nrun it\n\n## Gotchas\n- a\n\n## Conventions (x)\n- b\n\n## Other\nno';
    const out = extractRuleText('server/AGENTS.md', md);
    expect(out).toContain('- a');
    expect(out).toContain('- b');
    expect(out).not.toContain('run it');
    expect(out).not.toContain('no');
  });
  it('drops the Security section of gotchas.md', () => {
    const md = '# t\n\n## Tests\n- keep\n\n## Security\n- secret rule\n\n## Run log\n- log';
    const out = extractRuleText('insights/gotchas.md', md);
    expect(out).toContain('- keep');
    expect(out).toContain('- log');
    expect(out).not.toContain('secret rule');
  });
  it('drops a "no auth by design" line', () => {
    const out = extractRuleText('insights/gotchas.md', '## A\n- fine\n- No Auth by design here\n- also By Design');
    expect(out).toBe('## A\n- fine');
  });
});

describe('loadRepoRules', () => {
  it('reads at the base sha only and scopes by directory', async () => {
    const git = new MockGitClient({
      filesAt: {
        [`${BASE}:AGENTS.md`]: '## Gotchas\n- root',
        [`${BASE}:server/insights/gotchas.md`]: '## Tests\n- srv',
        [`${HEAD}:server/AGENTS.md`]: '## Gotchas\n- head only',
      },
    });
    const out = await loadRepoRules(git, repo, BASE, ['server/src/a.ts']);
    expect(out.sets.map((s) => [s.scope, s.source])).toEqual([
      ['', 'AGENTS.md'],
      ['server', 'server/insights/gotchas.md'],
    ]);
    expect(out.sets.some((s) => s.text.includes('head only'))).toBe(false);
    expect(out.read).toBe(2);
    expect(out.missing).toBe(4);
  });
  it('counts a read error instead of throwing', async () => {
    const git = { readFileAt: async () => { throw new Error('boom'); } };
    const out = await loadRepoRules(git, repo, BASE, ['a/b.ts']);
    expect(out).toEqual({ sets: [], read: 0, missing: 4 });
  });
  it('reads nothing without a base sha', async () => {
    let calls = 0;
    const git = { readFileAt: async () => { calls++; return ''; } };
    expect(await loadRepoRules(git, repo, null, ['a.ts'])).toEqual({ sets: [], read: 0, missing: 0 });
    expect(calls).toBe(0);
  });
});
