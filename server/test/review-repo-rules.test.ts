import { describe, it, expect } from 'vitest';
import { MockGitClient } from '../src/adapters/mocks.js';
import { ruleCandidatePaths, extractRuleText, loadRepoRules } from '../src/modules/reviews/repo-rules.js';
import {
  REPO_RULES_MAX_DIR_DEPTH,
  REPO_RULES_MAX_FILES,
  REPO_RULES_MAX_FILE_CHARS,
} from '../src/modules/reviews/constants.js';

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

describe('ruleCandidatePaths — untrusted changed paths', () => {
  // an absolute path has an empty first segment and is skipped, not turned into a candidate
  it('skips absolute paths', () => {
    expect(ruleCandidatePaths(['/etc/passwd', '/abs/dir/a.ts'])).toEqual(['AGENTS.md', 'insights/gotchas.md']);
  });
  // a backslash path must never yield a candidate carrying a backslash (Windows-style traversal)
  it('never emits a candidate containing a backslash', () => {
    const out = ruleCandidatePaths(['..\\..\\etc\\a.ts', 'a\\..\\b/c.ts', 'C:\\x\\a.ts', 'ok\\dir/a.ts']);
    expect(out.filter((p) => p.includes('\\'))).toEqual([]);
  });
  // only REPO_RULES_MAX_DIR_DEPTH ancestor directories of a deep path are searched
  it('caps the ancestor depth', () => {
    const out = ruleCandidatePaths(['a/b/c/d/e/f.ts']);
    expect(REPO_RULES_MAX_DIR_DEPTH).toBe(2);
    expect(out).toContain('a/b/AGENTS.md');
    expect(out).toContain('a/b/insights/gotchas.md');
    expect(out.some((p) => p.startsWith('a/b/c/'))).toBe(false);
  });
  // a PR touching many directories cannot make the loader read more than REPO_RULES_MAX_FILES files
  it('caps the number of candidate files', () => {
    const many = Array.from({ length: 100 }, (_, i) => `dir${String(i).padStart(3, '0')}/f.ts`);
    expect(ruleCandidatePaths(many)).toHaveLength(REPO_RULES_MAX_FILES);
  });
  // the root rule files are the most general ones; the file cap must not cut them off
  it('keeps the root pair when the file cap bites', () => {
    const many = Array.from({ length: 100 }, (_, i) => `dir${String(i).padStart(3, '0')}/f.ts`);
    const out = ruleCandidatePaths(many);
    expect(out).toContain('AGENTS.md');
    expect(out).toContain('insights/gotchas.md');
  });
});

describe('extractRuleText', () => {
  // a huge rule file from an untrusted repo is truncated to REPO_RULES_MAX_FILE_CHARS
  it('caps one file at REPO_RULES_MAX_FILE_CHARS', () => {
    const md = `## Tests\n${'- x'.repeat(REPO_RULES_MAX_FILE_CHARS)}`;
    expect(extractRuleText('insights/gotchas.md', md)).toHaveLength(REPO_RULES_MAX_FILE_CHARS);
  });
  it('leaves a file at the cap untouched', () => {
    const body = 'y'.repeat(REPO_RULES_MAX_FILE_CHARS - '## T\n'.length);
    expect(extractRuleText('insights/gotchas.md', `## T\n${body}`)).toHaveLength(REPO_RULES_MAX_FILE_CHARS);
  });
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
  it('stops reading and rethrows the reason when the caller aborts mid-load', async () => {
    const ctrl = new AbortController();
    const reason = new Error('cancelled');
    let calls = 0;
    const git = {
      readFileAt: async () => {
        calls++;
        ctrl.abort(reason);
        return '## Gotchas\n- a';
      },
    };
    await expect(loadRepoRules(git, repo, BASE, ['a/b.ts'], { signal: ctrl.signal })).rejects.toBe(reason);
    expect(calls).toBe(1);
  });
  it('makes no read for an already-aborted signal', async () => {
    let calls = 0;
    const git = { readFileAt: async () => { calls++; return ''; } };
    await expect(
      loadRepoRules(git, repo, BASE, ['a.ts'], { signal: AbortSignal.abort(new Error('x')) }),
    ).rejects.toThrow('x');
    expect(calls).toBe(0);
  });
  it('fires its own deadline with a TimeoutError', async () => {
    const git = {
      readFileAt: (_r: unknown, _ref: string, _p: string, signal?: AbortSignal) =>
        new Promise<string>((_res, rej) => signal?.addEventListener('abort', () => rej(signal.reason))),
    };
    await expect(loadRepoRules(git, repo, BASE, ['a.ts'], { timeoutMs: 1 })).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });
  // the signal handed to readFileAt follows the caller's: aborting the run reaches the in-flight git read
  it('aborts the signal given to readFileAt when the caller aborts', async () => {
    const ctrl = new AbortController();
    let seen: AbortSignal | undefined;
    const git = {
      readFileAt: (_r: unknown, _ref: string, _p: string, s?: AbortSignal) =>
        new Promise<string>((_res, rej) => {
          seen = s;
          s?.addEventListener('abort', () => rej(s.reason));
        }),
    };
    const pending = loadRepoRules(git, repo, BASE, ['a.ts'], { signal: ctrl.signal });
    const reason = new Error('run cancelled');
    ctrl.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(seen?.aborted).toBe(true);
  });
  // a read that fails BECAUSE the signal fired is an abort, not a "missing" file (even for the last candidate)
  it('rethrows the abort reason instead of counting a read error that raced the abort', async () => {
    const ctrl = new AbortController();
    const reason = new Error('cancelled');
    const total = ruleCandidatePaths(['a.ts']).length;
    let calls = 0;
    const git = {
      readFileAt: async () => {
        calls++;
        if (calls < total) return '';
        ctrl.abort(reason);
        throw new Error('git killed');
      },
    };
    await expect(loadRepoRules(git, repo, BASE, ['a.ts'], { signal: ctrl.signal })).rejects.toBe(reason);
    expect(calls).toBe(total);
  });
  it('forwards the signal as the 4th argument', async () => {
    const seen: unknown[] = [];
    const git = { readFileAt: async (_r: unknown, _ref: string, _p: string, s?: AbortSignal) => { seen.push(s); return ''; } };
    await loadRepoRules(git, repo, BASE, ['a.ts']);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s instanceof AbortSignal)).toBe(true);
  });
  it('reads nothing without a base sha', async () => {
    let calls = 0;
    const git = { readFileAt: async () => { calls++; return ''; } };
    expect(await loadRepoRules(git, repo, null, ['a.ts'])).toEqual({ sets: [], read: 0, missing: 0 });
    expect(calls).toBe(0);
  });
});
