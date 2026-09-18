import type { FindingActionKind } from "@devdigest/shared";

/* Severity sort weight lives in `@/lib/severity` (spec 002) — the same table
   the chips and the filter read, so a level can't sort here and colour there. */

/** Confidence below this is hidden when "hide low confidence" is on. */
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

/** Keyboard shortcut → finding action. */
export const KEY_TO_ACTION: Record<string, FindingActionKind> = {
  a: "accept",
  d: "dismiss",
};
