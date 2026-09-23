/**
 * Token estimation for text that is about to be put in a prompt.
 *
 * There is no tokenizer in the client — shipping one would mean a megabyte of
 * BPE tables to put a number next to a textarea. So this is a CHARACTER-COUNT
 * approximation (~4 characters per token, the usual rule of thumb for English
 * prose and markdown), and the UI must say so.
 *
 * The `~` prefix is the established convention here for a number that is
 * approximate: `format-cost.ts` uses the same prefix to separate a reported
 * price from one derived from token counts. Anything without the prefix is
 * claimed to be exact — the exact token count of a skill body only exists once
 * a provider has actually tokenized it, and it appears in the run trace.
 */

/** Characters per token, the standard rough ratio for English/markdown. */
export const CHARS_PER_TOKEN = 4;

/** Approximate token count of `text`. Empty text is 0, never a bare `NaN`. */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * The estimate as it is shown: thousands-separated and prefixed with `~`, so a
 * reader can never mistake it for a measured count. The unit word is NOT
 * included — it comes from the message catalog.
 */
export function formatTokenEstimate(text: string | null | undefined): string {
  return `~${estimateTokens(text).toLocaleString("en-US")}`;
}
