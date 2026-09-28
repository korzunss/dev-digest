import type { SmartDiffRole } from '@devdigest/shared';
import { SMART_DIFF_RULES, type SmartDiffRule } from './constants.js';

function matchesRule(rule: SmartDiffRule, basename: string, segments: readonly string[]): boolean {
  if (rule.basenames?.includes(basename)) return true;
  if (rule.basenameSuffixes?.some((suffix) => basename.endsWith(suffix))) return true;
  if (rule.basenamePrefixes?.some((prefix) => basename.startsWith(prefix))) return true;
  if (rule.basenameIncludes?.some((needle) => basename.includes(needle))) return true;
  if (rule.segments?.some((segment) => segments.includes(segment))) return true;
  if (rule.prefixSuffix?.some(({ prefix, suffix }) => basename.startsWith(prefix) && basename.endsWith(suffix))) {
    return true;
  }
  return false;
}

/**
 * Classifies a repo-relative file path into a Smart Diff role. Pure: no I/O,
 * same input always yields the same output. See `constants.ts` for the rule
 * data and the evaluation order.
 */
export function classifyFile(path: string): SmartDiffRole {
  const stripped = path.startsWith('./') ? path.slice(2) : path;
  const parts = stripped.split('/');
  const basename = parts[parts.length - 1] ?? '';
  const segments = parts.slice(0, -1);

  for (const rule of SMART_DIFF_RULES) {
    if (matchesRule(rule, basename, segments)) return rule.role;
  }
  return 'core';
}
