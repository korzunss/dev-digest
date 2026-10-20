/* finding-category.ts — how a finding category looks and counts. Shared by the
   Skill Stats donut and the Agent Stats category panel, hence `src/lib`.

   The design system's `CAT` (`src/vendor/ui/primitives/tokens.ts`) carries an
   icon and a label per category but no colour, and `src/lib/severity.ts` is
   about severity, a different axis. So the palette is defined here, drawn from
   the existing semantic tokens — "security" reads the same red it does on a
   finding, and nothing new enters the theme.

   The server returns whatever categories the findings carry, so anything
   unlisted falls back rather than disappearing. */

/** The five categories the product knows, in legend order. */
export const KNOWN_CATEGORIES = ["security", "bug", "perf", "style", "test"] as const;

export const CATEGORY_COLOR: Record<string, string> = {
  security: "var(--crit)",
  bug: "var(--warn)",
  perf: "var(--info)",
  style: "var(--sugg)",
  test: "var(--ok)",
};

/** Colour for a category the table does not know. Never omit the segment. */
export const CATEGORY_FALLBACK_COLOR = "var(--text-muted)";

/**
 * How a legend renders a count. The donut's default is money (`$12.00`); a
 * count of findings is an integer, and "12.00" would be a different claim.
 */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}
