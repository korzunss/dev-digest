#!/usr/bin/env node
// Transitive import trace for server/ files: follows each import of the given files through
// the layers where a leak can hide (own module files, modules/_shared, @devdigest/shared,
// platform/* except the container) and reports every chain that ends on a layer the
// starting file may not reach. Catches what a one-file grep cannot:
//   - an adapter or db/schema reached through modules/_shared or a re-export,
//   - a concrete import re-exported by @devdigest/shared,
//   - dynamic `import()`, `require()` / `createRequire(...)(…)` and `import('x').T` types,
//   - a type imported from another module's types.ts that is one of that module's own
//     dependency ports (named in its `*ServiceDeps`), not something it provides.
//
//   node trace-imports.mjs <file|dir>... [--root <draft>] [--repo <repo>]
//
// Paths are relative to --root (default: the repo). --root overlays a draft laid out at repo
// paths on top of --repo: a file is read from the draft when it exists there, else from the
// repo. Parses with the TypeScript compiler from <repo>/server/node_modules. Exit 1 on hits.
// A hit is a lead: check it against "Known exceptions" in SKILL.md before you report it.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
let repo = opt('--repo');
if (!repo) {
  try { repo = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim(); }
  catch { repo = process.cwd(); }
}
repo = resolve(repo);
const root = resolve(opt('--root') ?? repo);
if (args.length === 0) {
  console.error('usage: trace-imports.mjs <file|dir>... [--root <draft>] [--repo <repo>]');
  process.exit(2);
}
const ts = createRequire(join(repo, 'server/package.json'))('typescript');

// ---- file system overlay (draft first, then repo), paths relative to the repo root ----
const abs = (rel) => (existsSync(join(root, rel)) ? join(root, rel) : join(repo, rel));
const exists = (rel) => existsSync(join(root, rel)) || existsSync(join(repo, rel));
const isFile = (rel) => exists(rel) && statSync(abs(rel)).isFile();

function resolveSpec(fromRel, spec) {
  if (spec === '@devdigest/shared') return 'server/src/vendor/shared/index.ts';
  if (spec.startsWith('@devdigest/shared/')) spec = join(relative(dirname(fromRel), 'server/src/vendor/shared'), spec.slice(18));
  if (!spec.startsWith('.')) return null;
  const base = join(dirname(fromRel), spec);
  const cands = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, join(base, 'index.ts')];
  return cands.find(isFile) ?? null;
}

// ---- layers ----
const SDK = /^(drizzle-orm|postgres|octokit|@octokit\/|simple-git|@anthropic-ai\/|openai|@slack\/|@ast-grep\/|@gitbeaker\/)/;
const DB_PKG = /^(drizzle-orm|postgres)/;
function layer(rel) {
  const s = rel.replace(/^server\/src\//, '');
  if (rel === s) return { kind: 'outside' };
  if (s === 'platform/container.ts') return { kind: 'root' };
  if (s.startsWith('adapters/')) return { kind: 'adapter' };
  if (/^db\/schema(\.ts|\/)/.test(s)) return { kind: 'schema' };
  if (s.startsWith('db/')) return { kind: 'db' };
  if (s.startsWith('vendor/shared/')) return { kind: 'shared' };
  if (s.startsWith('modules/_shared/')) return { kind: 'mshared' };
  const m = s.match(/^modules\/([^/]+)\/(.*)$/);
  if (m) {
    const repoFile = /^repository(\.ts|\/)|\.repo\.ts$/.test(m[2]);
    return { kind: 'module', mod: m[1], file: m[2], repoFile, routes: m[2] === 'routes.ts' };
  }
  if (s.startsWith('platform/')) return { kind: 'platform' };
  return { kind: 'other' };
}

// ---- import extraction ----
function importsOf(rel) {
  const text = readFileSync(abs(rel), 'utf8');
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out = [];
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const add = (node, spec, how, names = []) => out.push({ spec, how, line: line(node), names });
  const namesOf = (clause) => {
    const b = clause?.namedBindings;
    return b && ts.isNamedImports(b) ? b.elements.map((e) => (e.propertyName ?? e.name).text) : [];
  };
  const visit = (n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      add(n, n.moduleSpecifier.text, n.importClause?.isTypeOnly ? 'type' : 'import', namesOf(n.importClause));
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const names = n.exportClause && ts.isNamedExports(n.exportClause)
        ? n.exportClause.elements.map((e) => (e.propertyName ?? e.name).text) : [];
      add(n, n.moduleSpecifier.text, n.isTypeOnly ? 'type re-export' : 're-export', names);
    } else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) {
      add(n, n.argument.literal.text, 'type');
    } else if (ts.isCallExpression(n) && n.arguments.length >= 1 && ts.isStringLiteralLike(n.arguments[0])) {
      const callee = n.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) add(n, n.arguments[0].text, 'dynamic import');
      else if ((ts.isIdentifier(callee) && /require$/i.test(callee.text)) ||
               (ts.isCallExpression(callee) && /createRequire$/.test(callee.expression.getText(sf)))) {
        add(n, n.arguments[0].text, 'require');
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

// ---- consumer ports: what <mod>/types.ts declares for <mod>'s OWN dependencies ----
// The types named in <mod>'s `*ServiceDeps`, plus the types.ts declarations they reference.
// Another module may import what <mod> provides (its service interface, its result types),
// never these: they are shaped to <mod>'s needs and change with them.
const portCache = new Map();
function consumerPorts(mod) {
  if (portCache.has(mod)) return portCache.get(mod);
  const dir = `server/src/modules/${mod}`;
  const refsIn = (node, sf) => {
    const out = new Set();
    const walk = (x) => {
      if (ts.isTypeReferenceNode(x)) out.add(x.typeName.getText(sf).split('.')[0]);
      ts.forEachChild(x, walk);
    };
    walk(node);
    return out;
  };
  const parse = (rel) => ts.createSourceFile(rel, readFileSync(abs(rel), 'utf8'), ts.ScriptTarget.Latest, true);
  const decls = new Map();
  if (isFile(`${dir}/types.ts`)) {
    const sf = parse(`${dir}/types.ts`);
    for (const st of sf.statements) {
      if ((ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) && st.name) decls.set(st.name.text, refsIn(st, sf));
    }
  }
  const ports = new Set();
  for (const f of listTs(dir)) {
    const sf = parse(f);
    for (const st of sf.statements) {
      if ((ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) && /ServiceDeps$/.test(st.name.text)) {
        for (const r of refsIn(st, sf)) if (decls.has(r)) ports.add(r);
      }
    }
  }
  for (const queue = [...ports]; queue.length; ) {
    for (const r of decls.get(queue.pop()) ?? []) if (decls.has(r) && !ports.has(r)) { ports.add(r); queue.push(r); }
  }
  portCache.set(mod, ports);
  return ports;
}

// ---- rule for an edge, given where the chain started ----
function ruleFor(origin, edgeFile, target, spec, names = []) {
  const o = layer(origin);
  const e = layer(edgeFile);
  const t = target ? layer(target) : null;
  const sdk = !target && SDK.test(spec);
  if (e.kind === 'shared') {
    if (sdk || (t && t.kind !== 'shared')) return 'ports-are-vendor-neutral';
    return null;
  }
  if (o.kind === 'adapter') return t?.kind === 'module' ? 'adapters-dont-know-modules' : null;
  if (o.kind !== 'module' || o.repoFile) {
    if (o.kind === 'mshared' || o.kind === 'platform') {
      if (t?.kind === 'adapter') return 'services-depend-on-ports';
      if (t?.kind === 'schema' || (!target && DB_PKG.test(spec))) return 'db-confined-to-repositories';
    }
    return null;
  }
  if (t?.kind === 'schema' || (!target && DB_PKG.test(spec))) return 'db-confined-to-repositories';
  if (t?.kind === 'adapter' || sdk) return o.routes ? 'routes-are-thin' : 'services-depend-on-ports';
  if (t?.kind === 'module' && t.mod !== o.mod && !(t.file === 'types.ts')) return 'no-cross-module-internals';
  if (t?.kind === 'module' && t.mod !== o.mod && t.file === 'types.ts' && names.some((n) => consumerPorts(t.mod).has(n))) {
    return 'no-foreign-consumer-ports';
  }
  return null;
}
// layers a chain may pass through (where a leak hides); everything else ends the walk
function passThrough(origin, rel) {
  const o = layer(origin);
  const l = layer(rel);
  if (l.kind === 'mshared' || l.kind === 'shared' || l.kind === 'platform') return true;
  return l.kind === 'module' && o.kind === 'module' && l.mod === o.mod && !l.repoFile;
}

// ---- walk ----
const hits = new Map();
function trace(origin) {
  const seen = new Set([origin]);
  const queue = [{ file: origin, chain: [] }];
  while (queue.length) {
    const { file, chain } = queue.shift();
    if (chain.length > 8) continue;
    for (const imp of importsOf(file)) {
      const target = resolveSpec(file, imp.spec);
      const step = `${file}:${imp.line}${imp.how === 'import' ? '' : ` (${imp.how})`}`;
      const rule = ruleFor(origin, file, target, imp.spec, imp.names);
      if (rule) {
        const key = `${origin}|${file}:${imp.line}`;
        const to = rule === 'no-foreign-consumer-ports'
          ? `${target} { ${imp.names.filter((n) => consumerPorts(layer(target).mod).has(n)).join(', ')} }`
          : target ?? imp.spec;
        if (!hits.has(key)) hits.set(key, { origin, rule, chain: [...chain, step], to });
      }
      if (target && !seen.has(target) && passThrough(origin, target)) {
        seen.add(target);
        queue.push({ file: target, chain: [...chain, step] });
      }
    }
  }
}

function listTs(rel) {
  if (isFile(rel)) return rel.endsWith('.ts') && !rel.endsWith('.test.ts') ? [rel] : [];
  const out = new Set();
  for (const base of [join(root, rel), join(repo, rel)]) {
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) out.add(join(rel, name));
  }
  return [...out].flatMap(listTs);
}

const origins = [...new Set(args.map((a) => relative(root, resolve(root, a))).flatMap(listTs))];
for (const o of origins) trace(o);

// An edge inside another traced file is reported once, from that file, not again per chain.
const originSet = new Set(origins);
const byRule = new Map();
for (const h of hits.values()) {
  const edgeFile = h.chain[h.chain.length - 1].split(':')[0];
  if (h.chain.length > 1 && originSet.has(edgeFile)) continue;
  if (!byRule.has(h.rule)) byRule.set(h.rule, []);
  byRule.get(h.rule).push(h);
}
if (byRule.size === 0) console.log(`no transitive edge leaves its layer (${origins.length} files traced)`);
for (const [rule, list] of byRule) {
  console.log(`[${rule}]`);
  for (const h of list) console.log(`  ${h.chain.join(' → ')} → ${h.to}`);
}
process.exit(byRule.size ? 1 : 0);
