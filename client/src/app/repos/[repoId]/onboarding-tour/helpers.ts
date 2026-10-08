/** Pure helpers for the Onboarding Tour page. */

/**
 * "2 hours ago" for the subtitle — `Intl.RelativeTimeFormat`, so the words come
 * from the platform and stay out of `messages/`. `now` is a parameter so a test
 * can pin the clock.
 */
export function tourAge(
  iso: string | null | undefined,
  locale = "en",
  now: number = Date.now(),
): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const seconds = Math.round((then - now) / 1000); // negative = in the past
  if (Math.abs(seconds) < 60) return rtf.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

/** The numbers for "indexed N of M source files · partial", or null when M is unknown. */
export function coverageLabel(
  filesIndexed: number,
  sourceFilesTotal: number | null,
): { n: number; m: number } | null {
  if (sourceFilesTotal == null) return null;
  return { n: filesIndexed, m: sourceFilesTotal };
}

/** Deep link to the tour of one repo, on the current origin. */
export function shareUrl(origin: string, repoId: string): string {
  return `${origin}/repos/${encodeURIComponent(repoId)}/onboarding-tour`;
}

/** Map a server code to a message key, falling back for a code the client does not know. */
export function reasonKey<T extends string>(
  code: string | null | undefined,
  known: readonly T[],
  fallback: T | "other",
): T | "other" {
  return known.find((k) => k === code) ?? fallback;
}

/**
 * Remove every way Markdown/HTML can ask the browser to load an image from
 * model-written text: inline `![alt](url)`, reference `![alt][id]` (and its
 * `[id]: url` definition) and raw `<img>`. Defense in depth over the server's
 * stripping (AC-34) — the alt text is dropped with the image.
 */
export function stripMarkdownImages(md: string): string {
  return md
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)/g, "")
    .replace(/!\[[^\]]*\]\s*\[[^\]]*\]/g, "")
    .replace(/^[ \t]{0,3}\[[^\]]+\]:[ \t]*\S+.*$/gm, "");
}
