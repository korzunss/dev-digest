/** Pure helpers for ConventionsHeader. */
import type { ConventionScan } from "@devdigest/shared";

/**
 * How many candidates the evidence gate threw away.
 *
 * The per-reason tally is the authority when the server sent one — it is what
 * the gate actually counted. `raw - kept` is the fallback for a scan written
 * before the tally existed (the column is nullish), and is clamped because a
 * re-scan that refreshes an existing row can leave `kept` above `raw`.
 */
export function droppedCount(scan: ConventionScan | null | undefined): number {
  if (!scan) return 0;
  if (scan.dropped) {
    return Object.values(scan.dropped).reduce((sum, n) => sum + n, 0);
  }
  return Math.max(0, scan.candidates_raw - scan.candidates_kept);
}

/**
 * "2 hours ago" for the last-scan line.
 *
 * `Intl.RelativeTimeFormat` rather than a hand-written ladder like the PR
 * list's `relativeTime`: the words come from the platform, so this stays out of
 * `messages/` instead of smuggling English into a helper. `now` is a parameter
 * so a test can pin the clock.
 */
export function scanAge(
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
