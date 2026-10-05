import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';

/**
 * Architecture invariants of `modules/onboarding/` (plan 26, D10 A). There is no
 * working depcruise gate, so the edges are asserted on the AST: imports, re-exports
 * and `import()` calls, each with its type-only flag. Comments never reach the AST,
 * so prose cannot trip a check (root INSIGHTS 2026-09-27). `violationsOf` is pure,
 * so every rule has a planted case below proving it can fail.
 */
const DIR = path.resolve(__dirname, '../src/modules/onboarding');
const MODULE_ROOT = 'modules/onboarding';

interface Edge {
  spec: string;
  typeOnly: boolean;
  /** Named bindings of an import/export clause; null for namespace, default or side-effect forms. */
  names: string[] | null;
  dynamic: boolean;
}

function edgesOf(relFile: string, source: string): Edge[] {
  const sf = ts.createSourceFile(relFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edges: Edge[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings : null;
      const typeOnly =
        !!clause &&
        (clause.isTypeOnly ||
          (!clause.name && named !== null && named.elements.length > 0 && named.elements.every((e) => e.isTypeOnly)));
      edges.push({
        spec: node.moduleSpecifier.text,
        typeOnly,
        names: named && !clause?.name ? named.elements.map((e) => (e.propertyName ?? e.name).text) : null,
        dynamic: false,
      });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const named = node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause : null;
      edges.push({
        spec: node.moduleSpecifier.text,
        typeOnly: node.isTypeOnly || (named !== null && named.elements.length > 0 && named.elements.every((e) => e.isTypeOnly)),
        names: named ? named.elements.map((e) => (e.propertyName ?? e.name).text) : null,
        dynamic: false,
      });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      edges.push({
        spec: arg && ts.isStringLiteralLike(arg) ? arg.text : '<non-literal>',
        typeOnly: false,
        names: null,
        dynamic: true,
      });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      edges.push({ spec: node.argument.literal.text, typeOnly: true, names: null, dynamic: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return edges;
}

/** `src/`-relative path without extension for a relative specifier; null for a package specifier. */
function resolveSpec(relFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const from = path.posix.dirname(relFile.split(path.sep).join('/'));
  return path.posix.normalize(path.posix.join(MODULE_ROOT, from, spec)).replace(/\.(js|ts)$/, '');
}

const ALLOWED_CROSS_MODULE: RegExp[] = [
  /^modules\/settings\/feature-models$/,
  /^modules\/repos\/constants$/,
  /^modules\/_shared\/[^/]+$/,
];
const TYPE_ONLY_CROSS_MODULE = /^modules\/repo-intel\/types$/;
const REVIEWER_CORE = '@devdigest/reviewer-core';
const REVIEWER_CORE_NAMES = new Set([
  'LlmDeadlineError',
  'LlmConnectionError',
  'LlmOutputInvalidError',
  'LlmOutputTruncatedError',
  'wrapUntrusted',
]);
const FS_SPECS = new Set(['fs', 'node:fs', 'fs/promises', 'node:fs/promises', 'child_process', 'node:child_process']);

/** Every violated rule for one file of the module; `relFile` is relative to `src/modules/onboarding/`. */
export function violationsOf(relFile: string, source: string): string[] {
  const base = path.posix.basename(relFile);
  const out: string[] = [];
  for (const e of edgesOf(relFile, source)) {
    const { spec } = e;
    const resolved = resolveSpec(relFile, spec);
    const tag = `${relFile}: ${spec}`;

    if (spec === '<non-literal>') out.push(`${tag} (dynamic import with a non-literal specifier)`);

    // 1. other modules only through the allow-list
    if (resolved !== null) {
      const m = /^modules\/([^/]+)\//.exec(resolved + '/');
      if (m && m[1] !== 'onboarding') {
        const ok = ALLOWED_CROSS_MODULE.some((re) => re.test(resolved)) || (TYPE_ONLY_CROSS_MODULE.test(resolved) && e.typeOnly);
        if (!ok) out.push(`${tag} (cross-module import outside the allow-list)`);
      }
      if (/^adapters(\/|$)/.test(resolved)) out.push(`${tag} (adapters)`);
      if (/^db\/schema(\/|$)/.test(resolved) && base !== 'repository.ts') out.push(`${tag} (db/schema outside repository.ts)`);
      if (/^modules\/repo-intel\/(pipeline|repository)(\/|$)/.test(resolved)) out.push(`${tag} (repo-intel internals)`);
    }

    // 2. reviewer-core: named imports of a fixed set only
    if (spec === REVIEWER_CORE || spec.startsWith(`${REVIEWER_CORE}/`)) {
      const ok = spec === REVIEWER_CORE && !e.dynamic && e.names !== null && e.names.every((n) => REVIEWER_CORE_NAMES.has(n));
      if (!ok) out.push(`${tag} (reviewer-core beyond the named allow-list)`);
    }

    // 3. file-system and process access only in facts.ts
    if (FS_SPECS.has(spec) && base !== 'facts.ts') out.push(`${tag} (fs/child_process outside facts.ts)`);

    // 4. the original rules
    if (spec === 'drizzle-orm' || spec.startsWith('drizzle-orm/')) {
      if (base !== 'repository.ts') out.push(`${tag} (drizzle outside repository.ts)`);
    }
    if (spec === 'openai' || spec.startsWith('openai/') || spec.startsWith('@anthropic-ai/sdk')) out.push(`${tag} (LLM SDK)`);
    if (spec === 'fastify' || spec.startsWith('fastify/') || spec.startsWith('@fastify/')) {
      if (base !== 'routes.ts') out.push(`${tag} (fastify outside routes.ts)`);
    }
  }
  return out;
}

/** Every `.ts` file under `dir`, recursively, as POSIX paths relative to `dir`. */
function listTsFiles(dir: string, prefix = ''): string[] {
  return readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap((e) => {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) return listTsFiles(dir, rel);
    return e.name.endsWith('.ts') ? [rel] : [];
  });
}

const files = listTsFiles(DIR);

describe('onboarding module architecture', () => {
  it('sees the module files', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('service.ts');
  });

  it('has no violated rule in any file of the real module', () => {
    for (const file of files) {
      expect({ file, violations: violationsOf(file, readFileSync(path.join(DIR, file), 'utf8')) }).toEqual({
        file,
        violations: [],
      });
    }
  });
});

describe('the invariant rules catch a planted violation', () => {
  const planted: Array<[string, string, string]> = [
    ['a value import of repo-intel/types', 'service.ts', "import { x } from '../repo-intel/types.js';"],
    ['a mixed import (one value specifier) of repo-intel/types', 'service.ts', "import { type A, b } from '../repo-intel/types.js';"],
    ['another module', 'service.ts', "import { s } from '../agents/service.js';"],
    ['another module through ../../modules/', 'service.ts', "import { h } from '../../modules/agents/helpers.js';"],
    ['another module from a nested file', 'nested/deep.ts', "import { s } from '../../agents/service.js';"],
    ['a re-export from another module', 'service.ts', "export { s } from '../agents/service.js';"],
    ['a dynamic import of another module', 'service.ts', "const m = await import('../agents/service.js');"],
    ['a namespace import of reviewer-core', 'prompt.ts', "import * as rc from '@devdigest/reviewer-core';"],
    ['a default import of reviewer-core', 'prompt.ts', "import rc from '@devdigest/reviewer-core';"],
    ['a named import outside the reviewer-core allow-list', 'prompt.ts', "import { runReview } from '@devdigest/reviewer-core';"],
    ['node:child_process in service.ts', 'service.ts', "import { exec } from 'node:child_process';"],
    ['fs/promises in helpers.ts', 'helpers.ts', "import { readFile } from 'fs/promises';"],
    ['an adapter', 'service.ts', "import { A } from '../../adapters/git/simple-git.js';"],
    ['db/schema outside repository.ts', 'service.ts', "import * as t from '../../db/schema.js';"],
    ['drizzle-orm outside repository.ts', 'helpers.ts', "import { eq } from 'drizzle-orm';"],
    ['repo-intel pipeline', 'service.ts', "import { p } from '../repo-intel/pipeline/run.js';"],
    ['an LLM SDK', 'service.ts', "import OpenAI from 'openai';"],
    ['fastify outside routes.ts', 'service.ts', "import Fastify from 'fastify';"],
  ];

  it.each(planted)('catches %s', (_name, file, source) => {
    expect(violationsOf(file, source)).not.toEqual([]);
  });

  it('accepts the allowed seams', () => {
    const ok = [
      "import { r } from '../settings/feature-models.js';",
      "import { c } from '../repos/constants.js';",
      "import { ctx } from '../_shared/context.js';",
      "import type { IndexState } from '../repo-intel/types.js';",
      "import { type IndexState } from '../repo-intel/types.js';",
      "import { LlmDeadlineError, wrapUntrusted } from '@devdigest/reviewer-core';",
      "import { readFile } from 'node:fs/promises';",
      "import { helper } from './helpers.js';",
    ];
    expect(violationsOf('facts.ts', ok.join('\n'))).toEqual([]);
  });

  it('ignores an import that appears only inside a comment', () => {
    const src = [
      "/* import { s } from '../agents/service.js'; */",
      "// import * as rc from '@devdigest/reviewer-core';",
      "const text = \"import x from '../agents/service.js'\";",
    ].join('\n');
    expect(violationsOf('service.ts', src)).toEqual([]);
  });

  describe('the recursive walk', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'devdigest-onb-arch-'));
    afterAll(() => rmSync(tmp, { recursive: true, force: true }));

    it('finds a file in a nested folder', () => {
      mkdirSync(path.join(tmp, 'nested', 'deeper'), { recursive: true });
      writeFileSync(path.join(tmp, 'top.ts'), '');
      writeFileSync(path.join(tmp, 'nested', 'deeper', 'x.ts'), '');
      writeFileSync(path.join(tmp, 'nested', 'note.md'), '');
      expect(listTsFiles(tmp).sort()).toEqual(['nested/deeper/x.ts', 'top.ts']);
    });
  });
});
