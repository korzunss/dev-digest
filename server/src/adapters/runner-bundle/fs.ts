import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { RunnerBundleSource } from '@devdigest/shared';
import { ConfigError } from '../../platform/errors.js';

const HEADER = /^\/\/ devdigest-agent-runner v(\S+) sha256:([0-9a-f]{64})$/;

/**
 * Reads the committed agent-runner bundle and verifies its header: line 1 is
 * `// devdigest-agent-runner v<ver> sha256:<hex>` and the hash covers the bytes
 * after that line. Returns the whole file (header included) so the exported
 * `.devdigest/runner/index.js` carries the version and hash (AC-20).
 */
export class FsRunnerBundleSource implements RunnerBundleSource {
  constructor(private readonly path: string) {}

  async read(): Promise<string> {
    let text: string;
    try {
      text = await readFile(this.path, 'utf8');
    } catch {
      throw new ConfigError('runner bundle missing or corrupt');
    }
    const nl = text.indexOf('\n');
    const header = nl === -1 ? text : text.slice(0, nl);
    const body = nl === -1 ? '' : text.slice(nl + 1);
    const m = HEADER.exec(header);
    if (!m || createHash('sha256').update(body, 'utf8').digest('hex') !== m[2]) {
      throw new ConfigError('runner bundle missing or corrupt');
    }
    return text;
  }
}
