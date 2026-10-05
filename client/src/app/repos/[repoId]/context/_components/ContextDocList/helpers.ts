/** Pure helpers for ContextDocList. */

/** Sum of the known token counts — a doc the server could not count adds nothing. */
export function sumTokens(docs: { tokens?: number | null }[]): number {
  return docs.reduce((sum, d) => sum + (d.tokens ?? 0), 0);
}
