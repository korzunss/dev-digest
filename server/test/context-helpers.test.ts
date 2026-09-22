import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { isInsideDir, resolveDocPath, toRepoRelative } from '../src/modules/context/helpers.js';

/**
 * The security half of the context module. `resolveDocPath` is the single gate
 * between a caller-supplied `?path=` and a file read, so it is exercised here
 * without a filesystem: every case below is a decision about a string, and a
 * regression would otherwise only show up as a real file leaving the clone.
 */

const CLONE = path.resolve('/clones/acme/payments-api');
const abs = (...parts: string[]) => path.join(CLONE, ...parts);

describe('resolveDocPath — what it accepts', () => {
  it('accepts a markdown file in each of the three context folders', () => {
    expect(resolveDocPath(CLONE, 'specs/public-api.md')).toBe(abs('specs', 'public-api.md'));
    expect(resolveDocPath(CLONE, 'docs/architecture.md')).toBe(abs('docs', 'architecture.md'));
    expect(resolveDocPath(CLONE, 'insights/perf.md')).toBe(abs('insights', 'perf.md'));
  });

  it('accepts a nested document under a context folder', () => {
    expect(resolveDocPath(CLONE, 'docs/adr/0001-storage.md')).toBe(
      abs('docs', 'adr', '0001-storage.md'),
    );
  });

  it('accepts a leading "./" and collapsed separators', () => {
    expect(resolveDocPath(CLONE, './specs//a.md')).toBe(abs('specs', 'a.md'));
  });

  it('ACCEPTS "evil/../specs/a.md" — the rule is where a path lands, not how it is spelled', () => {
    // Deliberate: it normalises to `specs/a.md`, a legal document inside the
    // clone, and `evil/` is never touched. Refusing it would mean refusing on
    // the presence of characters rather than on the resolved destination.
    expect(resolveDocPath(CLONE, 'evil/../specs/a.md')).toBe(abs('specs', 'a.md'));
  });

  it('accepts an uppercase extension — the extension check is case-insensitive', () => {
    expect(resolveDocPath(CLONE, 'specs/A.MD')).toBe(abs('specs', 'A.MD'));
  });
});

describe('resolveDocPath — what it refuses', () => {
  it('refuses a classic traversal', () => {
    expect(resolveDocPath(CLONE, '../../etc/passwd')).toBeNull();
  });

  it('refuses an absolute path', () => {
    expect(resolveDocPath(CLONE, '/etc/passwd')).toBeNull();
    expect(resolveDocPath(CLONE, '/clones/acme/payments-api/specs/a.md')).toBeNull();
    expect(resolveDocPath(CLONE, '\\specs\\a.md')).toBeNull();
  });

  it('refuses a path that starts legally and normalises out of the clone', () => {
    expect(resolveDocPath(CLONE, 'specs/../../../etc/passwd')).toBeNull();
    expect(resolveDocPath(CLONE, 'specs/../../payments-api-evil/specs/a.md')).toBeNull();
  });

  it('refuses a sibling directory whose name merely prefixes the clone', () => {
    // `/c/repo-evil/x.md` shares the string prefix `/c/repo` — a bare
    // `startsWith` on the raw path would let this through.
    expect(resolveDocPath('/c/repo', '../repo-evil/x.md')).toBeNull();
    expect(isInsideDir('/c/repo', '/c/repo-evil/x.md')).toBe(false);
    expect(isInsideDir('/c/repo', '/c/repo/specs/x.md')).toBe(true);
    expect(isInsideDir('/c/repo', '/c/repo')).toBe(true);
  });

  it('refuses a folder outside the allowlist', () => {
    expect(resolveDocPath(CLONE, 'notes/a.md')).toBeNull();
    expect(resolveDocPath(CLONE, '.github/workflows/ci.md')).toBeNull();
    expect(resolveDocPath(CLONE, 'README.md')).toBeNull();
  });

  it('refuses a bare folder — a document is always <folder>/<file>', () => {
    expect(resolveDocPath(CLONE, 'specs')).toBeNull();
    expect(resolveDocPath(CLONE, 'specs/')).toBeNull();
  });

  it('refuses a non-markdown extension', () => {
    expect(resolveDocPath(CLONE, 'specs/a.sh')).toBeNull();
    expect(resolveDocPath(CLONE, 'specs/a.md.sh')).toBeNull();
    expect(resolveDocPath(CLONE, 'specs/a')).toBeNull();
  });

  it('refuses a NUL byte — it truncates the name at the syscall boundary', () => {
    expect(resolveDocPath(CLONE, 'specs/a.md\0.sh')).toBeNull();
    expect(resolveDocPath(CLONE, 'specs/a\0.md')).toBeNull();
  });

  it('refuses empty and whitespace-only input', () => {
    expect(resolveDocPath(CLONE, '')).toBeNull();
    expect(resolveDocPath(CLONE, '   ')).toBeNull();
    expect(resolveDocPath(CLONE, '\t\n')).toBeNull();
  });
});

describe('toRepoRelative', () => {
  it('reports the path as addressed, POSIX-separated', () => {
    expect(toRepoRelative(CLONE, abs('specs', 'public-api.md'))).toBe('specs/public-api.md');
    expect(toRepoRelative(CLONE, abs('docs', 'adr', 'a.md'))).toBe('docs/adr/a.md');
  });
});
