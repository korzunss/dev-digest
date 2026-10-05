import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { ContextDocPath, ContextPathsBody, SetContextRootsBody } from '@devdigest/shared';
import {
  isInsideDir,
  toRepoRelative,
  normaliseDocPath,
  compileRoots,
  compileDirFilter,
  validateRootGlob,
  resolveContextPath,
  docType,
} from '../src/modules/context/helpers.js';

/**
 * The security half of the context module. `resolveContextPath` is the single gate
 * between a caller-supplied path and a file read, so it is exercised here
 * without a filesystem: every case below is a decision about a string, and a
 * regression would otherwise only show up as a real file leaving the clone.
 */

const CLONE = path.resolve('/clones/acme/payments-api');
const abs = (...parts: string[]) => path.join(CLONE, ...parts);

describe('isInsideDir', () => {
  it('refuses a sibling directory whose name merely prefixes the clone', () => {
    // `/c/repo-evil/x.md` shares the string prefix `/c/repo` — a bare
    // `startsWith` on the raw path would let this through.
    expect(isInsideDir('/c/repo', '/c/repo-evil/x.md')).toBe(false);
    expect(isInsideDir('/c/repo', '/c/repo/specs/x.md')).toBe(true);
    expect(isInsideDir('/c/repo', '/c/repo')).toBe(true);
  });
});

describe('toRepoRelative', () => {
  it('reports the path as addressed, POSIX-separated', () => {
    expect(toRepoRelative(CLONE, abs('specs', 'public-api.md'))).toBe('specs/public-api.md');
    expect(toRepoRelative(CLONE, abs('docs', 'adr', 'a.md'))).toBe('docs/adr/a.md');
  });
});

describe('glob-based helpers', () => {
  const isRoot = compileRoots(['**/{specs,docs,insights}/**/*.md']);

  it('default glob matches nested spec folders', () => {
    expect(isRoot('specs/a.md')).toBe(true);
    expect(isRoot('server/specs/a.md')).toBe(true);
    expect(isRoot('specs/sub/a.md')).toBe(true);
  });

  it('default glob rejects everything else', () => {
    for (const p of ['src/a.md', '.github/docs/x.md', 'specs/.hidden.md', 'node_modules/x/docs/a.md', 'specs/a.txt']) {
      expect(isRoot(p)).toBe(false);
    }
  });

  it('validateRootGlob accepts the default and refuses unsafe globs', () => {
    expect(validateRootGlob('**/{specs,docs,insights}/**/*.md')).toBeNull();
    for (const g of ['/abs/**/*.md', '../x/*.md', '**/*.{md,txt}', '**/*.m?', '']) {
      expect(validateRootGlob(g)).not.toBeNull();
    }
  });

  it('normaliseDocPath canonicalises or refuses', () => {
    expect(normaliseDocPath('./specs//a.md')).toBe('specs/a.md');
    expect(normaliseDocPath('specs\\a.md')).toBe('specs/a.md');
    expect(normaliseDocPath('evil/../specs/a.md')).toBe('specs/a.md');
    for (const p of ['', '/etc/a.md', '\\a.md', 'C:/a.md', '../a.md', 'specs/../../a.md', 'a\0.md']) {
      expect(normaliseDocPath(p)).toBeNull();
    }
  });

  it('resolveContextPath returns abs+rel or a refusal reason', () => {
    expect(resolveContextPath(CLONE, 'specs/a.md', isRoot)).toEqual({
      abs: abs('specs', 'a.md'),
      rel: 'specs/a.md',
    });
    expect(resolveContextPath(CLONE, 'src/a.md', isRoot)).toEqual({ refused: 'outside_search_roots' });
    expect(resolveContextPath(CLONE, '../a.md', isRoot)).toEqual({ refused: 'outside_clone' });
    expect(resolveContextPath(CLONE, 'specs/a.txt', isRoot)).toEqual({ refused: 'outside_search_roots' });
  });

  it('docType picks the nearest typed ancestor', () => {
    expect(docType('server/specs/docs/a.md')).toBe('docs');
    expect(docType('specs/a.md')).toBe('specs');
    expect(docType('README.md')).toBe('other');
  });
});

describe('validateRootGlob — unsafe globs are refused with a reason', () => {
  // each of these would let a root escape the repo or match non-markdown files
  it('refuses NUL, drive letters, backslash traversal, over-long, blank and non-.md globs', () => {
    const bad = [
      'a\0.md',
      'C:/docs/*.md',
      'docs\\..\\..\\x.md',
      'docs/../../x.md',
      '\\server\\share\\*.md',
      'x'.repeat(257) + '.md',
      '   ',
      'docs/**',
      'docs/*.md/',
    ];
    for (const g of bad) expect(validateRootGlob(g), JSON.stringify(g)).not.toBeNull();
  });

  // the cap is inclusive: exactly 256 characters is fine
  it('accepts a glob of exactly the maximum length and an upper-case extension', () => {
    expect(validateRootGlob('a'.repeat(253) + '.md')).toBeNull();
    expect(validateRootGlob('**/*.MD')).toBeNull();
  });
});

describe('ContextDocPath — the save-time gate for attached paths', () => {
  // each rejected shape is a route-level 422 (ContextPathsBody uses this schema)
  it('rejects empty, over-long, NUL, absolute, traversal and non-.md paths', () => {
    const bad = ['', 'a'.repeat(510) + '.md', 'a\0.md', '/etc/a.md', '\\a.md', '../a.md', 'a/..\\b.md', 'specs/a.txt'];
    for (const p of bad) expect(ContextDocPath.safeParse(p).success, JSON.stringify(p)).toBe(false);
  });

  it('accepts a normal repo-relative path and caps the list at 200', () => {
    expect(ContextDocPath.safeParse('specs/A.MD').success).toBe(true);
    expect(ContextPathsBody.safeParse({ paths: Array(201).fill('a.md') }).success).toBe(false);
    expect(ContextPathsBody.safeParse({}).success).toBe(false);
  });

  // a drive-letter path passes the schema but the run-time guard still refuses it
  it('a drive-letter path that the schema lets through is refused by resolveContextPath', () => {
    expect(ContextDocPath.safeParse('C:/a.md').success).toBe(true);
    expect(resolveContextPath(CLONE, 'C:/a.md', () => true)).toEqual({ refused: 'outside_clone' });
  });

  // a percent-encoded `..` is a literal name: it stays inside the clone, nothing is decoded
  it('treats %2e%2e as a literal directory name', () => {
    expect(normaliseDocPath('specs/%2e%2e/a.md')).toBe('specs/%2e%2e/a.md');
    const r = resolveContextPath(CLONE, 'specs/%2e%2e/a.md', () => true);
    expect(r).toEqual({ abs: abs('specs', '%2e%2e', 'a.md'), rel: 'specs/%2e%2e/a.md' });
  });
});

describe('validateRootGlob — regex-DoS shape caps', () => {
  const pathological = '**/' + '*a'.repeat(20) + '*b.md';
  const accepted = [
    '**/{specs,docs,insights}/**/*.md',
    'docs/**/*.md',
    '**/specs/*.md',
    '**/{specs,docs}/**/*.prd.md',
  ];

  it('refuses the pathological glob and other dangerous shapes', () => {
    expect(validateRootGlob(pathological)).toMatch(/wildcards/);
    const bad = [
      '**/a/**/b/**/c/**/d/**/e/**/*.md',
      '**/@(a|b)/*.md',
      '**/!(a)/*.md',
      '**/+(a)/*.md',
      '**/*(a)/*.md',
      '**/?(a)/*.md',
      '**/{a,{b,c}}/*.md',
      '**/{a..c}/*.md',
      '**/*a*b*c.md',
    ];
    for (const g of bad) expect(validateRootGlob(g), g).not.toBeNull();
  });

  it('still accepts the default and realistic globs', () => {
    for (const g of accepted) expect(validateRootGlob(g), g).toBeNull();
  });

  it('matching a 255-char filename is fast for every accepted glob', () => {
    const name = 'a'.repeat(252) + '.md';
    for (const g of [...accepted, '**/*a*b.md', 'docs/?-*.md']) {
      expect(validateRootGlob(g), g).toBeNull();
      const match = compileRoots([g]);
      const t0 = performance.now();
      match(name);
      match('docs/' + name);
      expect(performance.now() - t0, g).toBeLessThan(50);
    }
  });
});

describe('validateRootGlob — cost of a long path (4,096 chars)', () => {
  // 15 × 255-char segments + a file name, worst case for a glob that cannot match
  const long = Array.from({ length: 15 }, () => 'a'.repeat(255)).join('/') + '/' + 'a'.repeat(253) + '.md';
  const accepted = [
    '**/{specs,docs,insights}/**/*.md',
    'docs/**/*.md',
    '**/specs/*.md',
    '**/{specs,docs}/**/*.prd.md',
    '**/*a*b.md',
    'docs/?-*.md',
    '**/*a*/**/x.md',
    '**/*a/**/*a.md',
    '*a*/*/*/*a.md',
  ];

  it('is bounded (< 50 ms) for every accepted glob', () => {
    expect(long.length).toBeGreaterThanOrEqual(4096);
    for (const g of accepted) {
      expect(validateRootGlob(g), g).toBeNull();
      const match = compileRoots([g]);
      const t0 = performance.now();
      match(long);
      expect(performance.now() - t0, g).toBeLessThan(50);
    }
  });

  it('refuses two segments with several wildcards — the measured 250 ms–1.5 s shapes', () => {
    for (const g of ['*a*/**/*a*/**/x.md', '**/*a*/*a*/**/x.md', '*a*/*a*/*a*.md', '**/*a*/*a*.md']) {
      expect(validateRootGlob(g), g).toMatch(/several wildcards/);
    }
  });

  it("refuses a negated root, which compileDirFilter's base would otherwise prune", () => {
    expect(validateRootGlob('!docs/**/*.md')).toMatch(/negation/);
  });
});

describe('validateRootGlob — pinned refusals', () => {
  it("refuses three '**' segments", () => {
    expect(validateRootGlob('a/**/b/**/c/**/x.md')).toMatch(/'\*\*' segments/);
  });

  it("refuses '/' inside braces", () => {
    expect(validateRootGlob('{docs/a,specs}/x.md')).toMatch(/'\/' inside braces/);
  });
});

describe('validateRootGlob — SEC1b negation hidden behind a prefix', () => {
  it("refuses './!docs/**/*.md' and '!docs/**/*.md'", () => {
    expect(validateRootGlob('./!docs/**/*.md')).toMatch(/negation/);
    expect(validateRootGlob('!docs/**/*.md')).toMatch(/negation/);
  });
});

describe("validateRootGlob — SEC2c '**' must be a whole path segment", () => {
  it("refuses '**' inside a segment or a brace", () => {
    for (const g of ['**/*/**/{**,x}.md', '**/a/**/{**,x}.md', '**/{**,a}/**/x.md', 'a**b.md', '{a,**}.md']) {
      expect(validateRootGlob(g), g).toMatch(/whole path segment/);
    }
  });
});

describe('validateRootGlob — SEC2b only the file name may follow the second **', () => {
  it('refuses anything between the second ** and the file name', () => {
    for (const g of ['**/*/**/*/x.md', '**/docs/**/a/b.md']) {
      expect(validateRootGlob(g), g).toMatch(/after its second/);
    }
    expect(validateRootGlob('**/*/**/' + '*/'.repeat(122) + '*.md')).toMatch(/after its second/);
  });

  it('still accepts the default and a bare second **', () => {
    expect(validateRootGlob('**/{specs,docs,insights}/**/*.md')).toBeNull();
    expect(validateRootGlob('**/*/**/*.md')).toBeNull();
  });

  it('every accepted glob matches a 2,046-segment path in < 50 ms', () => {
    const paths = ['a/'.repeat(2046) + '.x.md', 'docs/'.repeat(818) + '.x.md', 'a/'.repeat(2046) + 'b.MD'];
    const accepted = [
      '**/{specs,docs,insights}/**/*.md',
      '**/*/**/*.md',
      'docs/**/*.md',
      '**/specs/*.md',
      '**/*a*/**/x.md',
      '**/*a/**/*a.md',
    ];
    for (const g of accepted) {
      expect(validateRootGlob(g), g).toBeNull();
      const match = compileRoots([g]);
      for (const p of paths) {
        const t0 = performance.now();
        match(p);
        expect(performance.now() - t0, g).toBeLessThan(50);
      }
    }
  });
});

describe('compileDirFilter', () => {
  it('admits every directory for the default roots (no static base)', () => {
    const f = compileDirFilter(['**/{specs,docs,insights}/**/*.md']);
    expect(f('src/deep')).toBe(true);
  });

  it('admits only directories on the path of a based glob', () => {
    const f = compileDirFilter(['docs/**/*.md']);
    expect(f('docs')).toBe(true);
    expect(f('docs/a')).toBe(true);
    expect(f('src')).toBe(false);
  });
});

describe('compileDirFilter — negated globs', () => {
  it('admits every directory when a glob is negated (scan().base ignores the "!")', () => {
    const f = compileDirFilter(['!docs/**/*.md']);
    expect(f('src')).toBe(true);
    expect(compileRoots(['!docs/**/*.md'])('src/a.md')).toBe(true);
  });
});

describe('compileDirFilter — fails closed: never prunes a dir a root could match', () => {
  // every glob here has a match somewhere under `dir`, so the filter must admit it
  it('admits each ancestor, the base itself and every descendant of a based glob', () => {
    const f = compileDirFilter(['docs/api/**/*.md']);
    expect(f('docs')).toBe(true);
    expect(f('docs/api')).toBe(true);
    expect(f('docs/api/v1/deep/er')).toBe(true);
    expect(f('docs/other')).toBe(false);
    expect(f('src')).toBe(false);
  });

  // a name that merely shares a string prefix with the base is a different directory
  it('does not treat a sibling that prefixes the base as on its path', () => {
    const f = compileDirFilter(['docs/**/*.md']);
    expect(f('docs-old')).toBe(false);
    expect(f('doc')).toBe(false);
  });

  // one unbounded root makes every dir reachable, so a based sibling must not narrow it
  it('admits everything when any one glob has no static base', () => {
    const f = compileDirFilter(['docs/**/*.md', '**/specs/*.md']);
    for (const d of ['src', 'a/b/c', 'docs', 'node_modules']) expect(f(d), d).toBe(true);
  });

  // the union of bases: a dir on any root's path is admitted
  it('admits a dir on the path of any one of several based globs', () => {
    const f = compileDirFilter(['docs/**/*.md', 'server/specs/*.md']);
    expect(f('docs')).toBe(true);
    expect(f('server')).toBe(true);
    expect(f('server/specs')).toBe(true);
    expect(f('client')).toBe(false);
  });

  // braces/wildcards in the first segment leave no static base: doubt means descend
  it('admits every dir for globs whose first segment is a brace or wildcard', () => {
    for (const g of ['{docs,specs}/*.md', '*/docs/*.md', 'do*/x.md']) {
      const f = compileDirFilter([g]);
      expect(f('anything/deep'), g).toBe(true);
    }
  });

  // soundness property: for every doc the roots match, each of its ancestor dirs is admitted
  it('never prunes an ancestor of a doc that compileRoots matches', () => {
    const globs = ['docs/**/*.md', 'server/specs/*.md', '**/{specs,insights}/*.md', 'a/b?/c/*.md'];
    const docs = ['docs/x.md', 'docs/a/b/c.md', 'server/specs/x.md', 'a/bz/c/x.md', 'z/specs/x.md', 'q/w/insights/x.md'];
    for (const g of globs) {
      const match = compileRoots([g]);
      const f = compileDirFilter([g]);
      for (const doc of docs.filter((x) => match(x))) {
        const parts = doc.split('/').slice(0, -1);
        for (let i = 1; i <= parts.length; i++) {
          const dir = parts.slice(0, i).join('/');
          expect(f(dir), `${g} · ${doc} · ${dir}`).toBe(true);
        }
      }
    }
  });
});

describe('SetContextRootsBody — bounds enforced at the route schema', () => {
  const ok = (globs: string[]) => SetContextRootsBody.safeParse({ globs }).success;

  // the list cap is inclusive: 100 passes, 101 does not
  it('accepts 100 globs and rejects 101', () => {
    expect(ok(Array(100).fill('docs/*.md'))).toBe(true);
    expect(ok(Array(101).fill('docs/*.md'))).toBe(false);
  });

  // the per-glob cap is inclusive: 1024 passes, 1025 does not
  it('accepts a 1024-char glob and rejects a 1025-char one', () => {
    expect(ok(['x'.repeat(1024)])).toBe(true);
    expect(ok(['x'.repeat(1025)])).toBe(false);
  });

  it('rejects an empty list, a missing field and non-string entries', () => {
    expect(ok([])).toBe(false);
    expect(SetContextRootsBody.safeParse({}).success).toBe(false);
    expect(SetContextRootsBody.safeParse({ globs: [1] }).success).toBe(false);
    expect(SetContextRootsBody.safeParse({ globs: 'docs/*.md' }).success).toBe(false);
  });
});
