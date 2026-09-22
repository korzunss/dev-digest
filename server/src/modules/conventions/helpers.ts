import { createHash } from 'node:crypto';

/**
 * Pure helpers for the conventions extractor. Both functions exist so the
 * evidence gate and the cross-scan dedupe agree on what "the same text" means —
 * define that twice and a rule can match its file yet still come back as a new
 * row on the next scan. No I/O.
 */

/**
 * Collapse runs of whitespace and trim.
 *
 * The model quotes a snippet back out of a line-numbered rendering, so what it
 * returns routinely differs from the file by leading indentation, a re-wrapped
 * line, or tabs against spaces — none of which mean it cited the wrong code.
 * Matching on the normalised form is what stops a true rule being dropped over
 * an indentation level nobody can see.
 */
export function normalizeSnippet(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * A rule's identity across scans: the normalised, lower-cased rule plus the path
 * it cites.
 *
 * This is the value behind the UNIQUE `(repo_id, fingerprint)` index, which is
 * what makes "a re-scan does not resurrect a rejected rule" a property of the
 * schema rather than of the service remembering to check. So it has to be stable
 * for the same rule phrased with different whitespace or casing, and it must
 * depend on nothing but its two arguments — no clock, no scan id, and no hash
 * over an object whose key order the caller happens to control.
 *
 * Truncated to 16 hex chars: 64 bits over the few hundred rules a repo can hold
 * will not collide, and a short value stays readable in a row.
 */
export function fingerprintFor(rule: string, evidencePath: string): string {
  // NUL separator, so ("ab", "c") and ("a", "bc") cannot fingerprint alike.
  const key = `${normalizeSnippet(rule).toLowerCase()}\u0000${evidencePath}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}
