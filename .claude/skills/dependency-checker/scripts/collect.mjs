#!/usr/bin/env node
// collect.mjs — gathers every dependency FACT for the dependency-checker skill and writes
// deps.json. No opinions beyond the rule table in RULES; no network unless --online.
//
//   node collect.mjs [--root <repo>] [--out <file>] [--online] [--packages a,b]
//
// Facts come from package.json, the lock file name, the installed node_modules tree
// (resolved the way Node resolves, so pnpm and npm layouts both work), tsconfig `paths`,
// and a scan of import specifiers in each package's source. Sizes are apparent bytes
// (sum of file sizes), not disk blocks: pnpm hard-links from its store, so `du` would
// count shared files differently per run.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { builtinModules } from 'node:module';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
// Real path: resolution walks up from realpaths (pnpm symlinks, macOS /var → /private/var).
const ROOT = fs.realpathSync(path.resolve(args.root ?? process.cwd()));
const OUT = path.resolve(args.out ?? path.join(ROOT, '.devdigest/cache/deps.json'));
const ONLINE = Boolean(args.online);

// Folders never treated as a package or scanned as source. `clones/` holds full copies of
// other repos (and of this one) — scanning it would invent findings.
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.next', 'out', 'coverage', 'clones', '.turbo',
  'test-results', 'playwright-report', '.git', '.pnpm-store', 'fixtures',
]);
const SRC_EXT = /\.(?:[cm]?[jt]sx?)$/;
const CSS_EXT = /\.css$/;
const TEST_FILE = /(?:\.(?:it\.)?test\.|\.spec\.|(?:^|\/)(?:tests?|__tests__|test-utils?)\/|vitest\.setup|setup-?tests)/;
const CONFIG_FILE = /(?:^|\/)[^/]*\.config\.[cm]?[jt]s$|(?:^|\/)scripts\//;
const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));

// Dependency category, first match wins. Deterministic so two runs classify alike;
// anything unmatched is `other` and the report says so rather than guessing.
const CATEGORIES = [
  ['types', [/^@types\//]],
  ['testing', [/^vitest$/, /^@vitest\//, /^jest/, /^@testing-library\//, /^jsdom$/, /^happy-dom$/, /playwright/, /testcontainers/, /^supertest$/, /^msw$/]],
  ['build-tooling', [/^typescript$/, /^tsx$/, /^ts-node$/, /^esbuild$/, /^vite$/, /^@vitejs\//, /^webpack/, /^rollup/, /^postcss/, /^tailwindcss$/, /^@tailwindcss\//, /eslint/, /^prettier/, /^drizzle-kit$/, /^dependency-cruiser$/, /^pino-pretty$/, /^gray-matter$/, /^autoprefixer$/]],
  ['framework', [/^next$/, /^next-/, /^react$/, /^react-dom$/, /^fastify$/, /^@fastify\//, /^fastify-/, /^express$/]],
  ['database', [/^drizzle-orm$/, /^postgres$/, /^pg$/, /^pgvector$/, /^kysely$/, /^@prisma\//, /^prisma$/]],
  ['ai-llm', [/^openai$/, /^@anthropic-ai\//, /^ai$/, /^@ai-sdk\//, /tiktoken/, /^@modelcontextprotocol\//]],
  ['vcs-code-analysis', [/^octokit$/, /^@octokit\//, /^simple-git$/, /^@vscode\/ripgrep$/, /^@ast-grep\//, /^graphology/, /^diff$/, /^picomatch$/]],
  ['validation', [/^zod$/, /^yup$/, /^ajv/, /^valibot$/]],
  ['ui', [/^lucide-react$/, /^recharts$/, /^mermaid$/, /^react-markdown$/, /^remark-/, /^rehype-/, /^@tanstack\//, /^clsx$/, /^framer-motion$/]],
];
const TOOLING = new Set(['types', 'testing', 'build-tooling']);

// Libraries whose types cross a package boundary through the vendored shared contracts:
// a version split here is a contract risk, not just hygiene.
const CONTRACT_LIBS = new Set(['zod', 'typescript']);

const MB = 1024 * 1024;
const HEAVY_UNUSED_BYTES = 5 * MB;
const HEAVY_BYTES = 50 * MB;
const DUP_WASTE_BYTES = 5 * MB;


function main() {
  const t0 = Date.now();
  const pkgDirs = discoverPackages();
  const packages = pkgDirs.map(analysePackage);
  const byName = Object.fromEntries(packages.map((p) => [p.name, p]));
  const edges = [
    ...packages.flatMap((p) => p.internal.aliasEdges),
    ...packages.flatMap((p) => p.internal.relativeEdges),
    ...vendoredEdges(packages),
    ...runtimeEdges(byName),
  ];
  const drift = versionDrift(packages);
  if (ONLINE) packages.forEach(online);
  const findings = numberFindings([
    ...packages.flatMap(packageFindings),
    ...drift.flatMap(driftFindings),
    ...edges.filter((e) => e.kind === 'vendored-copy' && e.drift).map(vendorDriftFinding),
    ...edges.filter((e) => e.kind === 'relative-import').map(relativeImportFinding),
  ]);
  const data = {
    generatedAt: new Date().toISOString(),
    commit: git('rev-parse --short HEAD'),
    branch: git('rev-parse --abbrev-ref HEAD'),
    dirty: Boolean(git('status --porcelain -- . ":!**/node_modules"')),
    root: ROOT,
    mode: ONLINE ? 'online' : 'offline',
    tierRules: RULES,
    packages: packages.map(stripInternal),
    edges,
    drift,
    findings,
    durationMs: Date.now() - t0,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
  const tiers = countBy(findings, (f) => f.tier);
  console.log(`deps.json → ${path.relative(ROOT, OUT) || OUT}`);
  console.log(`packages: ${packages.map((p) => p.name).join(', ')}`);
  console.log(`findings: ${['P0', 'P1', 'P2', 'Info'].map((t) => `${t}=${tiers[t] ?? 0}`).join(' ')}  (${data.durationMs} ms, ${data.mode})`);
}

// ─── discovery ──────────────────────────────────────────────────────────────────────────

function discoverPackages() {
  const only = args.packages ? new Set(String(args.packages).split(',')) : null;
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !SKIP_DIRS.has(d.name))
    .filter((d) => fs.existsSync(path.join(ROOT, d.name, 'package.json')))
    .filter((d) => !only || only.has(d.name))
    .map((d) => path.join(ROOT, d.name))
    .sort();
}

function analysePackage(dir) {
  const name = path.basename(dir);
  const manifest = readJson(path.join(dir, 'package.json')) ?? {};
  const lockfiles = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'npm-shrinkwrap.json']
    .filter((f) => fs.existsSync(path.join(dir, f)));
  const manager = lockfiles[0]?.startsWith('pnpm') ? 'pnpm' : lockfiles[0]?.startsWith('yarn') ? 'yarn'
    : lockfiles.length ? 'npm' : (manifest.packageManager?.split('@')[0] ?? 'unknown');
  const hasNodeModules = fs.existsSync(path.join(dir, 'node_modules'));

  const kinds = [['prod', 'dependencies'], ['dev', 'devDependencies'], ['peer', 'peerDependencies'], ['optional', 'optionalDependencies']];
  const declared = [];
  for (const [kind, field] of kinds) {
    for (const [dep, range] of Object.entries(manifest[field] ?? {})) declared.push({ name: dep, kind, range });
  }

  const graph = new Graph();
  for (const d of declared) {
    const real = resolveFrom(dir, d.name);
    d.installed = Boolean(real);
    if (!real) continue;
    d.version = readJson(path.join(real, 'package.json'))?.version ?? null;
    d.node = real;
    d.category = categorize(d.name);
    graph.walk(real);
  }

  // Closure sizes: own, total (with transitive), exclusive (freed if this one dep is removed).
  const installedDeps = declared.filter((d) => d.node);
  const closures = new Map(installedDeps.map((d) => [d, graph.closure(d.node)]));
  const refCount = new Map();
  for (const set of closures.values()) for (const n of set) refCount.set(n, (refCount.get(n) ?? 0) + 1);
  for (const d of installedDeps) {
    const set = closures.get(d);
    d.ownBytes = graph.size(d.node);
    d.closureBytes = sum([...set].map((n) => graph.size(n)));
    d.exclusiveBytes = sum([...set].filter((n) => refCount.get(n) === 1).map((n) => graph.size(n)));
    d.transitiveCount = set.size - 1;
  }
  const union = (pred) => new Set(installedDeps.filter(pred).flatMap((d) => [...closures.get(d)]));
  const all = union(() => true);
  const prod = union((d) => d.kind === 'prod' || d.kind === 'optional');

  const tsPaths = readTsPaths(dir);
  const peerOf = new Map();
  for (const d of installedDeps) for (const peer of graph.nodes.get(d.node).peers) {
    if (!peerOf.has(peer)) peerOf.set(peer, []);
    peerOf.get(peer).push(d.name);
  }
  const usage = scanUsage(dir, name, declared, manifest, tsPaths, peerOf);
  const internal = internalEdges(dir, name, tsPaths, usage.relativeOut);

  return {
    name, dir, manifest, manager, lockfiles, hasNodeModules, declared, usage, internal,
    startScript: manifest.scripts?.start ?? null,
    totals: {
      direct: countBy(declared, (d) => d.kind),
      uniqueInstalled: all.size,
      installedBytes: sum([...all].map((n) => graph.size(n))),
      prodClosureBytes: sum([...prod].map((n) => graph.size(n))),
      byCategory: categoryTotals(installedDeps, closures, graph),
    },
    duplicates: graph.duplicates(all),
    online: null,
  };
}

function categoryTotals(deps, closures, graph) {
  // A shared transitive node counts once, under the first category that reaches it.
  const seen = new Set();
  const out = {};
  for (const d of [...deps].sort((a, b) => b.closureBytes - a.closureBytes)) {
    let bytes = 0;
    for (const n of closures.get(d)) if (!seen.has(n)) { seen.add(n); bytes += graph.size(n); }
    out[d.category] = (out[d.category] ?? 0) + bytes;
  }
  return out;
}

// ─── installed tree ─────────────────────────────────────────────────────────────────────

class Graph {
  constructor() { this.nodes = new Map(); }
  walk(real) {
    if (this.nodes.has(real)) return;
    const pj = readJson(path.join(real, 'package.json')) ?? {};
    const node = { name: pj.name ?? path.basename(real), version: pj.version ?? '?', children: [], bytes: null };
    this.nodes.set(real, node);
    const wanted = { ...pj.dependencies, ...pj.optionalDependencies };
    for (const child of Object.keys(wanted)) {
      const r = resolveFrom(real, child);
      if (r) { node.children.push(r); this.walk(r); }
    }
    // Peers are NOT walked: the consumer declares and pays for them, so counting them here
    // would bill `next` to `next-intl`. They are recorded to explain "unused" direct deps.
    node.peers = Object.keys(pj.peerDependencies ?? {});
  }
  closure(start) {
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) for (const c of this.nodes.get(stack.pop())?.children ?? []) if (!seen.has(c)) { seen.add(c); stack.push(c); }
    return seen;
  }
  size(real) {
    const n = this.nodes.get(real);
    if (n.bytes === null) n.bytes = dirBytes(real);
    return n.bytes;
  }
  duplicates(set) {
    const byName = new Map();
    for (const r of set) {
      const n = this.nodes.get(r);
      if (!byName.has(n.name)) byName.set(n.name, new Map());
      byName.get(n.name).set(n.version, (byName.get(n.name).get(n.version) ?? 0) + this.size(r));
    }
    return [...byName].filter(([, v]) => v.size > 1).map(([name, v]) => {
      const versions = [...v].map(([version, bytes]) => ({ version, bytes })).sort((a, b) => b.bytes - a.bytes);
      return { name, versions, wasteBytes: sum(versions.slice(1).map((x) => x.bytes)) };
    }).sort((a, b) => b.wasteBytes - a.wasteBytes);
  }
}

// Node's lookup: from `from`, try <ancestor>/node_modules/<name> for every ancestor that
// is not itself a node_modules folder. Works for pnpm's .pnpm/<id>/node_modules layout too.
function resolveFrom(from, name) {
  let dir = from;
  while (true) {
    if (path.basename(dir) !== 'node_modules') {
      const cand = path.join(dir, 'node_modules', name);
      if (fs.existsSync(path.join(cand, 'package.json'))) return fs.realpathSync(cand);
    }
    const up = path.dirname(dir);
    if (up === dir || !up.startsWith(ROOT)) return null;
    dir = up;
  }
}

function dirBytes(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') stack.push(p); }
      else if (e.isFile()) { try { total += fs.statSync(p).size; } catch { /* vanished */ } }
    }
  }
  return total;
}

// ─── source usage ───────────────────────────────────────────────────────────────────────

function sourceFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') && e.name !== '.storybook') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) stack.push(p); continue; }
      if (!e.isFile()) continue;
      const isTsconfig = /^tsconfig.*\.json$/.test(e.name);
      if (SRC_EXT.test(e.name) || CSS_EXT.test(e.name) || isTsconfig) {
        if (fs.statSync(p).size < 1_000_000) out.push(p);
      }
    }
  }
  return out.sort();
}

const IMPORT_RES = [
  /\bfrom\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\bimport\s+['"]([^'"\n]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\brequire\.resolve\s*\(\s*['"]([^'"\n]+)['"]/g,
  /@(?:import|plugin|reference)\s+['"]([^'"\n]+)['"]/g, // CSS (tailwind v4)
  /\/\/\/\s*<reference\s+types=["']([^"']+)["']/g,
];

function scanUsage(dir, pkgName, declared, manifest, tsPaths, peerOf) {
  const names = new Set(declared.map((d) => d.name));
  const imports = new Map(); // dep → [{file,line,test}]
  const strings = new Map(); // dep → [{file,line}]
  const undeclared = new Map();
  const relativeOut = [];
  const files = sourceFiles(dir);
  for (const file of files) {
    const rel = path.relative(dir, file);
    const text = fs.readFileSync(file, 'utf8');
    const lineAt = lineIndexer(text);
    const isTest = TEST_FILE.test(rel);
    const isConfig = CONFIG_FILE.test(rel) || /^tsconfig/.test(path.basename(rel));
    for (const re of IMPORT_RES) {
      for (const m of text.matchAll(re)) {
        const spec = m[1];
        const line = lineAt(m.index);
        if (spec.startsWith('.') || spec.startsWith('/')) {
          const target = path.resolve(path.dirname(file), spec);
          if (!target.startsWith(dir + path.sep) && target.startsWith(ROOT + path.sep) && existsAsModule(target)) {
            relativeOut.push({ file: rel, line, spec, target: path.relative(ROOT, target), test: isTest });
          }
          continue;
        }
        if (BUILTINS.has(spec) || BUILTINS.has(spec.split('/')[0])) { push(imports, '#builtin', { file: rel, line }); continue; }
        if (matchesAlias(spec, tsPaths)) continue;
        const dep = packageOf(spec);
        if (!dep || dep === manifest.name) continue;
        const site = { file: rel, line, test: isTest, config: isConfig };
        if (names.has(dep)) push(imports, dep, site);
        else push(undeclared, dep, site);
      }
    }
    // A dependency named as a bare string (vitest `environment: 'jsdom'`, pino `target:`,
    // postcss plugin keys, tsconfig `types`) is still a use.
    for (const dep of names) {
      if (imports.has(dep)) continue;
      const re = new RegExp(`['"\`]${escapeRe(dep)}(?:/[^'"\`]*)?['"\`]`);
      const m = re.exec(text);
      if (m) push(strings, dep, { file: rel, line: lineAt(m.index), test: isTest, config: isConfig });
    }
  }

  const scripts = Object.entries(manifest.scripts ?? {});
  const result = {};
  for (const d of declared) {
    const bins = d.node ? binNames(d.node, d.name) : [d.name];
    const binUse = scripts.filter(([, cmd]) => bins.some((b) => new RegExp(`(?:^|[\\s;&|(/])${escapeRe(b)}(?:$|[\\s;&|)])`).test(cmd))).map(([s]) => s);
    const typesFor = d.name.startsWith('@types/') ? typesTarget(d.name) : null;
    const typesUsed = typesFor && (typesFor === 'node' ? true : imports.has(typesFor) || names.has(typesFor) || BUILTINS.has(typesFor));
    const sites = imports.get(d.name) ?? [];
    const strSites = strings.get(d.name) ?? [];
    const how = sites.length ? 'import' : binUse.length ? 'script' : strSites.length ? 'string-ref' : typesUsed ? 'types' : peerOf.has(d.name) ? 'peer-of' : 'none';
    const allSites = [...sites, ...strSites];
    result[d.name] = {
      how,
      importSites: sites.length,
      runtimeSites: allSites.filter((s) => !s.test && !s.config).length,
      runtimeImportSites: sites.filter((s) => !s.test && !s.config).length,
      scripts: binUse,
      evidence: how === 'peer-of' ? [`peer of ${peerOf.get(d.name).join(', ')}`] : (sites.length ? sites : strSites).slice(0, 3).map((s) => `${s.file}:${s.line}`),
    };
  }
  return {
    filesScanned: files.length,
    deps: result,
    undeclared: [...undeclared].map(([dep, sites]) => ({
      dep,
      runtime: sites.some((s) => !s.test && !s.config),
      resolvesTo: resolveFrom(dir, dep) ? 'hoisted-transitive' : 'unresolved',
      evidence: sites.slice(0, 3).map((s) => `${s.file}:${s.line}`),
      sites: sites.length,
    })),
    relativeOut,
  };
}

// A relative specifier that names no file is text inside a string or a fixture, not an edge.
function existsAsModule(target) {
  const bases = [target, target.replace(/\.[cm]?js$/, '')];
  const exts = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs', '/index.ts', '/index.js'];
  return bases.some((b) => exts.some((e) => { try { return fs.statSync(b + e).isFile(); } catch { return false; } }));
}

function binNames(real, name) {
  const pj = readJson(path.join(real, 'package.json')) ?? {};
  if (typeof pj.bin === 'string') return [name.split('/').pop()];
  return Object.keys(pj.bin ?? {});
}

function typesTarget(typesName) {
  const t = typesName.slice('@types/'.length);
  return t.includes('__') ? `@${t.replace('__', '/')}` : t;
}

const NPM_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(?:\/[^\s]*)?$/;

function packageOf(spec) {
  if (!NPM_NAME.test(spec)) return null; // prose inside a string ("from 'it was pulled…'")
  const parts = spec.split('/');
  return spec.startsWith('@') ? (parts.length > 1 ? `${parts[0]}/${parts[1]}` : null) : parts[0];
}

// ─── internal (cross-package) edges ─────────────────────────────────────────────────────

function readTsPaths(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter((n) => /^tsconfig.*\.json$/.test(n))) {
    const cfg = readJsonc(path.join(dir, f));
    const base = path.resolve(dir, cfg?.compilerOptions?.baseUrl ?? '.');
    for (const [alias, targets] of Object.entries(cfg?.compilerOptions?.paths ?? {})) {
      for (const t of targets) out.push({ alias, target: path.resolve(base, t), file: f });
    }
  }
  return out;
}

function matchesAlias(spec, tsPaths) {
  return tsPaths.some(({ alias }) => alias.endsWith('*') ? spec.startsWith(alias.slice(0, -1)) : spec === alias);
}

function internalEdges(dir, name, tsPaths, relativeOut) {
  const aliasEdges = [];
  const seen = new Set();
  for (const { alias, target, file } of tsPaths) {
    const relTarget = path.relative(ROOT, target);
    const toPkg = relTarget.split(path.sep)[0];
    if (target.startsWith(dir + path.sep) || relTarget.startsWith('..')) continue; // own code or outside repo
    const key = `${toPkg}|${alias.replace(/\/\*$/, '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    aliasEdges.push({ kind: 'alias', from: name, to: toPkg, label: alias.replace(/\/\*$/, ''), target: relTarget.replace(/\/\*$/, ''), evidence: `${name}/${file}` });
  }
  const relativeEdges = [];
  const byTarget = new Map();
  for (const r of relativeOut) {
    const toPkg = r.target.split(path.sep)[0];
    const k = toPkg;
    if (!byTarget.has(k)) byTarget.set(k, []);
    byTarget.get(k).push(r);
  }
  for (const [toPkg, sites] of byTarget) {
    if (!fs.existsSync(path.join(ROOT, toPkg, 'package.json'))) continue; // not another package
    relativeEdges.push({ kind: 'relative-import', from: name, to: toPkg, label: 'relative import', sites: sites.length, testOnly: sites.every((s) => s.test), evidence: sites.slice(0, 3).map((s) => `${name}/${s.file}:${s.line} → ${s.spec}`) });
  }
  return { aliasEdges, relativeEdges };
}

function vendoredEdges(packages) {
  // Same-named src/vendor/<x> folders in two packages are copies of one source.
  const vendors = new Map();
  for (const p of packages) {
    const vdir = path.join(p.dir, 'src', 'vendor');
    if (!fs.existsSync(vdir)) continue;
    for (const v of fs.readdirSync(vdir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      if (!vendors.has(v.name)) vendors.set(v.name, []);
      vendors.get(v.name).push({ pkg: p.name, dir: path.join(vdir, v.name) });
    }
  }
  const edges = [];
  for (const [vname, copies] of vendors) {
    for (let i = 1; i < copies.length; i++) {
      const a = hashTree(copies[0].dir);
      const b = hashTree(copies[i].dir);
      const onlyA = [...a.keys()].filter((k) => !b.has(k));
      const onlyB = [...b.keys()].filter((k) => !a.has(k));
      const differ = [...a.keys()].filter((k) => b.has(k) && a.get(k) !== b.get(k));
      const drift = onlyA.length + onlyB.length + differ.length;
      edges.push({
        kind: 'vendored-copy', from: copies[i].pkg, to: copies[0].pkg, label: `vendored ${vname}`,
        drift, files: a.size,
        evidence: [
          ...differ.slice(0, 3).map((f) => `differs: ${f}`),
          ...onlyA.slice(0, 2).map((f) => `only in ${copies[0].pkg}: ${f}`),
          ...onlyB.slice(0, 2).map((f) => `only in ${copies[i].pkg}: ${f}`),
        ],
        counts: { differ: differ.length, onlyIn: { [copies[0].pkg]: onlyA.length, [copies[i].pkg]: onlyB.length } },
      });
    }
  }
  return edges;
}

function runtimeEdges(byName) {
  // Runtime (HTTP) edges are not visible in imports; they are declared in
  // references/runtime-edges.json and each is re-checked against its evidence file.
  const decl = readJson(path.join(HERE, '..', 'references', 'runtime-edges.json')) ?? [];
  return decl.filter((e) => byName[e.from] && byName[e.to]).map((e) => {
    const file = path.join(ROOT, e.evidence.file);
    const verified = fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(e.evidence.contains);
    return { kind: 'runtime', from: e.from, to: e.to, label: e.label, verified, evidence: `${e.evidence.file} contains "${e.evidence.contains}"` };
  });
}

function hashTree(dir) {
  const out = new Map();
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) out.set(path.relative(dir, p), crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex'));
    }
  }
  return out;
}

// ─── cross-package version drift ────────────────────────────────────────────────────────

function versionDrift(packages) {
  const byDep = new Map();
  for (const p of packages) for (const d of p.declared) {
    if (!byDep.has(d.name)) byDep.set(d.name, []);
    byDep.get(d.name).push({ pkg: p.name, range: d.range, version: d.version ?? null, kind: d.kind });
  }
  return [...byDep].filter(([, uses]) => uses.length > 1).map(([dep, uses]) => {
    const versions = [...new Set(uses.map((u) => u.version ?? `range ${u.range}`))];
    const installed = uses.filter((u) => u.version).map((u) => u.version);
    const distinct = (n) => new Set(installed.map((v) => v.split('.').slice(0, n).join('.'))).size;
    // A patch-only split (22.19.19 vs 22.19.20) is lock-file timing, not drift.
    const level = distinct(1) > 1 ? 'major' : distinct(2) > 1 ? 'minor' : distinct(3) > 1 ? 'patch' : 'aligned';
    return { dep, uses, versions, level, contract: CONTRACT_LIBS.has(dep) };
  }).sort((a, b) => a.dep.localeCompare(b.dep));
}

// ─── online (outdated + audit) ──────────────────────────────────────────────────────────

function online(p) {
  const run = (cmd, argv) => {
    const r = spawnSync(cmd, argv, { cwd: p.dir, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * MB });
    // outdated/audit exit non-zero when they FIND something; only unparsable output is an error.
    try { return { json: JSON.parse(r.stdout || '{}') }; } catch { return { error: (r.stderr || r.error?.message || 'no output').trim().slice(0, 300) }; }
  };
  const mgr = p.manager === 'pnpm' ? 'pnpm' : 'npm';
  const outdatedRaw = mgr === 'pnpm' ? run('pnpm', ['outdated', '--format', 'json']) : run('npm', ['outdated', '--json']);
  const auditRaw = run(mgr, ['audit', '--json']);
  const outdated = outdatedRaw.json ? Object.entries(outdatedRaw.json).map(([dep, v]) => ({
    dep, current: v.current ?? null, wanted: v.wanted ?? null, latest: v.latest ?? null,
    behind: v.current && v.latest ? (major(v.latest) > major(v.current) ? 'major' : v.latest !== v.current ? 'minor' : 'none') : 'unknown',
    deprecated: Boolean(v.isDeprecated),
  })) : [];
  const vulns = [];
  if (auditRaw.json?.advisories) { // pnpm / npm v6 shape
    for (const a of Object.values(auditRaw.json.advisories)) vulns.push({ dep: a.module_name, severity: a.severity, title: a.title, url: a.url, range: a.vulnerable_versions });
  } else if (auditRaw.json?.vulnerabilities) { // npm v7+ shape
    for (const [dep, v] of Object.entries(auditRaw.json.vulnerabilities)) {
      const adv = (v.via ?? []).find((x) => typeof x === 'object');
      vulns.push({ dep, severity: v.severity, title: adv?.title ?? `via ${(v.via ?? []).join(', ')}`, url: adv?.url ?? null, range: v.range });
    }
  }
  p.online = { outdated, vulns, errors: [outdatedRaw.error, auditRaw.error].filter(Boolean) };
}

// ─── findings ───────────────────────────────────────────────────────────────────────────

// rule → default tier. The report may move a finding ONE tier, with the reason written down.
const RULES = {
  'vulnerability-high': 'P0',
  'lockfile-conflict': 'P0',
  'undeclared-runtime-import': 'P1',
  'dev-dep-in-runtime-code': 'P1',
  'cross-package-relative-import': 'P1',
  'cross-package-relative-import-test': 'P2',
  'vendored-copy-drift': 'P1',
  'version-drift-major': 'P1',
  'loose-range': 'P1',
  'lockfile-missing': 'P1',
  'unused-dependency-heavy': 'P1',
  'unused-dependency': 'P2',
  'tooling-in-prod': 'P2',
  'undeclared-test-import': 'P2',
  'contract-lib-drift': 'P2',
  'duplicate-versions': 'P2',
  'outdated-major': 'P2',
  'vulnerability-moderate': 'P2',
  'version-drift-minor': 'Info',
  'heavy-dependency': 'Info',
  'not-installed': 'Info',
  'unresolved-specifier': 'Info',
  'vulnerability-low': 'Info',
  'deprecated': 'P2',
};

function finding(rule, pkg, dep, summary, evidence, facts = {}) {
  return { rule, tier: RULES[rule], package: pkg, dependency: dep, summary, evidence: [].concat(evidence).filter(Boolean), facts };
}

function packageFindings(p) {
  const out = [];
  if (p.lockfiles.length > 1) out.push(finding('lockfile-conflict', p.name, null, `${p.lockfiles.length} lock files side by side`, p.lockfiles.map((f) => `${p.name}/${f}`)));
  if (!p.lockfiles.length) out.push(finding('lockfile-missing', p.name, null, 'no lock file — installs are not reproducible', `${p.name}/package.json`));
  if (!p.hasNodeModules) out.push(finding('not-installed', p.name, null, 'node_modules missing — sizes and the tree are unknown for this package', `${p.name}/`, { install: `${p.manager} install` }));

  for (const d of p.declared) {
    const u = p.usage.deps[d.name];
    const ev = [`${p.name}/package.json → ${d.kind} ${d.name}@${d.range}`];
    if (/^(\*|latest|x|)$|^>=?/.test(d.range.trim())) out.push(finding('loose-range', p.name, d.name, `range "${d.range}" accepts any future release`, ev));
    if (!d.installed && p.hasNodeModules && d.kind !== 'peer') out.push(finding('not-installed', p.name, d.name, 'declared but not in node_modules', ev));
    if (u.how === 'none' && d.kind !== 'peer') {
      const heavy = (d.exclusiveBytes ?? 0) >= HEAVY_UNUSED_BYTES && d.kind !== 'dev';
      out.push(finding(heavy ? 'unused-dependency-heavy' : 'unused-dependency', p.name, d.name,
        `no import, script, string reference or @types target found in ${p.usage.filesScanned} files`, ev,
        { kind: d.kind, exclusiveBytes: d.exclusiveBytes ?? null, confidence: 'candidate' }));
    }
    if (d.kind === 'prod' && d.category && TOOLING.has(d.category) && u.runtimeSites === 0 && !u.scripts.includes('start')) {
      out.push(finding('tooling-in-prod', p.name, d.name, `${d.category} package in dependencies with no runtime use`, [...ev, ...u.evidence], { category: d.category }));
    }
    if (d.kind === 'dev' && p.startScript && !/\bnext\b/.test(p.startScript) && u.runtimeImportSites > 0) {
      out.push(finding('dev-dep-in-runtime-code', p.name, d.name, `devDependency imported by runtime code of a package started with \`${p.startScript}\``, [...ev, ...u.evidence]));
    }
    if ((d.closureBytes ?? 0) >= HEAVY_BYTES) out.push(finding('heavy-dependency', p.name, d.name, `${fmt(d.closureBytes)} with ${d.transitiveCount} transitive packages`, ev, { closureBytes: d.closureBytes, exclusiveBytes: d.exclusiveBytes }));
  }
  // An undeclared import that still resolves is a phantom dependency (works only because a
  // transitive copy is hoisted). One that resolves nowhere would fail the build if it were
  // real code, so it is almost always text inside a string or a fixture: report it as Info.
  for (const u of p.usage.undeclared.filter((x) => x.resolvesTo !== 'unresolved')) {
    out.push(finding(u.runtime ? 'undeclared-runtime-import' : 'undeclared-test-import', p.name, u.dep,
      `imported in ${u.sites} place(s) but not in package.json — resolves only through a hoisted transitive copy`, u.evidence.map((e) => `${p.name}/${e}`)));
  }
  const unresolved = p.usage.undeclared.filter((x) => x.resolvesTo === 'unresolved');
  if (unresolved.length) {
    out.push(finding('unresolved-specifier', p.name, null, `${unresolved.length} bare specifier(s) resolve nowhere (likely text in strings/fixtures): ${unresolved.slice(0, 6).map((u) => u.dep).join(', ')}`,
      unresolved.slice(0, 4).map((u) => `${p.name}/${u.evidence[0]}`)));
  }
  // One finding per package: a tool's platform binaries (esbuild + @esbuild/<os>) would
  // otherwise show up as two findings for one cause.
  const waste = sum(p.duplicates.map((x) => x.wasteBytes));
  if (waste >= DUP_WASTE_BYTES) {
    const top = p.duplicates.slice(0, 4);
    out.push(finding('duplicate-versions', p.name, top[0].name, `${p.duplicates.length} package(s) installed in several versions, ${fmt(waste)} beyond one copy of each`,
      top.map((d) => `${d.name}: ${d.versions.map((v) => `${v.version} (${fmt(v.bytes)})`).join(', ')}`), { wasteBytes: waste }));
  }
  for (const v of p.online?.vulns ?? []) {
    const rule = ['critical', 'high'].includes(v.severity) ? 'vulnerability-high' : v.severity === 'moderate' ? 'vulnerability-moderate' : 'vulnerability-low';
    out.push(finding(rule, p.name, v.dep, `${v.severity}: ${v.title}`, [v.url, v.range && `vulnerable: ${v.range}`]));
  }
  for (const o of p.online?.outdated ?? []) {
    if (o.deprecated) out.push(finding('deprecated', p.name, o.dep, `deprecated upstream (current ${o.current})`, `${p.manager} outdated`));
    else if (o.behind === 'major') out.push(finding('outdated-major', p.name, o.dep, `${o.current} → latest ${o.latest}`, `${p.manager} outdated`));
  }
  return out;
}

function driftFindings(d) {
  const ev = d.uses.map((u) => `${u.pkg}: ${u.version ?? 'not installed'} (${u.range}, ${u.kind})`);
  if (d.level === 'major') return [finding('version-drift-major', d.uses.map((u) => u.pkg).join(', '), d.dep, `${d.versions.length} majors across packages: ${d.versions.join(' / ')}`, ev, { contract: d.contract })];
  if (d.level === 'minor') {
    const rule = d.contract ? 'contract-lib-drift' : 'version-drift-minor';
    return [finding(rule, d.uses.map((u) => u.pkg).join(', '), d.dep, `${d.versions.length} versions across packages: ${d.versions.join(' / ')}`, ev, { contract: d.contract })];
  }
  return [];
}

function vendorDriftFinding(e) {
  return finding('vendored-copy-drift', `${e.from}, ${e.to}`, e.label.replace('vendored ', ''), `${e.counts.differ} differing file(s), ${Object.entries(e.counts.onlyIn).map(([k, v]) => `${v} only in ${k}`).join(', ')}`, e.evidence);
}

function relativeImportFinding(e) {
  return finding(e.testOnly ? 'cross-package-relative-import-test' : 'cross-package-relative-import', e.from, e.to,
    `${e.sites} relative import(s)${e.testOnly ? ' from tests' : ''} reach into ${e.to}/ instead of a declared alias or package`, e.evidence);
}

function numberFindings(list) {
  const order = { P0: 0, P1: 1, P2: 2, Info: 3 };
  return list.sort((a, b) => order[a.tier] - order[b.tier] || a.rule.localeCompare(b.rule) || String(a.package).localeCompare(String(b.package)) || String(a.dependency).localeCompare(String(b.dependency)))
    .map((f, i) => ({ id: `F${String(i + 1).padStart(2, '0')}`, ...f }));
}

// ─── helpers ────────────────────────────────────────────────────────────────────────────

function stripInternal(p) {
  const { manifest, internal, dir, ...rest } = p;
  return {
    ...rest,
    path: path.relative(ROOT, dir),
    declared: p.declared.map(({ node, ...d }) => ({ ...d, usage: p.usage.deps[d.name] })),
    usage: { filesScanned: p.usage.filesScanned, undeclared: p.usage.undeclared },
  };
}

function categorize(name) {
  for (const [cat, res] of CATEGORIES) if (res.some((re) => re.test(name))) return cat;
  return 'other';
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function readJsonc(f) {
  try {
    const raw = fs.readFileSync(f, 'utf8')
      .replace(/("(?:\\.|[^"\\])*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m, s) => s ?? '')
      .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(raw);
  } catch { return null; }
}
function lineIndexer(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (idx) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo + 1; };
}
function push(map, k, v) { if (!map.has(k)) map.set(k, []); map.get(k).push(v); }
function countBy(list, fn) { const o = {}; for (const x of list) { const k = fn(x); o[k] = (o[k] ?? 0) + 1; } return o; }
function sum(list) { return list.reduce((a, b) => a + b, 0); }
function major(v) { return Number(String(v).replace(/^[^\d]*/, '').split('.')[0]); }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function fmt(b) { return b >= MB ? `${(b / MB).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`; }
function git(cmd) { try { return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } }

main();
