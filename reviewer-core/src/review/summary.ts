import type { Finding } from '@devdigest/shared';

/** How many CRITICAL titles the summary line names before collapsing to `+k more`. */
export const SUMMARY_TOP_CRITICAL = 3;
/** Longest title (characters) kept in the summary line. */
export const SUMMARY_TITLE_MAX = 80;

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Titles are model output (untrusted): one line, bounded length. */
function cleanTitle(title: string): string {
  const flat = title.replace(/\s+/g, ' ').trim();
  return flat.length > SUMMARY_TITLE_MAX ? `${flat.slice(0, SUMMARY_TITLE_MAX)}…` : flat;
}

/**
 * Deterministic one-line summary of a map-reduce review, computed from the FINAL
 * findings (after grounding and the scope filter) — no model text, so it can
 * neither contradict the findings nor describe ones that were dropped.
 */
export function summarizeFindings(
  findings: Finding[],
  scope: { files: number; chunks: number },
): string {
  const head = `Reviewed ${plural(scope.files, 'file')} in ${plural(scope.chunks, 'chunk')}:`;
  if (findings.length === 0) return `${head} no findings.`;

  const counts: Record<Finding['severity'], number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) counts[f.severity] += 1;

  let line = `${head} ${plural(findings.length, 'finding')} (${counts.CRITICAL} critical · ${counts.WARNING} warning · ${counts.SUGGESTION} suggestion).`;
  if (counts.CRITICAL > 0) {
    const top = findings
      .filter((f) => f.severity === 'CRITICAL')
      .slice(0, SUMMARY_TOP_CRITICAL)
      .map((f) => `${cleanTitle(f.title)} (${f.file}:${f.start_line})`);
    line += ` Critical: ${top.join('; ')}`;
    if (counts.CRITICAL > SUMMARY_TOP_CRITICAL) line += ` +${counts.CRITICAL - SUMMARY_TOP_CRITICAL} more`;
    line += '.';
  }
  return line;
}
