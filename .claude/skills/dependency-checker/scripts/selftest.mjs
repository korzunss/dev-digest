#!/usr/bin/env node
// selftest.mjs — deterministic regression test for collect.mjs + render.mjs. Builds a
// synthetic three-package repo in a temp dir (npm-nested and pnpm-symlinked node_modules),
// seeds one instance of each rule plus traps that must NOT fire, and checks both.
//
//   node selftest.mjs [--keep]      exit 0 = pass

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEEP = process.argv.includes('--keep');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-checker-selftest-'));
const MB = 1024 * 1024;

const w = (rel, content) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };
const json = (rel, obj) => w(rel, JSON.stringify(obj, null, 2));
const blob = (rel, bytes) => w(rel, Buffer.alloc(bytes, 1));
const mod = (dir, name, version, extra = {}, bytes = 1024) => { json(`${dir}/package.json`, { name, version, ...extra }); blob(`${dir}/index.js`, bytes); };

// ── api: pnpm, started with node, npm-style nested node_modules ──────────────────────────
json('api/package.json', {
  name: 'api', scripts: { start: 'node dist/index.js', test: 'vitest run' },
  dependencies: { zod: '^3.23.0', 'left-pad': '^1.3.0', typescript: '^5.0.0', 'build-a': '^1.0.0', 'build-b': '^1.0.0' },
  devDependencies: { vitest: '^2.0.0', 'debug-lib': '^1.0.0', '@types/node': '^22.0.0' },
});
w('api/pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
json('api/tsconfig.json', { compilerOptions: { paths: { '@x/core': ['../core/src/index.ts'], '@x/core/*': ['../core/src/*'] } } });
w('api/src/index.ts', [
  "import { z } from 'zod';",
  "import { readFile } from 'node:fs/promises';",
  "import { core } from '@x/core';",
  "import debug from 'debug-lib';",
  "import { hoisted } from 'phantom';",
  "import { util } from '../../web/src/util';",
  "const note = `it came from 'it was pulled and nothing was accepted'`;",
  "const fake = \"import x from 'not-a-real-package'\";",
  'export default { z, readFile, core, debug, hoisted, util, note, fake };',
].join('\n'));
w('api/src/vendor/shared/contract.ts', 'export const v = 1;\n');
w('api/test/a.test.ts', "import { it } from 'vitest';\nit('x', () => {});\n");
mod('api/node_modules/zod', 'zod', '3.23.8');
mod('api/node_modules/left-pad', 'left-pad', '1.3.0', {}, 6 * MB);           // unused + heavy
mod('api/node_modules/typescript', 'typescript', '5.4.0', { bin: { tsc: 'bin/tsc' } }); // tooling in prod
mod('api/node_modules/vitest', 'vitest', '2.0.0', { bin: { vitest: 'vitest.mjs' } });
mod('api/node_modules/debug-lib', 'debug-lib', '1.0.0');                      // dev dep in runtime
mod('api/node_modules/@types/node', '@types/node', '22.0.0');
mod('api/node_modules/phantom', 'phantom', '1.0.0');                          // hoisted, undeclared
mod('api/node_modules/build-a', 'build-a', '1.0.0', { dependencies: { esb: '^1.0.0' } });
mod('api/node_modules/build-b', 'build-b', '1.0.0', { dependencies: { esb: '^2.0.0' } });
mod('api/node_modules/esb', 'esb', '1.0.0', {}, 6 * MB);
mod('api/node_modules/build-b/node_modules/esb', 'esb', '2.0.0', {}, 6 * MB); // duplicate versions
w('api/src/build.ts', "import a from 'build-a';\nimport b from 'build-b';\nimport left from 'left-pad/../nothing';\nexport { a, b };\n".replace("import left from 'left-pad/../nothing';\n", ''));

// ── web: two lock files, pnpm-style symlinked node_modules ───────────────────────────────
json('web/package.json', { name: 'web', dependencies: { zod: '^4.0.0', react: '*' }, devDependencies: { jsdom: '^25.0.0' } });
w('web/pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
json('web/package-lock.json', { lockfileVersion: 3 });
w('web/src/util.ts', "import React from 'react';\nimport { z } from 'zod';\nexport const util = { React, z };\n");
w('web/src/vendor/shared/contract.ts', 'export const v = 2;\n');   // vendored drift
w('web/vitest.config.ts', "export default { test: { environment: 'jsdom' } };\n"); // string-ref use
for (const [name, version] of [['zod', '4.0.5'], ['react', '19.0.0'], ['jsdom', '25.0.1']]) {
  mod(`web/node_modules/.pnpm/${name}@${version}/node_modules/${name}`, name, version);
  fs.mkdirSync(path.join(root, 'web/node_modules'), { recursive: true });
  fs.symlinkSync(path.join(root, `web/node_modules/.pnpm/${name}@${version}/node_modules/${name}`), path.join(root, `web/node_modules/${name}`));
}

// ── core: no lock file, nothing installed ────────────────────────────────────────────────
json('core/package.json', { name: 'core', dependencies: { zod: '^3.23.0' } });
w('core/src/index.ts', "export const core = 1;\n");

// ── run ──────────────────────────────────────────────────────────────────────────────────
const run = (script, extra) => spawnSync(process.execPath, [path.join(HERE, script), '--root', root, ...extra], { encoding: 'utf8' });
const c = run('collect.mjs', ['--out', path.join(root, 'deps.json')]);
const r = run('render.mjs', ['--in', path.join(root, 'deps.json'), '--out', path.join(root, 'report.md')]);
if (c.status || r.status) { console.error(c.stderr || r.stderr); process.exit(1); }
const data = JSON.parse(fs.readFileSync(path.join(root, 'deps.json'), 'utf8'));
const report = fs.readFileSync(path.join(root, 'report.md'), 'utf8');
const has = (rule, pkg, dep) => data.findings.some((f) => f.rule === rule && String(f.package).includes(pkg) && (dep === undefined || f.dependency === dep));

const expect = [
  ['lockfile-conflict', 'web', null, 'P0'],
  ['lockfile-missing', 'core', null, 'P1'],
  ['version-drift-major', 'api', 'zod', 'P1'],
  ['loose-range', 'web', 'react', 'P1'],
  ['vendored-copy-drift', 'api', 'shared', 'P1'],
  ['cross-package-relative-import', 'api', 'web', 'P1'],
  ['undeclared-runtime-import', 'api', 'phantom', 'P1'],
  ['dev-dep-in-runtime-code', 'api', 'debug-lib', 'P1'],
  ['unused-dependency-heavy', 'api', 'left-pad', 'P1'],
  ['tooling-in-prod', 'api', 'typescript', 'P2'],
  ['duplicate-versions', 'api', 'esb', 'P2'],
  ['not-installed', 'core', null, 'Info'],
  ['unresolved-specifier', 'api', null, 'Info'],
];
const traps = [
  ['unused-dependency', 'api', 'vitest', 'bin used in a script'],
  ['unused-dependency', 'api', 'zod', 'imported'],
  ['unused-dependency', 'web', 'jsdom', 'named as a string in vitest.config'],
  ['unused-dependency', 'api', '@types/node', '@types/node is always in use'],
  ['undeclared-runtime-import', 'api', '@x/core', 'tsconfig alias'],
  ['undeclared-runtime-import', 'api', 'it', 'prose inside a string'],
  ['undeclared-runtime-import', 'api', 'not-a-real-package', 'unresolvable → Info, not P1'],
  ['tooling-in-prod', 'api', 'zod', 'not tooling'],
];

const fails = [];
for (const [rule, pkg, dep, tier] of expect) {
  const f = data.findings.find((x) => x.rule === rule && String(x.package).includes(pkg) && (dep === null || x.dependency === dep));
  if (!f) fails.push(`missing: ${rule} ${pkg} ${dep ?? ''}`);
  else if (f.tier !== tier) fails.push(`tier: ${rule} expected ${tier}, got ${f.tier}`);
}
for (const [rule, pkg, dep, why] of traps) if (has(rule, pkg, dep)) fails.push(`false positive: ${rule} ${pkg} ${dep} (${why})`);

const apiUndeclared = data.packages.find((p) => p.name === 'api').usage.undeclared.map((u) => u.dep);
if (apiUndeclared.some((d) => /\s/.test(d))) fails.push(`prose parsed as an import: ${apiUndeclared.filter((d) => /\s/.test(d)).join(', ')}`);

const edgeKinds = new Set(data.edges.map((e) => `${e.kind}:${e.from}->${e.to}`));
for (const e of ['alias:api->core', 'relative-import:api->web', 'vendored-copy:web->api']) if (!edgeKinds.has(e)) fails.push(`missing edge ${e}`);
const zod = data.packages.find((p) => p.name === 'web').declared.find((d) => d.name === 'zod');
if (zod?.version !== '4.0.5') fails.push(`pnpm symlink layout not resolved (web zod = ${zod?.version})`);
const lp = data.packages.find((p) => p.name === 'api').declared.find((d) => d.name === 'left-pad');
if (!(lp?.exclusiveBytes >= 6 * MB)) fails.push(`exclusive size wrong for left-pad: ${lp?.exclusiveBytes}`);

const headings = ['## Scope', '## Dependency graph', '## Size breakdown', '## Findings & Priorities', '## Summary'];
let at = -1;
for (const h of headings) { const i = report.indexOf(`\n${h}`); if (i <= at) fails.push(`report section out of order or missing: ${h}`); at = i; }
if ((report.match(/```mermaid\nflowchart/g) ?? []).length < 2) fails.push('report: expected two Mermaid flowcharts');
for (const t of ['### P0', '### P1', '### P2', '### Info']) if (!report.includes(t)) fails.push(`report: missing tier heading ${t}`);

if (!KEEP) fs.rmSync(root, { recursive: true, force: true });
if (fails.length) { console.error(`selftest FAILED (${fails.length})\n- ${fails.join('\n- ')}${KEEP ? `\nfixture kept at ${root}` : ''}`); process.exit(1); }
console.log(`selftest passed: ${expect.length} seeded findings, ${traps.length} traps, 3 edges, report structure${KEEP ? ` (fixture: ${root})` : ''}`);
