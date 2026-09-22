import { SNIPPET_MAX_LINES } from './constants.js';
import { fingerprintFor, normalizeSnippet } from './helpers.js';
import type {
  DropReason,
  GroundedCandidate,
  GroundingResult,
  RawCandidate,
  SampleFile,
} from './types.js';

/**
 * The evidence gate — the deliberate mirror of `groundFindings()`, and the
 * reason anything this feature produces is worth trusting.
 *
 * A rule survives only if the file it cites was actually shown to the model and
 * the snippet it quotes really occurs in that file. Everything else is dropped
 * and counted. Like the review gate this is not a knob: when candidates go
 * missing, read the tally before suspecting the model.
 *
 * Pure. No I/O.
 */

/** Below this a "rule" is a fragment, not something a diff can violate. Mirrors
 *  the `rule: z.string().min(8)` in the model-facing extraction schema. */
const MIN_RULE_CHARS = 8;

/** One non-blank line of a file, projected into the normalised haystack. */
interface Segment {
  /** 1-based line number in the original file. */
  line: number;
  /** Offset of the line's first character in the haystack. */
  start: number;
  /** Offset one past the line's last character. */
  end: number;
}

interface NormalizedFile {
  /** Every non-blank line, whitespace-collapsed and joined by single spaces. */
  haystack: string;
  segments: Segment[];
}

/**
 * Flatten a file into one whitespace-normalised string plus a map back to line
 * numbers.
 *
 * Joining the lines is what lets a snippet spanning several lines match: the
 * model returns it as one quoted block, and after normalisation both sides are
 * a single run of space-separated tokens. Blank lines are skipped so a gap in
 * the source cannot break a match that a reader would call identical.
 */
function normalizeFile(file: SampleFile): NormalizedFile {
  const segments: Segment[] = [];
  let haystack = '';

  for (let i = 0; i < file.lines.length; i++) {
    const text = normalizeSnippet(file.lines[i] ?? '');
    if (text === '') continue;
    if (haystack.length > 0) haystack += ' ';
    const start = haystack.length;
    haystack += text;
    segments.push({ line: i + 1, start, end: haystack.length });
  }

  return { haystack, segments };
}

/** The line holding `offset`. Offsets land on a non-space character (needles are
 *  trimmed), so exactly one segment covers each one. */
function lineAt(segments: Segment[], offset: number): number {
  for (const seg of segments) {
    if (offset >= seg.start && offset < seg.end) return seg.line;
  }
  return segments[segments.length - 1]?.line ?? 1;
}

/** The line holding the character just before `offset` (a half-open end). */
function lineBefore(segments: Segment[], offset: number): number {
  return lineAt(segments, Math.max(offset - 1, 0));
}

/**
 * Where the snippet really sits, as a line span — or `null` if it is not there.
 *
 * When the snippet occurs more than once (a closing brace, a common one-liner)
 * we take the occurrence NEAREST the claimed line rather than the first. The
 * model is being trusted for the quote and only roughly for the count, so the
 * claim is still the best hint available about which copy it meant.
 */
function locate(
  normalized: NormalizedFile,
  needle: string,
  claimedLine: number,
): { start: number; end: number } | null {
  let best: { start: number; end: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let at = normalized.haystack.indexOf(needle); at !== -1; ) {
    const start = lineAt(normalized.segments, at);
    const distance = Math.abs(start - claimedLine);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { start, end: lineBefore(normalized.segments, at + needle.length) };
    }
    at = normalized.haystack.indexOf(needle, at + 1);
  }

  return best;
}

/**
 * Run every model-proposed candidate through the gate.
 *
 * Order matters: a candidate is judged on its rule, then on whether it cites a
 * file we showed it, then on whether the quote is real, and only then against
 * what we have already kept — so the tally attributes each drop to the FIRST
 * thing wrong with it and the per-reason counts stay comparable between runs.
 */
export function groundConventions(
  candidates: RawCandidate[],
  files: SampleFile[],
): GroundingResult {
  const sampled = new Map<string, NormalizedFile>();
  for (const file of files) sampled.set(file.path, normalizeFile(file));

  const kept: GroundedCandidate[] = [];
  const seen = new Set<string>();
  const dropped: Partial<Record<DropReason, number>> = {};
  const drop = (reason: DropReason) => {
    dropped[reason] = (dropped[reason] ?? 0) + 1;
  };

  for (const candidate of candidates) {
    const rule = (candidate.rule ?? '').trim();
    if (rule.length < MIN_RULE_CHARS) {
      drop('empty_rule');
      continue;
    }

    const normalized = sampled.get(candidate.evidence_path);
    if (!normalized) {
      // The model cannot cite a file it was never given; a path it produced on
      // its own is a guess, and the GitHub deep-link on the card would 404.
      drop('unsampled_file');
      continue;
    }

    const needle = normalizeSnippet(candidate.evidence_snippet ?? '');
    // An empty needle would match at offset 0 and "ground" against any file.
    const span = needle === '' ? null : locate(normalized, needle, candidate.evidence_line);
    if (!span) {
      drop('snippet_absent');
      continue;
    }

    const fingerprint = fingerprintFor(rule, candidate.evidence_path);
    if (seen.has(fingerprint)) {
      drop('duplicate');
      continue;
    }
    seen.add(fingerprint);

    kept.push({
      ...candidate,
      rule,
      // The snippet IS in the file, just not where the model said. Models quote
      // well and count badly; dropping here would throw away a true rule over an
      // off-by-three, so the line is corrected instead.
      evidence_line: span.start,
      evidence_end_line: Math.min(span.end, span.start + SNIPPET_MAX_LINES - 1),
      fingerprint,
    });
  }

  return { kept, raw: candidates.length, dropped };
}
