/**
 * Pure helpers for the Context tab.
 *
 * The two string-list operations this tab shares with the agent editor's
 * SkillsTab — `toggleAttachment` and `moveId` — are imported from there rather
 * than copied: they are pure list algebra and the ordering rule must not fork.
 * The three below cannot be shared, because a skill is keyed by `id` and a
 * context document is keyed by `path`.
 */
import type { SkillContextLink, SpecFile } from "@devdigest/shared";
import { UNTRUSTED_SOURCE_PREFIX } from "./constants";

/** The paths attached to a skill, in stored order — which is prompt order. */
export function attachedPaths(links: SkillContextLink[] | undefined): string[] {
  return [...(links ?? [])].sort((a, b) => a.order - b.order).map((l) => l.path);
}

/**
 * The tab lists EVERY document in the repo: attached ones first, in their
 * prompt order, then the rest as the repo listed them. The checkbox is the
 * attachment, so an unattached document has to be on screen to be attachable.
 *
 * An attached path that is not in the repo listing is dropped here on purpose:
 * a link stores a path, not an id, so it can outlive the file it names.
 */
export function orderedDocs(docs: SpecFile[], attached: string[]): SpecFile[] {
  const byPath = new Map(docs.map((d) => [d.path, d]));
  const head = attached.map((p) => byPath.get(p)).filter((d): d is SpecFile => d !== undefined);
  const headPaths = new Set(head.map((d) => d.path));
  return [...head, ...docs.filter((d) => !headPaths.has(d.path))];
}

/** Filter by path, which is the only text a listed document carries. */
export function filterDocs(docs: SpecFile[], search: string): SpecFile[] {
  const q = search.trim().toLowerCase();
  if (q === "") return docs;
  return docs.filter((d) => d.path.toLowerCase().includes(q));
}

/** `specs/api/public.md` → `specs/api/`. Empty for a document at the root. */
export function docFolder(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i + 1);
}

/** `specs/api/public.md` → `public.md`. */
export function docName(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

/** The top-level folder a document sits in (`specs`, `docs`, `insights`). */
export function folderTag(path: string): string {
  const i = path.indexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/**
 * The delimiter the engine wraps document `index`'s full text in. Rendered
 * beside each path in the "serializes as" box so the summary states what is
 * actually sent: the whole document, as untrusted data — not its name.
 */
export function untrustedMarker(index: number): string {
  return `<untrusted source="${UNTRUSTED_SOURCE_PREFIX}${index}">…</untrusted>`;
}
