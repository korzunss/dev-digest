import { ConventionCategory } from '@devdigest/shared';
import type {
  ConventionCandidate,
  ConventionCategory as ConventionCategoryName,
  ConventionSkillPreview,
} from '@devdigest/shared';

/**
 * Accepted candidates → the skill(s) they would become. PURE: no DB, no clone,
 * no model. Nothing here is persisted — the modal holds the result, the user
 * edits it, and only a confirmed preview comes back as a create, which is why
 * this stage has to be able to run without touching a row.
 *
 * Deterministic by construction: the same candidates must render byte-identical
 * markdown every time, or "re-scan preserves decisions" turns into a diff of
 * reshuffled sections every time someone reopens the modal.
 */

/** Categories render in contract declaration order — see `ConventionCategory`. */
const CATEGORY_ORDER = ConventionCategory.options;

/** Words that carry no identity in a rule slug: every rule starts with one. */
const SLUG_STOP_WORDS: ReadonlySet<string> = new Set([
  'a',
  'all',
  'always',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'by',
  'do',
  'every',
  'for',
  'from',
  'in',
  'instead',
  'is',
  'it',
  'its',
  'must',
  'never',
  'not',
  'of',
  'on',
  'or',
  'over',
  'prefer',
  'rather',
  'should',
  'that',
  'the',
  'this',
  'to',
  'use',
  'using',
  'via',
  'when',
  'with',
]);

/** Words kept in a rule slug — a heading, not a sentence. */
const SLUG_MAX_WORDS = 8;

/** Markdown fence label per extension. Unknown extensions get a bare fence. */
const FENCE_LANGUAGES: Readonly<Record<string, string>> = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.mts': 'ts',
  '.cts': 'ts',
  '.js': 'js',
  '.jsx': 'jsx',
  '.mjs': 'js',
  '.cjs': 'js',
  '.py': 'python',
  '.go': 'go',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.php': 'php',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.sql': 'sql',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.json': 'json',
  '.jsonc': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.md': 'md',
};

/**
 * Ordering comparator for the two string keys below. Deliberately NOT
 * `localeCompare`: its result depends on the host's ICU data, and "the same
 * candidates render the same markdown" has to hold across machines, not just
 * across two calls in one process.
 */
function compareStrings(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Lowercase, kebab, `[a-z0-9-]` only — safe as a skill name and as an anchor. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The `##` heading for one rule. Filler words are dropped so the heading reads
 * as the rule's identity ("Always use async/await instead of .then() chains."
 * → `async-await-then-chains`) rather than as the whole sentence hyphenated.
 * If a rule is nothing BUT filler, keep the unfiltered words — an empty heading
 * would be worse than a verbose one.
 */
function ruleSlug(rule: string): string {
  const words = slugify(rule).split('-').filter(Boolean);
  const meaningful = words.filter((w) => !SLUG_STOP_WORDS.has(w));
  const kept = (meaningful.length > 0 ? meaningful : words).slice(0, SLUG_MAX_WORDS);
  return kept.join('-') || 'convention';
}

/** `path:line` for a one-line citation, `path:start-end` for a span. */
function citation(candidate: ConventionCandidate): string {
  const { evidence_path, evidence_line, evidence_end_line } = candidate;
  return evidence_end_line > evidence_line
    ? `${evidence_path}:${evidence_line}-${evidence_end_line}`
    : `${evidence_path}:${evidence_line}`;
}

function fenceLanguage(path: string): string {
  const at = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  if (at <= slash + 1) return '';
  return FENCE_LANGUAGES[path.slice(at).toLowerCase()] ?? '';
}

/**
 * Fence a snippet without letting it close its own block. The evidence is
 * verbatim repo source, so a snippet lifted out of a markdown file carries
 * its own ``` run — a fixed three-backtick fence would end the block mid-quote
 * and spill the rest of the skill body into prose.
 */
function fenceSnippet(snippet: string, language: string): string {
  const longestRun = Math.max(0, ...[...snippet.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  return `${fence}${language}\n${snippet.replace(/\s+$/, '')}\n${fence}`;
}

/**
 * Flattened to one line before it is rendered: a rule is metadata typed by a
 * person (inline edit on the card), and one carrying a newline could otherwise
 * forge a second `##` section inside the body. Same reasoning as
 * `renderSkillBlock` applies to a skill's name.
 */
function renderRule(candidate: ConventionCandidate): string {
  const rule = candidate.rule.replace(/\s+/g, ' ').trim();
  return [
    `## ${ruleSlug(candidate.rule)}`,
    rule,
    '',
    `Detected in \`${citation(candidate)}\`:`,
    '',
    fenceSnippet(candidate.evidence_snippet, fenceLanguage(candidate.evidence_path)),
  ].join('\n');
}

/**
 * Strongest first, then a total tie-break on keys every candidate has. Without
 * the tail keys two equally confident rules would swap places between calls
 * depending on the order the repository happened to return rows in.
 */
function ordered(candidates: ConventionCandidate[]): ConventionCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      b.confidence - a.confidence ||
      compareStrings(a.evidence_path, b.evidence_path) ||
      a.evidence_line - b.evidence_line ||
      compareStrings(a.id, b.id),
  );
}

/**
 * Group by category, categories in declaration order; empty groups dropped.
 *
 * Anything carrying a category the contract does not list is appended rather
 * than discarded. `text(..., { enum })` puts no constraint in SQL, so a value
 * retired from the enum still reads back out of an old row — and a candidate a
 * person accepted must not vanish from the skill because of a vocabulary change.
 */
function byCategory(
  candidates: ConventionCandidate[],
): { category: ConventionCategoryName; candidates: ConventionCandidate[] }[] {
  const known: readonly string[] = CATEGORY_ORDER;
  const extra = [...new Set(candidates.map((c) => c.category).filter((c) => !known.includes(c)))];

  return [...CATEGORY_ORDER, ...extra.sort(compareStrings)]
    .map((category) => ({
      category,
      candidates: ordered(candidates.filter((c) => c.category === category)),
    }))
    .filter((group) => group.candidates.length > 0);
}

/** Inline code spans hold the repo name, so a backtick in it would break out. */
function inlineSafe(repoName: string): string {
  return repoName.replace(/[`\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function renderBody(name: string, repoName: string, candidates: ConventionCandidate[]): string {
  return [
    `# ${name}`,
    '',
    `House conventions for \`${inlineSafe(repoName)}\`. Flag changes that violate any rule below`,
    'and cite the offending `file:line`.',
    '',
    candidates.map(renderRule).join('\n\n'),
  ].join('\n');
}

function preview(
  name: string,
  description: string,
  repoName: string,
  candidates: ConventionCandidate[],
): ConventionSkillPreview {
  return {
    name,
    description,
    type: 'convention',
    body: renderBody(name, repoName, candidates),
    // First-cited order, de-duplicated: the same file backs several rules more
    // often than not, and `evidence_files` is a set of sources, not a log.
    evidence_files: [...new Set(candidates.map((c) => c.evidence_path))],
    candidate_ids: candidates.map((c) => c.id),
  };
}

/**
 * Build the skill preview(s) for a set of candidates.
 *
 * `candidates` is expected to be ALREADY filtered to `status: 'accepted'` — the
 * commit route re-derives that set server-side rather than trusting ids from the
 * modal, so the filter belongs one layer up and this stage renders what it is
 * handed. Passing a rejected candidate here would put it in a skill.
 *
 * `split` swaps one merged skill for one per category present; a category with
 * no candidates yields no preview rather than an empty skill.
 */
export function buildSkillPreviews(input: {
  repoName: string;
  candidates: ConventionCandidate[];
  split: boolean;
}): ConventionSkillPreview[] {
  const { repoName, candidates, split } = input;
  if (candidates.length === 0) return [];

  const groups = byCategory(candidates);
  const repoSlug = slugify(repoName) || 'repo';

  if (!split) {
    const merged = groups.flatMap((g) => g.candidates);
    return [
      preview(
        `${repoSlug}-conventions`,
        `${merged.length} house conventions extracted from ${repoName}`,
        repoName,
        merged,
      ),
    ];
  }

  return groups.map((group) =>
    preview(
      `${repoSlug}-${group.category}`,
      `${group.candidates.length} ${group.category} conventions extracted from ${repoName}`,
      repoName,
      group.candidates,
    ),
  );
}
