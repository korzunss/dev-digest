import type { ConventionCategory } from "@devdigest/shared";

/**
 * One colour per category. Drawn from the same semantic tokens the findings
 * use, so a rule about error handling reads in the same register as a finding
 * about it — and so the chip carries meaning before the word is read.
 */
export const CATEGORY_COLOR: Record<ConventionCategory, string> = {
  naming: "var(--info)",
  structure: "var(--accent)",
  "error-handling": "var(--crit)",
  async: "var(--warn)",
  "data-access": "var(--sugg)",
  api: "var(--ok)",
  testing: "var(--info)",
  tooling: "var(--text-secondary)",
};

/** Confidence thresholds, matching `ConfidenceNum` so the bar and the number
    never disagree about what counts as a strong signal. */
export const CONFIDENCE_STRONG = 85;
export const CONFIDENCE_FAIR = 65;
