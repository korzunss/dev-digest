import type { DigestEntry, RepoDigest } from './types.js';

export function averageScore(entries: DigestEntry[]): number | null {
  const scored = entries.filter((e) => e.score !== null);
  if (scored.length === 0) return null;
  const total = scored.reduce((sum, e) => sum + (e.score ?? 0), 0);
  return Math.round(total / scored.length);
}

export function renderDigestMarkdown(digest: RepoDigest): string {
  const lines = [
    `### Review digest since ${digest.since.slice(0, 10)}`,
    '',
    `Average score: ${digest.averageScore ?? 'n/a'}`,
    '',
    '| PR | Score | Findings | Critical |',
    '|---|---|---|---|',
  ];
  for (const e of digest.entries) {
    lines.push(`| #${e.pullNumber} ${e.title} | ${e.score ?? '—'} | ${e.findings} | ${e.critical} |`);
  }
  return lines.join('\n');
}
