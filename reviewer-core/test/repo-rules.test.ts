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
