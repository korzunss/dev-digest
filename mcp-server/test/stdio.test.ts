import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');

describe('stdio entrypoint', () => {
  it('exits 0 with empty stdout when stdin closes', async () => {
    const child = spawn(resolve(root, 'node_modules/.bin/tsx'), ['src/index.ts'], {
      cwd: root,
      env: { ...process.env, DEVDIGEST_API_URL: 'http://127.0.0.1:1' },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += String(d)));
    child.stdin.end();
    const code = await new Promise<number | null>((res) => child.on('close', res));
    expect(code).toBe(0);
    expect(out).toBe('');
  }, 20_000);

  it('rejects an invalid API URL with exit 1 and nothing on stdout', async () => {
    const child = spawn(resolve(root, 'node_modules/.bin/tsx'), ['src/index.ts'], {
      cwd: root,
      env: { ...process.env, DEVDIGEST_API_URL: 'ftp://x' },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += String(d)));
    child.stdin.end();
    const code = await new Promise<number | null>((res) => child.on('close', res));
    expect(code).toBe(1);
    expect(out).toBe('');
  }, 20_000);
});
