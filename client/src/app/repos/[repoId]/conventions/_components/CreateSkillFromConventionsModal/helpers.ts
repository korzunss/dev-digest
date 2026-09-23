/** Pure helpers for CreateSkillFromConventionsModal. */
import type { ConventionSkillPreview } from "@devdigest/shared";
import type { ConventionSkillDraft } from "@/lib/hooks/conventions";
import { DEFAULT_ENABLED } from "./constants";

/** Fallback base name on the file chip, if the name field is emptied. */
const UNNAMED = "conventions";

/**
 * A server preview as the editable draft the modal holds.
 *
 * Spread rather than field-by-field: `evidence_files` and `candidate_ids` are
 * not shown anywhere in the form, so listing the visible fields silently left
 * them behind and the commit route — which requires both — answered 422 on
 * every Create. Carrying the whole preview through keeps the draft a superset
 * of what the wire needs, whatever the contract grows next.
 */
export function toDraft(preview: ConventionSkillPreview): ConventionSkillDraft {
  return { ...preview, enabled: DEFAULT_ENABLED };
}

/**
 * Whether this draft could be created. Name and body only: a skill with no
 * name has nothing to attach to an agent by, and one with no body reaches the
 * prompt as nothing at all. An empty description is merely unhelpful, and the
 * server has a default for it.
 */
export function isDraftReady(draft: ConventionSkillDraft): boolean {
  return draft.name.trim() !== "" && draft.body.trim() !== "";
}

/** What gets sent: the single-line fields trimmed, the body left verbatim —
    leading whitespace in markdown is meaningful (fenced blocks, indents). */
export function trimDraft(draft: ConventionSkillDraft): ConventionSkillDraft {
  return { ...draft, name: draft.name.trim(), description: draft.description.trim() };
}

/** The base name on the body editor's chip — a skill body is a markdown file
    everywhere else in the system, so the editor names it like one. The
    extension comes from the message catalog, not from here. */
export function fileBaseName(name: string): string {
  const trimmed = name.trim();
  return trimmed === "" ? UNNAMED : trimmed;
}
