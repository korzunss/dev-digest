// The runner's I/O edge: files, git, stdout. main.ts depends on the `RunnerIo`
// interface so tests can swap it; `nodeIo` is the real implementation.
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/** Diffs of huge PRs can be tens of MB; 64 MiB is a hard ceiling. */
const GIT_MAX_BUFFER = 64 * 1024 * 1024;
const SHA = /^[0-9a-f]{40}$/;

export interface RunnerIo {
  /** File contents, or null when the file does not exist. */
  readText(path: string): Promise<string | null>;
  writeText(path: string, contents: string): Promise<void>;
  /** File names directly under `path`; [] when the directory does not exist. */
  listDir(path: string): Promise<string[]>;
  /** `git diff base...head` in `workdir`. SHAs are validated before git runs. */
  gitDiff(workdir: string, baseSha: string, headSha: string): Promise<string>;
  stdout(line: string): void;
  stderr(line: string): void;
}

const isNotFound = (err: unknown): boolean => (err as { code?: string } | null)?.code === 'ENOENT';

async function git(workdir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileP('git', ['-C', workdir, ...args], { maxBuffer: GIT_MAX_BUFFER });
  return stdout;
}

export const nodeIo: RunnerIo = {
  async readText(path) {
    try {
      return await fs.readFile(path, 'utf8');
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  },
  async writeText(path, contents) {
    await fs.writeFile(path, contents, 'utf8');
  },
  async listDir(path) {
    try {
      return await fs.readdir(path);
    } catch (err) {
      if (isNotFound(err)) return [];
      throw err;
    }
  },
  async gitDiff(workdir, baseSha, headSha) {
    // Argv array, no shell; the SHAs come from the event but are checked anyway.
    if (!SHA.test(baseSha) || !SHA.test(headSha)) throw new Error('refusing to run git with a non-SHA revision');
    for (const sha of [baseSha, headSha]) {
      try {
        await git(workdir, ['cat-file', '-e', `${sha}^{commit}`]);
      } catch {
        // Not in the clone: fetch exactly the two commits.
        await git(workdir, ['fetch', '--no-tags', 'origin', baseSha, headSha]);
        break;
      }
    }
    return git(workdir, ['diff', '--no-color', '--no-ext-diff', `${baseSha}...${headSha}`, '--']);
  },
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
};
