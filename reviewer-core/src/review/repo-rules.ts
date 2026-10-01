/**
 * Pure repo-context selection (plan 10, D2). The caller loads repo rules (at
 * the PR's base SHA) and hands them in as plain strings; the engine only picks
 * which rule sets apply to a chunk by PATH PREFIX — no I/O, no keyword scanning.
 */

/** One repo rules document, scoped to a directory. */
export interface RepoRuleSet {
  /** `''` for the repo root, else a directory with no trailing `/`. */
  scope: string;
  /** Repo path the text came from (shown to the model). */
  source: string;
  text: string;
}

export const DEFAULT_REPO_RULES_MAX_CHARS = 8000;
export const DEFAULT_CHANGED_FILES_MAX = 200;
export const DEFAULT_CHANGED_FILES_MAX_CHARS = 8000;

export interface RepoContextCaps {
  rulesMaxChars?: number;
  filesMaxPaths?: number;
  filesMaxChars?: number;
}

const TRUNCATED = '\n[truncated]';

function depth(scope: string): number {
  return scope === '' ? 0 : scope.split('/').length;
}

/**
 * Keep a set when it is the root set or `scope + '/'` prefixes any path
 * (so `server` matches `server/a.ts`, never `server-x/a.ts`). Deepest scope
 * first, root last. Stops before exceeding `maxChars`; the set that crosses
 * the cap is truncated with a `[truncated]` marker.
 */
export function selectRepoRules(
  sets: readonly RepoRuleSet[],
  paths: readonly string[],
  maxChars: number,
): RepoRuleSet[] {
  const kept = sets
    .filter((s) => s.scope === '' || paths.some((p) => p.startsWith(`${s.scope}/`)))
    .map((s, i) => ({ s, i }))
    .sort((a, b) => depth(b.s.scope) - depth(a.s.scope) || a.i - b.i)
    .map((x) => x.s);

  const out: RepoRuleSet[] = [];
  let used = 0;
  for (const s of kept) {
    const remaining = maxChars - used;
    if (remaining <= 0) break;
    if (s.text.length <= remaining) {
      out.push(s);
      used += s.text.length;
      continue;
    }
    out.push({ ...s, text: s.text.slice(0, remaining) + TRUNCATED });
    break;
  }
  return out;
}

/** `Files changed in this PR (N):` + one `- path` per line, `… +K more` past a cap. */
export function renderChangedFiles(
  paths: readonly string[],
  maxPaths: number,
  maxChars: number,
): string {
  const header = `Files changed in this PR (${paths.length}):`;
  const lines: string[] = [];
  let chars = 0;
  for (const p of paths) {
    const line = `- ${p}`;
    if (lines.length >= maxPaths || chars + line.length + 1 > maxChars) break;
    lines.push(line);
    chars += line.length + 1;
  }
  const rest = paths.length - lines.length;
  return [header, ...lines, ...(rest > 0 ? [`… +${rest} more`] : [])].join('\n');
}

/**
 * Memory items for one chunk: one item per applicable rule set, plus the
 * changed-file list when `allPaths` is given (and non-empty).
 */
export function buildRepoContext(
  sets: readonly RepoRuleSet[],
  chunkPaths: readonly string[],
  allPaths: readonly string[] | undefined,
  caps: RepoContextCaps = {},
): string[] {
  const items = selectRepoRules(
    sets,
    chunkPaths,
    caps.rulesMaxChars ?? DEFAULT_REPO_RULES_MAX_CHARS,
  ).map(
    (s) =>
      `Rules from ${s.source} (applies to ${s.scope === '' ? 'whole repo' : `${s.scope}/`}):\n${s.text}`,
  );
  if (allPaths && allPaths.length > 0) {
    items.push(
      renderChangedFiles(
        allPaths,
        caps.filesMaxPaths ?? DEFAULT_CHANGED_FILES_MAX,
        caps.filesMaxChars ?? DEFAULT_CHANGED_FILES_MAX_CHARS,
      ),
    );
  }
  return items;
}
