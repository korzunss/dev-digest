import picomatch from 'picomatch';
import { SKILL_PATH_MAX_CHARS } from '@devdigest/shared/contracts/skill-scope.js';
import { globShapeProblem } from './glob-shape.js';

/** Bound on cached glob lists: one entry per distinct skill scope seen by this process. */
const MATCHER_CACHE_MAX = 500;

/**
 * Trim, drop empty lines, strip one leading `./`, keep the author's order.
 * Does not dedupe: the list is an ordered list the author wrote (AC-7).
 */
export function normalizeSkillPaths(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of raw) {
    let g = entry.trim();
    if (g.startsWith('./')) g = g.slice(2);
    if (g !== '') out.push(g);
  }
  return out;
}

/** Why an "Applies to" glob is unacceptable, or `null` when it is fine. Expects a normalised glob. */
export function skillPathProblem(glob: string): string | null {
  if (typeof glob !== 'string' || glob.trim() === '') return 'glob is empty';
  if (glob.length > SKILL_PATH_MAX_CHARS) return `glob is longer than ${SKILL_PATH_MAX_CHARS} characters`;
  if (glob.includes('\0')) return 'glob contains a NUL byte';
  if (glob.startsWith('/') || glob.startsWith('\\') || /^[A-Za-z]:/.test(glob)) {
    return 'glob must be relative to the repo root';
  }
  // `scan().negated` also catches `./!src/**`, which `startsWith('!')` misses.
  if (glob.startsWith('!') || picomatch.scan(glob).negated) {
    return "glob must not start with '!' (negation)";
  }
  if (glob.split(/[\\/]/).includes('..')) return "glob must not contain a '..' segment";
  const shape = globShapeProblem(glob);
  if (shape !== null) return shape;
  try {
    picomatch.makeRe(glob);
  } catch {
    return 'glob is not a valid pattern';
  }
  return null;
}

/**
 * The matcher the engine receives (reviewer-core is pure and has no picomatch).
 * Dot segments match, case is significant, `/` is the only separator. The
 * compiled matcher is cached per glob list.
 */
export function createPathMatcher(): (path: string, globs: readonly string[]) => boolean {
  const cache = new Map<string, (p: string) => boolean>();
  return (path, globs) => {
    if (globs.length === 0) return true;
    const key = globs.join('\0');
    let match = cache.get(key);
    if (!match) {
      if (cache.size >= MATCHER_CACHE_MAX) cache.clear();
      match = picomatch([...globs], { dot: true, nocase: false, windows: false });
      cache.set(key, match);
    }
    return match(path);
  };
}
