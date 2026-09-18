import type { CSSProperties } from "react";

/** Co-located styles for SeverityCounter. */
export const s = {
  row: (inline: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: inline ? 8 : 10,
  }),
  chip: (color: string, active: boolean, clickable: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    padding: active ? "1px 6px" : 0,
    border: active ? `1px solid ${color}` : "1px solid transparent",
    borderRadius: 999,
    background: "transparent",
    color,
    font: "inherit",
    fontSize: 12,
    lineHeight: 1.4,
    cursor: clickable ? "pointer" : "default",
    // The number is the point of the chip — it must not reflow as digits change.
    fontVariantNumeric: "tabular-nums",
  }),
  count: {
    // Underlined like a link only where it is one; see `clickable` above.
    textDecoration: "inherit",
  } satisfies CSSProperties,
  muted: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
