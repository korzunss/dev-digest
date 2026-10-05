import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RepoRef } from '@devdigest/shared';
import { MockGitClient } from '../../src/adapters/mocks.js';

/**
 * `MockGitClient` hard-codes `/mock/clones/<owner>/<name>`, which does not
 * exist. This subclass points the clone of `<owner>/<name>` at `<root>/<owner>/<name>`,
 * so a test can lay a real tree on disk. (Same trick as `conventions.it.test.ts`.)
 */
export class TempCloneGitClient extends MockGitClient {
  constructor(
    private root: string,
    head = 'feedfacec0ffee01',
  ) {
    super({ head });
  }
  override clonePathFor(repo: RepoRef): string {
    return path.join(this.root, repo.owner, repo.name);
  }
}

export interface OnboardingFixtureOptions {
  /** How many JS/TS source files `src/` holds (`src/f0.ts` …). Default 12. */
  sourceFiles?: number;
  /** A repo with no JS/TS at all: Python only, no package.json, no `src/*.ts`. */
  zeroJsTs?: boolean;
  /** Extra files, repo-relative POSIX path -> content. Written last. */
  extraFiles?: Record<string, string>;
  /** Committed symlinks: `link` (repo-relative) -> `target` (as written into the link). */
  symlinks?: Array<{ link: string; target: string }>;
  /** Write a `.git/config` carrying this text (stands in for the forge-PAT-bearing config). */
  gitConfig?: string;
}

/**
 * A small monorepo-shaped clone: root `package.json` (scripts `dev`/`build`/`test`,
 * dependencies that map to stack labels), `pnpm-lock.yaml`, `.env.example`,
 * `docker-compose.yml`, `server/package.json` (script `dev`) and N `src/*.ts`
 * files. Returns the number of JS/TS source files written, so a test can state
 * "indexed N of M" against a known M.
 */
export async function writeOnboardingFixture(
  dir: string,
  opts: OnboardingFixtureOptions = {},
): Promise<{ sourceFiles: number }> {
  await mkdir(dir, { recursive: true });
  const write = async (rel: string, content: string) => {
    const abs = path.join(dir, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content);
  };

  let sourceFiles = 0;
  if (opts.zeroJsTs) {
    await write('pyproject.toml', '[project]\nname = "pyapp"\n');
    await write('app/main.py', 'print("hello")\n');
    await write('README.md', '# pyapp\n');
  } else {
    sourceFiles = opts.sourceFiles ?? 12;
    await write(
      'package.json',
      JSON.stringify({
        name: 'fixture-app',
        scripts: { dev: 'tsx src/f0.ts', build: 'tsc', test: 'vitest run' },
        dependencies: { react: '^19.0.0', fastify: '^5.0.0' },
        devDependencies: { typescript: '^5.0.0', vitest: '^3.0.0' },
      }),
    );
    await write('pnpm-lock.yaml', "lockfileVersion: '9.0'\n");
    await write('.env.example', 'API_KEY=changeme\n');
    await write('docker-compose.yml', 'services:\n  db:\n    image: postgres:16\n');
    await write('server/package.json', JSON.stringify({ name: 'server', scripts: { dev: 'tsx watch index.ts' } }));
    for (let i = 0; i < sourceFiles; i++) {
      await write(`src/f${i}.ts`, `export const f${i} = ${i};\n`);
    }
  }

  for (const [rel, content] of Object.entries(opts.extraFiles ?? {})) await write(rel, content);
  if (opts.gitConfig !== undefined) await write('.git/config', opts.gitConfig);
  for (const { link, target } of opts.symlinks ?? []) {
    const abs = path.join(dir, link);
    await mkdir(path.dirname(abs), { recursive: true });
    await symlink(target, abs);
  }
  return { sourceFiles };
}
