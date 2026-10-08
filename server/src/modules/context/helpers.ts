import path from 'node:path';
import picomatch from 'picomatch';
import type { ContextDocType } from '@devdigest/shared';
import { DOC_EXTENSION, MAX_GLOB_LENGTH, MAX_SEGMENT_WILDCARDS, MAX_DOUBLE_STARS, MAX_MULTI_WILDCARD_SEGMENTS } from './constants.js';

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

/** Repo-relative, POSIX-separated form of an absolute path inside the clone. */
export function toRepoRelative(cloneDir: string, absolute: string): string {
  return path.relative(path.resolve(cloneDir), absolute).split(path.sep).join('/');
}

const hasMdExtension = (name: string): boolean => name.toLowerCase().endsWith(DOC_EXTENSION);

/**
 * Canonical repo-relative POSIX form of a caller-supplied path, or `null` when
 * it must be refused (empty, NUL, absolute in either flavour, a drive letter,
 * or a `..` segment surviving normalisation).
 */
export function normaliseDocPath(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.includes('\0')) return null;
  if (raw.trim() === '') return null;
  if (raw.startsWith('/') || raw.startsWith('\\')) return null;
  if (/^[A-Za-z]:/.test(raw)) return null;

  let p = raw.replace(/\\/g, '/');
  p = p.replace(/\/{2,}/g, '/');
  while (p.startsWith('./')) p = p.slice(2);
  p = path.posix.normalize(p);
  if (p === '' || p === '.' || p.startsWith('/')) return null;
  if (p.split('/').includes('..')) return null;
  return p;
}

/** Compile search-root globs into one predicate over repo-relative POSIX paths. */
export function compileRoots(globs: readonly string[]): (rel: string) => boolean {
  const matchers = globs.map((g) =>
    picomatch(g, { dot: false, nocase: false, windows: false, ignore: ['**/node_modules/**'] }),
  );
  return (rel) => matchers.some((m) => m(rel));
}

/**
 * Directory pre-filter for the listing walk: may `relDir` (repo-relative, POSIX)
 * hold a document matching one of `globs`? Built from each glob's static base
 * (`picomatch.scan`); conservative — when unsure (a glob with no static base)
 * every directory is admitted, so pruning never hides a matching doc.
 */
export function compileDirFilter(globs: readonly string[]): (relDir: string) => boolean {
  const scans = globs.map((g) => picomatch.scan(g));
  // `scan().base` ignores a leading `!`, so a negated glob matches the paths
  // outside its base: never prune on one (validateRootGlob refuses it anyway).
  if (scans.some((s) => s.negated)) return () => true;
  const bases = scans.map((s) => s.base);
  if (bases.some((b) => b === '')) return () => true;
  return (d) => bases.some((b) => b === d || b.startsWith(d + '/') || d.startsWith(b + '/'));
}

/**
 * picomatch compiles a glob to a backtracking regex that runs on every walked,
 * requested and stored path, and the roots route is reachable without auth. A
 * handful of `*a*a*a…*b` wildcards in one segment is exponential, so the shape
 * of a glob is capped rather than trusting `makeRe` to be cheap.
 */
function globShapeProblem(glob: string): string | null {
  if (/[!@+*?]\(/.test(glob)) return 'glob must not use extglobs such as !( @( +( *( ?(';
  let depth = 0;
  for (const ch of glob) {
    if (ch === '{') depth++;
    if (ch === '}') depth = Math.max(0, depth - 1);
    if (depth > 1) return 'glob must not nest braces';
  }
  if (/\{[^}]*\.\.[^}]*\}/.test(glob)) return 'glob must not use brace ranges like {a..b}';
  if (/\{[^}]*\/[^}]*\}/.test(glob)) return "glob must not put '/' inside braces";
  let doubleStars = 0;
  let multiWildcard = 0;
  let secondStarIdx = -1;
  const segments = glob.split('/');
  for (const [i, seg] of segments.entries()) {
    if (seg === '**') {
      doubleStars++;
      if (doubleStars === 2) secondStarIdx = i;
      continue;
    }
    // picomatch turns a `**` that is not a whole segment (`{**,x}.md`, `a**b`)
    // into a globstar that crosses `/`, which the whole-segment counts miss.
    if (seg.includes('**')) return "glob must use '**' only as a whole path segment";
    const wild = (seg.match(/[*?]/g) ?? []).length;
    if (wild > MAX_SEGMENT_WILDCARDS) {
      return `glob has more than ${MAX_SEGMENT_WILDCARDS} wildcards (* or ?) in one path segment`;
    }
    // Two or more of these (`*a*/*a*`) multiply: backtracking cost grows with
    // the product of their widths even though each is within the per-segment cap.
    if (wild >= 2) multiWildcard++;
  }
  if (multiWildcard > MAX_MULTI_WILDCARD_SEGMENTS) {
    return `glob has more than ${MAX_MULTI_WILDCARD_SEGMENTS} path segment with several wildcards (* or ?)`;
  }
  if (doubleStars > MAX_DOUBLE_STARS) return `glob has more than ${MAX_DOUBLE_STARS} '**' segments`;
  // With two `**`, anything between the second one and the filename makes the
  // regex backtrack over the whole path: measured 1.1 s for `**/*/**/` + 122
  // `*/` on a 2,046-segment path, against 9 ms when only the filename follows.
  if (secondStarIdx !== -1 && secondStarIdx !== segments.length - 2) {
    return "glob may only have the file name after its second '**'";
  }
  return null;
}

/** Why a search-root glob is unacceptable, or `null` when it is fine. */
export function validateRootGlob(glob: string): string | null {
  if (typeof glob !== 'string' || glob.trim() === '') return 'glob is empty';
  if (glob.length > MAX_GLOB_LENGTH) return `glob is longer than ${MAX_GLOB_LENGTH} characters`;
  if (glob.includes('\0')) return 'glob contains a NUL byte';
  if (glob.startsWith('/') || glob.startsWith('\\') || /^[A-Za-z]:/.test(glob)) {
    return 'glob must be relative to the repo root';
  }
  // `scan().negated` also catches `./!docs/**`, which `startsWith('!')` misses.
  if (glob.startsWith('!') || picomatch.scan(glob).negated) {
    return "glob must not start with '!' (negation)";
  }
  if (glob.split(/[\\/]/).includes('..')) return "glob must not contain a '..' segment";
  const last = glob.split('/').pop() ?? '';
  if (!hasMdExtension(last)) return 'glob must end in .md';
  const shape = globShapeProblem(glob);
  if (shape !== null) return shape;
  try {
    picomatch.makeRe(glob);
  } catch {
    return 'glob is not a valid pattern';
  }
  return null;
}

export type ResolvedContextPath =
  | { abs: string; rel: string }
  | { refused: 'outside_search_roots' | 'outside_clone' };

/**
 * The lexical half of the single path guard: normalise → search roots → `.md`
 * → containment in the clone. The symlink re-check (realpath) stays in the
 * service because it needs the filesystem.
 */
export function resolveContextPath(
  cloneDir: string,
  requested: string,
  isRoot: (rel: string) => boolean,
): ResolvedContextPath {
  const rel = normaliseDocPath(requested);
  if (rel === null) return { refused: 'outside_clone' };
  if (!isRoot(rel)) return { refused: 'outside_search_roots' };
  if (!hasMdExtension(rel)) return { refused: 'outside_search_roots' };
  const base = path.resolve(cloneDir);
  const abs = path.resolve(base, rel);
  if (!isInsideDir(base, abs)) return { refused: 'outside_clone' };
  return { abs, rel };
}

const TYPED_DIRS: readonly string[] = ['specs', 'docs', 'insights'];

/** Nearest ancestor directory named specs|docs|insights, else `other`. */
export function docType(rel: string): ContextDocType {
  const dirs = rel.split('/').slice(0, -1);
  for (let i = dirs.length - 1; i >= 0; i--) {
    const d = dirs[i];
    if (d !== undefined && TYPED_DIRS.includes(d)) return d as ContextDocType;
  }
  return 'other';
}
