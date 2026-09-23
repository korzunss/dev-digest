import path from 'node:path';
import { CONTEXT_FOLDERS, DOC_EXTENSION } from './constants.js';

/**
 * Pure helpers for the context module. No I/O — everything here is a decision
 * about a *string*, which is what makes the security rule testable without a
 * filesystem. The one check that cannot live here is the symlink re-check: it
 * needs `realpath`, so it sits in the service.
 */

/**
 * Is `candidate` the directory `dir` itself, or something beneath it?
 *
 * The separator is the whole point. A bare `candidate.startsWith(dir)` happily
 * accepts `/clones/acme/payments-api-evil` for `dir = /clones/acme/payments-api`
 * — a sibling directory whose name merely begins with the clone's. Both sides
 * must already be absolute and normalised (`path.resolve`).
 */
export function isInsideDir(dir: string, candidate: string): boolean {
  if (candidate === dir) return true;
  const withSep = dir.endsWith(path.sep) ? dir : dir + path.sep;
  return candidate.startsWith(withSep);
}

/**
 * Turn a caller-supplied `?path=` into the absolute file to read, or `null`
 * when the request must be REFUSED. `null` is not "missing" — the route maps it
 * to a 422, never a 404, because "you may not ask that" and "that document does
 * not exist" are different answers and conflating them both misleads honest
 * callers and confirms guesses for dishonest ones.
 *
 * Refused:
 *   - empty/whitespace input, and anything containing a NUL byte (`\0`), which
 *     truncates the name at the syscall boundary (`specs/a.md\0.sh`);
 *   - absolute paths;
 *   - a `..` segment surviving normalisation — so `specs/../../etc/passwd` goes,
 *     while `evil/../specs/a.md` is ACCEPTED: it normalises to `specs/a.md`,
 *     which is a legal document, and the `evil/` segment never existed as far as
 *     the filesystem is concerned. The rule is about where a path LANDS, not
 *     about the characters it was spelled with;
 *   - anything landing outside `cloneDir` (checked on the separator boundary,
 *     see `isInsideDir`);
 *   - a first segment outside `CONTEXT_FOLDERS`;
 *   - an extension other than `.md` (case-insensitive).
 */
export function resolveDocPath(cloneDir: string, requested: string): string | null {
  if (typeof requested !== 'string') return null;
  if (requested.includes('\0')) return null;
  if (requested.trim() === '') return null;
  if (path.isAbsolute(requested)) return null;
  // A leading separator of either flavour is absolute intent even where this
  // platform's `isAbsolute` disagrees (`\specs\a.md` on POSIX).
  if (requested.startsWith('/') || requested.startsWith('\\')) return null;

  const segments = path
    .normalize(requested)
    .split(path.sep)
    .filter((segment) => segment !== '' && segment !== '.');

  // A document is always <folder>/<file>: a bare folder addresses no document.
  if (segments.length < 2) return null;
  if (segments.includes('..')) return null;

  const folder = segments[0];
  if (folder === undefined) return null;
  if (!(CONTEXT_FOLDERS as readonly string[]).includes(folder)) return null;

  const file = segments[segments.length - 1];
  if (file === undefined) return null;
  if (path.extname(file).toLowerCase() !== DOC_EXTENSION) return null;

  const base = path.resolve(cloneDir);
  const resolved = path.resolve(base, segments.join(path.sep));

  // Belt and braces: with every `..` already refused this cannot fail today,
  // but it is the check that stays correct if the rules above are ever relaxed.
  if (!isInsideDir(base, resolved)) return null;

  return resolved;
}

/** Repo-relative, POSIX-separated form of an absolute path inside the clone. */
export function toRepoRelative(cloneDir: string, absolute: string): string {
  return path.relative(path.resolve(cloneDir), absolute).split(path.sep).join('/');
}
