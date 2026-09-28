import type { CSSProperties } from "react";

/* Both button variants use the full `border` shorthand (never mixed with a
   longhand side) so toggling `checked` on the same node never mixes
   shorthand and longhand styles on one property (client/insights/gotchas.md
   — "Updating a style property during rerender"). */
export const s = {
  group: {
    display: "flex",
    gap: 4,
    padding: 3,
    borderRadius: 9,
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  item: {
    fontSize: 12.5,
    fontWeight: 600,
    padding: "5px 12px",
    borderRadius: 7,
    cursor: "pointer",
    background: "transparent",
    border: "1px solid transparent",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  itemActive: {
    fontSize: 12.5,
    fontWeight: 600,
    padding: "5px 12px",
    borderRadius: 7,
    cursor: "pointer",
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;
