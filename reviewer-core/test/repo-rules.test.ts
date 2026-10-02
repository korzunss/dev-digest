import { describe, it, expect } from 'vitest';
import {
  buildRepoContext,
  renderChangedFiles,
  selectRepoRules,
  type RepoRuleSet,
} from '../src/review/repo-rules.js';

const root: RepoRuleSet = { scope: '', source: 'AGENTS.md', text: 'ROOT' };
const server: RepoRuleSet = { scope: 'server', source: 'server/AGENTS.md', text: 'SERVER' };
const deep: RepoRuleSet = { scope: 'server/src', source: 'server/src/AGENTS.md', text: 'DEEP' };
const client: RepoRuleSet = { scope: 'client', source: 'client/AGENTS.md', text: 'CLIENT' };

describe('selectRepoRules', () => {
  it('matches a scope by directory prefix, not by string prefix', () => {
    expect(selectRepoRules([server], ['server/src/a.ts'], 1000)).toEqual([server]);
    expect(selectRepoRules([server], ['server-x/a.ts'], 1000)).toEqual([]);
  });

  it('always keeps root rules and orders deepest first', () => {
    const out = selectRepoRules([root, server, deep, client], ['server/src/a.ts'], 1000);
    expect(out.map((s) => s.scope)).toEqual(['server/src', 'server', '']);
  });

  it('truncates the set that crosses maxChars and drops the rest', () => {
    const out = selectRepoRules([server, root], ['server/a.ts'], 8);
    expect(out).toHaveLength(2);
    expect(out[0]!.text).toBe('SERVER');
    expect(out[1]!.text).toBe('RO\n[truncated]');
    expect(selectRepoRules([server, root], ['server/a.ts'], 6)).toEqual([server]);
  });

  it('returns [] for empty input', () => {
    expect(selectRepoRules([], ['a.ts'], 100)).toEqual([]);
  });
});

describe('renderChangedFiles', () => {
  it('lists paths in order with a count header', () => {
    expect(renderChangedFiles(['a.ts', 'b.ts'], 10, 1000)).toBe(
      'Files changed in this PR (2):\n- a.ts\n- b.ts',
    );
  });

  it('adds "+K more" past the path cap and the char cap', () => {
    expect(renderChangedFiles(['a', 'b', 'c'], 2, 1000)).toMatch(/- b\n… \+1 more$/);
    expect(renderChangedFiles(['aaaa', 'bbbb', 'cccc'], 10, 12)).toMatch(/… \+2 more$/);
  });
});

describe('buildRepoContext', () => {
  it('returns one item per kept set plus the file list', () => {
    const items = buildRepoContext([root, server, client], ['server/a.ts'], ['server/a.ts', 'client/b.ts']);
    expect(items).toHaveLength(3);
    expect(items[0]).toBe('Rules from server/AGENTS.md (applies to server/):\nSERVER');
    expect(items[1]).toBe('Rules from AGENTS.md (applies to whole repo):\nROOT');
    expect(items[2]).toContain('- client/b.ts');
  });

  it('is empty with no sets and no file list', () => {
    expect(buildRepoContext([], ['a.ts'], undefined)).toEqual([]);
    expect(buildRepoContext([], ['a.ts'], [])).toEqual([]);
  });
});

describe('selectRepoRules — boundaries', () => {
  // a set whose text is exactly the remaining budget is kept whole, with no marker
  it('keeps a set that exactly fills the budget untruncated', () => {
    expect(selectRepoRules([server], ['server/a.ts'], 'SERVER'.length)).toEqual([server]);
  });
  // a zero budget selects nothing, even the root set
  it('returns [] when maxChars is 0', () => {
    expect(selectRepoRules([root, server], ['server/a.ts'], 0)).toEqual([]);
  });
  // a file literally named like the scope is not inside that directory
  it('does not match a path equal to the scope name', () => {
    expect(selectRepoRules([server], ['server'], 1000)).toEqual([]);
  });
  // equal-depth scopes keep their input order (stable)
  it('keeps input order for equal-depth scopes', () => {
    const out = selectRepoRules([client, server], ['server/a.ts', 'client/b.ts'], 1000);
    expect(out.map((s) => s.scope)).toEqual(['client', 'server']);
  });
  // root rules apply even for a chunk with no paths
  it('keeps the root set for an empty path list', () => {
    expect(selectRepoRules([root, server], [], 1000)).toEqual([root]);
  });
});

describe('renderChangedFiles — caps', () => {
  // the char cap counts "- path\n" per line: 5+1 fits in 8, the second line does not
  it('stops at the char cap and reports the remainder', () => {
    expect(renderChangedFiles(['aaa', 'bbb'], 10, 8)).toBe('Files changed in this PR (2):\n- aaa\n… +1 more');
  });
  // the header reports the true total even when the list is cut
  it('keeps the total in the header when the path cap cuts the list', () => {
    expect(renderChangedFiles(['a', 'b', 'c'], 1, 1000).split('\n')[0]).toBe('Files changed in this PR (3):');
  });
});

describe('buildRepoContext — caps', () => {
  // rulesMaxChars flows into selectRepoRules: the rule text is cut and marked
  it('applies rulesMaxChars to the rule items', () => {
    const items = buildRepoContext([server], ['server/a.ts'], undefined, { rulesMaxChars: 3 });
    expect(items).toEqual(['Rules from server/AGENTS.md (applies to server/):\nSER\n[truncated]']);
  });
  // filesMaxPaths / filesMaxChars flow into the changed-file list
  it('applies filesMaxPaths and filesMaxChars to the file list', () => {
    const all = ['a.ts', 'b.ts', 'c.ts'];
    expect(buildRepoContext([], [], all, { filesMaxPaths: 1 })[0]).toMatch(/- a\.ts\n… \+2 more$/);
    expect(buildRepoContext([], [], all, { filesMaxChars: 10 })[0]).toMatch(/… \+2 more$/);
  });
  // rules come first, the file list last
  it('puts the file list after the rule items', () => {
    const items = buildRepoContext([root], ['a.ts'], ['a.ts']);
    expect(items[0]).toContain('ROOT');
    expect(items[1]).toMatch(/^Files changed in this PR \(1\):/);
  });
});
