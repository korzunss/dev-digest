import type { BlastRadius, PrBriefModelOutput, ReviewFocusItem, Risk } from '@devdigest/shared';
import { changedLineRanges, type LineRange } from '../_shared/diff-hunks.js';
import { FOCUS_MAX, RISK_FILE_REFS_MAX } from './constants.js';

/**
 * What the model may point at, built from ALL PR files and the FULL blast
 * result — not the (possibly trimmed) prompt copy.
 */
export interface GroundingContext {
  diffFiles: Map<string, LineRange[]>;
  blastFiles: Set<string>;
  callerLines: Map<string, Set<number>>;
}

/** Trim; strip a leading `./` or `/`; strip a trailing `:<digits>`. */
export function normaliseRef(s: string): string {
  let out = s.trim();
  for (;;) {
    if (out.startsWith('./')) out = out.slice(2);
    else if (out.startsWith('/')) out = out.slice(1);
    else break;
  }
  return out.replace(/:\d+$/, '');
}

export function groundingContext(
  files: readonly { path: string; patch: string | null }[],
  blast: BlastRadius | undefined | null,
): GroundingContext {
  const diffFiles = new Map<string, LineRange[]>();
  for (const f of files) diffFiles.set(f.path, changedLineRanges(f.patch));
  const blastFiles = new Set<string>();
  const callerLines = new Map<string, Set<number>>();
  for (const s of blast?.changed_symbols ?? []) blastFiles.add(s.file);
  for (const d of blast?.downstream ?? []) {
    for (const c of d.callers) {
      blastFiles.add(c.file);
      let lines = callerLines.get(c.file);
      if (!lines) callerLines.set(c.file, (lines = new Set()));
      lines.add(c.line);
    }
  }
  return { diffFiles, blastFiles, callerLines };
}

function groundRisk(risk: Risk, ctx: GroundingContext): Risk | null {
  const refs: string[] = [];
  for (const raw of risk.file_refs) {
    const ref = normaliseRef(raw);
    if (!ctx.diffFiles.has(ref) && !ctx.blastFiles.has(ref)) continue;
    if (!refs.includes(ref)) refs.push(ref);
    if (refs.length === RISK_FILE_REFS_MAX) break;
  }
  return refs.length ? { ...risk, file_refs: refs } : null;
}

function focusAllowed(item: ReviewFocusItem, file: string, ctx: GroundingContext): boolean {
  if (item.line <= 0) return false;
  const ranges = ctx.diffFiles.get(file);
  if (ranges?.some((r) => item.line >= r.start && item.line <= r.end)) return true;
  return ctx.callerLines.get(file)?.has(item.line) ?? false;
}

/**
 * Drop everything the model invented: a risk with no real file left, a focus
 * item outside the changed hunks / caller lines. The model's paths and lines
 * are never trusted; dropped items vanish silently.
 */
export function groundBrief(
  output: PrBriefModelOutput,
  ctx: GroundingContext,
): { summary: string; risks: Risk[]; review_focus: ReviewFocusItem[] } {
  const risks = output.risks.flatMap((r) => {
    const g = groundRisk(r, ctx);
    return g ? [g] : [];
  });
  const seen = new Set<string>();
  const review_focus: ReviewFocusItem[] = [];
  for (const item of output.review_focus) {
    const file = normaliseRef(item.file);
    if (!focusAllowed(item, file, ctx)) continue;
    const key = `${file}:${item.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    review_focus.push({ ...item, file });
    if (review_focus.length === FOCUS_MAX) break;
  }
  return { summary: output.summary, risks, review_focus };
}
