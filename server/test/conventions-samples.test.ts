/**
 * Spec 004 phase 1 — the sampling stage.
 *
 * No DB, no model, no network: every case builds a real fixture tree under
 * `mkdtemp` and runs the walk over it. The temp dir is load-bearing rather than
 * incidental — on macOS it sits behind the `/var` → `/private/var` symlink,
 * which is exactly the shape that breaks a containment check resolving only one
 * side (server/INSIGHTS.md), so the honest-read assertions below are the
 * regression test for that.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectSamplePaths, readSamples } from '../src/modules/conventions/samples.js';
import {
  MAX_SAMPLE_BYTES,
  MAX_SAMPLE_FILES,
  MAX_SAMPLE_LINES,
} from '../src/modules/conventions/constants.js';

let root: string;
let clone: string;

/** Write `rel` inside the clone, creating its parent directories. */
async function write(rel: string, contents = 'export const x = 1;\n'): Promise<void> {
  const full = path.join(clone, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, contents);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'conventions-samples-'));
  clone = path.join(root, 'clone');
  await mkdir(clone, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('collectSamplePaths', () => {
  it('collects allowlisted configs that a rank-driven sample would have dropped', async () => {
    // repo-intel's JUNK_PATH_PATTERNS drops `eslint`, `prettier` and `.config.`
    // on purpose, so these can only ever arrive through the config walk.
    await write('eslint.config.js', 'export default [];\n');
    await write('.prettierrc.json', '{}\n');
    await write('tsconfig.json', '{}\n');
    await write('src/app.ts');

    const paths = await collectSamplePaths({ cloneDir: clone, fromIntel: ['src/app.ts'] });

    expect(paths).toContain('eslint.config.js');
    expect(paths).toContain('.prettierrc.json');
    expect(paths).toContain('tsconfig.json');
  });

  it('does not mistake a dependency manifest for one of the repo\'s own configs', async () => {
    await write('package.json', '{"name":"app"}\n');
    await write('node_modules/left-pad/package.json', '{"name":"left-pad"}\n');

    const paths = await collectSamplePaths({ cloneDir: clone, fromIntel: [] });

    expect(paths).toContain('package.json');
    expect(paths).not.toContain('node_modules/left-pad/package.json');
  });

  it('keeps fromIntel verbatim and in rank order, after the configs', async () => {
    await write('package.json', '{}\n');
    await write('src/zulu.ts');
    await write('src/alpha.ts');
    await write('src/mike.ts');

    // Rank order, deliberately not alphabetical.
    const fromIntel = ['src/zulu.ts', 'src/alpha.ts', 'src/mike.ts'];
    const paths = await collectSamplePaths({ cloneDir: clone, fromIntel });

    expect(paths).toEqual(['package.json', 'src/zulu.ts', 'src/alpha.ts', 'src/mike.ts']);
  });

  it('never lets the fallback walk displace ranked results', async () => {
    await write('src/ranked.ts');
    await write('src/unranked.ts');
    await write('lib/other.ts');

    const paths = await collectSamplePaths({ cloneDir: clone, fromIntel: ['src/ranked.ts'] });

    // The fallback only fires for an empty fromIntel; with one ranked file the
    // other two on disk stay out, however sample-worthy they look.
    expect(paths).toEqual(['src/ranked.ts']);
  });

  it('falls back to a deterministic walk when fromIntel is empty', async () => {
    // This is the REPO_INTEL_ENABLED=false / not-yet-indexed case, which is
    // what a freshly added repo looks like.
    await write('src/beta.ts');
    await write('src/alpha.ts');
    await write('README.md', '# docs\n');

    const first = await collectSamplePaths({ cloneDir: clone, fromIntel: [] });
    const second = await collectSamplePaths({ cloneDir: clone, fromIntel: [] });

    expect(first).toEqual(['src/alpha.ts', 'src/beta.ts']);
    expect(second).toEqual(first);
  });

  it('does not descend into node_modules in the fallback walk', async () => {
    await write('src/app.ts');
    await write('node_modules/left-pad/index.js', 'module.exports = 1;\n');
    await write('dist/bundle.js', 'var a=1;\n');

    const paths = await collectSamplePaths({ cloneDir: clone, fromIntel: [] });

    expect(paths).toEqual(['src/app.ts']);
  });

  it('caps the sample set at MAX_SAMPLE_FILES', async () => {
    for (let i = 0; i < MAX_SAMPLE_FILES + 5; i += 1) {
      await write(`src/f${String(i).padStart(2, '0')}.ts`);
    }

    const paths = await collectSamplePaths({ cloneDir: clone, fromIntel: [] });

    expect(paths).toHaveLength(MAX_SAMPLE_FILES);
    expect(new Set(paths).size).toBe(MAX_SAMPLE_FILES);
  });

  it('de-duplicates a file reached through both a config walk and the ranking', async () => {
    await write('package.json', '{}\n');

    const paths = await collectSamplePaths({ cloneDir: clone, fromIntel: ['./package.json'] });

    expect(paths).toEqual(['package.json']);
  });
});

describe('readSamples', () => {
  it('reads a sampled file whole when it is under the caps', async () => {
    await write('src/app.ts', 'const a = 1;\nconst b = 2;\n');

    const [sample] = await readSamples(clone, ['src/app.ts']);

    expect(sample?.path).toBe('src/app.ts');
    expect(sample?.text).toBe('const a = 1;\nconst b = 2;\n');
    expect(sample?.truncated).toBe(false);
    expect(sample?.lines[0]).toBe('const a = 1;');
  });

  it('truncates at MAX_SAMPLE_LINES on a line boundary', async () => {
    const lines = Array.from({ length: MAX_SAMPLE_LINES + 50 }, (_, i) => `const n${i} = ${i};`);
    await write('src/long.ts', `${lines.join('\n')}\n`);

    const [sample] = await readSamples(clone, ['src/long.ts']);

    expect(sample?.truncated).toBe(true);
    expect(sample?.lines).toHaveLength(MAX_SAMPLE_LINES);
    // Every kept line is a whole line of the original, last one included.
    expect(sample?.lines.at(-1)).toBe(lines[MAX_SAMPLE_LINES - 1]);
    expect(sample?.text).toBe(lines.slice(0, MAX_SAMPLE_LINES).join('\n'));
  });

  it('truncates at MAX_SAMPLE_BYTES on a line boundary, never mid-line', async () => {
    // Long lines, so the byte cap bites well before the line cap and lands in
    // the middle of a line — the case a naive slice would leave half-written.
    const body = 'x'.repeat(200);
    const lines = Array.from({ length: 300 }, (_, i) => `const s${i} = "${body}";`);
    await write('src/wide.ts', `${lines.join('\n')}\n`);

    const [sample] = await readSamples(clone, ['src/wide.ts']);

    expect(sample?.truncated).toBe(true);
    expect(Buffer.byteLength(sample?.text ?? '', 'utf8')).toBeLessThanOrEqual(MAX_SAMPLE_BYTES);
    // Each kept line is identical to the original at the same index — proving
    // the cut fell between lines rather than inside the last one.
    for (const [i, line] of (sample?.lines ?? []).entries()) {
      expect(line).toBe(lines[i]);
    }
    expect((sample?.lines.length ?? 0) > 1).toBe(true);
  });

  it('refuses a symlink that escapes the clone, and still reads the honest file', async () => {
    const outside = path.join(root, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, 'secret.ts'), 'const token = "hunter2";\n');
    await write('src/ok.ts', 'const ok = true;\n');
    await symlink(path.join(outside, 'secret.ts'), path.join(clone, 'leak.ts'));

    const samples = await readSamples(clone, ['src/ok.ts', 'leak.ts']);

    // The honest read surviving is half the assertion: a guard that resolves
    // only the target would reject BOTH under a /var temp dir.
    expect(samples.map((s) => s.path)).toEqual(['src/ok.ts']);
  });

  it('refuses a path that climbs out of the clone with ..', async () => {
    const outside = path.join(root, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, 'secret.ts'), 'const token = "hunter2";\n');

    const samples = await readSamples(clone, ['../outside/secret.ts']);

    expect(samples).toEqual([]);
  });

  it('refuses a sibling directory whose name merely starts with the clone name', async () => {
    const sibling = `${clone}-evil`;
    await mkdir(sibling, { recursive: true });
    await writeFile(path.join(sibling, 'secret.ts'), 'const token = "hunter2";\n');

    const samples = await readSamples(clone, ['../clone-evil/secret.ts']);

    expect(samples).toEqual([]);
  });

  it('skips an unreadable path instead of throwing', async () => {
    await write('src/ok.ts', 'const ok = true;\n');

    const samples = await readSamples(clone, ['src/gone.ts', 'src/ok.ts', 'src/also-gone.ts']);

    expect(samples.map((s) => s.path)).toEqual(['src/ok.ts']);
  });

  it('skips a directory handed in as if it were a file', async () => {
    await mkdir(path.join(clone, 'src'), { recursive: true });

    const samples = await readSamples(clone, ['src']);

    expect(samples).toEqual([]);
  });
});
