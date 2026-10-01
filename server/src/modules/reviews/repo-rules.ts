import type { GitClient, RepoRef } from '@devdigest/shared';
import type { RepoRuleSet } from '@devdigest/reviewer-core';
import {
  REPO_RULES_MAX_DIR_DEPTH,
  REPO_RULES_MAX_FILES,
  REPO_RULES_MAX_FILE_CHARS,
} from './constants.js';

const AGENTS_FILE = 'AGENTS.md';
const GOTCHAS_FILE = 'insights/gotchas.md';
/** Relevance filter, not a security control: policy lines excuse defects, so keep them out of the block. */
const POLICY_LINE = /by design|no auth/i;

export interface LoadedRepoRules {
  sets: RepoRuleSet[];
  /** Files read successfully. */
  read: number;
  /** Candidate files that could not be read (absent at the base SHA, or a read error). */
  missing: number;
}

/**
 * Repo-relative rule files worth reading for a PR: the root pair plus, for each
 * ancestor directory (up to `REPO_RULES_MAX_DIR_DEPTH`) of a changed path,
 * `<dir>/AGENTS.md` and `<dir>/insights/gotchas.md`. Built from raw segments —
 * a path with an empty, `.` or `..` segment is skipped, never normalised.
 */
export function ruleCandidatePaths(changedPaths: readonly string[]): string[] {
  const out = new Set<string>([AGENTS_FILE, GOTCHAS_FILE]);
  for (const p of changedPaths) {
    const segs = p.split('/');
    if (segs.some((s) => s === '' || s === '.' || s === '..')) continue;
    const dirs = segs.slice(0, -1).slice(0, REPO_RULES_MAX_DIR_DEPTH);
    for (let i = 1; i <= dirs.length; i++) {
      const dir = dirs.slice(0, i).join('/');
      out.add(`${dir}/${AGENTS_FILE}`);
      out.add(`${dir}/${GOTCHAS_FILE}`);
    }
  }
  return [...out].sort().slice(0, REPO_RULES_MAX_FILES);
}

/** Split markdown into `## ` sections; `head` is whatever precedes the first one. */
function splitSections(content: string): { head: string[]; sections: { heading: string; lines: string[] }[] } {
  const head: string[] = [];
  const sections: { heading: string; lines: string[] }[] = [];
  for (const line of content.split('\n')) {
    if (/^##\s/.test(line)) sections.push({ heading: line.replace(/^##\s+/, ''), lines: [line] });
    else if (sections.length > 0) sections[sections.length - 1]!.lines.push(line);
    else head.push(line);
  }
  return { head, sections };
}

/**
 * The part of a rule file the review sees. `AGENTS.md`: only the `Gotchas…` /
 * `Conventions…` sections. `gotchas.md`: everything from the first `## ` except
 * a `Security…` section. Policy lines are dropped; the result is trimmed and capped.
 */
export function extractRuleText(path: string, content: string): string {
  const { sections } = splitSections(content);
  const isAgents = path === AGENTS_FILE || path.endsWith(`/${AGENTS_FILE}`);
  const kept = sections.filter((s) =>
    isAgents ? /^(gotchas|conventions)/i.test(s.heading) : !/^security/i.test(s.heading),
  );
  const text = kept
    .flatMap((s) => s.lines)
    .filter((l) => !POLICY_LINE.test(l))
    .join('\n')
    .trim();
  return text.length > REPO_RULES_MAX_FILE_CHARS ? text.slice(0, REPO_RULES_MAX_FILE_CHARS) : text;
}

/** Directory a rule file governs: its own, with a trailing `/insights` removed (`''` at the root). */
function scopeOf(path: string): string {
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  if (dir === 'insights') return '';
  return dir.endsWith('/insights') ? dir.slice(0, -'/insights'.length) : dir;
}

/**
 * Read the repo's rule files at the PR's BASE sha (never head: the head is
 * author-controlled, so a PR could edit a gotchas file to excuse its own
 * defect). Never throws — an unreadable file only bumps `missing`.
 */
export async function loadRepoRules(
  git: Pick<GitClient, 'readFileAt'>,
  repo: RepoRef,
  baseSha: string | null | undefined,
  changedPaths: readonly string[],
): Promise<LoadedRepoRules> {
  if (!baseSha) return { sets: [], read: 0, missing: 0 };
  const sets: RepoRuleSet[] = [];
  let read = 0;
  let missing = 0;
  for (const path of ruleCandidatePaths(changedPaths)) {
    let content: string;
    try {
      content = await git.readFileAt(repo, baseSha, path);
    } catch {
      missing++;
      continue;
    }
    read++;
    const text = extractRuleText(path, content);
    if (text) sets.push({ scope: scopeOf(path), source: path, text });
  }
  return { sets, read, missing };
}
