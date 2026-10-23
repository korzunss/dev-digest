/**
 * Shape rules for a user-supplied glob, shared by the context search roots and
 * a skill's "Applies to". Pure: no I/O, no module imports.
 */

/** Structural caps on a root glob — keep picomatch's regex from backtracking exponentially. */
export const MAX_SEGMENT_WILDCARDS = 2;
// Measured on a 4,093-char path of 255-char `a` segments (worst case: nothing
// matches): `**` + one `*a*` segment + `**` takes ~8 ms; 4 `**` took ~2 s on a
// 245-char path; two multi-wildcard segments with 2 `**` took ~1.5 s at 4 KB.
export const MAX_DOUBLE_STARS = 2;
// Segments with 2 wildcards (e.g. `*a*`): two of them anywhere cost 45 ms - 1.5 s at 4 KB, so at most one.
export const MAX_MULTI_WILDCARD_SEGMENTS = 1;

/**
 * picomatch compiles a glob to a backtracking regex that runs on every walked,
 * requested and stored path, and the roots route is reachable without auth. A
 * handful of `*a*a*a…*b` wildcards in one segment is exponential, so the shape
 * of a glob is capped rather than trusting `makeRe` to be cheap.
 */
export function globShapeProblem(glob: string): string | null {
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
