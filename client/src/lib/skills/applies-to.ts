/** Separator between globs in the one-line summary shown on cards and rows. */
const SUMMARY_SEPARATOR = ", ";

/**
 * The one-line "Applies to" text for a skill's globs. `null` means the skill
 * is unscoped (empty or missing list); the caller renders its own "All files"
 * label so the wording stays in the message catalogue.
 */
export function appliesToSummary(paths: readonly string[] | null | undefined): string | null {
  if (!paths || paths.length === 0) return null;
  return paths.join(SUMMARY_SEPARATOR);
}

/** The textarea value for a glob list: one glob per line. */
export function pathsToText(paths: readonly string[] | null | undefined): string {
  return (paths ?? []).join("\n");
}

/** Textarea value → globs. Blank lines are dropped; the server normalises the rest. */
export function textToPaths(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
