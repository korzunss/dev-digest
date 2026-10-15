// Bundles src/main.ts into ONE deterministic file, dist/index.js, prefixed with
// `// devdigest-agent-runner v<version> sha256:<sha256 of the body>`. The server
// verifies that header before it ships the file (FsRunnerBundleSource).
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const installed = (name) =>
  JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')).version;
const deps = Object.fromEntries(['openai', 'yaml', 'zod'].map((n) => [n, installed(n)]));

const result = await build({
  entryPoints: [resolve(root, 'src/main.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: false,
  legalComments: 'none',
  logLevel: 'warning',
  alias: {
    '@devdigest/shared': resolve(root, '../server/src/vendor/shared/index.ts'),
    '@devdigest/reviewer-core': resolve(root, '../reviewer-core/src/index.ts'),
    zod: resolve(root, 'node_modules/zod'),
    openai: resolve(root, 'node_modules/openai'),
  },
  // Bundled CJS deps (openai) use require(); ESM output needs a shim for it.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  define: {
    __RUNNER_VERSION__: JSON.stringify(pkg.version),
    __DEPS__: JSON.stringify(deps),
  },
});

const body = result.outputFiles[0].text;
const sha = createHash('sha256').update(body).digest('hex');
const out = resolve(root, 'dist/index.js');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `// devdigest-agent-runner v${pkg.version} sha256:${sha}\n${body}`);
console.log(`dist/index.js v${pkg.version} sha256:${sha}`);
