/**
 * How a snapshot's date reads. `src/lib/` has no shared date formatter — the
 * only one in the app is `relativeTime` in the pulls route, which is local to
 * that list and relative rather than absolute. A version is a fixed point in a
 * changelog, so it gets an absolute date.
 */
export const VERSION_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

/** Width of the diff modal — a unified diff wants the room. */
export const DIFF_WIDTH = 860;
