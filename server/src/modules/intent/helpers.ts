import { createHash } from 'node:crypto';
import { INTENT_MAX_DOCS, INTENT_MAX_ISSUES } from '@devdigest/reviewer-core';
import type { ForgeProvider, IntentConfidence } from '@devdigest/shared';
import { DOC_PATH_RE, ISSUE_TEXT_RE, URL_TOKEN_RE } from './constants.js';

/**
 * Pure helpers behind the intent classifier (spec 006 S9): link extraction
 * from the PR body, ref redaction, hunk-header trimming, description
 * hashing/staleness, and confidence capping. No fetch, no fs, no db — every
 * fact the classifier needs is passed in already resolved by `IntentService`.
 */

// ---------------------------------------------------------------------------
// Link extraction
// ---------------------------------------------------------------------------

export interface IntentLinkForge {
  /** The forge HOST (`github.com`, `git.acme.com`) — checked BEFORE a URL's
   * path is interpreted, never after (server gotcha: a hint field must never
   * widen a trusted set). */
  host: string;
  owner: string;
  name: string;
  provider: ForgeProvider;
}

export interface ExtractedIssueLink {
  owner: string;
  name: string;
  number: number;
  /** Display/redacted ref, e.g. `#42` or `acme/other-repo#7`. */
  ref: string;
}

export interface ExtractedDocLink {
  /** Repo-relative path to read at the PR head via `GitClient.readFileAt`. */
  path: string;
  /** Display/redacted ref (the bare path, or the blob URL with creds/query stripped). */
  ref: string;
}

export interface ExtractedExternalLink {
  /** Redacted ref — recorded as `unsupported`, never fetched (D3-A). */
  ref: string;
}

export interface ExtractedLinks {
  issues: ExtractedIssueLink[];
  docs: ExtractedDocLink[];
  external: ExtractedExternalLink[];
}

/** Split an `owner/repo` (or GitLab nested `group/subgroup/project`) path into
 * `[owner, name]`. The LAST segment is the project name, everything before it
 * is the owner/group path — taking only `parts[0]`/`parts[1]` (V7) truncates a
 * nested GitLab group to its first subgroup. Returns `undefined` when there
 * are fewer than two segments (nothing to split). */
function parseOwnerName(ownerRepo: string): [string, string] | undefined {
  const parts = ownerRepo.split('/').filter(Boolean);
  if (parts.length < 2) return undefined;
  const name = parts[parts.length - 1]!;
  const owner = parts.slice(0, -1).join('/');
  return [owner, name];
}

function splitOwnerName(ownerRepo: string, fallback: { owner: string; name: string }): [string, string] {
  return parseOwnerName(ownerRepo) ?? [fallback.owner, fallback.name];
}

/**
 * Extract issue refs, linked docs and external links from a PR body/description.
 *
 * The host allowlist is checked FIRST for every URL — a link naming another
 * host is always `external`, regardless of how much it looks like an issue or
 * blob URL (server INSIGHTS 2026-09-23, "disambiguation field ≠ trust
 * grant"). `owner/repo#N` is D7: allowed because the token used to fetch it
 * (`container.forge(repo)`) never leaves the CURRENT forge host — a
 * same-host, different-repo issue is still fetched with that host's token,
 * never a foreign one.
 */
export function extractIntentLinks(
  body: string | null | undefined,
  forge: IntentLinkForge,
): ExtractedLinks {
  const text = body ?? '';
  const issues = new Map<string, ExtractedIssueLink>();
  const docs = new Map<string, ExtractedDocLink>();
  const external = new Map<string, ExtractedExternalLink>();

  // 1. URLs first, and stripped out of the text afterwards so the bare-#N and
  // bare-doc-path passes below never re-read a substring that a URL already
  // classified (avoids double-counting a path that appears inside a blob URL).
  let stripped = text;
  for (const raw of text.match(URL_TOKEN_RE) ?? []) {
    stripped = stripped.replace(raw, ' ');
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue; // not a well-formed URL — drop it, don't guess
    }
    // Only http(s) is ever considered; `file:`/`ftp:`/etc. are rejected
    // outright (URL_TOKEN_RE already only matches http(s)://, this is belt
    // and suspenders against a scheme smuggled via redirects in the match).
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;

    const ref = redactRef(raw);
    if (url.host !== forge.host) {
      external.set(ref, { ref });
      continue;
    }

    const issueMatch = url.pathname.match(/^\/(.+?)\/(?:-\/)?(?:issues|merge_requests)\/(\d+)\/?$/);
    const issueOwnerRepo = issueMatch?.[1];
    const issueNumStr = issueMatch?.[2];
    if (issueOwnerRepo !== undefined && issueNumStr !== undefined) {
      const [owner, name] = splitOwnerName(issueOwnerRepo, forge);
      const number = Number(issueNumStr);
      const key = `${owner}/${name}#${number}`;
      issues.set(key, { owner, name, number, ref: key });
      continue;
    }

    const blobMatch = url.pathname.match(/^\/(.+?)\/(?:-\/)?blob\/[^/]+\/(.+)$/);
    const blobOwnerRepo = blobMatch?.[1];
    const blobPath = blobMatch?.[2];
    // V1: a same-host blob URL is only a doc of THIS repo when its
    // owner/name (GitLab: the full group path) matches the forge repo —
    // otherwise it's a blob of some other repo on the same host and must be
    // `external`, never read as if it were our own file.
    // V10: the match is case-INSENSITIVE — GitHub and GitLab both route
    // owner/repo paths case-insensitively, so `.../Acme/Repo/blob/...` on
    // repo `acme/repo` is still this repo's doc, not an external link. The
    // host check above stays exact: hosts are already lower-cased by `URL`.
    const blobOwner = blobOwnerRepo !== undefined ? parseOwnerName(blobOwnerRepo) : undefined;
    if (
      blobPath !== undefined &&
      blobOwner !== undefined &&
      blobOwner[0].toLowerCase() === forge.owner.toLowerCase() &&
      blobOwner[1].toLowerCase() === forge.name.toLowerCase() &&
      /\.(?:md|mdx|txt)$/i.test(blobPath)
    ) {
      docs.set(blobPath, { path: blobPath, ref });
      continue;
    }

    external.set(ref, { ref });
  }

  // 2. Bare `#N` / `owner/repo#N`, optionally after a closing keyword.
  for (const m of stripped.matchAll(ISSUE_TEXT_RE)) {
    const ownerRepo = m[1];
    const numStr = m[2];
    const number = Number(numStr);
    if (!Number.isFinite(number)) continue;
    const [owner, name] = ownerRepo ? splitOwnerName(ownerRepo, forge) : [forge.owner, forge.name];
    const key = `${owner}/${name}#${number}`;
    const ref = ownerRepo ? key : `#${number}`;
    issues.set(key, { owner, name, number, ref });
  }

  // 3. Bare repo-relative doc paths.
  for (const m of stripped.matchAll(DOC_PATH_RE)) {
    const path = m[0] ?? '';
    if (!path) continue;
    docs.set(path, { path, ref: path });
  }

  return {
    issues: [...issues.values()].slice(0, INTENT_MAX_ISSUES),
    docs: [...docs.values()].slice(0, INTENT_MAX_DOCS),
    external: [...external.values()],
  };
}

/** Strip userinfo, query and fragment from a URL — never store or log a raw
 * link with credentials or a `?token=`. Non-URL input (a bare repo-relative
 * path) is returned unchanged; there is nothing in it to redact. */
export function redactRef(ref: string): string {
  try {
    const url = new URL(ref);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return ref;
  }
}

// ---------------------------------------------------------------------------
// Diff hunk headers
// ---------------------------------------------------------------------------

const HUNK_HEADER_RE = /^(@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@)/;

/** Keep only the NUMERIC `@@ -a,b +c,d @@` header of each hunk line in a
 * stored `pr_files.patch`; the trailing function-context text and every hunk
 * body line are dropped (spec 006 AC3 — no hunk bodies ever reach the model). */
export function headersFromPatch(patch: string | null | undefined): string[] {
  if (!patch) return [];
  const headers: string[] = [];
  for (const line of patch.split('\n')) {
    const m = line.match(HUNK_HEADER_RE);
    const header = m?.[1];
    if (header !== undefined) headers.push(header);
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Description hashing & staleness
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\s+$/, '');
}

/** sha256 of `title + NUL + body`, after normalising line endings and
 * trimming trailing whitespace, so a re-save that only changes CRLF or
 * trailing blank lines doesn't mark the intent stale. Only the hash is ever
 * stored or logged — never the title/body text itself. */
export function descriptionHash(title: string, body: string | null | undefined): string {
  const t = normalize(title);
  const b = normalize(body ?? '');
  return createHash('sha256').update(`${t}\u0000${b}`).digest('hex');
}

export type StaleReason = 'head_moved' | 'description_changed';

export interface StalenessRecord {
  headSha: string | null;
  descriptionHash: string | null;
}

export interface StalenessPull {
  headSha: string;
  title: string;
  body: string | null;
}

/** Whether a stored `pr_intent` record still describes the PR's current head
 * + title/description. `head_moved` wins when both changed. */
export function staleness(
  record: StalenessRecord,
  pull: StalenessPull,
): { stale: boolean; staleReason: StaleReason | null } {
  if (record.headSha !== pull.headSha) return { stale: true, staleReason: 'head_moved' };
  if (record.descriptionHash !== descriptionHash(pull.title, pull.body)) {
    return { stale: true, staleReason: 'description_changed' };
  }
  return { stale: false, staleReason: null };
}

// ---------------------------------------------------------------------------
// Confidence capping
// ---------------------------------------------------------------------------

const CONFIDENCE_RANK: Record<IntentConfidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * Cap the model's self-reported confidence per spec 006 S9:
 * - no description AND no ok linked source → `low`;
 * - any failed/unsupported linked source → at most `medium`;
 * - otherwise the model's own value.
 */
export function capConfidence(
  model: IntentConfidence,
  ctx: { hasDescription: boolean; okLinked: number; failedLinked: number },
): IntentConfidence {
  if (!ctx.hasDescription && ctx.okLinked === 0) return 'low';
  if (ctx.failedLinked > 0 && CONFIDENCE_RANK[model] > CONFIDENCE_RANK.medium) return 'medium';
  return model;
}
