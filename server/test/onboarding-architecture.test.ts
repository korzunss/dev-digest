import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Architecture invariants of `modules/onboarding/` (plan 26, D10 A). There is no
 * working depcruise gate, so the edges are asserted on the PARSED import
 * specifiers — comments are stripped first, so prose never trips a check.
 */
const DIR = path.resolve(__dirname, '../src/modules/onboarding');

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function importsOf(src: string): string[] {
  const code = stripComments(src);
  const specs: string[] = [];
  const re = /(?:\bimport\b|\bexport\b)[^'";]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of code.matchAll(re)) specs.push((m[1] ?? m[2] ?? m[3])!);
  return specs;
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.ts'));
const parsed = files.map((f) => ({
  file: f,
  imports: importsOf(readFileSync(path.join(DIR, f), 'utf8')),
}));

const ALLOWED_CROSS_MODULE = [/^\.\.\/settings\/feature-models\.js$/, /^\.\.\/repos\/constants\.js$/, /^\.\.\/_shared\//];

describe('onboarding module architecture', () => {
  it('sees the module files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('does not import adapters', () => {
    for (const { file, imports } of parsed) {
      const bad = imports.filter((s) => /(^|\/)adapters(\/|$)/.test(s));
      expect({ file, bad }).toEqual({ file, bad: [] });
    }
  });

  it('touches drizzle-orm and db/schema only in repository.ts', () => {
    for (const { file, imports } of parsed) {
      if (file === 'repository.ts') continue;
      const bad = imports.filter((s) => s === 'drizzle-orm' || s.startsWith('drizzle-orm/') || /db\/schema/.test(s));
      expect({ file, bad }).toEqual({ file, bad: [] });
    }
  });

  it('does not reach into repo-intel pipeline or repository', () => {
    for (const { file, imports } of parsed) {
      const bad = imports.filter((s) => /repo-intel\/(pipeline|repository)/.test(s));
      expect({ file, bad }).toEqual({ file, bad: [] });
    }
  });

  it('imports other modules only through the allowed seams', () => {
    for (const { file, imports } of parsed) {
      const cross = imports.filter((s) => s.startsWith('../') && !s.startsWith('../../'));
      const bad = cross.filter(
        (s) => !/^\.\.\/repo-intel\/types\.js$/.test(s) && !ALLOWED_CROSS_MODULE.some((re) => re.test(s)),
      );
      expect({ file, bad }).toEqual({ file, bad: [] });
    }
  });

  it('does not import an LLM SDK', () => {
    for (const { file, imports } of parsed) {
      const bad = imports.filter((s) => s === 'openai' || s.startsWith('openai/') || s.startsWith('@anthropic-ai/sdk'));
      expect({ file, bad }).toEqual({ file, bad: [] });
    }
  });

  it('imports fastify only in routes.ts', () => {
    for (const { file, imports } of parsed) {
      if (file === 'routes.ts') continue;
      const bad = imports.filter((s) => s === 'fastify' || s.startsWith('fastify/') || s.startsWith('@fastify/'));
      expect({ file, bad }).toEqual({ file, bad: [] });
    }
  });
});
