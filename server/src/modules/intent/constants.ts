/**
 * Tunables for the PR intent link extractor (spec 006 S9) and the
 * classification orchestration (S10). Pure module constants — no I/O.
 */

/** GitHub + GitLab closing keywords; GitLab also treats "implement(s|ed|ing)"
 * as a closing reference. Kept SEPARATE from the adapters' own
 * `resolveLinkedIssue` regex (`octokit.ts:128`, `gitlab/rest.ts:239`), whose
 * keyword group is optional and therefore matches the first bare `#N` — the
 * intent extractor does not inherit that bug. */
export const ISSUE_CLOSING_KEYWORD_RE =
  '(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|implement(?:s|ed|ing)?)';

/** `owner/repo#N` or bare `#N`, optionally preceded by a closing keyword.
 * Group 1 is the optional `owner/repo`; group 2 is the issue number. */
export const ISSUE_TEXT_RE = new RegExp(
  `(?:\\b${ISSUE_CLOSING_KEYWORD_RE}\\b[:\\s]+)?([\\w.-]+\\/[\\w.-]+)?#(\\d+)`,
  'gi',
);

/** Repo-relative doc/spec/plan/RFC/ADR paths the classifier may read as a
 * linked doc (`docs/…`, `specs/…`, `plans/…`, `rfc(s)/…`, `adr/…`). The
 * negative lookbehind requires the match to START the path token — `\b`
 * alone also fires mid-path (e.g. the `docs/x.md` suffix of
 * `server/docs/x.md`), which would read a nested, unrelated directory as a
 * repo-root doc path (V4). */
export const DOC_PATH_RE = /(?<![\w/])(?:docs|specs|plans|rfcs?|adr)\/[\w.\-/]+\.(?:md|mdx|txt)\b/gi;

/** A bare http(s) URL token, stopping at whitespace or common wrapping
 * punctuation (markdown `()`/`[]`, quotes) so a trailing `)` in prose text
 * isn't swallowed into the ref. */
export const URL_TOKEN_RE = /https?:\/\/[^\s)>\]"']+/g;

/** Cap on a linked doc's content before it enters the classifier prompt
 * (S10 step 5); the classifier's own per-doc cap (`INTENT_MAX_DOC_CHARS` in
 * reviewer-core) trims further once inside the prompt. */
export const MAX_DOC_BYTES = 64 * 1024;

/** Per-source (issue / doc) fetch timeout (S10 assumption) — one slow forge
 * or git call must not stall the whole classification. */
export const SOURCE_TIMEOUT_MS = 10_000;

/** Overall budget for `IntentService.ensureForReview` (staleness check +
 * `runClassification`) — a review must not stall on intent resolution.
 * The manual `classify` route (Re-classify) is NOT bounded by this (Fix R1). */
export const INTENT_REVIEW_BUDGET_MS = 20_000;
