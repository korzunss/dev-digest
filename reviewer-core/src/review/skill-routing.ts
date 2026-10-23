import type { ContextDoc } from '../prompt.js';

/**
 * Pure skill routing (stack-scoped review guidance). The engine never parses
 * globs itself: the caller injects `PathMatcher`, so this file imports nothing
 * but local types and stays dependency-free.
 */

/** A skill resolved by the caller, with the globs it applies to (empty = every file). */
export interface ScopedSkillInput {
  id: string;
  name: string;
  version: number;
  body: string;
  paths: string[];
}

/** Caller-injected glob match: does `path` match any of `globs`? */
export type PathMatcher = (path: string, globs: string[]) => boolean;

/** Indexes (into `skills`, in attached order) of the skills that apply to `path`. */
export function skillsForFile(
  skills: readonly ScopedSkillInput[],
  path: string,
  match: PathMatcher,
): number[] {
  const out: number[] = [];
  skills.forEach((s, i) => {
    if (s.paths.length === 0 || match(path, s.paths)) out.push(i);
  });
  return out;
}

/**
 * Groups `paths` by the exact set of skills that apply to each, ordered by the
 * first file of each group in diff order. Files inside a group keep diff order.
 */
export function groupBySkillSet(
  paths: readonly string[],
  skills: readonly ScopedSkillInput[],
  match: PathMatcher,
): { paths: string[]; skillIdx: number[] }[] {
  const groups = new Map<string, { paths: string[]; skillIdx: number[] }>();
  for (const path of paths) {
    const skillIdx = skillsForFile(skills, path, match);
    const key = skillIdx.join(',');
    const g = groups.get(key);
    if (g) g.paths.push(path);
    else groups.set(key, { paths: [path], skillIdx });
  }
  return [...groups.values()];
}

/**
 * Keeps the docs without `viaSkillIds` plus those that share an id with the
 * skills injected into the call.
 */
export function specsForCall(
  specs: readonly ContextDoc[] | undefined,
  injectedIds: ReadonlySet<string> | readonly string[],
): ContextDoc[] | undefined {
  if (!specs) return undefined;
  const ids = injectedIds instanceof Set ? injectedIds : new Set(injectedIds as readonly string[]);
  return specs.filter((d) => !d.viaSkillIds || d.viaSkillIds.some((id) => ids.has(id)));
}
