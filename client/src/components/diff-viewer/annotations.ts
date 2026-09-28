/* Finding-agnostic line annotations for the DiffViewer (spec 007, S12/S26).
   Lets a route-specific feature (Smart Diff's inline findings, S13/S14) inject
   content under a rendered line without diff-viewer knowing what a "finding"
   is — modelled on `comments.ts`'s thread partitioning, one side (RIGHT/new)
   only, since a finding always anchors to `start_line`…`end_line` on the new
   file (D18-A: every rendered added line in the range gets a marker, the
   content anchors under the last one). */
import type { ReactNode } from "react";
import { lineKey } from "./comments";
import type { Line } from "./helpers";

/** One piece of content anchored to a rendered diff line, or a range of them.
    `color`/`label` are omitted for an item that must keep its content (the
    inline card) without contributing to the line's severity bar or
    right-side label — a dismissed finding, per D4. */
export interface DiffLineAnnotation {
  id: string;
  path: string;
  /** RIGHT (new) side line number — start of the range. */
  line: number;
  /** RIGHT (new) side, inclusive end of the range. `undefined` = single line. */
  endLine?: number;
  color?: string;
  label?: string;
  /** Rendered before the label text in the line's marker pill. */
  icon?: ReactNode;
  content: ReactNode;
}

/** What DiffViewer/FileCard need to render annotations across all files. */
export interface DiffAnnotationApi {
  items: DiffLineAnnotation[];
  /** Paths that should show the file-header dot. */
  markedPaths: ReadonlySet<string>;
  markerLabel: string;
  unanchoredTitle: string;
  /** When false, injected content (cards, the unanchored block) is hidden —
      the marker bar/label and the file-header dot stay. `undefined` = shown
      (S19, the DiffTab comments/findings toggle). */
  showContent?: boolean;
}

/**
 * Split one file's annotations into per-line **markers** (bar + label pill),
 * per-line **content** (the injected block, anchored under the last marked
 * line of a range) and "unanchored" ones (no line of the range is rendered —
 * e.g. a finding entirely on LEFT-only/deleted lines), so nothing is silently
 * dropped (D18-A):
 *
 * 1. every rendered RIGHT `add` line within `line…(endLine ?? line)` is a mark;
 * 2. if none matched and `RIGHT:line` is rendered (any kind), that line is the
 *    (single) mark — covers a range with only context lines rendered;
 * 3. if still no mark, the item is unanchored;
 * 4. otherwise the item marks every matched line, and its content anchors on
 *    the last one.
 */
export function partitionAnnotations(
  items: DiffLineAnnotation[],
  lines: Line[],
): {
  markers: Map<string, DiffLineAnnotation[]>;
  content: Map<string, DiffLineAnnotation[]>;
  unanchored: DiffLineAnnotation[];
} {
  const markers = new Map<string, DiffLineAnnotation[]>();
  const content = new Map<string, DiffLineAnnotation[]>();
  const unanchored: DiffLineAnnotation[] = [];

  const rightKeys = new Set<string>();
  const rightAddKeys = new Set<string>();
  for (const ln of lines) {
    if (ln.kind !== "add" && ln.kind !== "ctx") continue;
    const key = lineKey("RIGHT", ln.newNo);
    if (!key) continue;
    rightKeys.add(key);
    if (ln.kind === "add") rightAddKeys.add(key);
  }

  for (const item of items) {
    const end = item.endLine ?? item.line;
    const marks: string[] = [];
    for (let n = item.line; n <= end; n++) {
      const key = lineKey("RIGHT", n);
      if (key && rightAddKeys.has(key)) marks.push(key);
    }
    if (marks.length === 0) {
      const fallback = lineKey("RIGHT", item.line);
      if (fallback && rightKeys.has(fallback)) marks.push(fallback);
    }
    if (marks.length === 0) {
      unanchored.push(item);
      continue;
    }
    for (const key of marks) {
      const list = markers.get(key) ?? [];
      list.push(item);
      markers.set(key, list);
    }
    const lastKey = marks[marks.length - 1]!;
    const list = content.get(lastKey) ?? [];
    list.push(item);
    content.set(lastKey, list);
  }

  return { markers, content, unanchored };
}

/** The annotations anchored to one rendered line (RIGHT side only) from
    either the `markers` or the `content` map returned by
    `partitionAnnotations`. */
export function annotationsForLine(
  ln: Line,
  matched: Map<string, DiffLineAnnotation[]>,
): DiffLineAnnotation[] {
  if (matched.size === 0) return [];
  if (ln.kind !== "add" && ln.kind !== "ctx") return [];
  const key = lineKey("RIGHT", ln.newNo);
  return key ? (matched.get(key) ?? []) : [];
}
