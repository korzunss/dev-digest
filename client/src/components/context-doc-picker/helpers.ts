/**
 * Pure helpers for the context-doc picker.
 *
 * The two list operations the picker shares with the agent editor's SkillsTab —
 * `toggleAttachment` and `moveId` — live in `@/lib/attachment-order` and are
 * imported by the component, not copied: the ordering rule must not fork. Everything here keys on `path`.
 */
import type { SpecFile } from "@devdigest/shared";

/** The paths of an agent's / skill's links in stored order — which is prompt order. */
export function attachedPaths(links: readonly { path: string; order: number }[] | undefined): string[] {
  return [...(links ?? [])].sort((a, b) => a.order - b.order).map((l) => l.path);
}

/** A document an agent receives through a skill — read-only in the picker. */
export interface InheritedDoc {
  path: string;
  skillName: string;
}

export type RowKind = "attached" | "inherited" | "available";

export interface PickerRow {
  path: string;
  kind: RowKind;
  /** The listing entry, absent for an attached path the repo no longer lists. */
  doc: SpecFile | undefined;
  /** Name of the skill an inherited row comes through. */
  skillName?: string;
}

/**
 * Rows in display order: attached in their stored order (a path the listing
 * lacks stays — a link stores a path, so it can outlive its file, and dropping
 * it silently would hide something that is still sent), then inherited, then
 * the rest as the repo listed them. A path appears once, as its first kind.
 */
export function buildRows(
  docs: SpecFile[],
  attached: string[],
  inherited: InheritedDoc[],
): PickerRow[] {
  const byPath = new Map(docs.map((d) => [d.path, d]));
  const seen = new Set<string>();
  const rows: PickerRow[] = [];
  const add = (row: PickerRow) => {
    if (seen.has(row.path)) return;
    seen.add(row.path);
    rows.push(row);
  };
  for (const path of attached) add({ path, kind: "attached", doc: byPath.get(path) });
  for (const i of inherited) {
    add({ path: i.path, kind: "inherited", doc: byPath.get(i.path), skillName: i.skillName });
  }
  for (const doc of docs) add({ path: doc.path, kind: "available", doc });
  return rows;
}

/** Case-insensitive substring match on the path, the only text a row carries. */
export function filterRows(rows: PickerRow[], search: string): PickerRow[] {
  const q = search.trim().toLowerCase();
  if (q === "") return rows;
  return rows.filter((r) => r.path.toLowerCase().includes(q));
}

/**
 * Σ tokens of what the prompt gets: attached ∪ inherited documents the listing
 * knows, each path once (`buildRows` already deduplicates). A document without
 * a token count (too large to read) adds nothing.
 */
export function totalTokens(rows: PickerRow[]): number {
  return rows
    .filter((r) => r.kind !== "available")
    .reduce((sum, r) => sum + (r.doc?.tokens ?? 0), 0);
}
