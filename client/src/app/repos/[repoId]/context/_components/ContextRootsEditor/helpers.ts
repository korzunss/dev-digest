/** Pure helpers for ContextRootsEditor. */

/** One glob per line; blank lines and surrounding whitespace dropped. */
export function parseGlobs(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function formatGlobs(globs: string[]): string {
  return globs.join("\n");
}
