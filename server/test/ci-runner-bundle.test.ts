import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsRunnerBundleSource } from '../src/adapters/runner-bundle/fs.js';
import { runnerVersionOf } from '../src/modules/ci/export-files.js';

const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const body = 'console.log(1);\n';
const sha = createHash('sha256').update(body).digest('hex');
const write = (name: string, text: string) => {
  const p = join(dir, name);
  writeFileSync(p, text);
  return p;
};

describe('FsRunnerBundleSource', () => {
  it('returns a verified bundle', async () => {
    const text = `// devdigest-agent-runner v1.2.3 sha256:${sha}\n${body}`;
    const js = await new FsRunnerBundleSource(write('ok.js', text)).read();
    expect(js).toBe(text);
    expect(runnerVersionOf(js)).toBe('1.2.3');
  });
  it('rejects a tampered body', async () => {
    const p = write('bad.js', `// devdigest-agent-runner v1.2.3 sha256:${sha}\n${body}evil();\n`);
    await expect(new FsRunnerBundleSource(p).read()).rejects.toThrow('runner bundle missing or corrupt');
  });
  it('rejects a missing header and a missing file', async () => {
    await expect(new FsRunnerBundleSource(write('nohdr.js', body)).read()).rejects.toThrow('corrupt');
    await expect(new FsRunnerBundleSource(join(dir, 'nope.js')).read()).rejects.toThrow('corrupt');
  });
  const committed = join(process.cwd(), '../agent-runner/dist/index.js');
  it.skipIf(!existsSync(committed))('accepts the committed agent-runner bundle', async () => {
    const js = await new FsRunnerBundleSource(committed).read();
    expect(runnerVersionOf(js)).toMatch(/^\d/);
  });
});
