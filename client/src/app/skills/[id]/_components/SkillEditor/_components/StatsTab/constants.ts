/**
 * Colour per finding category.
 *
 * There was no category colour table to reuse: the design system's `CAT`
 * (`src/vendor/ui/primitives/tokens.ts`) carries an icon and a label per
 * category but no colour, and `src/lib/severity.ts` is about severity, which is
 * a different axis. So the palette is defined here — drawn from the existing
 * semantic tokens rather than invented, so "security" reads the same red it
 * does on a finding, and nothing new enters the theme.
 *
 * The keys mirror `CAT`'s vocabulary. The server returns whatever categories
 * the findings carry, so anything unlisted falls back rather than disappearing.
 */
export const CATEGORY_COLOR: Record<string, string> = {
  security: "var(--crit)",
  bug: "var(--warn)",
  perf: "var(--info)",
  style: "var(--sugg)",
  test: "var(--ok)",
};

/** Colour for a category the table does not know. Never omit the segment. */
export const CATEGORY_FALLBACK_COLOR = "var(--text-muted)";

/** Diameter of the findings donut — sized to sit beside its legend. */
export const DONUT_SIZE = 140;
