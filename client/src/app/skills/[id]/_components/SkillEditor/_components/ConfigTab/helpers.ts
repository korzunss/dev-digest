/** Fallback shown on the file chip before a new skill has been named. */
const UNNAMED = "skill";

/**
 * The base name on the body editor's file chip. A skill body IS a markdown
 * file everywhere else in the system — it is imported from one and exported as
 * one — so the editor names it the same way. The extension is added by the
 * message, which is the only place user-facing text is assembled.
 */
export function fileBaseName(name: string): string {
  const trimmed = name.trim();
  return trimmed === "" ? UNNAMED : trimmed;
}

/** Whether the local body differs from the saved one — what `unsaved` means. */
export function isDirty(local: string, saved: string): boolean {
  return local !== saved;
}
