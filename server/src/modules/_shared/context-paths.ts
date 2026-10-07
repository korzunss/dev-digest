/**
 * Merge an agent's own context documents with the ones inherited through its
 * skills: own first, then inherited, the first occurrence of a path wins so a
 * document attached twice reaches the prompt once.
 */
export function mergeContextPaths(own: readonly string[], inherited: readonly string[]): string[] {
  return [...new Set([...own, ...inherited])];
}
