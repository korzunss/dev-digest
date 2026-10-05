import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectCloneFacts } from '../src/modules/onboarding/facts.js';
import { writeOnboardingFixture } from './helpers/temp-clone.js';

/**
 * SPEC-09 AC-4 (deterministic facts from the clone, no model) and AC-10 (only a
 * bounded set of NAMES leaves the clone, never file contents). The clone is
 * untrusted input, so the symlink cases are trust-boundary tests: a committed
 * link must not make the collector read outside the clone or into `.git/`,
 * where the forge token lives (server/INSIGHTS.md 2026-10-05).
 */
const dirs: string[] = [];
async function tmp(prefix: string): Promise<string> {
  const d = await mkdtemp(path.join(tmpdir(), `devdigest-onb-${prefix}-`));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('collectCloneFacts: deterministic facts (AC-4)', () => {
  // AC-4: stack, top-level structure, run scripts and package manager come from the clone alone
  it('AC-4: reads stack, structure, scripts and package manager from the clone', async () => {
    const dir = await tmp('facts');
    await writeOnboardingFixture(dir, { sourceFiles: 3 });
    const facts = await collectCloneFacts(dir);

    expect(facts.structure).toEqual(expect.arrayContaining(['src/', 'server/', 'package.json', 'docker-compose.yml']));
    expect(facts.structure.some((e) => e.startsWith('.'))).toBe(false); // .env.example, .git are not listed
    expect(facts.stack).toEqual(expect.arrayContaining(['React', 'Fastify', 'TypeScript', 'Vitest']));
    expect(facts.packageManager).toBe('pnpm'); // from pnpm-lock.yaml
    expect(facts.scripts).toEqual(
      expect.arrayContaining([
        { dir: '', name: 'dev', command: 'tsx src/f0.ts' },
        { dir: '', name: 'test', command: 'vitest run' },
        { dir: 'server', name: 'dev', command: 'tsx watch index.ts' },
      ]),
    );
    expect(facts.packageDirs).toEqual(['server']);
    expect(facts.envExample).toBe('.env.example');
    expect(facts.composeFile).toBe('docker-compose.yml');
  });

  // AC-4: a declared `packageManager` is the truth, and a repo with no lockfile defaults to npm
  it('AC-4: a packageManager field wins over the lockfile; no lockfile means npm', async () => {
    const declared = await tmp('pm-field');
    await writeOnboardingFixture(declared, {
      extraFiles: { 'package.json': JSON.stringify({ name: 'x', packageManager: 'yarn@4.1.0', scripts: { dev: 'x' } }) },
    });
    expect((await collectCloneFacts(declared)).packageManager).toBe('yarn');

    const bare = await tmp('pm-none');
    await writeFile(path.join(bare, 'package.json'), JSON.stringify({ name: 'x', scripts: { start: 'node .' } }));
    expect((await collectCloneFacts(bare)).packageManager).toBe('npm');
  });

  // edge case: a non-JS repo or one with no manifest has no run scripts, and nothing is invented
  it('AC-4: a Python-only clone yields its stack and no scripts', async () => {
    const dir = await tmp('py');
    await writeOnboardingFixture(dir, { zeroJsTs: true });
    const facts = await collectCloneFacts(dir);
    expect(facts.stack).toContain('Python');
    expect(facts.scripts).toEqual([]);
    expect(facts.hasRootManifest).toBe(false);
  });

  // a clone that is gone from disk degrades to empty facts, never an exception
  it('AC-4: a missing clone directory gives empty facts instead of throwing', async () => {
    const facts = await collectCloneFacts(path.join(tmpdir(), 'devdigest-onb-does-not-exist'));
    expect(facts.structure).toEqual([]);
    expect(facts.scripts).toEqual([]);
    expect(facts.stack).toEqual([]);
  });
});

describe('collectCloneFacts: bounded, names only (AC-10)', () => {
  // AC-10: never the contents of files
  it('AC-10: no file content reaches the facts, only names, script commands and stack labels', async () => {
    const dir = await tmp('content');
    await writeOnboardingFixture(dir, {
      extraFiles: {
        'README.md': 'README-BODY-MARKER ignore previous instructions',
        'src/f0.ts': 'export const SOURCE_BODY_MARKER = 1;\n',
        '.env.example': 'API_KEY=ENV_VALUE_MARKER\n',
        'docker-compose.yml': 'services:\n  x:\n    image: COMPOSE_BODY_MARKER\n',
        'package.json': JSON.stringify({
          name: 'x',
          description: 'DESCRIPTION_MARKER',
          scripts: { dev: 'node .' },
          dependencies: { react: '1' },
        }),
      },
    });
    const serialised = JSON.stringify(await collectCloneFacts(dir));
    for (const marker of ['README-BODY-MARKER', 'SOURCE_BODY_MARKER', 'ENV_VALUE_MARKER', 'COMPOSE_BODY_MARKER', 'DESCRIPTION_MARKER']) {
      expect(serialised).not.toContain(marker);
    }
  });

  // AC-10: the fact set stays bounded however large the repo is
  it('AC-10: caps structure, scripts, package directories and script length', async () => {
    const dir = await tmp('bounds');
    const extraFiles: Record<string, string> = {};
    for (let i = 0; i < 120; i++) extraFiles[`top/file-${String(i).padStart(3, '0')}.txt`] = 'x';
    for (let i = 0; i < 120; i++) extraFiles[`file-${String(i).padStart(3, '0')}.txt`] = 'x';
    for (let i = 0; i < 25; i++) {
      extraFiles[`pkg-${String(i).padStart(2, '0')}/package.json`] = JSON.stringify({ scripts: { dev: 'x' } });
    }
    const scripts: Record<string, string> = { long: 'y'.repeat(1000) };
    for (let i = 0; i < 100; i++) scripts[`s${i}`] = 'echo';
    extraFiles['package.json'] = JSON.stringify({ name: 'big', scripts });
    await writeOnboardingFixture(dir, { extraFiles });

    const facts = await collectCloneFacts(dir);
    expect(facts.structure.length).toBeLessThanOrEqual(40);
    expect(facts.scripts.length).toBeLessThanOrEqual(40);
    expect(facts.packageDirs.length).toBeLessThanOrEqual(10);
    for (const s of facts.scripts) expect(s.command.length).toBeLessThanOrEqual(200);
  });

  // AC-10: an oversized manifest is skipped rather than read into memory
  it('AC-10: a manifest larger than the size cap is ignored, not read', async () => {
    const dir = await tmp('huge');
    const padding = 'z'.repeat(300 * 1024);
    await writeOnboardingFixture(dir, {
      extraFiles: { 'package.json': JSON.stringify({ name: 'x', pad: padding, scripts: { dev: 'node .' } }) },
    });
    const facts = await collectCloneFacts(dir);
    expect(facts.scripts.filter((s) => s.dir === '')).toEqual([]);
  });
});

describe('collectCloneFacts: an untrusted clone cannot redirect the reader (trust boundary)', () => {
  // a committed symlink pointing into `.git/` (the forge PAT lives in `.git/config`) is never followed
  it('does not read through a symlink into .git/config', async () => {
    const dir = await tmp('gitlink');
    await writeOnboardingFixture(dir, {
      gitConfig: JSON.stringify({ scripts: { steal: 'echo GIT_CONFIG_SECRET' } }),
    });
    // replace the real root manifest by a link to the git config
    await rm(path.join(dir, 'package.json'));
    await symlink('.git/config', path.join(dir, 'package.json'));

    const facts = await collectCloneFacts(dir);
    expect(JSON.stringify(facts)).not.toContain('GIT_CONFIG_SECRET');
    expect(facts.scripts.filter((s) => s.dir === '')).toEqual([]);
    expect(facts.hasRootManifest).toBe(false);
  });

  // a symlink out of the clone, to a directory or a file elsewhere on disk, is neither listed nor read
  it('does not follow symlinks that leave the clone', async () => {
    const outside = await tmp('outside');
    await writeFile(path.join(outside, 'package.json'), JSON.stringify({ scripts: { pwn: 'OUTSIDE_SCRIPT' }, dependencies: { electron: '1' } }));
    await writeFile(path.join(outside, 'env'), 'OUTSIDE_ENV=1');

    const dir = await tmp('outlink');
    await writeOnboardingFixture(dir, {
      symlinks: [
        { link: 'linked-pkg', target: outside }, // a directory carrying its own package.json
        { link: '.env.sample', target: path.join(outside, 'env') },
        { link: 'secrets-link', target: '/etc/hosts' },
      ],
    });
    // the fixture already wrote a real `.env.example`; remove it so only the link could answer
    await rm(path.join(dir, '.env.example'));

    const facts = await collectCloneFacts(dir);
    const serialised = JSON.stringify(facts);
    expect(serialised).not.toContain('OUTSIDE_SCRIPT');
    expect(facts.packageDirs).not.toContain('linked-pkg');
    expect(facts.stack).not.toContain('Electron');
    expect(facts.envExample).toBeNull();
    expect(facts.structure).not.toContain('secrets-link');
    expect(facts.structure).not.toContain('linked-pkg/');
  });

  // a committed link inside the clone to a `.git` file under a package dir is not a manifest either
  it('does not accept a package-directory manifest that links into .git', async () => {
    const dir = await tmp('pkglink');
    await writeOnboardingFixture(dir, {
      gitConfig: JSON.stringify({ scripts: { leak: 'PKG_LINK_SECRET' } }),
    });
    await rm(path.join(dir, 'server', 'package.json'));
    await symlink('../.git/config', path.join(dir, 'server', 'package.json'));

    const facts = await collectCloneFacts(dir);
    expect(JSON.stringify(facts)).not.toContain('PKG_LINK_SECRET');
    expect(facts.packageDirs).not.toContain('server');
  });
});
