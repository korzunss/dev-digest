import { describe, it, expect } from 'vitest';
import { normalizeSkillPaths, skillPathProblem, createPathMatcher } from '../src/modules/_shared/skill-paths.js';

describe('normalizeSkillPaths', () => {
  it('trims, drops empty lines, strips one leading ./ and keeps order (AC-7)', () => {
    expect(normalizeSkillPaths(['  ./src/**  ', '', '   ', 'b/**', './a/**', '././x'])).toEqual([
      'src/**',
      'b/**',
      'a/**',
      './x',
    ]);
  });
});

describe('skillPathProblem', () => {
  it('accepts realistic globs', () => {
    for (const g of ['**/*.ts', 'src/**', '**/*.{ts,tsx}', 'apps/*/src/**/*.cs', '.github/**', '*.md']) {
      expect(skillPathProblem(g), g).toBeNull();
    }
  });

  it('refuses each unsafe or malformed shape', () => {
    expect(skillPathProblem('')).toMatch(/empty/);
    expect(skillPathProblem('a'.repeat(1025))).toMatch(/longer than 1024/);
    expect(skillPathProblem('a\0b')).toMatch(/NUL/);
    expect(skillPathProblem('/etc/**')).toMatch(/relative/);
    expect(skillPathProblem('C:/x/**')).toMatch(/relative/);
    expect(skillPathProblem('!src/**')).toMatch(/negation/);
    expect(skillPathProblem('./!src/**')).toMatch(/negation/);
    expect(skillPathProblem('../x')).toMatch(/\.\./);
    expect(skillPathProblem('a/../b')).toMatch(/\.\./);
    expect(skillPathProblem('a**b')).toMatch(/whole path segment/);
    expect(skillPathProblem('+(a|b)/x')).toMatch(/extglob/);
  });

  it('does not require a .md extension', () => {
    expect(skillPathProblem('**/*.cs')).toBeNull();
  });
});

describe('createPathMatcher', () => {
  const match = createPathMatcher();

  it('matches dot segments', () => {
    expect(match('.github/workflows/ci.yml', ['**/*.yml'])).toBe(true);
    expect(match('src/.hidden/a.ts', ['src/**'])).toBe(true);
  });

  it('is case sensitive', () => {
    expect(match('src/App.TS', ['**/*.ts'])).toBe(false);
    expect(match('src/app.ts', ['**/*.ts'])).toBe(true);
  });

  it('matches any glob of the list and treats an empty list as unscoped', () => {
    expect(match('a/b.cs', ['**/*.ts', '**/*.cs'])).toBe(true);
    expect(match('a/b.go', ['**/*.ts', '**/*.cs'])).toBe(false);
    expect(match('a/b.go', [])).toBe(true);
  });
});

/**
 * Wall-clock of one match on a fresh matcher (compile included), best of three.
 * A load spike hits one sample, a pathological glob (hundreds of ms) hits all three,
 * so the min keeps the 50 ms ceiling meaningful without flaking under a busy CI box.
 */
function bestOfThreeMs(path: string, glob: string): number {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const match = createPathMatcher();
    const t0 = performance.now();
    match(path, [glob]);
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

describe('fuzz: shape-valid 1024-char globs stay cheap on a 2,000-segment path', () => {
  // Deterministic LCG so a failure reproduces.
  let seed = 42;
  const rnd = (n: number) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % n;
  };
  const segAtoms = ['a', 'ab', '*', '?', 'a?', '*a', 'a*', '{a,b}', '[ab]', 'src'];
  const path = Array.from({ length: 2000 }, () => 'a').join('/') + '/a.ts';

  it('every accepted glob matches within 50 ms', () => {
    let accepted = 0;
    for (let i = 0; i < 400; i++) {
      const segs: string[] = [];
      let len = 0;
      while (len < 1000) {
        const s = segAtoms[rnd(segAtoms.length)]!;
        segs.push(s);
        len += s.length + 1;
      }
      // At most one `**`, placed anywhere before the file name, as the shape rules allow.
      segs.splice(rnd(segs.length), 0, '**');
      const g = [...segs, '*.ts'].join('/').slice(0, 1024);
      if (skillPathProblem(g) !== null) continue;
      accepted++;
      expect(bestOfThreeMs(path, g), g).toBeLessThan(50);
    }
    // Hand-built long shapes the rules accept.
    for (const g of ['**/' + 'a/'.repeat(500) + '*.ts', 'a/'.repeat(510) + '**', ('*/'.repeat(300) + '**/a.ts').slice(0, 1024)]) {
      expect(g.length).toBeLessThanOrEqual(1024);
      expect(skillPathProblem(g), g).toBeNull();
      expect(bestOfThreeMs(path, g), g).toBeLessThan(50);
      accepted++;
    }
    expect(accepted).toBeGreaterThan(50);
  });
});

describe('skillPathProblem: user-supplied glob trust boundary', () => {
  // The length cap is inclusive: exactly 1024 chars is fine, 1025 is not.
  it('accepts a glob of exactly the maximum length and refuses one char more', () => {
    const ok = 'a/'.repeat(510) + 'b.ts';
    expect(ok.length).toBeLessThanOrEqual(1024);
    expect(skillPathProblem(ok)).toBeNull();
    expect(skillPathProblem('a'.repeat(1024))).toBeNull();
    expect(skillPathProblem('a'.repeat(1025))).not.toBeNull();
  });

  // Backtracking-prone shapes are refused before picomatch ever compiles them.
  it.each([
    ['many wildcards in one segment', '*a*a*a*a*a*b'],
    ['two multi-wildcard segments', '*a*/*a*/x.ts'],
    ['three double stars', '**/**/**/a.ts'],
    ['a segment after the second **', '**/a/**/b/c.ts'],
    ['glued ** inside braces', '{**,x}/a.ts'],
    ['nested braces', '{a,{b,c}}/x.ts'],
    ['a brace range', 'src/{1..99999}.ts'],
    ['a slash inside braces', '{a/b,c}/x.ts'],
    ['extglob', '@(a|b)/x.ts'],
    ['extglob negation', '!(a)/x.ts'],
  ])('refuses %s', (_name, glob) => {
    expect(skillPathProblem(glob), glob).not.toBeNull();
  });

  // Escape attempts out of the repo root, in several spellings.
  it.each([
    ['backslash absolute', '\\etc/**'],
    ['drive letter', 'c:/x'],
    ['dot-dot after a backslash', 'a\\..\\b'],
    ['leading dot-dot', '../**'],
    ['negation after ./', './!x/**'],
  ])('refuses %s', (_name, glob) => {
    expect(skillPathProblem(glob), glob).not.toBeNull();
  });

  // A non-string slipping past the type system must be refused, not thrown on.
  it('refuses a non-string entry without throwing', () => {
    expect(skillPathProblem(42 as unknown as string)).not.toBeNull();
    expect(skillPathProblem(undefined as unknown as string)).not.toBeNull();
  });

  // Normalisation runs before validation; a whitespace-only line must vanish, not become an empty glob.
  it('normalises whitespace-only and ./-only entries away', () => {
    expect(normalizeSkillPaths(['   ', './', '\t'])).toEqual([]);
  });
});
